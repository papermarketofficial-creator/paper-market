import { z } from "zod";

export const OptionChainSchema = z.object({
    symbol: z.string().min(1, "Symbol is required").max(20).toUpperCase(),
    expiry: z.string().optional(), // ISO date string optional
});

export type OptionChainInput = z.infer<typeof OptionChainSchema>;
