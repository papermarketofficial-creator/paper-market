
import { config } from 'dotenv';
import path from 'path';

// Load env files from root directory
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function checkTables() {
    try {
        const result = await db.execute(sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log("Tables in DB:", result.rows.map(r => r.table_name));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

checkTables();
