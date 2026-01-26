import { ExecutionService } from "@/services/execution.service";
import { logger } from "@/lib/logger";

class OrderExecutionJob {
    private intervalId: NodeJS.Timeout | null = null;
    private tickCount: number = 0;
    private isRunning: boolean = false;
    private lastRunAt: Date | null = null;

    /**
     * Start the order execution job.
     * Idempotent - safe to call multiple times.
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn("OrderExecutionJob already running");
            return;
        }

        this.intervalId = setInterval(() => {
            this.executeTick();
        }, 1000);

        this.isRunning = true;
        logger.info("OrderExecutionJob started");
    }

    /**
     * Stop the order execution job.
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        this.tickCount = 0;
        this.lastRunAt = null;
        logger.info("OrderExecutionJob stopped");
    }

    /**
     * Get the current status of the job.
     */
    getStatus(): { isRunning: boolean; tickCount: number; lastRunAt: Date | null } {
        return {
            isRunning: this.isRunning,
            tickCount: this.tickCount,
            lastRunAt: this.lastRunAt,
        };
    }

    /**
     * Execute a single tick.
     * Catches errors to prevent job from crashing.
     */
    private async executeTick(): Promise<void> {
        try {
            const executedCount = await ExecutionService.executeOpenOrders();
            this.tickCount++;
            this.lastRunAt = new Date();

            logger.debug({ tickCount: this.tickCount, executedCount }, "Order execution tick");

            // Log every 10 ticks
            if (this.tickCount % 10 === 0) {
                logger.info(
                    {
                        tickCount: this.tickCount,
                        lastRunAt: this.lastRunAt,
                    },
                    "Order execution checkpoint"
                );
            }
        } catch (error) {
            logger.error({ err: error, tickCount: this.tickCount }, "Order execution tick failed");
            // Continue to next tick despite error
        }
    }
}

// Singleton instance
export const orderExecutionJob = new OrderExecutionJob();
