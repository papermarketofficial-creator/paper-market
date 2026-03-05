import {
    bigserial,
    index,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { users } from "./users.schema";

export const writeAheadOperationTypeEnum = pgEnum("write_ahead_operation_type", [
    "TRADE_EXECUTION",
    "LEDGER_ENTRY",
    "LIQUIDATION",
    "EXPIRY_SETTLEMENT",
    "MANUAL_ADJUSTMENT",
]);

export const writeAheadStatusEnum = pgEnum("write_ahead_status", [
    "PREPARED",
    "COMMITTED",
    "ABORTED",
]);

export const writeAheadJournal = pgTable(
    "write_ahead_journal",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        journalId: uuid("journalId").notNull(),
        createdAt: timestamp("createdAt").notNull().defaultNow(),
        operationType: writeAheadOperationTypeEnum("operationType").notNull(),
        status: writeAheadStatusEnum("status").notNull().default("PREPARED"),
        userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
        referenceId: text("referenceId").notNull(),
        payload: jsonb("payload").notNull(),
        checksum: text("checksum").notNull(),
        committedAt: timestamp("committedAt"),
    },
    (t) => ({
        journalIdUnique: uniqueIndex("write_ahead_journal_journalId_unique").on(t.journalId),
        createdAtIdx: index("write_ahead_journal_createdAt_idx").on(t.createdAt),
        statusIdx: index("write_ahead_journal_status_idx").on(t.status),
        userIdIdx: index("write_ahead_journal_userId_idx").on(t.userId),
    })
);

export type WriteAheadJournal = InferSelectModel<typeof writeAheadJournal>;
export type NewWriteAheadJournal = InferInsertModel<typeof writeAheadJournal>;
export type WriteAheadOperationType = typeof writeAheadOperationTypeEnum.enumValues[number];
export type WriteAheadStatus = typeof writeAheadStatusEnum.enumValues[number];

