export const TRADING_UNIVERSE = {
  indices: [
    "NIFTY",
    "BANKNIFTY",
    "NIFTY 50",
    "NIFTY BANK",
    "NIFTY FIN SERVICE",
  ],

  equities: [
    // --- Banking & Financials ---
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "AXISBANK",
    "KOTAKBANK",
    "INDUSINDBK",

    // --- IT ---
    "TCS",
    "INFY",
    "WIPRO",
    "HCLTECH",
    "TECHM",

    // --- Reliance & Energy ---
    "RELIANCE",
    "ONGC",
    "BPCL",
    "IOC",

    // --- FMCG ---
    "HINDUNILVR",
    "ITC",
    "NESTLEIND",
    "BRITANNIA",
    "DABUR",

    // --- Metals ---
    "TATASTEEL",
    "JSWSTEEL",
    "HINDALCO",
    "COALINDIA",

    // --- Auto ---
    "TATAMOTORS",
    "M&M",
    "MARUTI",
    "BAJAJ-AUTO",
    "EICHERMOT",

    // --- Pharma ---
    "SUNPHARMA",
    "DRREDDY",
    "CIPLA",
    "DIVISLAB",

    // --- Infra / Capital Goods ---
    "LT",
    "ADANIPORTS",
    "ULTRACEMCO",
    "POWERGRID",
  ],

  exchanges: ["NSE"],

  segments: ["NSE_EQ", "NSE_FO"],

  allowDerivatives: true,

  optionsPolicy: {
    indexOptions: true,
    stockOptions: false, // enable later if needed
    strikesAroundATM: 6, // ATM ± 6 strikes
  },
} as const; // Make it readonly

const DERIVATIVE_MARKERS = new Set(["FUT", "FUTURE", "CE", "PE", "CALL", "PUT"]);

function normalizeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractUnderlyingHints(tradingsymbol: string): string[] {
  const symbol = tradingsymbol.toUpperCase().trim();
  if (!symbol) return [];

  const tokens = symbol.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const hints = new Set<string>();
  hints.add(tokens[0]);

  const markerIndex = tokens.findIndex((token) => DERIVATIVE_MARKERS.has(token));
  if (markerIndex > 0) {
    hints.add(tokens.slice(0, markerIndex).join(" "));
  }

  hints.add(symbol.replace(/\s+/g, ""));
  return [...hints];
}

const INDEX_KEYS = TRADING_UNIVERSE.indices.map((item) => normalizeKey(item));
const EQUITY_KEYS = TRADING_UNIVERSE.equities.map((item) => normalizeKey(item));
const INDEX_KEY_SET = new Set(INDEX_KEYS);
const EQUITY_KEY_SET = new Set(EQUITY_KEYS);

function matchesUniverseCandidate(
  candidateKeys: string[],
  allowedSet: Set<string>,
  allowedPrefixKeys: string[]
): boolean {
  for (const key of candidateKeys) {
    if (!key) continue;
    if (allowedSet.has(key)) return true;

    for (const prefix of allowedPrefixKeys) {
      if (key.startsWith(prefix)) return true;
    }
  }

  return false;
}

/**
 * Checks if an instrument is allowed to be traded based on the Universe configuration.
 */
export function isInstrumentAllowed(instrument: {
  name: string;
  tradingsymbol: string;
  exchange: string;
  segment: string;
  instrumentType: string;
}): { allowed: boolean; reason?: string } {
  // 1. Check Exchange
  if (!TRADING_UNIVERSE.exchanges.includes(instrument.exchange as any)) {
      return { allowed: false, reason: `Exchange ${instrument.exchange} is not in trading universe` };
  }

  // 2. Check Segment
  if (!TRADING_UNIVERSE.segments.includes(instrument.segment as any)) {
       return { allowed: false, reason: `Segment ${instrument.segment} is not in trading universe` };
  }

  const symbolUpper = instrument.tradingsymbol.toUpperCase();
  const nameUpper = instrument.name.toUpperCase();
  const candidateKeys = [
    normalizeKey(symbolUpper),
    normalizeKey(nameUpper),
    ...extractUnderlyingHints(symbolUpper).map((item) => normalizeKey(item)),
  ];
  const isIndex = matchesUniverseCandidate(candidateKeys, INDEX_KEY_SET, INDEX_KEYS);
  const isEquity = matchesUniverseCandidate(candidateKeys, EQUITY_KEY_SET, EQUITY_KEYS);

  // 3. Check Underlying existence
  if (!isIndex && !isEquity) {
      return { allowed: false, reason: `Instrument ${symbolUpper} / ${nameUpper} is not in the allowed list of Indices or Equities` };
  }

  // 4. Check Derivatives Policy
  const isDerivative = instrument.instrumentType === "FUTURE" || instrument.instrumentType === "OPTION";
  if (isDerivative && !TRADING_UNIVERSE.allowDerivatives) {
      return { allowed: false, reason: "Derivatives trading is currently disabled" };
  }

  // 5. Check Options Policy
  if (instrument.instrumentType === "OPTION") {
      if (isIndex && !TRADING_UNIVERSE.optionsPolicy.indexOptions) {
           return { allowed: false, reason: "Index Options are disabled" };
      }
      if (isEquity && !TRADING_UNIVERSE.optionsPolicy.stockOptions) {
           return { allowed: false, reason: "Stock Options are disabled" };
      }
  }

  return { allowed: true };
}
