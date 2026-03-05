/**
 * Migration verification and backfill script
 * Verifies instrumentToken columns exist and backfills data
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { orders, trades, positions, instruments } from '../lib/db/schema/index.js';
import { eq, and, isNull, sql } from 'drizzle-orm';

async function verifyAndBackfill() {
    console.log('🔍 Starting migration verification and backfill...\n');

    try {
        // Step 1: Check if columns exist
        console.log('1️⃣ Verifying schema changes...');
        const [sampleOrder] = await db.select().from(orders).limit(1);
        const [sampleTrade] = await db.select().from(trades).limit(1);
        const [samplePosition] = await db.select().from(positions).limit(1);
        
        console.log('✅ Schema verified - instrumentToken columns exist\n');

        // Step 2: Count records needing backfill
        console.log('2️⃣ Counting records needing backfill...');
        
        const [ordersCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(orders)
            .where(isNull(orders.instrumentToken));
        
        const [tradesCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(trades)
            .where(isNull(trades.instrumentToken));
        
        const [positionsCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(positions)
            .where(isNull(positions.instrumentToken));

        console.log(`   Orders needing backfill: ${ordersCount.count}`);
        console.log(`   Trades needing backfill: ${tradesCount.count}`);
        console.log(`   Positions needing backfill: ${positionsCount.count}\n`);

        // Step 3: Backfill orders
        if (Number(ordersCount.count) > 0) {
            console.log('3️⃣ Backfilling orders...');
            const result = await db.execute(sql`
                UPDATE orders o
                SET "instrumentToken" = i."instrumentToken"
                FROM instruments i
                WHERE i."tradingsymbol" = o.symbol
                  AND i."instrumentType" = 'EQUITY'
                  AND i.segment = 'NSE_EQ'
                  AND o."instrumentToken" IS NULL
            `);
            console.log(`✅ Backfilled ${result.rowCount} orders\n`);
        }

        // Step 4: Backfill trades
        if (Number(tradesCount.count) > 0) {
            console.log('4️⃣ Backfilling trades...');
            const result = await db.execute(sql`
                UPDATE trades t
                SET "instrumentToken" = i."instrumentToken"
                FROM instruments i
                WHERE i."tradingsymbol" = t.symbol
                  AND i."instrumentType" = 'EQUITY'
                  AND i.segment = 'NSE_EQ'
                  AND t."instrumentToken" IS NULL
            `);
            console.log(`✅ Backfilled ${result.rowCount} trades\n`);
        }

        // Step 5: Backfill positions
        if (Number(positionsCount.count) > 0) {
            console.log('5️⃣ Backfilling positions...');
            const result = await db.execute(sql`
                UPDATE positions p
                SET "instrumentToken" = i."instrumentToken"
                FROM instruments i
                WHERE i."tradingsymbol" = p.symbol
                  AND i."instrumentType" = 'EQUITY'
                  AND i.segment = 'NSE_EQ'
                  AND p."instrumentToken" IS NULL
            `);
            console.log(`✅ Backfilled ${result.rowCount} positions\n`);
        }

        // Step 6: Verify backfill
        console.log('6️⃣ Verifying backfill completion...');
        
        const [ordersNullCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(orders)
            .where(isNull(orders.instrumentToken));
        
        const [tradesNullCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(trades)
            .where(isNull(trades.instrumentToken));
        
        const [positionsNullCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(positions)
            .where(isNull(positions.instrumentToken));

        console.log(`   Orders with NULL instrumentToken: ${ordersNullCount.count}`);
        console.log(`   Trades with NULL instrumentToken: ${tradesNullCount.count}`);
        console.log(`   Positions with NULL instrumentToken: ${positionsNullCount.count}\n`);

        if (ordersNullCount.count === 0 && tradesNullCount.count === 0 && positionsNullCount.count === 0) {
            console.log('✅ All records backfilled successfully!\n');
        } else {
            console.log('⚠️  Some records could not be backfilled (likely no matching instrument)\n');
        }

        // Step 7: Update unique constraint on positions
        console.log('7️⃣ Updating positions unique constraint...');
        try {
            await db.execute(sql`DROP INDEX IF EXISTS "positions_userId_symbol_unique"`);
            await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "positions_userId_instrumentToken_unique" ON positions("userId", "instrumentToken")`);
            console.log('✅ Unique constraint updated\n');
        } catch (error) {
            console.log('⚠️  Constraint update failed (may already exist):', error.message, '\n');
        }

        // Step 8: Make columns NOT NULL (if all backfilled)
        if (ordersNullCount.count === 0 && tradesNullCount.count === 0 && positionsNullCount.count === 0) {
            console.log('8️⃣ Making instrumentToken columns NOT NULL...');
            try {
                await db.execute(sql`ALTER TABLE orders ALTER COLUMN "instrumentToken" SET NOT NULL`);
                await db.execute(sql`ALTER TABLE trades ALTER COLUMN "instrumentToken" SET NOT NULL`);
                await db.execute(sql`ALTER TABLE positions ALTER COLUMN "instrumentToken" SET NOT NULL`);
                console.log('✅ Columns set to NOT NULL\n');
            } catch (error) {
                console.log('⚠️  NOT NULL constraint failed:', error.message, '\n');
            }
        } else {
            console.log('⚠️  Skipping NOT NULL constraint (some records still have NULL values)\n');
        }

        console.log('🎉 Migration verification and backfill complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

verifyAndBackfill();
