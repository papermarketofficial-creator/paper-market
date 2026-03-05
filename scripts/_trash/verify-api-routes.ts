
import 'dotenv/config';
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/orders/route";
import { db } from "@/lib/db";
import { users, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function verifyOrderApi() {
    console.log("🛠️  Verifying API Route: /api/v1/orders [POST]...");

    // 1. Setup User
    const TEST_EMAIL = "verify-core@example.com";
    const user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        console.error("❌ Test user not found. Run verify-trading-core.ts first.");
        process.exit(1);
    }

    // 2. Set Test Mode Env Vars
    process.env.TEST_MODE = "true";
    process.env.TEST_USER_ID = user.id;

    console.log(`👤 Simulating User: ${user.id}`);

    // 3. Create Request
    // We mock a NextRequest with a valid payload
    const payload = {
        symbol: "RELIANCE",
        side: "BUY",
        quantity: 1, // Small qty
        orderType: "MARKET"
    };

    const req = new NextRequest("http://localhost:3000/api/v1/orders", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
            "Content-Type": "application/json"
        }
    });

    // 4. Invoke Handler
    console.log("🚀 Invoking POST handler...");
    const response = await POST(req);

    // 5. Verify Response
    console.log(`📥 Status: ${response.status}`);
    const json = await response.json();
    console.log("📥 Body:", JSON.stringify(json, null, 2));

    if (response.status === 201 && json.success) {
        console.log("✅ API Verification Passed!");
        
        // Double check DB
        const createdOrder = await db.query.orders.findFirst({
            where: eq(orders.id, json.data.id)
        });
        
        if (createdOrder) {
            console.log(`✅ DB Verification: Order ${createdOrder.id} exists.`);
        } else {
            console.error("❌ DB Verification Failed: Order not found in DB.");
            process.exit(1);
        }

    } else {
        console.error("❌ API Verification Failed");
        process.exit(1);
    }
    
    process.exit(0);
}

verifyOrderApi().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
