import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "../config";
import * as schema from "./schema";
import { logger } from "../logger";

// Configure Neon to use fetch (standard in Next.js Edge/Serverless)
// neonConfig.fetchConnectionCache = true; // Recommended for serverless

const sql = neon(config.db.url);

// Initialize Drizzle with the schema
export const db = drizzle(sql, {
    schema,
    logger: config.isDev // Log queries in dev mode
});

// Simple connectivity check (can be used in health checks)
export async function checkDbConnection() {
    try {
        // @ts-ignore - '1' is valid sql
        await sql`SELECT 1`;
        logger.info("Database connection established successfully.");
        return true;
    } catch (error) {
        logger.error({ err: error }, "Failed to connect to the database.");
        return false;
    }
}
