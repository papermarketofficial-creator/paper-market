
import 'dotenv/config';
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { notInArray } from "drizzle-orm";

async function main() {
    console.log("Shrinking instruments to core set...");
    
    // List of symbols to keep
    const keep = ['NIFTY', 'RELIANCE', 'SBIN'];
    
    // Delete validation using raw SQL or ORM
    // Since we need to replicate "DELETE WHERE NOT IN", we use Drizzle's delete
    // Note: 'instruments.tradingsymbol' needs to match exactly.
    
    const result = await db.delete(instruments)
        .where(notInArray(instruments.tradingsymbol, keep))
        .returning({ symbol: instruments.tradingsymbol });
        
    console.log(`Deleted ${result.length} instruments.`);
    
    const remaining = await db.select({ symbol: instruments.tradingsymbol }).from(instruments);
    console.log("Remaining instruments:", remaining.map(r => r.symbol));
    
    process.exit(0);
}

main().catch(console.error);
