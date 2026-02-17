import { z } from "zod";

export const OptionStrategyTypeEnum = z.enum([
    "STRADDLE",
    "STRANGLE",
    "IRON_CONDOR",
    "BULL_CALL_SPREAD",
    "BEAR_PUT_SPREAD",
]);

const BaseStrategySchema = z.object({
    strategy: OptionStrategyTypeEnum,
    underlying: z
        .string()
        .trim()
        .min(2, "Underlying is required")
        .max(32, "Underlying is too long")
        .transform((value) => value.toUpperCase()),
    expiry: z
        .string()
        .trim()
        .min(8, "Expiry is required"),
    lots: z
        .number()
        .int("Lots must be an integer")
        .positive("Lots must be positive")
        .max(1000, "Lots too large"),
});

const StraddleSchema = BaseStrategySchema.extend({
    strategy: z.literal("STRADDLE"),
    strikes: z.object({
        centerStrike: z.number().positive(),
    }),
});

const StrangleSchema = BaseStrategySchema.extend({
    strategy: z.literal("STRANGLE"),
    strikes: z.object({
        putStrike: z.number().positive(),
        callStrike: z.number().positive(),
    }).refine((value) => value.putStrike < value.callStrike, {
        message: "Strangle requires putStrike < callStrike",
        path: ["callStrike"],
    }),
});

const IronCondorSchema = BaseStrategySchema.extend({
    strategy: z.literal("IRON_CONDOR"),
    strikes: z.object({
        putLongStrike: z.number().positive(),
        putShortStrike: z.number().positive(),
        callShortStrike: z.number().positive(),
        callLongStrike: z.number().positive(),
    }).refine(
        (value) =>
            value.putLongStrike < value.putShortStrike &&
            value.putShortStrike < value.callShortStrike &&
            value.callShortStrike < value.callLongStrike,
        {
            message:
                "Iron Condor requires putLong < putShort < callShort < callLong",
            path: ["callLongStrike"],
        }
    ),
});

const BullCallSpreadSchema = BaseStrategySchema.extend({
    strategy: z.literal("BULL_CALL_SPREAD"),
    strikes: z.object({
        longCallStrike: z.number().positive(),
        shortCallStrike: z.number().positive(),
    }).refine((value) => value.longCallStrike < value.shortCallStrike, {
        message: "Bull Call Spread requires longCallStrike < shortCallStrike",
        path: ["shortCallStrike"],
    }),
});

const BearPutSpreadSchema = BaseStrategySchema.extend({
    strategy: z.literal("BEAR_PUT_SPREAD"),
    strikes: z.object({
        longPutStrike: z.number().positive(),
        shortPutStrike: z.number().positive(),
    }).refine((value) => value.longPutStrike > value.shortPutStrike, {
        message: "Bear Put Spread requires longPutStrike > shortPutStrike",
        path: ["shortPutStrike"],
    }),
});

export const OptionStrategyPreviewSchema = z.discriminatedUnion("strategy", [
    StraddleSchema,
    StrangleSchema,
    IronCondorSchema,
    BullCallSpreadSchema,
    BearPutSpreadSchema,
]);

export const OptionStrategyExecuteSchema = z.intersection(OptionStrategyPreviewSchema, z.object({
    clientOrderKey: z
        .string()
        .trim()
        .min(8, "clientOrderKey is required")
        .max(64, "clientOrderKey is too long"),
}));

export type OptionStrategyPreviewInput = z.infer<typeof OptionStrategyPreviewSchema>;
export type OptionStrategyExecuteInput = z.infer<typeof OptionStrategyExecuteSchema>;
export type OptionStrategyType = z.infer<typeof OptionStrategyTypeEnum>;
