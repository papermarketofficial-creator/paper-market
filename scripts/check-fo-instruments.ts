/**
 * Check F&O Instruments
 * Validates that NSE_FO instruments are correctly populated in the database.
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { instruments } from '../lib/db/schema/index.js';
import { sql } from 'drizzle-orm';

async function checkFOInstruments() {
    console.log('\n🔍 Checking for F&O Instruments\n');
    console.log('='.repeat(60));
    
    try {
        // 1. Check counts by segment
        console.log('\n📊 Instruments by Segment:');
        const segmentCounts = await db
            .select({
                segment: instruments.segment,
                count: sql<number>`count(*)`,
            })
            .from(instruments)
            .groupBy(instruments.segment);
            
        segmentCounts.forEach(row => {
            console.log(`   ${row.segment}: ${Number(row.count).toLocaleString()}`);
        });

        // 2. Check counts by type (Normalized)
        console.log('\n📊 Instruments by Type (Normalized):');
        const typeCounts = await db
            .select({
                type: instruments.instrumentType,
                count: sql<number>`count(*)`,
            })
            .from(instruments)
            .groupBy(instruments.instrumentType);
            
        typeCounts.forEach(row => {
            console.log(`   ${row.type}: ${Number(row.count).toLocaleString()}`);
        });

        // 3. Sample Futures
        console.log('\n🧪 Sample Futures (NSE_FO):');
        const futures = await db
            .select()
            .from(instruments)
            .where(sql`"segment" = 'NSE_FO' AND ("instrumentType" = 'FUTURE' OR "instrumentType" = 'FUT')`)
            .limit(5);
            
        if (futures.length > 0) {
            futures.forEach(f => {
                console.log(`   ${f.tradingsymbol} (${f.expiry?.toISOString().split('T')[0]}) - ${f.instrumentType}`);
            });
        } else {
            console.log('   ⚠️  No futures found.');
        }

        // 4. Sample Options
        console.log('\n🧪 Sample Options (NSE_FO):');
        const options = await db
            .select()
            .from(instruments)
            .where(sql`"segment" = 'NSE_FO' AND ("instrumentType" = 'OPTION' OR "instrumentType" = 'CE' OR "instrumentType" = 'PE')`)
            .limit(5);
            
        if (options.length > 0) {
            options.forEach(o => {
                console.log(`   ${o.tradingsymbol} ${o.strike} ${o.instrumentType}`);
            });
        } else {
            console.log('   ⚠️  No options found.');
        }

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Check failed:', error.message);
        process.exit(1);
    }
}

checkFOInstruments();
