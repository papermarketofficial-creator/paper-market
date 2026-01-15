import { CandlestickData, HistogramData, Time } from 'lightweight-charts';

// Hepler to generate random number in range
const random = (min: number, max: number) => Math.random() * (max - min) + min;

// Generate simulated intraday data for NIFTY
// Start Time: 9:15 AM
// End Time: 3:30 PM (or current time if earlier)
export function generateNiftyData(days = 1, intervalMinutes = 5): { candles: CandlestickData[], volume: HistogramData[] } {
    const candles: CandlestickData[] = [];
    const volume: HistogramData[] = [];

    let currentPrice = 22500; // Base NIFTY Price

    // Start from 'days' ago
    const now = new Date();
    // Reset to 9:15 AM
    now.setHours(9, 15, 0, 0);

    // Adjust start time back by 'days'
    let timeIter = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    // Skip weekends logic omitted for simplicity in MVP, but can be added

    // Total steps
    const totalMinutes = days * 6 * 60 + (days * 15); // Rough Approx
    const steps = totalMinutes / intervalMinutes;

    for (let i = 0; i < steps; i++) {
        // Trend Factor: Sine wave to simulate daily cycle + random walk
        const trend = Math.sin(i / 20) * 10;
        const volatility = 15; // NIFTY volatility per 5 mins
        const noise = random(-volatility, volatility);

        const open = currentPrice;
        const close = open + trend + noise;
        const high = Math.max(open, close) + random(0, volatility / 2);
        const low = Math.min(open, close) - random(0, volatility / 2);

        // Convert to Unix Timestamp (seconds)
        const time = Math.floor(timeIter.getTime() / 1000) as Time;

        candles.push({
            time,
            open,
            high,
            low,
            close
        });

        volume.push({
            time,
            value: random(50000, 500000), // Random volume
            color: close >= open ? '#22C55E' : '#EF4444'
        });

        currentPrice = close;

        // Increment Time
        timeIter = new Date(timeIter.getTime() + intervalMinutes * 60 * 1000);
    }

    return { candles, volume };
}

// Generate a single next tick/candle based on previous close
export function generateNextTick(prevClose: number, intervalMinutes: number, lastTime: number): CandlestickData {
    const volatility = 5 * Math.sqrt(intervalMinutes); // Less vol for ticks
    const noise = random(-volatility, volatility);

    const open = prevClose;
    const close = open + noise;
    const high = Math.max(open, close) + random(0, volatility / 3);
    const low = Math.min(open, close) - random(0, volatility / 3);

    // Next time
    const time = (lastTime + intervalMinutes * 60) as Time;

    return {
        time,
        open,
        high,
        low,
        close
    };
}
