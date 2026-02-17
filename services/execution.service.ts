import { db } from "@/lib/db";
import {
    orders,
    trades,
    type NewTrade,
    type LedgerReferenceType,
    type WriteAheadOperationType,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { PositionService } from "@/services/position.service";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { InstrumentRepository } from "@/lib/instruments/repository";
import { eq } from "drizzle-orm";
import { requireInstrumentTokenForIdentityLookup } from "@/lib/trading/token-identity-guard";
import { FillEngineService } from "@/services/fill-engine.service";
import { mtmEngineService } from "@/services/mtm-engine.service";
import { assertTradingEnabled, isTradingEnabled } from "@/lib/system-control";
import { LedgerService } from "@/services/ledger.service";
import { WriteAheadJournalService } from "@/services/write-ahead-journal.service";

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
        assertTradingEnabled({ force: options.force, context: "ExecutionService.tryExecuteOrder" });
        const instrumentToken = requireInstrumentTokenForIdentityLookup({
            context: "ExecutionService.tryExecuteOrder",
            instrumentToken: order.instrumentToken,
            symbol: order.symbol,
        });

        const repo = InstrumentRepository.getInstance();
        if (!repo) {
            throw new Error("InstrumentRepository failed to initialize");
        }
        await repo.ensureInitialized();

        const instrument = repo.get(instrumentToken);
        if (!instrument) {
            throw new ApiError(`Instrument not found: ${instrumentToken}`, 404, "INSTRUMENT_NOT_FOUND");
        }

        const fillDecision = FillEngineService.resolveFill(order, instrument);
        if (process.env.NODE_ENV !== "production" && fillDecision.resolvedBy !== "FILL_ENGINE_V1") {
            throw new Error("ExecutionService fill price must come from FillEngineService");
        }

        if (!fillDecision.shouldFill || !fillDecision.executionPrice || fillDecision.fillableQuantity <= 0) {
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

        if (process.env.NODE_ENV !== "production" && fillDecision.fillableQuantity !== order.quantity) {
            throw new Error("ExecutionService partial fills are not enabled yet; expected full fill quantity");
        }

        const executionPrice = fillDecision.executionPrice;
        const fillQuantity = fillDecision.fillableQuantity;

        try {
            await db.transaction(async (tx) => {
                const orderPayload = order.orderType === "LIMIT"
                    ? {
                        instrumentToken,
                        symbol: order.symbol,
                        side: order.side,
                        quantity: fillQuantity,
                        orderType: "LIMIT" as const,
                        limitPrice: Number(order.limitPrice),
                    }
                    : {
                        instrumentToken,
                        symbol: order.symbol,
                        side: order.side,
                        quantity: fillQuantity,
                        orderType: "MARKET" as const,
                    };

                const marginRequired = await MarginService.calculateRequiredMargin(
                    orderPayload,
                    instrument
                );
                const ledgerReferenceType = this.resolveLedgerReferenceType(order);
                const plannedLedgerKeys: string[] = [];

                if (order.side === "BUY") {
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
                            executionPrice,
                            marginRequired,
                            exitReason: order.exitReason,
                            rejectionReason: order.rejectionReason,
                            idempotencyKeys: plannedLedgerKeys,
                        },
                    },
                    tx
                );

                try {
                    const ledgerSequences: number[] = [];
                    const newTrade: NewTrade = {
                        orderId: order.id,
                        userId: order.userId,
                        symbol: order.symbol,
                        instrumentToken,
                        side: order.side,
                        quantity: fillQuantity,
                        price: executionPrice.toString(),
                        executedAt: new Date(),
                    };

                    const [_, [trade]] = await Promise.all([
                        tx.update(orders)
                            .set({
                                status: "FILLED",
                                executionPrice: executionPrice.toString(),
                                executedAt: new Date(),
                                updatedAt: new Date(),
                            })
                            .where(eq(orders.id, order.id)),

                        tx.insert(trades).values(newTrade).returning(),
                    ]);

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
                                    sequenceCollector: ledgerSequences,
                                    idempotencyKey: this.buildLedgerIdempotencyKey(order, "BUY_DEBIT"),
                                }
                            )
                        );
                    } else {
                        if (instrument.instrumentType === "EQUITY") {
                            const proceeds = LedgerService.multiplyByInteger(
                                executionPrice.toString(),
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
                                            sequenceCollector: ledgerSequences,
                                            idempotencyKey: this.buildLedgerIdempotencyKey(order, "SELL_PROCEEDS"),
                                        }
                                    )
                                );
                        } else {
                            if (instrument.instrumentType === "OPTION") {
                                const premium = LedgerService.multiplyByInteger(
                                    executionPrice.toString(),
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
                                            sequenceCollector: ledgerSequences,
                                            idempotencyKey: this.buildLedgerIdempotencyKey(order, "MARGIN_BLOCK"),
                                        }
                                    )
                                );
                            }
                        }
                    }

                    promises.push(PositionService.updatePosition(tx, trade));
                    await Promise.all(promises);

                    await WriteAheadJournalService.commit(preparedJournal.journalId, tx, {
                        ledgerSequences,
                        mutationMeta: {
                            orderId: order.id,
                            tradeId: trade.id,
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

            logger.info(
                {
                    orderId: order.id,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: fillQuantity,
                    price: executionPrice,
                    source: fillDecision.source,
                    slippageBps: fillDecision.slippageBps,
                },
                "Order executed"
            );

            mtmEngineService.requestRefresh();
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
