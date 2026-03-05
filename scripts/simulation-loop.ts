
import 'dotenv/config';
import { marketTickJob } from "@/jobs/market-tick.job";
import { orderExecutionJob } from "@/jobs/order-execution.job";
import { logger } from "@/lib/logger";

async function startSimulation() {
    console.log("🚀 Starting Backend Simulation Engine...");
    console.log("   - Market Ticks: Generating random movements for NIFTY, RELIANCE, SBIN");
    console.log("   - Order Execution: Matching OPEN orders against prices");

    try {
        await marketTickJob.start();
        await orderExecutionJob.start();

        console.log("\n✅ Engine Running. Press Ctrl+C to stop.\n");
        console.log("   [Logs are being written to standard output]");

        // Prevent exit
        await new Promise(() => {});
    } catch (e) {
        console.error("Failed to start simulation:", e);
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log("\n🛑 Stopping Engine...");
    marketTickJob.stop();
    orderExecutionJob.stop();
    process.exit(0);
});

startSimulation();
