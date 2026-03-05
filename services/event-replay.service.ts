import {
    and,
    asc,
    eq,
    inArray,
    isNotNull,
    lte,
    or,
    sql,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
    ledgerAccounts,
    ledgerEntries,
    positions,
    trades,
    users,
    wallets,
    type LedgerAccountType,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { haltTrading } from "@/lib/system-control";
import { realTimeMarketService } from "@/services/realtime-market.service";

type TradeReplayCursor = {
    createdAt: Date;
    id: string;
};

type LedgerReplayCursor = {
    globalSequence: number;
};

type PositionAccumulator = {
    instrumentToken: string;
    quantity: number;
    averagePrice: bigint;
    realizedPnl: bigint;
    cumulativeRealizedPnl: bigint;
    tradeCount: number;
    lastExecutedAt: Date | null;
};

type ReplayOptions = {
    asOf?: Date;
    asOfSequence?: number;
    batchSize?: number;
};

type EquityReplayOptions = ReplayOptions & {
    includeUnrealized?: boolean;
    maxPriceAgeMs?: number;
};

type DriftOptions = {
    epsilon?: string | number;
    haltThreshold?: string | number;
    includeUnrealized?: boolean;
};

const DECIMAL_SCALE = 8;
const DECIMAL_FACTOR = BigInt(10) ** BigInt(DECIMAL_SCALE);
const ZERO = BigInt(0);

const LEDGER_BATCH_SIZE = Math.max(200, Number(process.env.REPLAY_LEDGER_BATCH_SIZE ?? "2000"));
const TRADE_BATCH_SIZE = Math.max(200, Number(process.env.REPLAY_TRADE_BATCH_SIZE ?? "2000"));
const USER_CHUNK_SIZE = Math.max(10, Number(process.env.REPLAY_USER_CHUNK_SIZE ?? "200"));
const DRIFT_EPSILON = String(process.env.REPLAY_DRIFT_EPSILON ?? "0.01");
const DRIFT_FATAL_THRESHOLD = String(process.env.REPLAY_FATAL_DRIFT_THRESHOLD ?? "1.00");
const UNREALIZED_PRICE_MAX_AGE_MS = Math.max(
    1000,
    Number(process.env.REPLAY_UNREALIZED_PRICE_MAX_AGE_MS ?? "5000")
);
const AUTO_HALT_ON_FATAL_DRIFT =
    String(process.env.REPLAY_AUTO_HALT_ON_FATAL_DRIFT ?? "true").toLowerCase() !== "false";

const ACCOUNT_TYPES: readonly LedgerAccountType[] = [
    "CASH",
    "MARGIN_BLOCKED",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "FEES",
];

function normalizeDecimalInput(value: unknown): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "0";
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        throw new ApiError(`Invalid decimal value: ${raw}`, 500, "REPLAY_DECIMAL_PARSE_ERROR");
    }
    return raw;
}

function parseDecimal(value: unknown): bigint {
    const normalized = normalizeDecimalInput(value);
    const negative = normalized.startsWith("-");
    const unsigned = negative ? normalized.slice(1) : normalized;
    const [wholePart, fracPart = ""] = unsigned.split(".");
    const frac = (fracPart + "00000000").slice(0, DECIMAL_SCALE);
    const whole = BigInt(wholePart || "0");
    const fraction = BigInt(frac || "0");
    const scaled = whole * DECIMAL_FACTOR + fraction;
    return negative ? -scaled : scaled;
}

function formatDecimal(value: bigint): string {
    const negative = value < ZERO;
    const unsigned = negative ? -value : value;
    const whole = unsigned / DECIMAL_FACTOR;
    const fraction = (unsigned % DECIMAL_FACTOR).toString().padStart(DECIMAL_SCALE, "0");
    const compact = `${whole}.${fraction}`.replace(/\.?0+$/, "");
    if (compact === "") return "0";
    return negative ? `-${compact}` : compact;
}

function addDecimal(a: bigint, b: bigint): bigint {
    return a + b;
}

function subDecimal(a: bigint, b: bigint): bigint {
    return a - b;
}

function mulDecimalByInt(value: bigint, quantity: number): bigint {
    if (!Number.isInteger(quantity)) {
        throw new ApiError("Quantity must be integer", 500, "REPLAY_QUANTITY_INVALID");
    }
    return value * BigInt(quantity);
}

function divDecimalByIntHalfUp(value: bigint, quantity: number): bigint {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError("Division quantity must be positive integer", 500, "REPLAY_DIVISION_INVALID");
    }
    const divisor = BigInt(quantity);
    const negative = value < ZERO;
    const unsigned = negative ? -value : value;
    let quotient = unsigned / divisor;
    const remainder = unsigned % divisor;

    if (remainder * BigInt(2) >= divisor) {
        quotient += BigInt(1);
    }

    return negative ? -quotient : quotient;
}

function absDecimal(value: bigint): bigint {
    return value < ZERO ? -value : value;
}

function maxDecimal(a: bigint, b: bigint): bigint {
    return a >= b ? a : b;
}

function toIso(value: Date | null | undefined): string | null {
    return value instanceof Date ? value.toISOString() : null;
}

function hasStalePrice(lastUpdated: Date | undefined, maxAgeMs: number): boolean {
    if (!(lastUpdated instanceof Date)) return true;
    const ageMs = Date.now() - lastUpdated.getTime();
    return !Number.isFinite(ageMs) || ageMs < -5000 || ageMs > maxAgeMs;
}

export type RebuiltUserStateSnapshot = {
    userId: string;
    asOf: string | null;
    asOfSequence: number | null;
    earliestSequence: number | null;
    latestSequence: number | null;
    freeCash: string;
    blockedMargin: string;
    cashBalance: string;
    realizedPnlAccount: string;
    unrealizedPnlAccount: string;
    fees: string;
    netLedgerBalance: string;
    ledgerEntryCount: number;
    rebuildDurationMs: number;
};

export type RebuiltPosition = {
    instrumentToken: string;
    quantity: number;
    averagePrice: string;
    realizedPnl: string;
    cumulativeRealizedPnl: string;
    tradeCount: number;
    lastExecutedAt: string | null;
};

export type RebuiltPositionsSnapshot = {
    userId: string;
    asOf: string | null;
    positions: RebuiltPosition[];
    totalOpenRealizedPnl: string;
    totalCumulativeRealizedPnl: string;
    tradeCount: number;
    rebuildDurationMs: number;
};

export type RebuiltEquitySnapshot = {
    userId: string;
    asOf: string | null;
    cashBalance: string;
    realizedPnl: string;
    unrealizedPnl: string;
    equity: string;
    priceSource: "NONE" | "LIVE";
};

export type DriftWalletDelta = {
    rebuiltBalance: string;
    liveBalance: string;
    deltaBalance: string;
    rebuiltBlockedMargin: string;
    liveBlockedMargin: string;
    deltaBlockedMargin: string;
    rebuiltEquity: string;
    liveEquity: string;
    deltaEquity: string;
};

export type PositionDriftDelta = {
    instrumentToken: string;
    rebuiltQuantity: number;
    liveQuantity: number;
    quantityDelta: number;
    rebuiltAveragePrice: string;
    liveAveragePrice: string;
    averagePriceDelta: string;
    rebuiltRealizedPnl: string;
    liveRealizedPnl: string;
    realizedPnlDelta: string;
};

export type UserStateDriftReport = {
    userId: string;
    detected: boolean;
    fatal: boolean;
    earliestSequence: number | null;
    latestSequence: number | null;
    wallet: DriftWalletDelta;
    positionDrifts: PositionDriftDelta[];
    maxAbsoluteDelta: string;
    checkedAt: string;
};

export type ReplaySystemResult = {
    asOf: string | null;
    startedAt: string;
    completedAt: string;
    usersProcessed: number;
    usersWithDrift: number;
    usersWithFatalDrift: number;
    haltTriggered: boolean;
    durationMs: number;
};

export class EventReplayService {
    async rebuildUserState(userId: string, options: ReplayOptions = {}): Promise<RebuiltUserStateSnapshot> {
        const startedAt = Date.now();
        const asOf = options.asOf;
        const explicitAsOfSequence =
            Number.isFinite(Number(options.asOfSequence)) && Number(options.asOfSequence) > 0
                ? Math.floor(Number(options.asOfSequence))
                : null;
        const asOfSequence =
            explicitAsOfSequence !== null
                ? explicitAsOfSequence
                : await this.resolveAsOfSequence(asOf);
        const batchSize = Math.max(100, options.batchSize ?? LEDGER_BATCH_SIZE);

        const accountRows = await db
            .select({
                id: ledgerAccounts.id,
                accountType: ledgerAccounts.accountType,
            })
            .from(ledgerAccounts)
            .where(eq(ledgerAccounts.userId, userId));

        if (accountRows.length === 0) {
            return {
                userId,
                asOf: toIso(asOf),
                asOfSequence,
                earliestSequence: null,
                latestSequence: null,
                freeCash: "0",
                blockedMargin: "0",
                cashBalance: "0",
                realizedPnlAccount: "0",
                unrealizedPnlAccount: "0",
                fees: "0",
                netLedgerBalance: "0",
                ledgerEntryCount: 0,
                rebuildDurationMs: Date.now() - startedAt,
            };
        }

        const accountIdToType = new Map<string, LedgerAccountType>(
            accountRows.map((row) => [row.id, row.accountType])
        );
        const accountIds = accountRows.map((row) => row.id);
        const balancesByType = new Map<LedgerAccountType, bigint>(
            ACCOUNT_TYPES.map((type) => [type, ZERO])
        );

        let cursor: LedgerReplayCursor | null = null;
        let ledgerEntryCount = 0;
        let earliestSequence: number | null = null;
        let latestSequence: number | null = null;

        while (true) {
            const whereConditions: any[] = [
                or(
                    inArray(ledgerEntries.debitAccountId, accountIds),
                    inArray(ledgerEntries.creditAccountId, accountIds)
                ),
            ];

            if (asOfSequence !== null) {
                whereConditions.push(lte(ledgerEntries.globalSequence, asOfSequence));
            }

            if (cursor) {
                whereConditions.push(
                    sql`${ledgerEntries.globalSequence} > ${cursor.globalSequence}`
                );
            }

            const rows = await db
                .select({
                    id: ledgerEntries.id,
                    globalSequence: ledgerEntries.globalSequence,
                    debitAccountId: ledgerEntries.debitAccountId,
                    creditAccountId: ledgerEntries.creditAccountId,
                    amount: ledgerEntries.amount,
                })
                .from(ledgerEntries)
                .where(and(...whereConditions))
                .orderBy(asc(ledgerEntries.globalSequence))
                .limit(batchSize);

            if (rows.length === 0) break;

            for (const row of rows) {
                const sequence = Number(row.globalSequence);
                if (!Number.isFinite(sequence)) continue;
                if (earliestSequence === null) earliestSequence = sequence;
                latestSequence = sequence;
                const amount = parseDecimal(row.amount);
                const debitType = accountIdToType.get(row.debitAccountId);
                const creditType = accountIdToType.get(row.creditAccountId);

                if (debitType) {
                    balancesByType.set(debitType, addDecimal(balancesByType.get(debitType) ?? ZERO, amount));
                }
                if (creditType) {
                    balancesByType.set(creditType, subDecimal(balancesByType.get(creditType) ?? ZERO, amount));
                }
                ledgerEntryCount += 1;
            }

            const last = rows[rows.length - 1];
            cursor = {
                globalSequence: Number(last.globalSequence),
            };

            if (rows.length < batchSize) break;
        }

        const freeCash = balancesByType.get("CASH") ?? ZERO;
        const blockedMargin = balancesByType.get("MARGIN_BLOCKED") ?? ZERO;
        const realizedPnlAccount = balancesByType.get("REALIZED_PNL") ?? ZERO;
        const unrealizedPnlAccount = balancesByType.get("UNREALIZED_PNL") ?? ZERO;
        const fees = balancesByType.get("FEES") ?? ZERO;
        const cashBalance = addDecimal(freeCash, blockedMargin);

        let netLedgerBalance = ZERO;
        for (const type of ACCOUNT_TYPES) {
            netLedgerBalance = addDecimal(netLedgerBalance, balancesByType.get(type) ?? ZERO);
        }

        const rebuildDurationMs = Date.now() - startedAt;
        return {
            userId,
            asOf: toIso(asOf),
            asOfSequence,
            earliestSequence,
            latestSequence,
            freeCash: formatDecimal(freeCash),
            blockedMargin: formatDecimal(blockedMargin),
            cashBalance: formatDecimal(cashBalance),
            realizedPnlAccount: formatDecimal(realizedPnlAccount),
            unrealizedPnlAccount: formatDecimal(unrealizedPnlAccount),
            fees: formatDecimal(fees),
            netLedgerBalance: formatDecimal(netLedgerBalance),
            ledgerEntryCount,
            rebuildDurationMs,
        };
    }

    async rebuildPositions(userId: string, options: ReplayOptions = {}): Promise<RebuiltPositionsSnapshot> {
        const startedAt = Date.now();
        const asOf = options.asOf;
        const batchSize = Math.max(100, options.batchSize ?? TRADE_BATCH_SIZE);
        const byToken = new Map<string, PositionAccumulator>();

        let cursor: TradeReplayCursor | null = null;
        let totalTrades = 0;

        while (true) {
            const whereConditions: any[] = [
                eq(trades.userId, userId),
                isNotNull(trades.instrumentToken),
            ];

            if (asOf instanceof Date) {
                whereConditions.push(lte(trades.executedAt, asOf));
            }

            if (cursor) {
                whereConditions.push(
                    sql`(${trades.executedAt}, ${trades.id}) > (${cursor.createdAt}, ${cursor.id})`
                );
            }

            const rows = await db
                .select({
                    id: trades.id,
                    executedAt: trades.executedAt,
                    instrumentToken: trades.instrumentToken,
                    side: trades.side,
                    quantity: trades.quantity,
                    price: trades.price,
                })
                .from(trades)
                .where(and(...whereConditions))
                .orderBy(asc(trades.executedAt), asc(trades.id))
                .limit(batchSize);

            if (rows.length === 0) break;

            for (const row of rows) {
                const token = String(row.instrumentToken || "").trim();
                if (!token) {
                    continue;
                }

                const quantity = Number(row.quantity);
                if (!Number.isInteger(quantity) || quantity <= 0) {
                    continue;
                }

                const side = row.side;
                if (side !== "BUY" && side !== "SELL") {
                    continue;
                }

                const price = parseDecimal(row.price);
                const signedDelta = side === "BUY" ? quantity : -quantity;
                const current =
                    byToken.get(token) ??
                    ({
                        instrumentToken: token,
                        quantity: 0,
                        averagePrice: ZERO,
                        realizedPnl: ZERO,
                        cumulativeRealizedPnl: ZERO,
                        tradeCount: 0,
                        lastExecutedAt: null,
                    } satisfies PositionAccumulator);

                if (current.quantity === 0) {
                    current.quantity = signedDelta;
                    current.averagePrice = price;
                } else {
                    const prevQty = current.quantity;
                    const sameDirection =
                        (prevQty > 0 && signedDelta > 0) ||
                        (prevQty < 0 && signedDelta < 0);

                    if (sameDirection) {
                        const currentAbs = Math.abs(prevQty);
                        const nextAbs = currentAbs + quantity;
                        const weightedCost = addDecimal(
                            mulDecimalByInt(current.averagePrice, currentAbs),
                            mulDecimalByInt(price, quantity)
                        );
                        current.averagePrice = divDecimalByIntHalfUp(weightedCost, nextAbs);
                        current.quantity = prevQty + signedDelta;
                    } else {
                        const currentAbs = Math.abs(prevQty);
                        const closedQty = Math.min(currentAbs, quantity);
                        const pnlPerUnit =
                            side === "BUY"
                                ? subDecimal(current.averagePrice, price)
                                : subDecimal(price, current.averagePrice);
                        const realizedDelta = mulDecimalByInt(pnlPerUnit, closedQty);

                        current.realizedPnl = addDecimal(current.realizedPnl, realizedDelta);
                        current.cumulativeRealizedPnl = addDecimal(
                            current.cumulativeRealizedPnl,
                            realizedDelta
                        );
                        current.quantity = prevQty + signedDelta;

                        if (current.quantity === 0) {
                            current.averagePrice = ZERO;
                            current.realizedPnl = ZERO;
                        } else if (
                            (prevQty > 0 && current.quantity < 0) ||
                            (prevQty < 0 && current.quantity > 0)
                        ) {
                            current.averagePrice = price;
                        }
                    }
                }

                current.tradeCount += 1;
                current.lastExecutedAt = row.executedAt;
                byToken.set(token, current);
                totalTrades += 1;
            }

            const last = rows[rows.length - 1];
            cursor = {
                createdAt: last.executedAt,
                id: last.id,
            };

            if (rows.length < batchSize) break;
        }

        const sorted = Array.from(byToken.values()).sort((a, b) =>
            a.instrumentToken.localeCompare(b.instrumentToken)
        );

        const openPositions = sorted.filter((item) => item.quantity !== 0);
        let totalOpenRealized = ZERO;
        let totalCumulativeRealized = ZERO;

        for (const item of openPositions) {
            totalOpenRealized = addDecimal(totalOpenRealized, item.realizedPnl);
            totalCumulativeRealized = addDecimal(
                totalCumulativeRealized,
                item.cumulativeRealizedPnl
            );
        }

        return {
            userId,
            asOf: toIso(asOf),
            positions: openPositions.map((item) => ({
                instrumentToken: item.instrumentToken,
                quantity: item.quantity,
                averagePrice: formatDecimal(item.averagePrice),
                realizedPnl: formatDecimal(item.realizedPnl),
                cumulativeRealizedPnl: formatDecimal(item.cumulativeRealizedPnl),
                tradeCount: item.tradeCount,
                lastExecutedAt: toIso(item.lastExecutedAt),
            })),
            totalOpenRealizedPnl: formatDecimal(totalOpenRealized),
            totalCumulativeRealizedPnl: formatDecimal(totalCumulativeRealized),
            tradeCount: totalTrades,
            rebuildDurationMs: Date.now() - startedAt,
        };
    }

    async rebuildEquity(userId: string, options: EquityReplayOptions = {}): Promise<RebuiltEquitySnapshot> {
        const [userState, positionState] = await Promise.all([
            this.rebuildUserState(userId, options),
            this.rebuildPositions(userId, options),
        ]);

        return this.buildEquitySnapshot(userState, positionState, options);
    }

    async replaySystem(optionalTimestamp?: Date): Promise<ReplaySystemResult> {
        const startedMs = Date.now();
        const startedAt = new Date(startedMs);
        const asOf = optionalTimestamp instanceof Date ? optionalTimestamp : undefined;
        await this.assertNoDuplicateIdempotencyKeys();
        const asOfSequence = await this.resolveAsOfSequence(asOf);

        logger.warn(
            {
                event: "EVENT_REPLAY_STARTED",
                asOf: toIso(asOf),
                asOfSequence,
                userChunkSize: USER_CHUNK_SIZE,
                ledgerBatchSize: LEDGER_BATCH_SIZE,
                tradeBatchSize: TRADE_BATCH_SIZE,
            },
            "EVENT_REPLAY_STARTED"
        );

        let usersProcessed = 0;
        let usersWithDrift = 0;
        let usersWithFatalDrift = 0;
        let haltTriggered = false;
        let cursorUserId: string | null = null;

        while (true) {
            const whereConditions: any[] = cursorUserId
                ? [sql`${users.id} > ${cursorUserId}`]
                : [];

            const userRows: Array<{ id: string }> = await db
                .select({ id: users.id })
                .from(users)
                .where(whereConditions.length ? and(...whereConditions) : undefined)
                .orderBy(asc(users.id))
                .limit(USER_CHUNK_SIZE);

            if (userRows.length === 0) break;

            for (const userRow of userRows) {
                const userStarted = Date.now();
                const rebuiltUser = await this.rebuildUserState(userRow.id, {
                    asOf,
                    asOfSequence: asOfSequence === null ? undefined : asOfSequence,
                });
                const rebuiltPositions = await this.rebuildPositions(userRow.id, { asOf });
                const rebuiltEquity = this.buildEquitySnapshot(
                    rebuiltUser,
                    rebuiltPositions,
                    {
                        asOf,
                        includeUnrealized: false,
                    }
                );

                let driftReport: UserStateDriftReport | null = null;
                if (!asOf) {
                    driftReport = await this.compareWithLiveState(
                        userRow.id,
                        rebuiltUser,
                        rebuiltPositions,
                        rebuiltEquity,
                        {}
                    );
                    if (driftReport.detected) usersWithDrift += 1;
                    if (driftReport.fatal) {
                        usersWithFatalDrift += 1;
                        haltTriggered = true;
                    }
                }

                logger.info(
                    {
                        event: "USER_STATE_REBUILT",
                        userId: userRow.id,
                        asOf: toIso(asOf),
                        asOfSequence,
                        rebuildDurationMs: Date.now() - userStarted,
                        ledgerEntryCount: rebuiltUser.ledgerEntryCount,
                        tradeCount: rebuiltPositions.tradeCount,
                        driftDetected: driftReport?.detected ?? false,
                        fatalDrift: driftReport?.fatal ?? false,
                    },
                    "USER_STATE_REBUILT"
                );

                usersProcessed += 1;
            }

            cursorUserId = userRows[userRows.length - 1].id;
            if (userRows.length < USER_CHUNK_SIZE) break;
        }

        const completedAt = new Date();
        const durationMs = Date.now() - startedMs;
        logger.warn(
            {
                event: "EVENT_REPLAY_COMPLETED",
                asOf: toIso(asOf),
                asOfSequence,
                usersProcessed,
                usersWithDrift,
                usersWithFatalDrift,
                haltTriggered,
                durationMs,
            },
            "EVENT_REPLAY_COMPLETED"
        );

        return {
            asOf: toIso(asOf),
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            usersProcessed,
            usersWithDrift,
            usersWithFatalDrift,
            haltTriggered,
            durationMs,
        };
    }

    async detectUserStateDrift(
        userId: string,
        options: DriftOptions = {}
    ): Promise<UserStateDriftReport> {
        const rebuiltUser = await this.rebuildUserState(userId);
        const rebuiltPositions = await this.rebuildPositions(userId);
        const rebuiltEquity = this.buildEquitySnapshot(
            rebuiltUser,
            rebuiltPositions,
            {
                includeUnrealized: options.includeUnrealized ?? false,
            }
        );

        return this.compareWithLiveState(
            userId,
            rebuiltUser,
            rebuiltPositions,
            rebuiltEquity,
            options
        );
    }

    async replayFromLedgerSequence(sequenceId: number): Promise<ReplaySystemResult> {
        if (!Number.isFinite(sequenceId) || sequenceId <= 0) {
            throw new ApiError("Invalid sequenceId", 400, "REPLAY_SEQUENCE_INVALID");
        }

        await this.assertNoDuplicateIdempotencyKeys();
        const asOfSequence = Math.floor(sequenceId);
        const asOf = await this.resolveAsOfTimestampForSequence(asOfSequence);
        const startedMs = Date.now();
        const startedAt = new Date(startedMs);

        logger.warn(
            {
                event: "EVENT_REPLAY_STARTED",
                asOf: null,
                asOfSequence,
                userChunkSize: USER_CHUNK_SIZE,
                ledgerBatchSize: LEDGER_BATCH_SIZE,
                tradeBatchSize: TRADE_BATCH_SIZE,
            },
            "EVENT_REPLAY_STARTED"
        );

        let usersProcessed = 0;
        let usersWithDrift = 0;
        let usersWithFatalDrift = 0;
        let haltTriggered = false;
        let cursorUserId: string | null = null;

        while (true) {
            const whereConditions: any[] = cursorUserId
                ? [sql`${users.id} > ${cursorUserId}`]
                : [];

            const userRows: Array<{ id: string }> = await db
                .select({ id: users.id })
                .from(users)
                .where(whereConditions.length ? and(...whereConditions) : undefined)
                .orderBy(asc(users.id))
                .limit(USER_CHUNK_SIZE);

            if (userRows.length === 0) break;

            for (const userRow of userRows) {
                const userStarted = Date.now();
                const rebuiltUser = await this.rebuildUserState(userRow.id, { asOfSequence });
                const rebuiltPositions = await this.rebuildPositions(
                    userRow.id,
                    asOf ? { asOf } : {}
                );
                const rebuiltEquity = this.buildEquitySnapshot(
                    rebuiltUser,
                    rebuiltPositions,
                    {
                        includeUnrealized: false,
                    }
                );

                const driftReport = await this.compareWithLiveState(
                    userRow.id,
                    rebuiltUser,
                    rebuiltPositions,
                    rebuiltEquity,
                    {}
                );
                if (driftReport.detected) usersWithDrift += 1;
                if (driftReport.fatal) {
                    usersWithFatalDrift += 1;
                    haltTriggered = true;
                }

                logger.info(
                    {
                        event: "USER_STATE_REBUILT",
                        userId: userRow.id,
                        asOf: null,
                        asOfSequence,
                        rebuildDurationMs: Date.now() - userStarted,
                        ledgerEntryCount: rebuiltUser.ledgerEntryCount,
                        tradeCount: rebuiltPositions.tradeCount,
                        driftDetected: driftReport.detected,
                        fatalDrift: driftReport.fatal,
                    },
                    "USER_STATE_REBUILT"
                );

                usersProcessed += 1;
            }

            cursorUserId = userRows[userRows.length - 1].id;
            if (userRows.length < USER_CHUNK_SIZE) break;
        }

        const completedAt = new Date();
        const durationMs = Date.now() - startedMs;
        logger.warn(
            {
                event: "EVENT_REPLAY_COMPLETED",
                asOf: null,
                asOfSequence,
                usersProcessed,
                usersWithDrift,
                usersWithFatalDrift,
                haltTriggered,
                durationMs,
            },
            "EVENT_REPLAY_COMPLETED"
        );

        return {
            asOf: null,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            usersProcessed,
            usersWithDrift,
            usersWithFatalDrift,
            haltTriggered,
            durationMs,
        };
    }

    private async resolveAsOfSequence(asOf?: Date): Promise<number | null> {
        if (!(asOf instanceof Date)) return null;

        const [row] = await db
            .select({
                sequence: ledgerEntries.globalSequence,
            })
            .from(ledgerEntries)
            .where(lte(ledgerEntries.createdAt, asOf))
            .orderBy(sql`${ledgerEntries.globalSequence} DESC`)
            .limit(1);

        const sequence = Number(row?.sequence);
        return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 0;
    }

    private async resolveAsOfTimestampForSequence(sequence: number): Promise<Date | null> {
        if (!Number.isFinite(sequence) || sequence <= 0) return null;
        const [row] = await db
            .select({
                createdAt: ledgerEntries.createdAt,
            })
            .from(ledgerEntries)
            .where(lte(ledgerEntries.globalSequence, Math.floor(sequence)))
            .orderBy(sql`${ledgerEntries.globalSequence} DESC`)
            .limit(1);

        return row?.createdAt ?? null;
    }

    private buildEquitySnapshot(
        userState: RebuiltUserStateSnapshot,
        positionState: RebuiltPositionsSnapshot,
        options: EquityReplayOptions = {}
    ): RebuiltEquitySnapshot {
        const includeUnrealized = Boolean(options.includeUnrealized) && !(options.asOf instanceof Date);
        let unrealized = ZERO;
        let priceSource: "NONE" | "LIVE" = "NONE";

        if (includeUnrealized) {
            const unrealizedResult = this.computeLiveUnrealizedPnl(
                positionState.positions,
                options.maxPriceAgeMs ?? UNREALIZED_PRICE_MAX_AGE_MS
            );
            unrealized = unrealizedResult.value;
            priceSource = unrealizedResult.usedLivePrices ? "LIVE" : "NONE";
        }

        const cashBalance = parseDecimal(userState.cashBalance);
        const realizedPnl = parseDecimal(positionState.totalCumulativeRealizedPnl);
        const equity = addDecimal(addDecimal(cashBalance, realizedPnl), unrealized);

        return {
            userId: userState.userId,
            asOf: userState.asOf,
            cashBalance: formatDecimal(cashBalance),
            realizedPnl: formatDecimal(realizedPnl),
            unrealizedPnl: formatDecimal(unrealized),
            equity: formatDecimal(equity),
            priceSource,
        };
    }

    private computeLiveUnrealizedPnl(
        positionsState: RebuiltPosition[],
        maxPriceAgeMs: number
    ): { value: bigint; usedLivePrices: boolean } {
        let total = ZERO;
        let usedLivePrices = false;

        for (const position of positionsState) {
            if (!Number.isInteger(position.quantity) || position.quantity === 0) continue;

            const avg = parseDecimal(position.averagePrice);
            const quote = realTimeMarketService.getQuote(position.instrumentToken);
            const livePrice = Number(quote?.price);

            let mark = avg;
            if (
                Number.isFinite(livePrice) &&
                livePrice > 0 &&
                !hasStalePrice(quote?.lastUpdated, maxPriceAgeMs)
            ) {
                mark = parseDecimal(livePrice.toFixed(8));
                usedLivePrices = true;
            }

            const absQty = Math.abs(position.quantity);
            const pnlPerUnit =
                position.quantity > 0 ? subDecimal(mark, avg) : subDecimal(avg, mark);
            const pnl = mulDecimalByInt(pnlPerUnit, absQty);
            total = addDecimal(total, pnl);
        }

        return { value: total, usedLivePrices };
    }

    private async compareWithLiveState(
        userId: string,
        rebuiltUser: RebuiltUserStateSnapshot,
        rebuiltPositions: RebuiltPositionsSnapshot,
        rebuiltEquity: RebuiltEquitySnapshot,
        options: DriftOptions
    ): Promise<UserStateDriftReport> {
        const epsilon = parseDecimal(options.epsilon ?? DRIFT_EPSILON);
        const haltThreshold = parseDecimal(options.haltThreshold ?? DRIFT_FATAL_THRESHOLD);

        const [liveWallet] = await db
            .select({
                balance: wallets.balance,
                blockedBalance: wallets.blockedBalance,
                equity: wallets.equity,
            })
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

        const livePositions = await db
            .select({
                instrumentToken: positions.instrumentToken,
                quantity: positions.quantity,
                averagePrice: positions.averagePrice,
                realizedPnl: positions.realizedPnL,
            })
            .from(positions)
            .where(eq(positions.userId, userId));

        const rebuiltBalance = parseDecimal(rebuiltUser.cashBalance);
        const rebuiltBlocked = parseDecimal(rebuiltUser.blockedMargin);
        const rebuiltEq = parseDecimal(rebuiltEquity.equity);

        const liveBalance = parseDecimal(liveWallet?.balance ?? "0");
        const liveBlocked = parseDecimal(liveWallet?.blockedBalance ?? "0");
        const liveEq = parseDecimal(liveWallet?.equity ?? "0");

        const deltaBalance = absDecimal(subDecimal(rebuiltBalance, liveBalance));
        const deltaBlocked = absDecimal(subDecimal(rebuiltBlocked, liveBlocked));
        const deltaEquity = absDecimal(subDecimal(rebuiltEq, liveEq));

        const walletDriftDetected =
            deltaBalance > epsilon || deltaBlocked > epsilon || deltaEquity > epsilon;

        const rebuiltByToken = new Map(
            rebuiltPositions.positions.map((position) => [position.instrumentToken, position])
        );
        const liveByToken = new Map(
            livePositions.map((position) => [position.instrumentToken, position])
        );

        const allTokens = new Set<string>([
            ...Array.from(rebuiltByToken.keys()),
            ...Array.from(liveByToken.keys()),
        ]);

        const positionDrifts: PositionDriftDelta[] = [];
        for (const token of Array.from(allTokens).sort()) {
            const rebuilt = rebuiltByToken.get(token);
            const live = liveByToken.get(token);

            const rebuiltQty = rebuilt?.quantity ?? 0;
            const liveQty = Number(live?.quantity ?? 0);
            const qtyDelta = Math.abs(rebuiltQty - liveQty);

            const rebuiltAvg = parseDecimal(rebuilt?.averagePrice ?? "0");
            const liveAvg = parseDecimal(live?.averagePrice ?? "0");
            const avgDelta = absDecimal(subDecimal(rebuiltAvg, liveAvg));

            const rebuiltRealized = parseDecimal(rebuilt?.realizedPnl ?? "0");
            const liveRealized = parseDecimal(live?.realizedPnl ?? "0");
            const realizedDelta = absDecimal(subDecimal(rebuiltRealized, liveRealized));

            const drifted = qtyDelta !== 0 || avgDelta > epsilon || realizedDelta > epsilon;
            if (!drifted) continue;

            positionDrifts.push({
                instrumentToken: token,
                rebuiltQuantity: rebuiltQty,
                liveQuantity: liveQty,
                quantityDelta: qtyDelta,
                rebuiltAveragePrice: formatDecimal(rebuiltAvg),
                liveAveragePrice: formatDecimal(liveAvg),
                averagePriceDelta: formatDecimal(avgDelta),
                rebuiltRealizedPnl: formatDecimal(rebuiltRealized),
                liveRealizedPnl: formatDecimal(liveRealized),
                realizedPnlDelta: formatDecimal(realizedDelta),
            });
        }

        const positionDriftDetected = positionDrifts.length > 0;
        let maxAbsoluteDelta = maxDecimal(deltaBalance, maxDecimal(deltaBlocked, deltaEquity));
        for (const drift of positionDrifts) {
            const avgDelta = parseDecimal(drift.averagePriceDelta);
            const realizedDelta = parseDecimal(drift.realizedPnlDelta);
            maxAbsoluteDelta = maxDecimal(maxAbsoluteDelta, avgDelta);
            maxAbsoluteDelta = maxDecimal(maxAbsoluteDelta, realizedDelta);
            if (drift.quantityDelta > 0) {
                maxAbsoluteDelta = maxDecimal(maxAbsoluteDelta, haltThreshold);
            }
        }

        const fatal =
            deltaBalance > haltThreshold ||
            deltaBlocked > haltThreshold ||
            deltaEquity > haltThreshold ||
            positionDrifts.some((item) => {
                const avgDelta = parseDecimal(item.averagePriceDelta);
                const realizedDelta = parseDecimal(item.realizedPnlDelta);
                return item.quantityDelta > 0 || avgDelta > haltThreshold || realizedDelta > haltThreshold;
            });

        const detected = walletDriftDetected || positionDriftDetected;
        const report: UserStateDriftReport = {
            userId,
            detected,
            fatal,
            earliestSequence: rebuiltUser.earliestSequence,
            latestSequence: rebuiltUser.latestSequence,
            wallet: {
                rebuiltBalance: formatDecimal(rebuiltBalance),
                liveBalance: formatDecimal(liveBalance),
                deltaBalance: formatDecimal(deltaBalance),
                rebuiltBlockedMargin: formatDecimal(rebuiltBlocked),
                liveBlockedMargin: formatDecimal(liveBlocked),
                deltaBlockedMargin: formatDecimal(deltaBlocked),
                rebuiltEquity: formatDecimal(rebuiltEq),
                liveEquity: formatDecimal(liveEq),
                deltaEquity: formatDecimal(deltaEquity),
            },
            positionDrifts,
            maxAbsoluteDelta: formatDecimal(maxAbsoluteDelta),
            checkedAt: new Date().toISOString(),
        };

        if (detected) {
            logger.error(
                {
                    event: "STATE_DRIFT_DETECTED",
                    severity: fatal ? "FATAL" : "WARN",
                    userId,
                    affectedUser: userId,
                    earliestSequence: rebuiltUser.earliestSequence,
                    latestSequence: rebuiltUser.latestSequence,
                    rebuiltBalance: report.wallet.rebuiltBalance,
                    liveBalance: report.wallet.liveBalance,
                    delta: report.wallet.deltaBalance,
                    deltaBlockedMargin: report.wallet.deltaBlockedMargin,
                    deltaEquity: report.wallet.deltaEquity,
                    positionDrifts: report.positionDrifts.length,
                    maxAbsoluteDelta: report.maxAbsoluteDelta,
                },
                "STATE_DRIFT_DETECTED"
            );
        }

        if (fatal && AUTO_HALT_ON_FATAL_DRIFT) {
            haltTrading("STATE_DRIFT_DETECTED");
        }

        return report;
    }

    private async assertNoDuplicateIdempotencyKeys(): Promise<void> {
        const duplicates = await db
            .select({
                idempotencyKey: ledgerEntries.idempotencyKey,
                count: sql<number>`count(*)`,
                earliestSequence: sql<number>`min(${ledgerEntries.globalSequence})`,
                latestSequence: sql<number>`max(${ledgerEntries.globalSequence})`,
            })
            .from(ledgerEntries)
            .groupBy(ledgerEntries.idempotencyKey)
            .having(sql`count(*) > 1`)
            .limit(1);

        const duplicate = duplicates[0];
        if (!duplicate?.idempotencyKey) return;

        logger.error(
            {
                event: "LEDGER_DUPLICATION_DETECTED",
                idempotencyKey: duplicate.idempotencyKey,
                count: Number(duplicate.count),
                earliestSequence: Number(duplicate.earliestSequence),
                latestSequence: Number(duplicate.latestSequence),
            },
            "LEDGER_DUPLICATION_DETECTED"
        );
        haltTrading("LEDGER_DUPLICATION_DETECTED");
        throw new ApiError(
            "Duplicate ledger idempotency keys detected",
            500,
            "LEDGER_DUPLICATION_DETECTED"
        );
    }
}

declare global {
    var __eventReplayServiceInstance: EventReplayService | undefined;
}

const globalState = globalThis as unknown as {
    __eventReplayServiceInstance?: EventReplayService;
};

export const eventReplayService =
    globalState.__eventReplayServiceInstance || new EventReplayService();

// Always cache globally to prevent duplicate instances in production
globalState.__eventReplayServiceInstance = eventReplayService;
