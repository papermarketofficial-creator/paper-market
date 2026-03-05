import 'dotenv/config';
import { db } from "@/lib/db";
import { upstoxTokens } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

async function verifyToken() {
    console.log("🔍 Checking Upstox Token Status...\n");
    
    try {
        const [token] = await db
            .select()
            .from(upstoxTokens)
            .orderBy(desc(upstoxTokens.updatedAt))
            .limit(1);
        
        if (!token) {
            console.log("❌ NO TOKEN FOUND");
            console.log("   Action: Login to Upstox via /admin or OAuth flow\n");
            process.exit(1);
        }
        
        const now = new Date();
        const expiresAt = new Date(token.expiresAt);
        const isExpired = expiresAt < now;
        
        console.log("📋 Token Details:");
        console.log(`   User ID: ${token.userId}`);
        console.log(`   Created: ${token.createdAt}`);
        console.log(`   Updated: ${token.updatedAt}`);
        console.log(`   Expires: ${token.expiresAt}`);
        console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ VALID'}`);
        
        if (isExpired) {
            const hoursAgo = Math.floor((now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60));
            console.log(`   Expired ${hoursAgo} hours ago\n`);
            console.log("🔧 Action Required:");
            console.log("   1. Navigate to your app");
            console.log("   2. Trigger Upstox OAuth login");
            console.log("   3. Generate new access token\n");
        } else {
            const hoursLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
            console.log(`   Valid for ${hoursLeft} more hours\n`);
            console.log("✅ Token is valid. Issue might be elsewhere.\n");
        }
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
    
    process.exit(0);
}

verifyToken();
