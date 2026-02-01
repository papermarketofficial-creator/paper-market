
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function cleanupInstruments() {
  console.log("🧹 Force cleaning duplicate RELIANCE by Name...");

  // Delete by Name "RELIANCE INDUSTRIES" (Junk) vs "Reliance Industries Ltd" (Valid)
  const result = await db
    .delete(instruments)
    .where(eq(instruments.name, 'RELIANCE INDUSTRIES'))
    .returning({ token: instruments.instrumentToken, symbol: instruments.tradingsymbol });

  if (result.length > 0) {
    console.log(`✅ Deleted junk instrument: ${result[0].symbol} (${result[0].token})`);
  } else {
    console.log("❌ Could not find instrument with name 'RELIANCE INDUSTRIES'");
  }
  
  process.exit(0);
}

cleanupInstruments();
