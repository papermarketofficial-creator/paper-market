
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments, watchlistItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function checkDuplicates() {
  console.log("🔍 Checking for duplicates...");

  // 1. Check Instruments with symbol 'RELIANCE'
  const relianceInstruments = await db
    .select()
    .from(instruments)
    .where(eq(instruments.tradingsymbol, 'RELIANCE'));

  console.log(`\nfound ${relianceInstruments.length} instruments with symbol 'RELIANCE':`);
  relianceInstruments.forEach(inst => {
    console.log(`- Token: ${inst.instrumentToken}, Exchange: ${inst.exchangeToken}, Name: ${inst.name}`);
  });

  // 2. Check all items in all watchlists
  const items = await db.select().from(watchlistItems);
  console.log(`\nFound ${items.length} total watchlist items.`);
  
  // Group by watchlistId
  const byWatchlist: Record<string, string[]> = {};
  for (const item of items) {
    if (!byWatchlist[item.watchlistId]) byWatchlist[item.watchlistId] = [];
    byWatchlist[item.watchlistId].push(item.instrumentToken);
  }

  Object.entries(byWatchlist).forEach(([wid, tokens]) => {
    console.log(`Watchlist ${wid} has ${tokens.length} items.`);
    // Check if tokens are unique
    const uniqueTokens = new Set(tokens);
    if (uniqueTokens.size !== tokens.length) {
       console.log("  ⚠️  DUPLICATE TOKENS detected in this watchlist!");
    } else {
       console.log("  Tokens are unique.");
    }
  });

  process.exit(0);
}

checkDuplicates();
