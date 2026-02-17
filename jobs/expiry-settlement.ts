import { logger } from "@/lib/logger";
import { expirySettlementService } from "@/services/expiry-settlement.service";

const JOB_INTERVAL_MS = 60_000;

class ExpirySettlementJob {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private ticks = 0;
    private lastRunAt: Date | null = null;

    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn("ExpirySettlementJob already running");
            return;
        }

        this.intervalId = setInterval(() => {
            void this.runTick();
        }, JOB_INTERVAL_MS);

        this.isRunning = true;
        logger.info("ExpirySettlementJob started");
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        this.ticks = 0;
        this.lastRunAt = null;
        logger.info("ExpirySettlementJob stopped");
    }

    getStatus(): { isRunning: boolean; ticks: number; lastRunAt: Date | null } {
        return {
            isRunning: this.isRunning,
            ticks: this.ticks,
            lastRunAt: this.lastRunAt,
        };
    }

    private async runTick(): Promise<void> {
        try {
            const result = await expirySettlementService.runSettlementCycle();
            this.ticks += 1;
            this.lastRunAt = new Date();

            if (result.status === "SETTLED" && result.positions > 0) {
                logger.warn(
                    {
                        status: result.status,
                        instruments: result.instruments,
                        positions: result.positions,
                    },
                    "Expiry settlement cycle completed"
                );
            }
        } catch (error) {
            logger.error({ err: error }, "Expiry settlement cycle failed");
        }
    }
}

declare global {
    var __expirySettlementJob: ExpirySettlementJob | undefined;
}

const globalState = globalThis as unknown as {
    __expirySettlementJob?: ExpirySettlementJob;
};

export const expirySettlementJob =
    globalState.__expirySettlementJob || new ExpirySettlementJob();

globalState.__expirySettlementJob = expirySettlementJob;
