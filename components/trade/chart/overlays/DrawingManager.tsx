// components/trade/chart/overlays/DrawingManager.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time, Coordinate } from 'lightweight-charts';
import { useAnalysisStore, Point, TwoPointDrawing } from '@/stores/trading/analysis.store';
import { CandlestickData } from 'lightweight-charts';

interface DrawingManagerProps {
    chart: IChartApi;
    mainSeries: ISeriesApi<'Candlestick'>;
    width: number;
    height: number;
    data: CandlestickData[];
    symbol: string;
}

export function DrawingManager({ chart, mainSeries, width, height, symbol }: DrawingManagerProps) {
    const {
        activeTool,
        interactionState,
        startDrawing,
        updateDraft,
        commitDrawing,
        addDrawing
    } = useAnalysisStore();

    // Selector for drawings specific to this symbol
    // Fix: Select specific symbol state directly to avoid new reference loops from getDrawings() helper
    const symbolDrawings = useAnalysisStore(state => state.symbolState[symbol]?.drawings);
    const drawings = symbolDrawings || [];

    const [_, setForceUpdate] = useState(0); // Trigger render on zoom
    const svgRef = useRef<SVGSVGElement>(null);

    // --- 1. Coordinate Helpers ---

    const pointToCoords = useCallback((p: Point) => {
        if (!chart || !mainSeries) return null;

        // Time -> X
        const x = chart.timeScale().timeToCoordinate(p.time as Time);

        // Price -> Y
        const y = mainSeries.priceToCoordinate(p.price);

        // Filter off-screen or invalid
        if (x === null || y === null) return null;

        return { x, y };
    }, [chart, mainSeries]);

    const coordsToPoint = useCallback((x: number, y: number): Point | null => {
        if (!chart || !mainSeries) return null;

        const time = chart.timeScale().coordinateToTime(x);
        const price = mainSeries.coordinateToPrice(y);

        if (time === null || price === null) return null;

        return {
            time: time as number,
            price
        };
    }, [chart, mainSeries]);


    // --- 2. Subscribe to Scroll/Zoom & Global Keys ---
    useEffect(() => {
        if (!chart) return;

        const handleTimeChange = () => {
            setForceUpdate(n => n + 1);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (interactionState.status === 'drawing') {
                    useAnalysisStore.getState().cancelDrawing();
                }
            }
        };

        chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeChange);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(handleTimeChange);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [chart, interactionState.status]);


    // --- 3. Interaction Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool === 'cursor' || activeTool === 'crosshair') return;

        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const point = coordsToPoint(x, y);
        if (!point) return;

        if (activeTool === 'horizontal-line') {
            // Instant place
            addDrawing(symbol, {
                type: 'horizontal-line',
                price: point.price,
                visible: true
            } as Omit<import('@/stores/trading/analysis.store').HorizontalLineDrawing, 'id'>);
        } else if (activeTool === 'trendline' || activeTool === 'ray') {
            // Start 2-point drag
            startDrawing(point);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (interactionState.status !== 'drawing') return;

        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const point = coordsToPoint(x, y);
        if (point) {
            updateDraft(point);
        }
    };

    const handleMouseUp = () => {
        if (interactionState.status === 'drawing') {
            commitDrawing(symbol); // ✅ Pass Symbol
        }
    };


    // --- 4. Renderers ---

    const renderLine = (p1: Point, p2: Point, type: 'trendline' | 'ray', isDraft = false) => {
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
                x1={c1.x} y1={c1.y}
                x2={x2} y2={y2}
                stroke={isDraft ? "#3B82F6" : "#2962FF"}
                strokeWidth={2}
                strokeDasharray={isDraft ? "4 4" : undefined}
                pointerEvents="none"
            />
        );
    };


    return (
        <div
            className="absolute inset-0 z-20"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ cursor: (activeTool !== 'cursor' && activeTool !== 'crosshair') ? 'crosshair' : 'default' }}
        >
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="absolute inset-0 pointer-events-none"
            >
                {/* Render Committed Drawings */}
                {drawings.map(d => {
                    if (d.type === 'trendline' || d.type === 'ray') {
                        const twoPoint = d as TwoPointDrawing;
                        return <g key={d.id}>{renderLine(twoPoint.p1, twoPoint.p2, twoPoint.type)}</g>;
                    }
                    if (d.type === 'horizontal-line') {
                        // Optional: Render horizontal lines here too if needed, though often drawn by LWC PriceLine
                        return null;
                    }
                    return null;
                })}

                {/* Render Draft */}
                {interactionState.status === 'drawing' && interactionState.dragStartPoint && interactionState.currentPoint && (
                    renderLine(
                        interactionState.dragStartPoint,
                        interactionState.currentPoint,
                        activeTool as 'trendline' | 'ray',
                        true
                    )
                )}
            </svg>
        </div>
    );
}
