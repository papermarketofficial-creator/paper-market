
import 'dotenv/config';
import { db } from "@/lib/db";
import { users, orders, trades, positions, wallets, transactions, accounts, sessions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

async function hardReset() {
    console.log("🧨 STARTING HARD RESET...");
    console.log("⚠️  This will delete ALL data. 5 seconds to cancel (Ctrl+C).");
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // Cascade delete usually handles children, but let's be explicit and safe order
        console.log("   -> Deleting Trades...");
        await db.delete(trades);
        
        console.log("   -> Deleting Orders...");
        await db.delete(orders);

        console.log("   -> Deleting Positions...");
        await db.delete(positions);

        console.log("   -> Deleting Transactions...");
        await db.delete(transactions);

        console.log("   -> Deleting Wallets...");
        await db.delete(wallets);

        console.log("   -> Deleting Sessions & Accounts...");
        await db.delete(sessions);
        await db.delete(accounts);

        console.log("   -> Deleting Users...");
        await db.delete(users);

        console.log("✅ RESET COMPLETE. Database is empty.");
        console.log("👉 Please restart 'npm run dev' and Login again to create a clean account.");

    } catch (error) {
        console.error("❌ Reset Failed:", error);
    }
    process.exit(0);
}

hardReset();
