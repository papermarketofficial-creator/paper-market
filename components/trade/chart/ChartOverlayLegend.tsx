import { formatCurrency } from "@/lib/utils";

interface ChartOverlayLegendProps {
    symbol: string;
    data: {
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
        time?: number;
    } | null;
}

export function ChartOverlayLegend({ symbol, data }: ChartOverlayLegendProps) {
    if (!data) return null;

    const isUp = data.close >= data.open;
    const colorClass = isUp ? "text-green-500" : "text-red-500";

    return (
        <div className="absolute top-2 left-2 z-20 pointer-events-none select-none flex flex-col gap-1">
            {/* Symbol & Status */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{symbol}</span>
                <span className="text-[10px] bg-green-500/20 text-green-500 px-1 rounded-sm border border-green-500/30">
                    Market Open
                </span>
            </div>

            {/* OHLC Values */}
            <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex gap-1">
                    <span className="text-muted-foreground">O</span>
                    <span className={colorClass}>{data.open.toFixed(2)}</span>
                </div>
                <div className="flex gap-1">
                    <span className="text-muted-foreground">H</span>
                    <span className={colorClass}>{data.high.toFixed(2)}</span>
                </div>
                <div className="flex gap-1">
                    <span className="text-muted-foreground">L</span>
                    <span className={colorClass}>{data.low.toFixed(2)}</span>
                </div>
                <div className="flex gap-1">
                    <span className="text-muted-foreground">C</span>
                    <span className={colorClass}>{data.close.toFixed(2)}</span>
                </div>
                {data.volume !== undefined && (
                    <div className="flex gap-1">
                        <span className="text-muted-foreground">Vol</span>
                        <span className="text-foreground">{(data.volume / 1000).toFixed(2)}K</span>
                    </div>
                )}
                 {data.close !== undefined && data.open !== undefined && (
                    <div className="flex gap-1">
                         <span className="text-muted-foreground">Change</span>
                         <span className={colorClass}>
                            {(data.close - data.open).toFixed(2)} (
                            {((data.close - data.open) / data.open * 100).toFixed(2)}%)
                         </span>
                    </div>
                )}
            </div>
        </div>
    );
}
