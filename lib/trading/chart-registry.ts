import { ChartController } from './chart-controller';

// ═══════════════════════════════════════════════════════════
// 📊 CHART REGISTRY: Global chart controller access
// ═══════════════════════════════════════════════════════════
/**
 * ChartRegistry provides global access to chart controllers by symbol.
 * This enables CandleEngine to update charts directly without going through React/Zustand.
 * 
 * Architecture:
 * ```
 * TickBus → CandleEngine → ChartRegistry.get(symbol) → ChartController.updateCandle()
 * ```
 */
class ChartRegistry {
    private controllers = new Map<string, ChartController>();

    /**
     * Register a chart controller for a symbol
     */
    register(symbol: string, controller: ChartController) {
        this.controllers.set(symbol, controller);
        console.log(`📋 ChartRegistry: Registered controller for ${symbol}`);
    }

    /**
     * Unregister a chart controller
     */
    unregister(symbol: string) {
        this.controllers.delete(symbol);
        console.log(`📋 ChartRegistry: Unregistered controller for ${symbol}`);
    }

    /**
     * Get chart controller for a symbol
     */
    get(symbol: string): ChartController | undefined {
        return this.controllers.get(symbol);
    }

    /**
     * Check if a symbol has a registered controller
     */
    has(symbol: string): boolean {
        return this.controllers.has(symbol);
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
