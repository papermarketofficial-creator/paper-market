/**
 * Check DB Constraints directly
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('🔍 Checking DB constraints...\n');

    // Check if instrumentToken is nullable in orders
    const ordersCol = await db.execute(sql`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'instrumentToken'
    `);
    console.log(`Orders instrumentToken Nullable: ${ordersCol.rows[0]?.is_nullable}`);

    // Check unique index on positions
    const posIndex = await db.execute(sql`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'positions' 
        AND indexname LIKE '%unique%'
    `);
    console.table(posIndex.rows);

    process.exit(0);
}

main();
