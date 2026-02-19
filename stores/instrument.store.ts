import { ApiError } from "@/lib/errors";
import { instrumentRepository } from "@/lib/instruments/repository";
import type { Instrument } from "@/lib/db/schema";

class InstrumentStore {
    private initialized = false;
    private initializePromise: Promise<void> | null = null;
    private byToken = new Map<string, Instrument>();
    private bySymbol = new Map<string, Instrument>();

    async initialize(): Promise<void> {
        if (this.initialized) return;
        if (this.initializePromise) {
            await this.initializePromise;
            return;
        }

        this.initializePromise = (async () => {
            await instrumentRepository.initialize();

            const nextByToken = new Map<string, Instrument>();
            const nextBySymbol = new Map<string, Instrument>();
            for (const instrument of instrumentRepository.getAll()) {
                nextByToken.set(instrument.instrumentToken, instrument);
                nextBySymbol.set(instrument.tradingsymbol, instrument);
            }

            this.byToken = nextByToken;
            this.bySymbol = nextBySymbol;
            this.initialized = true;
        })();

        try {
            await this.initializePromise;
        } finally {
            this.initializePromise = null;
        }
    }

    isReady(): boolean {
        return this.initialized;
    }

    getByToken(token: string): Instrument | undefined {
        if (!this.initialized) {
            throw new ApiError("Instrument store not initialized", 503, "INSTRUMENT_STORE_NOT_READY");
        }
        return this.byToken.get(token);
    }

    getBySymbol(symbol: string): Instrument | undefined {
        if (!this.initialized) {
            throw new ApiError("Instrument store not initialized", 503, "INSTRUMENT_STORE_NOT_READY");
        }
        return this.bySymbol.get(symbol);
    }

    getAll(): IterableIterator<Instrument> {
        if (!this.initialized) {
            throw new ApiError("Instrument store not initialized", 503, "INSTRUMENT_STORE_NOT_READY");
        }
        return this.byToken.values();
    }
}

declare global {
    var __instrumentStoreInstance: InstrumentStore | undefined;
}

const globalState = globalThis as unknown as { __instrumentStoreInstance?: InstrumentStore };
export const instrumentStore = globalState.__instrumentStoreInstance || new InstrumentStore();
globalState.__instrumentStoreInstance = instrumentStore;

