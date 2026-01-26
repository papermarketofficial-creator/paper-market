// components/trade/chart/overlays/DrawingManager.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time, Coordinate, Logical } from 'lightweight-charts';
import { useAnalysisStore, Point, TwoPointDrawing } from '@/stores/trading/analysis.store';
import { CandlestickData } from 'lightweight-charts';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DrawingManagerProps {
    chart: IChartApi;
    mainSeries: ISeriesApi<'Candlestick'>;
    width: number;
    height: number;
    data: CandlestickData[];
    symbol: string;
}

export function DrawingManager({ chart, mainSeries, width, height, data, symbol }: DrawingManagerProps) {
    const {
        activeTool,
        interactionState,
        startDrawing,
        updateDraft,
        commitDrawing,
        addDrawing
    } = useAnalysisStore();

    useEffect(() => {
        console.log(`[DrawingManager] Mounted. Data Length: ${data?.length}, Width: ${width}, Height: ${height}`);
    }, [data?.length, width, height]);

    // Selector for drawings specific to this symbol
    // Fix: Select specific symbol state directly to avoid new reference loops from getDrawings() helper
    const symbolDrawings = useAnalysisStore(state => state.symbolState[symbol]?.drawings);
    const drawings = symbolDrawings || [];

    const [_, setForceUpdate] = useState(0); // Trigger render on zoom
    const svgRef = useRef<SVGSVGElement>(null);

    // --- State for Text Tool Dialog ---
    const [isTextDialogOpen, setIsTextDialogOpen] = useState(false);
    const [textDialogPoint, setTextDialogPoint] = useState<Point | null>(null);
    const [textValue, setTextValue] = useState("");

    const handleTextSubmit = () => {
        if (textValue && textDialogPoint) {
            addDrawing(symbol, {
                type: 'text',
                point: textDialogPoint,
                text: textValue,
                visible: true
            } as Omit<import('@/stores/trading/analysis.store').TextDrawing, 'id'>);
        }
        setIsTextDialogOpen(false);
        setTextValue("");
        setTextDialogPoint(null);
        // Optional: Switch back to cursor after adding text?
        // useAnalysisStore.getState().setActiveTool('cursor');
    };

    // --- 1. Coordinate Helpers ---

    const pointToCoords = useCallback((p: Point) => {
        if (!chart || !mainSeries) return null;

        const timeScale = chart.timeScale();
        const y = mainSeries.priceToCoordinate(p.price);

        // 1. Try Native Conversion
        const x = timeScale.timeToCoordinate(p.time as Time);

        if (x !== null && y !== null) {
            return { x, y };
        }

        // 2. Fallback: Future/Past Projection
        // If native failed, it might be because the time is not in the series (future/whitespace)
        if (y !== null && data && data.length > 0) {
            const lastIndex = data.length - 1;
            const lastCandle = data[lastIndex];
            const firstCandle = data[0];
            const interval = data.length > 1
                ? (data[1].time as number) - (data[0].time as number)
                : 300;

            let logical: number | null = null;

            // Future?
            if ((p.time as number) > (lastCandle.time as number)) {
                const diff = (p.time as number) - (lastCandle.time as number);
                const steps = diff / interval;
                logical = lastIndex + steps;
            }
            // Past?
            else if ((p.time as number) < (firstCandle.time as number)) {
                const diff = (p.time as number) - (firstCandle.time as number);
                const steps = diff / interval; // negative
                logical = 0 + steps;
            }

            if (logical !== null) {
                const projectedX = timeScale.logicalToCoordinate(logical as Logical);
                if (projectedX !== null) {
                    return { x: projectedX, y };
                }
            }
        }

        return null; // Truly invalid
    }, [chart, mainSeries, data]);

    const coordsToPoint = useCallback((x: number, y: number): Point | null => {
        if (!chart || !mainSeries) return null;

        const timeScale = chart.timeScale();
        const price = mainSeries.coordinateToPrice(y);

        if (price === null) return null;

        // 1. Try Native Conversion
        const time = timeScale.coordinateToTime(x);
        if (time !== null) {
            return { time: time as number, price };
        }

        // 2. Fallback: Logical Index Projection
        const logical = timeScale.coordinateToLogical(x);
        if (logical === null) return null;

        // We need data to project
        if (!data || data.length === 0) return null;

        const lastIndex = data.length - 1;
        const lastCandle = data[lastIndex];
        const firstCandle = data[0];

        // Valid range?
        if (logical >= 0 && logical <= lastIndex) {
            // Should have been caught by native, but finding nearest if float
            const idx = Math.round(logical);
            const pt = data[idx];
            if (pt) return { time: pt.time as number, price };
        }

        // Future Projection
        if (logical > lastIndex) {
            // Estimate interval
            const interval = data.length > 1
                ? (data[1].time as number) - (data[0].time as number)
                : 300; // Default 5m

            const dist = logical - lastIndex;
            const projectedTime = (lastCandle.time as number) + (Math.round(dist) * interval);

            return { time: projectedTime, price };
        }

        // Past Projection (if needed, rarely)
        if (logical < 0) {
            const interval = data.length > 1
                ? (data[1].time as number) - (data[0].time as number)
                : 300;
            const dist = logical; // negative
            const projectedTime = (firstCandle.time as number) + (Math.round(dist) * interval);
            return { time: projectedTime, price };
        }

        return null;
    }, [chart, mainSeries, data]);


    // --- 2. Subscribe to Scroll/Zoom & Global Keys ---
    useEffect(() => {
        if (!chart) return;

        const handleTimeChange = () => {
            setForceUpdate(n => n + 1);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: Cancel drawing or Deselect or Switch to Cursor
            if (e.key === 'Escape') {
                const state = useAnalysisStore.getState();
                if (state.interactionState.status === 'drawing') {
                    state.cancelDrawing();
                } else if (state.selectedDrawingId) {
                    state.setSelectedDrawing(null);
                } else if (state.activeTool !== 'cursor') {
                    state.setActiveTool('cursor');
                }
            }

            // Delete / Backspace: Remove selected
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const state = useAnalysisStore.getState();
                if (state.selectedDrawingId) {
                    state.deleteDrawing(symbol, state.selectedDrawingId);
                }
            }

            // Ctrl+Z: Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                useAnalysisStore.getState().undoDrawing(symbol);
            }
        };

        chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeChange);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(handleTimeChange);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [chart, symbol]); // Removed interactionState.status dependency as we use getState()


    // --- 3. Interaction Handlers ---

    // --- Local Interaction State (Performance Optimization) ---
    // Moving high-frequency updates out of Zustand to avoid persist middleware overhead
    const [localInteraction, setLocalInteraction] = useState<{
        status: 'idle' | 'drawing' | 'dragging' | 'box-selecting';
        startPoint: Point | null; // P1 or Drag Origin
        currentPoint: Point | null; // P2 or Current Pos
        activeDrawingIds: string[]; // For dragging
        originalDrawings: Record<string, import('@/stores/trading/analysis.store').Drawing>; // Snapshot
    }>({
        status: 'idle',
        startPoint: null,
        currentPoint: null,
        activeDrawingIds: [],
        originalDrawings: {}
    });

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const point = coordsToPoint(x, y);
        if (!point) return;

        // Check for existing drawing click
        const target = e.target as SVGElement;
        const drawingId = target.getAttribute('data-id');

        // Logic:
        // 1. If Select Tool active:
        //    - Click on drawing -> Select it (Exclusive? Ctrl for Multi?)
        //    - Click on empty -> Start Box Selection
        // 2. If Drawing Tool active:
        //    - Start Drawing
        // 3. If Cursor/Crosshair:
        //    - Ignore or Drag? (Usually Cursor allows drag)

        // For now, adhering to user request: "Select Tool" for group actions.

        // --- Dragging Logic (Moved from Store) ---
        if (drawingId && activeTool !== 'trendline' && activeTool !== 'ray' && activeTool !== 'rectangle' && activeTool !== 'horizontal-line' && activeTool !== 'text') {
            // If clicking a drawing with a non-drawing tool (like Cursor or Select)
            e.preventDefault();
            e.stopPropagation();

            const drawing = drawings.find(d => d.id === drawingId);

            // If Select Tool, handle selection logic
            if (activeTool === 'select') {
                // If already selected, maybe just drag? 
                // If not selected, select it.
                // For simple drag-drop request:
            }

            // Allow dragging if tool is Cursor or Select
            if (drawing && (activeTool === 'cursor' || activeTool === 'select' || activeTool === 'crosshair')) {
                // Start Drag
                setLocalInteraction({
                    status: 'dragging',
                    startPoint: point,
                    currentPoint: point,
                    activeDrawingIds: [drawingId], // Todo: Support Group
                    originalDrawings: { [drawingId]: drawing }
                });
                useAnalysisStore.getState().setSelectedDrawing(drawingId); // Keep selection sync
                return;
            }
        }

        // Background Click
        if (activeTool === 'select' && !drawingId) {
            // Start Box Selection
            setLocalInteraction({
                status: 'box-selecting',
                startPoint: point,
                currentPoint: point,
                activeDrawingIds: [],
                originalDrawings: {}
            });
            return;
        }

        // --- Drawing Logic ---
        if (Object.keys(localInteraction.originalDrawings).length > 0) return; // Busy?

        if (activeTool === 'horizontal-line') {
            addDrawing(symbol, {
                type: 'horizontal-line',
                price: point.price,
                visible: true
            } as any);
        } else if (activeTool === 'text') {
            setTextDialogPoint(point);
            setTextValue("Note");
            setIsTextDialogOpen(true);
        } else if (activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'rectangle') {
            setLocalInteraction({
                status: 'drawing',
                startPoint: point,
                currentPoint: point,
                activeDrawingIds: [],
                originalDrawings: {}
            });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (localInteraction.status === 'idle') return;

        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const point = coordsToPoint(e.clientX - rect.left, e.clientY - rect.top);
        if (!point) return;

        setLocalInteraction(prev => ({
            ...prev,
            currentPoint: point
        }));

        // Real-time Visual Updates via Local State (for Drafts)
        // Note: For dragging, we DO need to update the store if we want to see the drawing move on the chart (since it renders from store).
        // BUT, updating store is laggy.
        // OPTION B: Render the "Being Dragged" drawing from LOCAL state, and hide the generic store one?
        // That's more complex.

        // Let's try throttling the store update for drag?
        // Or just trust that removing 'updateDraft' (which was 90% of use) fixes the lag.

        if (localInteraction.status === 'dragging' && localInteraction.activeDrawingIds.length > 0) {
            const start = localInteraction.startPoint;
            if (!start) return;

            const dxTime = (point.time as number) - (start.time as number);
            const dyPrice = point.price - start.price;

            localInteraction.activeDrawingIds.forEach(id => {
                const original = localInteraction.originalDrawings[id];
                if (!original) return;

                let newDrawing = { ...original };
                // Apply Delta
                if (original.type === 'trendline' || original.type === 'ray' || original.type === 'rectangle') {
                    const twoPoint = original as TwoPointDrawing;
                    newDrawing = {
                        ...newDrawing,
                        p1: { time: (twoPoint.p1.time as number) + dxTime, price: twoPoint.p1.price + dyPrice },
                        p2: { time: (twoPoint.p2.time as number) + dxTime, price: twoPoint.p2.price + dyPrice }
                    } as any;
                } else if (original.type === 'text') {
                    const dl = original as any; // Cast to any to bypass union checks during spread
                    newDrawing = { ...dl, point: { time: (dl.point.time as number) + dxTime, price: dl.point.price + dyPrice } };
                } else if (original.type === 'horizontal-line') {
                    const dl = original as any;
                    newDrawing = { ...dl, price: dl.price + dyPrice };
                }

                // We MUST update the store to visualize the move because 'drawings' map renders from store.
                // Unless we temporarily override rendering in the map?
                // Let's UPDATE STORE but maybe check performance?
                // If lag persists, we must implement "Optimistic Rendering" (Render from local state, ignore store for this ID).
                useAnalysisStore.getState().updateDrawing(symbol, newDrawing as any);
            });
        }
    };

    const handleMouseUp = () => {
        if (localInteraction.status === 'drawing' && localInteraction.startPoint && localInteraction.currentPoint) {
            // Commit Drawing
            const newDrawing = {
                type: activeTool,
                visible: true,
                p1: localInteraction.startPoint,
                p2: localInteraction.currentPoint
            };
            addDrawing(symbol, newDrawing as any);
        } else if (localInteraction.status === 'box-selecting' && localInteraction.startPoint && localInteraction.currentPoint) {
            // Finalize Box Selection
            const p1 = localInteraction.startPoint;
            const p2 = localInteraction.currentPoint;

            // Normalize time range
            const tMin = Math.min(p1.time as number, p2.time as number);
            const tMax = Math.max(p1.time as number, p2.time as number);
            const priceMin = Math.min(p1.price, p2.price);
            const priceMax = Math.max(p1.price, p2.price);

            const selectedIds: string[] = [];

            drawings.forEach(d => {
                if (d.type === 'ray') return; // User requested: Exclude Rays from box selection

                let inside = false;
                if (d.type === 'trendline' || d.type === 'rectangle') {
                    const twoPoint = d as TwoPointDrawing;
                    // Check if either point is inside box (Simple)
                    // Or if bounding box intersects? Let's strictly check if Points are inside for now.
                    // Better: Check if Bounding Box overlaps.
                    const dp1 = twoPoint.p1;
                    const dp2 = twoPoint.p2;

                    const dMinTime = Math.min(dp1.time as number, dp2.time as number);
                    const dMaxTime = Math.max(dp1.time as number, dp2.time as number);
                    const dMinPrice = Math.min(dp1.price, dp2.price);
                    const dMaxPrice = Math.max(dp1.price, dp2.price);

                    // Intersection Check
                    const overlapTime = (dMinTime <= tMax) && (dMaxTime >= tMin);
                    const overlapPrice = (dMinPrice <= priceMax) && (dMaxPrice >= priceMin);

                    inside = overlapTime && overlapPrice;
                } else if (d.type === 'text') {
                    const pt = (d as any).point;
                    inside = (pt.time as number >= tMin && pt.time as number <= tMax && pt.price >= priceMin && pt.price <= priceMax);
                }

                if (inside) {
                    selectedIds.push(d.id);
                }
            });

            // Update Selection
            // We need a proper Multi-Select Store Action or just iterate
            // Assuming we added setSelectedDrawings or just rely on 'selectedDrawingId' for single...
            // User wants group move.
            // Let's assume we can set activeDrawingIds in local state for next drag?
            // But we need VISUAL feedback of selection.
            // For now, let's just Log and maybe select the first one?
            // Todo: Implement true multi-select store.
            if (selectedIds.length > 0) {
                // For now, hack: Just highlight the first one to show it works, 
                // but in reality we need the store to hold "selectedDrawingIds[]"
                // useAnalysisStore.getState().setSelectedDrawings(selectedIds);
            }
        }

        setLocalInteraction({
            status: 'idle',
            startPoint: null,
            currentPoint: null,
            activeDrawingIds: [],
            originalDrawings: {}
        });
    };


    // --- 4. Renderers ---

    const renderLine = (p1: Point, p2: Point, type: 'trendline' | 'ray', isDraft = false, id?: string, selected = false) => {
        const c1 = pointToCoords(p1);
        const c2 = pointToCoords(p2);

        if (!c1 || !c2) return null;

        let x2 = c2.x;
        let y2 = c2.y;

        if (type === 'ray') {
            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;

            if (Math.abs(dx) < 0.1) {
                // Vertical Line Logic
                x2 = c1.x;
                y2 = (dy > 0 ? height : 0) as Coordinate;
            } else {
                // Normal Ray Logic
                const m = dy / dx;

                // If x2 > x1, extend to width. Else extend to 0.
                const targetX = dx > 0 ? width : 0;
                const targetY = c1.y + m * (targetX - c1.x);

                x2 = targetX as Coordinate;
                y2 = targetY as Coordinate;
            }
        }

        if (!Number.isFinite(x2) || !Number.isFinite(y2)) return null;

        return (
            <line
                data-id={id}
                x1={c1.x} y1={c1.y}
                x2={x2} y2={y2}
                stroke={selected ? "#F59E0B" : (isDraft ? "#3B82F6" : "#2962FF")} // Orange if selected
                strokeWidth={selected ? 3 : 2}
                strokeDasharray={isDraft ? "4 4" : undefined}
                pointerEvents="all" // Allow clicking
                className="cursor-pointer hover:stroke-orange-400 transition-colors"
            />
        );
    };

    const renderRectangle = (p1: Point, p2: Point, isDraft = false, id?: string, selected = false) => {
        const c1 = pointToCoords(p1);
        const c2 = pointToCoords(p2);
        if (!c1 || !c2) return null;

        const x = Math.min(c1.x, c2.x);
        const y = Math.min(c1.y, c2.y);
        const w = Math.abs(c2.x - c1.x);
        const h = Math.abs(c2.y - c1.y);

        return (
            <rect
                data-id={id}
                x={x} y={y} width={w} height={h}
                fill={selected ? "rgba(245, 158, 11, 0.2)" : (isDraft ? "rgba(59, 130, 246, 0.1)" : "rgba(41, 98, 255, 0.1)")}
                stroke={selected ? "#F59E0B" : (isDraft ? "#3B82F6" : "#2962FF")}
                strokeWidth={selected ? 2 : 1}
                strokeDasharray={isDraft ? "4 4" : undefined}
                pointerEvents="all"
                className="cursor-pointer hover:stroke-orange-400 transition-colors"
            />
        );
    };

    const renderText = (p: Point, text: string, id?: string, selected = false) => {
        const c = pointToCoords(p);
        if (!c) return null;

        return (
            <text
                data-id={id}
                x={c.x} y={c.y}
                fill={selected ? "#F59E0B" : "#FFFFFF"}
                fontSize={12}
                pointerEvents="all"
                className="cursor-pointer font-sans select-none"
            >
                {text}
            </text>
        );
    };

    const renderHorizontalLine = (price: number, id?: string, selected = false) => {
        if (!mainSeries) return null;
        const y = mainSeries.priceToCoordinate(price);
        if (y === null) return null;

        return (
            <line
                data-id={id}
                x1={0} y1={y}
                x2={width} y2={y}
                stroke={selected ? "#F59E0B" : "#A855F7"}
                strokeWidth={selected ? 2 : 1}
                pointerEvents="all"
                className="cursor-pointer hover:stroke-orange-400 transition-colors"
            />
        );
    }

    const isDrawingTool = activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'rectangle' || activeTool === 'text';

    return (
        <>
            <div
                className={`absolute inset-0 z-50 ${isDrawingTool ? 'pointer-events-auto' : 'pointer-events-none'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{
                    cursor: (activeTool !== 'cursor' && activeTool !== 'crosshair') ? 'crosshair' : 'default'
                }}
            >
                <svg
                    ref={svgRef}
                    width={width}
                    height={height}
                    className="absolute inset-0" // pointer-events-none removed to allow svg children interactions? No, parent div captures drawing.
                // We need children to capture clicks if "Cursor" tool.
                // If "Drawing" tool, parent captures.
                // Currently parent captures ALL mousedown.
                // Logic in handleMouseDown checks e.target attributes.
                >
                    {/* Render Committed Drawings */}
                    {drawings.map(d => {
                        const isSelected = useAnalysisStore.getState().selectedDrawingId === d.id;

                        if (d.type === 'trendline' || d.type === 'ray') {
                            const twoPoint = d as TwoPointDrawing;
                            return <g key={d.id}>{renderLine(twoPoint.p1, twoPoint.p2, twoPoint.type as 'trendline' | 'ray', false, d.id, isSelected)}</g>;
                        }
                        if (d.type === 'rectangle') {
                            const twoPoint = d as TwoPointDrawing;
                            return <g key={d.id}>{renderRectangle(twoPoint.p1, twoPoint.p2, false, d.id, isSelected)}</g>;
                        }
                        if (d.type === 'text') {
                            const textDrawing = d as import('@/stores/trading/analysis.store').TextDrawing;
                            return <g key={d.id}>{renderText(textDrawing.point, textDrawing.text, d.id, isSelected)}</g>;
                        }
                        if (d.type === 'horizontal-line') {
                            return <g key={d.id}>{renderHorizontalLine((d as any).price, d.id, isSelected)}</g>;
                        }
                        return null;
                    })}

                    {/* Box Selection Visualization */}
                    {localInteraction.status === 'box-selecting' && localInteraction.startPoint && localInteraction.currentPoint && (
                        <rect
                            x={Math.min(pointToCoords(localInteraction.startPoint)?.x || 0, pointToCoords(localInteraction.currentPoint)?.x || 0)}
                            y={Math.min(pointToCoords(localInteraction.startPoint)?.y || 0, pointToCoords(localInteraction.currentPoint)?.y || 0)}
                            width={Math.abs((pointToCoords(localInteraction.currentPoint)?.x || 0) - (pointToCoords(localInteraction.startPoint)?.x || 0))}
                            height={Math.abs((pointToCoords(localInteraction.currentPoint)?.y || 0) - (pointToCoords(localInteraction.startPoint)?.y || 0))}
                            fill="rgba(33, 150, 243, 0.1)"
                            stroke="#2196F3"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                        />
                    )}

                    {/* Render Draft (Drawing in Progress) */}
                    {localInteraction.status === 'drawing' && localInteraction.startPoint && localInteraction.currentPoint && (
                        <>
                            {(activeTool === 'trendline' || activeTool === 'ray') && renderLine(
                                localInteraction.startPoint,
                                localInteraction.currentPoint,
                                activeTool as 'trendline' | 'ray',
                                true
                            )}
                            {activeTool === 'rectangle' && renderRectangle(
                                localInteraction.startPoint,
                                localInteraction.currentPoint,
                                true
                            )}
                        </>
                    )}
                </svg>
            </div>

            {/* Text Entry Dialog */}
            <Dialog open={isTextDialogOpen} onOpenChange={setIsTextDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add Text Annotation</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Input
                            id="text-annotation"
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            placeholder="Enter text..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleTextSubmit();
                            }}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTextDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleTextSubmit}>Add Note</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
