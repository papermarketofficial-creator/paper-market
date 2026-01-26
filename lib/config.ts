import { z } from "zod";

// Load environment variables from .env file
// dotenv.config(); // REMOVED: Next.js loads env vars automatically, and dotenv uses process.cwd causing Edge Runtime errors


const envSchema = z.object({
    // Database (Neon)
    DATABASE_URL: z.string().url(),

    // Authentication (NextAuth)
    AUTH_SECRET: z.string().min(1),

    // Market Data (Upstox) - Optional for now, but good to have
    UPSTOX_API_KEY: z.string().optional(),
    UPSTOX_API_SECRET: z.string().optional(),
    UPSTOX_REDIRECT_URI: z.string().optional(),
    UPSTOX_ACCESS_TOKEN: z.string().optional(),

    // Market Data (TrueData)
    TRUEDATA_USER_ID: z.string().optional(),
    TRUEDATA_PASSWORD: z.string().optional(),

    // Environment
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // Rate Limiting (Upstash) - Optional for now
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

// Validate `process.env` against the schema
// The parse method will throw if validation fails, implementing the "Fail Fast" rule.
const env = envSchema.parse(process.env);

export const config = {
    env: env.NODE_ENV,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
    db: {
        url: env.DATABASE_URL,
    },
    auth: {
        secret: env.AUTH_SECRET,
    },
    upstox: {
        baseUrl: "https://api.upstox.com/v2",
        apiKey: env.UPSTOX_API_KEY,
        apiSecret: env.UPSTOX_API_SECRET,
        redirectUri: env.UPSTOX_REDIRECT_URI,
        accessToken: env.UPSTOX_ACCESS_TOKEN,
    },
    truedata: {
        baseUrl: "https://api.truedata.in",
        userId: env.TRUEDATA_USER_ID,
        password: env.TRUEDATA_PASSWORD,
    },
    redis: {
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
    },
} as const;
