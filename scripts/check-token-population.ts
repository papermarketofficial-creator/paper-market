/**
 * Step 1 Check: Is instrumentToken populated?
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { orders, positions } from '../lib/db/schema';
import { isNull, sql } from 'drizzle-orm';

async function main() {
    console.log('🔍 Checking token population...\n');

    // Orders
    const ordersNull = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(isNull(orders.instrumentToken));
    console.log(`Orders with NULL token: ${ordersNull[0].count}`);

    // Positions
    const posNull = await db.select({ count: sql<number>`count(*)` })
        .from(positions)
        .where(isNull(positions.instrumentToken));
    console.log(`Positions with NULL token: ${posNull[0].count}`);

    process.exit(0);
}

main();
