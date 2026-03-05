// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Now import everything else
import { marketTickJob } from "@/jobs/market-tick.job";
import { orderExecutionJob } from "@/jobs/order-execution.job";
import { expirySettlementJob } from "@/jobs/expiry-settlement";
import { logger } from "@/lib/logger";
import { WriteAheadJournalService } from "@/services/write-ahead-journal.service";

async function startJobs() {
    try {
        logger.info("Starting background jobs...");

        const recovery = await WriteAheadJournalService.recoverUncommitted();
        logger.info({ recovery }, "WAJ recovery finished before job startup");

        // Start market simulation
        await marketTickJob.start();
        logger.info("✓ Market tick job started");

        // Start order execution
        await orderExecutionJob.start();

        // Start expiry settlement
        await expirySettlementJob.start();
        logger.info("✓ Order execution job started");

        logger.info("Expiry settlement job started");
        logger.info("All jobs running! Press Ctrl+C to stop.");

        // Keep process alive
        process.on('SIGINT', () => {
            logger.info("Stopping jobs...");
            marketTickJob.stop();
            orderExecutionJob.stop();
            expirySettlementJob.stop();
            logger.info("Jobs stopped. Exiting.");
            process.exit(0);
        });

        // Keep the process running
        await new Promise(() => { });
    } catch (error) {
        logger.error({ err: error }, "Failed to start jobs");
        process.exit(1);
    }
}

startJobs();
