import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Point {
  time: number;
  price: number;
}

export type DrawingType = "trendline" | "ray" | "horizontal-line" | "rectangle" | "text";
export type ChartStyle = "CANDLE" | "LINE" | "AREA" | "HEIKIN_ASHI";
export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "VOL" | "BB" | "VWAP" | "ATR" | "SUPERTREND";
export type InteractionStatus = "idle" | "drawing" | "dragging" | "box-selecting";
export type ToolType = "cursor" | "crosshair" | "select" | DrawingType;

export interface IndicatorDisplay {
  color: string;
  lineWidth: number;
  visible: boolean;
}

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  source: "close" | "open" | "high" | "low";
  params: Record<string, number>;
  display: IndicatorDisplay;
  seriesColors?: {
    macd: string;
    signal: string;
    histogram: string;
  };
}

interface BaseDrawing {
  id: string;
  type: DrawingType;
  visible: boolean;
  locked?: boolean;
  groupId?: string;
  zIndex?: number;
}

export interface HorizontalLineDrawing extends BaseDrawing {
  type: "horizontal-line";
  price: number;
}

export interface TwoPointDrawing extends BaseDrawing {
  type: "trendline" | "ray" | "rectangle";
  p1: Point;
  p2: Point;
}

export interface TextDrawing extends BaseDrawing {
  type: "text";
  point: Point;
  text: string;
}

export type Drawing = HorizontalLineDrawing | TwoPointDrawing | TextDrawing;

export interface InteractionState {
  status: InteractionStatus;
  dragStartPoint?: Point;
  currentPoint?: Point;
  activeDrawingIds?: string[];
  originalDrawings?: Record<string, Drawing>;
}

interface SymbolAnalysisState {
  indicators: IndicatorConfig[];
  drawings: Drawing[];
  redoStack: Drawing[];
  chartStyle?: ChartStyle;
}

let fallbackIdCounter = 0;
const nowId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `local-${Date.now()}-${++fallbackIdCounter}`;

const createSymbolState = (): SymbolAnalysisState => ({
  indicators: [],
  drawings: [],
  redoStack: [],
});

const DEFAULT_COLORS: Record<IndicatorType, string> = {
  SMA: "#FFA500",
  EMA: "#2196F3",
  RSI: "#E91E63",
  MACD: "#2962FF",
  VOL: "#64748B",
  BB: "#22D3EE",
  VWAP: "#F59E0B",
  ATR: "#8B5CF6",
  SUPERTREND: "#10B981",
};

const DEFAULT_PARAMS: Record<IndicatorType, Record<string, number>> = {
  SMA: { period: 20 },
  EMA: { period: 20 },
  RSI: { period: 14 },
  MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  VOL: {},
  BB: { period: 20, stdDev: 2 },
  VWAP: {},
  ATR: { period: 14 },
  SUPERTREND: { period: 10, multiplier: 3 },
};

const DEFAULT_MACD_COLORS = {
  macd: "#2962FF",
  signal: "#FF6D00",
  histogram: "#26a69a",
};

export const makeDefaultIndicator = (type: IndicatorType): Omit<IndicatorConfig, "id"> => ({
  type,
  source: "close",
  params: { ...DEFAULT_PARAMS[type] },
  display: {
    color: DEFAULT_COLORS[type],
    lineWidth: 2,
    visible: true,
  },
  seriesColors: type === "MACD" ? { ...DEFAULT_MACD_COLORS } : undefined,
});

function normalizeIndicator(input: Omit<IndicatorConfig, "id">): Omit<IndicatorConfig, "id"> {
  const base = makeDefaultIndicator(input.type);
  return {
    ...base,
    ...input,
    params: {
      ...base.params,
      ...(input.params || {}),
    },
    display: {
      ...base.display,
      ...(input.display || {}),
    },
    seriesColors:
      input.type === "MACD"
        ? {
            ...DEFAULT_MACD_COLORS,
            ...(input.seriesColors || {}),
          }
        : undefined,
  };
}

const toggleId = (list: string[], id: string) =>
  list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

function normalizeDrawing(input: any): Drawing | null {
  if (!input || typeof input !== "object" || typeof input.type !== "string") return null;

  const base = {
    id: typeof input.id === "string" ? input.id : nowId(),
    visible: input.visible !== false,
    locked: input.locked === true,
    groupId: typeof input.groupId === "string" ? input.groupId : undefined,
    zIndex: Number.isFinite(Number(input.zIndex)) ? Number(input.zIndex) : undefined,
  };

  switch (input.type) {
    case "horizontal-line": {
      const price = Number(input.price);
      if (!Number.isFinite(price)) return null;
      return {
        ...base,
        type: "horizontal-line",
        price,
      };
    }
    case "trendline":
    case "ray":
    case "rectangle": {
      const p1Time = Number(input?.p1?.time);
      const p1Price = Number(input?.p1?.price);
      const p2Time = Number(input?.p2?.time);
      const p2Price = Number(input?.p2?.price);
      if (![p1Time, p1Price, p2Time, p2Price].every((n) => Number.isFinite(n))) return null;
      return {
        ...base,
        type: input.type,
        p1: { time: p1Time, price: p1Price },
        p2: { time: p2Time, price: p2Price },
      };
    }
    case "text": {
      const time = Number(input?.point?.time);
      const price = Number(input?.point?.price);
      if (![time, price].every((n) => Number.isFinite(n))) return null;
      return {
        ...base,
        type: "text",
        point: { time, price },
        text: typeof input.text === "string" ? input.text : "",
      };
    }
    default:
      return null;
  }
}

function normalizeSymbolStateRecord(raw: unknown): Record<string, SymbolAnalysisState> {
  if (!raw || typeof raw !== "object") return {};

  const next: Record<string, SymbolAnalysisState> = {};
  for (const [symbol, value] of Object.entries(raw as Record<string, any>)) {
    const indicators = Array.isArray(value?.indicators)
      ? value.indicators
          .map((item: any) => {
            const type = item?.type as IndicatorType | undefined;
            if (!type || !(type in DEFAULT_COLORS)) return null;
            const normalized = normalizeIndicator({
              type,
              source: item?.source || "close",
              params: {
                ...(item?.params || {}),
                ...(Number.isFinite(Number(item?.period)) ? { period: Number(item.period) } : {}),
              },
              display: {
                color: item?.display?.color || item?.color || DEFAULT_COLORS[type],
                lineWidth: Number(item?.display?.lineWidth ?? item?.lineWidth ?? 2),
                visible: item?.display?.visible ?? item?.visible ?? true,
              },
              seriesColors: item?.seriesColors,
            });
            return {
              ...normalized,
              id: typeof item?.id === "string" ? item.id : nowId(),
            } as IndicatorConfig;
          })
          .filter((item: IndicatorConfig | null): item is IndicatorConfig => Boolean(item))
      : [];

    const drawings = Array.isArray(value?.drawings)
      ? value.drawings
          .map((drawing: any) => normalizeDrawing(drawing))
          .filter((drawing: Drawing | null): drawing is Drawing => Boolean(drawing))
      : [];

    const redoStack = Array.isArray(value?.redoStack)
      ? value.redoStack
          .map((drawing: any) => normalizeDrawing(drawing))
          .filter((drawing: Drawing | null): drawing is Drawing => Boolean(drawing))
      : [];

    next[symbol] = {
      indicators,
      drawings,
      redoStack,
      chartStyle:
        value?.chartStyle === "CANDLE" ||
        value?.chartStyle === "LINE" ||
        value?.chartStyle === "AREA" ||
        value?.chartStyle === "HEIKIN_ASHI"
          ? value.chartStyle
          : undefined,
    };
  }

  return next;
}

export interface AnalysisState {
  isAnalysisMode: boolean;
  timeframe: string;
  range: string;
  activeTool: ToolType;
  interactionState: InteractionState;
  selectedDrawingId: string | null;
  selectedDrawingIds: string[];
  chartStyle: ChartStyle;
  chartStyleBySymbol: Record<string, ChartStyle>;
  hotkeysEnabled: boolean;
  indicatorPresetsBySymbol: Record<string, IndicatorConfig[]>;
  symbolState: Record<string, SymbolAnalysisState>;

  setAnalysisMode: (isOpen: boolean) => void;
  setTimeframe: (tf: string) => void;
  setRange: (r: string) => void;
  setChartStyle: (style: ChartStyle) => void;
  setChartStyleForSymbol: (symbol: string, style: ChartStyle) => void;
  getChartStyle: (symbol: string) => ChartStyle;
  setHotkeysEnabled: (enabled: boolean) => void;
  setActiveTool: (tool: ToolType) => void;

  setSelectedDrawing: (id: string | null) => void;
  setSelectedDrawings: (ids: string[]) => void;
  toggleDrawingSelection: (id: string, additive?: boolean) => void;

  startDrawing: (point: Point) => void;
  startDragging: (id: string, startPoint: Point, originalDrawing: Drawing) => void;
  updateDraft: (point: Point) => void;
  commitDrawing: (symbol: string) => void;
  cancelDrawing: () => void;

  updateDrawing: (symbol: string, drawing: Drawing) => void;
  undoDrawing: (symbol: string) => void;
  redoDrawing: (symbol: string) => void;

  addIndicator: (symbol: string, config: Omit<IndicatorConfig, "id">) => void;
  updateIndicator: (symbol: string, id: string, updater: Partial<IndicatorConfig>) => void;
  removeIndicator: (symbol: string, id: string) => void;
  clearIndicators: (symbol: string) => void;

  addDrawing: (symbol: string, drawing: Omit<Drawing, "id">) => void;
  removeDrawing: (symbol: string, id: string) => void;
  deleteDrawing: (symbol: string, id: string) => void;
  deleteSelectedDrawings: (symbol: string) => void;
  clearDrawings: (symbol: string) => void;
  setDrawingVisibility: (symbol: string, drawingId: string, visible: boolean) => void;
  setSelectedDrawingsLocked: (symbol: string, locked: boolean) => void;

  getIndicators: (symbol: string) => IndicatorConfig[];
  getDrawings: (symbol: string) => Drawing[];
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      isAnalysisMode: false,
      timeframe: "5m",
      range: "1D",
      activeTool: "crosshair",
      interactionState: { status: "idle" },
      selectedDrawingId: null,
      selectedDrawingIds: [],
      chartStyle: "CANDLE",
      chartStyleBySymbol: {},
      hotkeysEnabled: true,
      indicatorPresetsBySymbol: {},
      symbolState: {},

      setAnalysisMode: (isOpen) => set({ isAnalysisMode: isOpen }),
      setTimeframe: (tf) => set({ timeframe: tf }),
      setRange: (r) => set({ range: r }),
      setChartStyle: (style) => set({ chartStyle: style }),
      setChartStyleForSymbol: (symbol, style) =>
        set((state) => ({
          chartStyle: style,
          chartStyleBySymbol: {
            ...state.chartStyleBySymbol,
            [symbol]: style,
          },
          symbolState: {
            ...state.symbolState,
            [symbol]: {
              ...(state.symbolState[symbol] || createSymbolState()),
              chartStyle: style,
            },
          },
        })),
      getChartStyle: (symbol) => {
        const state = get();
        return state.chartStyleBySymbol[symbol] || state.symbolState[symbol]?.chartStyle || state.chartStyle;
      },
      setHotkeysEnabled: (enabled) => set({ hotkeysEnabled: enabled }),
      setActiveTool: (tool) =>
        set({
          activeTool: tool,
          interactionState: { status: "idle" },
        }),

      setSelectedDrawing: (id) =>
        set({
          selectedDrawingId: id,
          selectedDrawingIds: id ? [id] : [],
        }),
      setSelectedDrawings: (ids) =>
        set({
          selectedDrawingIds: ids,
          selectedDrawingId: ids[0] || null,
        }),
      toggleDrawingSelection: (id, additive = false) =>
        set((state) => {
          const next = additive ? toggleId(state.selectedDrawingIds, id) : [id];
          return {
            selectedDrawingIds: next,
            selectedDrawingId: next[0] || null,
          };
        }),

      startDrawing: (point) =>
        set({
          interactionState: {
            status: "drawing",
            dragStartPoint: point,
            currentPoint: point,
          },
          selectedDrawingId: null,
          selectedDrawingIds: [],
        }),
      startDragging: (id, startPoint, originalDrawing) =>
        set({
          interactionState: {
            status: "dragging",
            activeDrawingIds: [id],
            dragStartPoint: startPoint,
            originalDrawings: { [id]: originalDrawing },
            currentPoint: startPoint,
          },
          selectedDrawingId: id,
          selectedDrawingIds: [id],
        }),
      updateDraft: (point) =>
        set((state) => ({
          interactionState: {
            ...state.interactionState,
            currentPoint: point,
          },
        })),
      commitDrawing: (symbol) => {
        const { activeTool, interactionState } = get();
        if (
          interactionState.status !== "drawing" ||
          !interactionState.dragStartPoint ||
          !interactionState.currentPoint
        ) {
          return;
        }

        let draft: Omit<Drawing, "id"> | null = null;
        if (activeTool === "trendline" || activeTool === "ray" || activeTool === "rectangle") {
          draft = {
            type: activeTool,
            visible: true,
            locked: false,
            p1: interactionState.dragStartPoint,
            p2: interactionState.currentPoint,
          } as Omit<TwoPointDrawing, "id">;
        }

        if (draft) get().addDrawing(symbol, draft);
        set({ interactionState: { status: "idle" } });
      },
      cancelDrawing: () => set({ interactionState: { status: "idle" } }),

      updateDrawing: (symbol, drawing) =>
        set((state) => {
          const current = state.symbolState[symbol] || createSymbolState();
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.map((d) => (d.id === drawing.id ? drawing : d)),
              },
            },
          };
        }),

      undoDrawing: (symbol) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || current.drawings.length === 0) return state;
          const nextDrawings = [...current.drawings];
          const popped = nextDrawings.pop();
          if (!popped) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: nextDrawings,
                redoStack: [...current.redoStack, popped],
              },
            },
          };
        }),
      redoDrawing: (symbol) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || current.redoStack.length === 0) return state;
          const redoStack = [...current.redoStack];
          const restored = redoStack.pop();
          if (!restored) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [...current.drawings, restored],
                redoStack,
              },
            },
          };
        }),

      addIndicator: (symbol, config) =>
        set((state) => {
          const current = state.symbolState[symbol] || createSymbolState();
          const normalized = normalizeIndicator(config);
          const duplicate = current.indicators.some((item) => item.type === normalized.type);
          if (duplicate) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: [...current.indicators, { ...normalized, id: nowId() }],
              },
            },
          };
        }),

      updateIndicator: (symbol, id, updater) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: current.indicators.map((indicator) => {
                  if (indicator.id !== id) return indicator;
                  const merged = {
                    ...indicator,
                    ...updater,
                    params: {
                      ...indicator.params,
                      ...(updater.params || {}),
                    },
                    display: {
                      ...indicator.display,
                      ...(updater.display || {}),
                    },
                  };
                  const normalized = normalizeIndicator({
                    ...merged,
                    type: merged.type,
                    source: merged.source,
                  });
                  return {
                    ...normalized,
                    id: indicator.id,
                  };
                }),
              },
            },
          };
        }),

      removeIndicator: (symbol, id) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: current.indicators.filter((indicator) => indicator.id !== id),
              },
            },
          };
        }),
      clearIndicators: (symbol) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: [],
              },
            },
          };
        }),

      addDrawing: (symbol, drawing) =>
        set((state) => {
          const current = state.symbolState[symbol] || createSymbolState();
          const next = {
            ...drawing,
            id: nowId(),
            visible: drawing.visible ?? true,
            locked: drawing.locked ?? false,
            zIndex: drawing.zIndex ?? current.drawings.length + 1,
          } as Drawing;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [...current.drawings, next],
                redoStack: [],
              },
            },
          };
        }),

      removeDrawing: (symbol, id) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          const selectedDrawingIds = state.selectedDrawingIds.filter((item) => item !== id);
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.filter((drawing) => drawing.id !== id),
              },
            },
            selectedDrawingIds,
            selectedDrawingId: selectedDrawingIds[0] || null,
          };
        }),
      deleteDrawing: (symbol, id) => get().removeDrawing(symbol, id),
      deleteSelectedDrawings: (symbol) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || state.selectedDrawingIds.length === 0) return state;
          const selected = new Set(state.selectedDrawingIds);
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.filter((drawing) => !selected.has(drawing.id)),
              },
            },
            selectedDrawingId: null,
            selectedDrawingIds: [],
          };
        }),
      clearDrawings: (symbol) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [],
                redoStack: [],
              },
            },
            selectedDrawingId: null,
            selectedDrawingIds: [],
          };
        }),
      setDrawingVisibility: (symbol, drawingId, visible) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.map((drawing) =>
                  drawing.id === drawingId ? { ...drawing, visible } : drawing
                ),
              },
            },
          };
        }),
      setSelectedDrawingsLocked: (symbol, locked) =>
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || state.selectedDrawingIds.length === 0) return state;
          const selected = new Set(state.selectedDrawingIds);
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.map((drawing) =>
                  selected.has(drawing.id) ? { ...drawing, locked } : drawing
                ),
              },
            },
          };
        }),

      getIndicators: (symbol) => get().symbolState[symbol]?.indicators || [],
      getDrawings: (symbol) => get().symbolState[symbol]?.drawings || [],
    }),
    {
      name: "analysis-storage-v2",
      version: 2,
      migrate: (persistedState: any, version) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const symbolState = normalizeSymbolStateRecord(persistedState.symbolState);
        const chartStyleBySymbol = { ...(persistedState.chartStyleBySymbol || {}) } as Record<string, ChartStyle>;

        if (version < 2) {
          for (const [symbol, value] of Object.entries(symbolState)) {
            if (value?.chartStyle && !chartStyleBySymbol[symbol]) {
              chartStyleBySymbol[symbol] = value.chartStyle;
            }
          }
        }

        const chartStyle =
          persistedState.chartStyle === "CANDLE" ||
          persistedState.chartStyle === "LINE" ||
          persistedState.chartStyle === "AREA" ||
          persistedState.chartStyle === "HEIKIN_ASHI"
            ? persistedState.chartStyle
            : "CANDLE";

        return {
          ...persistedState,
          symbolState,
          chartStyle,
          chartStyleBySymbol,
        };
      },
      partialize: (state) => ({
        symbolState: state.symbolState,
        chartStyle: state.chartStyle,
        chartStyleBySymbol: state.chartStyleBySymbol,
        hotkeysEnabled: state.hotkeysEnabled,
        indicatorPresetsBySymbol: state.indicatorPresetsBySymbol,
      }),
    }
  )
);
