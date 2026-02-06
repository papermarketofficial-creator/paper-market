// Stores/trading/analysis.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// --- Configuration ---
const DEBUG = true;
function log(msg: string, ...args: any[]) {
  if (DEBUG) console.log(`[Analysis] ${msg}`, ...args);
}

// --- Primitives ---
export interface Point {
  time: number; // Unix timestamp
  price: number;
}

// --- Drawings ---
export type DrawingType = 'trendline' | 'ray' | 'horizontal-line' | 'rectangle' | 'text';

export interface BaseDrawing {
  id: string;
  type: DrawingType;
  visible: boolean;
  locked?: boolean;
}

export interface HorizontalLineDrawing extends BaseDrawing {
  type: 'horizontal-line';
  price: number;
}

export interface TwoPointDrawing extends BaseDrawing {
  type: 'trendline' | 'ray' | 'rectangle';
  p1: Point;
  p2: Point;
}

export interface TextDrawing extends BaseDrawing {
  type: 'text';
  point: Point;
  text: string;
}

export type Drawing = HorizontalLineDrawing | TwoPointDrawing | TextDrawing;

// --- Indicators ---
export type IndicatorType = 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'VOL' | 'BB';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period?: number; // For SMA, EMA, RSI
  color?: string;
  source: 'close' | 'open' | 'high' | 'low';

  // MACD Specifics
  fastPeriod?: number; // 12
  slowPeriod?: number; // 26
  signalPeriod?: number; // 9
  seriesColors?: {
    macd: string;
    signal: string;
    histogram: string;
  };
}

// --- Interaction State ---
export type InteractionStatus = 'idle' | 'drawing' | 'dragging' | 'box-selecting';

export type ToolType = 'cursor' | 'crosshair' | 'select' | DrawingType;

export interface InteractionState {
  status: InteractionStatus;
  dragStartPoint?: Point; // P1 (for creation) or Click Origin (for dragging)
  currentPoint?: Point; // Current Mouse Pos
  activeDrawingIds?: string[]; // IDs of drawing being dragged (Group)
  originalDrawings?: Record<string, Drawing>; // Snapshots for rollback/delta calc
}

// --- Per-Symbol State ---
interface SymbolAnalysisState {
  indicators: IndicatorConfig[];
  drawings: Drawing[];
  redoStack?: Drawing[]; // Stack for storing undone drawings
}

export interface AnalysisState {
  // Global View State (Shared across all symbols)
  isAnalysisMode: boolean;
  setAnalysisMode: (isOpen: boolean) => void;

  timeframe: string; // '1m' | '5m' etc. (DEPRECATED - use interval)
  setTimeframe: (tf: string) => void;

  range: string; // '1D', '5D', '1M', '3M', '6M', '1Y', '5Y'
  setRange: (r: string) => void;

  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  interactionState: InteractionState;

  selectedDrawingId: string | null;
  setSelectedDrawing: (id: string | null) => void;

  // Global Actions (Context-agnostic or set context)
  // Global Actions (Context-agnostic or set context)
  startDrawing: (point: Point) => void;
  startDragging: (id: string, startPoint: Point, originalDrawing: Drawing) => void;
  updateDraft: (point: Point) => void;
  commitDrawing: (symbol: string) => void; // Requires Symbol context on commit
  cancelDrawing: () => void;

  updateDrawing: (symbol: string, drawing: Drawing) => void;

  undoDrawing: (symbol: string) => void;
  redoDrawing: (symbol: string) => void;

  // Per-Symbol Data Map
  symbolState: Record<string, SymbolAnalysisState>;

  // Symbol-Aware Actions
  addIndicator: (symbol: string, config: Omit<IndicatorConfig, 'id'>) => void;
  removeIndicator: (symbol: string, id: string) => void;
  clearIndicators: (symbol: string) => void;

  addDrawing: (symbol: string, drawing: Omit<Drawing, 'id'>) => void;
  removeDrawing: (symbol: string, id: string) => void;
  deleteDrawing: (symbol: string, id: string) => void; // Alias for removeDrawing essentially
  clearDrawings: (symbol: string) => void;

  // Selectors
  getIndicators: (symbol: string) => IndicatorConfig[];
  getDrawings: (symbol: string) => Drawing[];
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      // --- Global View State ---
      isAnalysisMode: false,
      setAnalysisMode: (isOpen) => set({ isAnalysisMode: isOpen }),

      timeframe: '5m', // Default (DEPRECATED)
      setTimeframe: (tf) => set({ timeframe: tf }),

      range: '1D', // Default to 1 Day
      setRange: (r) => set({ range: r }),

      activeTool: 'crosshair',
      setActiveTool: (tool) => {
        log('Tool Changed', tool);
        set({
          activeTool: tool,
          interactionState: { status: 'idle' },
          selectedDrawingId: null // Clear selection on tool change
        });
      },

      interactionState: { status: 'idle' },
      selectedDrawingId: null,
      setSelectedDrawing: (id) => set({ selectedDrawingId: id }),

      // Interaction Actions
      startDrawing: (point) => set({
        interactionState: {
          status: 'drawing',
          dragStartPoint: point,
          currentPoint: point
        },
        selectedDrawingId: null
      }),

      startDragging: (id, startPoint, originalDrawing) => set({
        interactionState: {
          status: 'dragging',
          activeDrawingIds: [id],
          dragStartPoint: startPoint,
          originalDrawings: { [id]: originalDrawing },
          currentPoint: startPoint
        },
        selectedDrawingId: id
      }),

      updateDraft: (point) => set((state) => ({
        interactionState: {
          ...state.interactionState,
          currentPoint: point
        }
      })),

      updateDrawing: (symbol, drawing) => set((state) => {
        const current = state.symbolState[symbol];
        if (!current) return state;

        return {
          symbolState: {
            ...state.symbolState,
            [symbol]: {
              ...current,
              drawings: current.drawings.map(d => d.id === drawing.id ? drawing : d)
            }
          }
        };
      }),

      commitDrawing: (symbol) => {
        const { activeTool, interactionState } = get();
        if (interactionState.status !== 'drawing' || !interactionState.dragStartPoint || !interactionState.currentPoint) return;

        let newDrawing: Omit<Drawing, 'id'> | null = null;

        if (activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'rectangle') {
          newDrawing = {
            type: activeTool,
            visible: true,
            p1: interactionState.dragStartPoint,
            p2: interactionState.currentPoint
          } as Omit<TwoPointDrawing, 'id'>;
        }

        if (newDrawing) {
          log('Commit Drawing', symbol, newDrawing.type);
          get().addDrawing(symbol, newDrawing);
          set({ interactionState: { status: 'idle' } });
        } else {
          set({ interactionState: { status: 'idle' } });
        }
      },

      cancelDrawing: () => {
        log('Cancel Drawing');
        set({ interactionState: { status: 'idle' } });
      },


      // --- Symbol Data Management ---
      symbolState: {},

      getIndicators: (symbol) => {
        return get().symbolState[symbol]?.indicators || [];
      },

      getDrawings: (symbol) => {
        return get().symbolState[symbol]?.drawings || [];
      },

      undoDrawing: (symbol) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || current.drawings.length === 0) return state;

          const newDrawings = [...current.drawings];
          const popped = newDrawings.pop(); // Remove last

          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: newDrawings,
                redoStack: popped ? [...(current.redoStack || []), popped] : (current.redoStack || [])
              }
            }
          };
        });
      },

      redoDrawing: (symbol) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current || !current.redoStack || current.redoStack.length === 0) return state;

          const newRedoStack = [...current.redoStack];
          const restored = newRedoStack.pop();

          if (!restored) return state;

          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [...current.drawings, restored],
                redoStack: newRedoStack
              }
            }
          };
        });
      },

      deleteDrawing: (symbol, id) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;

          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.filter(d => d.id !== id)
              }
            },
            selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId
          };
        });
      },

      clearIndicators: (symbol) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: []
              }
            }
          }
        })
      },

      addIndicator: (symbol, config) => {
        set((state) => {
          const current = state.symbolState[symbol] || { indicators: [], drawings: [], redoStack: [] };

          // Deduplication (especially for MACD)
          if (config.type === 'MACD' && current.indicators.some(i => i.type === 'MACD')) {
            log('Add Indicator Blocked (Duplicate)', symbol, config.type);
            return state;
          }

          log('Add Indicator', symbol, config.type);

          // Default colors for MACD if missing
          const finalConfig = { ...config };
          if (finalConfig.type === 'MACD' && !finalConfig.seriesColors) {
            finalConfig.seriesColors = {
              macd: '#2962FF',
              signal: '#FF6D00',
              histogram: '#26a69a'
            };
          }

          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: [
                  ...current.indicators,
                  { ...finalConfig, id: Math.random().toString(36).substring(7) } as IndicatorConfig
                ]
              }
            }
          };
        });
      },

      removeIndicator: (symbol, id) => {
        log('Remove Indicator', symbol, id);
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                indicators: current.indicators.filter(i => i.id !== id)
              }
            }
          };
        });
      },

      addDrawing: (symbol, drawing) => {
        set((state) => {
          const current = state.symbolState[symbol] || { indicators: [], drawings: [], redoStack: [] };
          log('Add Drawing', symbol, drawing.type);
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [
                  ...current.drawings,
                  { ...drawing, id: Math.random().toString(36).substring(7) } as Drawing
                ],
                redoStack: [] // Clear redo stack on new action
              }
            }
          };
        });
      },

      removeDrawing: (symbol, id) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: current.drawings.filter(d => d.id !== id)
              }
            }
          };
        });
      },

      clearDrawings: (symbol) => {
        set((state) => {
          const current = state.symbolState[symbol];
          if (!current) return state;
          return {
            symbolState: {
              ...state.symbolState,
              [symbol]: {
                ...current,
                drawings: [],
                redoStack: []
              }
            }
          };
        });
      }
    }),
    {
      name: 'analysis-storage', // Keep same key? Might want to migrate or reset if structure changed.
      // Ideally new key to avoid conflicts with old flat structure
      version: 3, // Incremented for interval state
      partialize: (state) => ({
        symbolState: state.symbolState, // Only persist data
        // activeTool: state.activeTool // Optional: persist tool selection? User requested "defaults" so maybe not.
      }),
    }
  )
);
