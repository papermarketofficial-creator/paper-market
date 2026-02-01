export const TRADING_UNIVERSE = {
  indices: [
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
  const isIndex = TRADING_UNIVERSE.indices.includes(symbolUpper as any);
  const isEquity = TRADING_UNIVERSE.equities.includes(symbolUpper as any);

  // 3. Check Underlying existence
  if (!isIndex && !isEquity) {
      return { allowed: false, reason: `Instrument ${symbolUpper} is not in the allowed list of Indices or Equities` };
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
