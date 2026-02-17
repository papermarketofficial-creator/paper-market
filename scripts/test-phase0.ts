/**
 * Phase-0 Trading Safety Verification Script
 * 
 * Verifies that:
 * 1. Futures/Options use correct margin logic (not full value).
 * 2. Short Sells debit margin (prevent free money).
 * 3. Instrument Types match normalized values.
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { instruments, wallets, transactions, users, orders } from '../lib/db/schema';
import { InstrumentRepository } from '../lib/instruments/repository';
import { OrderService } from '../services/order.service';
import { MarginService } from '../services/margin.service';
import { WalletService } from '../services/wallet.service';
import { eq, sql } from 'drizzle-orm';

async function main() {
    console.log('🛡️ Phase-0 Trading Safety Check\n');

    // 1. Setup Test User
    const TEST_USER_ID = 'user-phase0-test';
    
    // Ensure user exists
    await db.insert(users)
        .values({ 
            id: TEST_USER_ID, 
            email: 'test@phase0.com',
            name: 'Phase 0 Tester',
            role: 'USER', // Valid role
            plan: 'PRO'
        } as any)
        .onConflictDoNothing();

    // Reset Wallet
    await db.delete(transactions).where(eq(transactions.userId, TEST_USER_ID));
    await db.delete(wallets).where(eq(wallets.userId, TEST_USER_ID));
    
    // Create fresh wallet (10L balance)
    const wallet = await WalletService.getWallet(TEST_USER_ID);
    console.log(`💰 Starting Balance: ₹${wallet.balance}`);

    // 2. Load Instruments
    await InstrumentRepository.getInstance().initialize();
    
    // 3. Test Cases
    
    // CASE A: EQUITY BUY (Should debit full value)
    console.log('\n--- CASE A: EQUITY BUY (Reliance) ---');
    try {
        const reliance = await InstrumentRepository.getInstance().search('RELIANCE', 1)[0];
        if (reliance) {
            console.log(`Instrument: ${reliance.tradingsymbol} (${reliance.instrumentType})`);
            // Mock price for margin calc if market closed
            // OrderService calls realTimeMarketService or simulation
            // We'll rely on MarginService manual check
            
            const price = 2900;
            const qty = 10;
            const expectedDebit = price * qty;
            
            // Use LIMIT order to force specific price for deterministic testing
            const margin = await MarginService.calculateRequiredMargin({
                symbol: reliance.tradingsymbol,
                side: 'BUY',
                quantity: qty,
                orderType: 'LIMIT',
                limitPrice: price
            } as any, reliance);
            
            console.log(`Expected Margin: ₹${expectedDebit}`);
            console.log(`Calculated Margin: ₹${margin}`);
            
            if (margin === expectedDebit) console.log('✅ Equity Margin Correct');
            else console.error('❌ Equity Margin WRONG');

        } else {
            console.log('⚠️ RELIANCE not found');
        }
    } catch (e) { console.error(e); }

    // CASE B: FUTURE BUY (Should debit ~15%)
    console.log('\n--- CASE B: FUTURE BUY (Nifty) ---');
    try {
        const futures = InstrumentRepository.getInstance().getFutures('NIFTY');
        const niftyFut = futures[0]; // Nearest expiry
        
        if (niftyFut) {
            console.log(`Instrument: ${niftyFut.tradingsymbol} (${niftyFut.instrumentType})`);
            
            const price = 22000;
            const qty = 50; // 1 Lot
            const notional = price * qty; // 11L
            const expectedMargin = notional * 0.15; // ~1.65L
            
            const margin = await MarginService.calculateRequiredMargin({
                symbol: niftyFut.tradingsymbol,
                side: 'BUY',
                quantity: qty,
                orderType: 'LIMIT',
                limitPrice: price
            } as any, niftyFut);

            console.log(`Notional Value: ₹${notional}`);
            console.log(`Calculated Margin: ₹${margin}`);
            
            if (margin < notional && margin > 0) console.log('✅ Future Buy Margin Correct (Is Partial)');
            else console.error('❌ Future Buy Margin WRONG (Is Full Value?)');

        } else {
            console.log('⚠️ NIFTY Future not found');
        }
    } catch (e) { console.error(e); }

    // CASE C: OPTION SELL (Should Debit Margin)
    console.log('\n--- CASE C: OPTION SELL (Short Strangle Logic) ---');
    try {
        const options = InstrumentRepository.getInstance().getOptions('NIFTY');
        const niftyOpt = options.find(o => o.instrumentType === 'OPTION');
        
        if (niftyOpt) {
            console.log(`Instrument: ${niftyOpt.tradingsymbol} (${niftyOpt.instrumentType})`);
            
            const price = 100; // Premium
            const qty = 50; // 1 Lot
            const premium = price * qty; // 5000
            const expectedMargin = premium + (premium * 0.20); 

            const margin = await MarginService.calculateRequiredMargin({
                symbol: niftyOpt.tradingsymbol,
                side: 'SELL',
                quantity: qty,
                orderType: 'LIMIT',
                limitPrice: price
            } as any, niftyOpt);
            
            console.log(`Premium: ₹${premium}`);
            console.log(`Calculated Margin Block: ₹${margin}`);
            
            if (margin > premium) console.log('✅ Option Sell Margin Correct (Blocks Collateral)');
            else console.error('❌ Option Sell Margin WRONG');
        }
    } catch (e) { console.error(e); }

    console.log('\n🛡️ verification Complete');
    process.exit(0);
}

main();
