import { db } from "@/lib/db";
import {
    orders,
    positions,
    trades,
    type NewTrade,
    type LedgerReferenceType,
    type WriteAheadOperationType,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { performance } from "node:perf_hooks";
import { PositionService } from "@/services/position.service";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { and, eq, ne } from "drizzle-orm";
import { requireInstrumentTokenForIdentityLookup } from "@/lib/trading/token-identity-guard";
import { FillEngineService } from "@/services/fill-engine.service";
import { assertTradingEnabled, isTradingEnabled } from "@/lib/system-control";
import { LedgerService } from "@/services/ledger.service";
import { WriteAheadJournalService } from "@/services/write-ahead-journal.service";
import { instrumentStore } from "@/stores/instrument.store";
import { eventBus } from "@/lib/event-bus";
import { priceOracle } from "@/services/price-oracle.service";
import { mtmEngineService } from "@/services/mtm-engine.service";

const PAPER_TRADING_MODE =
    String(process.env.PAPER_TRADING_MODE ?? "true").trim().toLowerCase() !== "false";

export class ExecutionService {
    private static resolveLedgerReferenceType(
        order: typeof orders.$inferSelect
    ): LedgerReferenceType {
        if (order.rejectionReason === "FORCED_LIQUIDATION") return "LIQUIDATION";
        if (order.exitReason === "EXPIRY") return "EXPIRY";
        return "TRADE";
    }

    private static resolveWajOperationType(
        order: typeof orders.$inferSelect
    ): WriteAheadOperationType {
        if (order.rejectionReason === "FORCED_LIQUIDATION") return "LIQUIDATION";
        if (order.exitReason === "EXPIRY") return "EXPIRY_SETTLEMENT";
        return "TRADE_EXECUTION";
    }

    private static buildLedgerIdempotencyKey(
        order: typeof orders.$inferSelect,
        leg: string
    ): string {
        const prefix = this.resolveLedgerReferenceType(order);
        const normalizedLeg = String(leg || "").trim().toUpperCase();
        return `${prefix}-${order.id}-${normalizedLeg}`;
    }

    /**
     * Execute all open orders by checking market conditions.
     * This should be called periodically (e.g., every tick).
     */
    static async executeOpenOrders(): Promise<number> {
        try {
            if (!isTradingEnabled()) {
                return 0;
            }

            const openOrders = await db
                .select()
                .from(orders)
                .where(eq(orders.status, "OPEN"));

            let executedCount = 0;

            for (const order of openOrders) {
                try {
                    const executed = await this.tryExecuteOrder(order);
                    if (executed) executedCount++;
                } catch (error) {
                    logger.error(
                        { err: error, orderId: order.id },
                        "Failed to execute individual order"
                    );
                }
            }

            if (executedCount > 0) {
                logger.info({ executedCount }, "Orders executed");
            }

            return executedCount;
        } catch (error) {
            logger.error({ err: error }, "Failed to execute open orders");
            throw new ApiError("Execution engine failed", 500, "EXECUTION_FAILED");
        }
    }

    /**
     * Try to execute a single order based on market conditions.
     */
    static async tryExecuteOrder(
        order: typeof orders.$inferSelect,
        options: { force?: boolean } = {}
    ): Promise<boolean> {
        const startMs = performance.now();
        let marginMs = 0;
        let ledgerMs = 0;
        let executionMs = 0;

        assertTradingEnabled({ force: options.force, context: "ExecutionService.tryExecuteOrder" });
        const instrumentToken = requireInstrumentTokenForIdentityLookup({
            context: "ExecutionService.tryExecuteOrder",
            instrumentToken: order.instrumentToken,
            symbol: order.symbol,
        });

        if (!instrumentStore.isReady()) {
            throw new ApiError("Instrument store not ready", 503, "INSTRUMENT_STORE_NOT_READY");
        }
        const instrument = instrumentStore.getByToken(instrumentToken);
        if (!instrument) {
            throw new ApiError(`Instrument not found: ${instrumentToken}`, 404, "INSTRUMENT_NOT_FOUND");
        }

        const fillDecision = FillEngineService.resolveFill(order, instrument);
        if (process.env.NODE_ENV !== "production" && fillDecision.resolvedBy !== "FILL_ENGINE_V1") {
            throw new Error("ExecutionService fill price must come from FillEngineService");
        }

        let executionPrice = fillDecision.executionPrice;
        let fillQuantity = fillDecision.fillableQuantity;
        let priceSource = String(fillDecision.source || "NONE");

        const shouldUseOracleFallback =
            PAPER_TRADING_MODE &&
            order.orderType === "MARKET" &&
            (!fillDecision.shouldFill || !executionPrice || fillQuantity <= 0);

        if (shouldUseOracleFallback) {
            const oraclePrice = await priceOracle.getBestPrice(instrumentToken, {
                symbolHint: instrument.tradingsymbol,
                nameHint: instrument.name,
            });
            executionPrice =
                Number.isFinite(oraclePrice) && oraclePrice > 0
                    ? oraclePrice
                    : 100;
            fillQuantity = order.quantity;
            priceSource = "ORACLE_FALLBACK";

            logger.warn(
                {
                    orderId: order.id,
                    instrumentToken,
                    executionPrice,
                    fallbackReason: fillDecision.reason,
                    priceSource,
                },
                "EXECUTED_USING_ORACLE_PRICE"
            );
        }

        const fillable = Boolean(executionPrice && fillQuantity > 0) && (fillDecision.shouldFill || shouldUseOracleFallback);
        if (!fillable) {
            logger.debug(
                {
                    orderId: order.id,
                    symbol: order.symbol,
                    reason: fillDecision.reason,
                    source: fillDecision.source,
                    tickPrice: fillDecision.tickPrice,
                },
                "Order not fillable on current tick"
            );
            return false;
        }

        if (process.env.NODE_ENV !== "production" && fillQuantity !== order.quantity) {
            throw new Error("ExecutionService partial fills are not enabled yet; expected full fill quantity");
        }
        const finalExecutionPrice = Number(executionPrice);

        try {
            const transactionStartMs = performance.now();
            await db.transaction(async (tx) => {
                const orderPayload = order.orderType === "LIMIT"
                    ? {
                        instrumentToken,
                        symbol: order.symbol,
                        side: order.side,
                            quantity: fillQuantity,
                            orderType: "LIMIT" as const,
                            limitPrice: Number(order.limitPrice || executionPrice),
                    }
                    : {
                        instrumentToken,
                        symbol: order.symbol,
                        side: order.side,
                        quantity: fillQuantity,
                            orderType: "MARKET" as const,
                    };

                const marginStartMs = performance.now();
                const marginRequired = await MarginService.calculateRequiredMargin(
                    orderPayload,
                    instrument
                );
                marginMs = performance.now() - marginStartMs;
                const ledgerReferenceType = this.resolveLedgerReferenceType(order);
                const [existingPositionBefore] = await tx
                    .select({
                        quantity: positions.quantity,
                        averagePrice: positions.averagePrice,
                    })
                    .from(positions)
                    .where(
                        and(
                            eq(positions.userId, order.userId),
                            eq(positions.instrumentToken, instrumentToken)
                        )
                    )
                    .limit(1);

                const previousQuantity = Number(existingPositionBefore?.quantity ?? 0);
                const previousAveragePrice = Number(existingPositionBefore?.averagePrice ?? finalExecutionPrice);
                const tradeDelta = order.side === "BUY" ? fillQuantity : -fillQuantity;

                let openingQuantity = 0;
                let closingQuantity = 0;
                if (previousQuantity === 0 || Math.sign(previousQuantity) === Math.sign(tradeDelta)) {
                    openingQuantity = Math.abs(tradeDelta);
                } else {
                    closingQuantity = Math.min(Math.abs(previousQuantity), Math.abs(tradeDelta));
                    openingQuantity = Math.max(0, Math.abs(tradeDelta) - Math.abs(previousQuantity));
                }

                const marginPerUnit = fillQuantity > 0 ? marginRequired / fillQuantity : 0;
                const marginToBlock = Math.max(0, Math.round(marginPerUnit * openingQuantity * 100) / 100);
                const marginToRelease = Math.max(0, Math.round(marginPerUnit * closingQuantity * 100) / 100);
                const realizedPnl =
                    closingQuantity > 0
                        ? Math.round(
                            ((finalExecutionPrice - previousAveragePrice) *
                                closingQuantity *
                                (previousQuantity > 0 ? 1 : -1)) *
                            100
                        ) / 100
                        : 0;

                const plannedLedgerKeys: string[] = [];

                if (instrument.instrumentType === "FUTURE") {
                    if (marginToBlock > 0) {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "MARGIN_BLOCK_OPEN"));
                    }
                    if (marginToRelease > 0) {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "MARGIN_RELEASE_CLOSE"));
                    }
                    if (closingQuantity > 0 && realizedPnl > 0) {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_CREDIT"));
                    }
                    if (closingQuantity > 0 && realizedPnl < 0) {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"));
                    }
                    plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "MARGIN_RELEASE_REMAINDER"));
                } else if (order.side === "BUY") {
                    plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "BUY_DEBIT"));
                } else if (instrument.instrumentType === "EQUITY") {
                    plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "SELL_PROCEEDS"));
                } else {
                    if (instrument.instrumentType === "OPTION") {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "OPTION_PREMIUM"));
                    }
                    if (marginRequired > 0) {
                        plannedLedgerKeys.push(this.buildLedgerIdempotencyKey(order, "MARGIN_BLOCK"));
                    }
                }

                const preparedJournal = await WriteAheadJournalService.prepare(
                    {
                        journalId: order.id,
                        operationType: this.resolveWajOperationType(order),
                        userId: order.userId,
                        referenceId: order.id,
                        payload: {
                            orderId: order.id,
                            userId: order.userId,
                            instrumentToken,
                            side: order.side,
                            orderType: order.orderType,
                            fillQuantity,
                            executionPrice: finalExecutionPrice,
                            priceSource,
                            marginRequired,
                            exitReason: order.exitReason,
                            rejectionReason: order.rejectionReason,
                            idempotencyKeys: plannedLedgerKeys,
                        },
                    },
                    tx
                );

                try {
                    const ledgerStartMs = performance.now();
                    const ledgerSequences: number[] = [];
                    const newTrade: NewTrade = {
                        orderId: order.id,
                        userId: order.userId,
                        symbol: order.symbol,
                        instrumentToken,
                        side: order.side,
                        quantity: fillQuantity,
                        price: finalExecutionPrice.toString(),
                        executedAt: new Date(),
                    };

                    const [_, [trade]] = await Promise.all([
                        tx.update(orders)
                            .set({
                                status: "FILLED",
                                executionPrice: finalExecutionPrice.toString(),
                                executedAt: new Date(),
                                updatedAt: new Date(),
                            })
                            .where(eq(orders.id, order.id)),

                        tx.insert(trades).values(newTrade).returning(),
                    ]);

                    if (instrument.instrumentType === "FUTURE") {
                        if (marginToBlock > 0) {
                            await WalletService.debitBalance(
                                order.userId,
                                marginToBlock,
                                "MARGIN_BLOCK",
                                trade.id,
                                tx,
                                `Margin Block ${order.symbol}`,
                                {
                                    ledgerReferenceType,
                                    skipWaj: true,
                                    skipWalletSync: true,
                                    sequenceCollector: ledgerSequences,
                                    idempotencyKey: this.buildLedgerIdempotencyKey(order, "MARGIN_BLOCK_OPEN"),
                                }
                            );
                        }

                        await PositionService.updatePosition(tx, trade);

                        if (marginToRelease > 0) {
                            await WalletService.releaseMarginBlock(
                                order.userId,
                                marginToRelease,
                                trade.id,
                                tx,
                                `Margin Release ${order.symbol}`,
                                {
                                    ledgerReferenceType,
                                    skipWaj: true,
                                    skipWalletSync: true,
                                    sequenceCollector: ledgerSequences,
                                    idempotencyKey: this.buildLedgerIdempotencyKey(order, "MARGIN_RELEASE_CLOSE"),
                                }
                            );
                        }

                        if (closingQuantity > 0 && Math.abs(realizedPnl) > 0) {
                            const realizedAmount = Math.abs(realizedPnl);
                            if (realizedPnl > 0) {
                                await WalletService.creditBalance(
                                    order.userId,
                                    realizedAmount,
                                    "TRADE",
                                    trade.id,
                                    `Realized PnL Credit ${order.symbol}`,
                                    tx,
                                    {
                                        ledgerReferenceType,
                                        skipWaj: true,
                                        skipWalletSync: true,
                                        sequenceCollector: ledgerSequences,
                                        idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_CREDIT"),
                                    }
                                );
                            } else {
                                await WalletService.debitBalance(
                                    order.userId,
                                    realizedAmount,
                                    "TRADE",
                                    trade.id,
                                    tx,
                                    `Realized PnL Debit ${order.symbol}`,
                                    {
                                        ledgerReferenceType,
                                        skipWaj: true,
                                        skipWalletSync: true,
                                        sequenceCollector: ledgerSequences,
                                        idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),
                                    }
                                );
                            }
                        }

                        const [remainingOpenPosition] = await tx
                            .select({ id: positions.id })
                            .from(positions)
                            .where(
                                and(
                                    eq(positions.userId, order.userId),
                                    ne(positions.quantity, 0)
                                )
                            )
                            .limit(1);

                        if (!remainingOpenPosition) {
                            const snapshot = await LedgerService.reconstructUserEquity(order.userId, tx);
                            if (LedgerService.compare(snapshot.marginBlocked, "0") > 0) {
                                await WalletService.releaseMarginBlock(
                                    order.userId,
                                    snapshot.marginBlocked,
                                    trade.id,
                                    tx,
                                    "Margin Release All After Full Exit",
                                    {
                                        ledgerReferenceType,
                                        skipWaj: true,
                                        skipWalletSync: true,
                                        sequenceCollector: ledgerSequences,
                                        idempotencyKey: this.buildLedgerIdempotencyKey(order, "MARGIN_RELEASE_REMAINDER"),
                                    }
                                );
                            }
                        }
                    } else {
                        const promises = [];
                        if (order.side === "BUY") {
                            promises.push(
                                WalletService.debitBalance(
                                    order.userId,
                                    marginRequired,
                                    "TRADE",
                                    trade.id,
                                    tx,
                                    `Buy ${order.symbol}`,
                                    {
                                        ledgerReferenceType,
                                        skipWaj: true,
                                        skipWalletSync: true,
                                        sequenceCollector: ledgerSequences,
                                        idempotencyKey: this.buildLedgerIdempotencyKey(order, "BUY_DEBIT"),
                                    }
                                )
                            );
                        } else if (instrument.instrumentType === "EQUITY") {
                            const proceeds = LedgerService.multiplyByInteger(
                                finalExecutionPrice.toString(),
                                fillQuantity
                            );
                            promises.push(
                                WalletService.creditProceeds(
                                    order.userId,
                                    proceeds,
                                    trade.id,
                                    tx,
                                    `Sell ${order.symbol}`,
                                    {
                                        ledgerReferenceType,
                                        skipWaj: true,
                                        skipWalletSync: true,
                                        sequenceCollector: ledgerSequences,
                                        idempotencyKey: this.buildLedgerIdempotencyKey(order, "SELL_PROCEEDS"),
                                    }
                                )
                            );
                        } else {
                            if (instrument.instrumentType === "OPTION") {
                                const premium = LedgerService.multiplyByInteger(
                                    finalExecutionPrice.toString(),
                                    fillQuantity
                                );
                                promises.push(
                                    WalletService.creditProceeds(
                                        order.userId,
                                        premium,
                                        trade.id,
                                        tx,
                                        `Option Premium Credit ${order.symbol}`,
                                        {
                                            ledgerReferenceType,
                                            skipWaj: true,
                                            skipWalletSync: true,
                                            sequenceCollector: ledgerSequences,
                                            idempotencyKey: this.buildLedgerIdempotencyKey(order, "OPTION_PREMIUM"),
                                        }
                                    )
                                );
                            }

                            if (marginRequired > 0) {
                                promises.push(
                                    WalletService.debitBalance(
                                        order.userId,
                                        marginRequired,
                                        "MARGIN_BLOCK",
                                        trade.id,
                                        tx,
                                        `Margin Block ${order.symbol}`,
                                        {
                                            ledgerReferenceType,
                                            skipWaj: true,
                                            skipWalletSync: true,
                                            sequenceCollector: ledgerSequences,
                                            idempotencyKey: this.buildLedgerIdempotencyKey(order, "MARGIN_BLOCK"),
                                        }
                                    )
                                );
                            }
                        }

                        promises.push(PositionService.updatePosition(tx, trade));
                        await Promise.all(promises);
                    }

                    await WalletService.recalculateFromLedger(order.userId, tx);
                    ledgerMs = performance.now() - ledgerStartMs;
                    await WriteAheadJournalService.commit(preparedJournal.journalId, tx, {
                        ledgerSequences,
                        mutationMeta: {
                            orderId: order.id,
                            tradeId: trade.id,
                            priceSource,
                        },
                    });
                } catch (mutationError) {
                    await WriteAheadJournalService.abort(
                        preparedJournal.journalId,
                        tx,
                        mutationError instanceof Error ? mutationError.message : "EXECUTION_MUTATION_FAILED"
                    );
                    throw mutationError;
                }
            });
            executionMs = performance.now() - transactionStartMs;

            logger.info(
                {
                    orderId: order.id,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: fillQuantity,
                    price: finalExecutionPrice,
                    source: priceSource,
                    priceSource,
                    slippageBps: fillDecision.slippageBps,
                },
                "Order executed"
            );
            eventBus.emit("order.executed", {
                orderId: order.id,
                userId: order.userId,
                instrumentToken,
                quantity: fillQuantity,
                price: finalExecutionPrice,
            });
            eventBus.emit("position.changed", {
                userId: order.userId,
                instrumentToken,
                reason: "ORDER_EXECUTED",
            });
            try {
                await mtmEngineService.refreshUserNow(order.userId);
            } catch (refreshError) {
                logger.warn(
                    { err: refreshError, orderId: order.id, userId: order.userId },
                    "MTM refresh after execution failed"
                );
            }

            const totalMs = performance.now() - startMs;
            const metricsPayload = {
                event: "ORDER_EXECUTION_TIMING",
                orderId: order.id,
                userId: order.userId,
                instrumentToken,
                order_validation_ms: 0,
                margin_ms: Number(marginMs.toFixed(2)),
                ledger_ms: Number(ledgerMs.toFixed(2)),
                execution_ms: Number(executionMs.toFixed(2)),
                total_ms: Number(totalMs.toFixed(2)),
            };
            if (totalMs > 500) {
                logger.error(metricsPayload, "ORDER_EXECUTION_TIMING");
            } else if (totalMs > 250) {
                logger.warn(metricsPayload, "ORDER_EXECUTION_TIMING");
            } else {
                logger.info(metricsPayload, "ORDER_EXECUTION_TIMING");
            }
            return true;
        } catch (error: any) {
            if (error.code === "INSUFFICIENT_FUNDS") {
                logger.warn({ orderId: order.id }, "Execution failed: Insufficient Funds");
                await db.update(orders)
                    .set({
                        status: "REJECTED",
                        updatedAt: new Date(),
                    })
                    .where(eq(orders.id, order.id));
                return false;
            }
            throw error;
        }
    }
}
