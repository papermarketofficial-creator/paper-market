import 'dotenv/config';
import { db } from '../lib/db/index';
import { users, wallets, positions, orders, trades, ledgerAccounts, ledgerEntries } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function resetAndSetBalance() {
  try {
    const allUsers = await db.select().from(users).limit(1);
    if (allUsers.length === 0) {
      console.log('No users found in the database');
      process.exit(1);
    }
    
    // We'll reset the primary active user
    const userId = allUsers[0].id;
    console.log(`Resetting user: ${userId} (${allUsers[0].email})`);

    // 1. Clear out trades first, then orders, then positions
    await db.delete(trades).where(eq(trades.userId, userId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(positions).where(eq(positions.userId, userId));
    console.log('Cleared trading history');

    // 2. Set Wallet Balance
    const ONE_CRORE = "10000000.00";
    
    await db.update(wallets)
      .set({ 
        balance: ONE_CRORE,
        equity: ONE_CRORE,
        blockedBalance: "0.00"
      })
      .where(eq(wallets.userId, userId));
      
    // Also update user's base balance
    await db.update(users)
      .set({ balance: ONE_CRORE })
      .where(eq(users.id, userId));
      
    console.log(`Successfully reset user wallet to 1 Crore (10,000,000 INR)`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to reset:', err);
    process.exit(1);
  }
}

resetAndSetBalance();
