/**
 * Check migration status
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { orders, trades, positions } from '../lib/db/schema/index.js';
import { isNull, sql } from 'drizzle-orm';

async function checkStatus() {
    console.log('\n📊 Migration Status Check\n');
    console.log('='.repeat(50));
    
    // Count total records
    const [totalOrders] = await db.select({ count: sql<number>`count(*)` }).from(orders);
    const [totalTrades] = await db.select({ count: sql<number>`count(*)` }).from(trades);
    const [totalPositions] = await db.select({ count: sql<number>`count(*)` }).from(positions);
    
    console.log('\n📈 Total Records:');
    console.log(`   Orders: ${totalOrders.count}`);
    console.log(`   Trades: ${totalTrades.count}`);
    console.log(`   Positions: ${totalPositions.count}`);
    
    // Count NULL instrumentToken
    const [nullOrders] = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(isNull(orders.instrumentToken));
    
    const [nullTrades] = await db
        .select({ count: sql<number>`count(*)` })
        .from(trades)
        .where(isNull(trades.instrumentToken));
    
    const [nullPositions] = await db
        .select({ count: sql<number>`count(*)` })
        .from(positions)
        .where(isNull(positions.instrumentToken));
    
    console.log('\n⚠️  Records with NULL instrumentToken:');
    console.log(`   Orders: ${nullOrders.count}`);
    console.log(`   Trades: ${nullTrades.count}`);
    console.log(`   Positions: ${nullPositions.count}`);
    
    // Sample records
    console.log('\n📋 Sample Records:');
    const [sampleOrder] = await db.select().from(orders).limit(1);
    const [sampleTrade] = await db.select().from(trades).limit(1);
    const [samplePosition] = await db.select().from(positions).limit(1);
    
    if (sampleOrder) {
        console.log(`\n   Order: ${sampleOrder.symbol} - instrumentToken: ${sampleOrder.instrumentToken || 'NULL'}`);
    }
    if (sampleTrade) {
        console.log(`   Trade: ${sampleTrade.symbol} - instrumentToken: ${sampleTrade.instrumentToken || 'NULL'}`);
    }
    if (samplePosition) {
        console.log(`   Position: ${samplePosition.symbol} - instrumentToken: ${samplePosition.instrumentToken || 'NULL'}`);
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (nullOrders.count === 0 && nullTrades.count === 0 && nullPositions.count === 0) {
        console.log('\n✅ Migration successful - all records have instrumentToken!\n');
    } else {
        console.log('\n⚠️  Migration incomplete - some records need backfill\n');
    }
    
    process.exit(0);
}

checkStatus().catch(console.error);
