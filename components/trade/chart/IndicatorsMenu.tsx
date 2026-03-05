"use client";

import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAnalysisStore, type IndicatorConfig, type IndicatorType, makeDefaultIndicator } from "@/stores/trading/analysis.store";

interface IndicatorsMenuProps {
  symbol: string;
}

const ORDER: IndicatorType[] = ["SMA", "EMA", "RSI", "MACD", "BB", "VWAP", "ATR", "SUPERTREND"];

const LABELS: Record<IndicatorType, string> = {
  SMA: "SMA",
  EMA: "EMA",
  RSI: "RSI",
  MACD: "MACD",
  BB: "Bollinger Bands",
  VWAP: "VWAP",
  ATR: "ATR",
  SUPERTREND: "Supertrend",
  VOL: "Volume",
};

const PARAMS: Partial<Record<IndicatorType, Array<{ key: string; label: string; min?: number; step?: number }>>> = {
  SMA: [{ key: "period", label: "Period", min: 1, step: 1 }],
  EMA: [{ key: "period", label: "Period", min: 1, step: 1 }],
  RSI: [{ key: "period", label: "Period", min: 1, step: 1 }],
  BB: [
    { key: "period", label: "Period", min: 1, step: 1 },
    { key: "stdDev", label: "Std Dev", min: 0.1, step: 0.1 },
  ],
  MACD: [
    { key: "fastPeriod", label: "Fast", min: 1, step: 1 },
    { key: "slowPeriod", label: "Slow", min: 2, step: 1 },
    { key: "signalPeriod", label: "Signal", min: 1, step: 1 },
  ],
  ATR: [{ key: "period", label: "Period", min: 1, step: 1 }],
  SUPERTREND: [
    { key: "period", label: "Period", min: 1, step: 1 },
    { key: "multiplier", label: "Multiplier", min: 0.1, step: 0.1 },
  ],
};

function IndicatorSettingsRow({
  symbol,
  indicator,
}: {
  symbol: string;
  indicator: IndicatorConfig;
}) {
  const updateIndicator = useAnalysisStore((state) => state.updateIndicator);
  const removeIndicator = useAnalysisStore((state) => state.removeIndicator);
  const paramFields = PARAMS[indicator.type] || [];

  return (
    <div className="rounded-md border border-border/70 bg-card/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">{LABELS[indicator.type]}</div>
        <div className="flex items-center gap-1">
          <input
            type="color"
            className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
            value={indicator.display.color}
            onChange={(event) =>
              updateIndicator(symbol, indicator.id, {
                display: { ...indicator.display, color: event.target.value },
              })
            }
          />
          <Button
            variant={indicator.display.visible ? "secondary" : "outline"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              updateIndicator(symbol, indicator.id, {
                display: { ...indicator.display, visible: !indicator.display.visible },
              })
            }
          >
            {indicator.display.visible ? "Hide" : "Show"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
            onClick={() => removeIndicator(symbol, indicator.id)}
          >
            Remove
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => {
              const defaults = makeDefaultIndicator(indicator.type);
              updateIndicator(symbol, indicator.id, {
                params: defaults.params,
                display: defaults.display,
                seriesColors: defaults.seriesColors,
              });
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {paramFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {paramFields.map((param) => (
            <label key={`${indicator.id}-${param.key}`} className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{param.label}</span>
              <Input
                type="number"
                min={param.min}
                step={param.step || 1}
                className="h-7 text-xs"
                value={Number(indicator.params?.[param.key] ?? "")}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  updateIndicator(symbol, indicator.id, {
                    params: { ...indicator.params, [param.key]: value },
                  });
                }}
              />
            </label>
          ))}
        </div>
      )}

      <label className="space-y-1 inline-block">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Line Width</span>
        <Input
          type="number"
          min={1}
          max={4}
          step={1}
          className="h-7 text-xs w-20"
          value={Number(indicator.display.lineWidth ?? 2)}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            updateIndicator(symbol, indicator.id, {
              display: {
                ...indicator.display,
                lineWidth: Math.max(1, Math.min(4, value)),
              },
            });
          }}
        />
      </label>
    </div>
  );
}

export function IndicatorsMenu({ symbol }: IndicatorsMenuProps) {
  const addIndicator = useAnalysisStore((state) => state.addIndicator);
  const removeIndicator = useAnalysisStore((state) => state.removeIndicator);
  const getIndicators = useAnalysisStore((state) => state.getIndicators);
  const activeIndicators = getIndicators(symbol);

  const activeTypes = useMemo(() => new Set(activeIndicators.map((item) => item.type)), [activeIndicators]);

  const toggleIndicator = (type: IndicatorType) => {
    const existing = activeIndicators.find((item) => item.type === type);
    if (existing) {
      removeIndicator(symbol, existing.id);
      return;
    }
    addIndicator(symbol, makeDefaultIndicator(type));
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
            <span>Indicators</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 bg-card border-border">
          <DropdownMenuLabel className="text-xs text-muted-foreground/70 uppercase tracking-wider">
            Core Set
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/50" />
          {ORDER.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={activeTypes.has(type)}
              onCheckedChange={() => toggleIndicator(type)}
              className="text-xs focus:bg-accent"
            >
              {LABELS[type]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activeIndicators.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[420px] max-h-[60vh] overflow-y-auto p-2 bg-card border-border">
            <DropdownMenuLabel className="text-xs text-muted-foreground/70 uppercase tracking-wider px-1 pb-2">
              Indicator Settings
            </DropdownMenuLabel>
            <div className="space-y-2">
              {activeIndicators.map((indicator) => (
                <IndicatorSettingsRow key={indicator.id} symbol={symbol} indicator={indicator} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
