/**
 * Check Trades Token Population
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { trades } from '../lib/db/schema';
import { isNull, sql } from 'drizzle-orm';

async function main() {
    console.log('🔍 Checking TRADES token population...\n');

    const tradesNull = await db.select({ count: sql<number>`count(*)` })
        .from(trades)
        .where(isNull(trades.instrumentToken));
    console.log(`Trades with NULL token: ${tradesNull[0].count}`);

    process.exit(0);
}

main();
