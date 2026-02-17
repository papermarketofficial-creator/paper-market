/**
 * Add test F&O instruments for validation
 * Uses Upstox search API to find real instruments
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { instruments } from '../lib/db/schema/index.js';
import { UpstoxService } from '../services/upstox.service.js';

async function addTestInstruments() {
    console.log('\n🧪 Adding Test F&O Instruments\n');
    console.log('='.repeat(60));
    
    try {
        // Search for NIFTY futures
        console.log('\n1️⃣ Searching for NIFTY futures...');
        const niftyResults = await UpstoxService.searchInstruments('NIFTY');
        
        console.log(`   Found ${niftyResults.length} results for NIFTY`);
        
        // Filter for futures only
        const futures = niftyResults.filter((inst: any) => 
            inst.instrument_type === 'FUT' || 
            inst.instrument_type === 'FUTURE' ||
            (inst.instrument_key && inst.instrument_key.includes('FUT'))
        );
        
        console.log(`   Filtered to ${futures.length} futures contracts`);
        
        if (futures.length > 0) {
            console.log('\n   Sample futures found:');
            futures.slice(0, 5).forEach((f: any, i: number) => {
                console.log(`     ${i + 1}. ${f.trading_symbol || f.tradingsymbol} (${f.instrument_key})`);
            });
        }
        
        // Add the first 3 futures to database
        console.log('\n2️⃣ Adding test futures to database...');
        
        let added = 0;
        for (const future of futures.slice(0, 3)) {
            try {
                await db.insert(instruments).values({
                    instrumentToken: future.instrument_key,
                    exchangeToken: future.exchange_token || '',
                    tradingsymbol: future.trading_symbol || future.tradingsymbol,
                    name: future.name || future.trading_symbol || future.tradingsymbol,
                    expiry: future.expiry ? new Date(future.expiry) : null,
                    strike: null,
                    tickSize: future.tick_size || '0.05',
                    lotSize: parseInt(future.lot_size) || 50,
                    instrumentType: 'FUTURE',
                    segment: 'NSE_FO',
                    exchange: future.exchange || 'NSE',
                    isActive: true,
                }).onConflictDoNothing();
                
                console.log(`   ✅ Added: ${future.trading_symbol || future.tradingsymbol}`);
                added++;
            } catch (err: any) {
                console.error(`   ⚠️  Error adding ${future.trading_symbol}:`, err.message);
            }
        }
        
        console.log(`\n   Total added: ${added} futures`);
        
        // Verify
        console.log('\n3️⃣ Verifying database...');
        const [foCount] = await db.execute(
            db.select().from(instruments).where(instruments.segment.eq('NSE_FO')).$dynamic()
        );
        
        console.log(`   NSE_FO instruments in database: ${foCount?.length || 0}`);
        
        console.log('\n' + '='.repeat(60));
        
        if (added > 0) {
            console.log('\n✅ Test instruments added successfully!');
            console.log('\n📋 Next Steps:');
            console.log('   1. Start market-engine');
            console.log('   2. Subscribe to one of these futures');
            console.log('   3. Verify ticks are being received');
            console.log('   4. Check tick freshness (<60s)');
            console.log('   5. Test order placement\n');
        } else {
            console.log('\n⚠️  No instruments were added.');
            console.log('   The search API may not have returned F&O instruments.');
            console.log('   You may need to use authenticated Upstox API.\n');
        }
        
        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

addTestInstruments();
