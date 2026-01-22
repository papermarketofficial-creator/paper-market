
import { z } from "zod";

// Re-using enum values from schema/market.schema to ensure consistency
// We redefine them here as Zod enums for runtime validation.

const InstrumentTypeEnum = z.enum(["EQUITY", "FUTURE", "OPTION", "INDEX"]);
const SegmentEnum = z.enum(["NSE_EQ", "NSE_FO", "BSE_EQ", "MCX_FO"]);
const ExchangeEnum = z.enum(["NSE", "BSE", "MCX"]);

export const InstrumentSearchSchema = z.object({
    q: z
        .string()
        .trim()
        .min(1, { message: "Search query must be at least 1 character" })
        .max(50, { message: "Search query cannot exceed 50 characters" })
        .regex(/^[a-zA-Z0-9\s\-_]+$/, { message: "Search contains invalid characters" })
        .transform((val) => val.toUpperCase()),
});

export type InstrumentSearch = z.infer<typeof InstrumentSearchSchema>;

export const InstrumentLookupSchema = z.object({
    tradingsymbol: z
        .string()
        .trim()
        .min(2, { message: "Trading symbol too short" })
        .max(30, { message: "Trading symbol too long" })
        .transform((val) => val.toUpperCase()),
});

export type InstrumentLookup = z.infer<typeof InstrumentLookupSchema>;

export const InstrumentFilterSchema = z.object({
    segment: SegmentEnum.optional(),
    exchange: ExchangeEnum.optional(),
    instrument_type: InstrumentTypeEnum.optional(),
    expiry_from: z.string().datetime().optional(), // ISO string expectation
    expiry_to: z.string().datetime().optional(),
}).refine((data) => {
    if (data.expiry_from && data.expiry_to) {
        return new Date(data.expiry_from) <= new Date(data.expiry_to);
    }
    return true;
}, {
    message: "Expiry 'from' date must be before 'to' date",
    path: ["expiry_from"],
});

export type InstrumentFilter = z.infer<typeof InstrumentFilterSchema>;

export const AdminSyncTriggerSchema = z.object({
    force: z.boolean().default(false).optional(),
});

export type AdminSyncTrigger = z.infer<typeof AdminSyncTriggerSchema>;
