import { marketSimulation } from "@/services/market-simulation.service";
import { logger } from "@/lib/logger";

class MarketTickJob {
    private intervalId: NodeJS.Timeout | null = null;
    private tickCount: number = 0;
    private isRunning: boolean = false;

    /**
     * Start the market tick job.
     * Idempotent - safe to call multiple times.
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn("MarketTickJob already running");
            return;
        }

        try {
            // Initialize the simulation service
            await marketSimulation.initialize();

            // Start the tick interval
            this.intervalId = setInterval(() => {
                this.executeTick();
            }, 1000);

            this.isRunning = true;
            logger.info("MarketTickJob started");
        } catch (error) {
            logger.error({ err: error }, "Failed to start MarketTickJob");
            throw error;
        }
    }

    /**
     * Stop the market tick job.
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        this.tickCount = 0;
        logger.info("MarketTickJob stopped");
    }

    /**
     * Get the current status of the job.
     */
    getStatus(): { isRunning: boolean; tickCount: number; symbolCount: number } {
        return {
            isRunning: this.isRunning,
            tickCount: this.tickCount,
            symbolCount: marketSimulation.getSymbolCount(),
        };
    }

    /**
     * Execute a single tick.
     * Logs every 10 ticks.
     */
    private executeTick(): void {
        try {
            marketSimulation.tick();
            this.tickCount++;

            // Log every 10 ticks
            if (this.tickCount % 10 === 0) {
                logger.info(
                    {
                        tickCount: this.tickCount,
                        symbolCount: marketSimulation.getSymbolCount(),
                    },
                    "Market tick checkpoint"
                );
            }
        } catch (error) {
            logger.error({ err: error, tickCount: this.tickCount }, "Market tick failed");
        }
    }
}

declare global {
    var __marketTickJob: MarketTickJob | undefined;
}

const globalState = globalThis as unknown as {
    __marketTickJob?: MarketTickJob;
};

export const marketTickJob =
    globalState.__marketTickJob || new MarketTickJob();

globalState.__marketTickJob = marketTickJob;
