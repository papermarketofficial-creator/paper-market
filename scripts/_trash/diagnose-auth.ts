
import 'dotenv/config';
import { db } from "@/lib/db";
import { users, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

async function diagnose() {
    console.log("🔍 Starting System Diagnosis...");

    // 1. Check DB Connection & User
    const email = "sumanth1659@gmail.com"; // The email user is trying to log in with
    console.log(`\n1️⃣ Checking User in DB: ${email}`);
    
    const user = await db.query.users.findFirst({
        where: eq(users.email, email)
    });

    if (!user) {
        console.error("❌ User NOT found in DB. Auth will fail to map ID.");
        console.log("   -> Please login via UI to create the user, or seed it.");
    } else {
        console.log("✅ User found:", { id: user.id, email: user.email, balance: user.balance });
        
        // 2. Check Hierarchy
        console.log(`\n2️⃣ Verifying ID Format`);
        if (user.id.length > 50) {
           console.log("   ⚠️  ID length is long, looks like Google Subject ID?"); 
        } else {
           console.log("   ✅ ID looks standard.");
        }
    }

    // 3. Simulating Auth Logic (The Fix we added)
    console.log(`\n3️⃣ Testing Auth Logic (simulation)`);
    // We can't call 'auth()' here easily because it depends on headers/request context
    // But we can verify the logic we wrote in `lib/auth.ts`:
    // "select * from users where email = ?"
    
    if (user) {
        console.log("   ✅ Logic: JWT callback SHOULD find user via email match.");
    }

    // 4. Check Orders Table Schema (implicitly via insert)
    console.log(`\n4️⃣ Testing Order Insert (FK Check)`);
    
    if (user) {
        try {
            const orderId = crypto.randomUUID();
            // Try to enable a raw insert to bypass service logic just to test FK
            // Actually, let's just inspect the error if we were to try
            console.log("   -> Attempting dry-run insert...");
            
            // We won't actually commit this transaction
            await db.transaction(async (tx) => {
                await tx.insert(orders).values({
                    userId: user.id, // This MUST exist
                    symbol: "TEST-FK",
                    side: "BUY",
                    quantity: 1,
                    orderType: "MARKET",
                    status: "PENDING",
                    limitPrice: "100",
                });
                console.log("   ✅ Insert SUCCESS (FK is valid)");
                tx.rollback(); // Don't keep it
            });

        } catch (error: any) {
            console.error("   ❌ Insert FAILED:", error.message);
            if (error.message.includes("violates foreign key")) {
                console.error("   🚨 CRITICAL: The User ID in the DB does NOT match the ID expected by the foreign key?");
            }
        }
    }

    process.exit(0);
}

diagnose().catch(console.error);
