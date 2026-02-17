/**
 * Instrument Sync CLI Script
 * 
 * Usage:
 *   npx tsx scripts/sync-instruments.ts
 */

import 'dotenv/config';
import { syncInstruments } from '../lib/instruments/instrument-sync.service';
import { db } from '../lib/db';
import { instruments } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('  INSTRUMENT SYNC - Upstox Master Data');
    console.log('='.repeat(70));
    console.log('');

    try {
        // Show pre-sync stats
        console.log('📊 Pre-Sync Database State:\n');
        const preStats = await getInstrumentStats();
        displayStats(preStats);

        // Run sync
        console.log('\n🔄 Starting sync...\n');
        
        // syncInstruments now returns a full SyncReport
        const report = await syncInstruments();
        
        // Show results
        console.log('\n' + '='.repeat(70));
        console.log('  SYNC COMPLETE');
        console.log('='.repeat(70));
        console.log('');
        console.log('📈 Sync Report:');
        console.log('');
        
        // Use safe access to prevent crashes if a field is missing (though service ensures type safety)
        const total = (report.totalProcessed ?? 0).toLocaleString();
        const upserted = (report.upserted ?? 0).toLocaleString();
        const updated = (report.updated ?? 0).toLocaleString();
        const deactivated = (report.deactivated ?? 0).toLocaleString();
        const errors = (report.errors ?? 0).toLocaleString();
        const durationSec = ((report.duration ?? 0) / 1000).toFixed(2);

        console.log(`   Total Processed:  ${total}`);
        console.log(`   Upserted (Valid): ${upserted} (Includes updates)`);
        console.log(`   Deactivated:      ${deactivated}`);
        console.log(`   Skipped/Invalid:  ${errors}`);
        console.log(`   Duration:         ${durationSec}s`);
        console.log('');

        // Show post-sync stats
        console.log('📊 Post-Sync Database State:\n');
        const postStats = await getInstrumentStats();
        displayStats(postStats);

        // Show segment breakdown
        console.log('\n📋 Instruments by Segment (Active):\n');
        const segmentStats = await getSegmentStats();
        segmentStats.forEach(stat => {
            console.log(`   ${(stat.segment || 'Unknown').padEnd(20)}: ${Number(stat.count).toLocaleString()}`);
        });

        // Validation checks
        console.log('\n✅ Validation Checks:\n');
        
        const [foCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(instruments)
            .where(sql`segment = 'NSE_FO' AND "isActive" = true`);
        
        const foTotal = Number(foCount.count);
        
        if (foTotal > 1000) {
            console.log(`   ✅ NSE_FO: ${foTotal.toLocaleString()} instruments`);
        } else {
            console.log(`   ⚠️  NSE_FO: Only ${foTotal.toLocaleString()} instruments (expected thousands)`);
        }

        const [eqCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(instruments)
            .where(sql`segment = 'NSE_EQ' AND "isActive" = true`);
        
        const eqTotal = Number(eqCount.count);
        
        if (eqTotal > 100) {
            console.log(`   ✅ NSE_EQ: ${eqTotal.toLocaleString()} instruments`);
        } else {
            console.log(`   ⚠️  NSE_EQ: Only ${eqTotal.toLocaleString()} instruments`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('');
        console.log('✅ Sync completed successfully!\n');
        
        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Sync failed:', error.message);
        console.error(error);
        console.log('');
        process.exit(1);
    }
}

async function getInstrumentStats() {
    const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(instruments);
    
    const [active] = await db
        .select({ count: sql<number>`count(*)` })
        .from(instruments)
        .where(sql`"isActive" = true`);
    
    const [inactive] = await db
        .select({ count: sql<number>`count(*)` })
        .from(instruments)
        .where(sql`"isActive" = false`);

    return {
        total: Number(total.count),
        active: Number(active.count),
        inactive: Number(inactive.count),
    };
}

async function getSegmentStats() {
    return await db
        .select({
            segment: instruments.segment,
            count: sql<number>`count(*)`,
        })
        .from(instruments)
        .where(sql`"isActive" = true`)
        .groupBy(instruments.segment)
        .orderBy(sql`count(*) DESC`);
}

function displayStats(stats: { total: number; active: number; inactive: number }) {
    console.log(`   Total:            ${stats.total.toLocaleString()}`);
    console.log(`   Active:           ${stats.active.toLocaleString()}`);
    console.log(`   Inactive:         ${stats.inactive.toLocaleString()}`);
}

main();
