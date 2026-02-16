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

// Upstox uses mixed-case format for indices (e.g., "NSE_INDEX|Nifty 50")
// This map ensures we preserve the exact format Upstox expects
const UPSTOX_INDEX_FORMAT: Record<string, string> = {
  "NIFTY 50": "Nifty 50",
  "NIFTY BANK": "Nifty Bank",
  "NIFTY FIN SERVICE": "Nifty Fin Service",
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

/**
 * Normalizes instrument keys to the format expected by Upstox.
 * 
 * For equities: Converts to uppercase (e.g., "NSE_EQ|INE002A01018")
 * For indices: Preserves Upstox's mixed-case format (e.g., "NSE_INDEX|Nifty 50")
 * 
 * This is critical because Upstox WebSocket expects exact format matching:
 * - Subscribe with "NSE_INDEX|Nifty 50" (mixed case)
 * - Receive ticks with "NSE_INDEX|Nifty 50" (mixed case)
 */
export function toInstrumentKey(value: string): string {
  if (!value) return "";
  
  const normalized = String(value)
    .trim()
    .replace(":", "|")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\s+/g, " ");
  
  // Check if this is an index instrument (case-insensitive check)
  const upperNormalized = normalized.toUpperCase();
  if (upperNormalized.startsWith("NSE_INDEX|")) {
    const parts = normalized.split("|");
    if (parts.length === 2) {
      const indexPart = parts[1];
      const upperIndexPart = indexPart.toUpperCase();
      
      // If we have a known Upstox format for this index, use it
      if (UPSTOX_INDEX_FORMAT[upperIndexPart]) {
        return `NSE_INDEX|${UPSTOX_INDEX_FORMAT[upperIndexPart]}`;
      }
    }
  }
  
  // For non-index instruments, convert to uppercase
  return normalized.toUpperCase();
}

export function symbolToIndexInstrumentKey(symbol: string): string | null {
  const canonical = toCanonicalSymbol(symbol);
  if (!canonical) return null;

  // Use toInstrumentKey to ensure proper format (mixed case for indices)
  if (canonical === "NIFTY 50") return toInstrumentKey("NSE_INDEX|Nifty 50");
  if (canonical === "NIFTY BANK") return toInstrumentKey("NSE_INDEX|Nifty Bank");
  if (canonical === "NIFTY FIN SERVICE") return toInstrumentKey("NSE_INDEX|Nifty Fin Service");

  return null;
}

