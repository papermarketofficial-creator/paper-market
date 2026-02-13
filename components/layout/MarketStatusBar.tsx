"use client";

import { useEffect } from "react";
import { useGlobalStore } from "@/stores/global.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { useWalletStore } from "@/stores/wallet.store";
import { cn } from "@/lib/utils";
import { symbolToIndexInstrumentKey, toCanonicalSymbol, toInstrumentKey } from "@/lib/market/symbol-normalization";

const INDEX_CONFIG = [
  {
    symbol: "NIFTY 50",
    label: "NIFTY",
    instrumentKey: toInstrumentKey("NSE_INDEX|NIFTY 50"),
  },
  {
    symbol: "NIFTY BANK",
    label: "BANKNIFTY",
    instrumentKey: toInstrumentKey("NSE_INDEX|NIFTY BANK"),
  },
  {
    symbol: "NIFTY FIN SERVICE",
    label: "FINNIFTY",
    instrumentKey: toInstrumentKey("NSE_INDEX|NIFTY FIN SERVICE"),
  },
] as const;

export function MarketStatusBar() {
  const { selectedSymbol } = useGlobalStore();
  const balance = useWalletStore((state) => state.balance);
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);

  useEffect(() => {
    const symbols = INDEX_CONFIG.map((x) => x.symbol);

    fetch("/api/v1/market/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    }).catch((error) => console.error("Failed to subscribe indices:", error));

    return () => {
      fetch("/api/v1/market/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      }).catch((error) => console.error("Failed to unsubscribe indices:", error));
    };
  }, []);

  const selectedKey = symbolToIndexInstrumentKey(toCanonicalSymbol(selectedSymbol || ""));

  const formatPrice = (price: number) =>
    Number.isFinite(price) && price > 0 ? price.toFixed(2) : "--";

  const formatChange = (changePercent: number, hasQuote: boolean) => {
    if (!hasQuote) return "--";
    const safe = Number.isFinite(changePercent) ? changePercent : 0;
    const sign = safe > 0 ? "+" : "";
    return `${sign}${safe.toFixed(2)}%`;
  };

  return (
    <div className="h-8 bg-card/60 backdrop-blur-md border-b border-white/5 flex items-center px-4 justify-between text-xs overflow-hidden">
      <div className="flex items-center gap-4 text-muted-foreground font-mono">
        {INDEX_CONFIG.map((cfg) => {
          const key = cfg.instrumentKey;
          const quote = quotesByInstrument[key];
          const price = quote?.price ?? 0;
          const changePercent = quote?.changePercent ?? 0;
          const hasQuote = Number.isFinite(price) && price > 0;

          return (
            <div key={cfg.symbol} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "font-bold",
                  selectedKey === key && "text-primary"
                )}
              >
                {cfg.label}
              </span>
              <span className="text-foreground">{formatPrice(price)}</span>
              <span
                className={cn(
                  "text-[10px]",
                  hasQuote ? (changePercent >= 0 ? "text-[#089981]" : "text-[#F23645]") : "text-muted-foreground"
                )}
              >
                {formatChange(changePercent, hasQuote)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-muted-foreground">Balance:</span>
        <span className="text-foreground font-semibold">
          INR {balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
