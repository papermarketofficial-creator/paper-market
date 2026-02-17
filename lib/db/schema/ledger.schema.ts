import {
    bigserial,
    check,
    index,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { users } from "./users.schema";

export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
    "CASH",
    "MARGIN_BLOCKED",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "FEES",
]);

export const ledgerReferenceTypeEnum = pgEnum("ledger_reference_type", [
    "TRADE",
    "ORDER",
    "LIQUIDATION",
    "EXPIRY",
    "ADJUSTMENT",
]);

export const ledgerAccounts = pgTable(
    "ledger_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
        accountType: ledgerAccountTypeEnum("accountType").notNull(),
        createdAt: timestamp("createdAt").notNull().defaultNow(),
    },
    (t) => ({
        userIdx: index("ledger_accounts_userId_idx").on(t.userId),
        accountTypeIdx: index("ledger_accounts_accountType_idx").on(t.accountType),
        userAccountTypeUnique: uniqueIndex("ledger_accounts_userId_accountType_unique").on(
            t.userId,
            t.accountType
        ),
    })
);

export const ledgerEntries = pgTable(
    "ledger_entries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        globalSequence: bigserial("globalSequence", { mode: "number" }).notNull(),
        debitAccountId: uuid("debitAccountId")
            .notNull()
            .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
        creditAccountId: uuid("creditAccountId")
            .notNull()
            .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
        amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
        currency: varchar("currency", { length: 3 }).notNull().default("INR"),
        referenceType: ledgerReferenceTypeEnum("referenceType").notNull(),
        referenceId: text("referenceId").notNull(),
        idempotencyKey: text("idempotencyKey").notNull(),
        createdAt: timestamp("createdAt").notNull().defaultNow(),
    },
    (t) => ({
        debitIdx: index("ledger_entries_debit_idx").on(t.debitAccountId),
        creditIdx: index("ledger_entries_credit_idx").on(t.creditAccountId),
        referenceIdx: index("ledger_entries_reference_idx").on(t.referenceType, t.referenceId),
        globalSequenceIdx: index("ledger_entries_globalSequence_idx").on(t.globalSequence),
        globalSequenceUnique: uniqueIndex("ledger_entries_globalSequence_unique").on(t.globalSequence),
        idempotencyKeyUnique: uniqueIndex("ledger_entries_idempotencyKey_unique").on(t.idempotencyKey),
        amountPositive: check("ledger_entries_amount_positive", sql`${t.amount} > 0`),
        noSelfTransfer: check("ledger_entries_no_self_transfer", sql`${t.debitAccountId} <> ${t.creditAccountId}`),
    })
);

export type LedgerAccount = InferSelectModel<typeof ledgerAccounts>;
export type NewLedgerAccount = InferInsertModel<typeof ledgerAccounts>;
export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;
export type NewLedgerEntry = InferInsertModel<typeof ledgerEntries>;
export type LedgerAccountType = typeof ledgerAccountTypeEnum.enumValues[number];
export type LedgerReferenceType = typeof ledgerReferenceTypeEnum.enumValues[number];
