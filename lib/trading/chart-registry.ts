import { ChartController } from './chart-controller';

// ═══════════════════════════════════════════════════════════
// 📊 CHART REGISTRY: Global chart controller access
// ═══════════════════════════════════════════════════════════
/**
 * ChartRegistry provides global access to chart controllers by instrument key.
 * This enables CandleEngine to update charts directly without going through React/Zustand.
 * 
 * Architecture:
 * ```
 * TickBus → CandleEngine → ChartRegistry.get(instrumentKey) → ChartController.updateCandle()
 * ```
 */
class ChartRegistry {
    private controllers = new Map<string, ChartController>();

    /**
     * Register a chart controller for a symbol
     */
    register(instrumentKey: string, controller: ChartController) {
        this.controllers.set(instrumentKey, controller);
        console.log(`📋 ChartRegistry: Registered controller for ${instrumentKey}`);
    }

    /**
     * Unregister a chart controller
     */
    unregister(instrumentKey: string) {
        this.controllers.delete(instrumentKey);
        console.log(`📋 ChartRegistry: Unregistered controller for ${instrumentKey}`);
    }

    /**
     * Get chart controller for a symbol
     */
    get(instrumentKey: string): ChartController | undefined {
        return this.controllers.get(instrumentKey);
    }

    /**
     * Check if a symbol has a registered controller
     */
    has(instrumentKey: string): boolean {
        return this.controllers.has(instrumentKey);
    }

    /**
     * Get all registered symbols
     */
    getSymbols(): string[] {
        return Array.from(this.controllers.keys());
    }
}

// Singleton instance
export const chartRegistry = new ChartRegistry();
