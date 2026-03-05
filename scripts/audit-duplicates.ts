/**
 * Audit Duplicates Script
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { instruments } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
    console.log('🔍 Auditing Duplicates...\n');

    const results = await db.execute(sql`
        SELECT DISTINCT "instrumentType" FROM instruments WHERE "isActive" = true
    `);
    console.log(JSON.stringify(results.rows, null, 2));
    process.exit(0);
}

main();
