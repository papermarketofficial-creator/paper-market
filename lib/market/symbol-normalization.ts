const INDEX_ALIAS_BY_KEY: Record<string, string> = {
  NIFTY: "NIFTY 50",
  NIFTY50: "NIFTY 50",
  NIFTY_50: "NIFTY 50",
  BANKNIFTY: "NIFTY BANK",
  NIFTYBANK: "NIFTY BANK",
  NIFTY_BANK: "NIFTY BANK",
  FINNIFTY: "NIFTY FIN SERVICE",
  NIFTYFINSERVICE: "NIFTY FIN SERVICE",
  NIFTY_FIN_SERVICE: "NIFTY FIN SERVICE",
};

export function toSymbolKey(symbol: string): string {
  return String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function toCanonicalSymbol(symbol: string): string {
  const raw = String(symbol || "").trim();
  if (!raw) return "";

  const key = toSymbolKey(raw);
  return INDEX_ALIAS_BY_KEY[key] ?? raw.toUpperCase();
}

export function toInstrumentKey(value: string): string {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(":", "|")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function symbolToIndexInstrumentKey(symbol: string): string | null {
  const canonical = toCanonicalSymbol(symbol);
  if (!canonical) return null;

  if (canonical === "NIFTY 50") return "NSE_INDEX|NIFTY 50";
  if (canonical === "NIFTY BANK") return "NSE_INDEX|NIFTY BANK";
  if (canonical === "NIFTY FIN SERVICE") return "NSE_INDEX|NIFTY FIN SERVICE";

  return null;
}
