
import { pgTable, serial, text, timestamp, integer, numeric, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel, sql } from 'drizzle-orm';

// Enums (handled as text with checks in logic or strict types, Drizzle native enum support is PG specific but text is safer for migration portability sometimes, using consts for reference)
export const InstrumentType = {
    EQUITY: "EQUITY",
    FUTURE: "FUTURE",
    OPTION: "OPTION",
    INDEX: "INDEX"
} as const;

export const OptionType = {
    CE: "CE",
    PE: "PE",
} as const;

export const Segment = {
    NSE_EQ: "NSE_EQ",
    NSE_FO: "NSE_FO",
    BSE_EQ: "BSE_EQ",
    MCX_FO: "MCX_FO"
} as const;

export const Exchange = {
    NSE: "NSE",
    BSE: "BSE",
    MCX: "MCX"
} as const;

export const SyncStatus = {
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    PARTIAL: "PARTIAL"
} as const;

export const instruments = pgTable('instruments', {
    instrumentToken: text('instrumentToken').primaryKey(), // Upstox Token
    exchangeToken: text('exchangeToken').notNull(),
    tradingsymbol: text('tradingsymbol').notNull(),
    name: text('name').notNull(),
    underlying: text('underlying'),
    expiry: timestamp('expiry'),
    strike: numeric('strike', { precision: 10, scale: 2 }),
    optionType: text('optionType'),
    tickSize: numeric('tickSize', { precision: 8, scale: 4 }).notNull().default('0.05'),
    lotSize: integer('lotSize').notNull().default(1),
    instrumentType: text('instrumentType').notNull(),
    segment: text('segment').notNull(),
    exchange: text('exchange').notNull(),
    isActive: boolean('isActive').notNull().default(true),
    lastSyncedAt: timestamp('lastSyncedAt'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => {
    return {
        // uniqueExchangeToken: uniqueIndex('uniqueExchangeToken').on(t.exchange, t.exchangeToken), // Removed to allow sync of overlapping exchange tokens
        idxSymbol: index('idxInstrumentsSymbol').on(t.tradingsymbol),
        idxName: index('idxInstrumentsName').on(t.name),
        idxUnderlying: index('idxInstrumentsUnderlying').on(t.underlying),
        idxExpiry: index('idxInstrumentsExpiry').on(t.expiry),
        idxSegment: index('idxInstrumentsSegment').on(t.segment),
        idxInstrumentType: index('idxInstrumentsType').on(t.instrumentType),
        idxOptionType: index('idxInstrumentsOptionType').on(t.optionType),
        idxIsActive: index('idxInstrumentsIsActive').on(t.isActive),
        idxLastSyncedAt: index('idxInstrumentsLastSyncedAt').on(t.lastSyncedAt),
    }
});

export const instrumentSyncLogs = pgTable('instrument_sync_logs', {
    id: serial('id').primaryKey(),
    syncDate: timestamp('syncDate', { mode: 'date' }).notNull().defaultNow(),
    status: text('status').notNull(),
    recordsProcessed: integer('recordsProcessed').notNull().default(0),
    startedAt: timestamp('startedAt').defaultNow(),
    completedAt: timestamp('completedAt'),
    errorMessage: text('errorMessage')
});

export type Instrument = InferSelectModel<typeof instruments>;
export type NewInstrument = InferInsertModel<typeof instruments>;

export type InstrumentSyncLog = InferSelectModel<typeof instrumentSyncLogs>;
export type NewInstrumentSyncLog = InferInsertModel<typeof instrumentSyncLogs>;
