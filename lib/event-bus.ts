import { EventEmitter } from "events";

export type PriceTickEvent = {
    instrumentToken: string;
    price: number;
    timestampMs: number;
};

export type OrderExecutedEvent = {
    orderId: string;
    userId: string;
    instrumentToken: string;
    tradeId?: string;
    quantity?: number;
    price?: number;
};

export type PositionChangedEvent = {
    userId: string;
    instrumentToken: string;
    reason: "ORDER_EXECUTED" | "MANUAL_REFRESH" | "SETTLEMENT";
};

export type EventBusEvents = {
    "price.tick": PriceTickEvent;
    "order.executed": OrderExecutedEvent;
    "position.changed": PositionChangedEvent;
};

class TypedEventBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(256);
    }

    on<K extends keyof EventBusEvents>(event: K, listener: (payload: EventBusEvents[K]) => void): void {
        this.emitter.on(event, listener as (...args: any[]) => void);
    }

    off<K extends keyof EventBusEvents>(event: K, listener: (payload: EventBusEvents[K]) => void): void {
        this.emitter.off(event, listener as (...args: any[]) => void);
    }

    emit<K extends keyof EventBusEvents>(event: K, payload: EventBusEvents[K]): void {
        this.emitter.emit(event, payload);
    }
}

declare global {
    var __engineEventBus: TypedEventBus | undefined;
}

const globalState = globalThis as unknown as { __engineEventBus?: TypedEventBus };

export const eventBus = globalState.__engineEventBus || new TypedEventBus();
globalState.__engineEventBus = eventBus;

