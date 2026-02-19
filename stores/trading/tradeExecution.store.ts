import { create } from "zustand";
import { Position } from "@/types/position.types";
import { Trade } from "@/types/order.types";
import { InstrumentMode } from "@/types/general.types";
import { usePositionsStore } from "./positions.store";
import { useJournalStore } from "./journal.store";
import { useWalletStore } from "@/stores/wallet.store";
import { ExitReason } from "@/types/journal.types";

type OrderPlacementParams = {
  instrumentToken: string;
  symbol: string;
  side: Position["side"];
  quantity: number;
  entryPrice?: number;
};

interface TradeExecutionState {
  pendingOrders: Trade[];
  pendingOrderDetails: Record<string, { leverage: number; lotSize: number }>;
  isOrderProcessing: boolean;
  processingOrderCount: number;
  orderProcessingError: string | null;
  clearOrderProcessingError: () => void;

  placeOrder: (
    tradeParams: OrderPlacementParams,
    lotSize: number,
    instrumentMode: InstrumentMode,
    orderType?: "MARKET" | "LIMIT" | "STOP",
    triggerPrice?: number
  ) => Promise<void>;

  fetchOrders: () => Promise<void>;
  processTick: (currentPrice: number, symbol: string) => void;

  executeTrade: (
    trade: OrderPlacementParams,
    lotSize: number,
    instrumentMode: InstrumentMode
  ) => Promise<void>;

  closePosition: (positionId: string, exitPrice: number, reason?: string) => void;
  settleExpiredPositions: () => void;
}

export const useTradeExecutionStore = create<TradeExecutionState>((set, get) => ({
  pendingOrders: [],
  pendingOrderDetails: {},
  isOrderProcessing: false,
  processingOrderCount: 0,
  orderProcessingError: null,
  clearOrderProcessingError: () => set({ orderProcessingError: null }),

  placeOrder: async (
    tradeParams,
    lotSize,
    instrumentMode,
    orderType = "MARKET",
    triggerPrice
  ) => {
    let markedProcessing = false;
    try {
      if (!tradeParams.instrumentToken || tradeParams.instrumentToken.trim().length === 0) {
        throw new Error("instrumentToken is required for order placement");
      }

      set((state) => {
        const nextCount = state.processingOrderCount + 1;
        return {
          processingOrderCount: nextCount,
          isOrderProcessing: nextCount > 0,
          orderProcessingError: null,
        };
      });
      markedProcessing = true;

      console.log("[DEBUG] placeOrder called with:", {
        instrumentToken: tradeParams.instrumentToken,
        symbol: tradeParams.symbol,
        quantity: tradeParams.quantity,
        lotSize,
      });

      const payload: any = {
        instrumentToken: tradeParams.instrumentToken,
        symbol: tradeParams.symbol,
        side: tradeParams.side,
        quantity: tradeParams.quantity,
        orderType: orderType,
      };

      console.log("[DEBUG] Sending payload:", payload);

      if (orderType === "LIMIT") {
        payload.limitPrice = tradeParams.entryPrice;
      }

      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawBody = await res.text();
      let data: any = null;
      if (rawBody) {
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data?.success) {
        const apiError = data?.error;
        const errorCode =
          (typeof apiError?.code === "string" && apiError.code) ||
          (typeof data?.code === "string" && data.code) ||
          "";
        const backendMessage =
          errorCode === "PARTIAL_EXIT_NOT_ALLOWED"
            ? "Partial exit is disabled in paper trading mode."
            : (typeof apiError === "string" && apiError) ||
              apiError?.message ||
              (typeof data?.message === "string" && data.message) ||
              (!data && rawBody ? rawBody.slice(0, 300) : null) ||
              `Order placement failed (HTTP ${res.status})`;

        console.error("Place Order API Failed:", {
          status: res.status,
          statusText: res.statusText,
          errorCode,
          data,
          rawBody: rawBody.slice(0, 500),
        });

        throw new Error(backendMessage);
      }

      get().fetchOrders();
      console.log("Refreshing wallet balance after order placement...");
      useWalletStore.getState().fetchWallet();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Order placement failed";
      set({ orderProcessingError: message });
      console.error("[TradeExecution] Order placement failed", error);
      throw error;
    } finally {
      if (markedProcessing) {
        set((state) => {
          const nextCount = Math.max(0, state.processingOrderCount - 1);
          return {
            processingOrderCount: nextCount,
            isOrderProcessing: nextCount > 0,
          };
        });
      }
    }
  },

  fetchOrders: async () => {
    try {
      const res = await fetch("/api/v1/orders?status=OPEN");
      const data = await res.json();

      if (data.success) {
        set({ pendingOrders: data.data });
      }
    } catch (error) {
      console.error("Fetch Orders Error:", error);
    }
  },

  processTick: (currentPrice, symbol) => {
    // Backend handles execution
  },

  executeTrade: async (trade, lotSize, mode) => {
    return get().placeOrder(trade, lotSize, mode, "MARKET");
  },

  closePosition: async (positionId: string, exitPrice: number, reason = "MANUAL") => {
    const positionsStore = usePositionsStore.getState();
    const position = positionsStore.positions.find((p) => p.id === positionId);

    if (!position) {
      console.error("Position not found:", positionId);
      return;
    }

    try {
      console.log(`[TradeExecution] Closing position ${position.symbol} (${reason})`);
      const exitSide = position.side === "BUY" ? "SELL" : "BUY";
      if (!position.instrumentToken) {
        throw new Error(`Missing instrumentToken for position ${position.symbol}`);
      }

      await get().placeOrder(
        {
          instrumentToken: position.instrumentToken,
          symbol: position.symbol,
          side: exitSide,
          quantity: position.quantity,
          entryPrice: exitPrice,
        },
        position.lotSize || 1,
        position.instrument as InstrumentMode,
        "MARKET"
      );

      setTimeout(() => {
        positionsStore.fetchPositions();
      }, 500);

      const pnl =
        position.side === "BUY"
          ? (exitPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - exitPrice) * position.quantity;

      const exitReason: ExitReason =
        reason === "EXPIRY SETTLEMENT" ? "EXPIRY" : "MANUAL";

      useJournalStore.getState().updateJournalOnExit(positionId, {
        exitPrice,
        exitTime: new Date(),
        realizedPnL: pnl,
        exitReason,
      });
    } catch (error) {
      console.error("Failed to close position:", error);
    }
  },

  settleExpiredPositions: () => {
    console.warn("settleExpiredPositions is deprecated. Backend handles expiry.");
  },
}));

