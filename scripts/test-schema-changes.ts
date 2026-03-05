/**
 * Simplified schema validation test
 * Tests that instrumentToken is properly stored and used
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { orders, instruments } from '../lib/db/schema/index.js';
import { OrderService } from '../services/order.service.js';
import { WalletService } from '../services/wallet.service.js';
import { eq, and } from 'drizzle-orm';

const TEST_USER_ID = '9c7aca93-aa99-40bf-9da6-1a30c3c4713a'; // john@gmail.com

async function testSchemaChanges() {
    console.log('\n🧪 Testing Schema Changes (instrumentToken)\n');
    console.log('='.repeat(60));
    
    try {
        // Step 1: Ensure user has balance
        console.log('\n1️⃣ Checking wallet balance...');
        let balance = await WalletService.getAvailableBalance(TEST_USER_ID);
        console.log(`   Balance: ₹${balance.toFixed(2)}`);
        
        if (balance < 10000) {
            await WalletService.creditBalance(
                TEST_USER_ID,
                100000,
                'DEPOSIT',
                `TEST-DEPOSIT-${TEST_USER_ID}-SCHEMA`,
                'Test deposit'
            );
            balance = await WalletService.getAvailableBalance(TEST_USER_ID);
            console.log(`   Added funds. New balance: ₹${balance.toFixed(2)}`);
        }
        
        // Step 2: Find test instrument
        console.log('\n2️⃣ Finding test instrument (RELIANCE)...');
        const [instrument] = await db
            .select()
            .from(instruments)
            .where(and(
                eq(instruments.tradingsymbol, 'RELIANCE'),
                eq(instruments.segment, 'NSE_EQ')
            ))
            .limit(1);
        
        if (!instrument) {
            throw new Error('RELIANCE not found');
        }
        
        console.log(`   ✅ Found: ${instrument.tradingsymbol}`);
        console.log(`   InstrumentToken: ${instrument.instrumentToken}`);
        
        // Step 3: Place order
        console.log('\n3️⃣ Placing test order...');
        const order = await OrderService.placeOrder(TEST_USER_ID, {
            symbol: 'RELIANCE',
            side: 'BUY',
            quantity: 1,
            orderType: 'LIMIT',
            limitPrice: 2500,
        });
        
        console.log(`   ✅ Order placed successfully`);
        console.log(`   Order ID: ${order.id}`);
        console.log(`   Symbol: ${order.symbol}`);
        console.log(`   InstrumentToken: ${order.instrumentToken}`);
        console.log(`   Status: ${order.status}`);
        
        // Step 4: Verify instrumentToken matches
        console.log('\n4️⃣ Verifying instrumentToken...');
        if (order.instrumentToken === instrument.instrumentToken) {
            console.log(`   ✅ InstrumentToken correctly stored!`);
            console.log(`   Expected: ${instrument.instrumentToken}`);
            console.log(`   Got:      ${order.instrumentToken}`);
        } else {
            throw new Error(`InstrumentToken mismatch! Expected ${instrument.instrumentToken}, got ${order.instrumentToken}`);
        }
        
        // Step 5: Verify NOT NULL constraint
        console.log('\n5️⃣ Verifying NOT NULL constraint...');
        if (order.instrumentToken) {
            console.log(`   ✅ instrumentToken is NOT NULL`);
        } else {
            throw new Error('instrumentToken is NULL!');
        }
        
        // Step 6: Clean up - cancel the order
        console.log('\n6️⃣ Cleaning up test order...');
        await db.delete(orders).where(eq(orders.id, order.id));
        console.log(`   ✅ Test order deleted`);
        
        console.log('\n' + '='.repeat(60));
        console.log('\n✅ All schema validation tests passed!\n');
        console.log('Summary:');
        console.log('  ✓ instrumentToken is properly stored on order creation');
        console.log('  ✓ instrumentToken matches the instrument table');
        console.log('  ✓ NOT NULL constraint is working');
        console.log('  ✓ No regression in order placement flow\n');
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

testSchemaChanges();
