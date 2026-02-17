/**
 * Step 0: Pre-Migration Audit Script
 * 
 * Validates data integrity before InstrumentToken migration.
 * 1. Checks for duplicate tradingsymbols in instruments.
 * 2. Counts orphaned orders/positions (symbols not in instruments).
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { instruments, orders, positions } from '../lib/db/schema';
import { eq, sql, isNull } from 'drizzle-orm';

async function main() {
    console.log('🔍 Step 0: Pre-Migration Audit\n');
    let conflicts = 0;

    // 1. Check for Duplicate Symbols
    console.log('--- 1. Instruments: Duplicate Symbols ---');
    const duplicateSymbols = await db.execute(sql`
        SELECT tradingsymbol, COUNT(*) 
        FROM instruments 
        WHERE "isActive" = true 
        GROUP BY tradingsymbol 
        HAVING COUNT(*) > 1
    `);

    if (duplicateSymbols.rows.length > 0) {
        console.error('❌ CRITICAL: Duplicate symbols found in active instruments!');
        console.table(duplicateSymbols.rows);
        conflicts++;
    } else {
        console.log('✅ Unique symbols verified.');
    }

    // 2. Orders Audit
    console.log('\n--- 2. Orders Audit ---');
    const ordersCount = await db.select({ count: sql<number>`count(*)` }).from(orders);
    const totalOrders = Number(ordersCount[0].count);
    console.log(`Total Orders: ${totalOrders}`);

    if (totalOrders > 0) {
        // Find orders with unknown symbols
        const orphanOrders = await db.execute(sql`
            SELECT o.symbol, COUNT(*) as count
            FROM orders o
            LEFT JOIN instruments i ON o.symbol = i.tradingsymbol
            WHERE i.tradingsymbol IS NULL
            GROUP BY o.symbol
        `);

        if (orphanOrders.rows.length > 0) {
            console.error('❌ CRITICAL: Orders with unknown symbols found!');
            console.table(orphanOrders.rows);
            conflicts++;
        } else {
            console.log('✅ All orders map to an instrument.');
        }

        // Simlulate Backfill
        const matchingOrders = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM orders o
            JOIN instruments i ON o.symbol = i.tradingsymbol
        `);
        console.log(`Matched Orders for Backfill: ${matchingOrders.rows[0].count} / ${totalOrders}`);
    }

    // 3. Positions Audit
    console.log('\n--- 3. Positions Audit ---');
    const positionsCount = await db.select({ count: sql<number>`count(*)` }).from(positions);
    const totalPositions = Number(positionsCount[0].count);
    console.log(`Total Positions: ${totalPositions}`);

    if (totalPositions > 0) {
        // Find positions with unknown symbols
        const orphanPositions = await db.execute(sql`
            SELECT p.symbol, COUNT(*) as count
            FROM positions p
            LEFT JOIN instruments i ON p.symbol = i.tradingsymbol
            WHERE i.tradingsymbol IS NULL
            GROUP BY p.symbol
        `);

        if (orphanPositions.rows.length > 0) {
            console.error('❌ CRITICAL: Positions with unknown symbols found!');
            console.table(orphanPositions.rows);
            conflicts++;
        } else {
            console.log('✅ All positions map to an instrument.');
        }
    }

    console.log('\n--------------------------------');
    if (conflicts > 0) {
        console.error('🛑 AUDIT FAILED: Do NOT proceed with migration.');
        process.exit(1);
    } else {
        console.log('✅ AUDIT PASSED: Safe to proceed with backfill.');
        process.exit(0);
    }
}

main();
