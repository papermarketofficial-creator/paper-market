import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";
import { logger } from "../logger";

function withVerifyFullSslMode(databaseUrl: string): string {
    if (!databaseUrl) return databaseUrl;
    try {
        const parsed = new URL(databaseUrl);
        parsed.searchParams.set("sslmode", "verify-full");
        return parsed.toString();
    } catch {
        const joiner = databaseUrl.includes("?") ? "&" : "?";
        if (databaseUrl.includes("sslmode=")) {
            return databaseUrl.replace(/sslmode=[^&]*/i, "sslmode=verify-full");
        }
        return `${databaseUrl}${joiner}sslmode=verify-full`;
    }
}

// Use standard node-postgres Pool
// This supports transactions perfectly and works in standard Node.js environments
const pool = new Pool({
    connectionString: withVerifyFullSslMode(config.db.url),
    // Note: We deliberately rely on the connection string or system certs
    // Never use rejectUnauthorized: false in production
});

// Initialize Drizzle with the schema
export const db = drizzle(pool, {
    schema,
    logger: config.isDev // Log queries in dev mode
});

// Simple connectivity check (can be used in health checks)
export async function checkDbConnection() {
    try {
        await pool.query('SELECT 1');
        logger.info("Database connection established successfully.");
        return true;
    } catch (error) {
        logger.error({ err: error }, "Failed to connect to the database.");
        return false;
    }
}
