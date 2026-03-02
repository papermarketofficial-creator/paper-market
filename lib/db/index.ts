import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";
import { logger } from "../logger";

function shouldEnableSsl(databaseUrl: string): boolean {
    return databaseUrl.toLowerCase().includes("neon.tech");
}

// Use standard node-postgres Pool
// This supports transactions perfectly and works in standard Node.js environments
const databaseUrl = config.db.url;
const useSsl = shouldEnableSsl(databaseUrl);

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: true } : false,
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
