/**
 * Step 2: Verify Token Consistency
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { orders, positions, instruments } from '../lib/db/schema';
import { sql, eq } from 'drizzle-orm';

async function main() {
    console.log('🔍 Verifying Token Consistency...\n');

    // Orders: Token Symbol vs Order Symbol
    const mismatchedOrders = await db.execute(sql`
        SELECT o.id, o.symbol as orderSymbol, i.tradingsymbol as tokenSymbol, o."instrumentToken"
        FROM orders o
        JOIN instruments i ON o."instrumentToken" = i."instrumentToken"
        WHERE o.symbol != i.tradingsymbol
    `);

    if (mismatchedOrders.rows.length > 0) {
        console.error('❌ Mismatched Orders Found (Symbol != TokenSymbol)!');
        console.table(mismatchedOrders.rows);
    } else {
        console.log('✅ All Orders Consistent.');
    }

    // Positions
    const mismatchedPositions = await db.execute(sql`
        SELECT p.id, p.symbol as posSymbol, i.tradingsymbol as tokenSymbol, p."instrumentToken"
        FROM positions p
        JOIN instruments i ON p."instrumentToken" = i."instrumentToken"
        WHERE p.symbol != i.tradingsymbol
    `);

    if (mismatchedPositions.rows.length > 0) {
        console.error('❌ Mismatched Positions Found!');
        console.table(mismatchedPositions.rows);
    } else {
        console.log('✅ All Positions Consistent.');
    }

    process.exit(0);
}

main();
