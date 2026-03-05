/**
 * Step 7: Verification Script
 * 
 * Simulates OrderService calls to verify:
 * 1. Strict Token Enforcement (Throws if missing)
 * 2. Position Merging (Same Token)
 * 3. Position Separation (Diff Token)
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { instruments, wallets, transactions, users, orders, positions } from '../lib/db/schema';
import { InstrumentRepository } from '../lib/instruments/repository';
import { OrderService } from '../services/order.service';
import { PositionService } from '../services/position.service';
import { eq, and } from 'drizzle-orm';

async function main() {
    console.log('🛡️ Phase-0 Token Verification\n');

    const TEST_USER_ID = 'user-token-test';
    
    // Setup User
    await db.insert(users)
        .values({ 
            id: TEST_USER_ID, 
            email: 'token-test@phase0.com',
            name: 'Token Tester',
            role: 'USER',
            plan: 'PRO'
        } as any)
        .onConflictDoNothing();

    // Reset Data
    await db.delete(orders).where(eq(orders.userId, TEST_USER_ID));
    await db.delete(positions).where(eq(positions.userId, TEST_USER_ID));
    await db.delete(transactions).where(eq(transactions.userId, TEST_USER_ID));
    
    // Init Repo
    await InstrumentRepository.getInstance().initialize();
    
    // Seed Prices for Safety Guards
    const { marketSimulation } = await import('../services/market-simulation.service');
    marketSimulation.setPrice('RELIANCE', 2500);
    marketSimulation.setPrice('NIFTY', 22000); // For futures underlying price check if any
    
    // Test 1: Fail without Token
    console.log('\n--- Test 1: Fail without Token ---');
    try {
        await OrderService.placeOrder(TEST_USER_ID, {
            symbol: 'RELIANCE',
            side: 'BUY',
            quantity: 1,
            orderType: 'MARKET'
        } as any);
        console.error('❌ Failed to throw on missing token!');
    } catch (e: any) {
        if (e.message?.includes('Instrument Token REQUIRED')) {
            console.log('✅ Correctly rejected missing token.');
        } else {
            console.error('❌ Threw wrong error:', e.message);
        }
    }

    // Get Valid Instrument
    const reliance = (await InstrumentRepository.getInstance().search('RELIANCE', 1))[0];
    if (!reliance) throw new Error('RELIANCE not found');
    console.log(`Using Token: ${reliance.instrumentToken} (${reliance.tradingsymbol})`);

    // Test 2: Equity Buy x2 (Merge)
    console.log('\n--- Test 2: Equity Buy x2 (Merge) ---');
    try {
        await OrderService.placeOrder(TEST_USER_ID, {
            symbol: reliance.tradingsymbol,
            instrumentToken: reliance.instrumentToken,
            side: 'BUY',
            quantity: 10,
            orderType: 'MARKET'
        } as any);
        
        await OrderService.placeOrder(TEST_USER_ID, {
            symbol: reliance.tradingsymbol,
            instrumentToken: reliance.instrumentToken,
            side: 'BUY',
            quantity: 5,
            orderType: 'MARKET'
        } as any);
    } catch (e: any) {
        console.error('❌ Error testing Eq Buy:', e);
        if (e.stack) console.error(e.stack);
    }

    // Verify Position
    const pos = await db.select().from(positions).where(eq(positions.userId, TEST_USER_ID));
    if (pos.length === 1 && pos[0].quantity === 15) {
        console.log(`✅ Positions Merged: ${pos[0].quantity} Qty`);
    } else {
        console.error('❌ Position Merge Failed:', pos);
    }

    // Test 3: Derivatives Separation
    console.log('\n--- Test 3: Derivatives Separation ---');
    const futures = InstrumentRepository.getInstance().getFutures('NIFTY');
    if (futures.length >= 2) {
        const fut1 = futures[0];
        const fut2 = futures[1];
        console.log(`Fut1: ${fut1.tradingsymbol} (${fut1.instrumentToken})`);
        console.log(`Fut2: ${fut2.tradingsymbol} (${fut2.instrumentToken})`);

        // Seed prices for futures to skip NO_LIVE_PRICE check
        marketSimulation.setPrice(fut1.tradingsymbol, 22100);
        marketSimulation.setPrice(fut2.tradingsymbol, 22200);

        await OrderService.placeOrder(TEST_USER_ID, {
            symbol: fut1.tradingsymbol,
            instrumentToken: fut1.instrumentToken,
            side: 'BUY',
            quantity: 50,
            orderType: 'MARKET'
        } as any);

        await OrderService.placeOrder(TEST_USER_ID, {
            symbol: fut2.tradingsymbol,
            instrumentToken: fut2.instrumentToken,
            side: 'BUY',
            quantity: 50,
            orderType: 'MARKET'
        } as any);

        const positionsAll = await db.select().from(positions).where(eq(positions.userId, TEST_USER_ID));
        const derivativePos = positionsAll.filter(p => p.instrumentToken !== reliance.instrumentToken);
        
        if (derivativePos.length === 2) {
            console.log('✅ Different Expiries Created Separate Positions');
        } else {
            console.error('❌ Derivatives Merge Failed (Should be separate):', derivativePos);
        }
    } else {
        console.warn('⚠️ Not enough futures found for Test 3');
    }

    console.log('\n🛡️ verification Complete');
    process.exit(0);
}

main();
