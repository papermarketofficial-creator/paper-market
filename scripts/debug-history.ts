
import 'dotenv/config';
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UpstoxService } from "@/services/upstox.service";

async function debugHistory() {
    const symbol = 'TCS';
    console.log(`🔎 Debugging History for ${symbol}...`);

    // 1. Get Token from DB
    const [inst] = await db.select().from(instruments).where(eq(instruments.tradingsymbol, symbol));
    
    if (!inst) {
        console.error("❌ Instrument not found in DB!");
        return;
    }

    console.log(`✅ Found Token: ${inst.instrumentToken}`);

    // 2. Date Logic (Mimicking route.ts)
    const toDateObj = new Date(); // Today (Sunday Feb 1?)
    const safeDate = new Date(toDateObj);
    safeDate.setDate(safeDate.getDate() + 1); 
    const toDateStr = safeDate.toISOString().split('T')[0];

    const fromDateObj = new Date(toDateObj);
    fromDateObj.setDate(toDateObj.getDate() - 7);
    const fromDateStr = fromDateObj.toISOString().split('T')[0];
    
    console.log(`📅 Date Range: ${fromDateStr} to ${toDateStr}`);

    // 3. Call Upstox Service
    console.log("🚀 Calling UpstoxService.getHistoricalCandleData...");
    try {
        const data = await UpstoxService.getHistoricalCandleData(
            inst.instrumentToken,
            'minutes',
            '1',
            fromDateStr, // Pass fromDate then toDate if UpstoxService expects it that way
            toDateStr
        );
        // Wait, UpstoxService.ts signature is: (key, unit, interval, fromDate, toDate)
        // But Inside it constructs URL: .../toDate/fromDate
        // So I should pass arguments as (fromDate, toDate) to the FUNCTION.
        
        console.log(`📊 Result: ${data.length} candles returned.`);
        if (data.length > 0) {
            console.log("Example Candle:", data[0]);
        } else {
            console.log("❌ Empty Data Returned!");
        }

    } catch (e) {
        console.error("❌ Service Call Failed:", e);
    }

    process.exit(0);
}

debugHistory();
