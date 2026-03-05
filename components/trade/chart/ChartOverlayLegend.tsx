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
  upColor?: string;
  downColor?: string;
  indicators: Array<{
    id: string;
    label: string;
    color: string;
    visible: boolean;
  }>;
  onToggleIndicatorVisibility: (id: string) => void;
  onRemoveIndicator: (id: string) => void;
}

export function ChartOverlayLegend({
  symbol,
  data,
  upColor = "#089981",
  downColor = "#F23645",
  indicators,
  onToggleIndicatorVisibility,
  onRemoveIndicator,
}: ChartOverlayLegendProps) {
  if (!data) return null;

  const isUp = data.close >= data.open;
  const valueColor = isUp ? upColor : downColor;
  const changePct = data.open !== 0 ? ((data.close - data.open) / data.open) * 100 : 0;

  return (
    <div className="absolute top-2 left-2 z-20 select-none flex flex-col gap-1.5 pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-foreground">{symbol}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] md:text-xs font-mono max-w-[90vw]">
        <div className="flex gap-1">
          <span className="text-muted-foreground">O</span>
          <span style={{ color: valueColor }}>{data.open.toFixed(2)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-muted-foreground">H</span>
          <span style={{ color: valueColor }}>{data.high.toFixed(2)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-muted-foreground">L</span>
          <span style={{ color: valueColor }}>{data.low.toFixed(2)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-muted-foreground">C</span>
          <span style={{ color: valueColor }}>{data.close.toFixed(2)}</span>
        </div>
        <div className="basis-full h-0 m-0"></div> {/* Line break on mobile for volume/change */}
        {data.volume !== undefined && Number.isFinite(Number(data.volume)) && (
          <div className="flex gap-1">
            <span className="text-muted-foreground">Vol</span>
            <span className="text-foreground">{(Number(data.volume) / 1000).toFixed(2)}K</span>
          </div>
        )}
        <div className="flex gap-1">
          <span className="text-muted-foreground">Change</span>
          <span style={{ color: valueColor }}>
            {(data.close - data.open).toFixed(2)} ({changePct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {indicators.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pointer-events-auto">
          {indicators.map((indicator) => (
            <div
              key={indicator.id}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] ${
                indicator.visible ? "border-border bg-card/80 text-foreground" : "border-border/60 bg-card/40 text-muted-foreground"
              }`}
            >
              <button type="button" onClick={() => onToggleIndicatorVisibility(indicator.id)} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: indicator.color }} />
                <span>{indicator.label}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemoveIndicator(indicator.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${indicator.label}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
