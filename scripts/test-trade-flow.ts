/**
 * Full equity trade flow test
 * Tests: order → execution → wallet → position → P&L
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { orders, trades, positions, instruments } from '../lib/db/schema/index.js';
import { OrderService } from '../services/order.service.js';
import { ExecutionService } from '../services/execution.service.js';
import { WalletService } from '../services/wallet.service.js';
import { PositionService } from '../services/position.service.js';
import { eq, and } from 'drizzle-orm';

// Test user ID (using existing user: john@gmail.com)
const TEST_USER_ID = process.env.TEST_USER_ID?.trim() || '9c7aca93-aa99-40bf-9da6-1a30c3c4713a';

async function runTradeFlowTest() {
    console.log('\n🧪 Starting Full Equity Trade Flow Test\n');
    console.log('='.repeat(60));
    
    try {
        // Step 1: Check initial wallet balance
        console.log('\n1️⃣ Checking initial wallet balance...');
        let balance = await WalletService.getAvailableBalance(TEST_USER_ID);
        console.log(`   Initial balance: ₹${balance.toFixed(2)}`);
        
        if (balance < 10000) {
            console.log('   ⚠️  Low balance, adding funds...');
            await WalletService.creditBalance(
                TEST_USER_ID,
                100000,
                'DEPOSIT',
                `TEST-DEPOSIT-${TEST_USER_ID}-TRADE-FLOW`,
                'Test deposit'
            );
            balance = await WalletService.getAvailableBalance(TEST_USER_ID);
            console.log(`   New balance: ₹${balance.toFixed(2)}`);
        }
        
        // Step 2: Find a test instrument (RELIANCE)
        console.log('\n2️⃣ Finding test instrument...');
        const [instrument] = await db
            .select()
            .from(instruments)
            .where(and(
                eq(instruments.tradingsymbol, 'RELIANCE'),
                eq(instruments.segment, 'NSE_EQ')
            ))
            .limit(1);
        
        if (!instrument) {
            throw new Error('RELIANCE instrument not found');
        }
        
        console.log(`   Found: ${instrument.tradingsymbol} (${instrument.instrumentToken})`);
        console.log(`   Lot size: ${instrument.lotSize}`);
        
        // Step 3: Place BUY order (LIMIT order since market is closed)
        console.log('\n3️⃣ Placing BUY LIMIT order...');
        const testPrice = 2500; // Test price for RELIANCE
        const buyOrder = await OrderService.placeOrder(TEST_USER_ID, {
            instrumentToken: instrument.instrumentToken,
            symbol: 'RELIANCE',
            side: 'BUY',
            quantity: 1, // 1 share
            orderType: 'LIMIT',
            limitPrice: testPrice,
        });
        
        console.log(`   ✅ Order placed: ${buyOrder.id}`);
        console.log(`   Symbol: ${buyOrder.symbol}`);
        console.log(`   InstrumentToken: ${buyOrder.instrumentToken}`);
        console.log(`   Status: ${buyOrder.status}`);
        
        // Step 4: Wait for execution (MARKET orders execute immediately)
        console.log('\n4️⃣ Checking order execution...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
        
        const [executedOrder] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, buyOrder.id))
            .limit(1);
        
        console.log(`   Order status: ${executedOrder.status}`);
        if (executedOrder.executionPrice) {
            console.log(`   Execution price: ₹${executedOrder.executionPrice}`);
        }
        
        // Step 5: Check wallet debit
        console.log('\n5️⃣ Checking wallet debit...');
        const newBalance = await WalletService.getAvailableBalance(TEST_USER_ID);
        const debitAmount = balance - newBalance;
        console.log(`   Previous balance: ₹${balance.toFixed(2)}`);
        console.log(`   Current balance: ₹${newBalance.toFixed(2)}`);
        console.log(`   Debited: ₹${debitAmount.toFixed(2)}`);
        
        // Step 6: Check position created
        console.log('\n6️⃣ Checking position...');
        const [position] = await db
            .select()
            .from(positions)
            .where(and(
                eq(positions.userId, TEST_USER_ID),
                eq(positions.instrumentToken, instrument.instrumentToken)
            ))
            .limit(1);
        
        if (position) {
            console.log(`   ✅ Position created`);
            console.log(`   Symbol: ${position.symbol}`);
            console.log(`   InstrumentToken: ${position.instrumentToken}`);
            console.log(`   Quantity: ${position.quantity}`);
            console.log(`   Average price: ₹${position.averagePrice}`);
            console.log(`   Realized P&L: ₹${position.realizedPnL}`);
        } else {
            console.log(`   ⚠️  No position found`);
        }
        
        // Step 7: Check trade record
        console.log('\n7️⃣ Checking trade record...');
        const [trade] = await db
            .select()
            .from(trades)
            .where(eq(trades.orderId, buyOrder.id))
            .limit(1);
        
        if (trade) {
            console.log(`   ✅ Trade recorded`);
            console.log(`   Symbol: ${trade.symbol}`);
            console.log(`   InstrumentToken: ${trade.instrumentToken}`);
            console.log(`   Side: ${trade.side}`);
            console.log(`   Quantity: ${trade.quantity}`);
            console.log(`   Price: ₹${trade.price}`);
        }
        
        // Step 8: Place SELL order to close position
        console.log('\n8️⃣ Placing SELL LIMIT order to close position...');
        const sellOrder = await OrderService.placeOrder(TEST_USER_ID, {
            instrumentToken: instrument.instrumentToken,
            symbol: 'RELIANCE',
            side: 'SELL',
            quantity: 1,
            orderType: 'LIMIT',
            limitPrice: testPrice,
        });
        
        console.log(`   ✅ Sell order placed: ${sellOrder.id}`);
        
        // Step 9: Wait and check final state
        console.log('\n9️⃣ Checking final state...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const finalBalance = await WalletService.getAvailableBalance(TEST_USER_ID);
        console.log(`   Final balance: ₹${finalBalance.toFixed(2)}`);
        console.log(`   Net P&L: ₹${(finalBalance - balance).toFixed(2)}`);
        
        const [closedPosition] = await db
            .select()
            .from(positions)
            .where(and(
                eq(positions.userId, TEST_USER_ID),
                eq(positions.instrumentToken, instrument.instrumentToken)
            ))
            .limit(1);
        
        if (!closedPosition) {
            console.log(`   ✅ Position closed successfully`);
        } else {
            console.log(`   ⚠️  Position still open: ${closedPosition.quantity} shares`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('\n✅ Trade flow test completed successfully!\n');
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runTradeFlowTest();
