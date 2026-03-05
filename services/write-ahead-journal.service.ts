import { createHash, randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
    ledgerEntries,
    trades,
    writeAheadJournal,
    type WriteAheadOperationType,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { haltTrading } from "@/lib/system-control";

type TxLike = typeof db | any;

type JournalPayload = Record<string, unknown>;

type PrepareJournalInput = {
    journalId?: string;
    operationType: WriteAheadOperationType;
    userId: string;
    referenceId: string;
    payload: JournalPayload;
};

type CommitJournalOptions = {
    ledgerSequences?: number[];
    mutationMeta?: Record<string, unknown>;
};

type RecoveryOutcome = "COMMITTED" | "ABORTED";

type RecoveryResolution = {
    outcome: RecoveryOutcome;
    ledgerSequences: number[];
};

const RECOVERY_BATCH_SIZE = Math.max(
    50,
    Number(process.env.WAJ_RECOVERY_BATCH_SIZE ?? "500")
);

function stableStringify(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys
            .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(String(value));
}

function stripCommitMeta(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
        return value.map((item) => stripCommitMeta(item));
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(obj)) {
            if (key === "__commitMeta") continue;
            result[key] = stripCommitMeta(obj[key]);
        }
        return result;
    }
    return value;
}

function checksumPayload(payload: unknown): string {
    const canonical = stableStringify(stripCommitMeta(payload));
    return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function toJournalId(value?: string): string {
    const normalized = String(value || "").trim();
    if (!normalized) return randomUUID();
    return normalized;
}

function normalizeSequences(input?: number[]): number[] {
    if (!input || input.length === 0) return [];
    const unique = new Set<number>();
    for (const raw of input) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) continue;
        unique.add(Math.floor(parsed));
    }
    return Array.from(unique).sort((a, b) => a - b);
}

function extractIdempotencyKeys(payload: unknown): string[] {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return [];
    }

    const value = payload as Record<string, unknown>;
    const keys = new Set<string>();

    const direct = String(value.idempotencyKey || "").trim();
    if (direct) keys.add(direct);

    const fromArray = Array.isArray(value.idempotencyKeys)
        ? value.idempotencyKeys
        : [];
    for (const candidate of fromArray) {
        const key = String(candidate || "").trim();
        if (key) keys.add(key);
    }

    const nestedPayloads: unknown[] = [];
    if (value.mutationMeta && typeof value.mutationMeta === "object") {
        nestedPayloads.push(value.mutationMeta);
    }
    if (value.intent && typeof value.intent === "object") {
        nestedPayloads.push(value.intent);
    }

    for (const nested of nestedPayloads) {
        for (const key of extractIdempotencyKeys(nested)) {
            keys.add(key);
        }
    }

    return Array.from(keys).sort();
}

function mergeCommitPayload(
    payload: unknown,
    ledgerSequences: number[],
    mutationMeta: Record<string, unknown> | undefined,
    committedAt: Date
): Record<string, unknown> {
    const base: Record<string, unknown> =
        payload && typeof payload === "object" && !Array.isArray(payload)
            ? { ...(payload as Record<string, unknown>) }
            : { intent: payload };

    const previousMeta =
        base.__commitMeta && typeof base.__commitMeta === "object" && !Array.isArray(base.__commitMeta)
            ? (base.__commitMeta as Record<string, unknown>)
            : {};

    const previousSequences = normalizeSequences(
        Array.isArray(previousMeta.ledgerSequences)
            ? (previousMeta.ledgerSequences as number[])
            : []
    );

    const mergedSequences = normalizeSequences([...previousSequences, ...ledgerSequences]);

    base.__commitMeta = {
        ...previousMeta,
        ledgerSequences: mergedSequences,
        committedAt: committedAt.toISOString(),
        ...(mutationMeta ? { mutationMeta } : {}),
    };

    return base;
}

export class WriteAheadJournalService {
    static async prepare(
        operation: PrepareJournalInput,
        tx?: TxLike
    ): Promise<typeof writeAheadJournal.$inferSelect> {
        const executor = tx || db;
        const journalId = toJournalId(operation.journalId);
        const checksum = checksumPayload(operation.payload);

        const inserted = await executor
            .insert(writeAheadJournal)
            .values({
                journalId,
                operationType: operation.operationType,
                status: "PREPARED",
                userId: operation.userId,
                referenceId: operation.referenceId,
                payload: operation.payload,
                checksum,
            })
            .onConflictDoNothing({
                target: [writeAheadJournal.journalId],
            })
            .returning();

        const row =
            inserted[0] ||
            (
                await executor
                    .select()
                    .from(writeAheadJournal)
                    .where(eq(writeAheadJournal.journalId, journalId))
                    .limit(1)
            )[0];

        if (!row) {
            throw new ApiError("Failed to prepare write-ahead journal", 500, "WAJ_PREPARE_FAILED");
        }

        if (checksumPayload(row.payload) !== checksum) {
            logger.error(
                {
                    event: "JOURNAL_CHECKSUM_MISMATCH",
                    journalId,
                    operationType: operation.operationType,
                    userId: operation.userId,
                },
                "JOURNAL_CHECKSUM_MISMATCH"
            );
            haltTrading("JOURNAL_CORRUPTION");
            throw new ApiError("Write-ahead journal checksum mismatch", 500, "JOURNAL_CORRUPTION");
        }

        logger.info(
            {
                event: "WAJ_PREPARED",
                journalId: row.journalId,
                operationType: row.operationType,
                userId: row.userId,
                referenceId: row.referenceId,
                status: row.status,
            },
            "WAJ_PREPARED"
        );

        return row;
    }

    static async commit(
        journalId: string,
        tx?: TxLike,
        options: CommitJournalOptions = {}
    ): Promise<void> {
        const executor = tx || db;
        const normalizedJournalId = toJournalId(journalId);
        const [existing] = await executor
            .select()
            .from(writeAheadJournal)
            .where(eq(writeAheadJournal.journalId, normalizedJournalId))
            .limit(1);

        if (!existing) {
            throw new ApiError("Write-ahead journal not found", 404, "WAJ_NOT_FOUND");
        }

        const recalculated = checksumPayload(existing.payload);
        if (recalculated !== existing.checksum) {
            logger.error(
                {
                    event: "JOURNAL_CHECKSUM_MISMATCH",
                    journalId: normalizedJournalId,
                    operationType: existing.operationType,
                    userId: existing.userId,
                    referenceId: existing.referenceId,
                    expected: existing.checksum,
                    actual: recalculated,
                },
                "JOURNAL_CHECKSUM_MISMATCH"
            );
            haltTrading("JOURNAL_CORRUPTION");
            throw new ApiError("Write-ahead journal checksum mismatch", 500, "JOURNAL_CORRUPTION");
        }

        const committedAt = new Date();
        const ledgerSequences = normalizeSequences(options.ledgerSequences);
        const nextPayload = mergeCommitPayload(
            existing.payload,
            ledgerSequences,
            options.mutationMeta,
            committedAt
        );

        await executor
            .update(writeAheadJournal)
            .set({
                status: "COMMITTED",
                committedAt,
                payload: nextPayload,
            })
            .where(eq(writeAheadJournal.journalId, normalizedJournalId));

        logger.info(
            {
                event: "WAJ_COMMITTED",
                journalId: normalizedJournalId,
                operationType: existing.operationType,
                userId: existing.userId,
                referenceId: existing.referenceId,
                ledgerSequences,
            },
            "WAJ_COMMITTED"
        );
    }

    static async abort(journalId: string, tx?: TxLike, reason?: string): Promise<void> {
        const executor = tx || db;
        const normalizedJournalId = toJournalId(journalId);

        const [existing] = await executor
            .select()
            .from(writeAheadJournal)
            .where(eq(writeAheadJournal.journalId, normalizedJournalId))
            .limit(1);

        if (!existing || existing.status === "COMMITTED") return;
        if (existing.status === "ABORTED") return;

        await executor
            .update(writeAheadJournal)
            .set({
                status: "ABORTED",
            })
            .where(eq(writeAheadJournal.journalId, normalizedJournalId));

        logger.warn(
            {
                event: "WAJ_ABORTED",
                journalId: normalizedJournalId,
                operationType: existing.operationType,
                userId: existing.userId,
                referenceId: existing.referenceId,
                reason: reason || "UNSPECIFIED",
            },
            "WAJ_ABORTED"
        );
    }

    static async getUncommitted(limit = RECOVERY_BATCH_SIZE): Promise<Array<typeof writeAheadJournal.$inferSelect>> {
        return db
            .select()
            .from(writeAheadJournal)
            .where(eq(writeAheadJournal.status, "PREPARED"))
            .orderBy(asc(writeAheadJournal.createdAt), asc(writeAheadJournal.id))
            .limit(Math.max(1, limit));
    }

    static async recoverUncommitted(): Promise<{ scanned: number; committed: number; aborted: number; sequenceMissing: number }> {
        logger.warn(
            { event: "WAJ_RECOVERY_STARTED", batchSize: RECOVERY_BATCH_SIZE },
            "WAJ_RECOVERY_STARTED"
        );

        let scanned = 0;
        let committed = 0;
        let aborted = 0;
        let sequenceMissing = 0;

        while (true) {
            const batch = await this.getUncommitted(RECOVERY_BATCH_SIZE);
            if (batch.length === 0) break;

            for (const row of batch) {
                scanned += 1;
                const resolution = await this.resolveRecoveryOutcome(row);
                if (resolution.outcome === "COMMITTED") {
                    if (resolution.ledgerSequences.length === 0) {
                        sequenceMissing += 1;
                        logger.error(
                            {
                                event: "WAJ_RECOVERY_SEQUENCE_MISSING",
                                journalId: row.journalId,
                                operationType: row.operationType,
                                userId: row.userId,
                                referenceId: row.referenceId,
                            },
                            "WAJ_RECOVERY_SEQUENCE_MISSING"
                        );
                        await this.abort(row.journalId, undefined, "RECOVERY_SEQUENCE_MISSING");
                        aborted += 1;
                        continue;
                    }

                    await this.commit(row.journalId, undefined, {
                        ledgerSequences: resolution.ledgerSequences,
                        mutationMeta: { recovered: true },
                    });
                    committed += 1;
                } else {
                    await this.abort(row.journalId, undefined, "RECOVERY_ABORT");
                    aborted += 1;
                    logger.error(
                        {
                            event: "UNCOMMITTED_FINANCIAL_INTENT_DETECTED",
                            journalId: row.journalId,
                            operationType: row.operationType,
                            userId: row.userId,
                            referenceId: row.referenceId,
                        },
                        "UNCOMMITTED_FINANCIAL_INTENT_DETECTED"
                    );
                }
            }

            if (batch.length < RECOVERY_BATCH_SIZE) break;
        }

        logger.warn(
            {
                event: "WAJ_RECOVERY_COMPLETED",
                scanned,
                committed,
                aborted,
                sequenceMissing,
            },
            "WAJ_RECOVERY_COMPLETED"
        );

        return { scanned, committed, aborted, sequenceMissing };
    }

    private static async resolveRecoveryOutcome(
        row: typeof writeAheadJournal.$inferSelect
    ): Promise<RecoveryResolution> {
        const payloadIdempotencyKeys = extractIdempotencyKeys(row.payload);
        if (payloadIdempotencyKeys.length > 0) {
            const ledgerRows = await db
                .select({
                    globalSequence: ledgerEntries.globalSequence,
                    idempotencyKey: ledgerEntries.idempotencyKey,
                })
                .from(ledgerEntries)
                .where(inArray(ledgerEntries.idempotencyKey, payloadIdempotencyKeys));

            const foundKeys = new Set(
                ledgerRows
                    .map((item) => String(item.idempotencyKey || "").trim())
                    .filter(Boolean)
            );

            const allKeysResolved = payloadIdempotencyKeys.every((key) => foundKeys.has(key));
            const ledgerSequences = normalizeSequences(
                ledgerRows.map((entry) => Number(entry.globalSequence))
            );

            if (allKeysResolved && ledgerSequences.length > 0) {
                return { outcome: "COMMITTED", ledgerSequences };
            }

            if (ledgerSequences.length > 0 && !allKeysResolved) {
                return { outcome: "ABORTED", ledgerSequences: [] };
            }
        }

        switch (row.operationType) {
            case "TRADE_EXECUTION":
            case "LIQUIDATION":
            case "EXPIRY_SETTLEMENT": {
                const tradeRows = await db
                    .select({ id: trades.id })
                    .from(trades)
                    .where(eq(trades.orderId, row.referenceId));

                if (tradeRows.length === 0) {
                    return { outcome: "ABORTED", ledgerSequences: [] };
                }

                const tradeIds = tradeRows.map((trade) => trade.id);
                const ledgerRows = await db
                    .select({ globalSequence: ledgerEntries.globalSequence })
                    .from(ledgerEntries)
                    .where(inArray(ledgerEntries.referenceId, tradeIds));

                const ledgerSequences = normalizeSequences(
                    ledgerRows.map((entry) => Number(entry.globalSequence))
                );

                if (ledgerSequences.length === 0) {
                    return { outcome: "ABORTED", ledgerSequences: [] };
                }

                return { outcome: "COMMITTED", ledgerSequences };
            }

            case "LEDGER_ENTRY":
            case "MANUAL_ADJUSTMENT": {
                const ledgerRows = await db
                    .select({ globalSequence: ledgerEntries.globalSequence })
                    .from(ledgerEntries)
                    .where(eq(ledgerEntries.referenceId, row.referenceId));

                const ledgerSequences = normalizeSequences(
                    ledgerRows.map((entry) => Number(entry.globalSequence))
                );

                if (ledgerSequences.length === 0) {
                    return { outcome: "ABORTED", ledgerSequences: [] };
                }

                return { outcome: "COMMITTED", ledgerSequences };
            }

            default:
                return { outcome: "ABORTED", ledgerSequences: [] };
        }
    }
}

declare global {
    var __writeAheadJournalServiceInstance: typeof WriteAheadJournalService | undefined;
}
