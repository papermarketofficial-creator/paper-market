import { z } from "zod";

export const InstrumentSearchSchema = z.object({
    q: z.string().min(1, "Search query is required").max(50, "Query too long"),
    type: z.enum(["EQUITY", "FUTURES", "OPTIONS", "INDICES"]).optional(),
    limit: z.coerce.number().min(1).max(50).default(10),
});

export type InstrumentSearchInput = z.infer<typeof InstrumentSearchSchema>;
