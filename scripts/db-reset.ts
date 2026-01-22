
// Must define this BEFORE importing anything that uses process.env
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
// Mock AUTH_SECRET to bypass config validation
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "mock_secret_for_reset_only";

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function reset() {
    console.log("⚠️  Starting Database Hard Reset (Nuclear Option)...");

    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is missing. Please check .env.local");
        process.exit(1);
    }

    try {
        // "Nuclear" wipe: drops the entire public schema and recreates it.
        await db.execute(sql.raw('DROP SCHEMA public CASCADE;'));
        await db.execute(sql.raw('CREATE SCHEMA public;'));
        await db.execute(sql.raw('GRANT ALL ON SCHEMA public TO postgres;'));
        await db.execute(sql.raw('GRANT ALL ON SCHEMA public TO public;'));

        console.log("✅ Public schema recreated. Database is completely empty.");
    } catch (e: any) {
        console.error(`❌ Reset Failed: ${e.message}`);
        process.exit(1);
    }

    process.exit(0);
}

reset().catch((e) => {
    console.error("Reset failed:", e);
    process.exit(1);
});
