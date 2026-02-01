
import 'dotenv/config';
import { UpstoxService } from "@/services/upstox.service";

async function debugHistoryInvalid() {
    console.log("Zooming in on Invalid Token behavior...");
    const symbol = 'TCS';
    
    // Force Invalid Token
    const invalidToken = `NSE_EQ|${symbol}`;
    console.log(`❌ Testing Invalid Token: ${invalidToken}`);

    // Date Logic
    const toDateObj = new Date(); 
    const safeDate = new Date(toDateObj);
    safeDate.setDate(safeDate.getDate() + 1); 
    const toDateStr = safeDate.toISOString().split('T')[0];

    const fromDateObj = new Date(toDateObj);
    fromDateObj.setDate(toDateObj.getDate() - 7);
    const fromDateStr = fromDateObj.toISOString().split('T')[0];
    
    console.log(`📅 Date Range: ${fromDateStr} to ${toDateStr}`);

    try {
        const data = await UpstoxService.getHistoricalCandleData(
            invalidToken,
            'minutes',
            '1',
            fromDateStr,
            toDateStr
        );
        
        console.log(`📊 Result: ${data.length} candles returned.`);
        if (data.length > 0) {
            console.log("Example Candle:", data[0]);
        } else {
            console.log("✅ CONFIRMED: Invalid Token returns EMPTY Array.");
        }

    } catch (e) {
        console.error("❌ Service Call Failed:", e);
    }

    process.exit(0);
}

debugHistoryInvalid();
