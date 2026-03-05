/**
 * Utilities to generate payoff chart data for Single-Leg Options (BUY Side).
 */

interface PayoffPoint {
  price: number; // The market price of the underlying at expiry
  pnl: number;   // The Profit/Loss at that price
}

interface PayoffParams {
  strikePrice: number;
  premium: number;      // Price paid per share
  lotSize: number;
  numberOfLots: number;
  rangeConfig?: {
    min: number;
    max: number;
    step: number;
  };
}

/**
 * Generates Payoff Data for a Long Call Option (Buy CE).
 * Formula: PnL = (Max(Spot - Strike, 0) - Premium) * Quantity
 */
export function generateCallPayoff({
  strikePrice,
  premium,
  lotSize,
  numberOfLots,
  rangeConfig
}: PayoffParams): PayoffPoint[] {
  const totalQuantity = lotSize * numberOfLots;
  const breakeven = strikePrice + premium;

  // Default range: ±20% of strike if not provided
  const minPrice = rangeConfig?.min ?? Math.floor(strikePrice * 0.8);
  const maxPrice = rangeConfig?.max ?? Math.ceil(strikePrice * 1.2);
  const step = rangeConfig?.step ?? Math.ceil((maxPrice - minPrice) / 50); // ~50 data points

  const data: PayoffPoint[] = [];

  for (let currentPrice = minPrice; currentPrice <= maxPrice; currentPrice += step) {
    // Intrinsic Value of Call = Max(S - K, 0)
    const intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    
    // Net PnL = (Intrinsic Value - Cost) * Qty
    const pnl = (intrinsicValue - premium) * totalQuantity;

    data.push({
      price: currentPrice,
      pnl: parseFloat(pnl.toFixed(2)),
    });
  }

  // Ensure Breakeven point is exactly in the data for cleaner charts
  // (Optional optimization: splice it in if missing, but usually linear charts handle this)
  
  return data;
}

/**
 * Generates Payoff Data for a Long Put Option (Buy PE).
 * Formula: PnL = (Max(Strike - Spot, 0) - Premium) * Quantity
 */
export function generatePutPayoff({
  strikePrice,
  premium,
  lotSize,
  numberOfLots,
  rangeConfig
}: PayoffParams): PayoffPoint[] {
  const totalQuantity = lotSize * numberOfLots;
  
  // Default range: ±20% of strike
  const minPrice = rangeConfig?.min ?? Math.floor(strikePrice * 0.8);
  const maxPrice = rangeConfig?.max ?? Math.ceil(strikePrice * 1.2);
  const step = rangeConfig?.step ?? Math.ceil((maxPrice - minPrice) / 50);

  const data: PayoffPoint[] = [];

  for (let currentPrice = minPrice; currentPrice <= maxPrice; currentPrice += step) {
    // Intrinsic Value of Put = Max(K - S, 0)
    const intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    
    // Net PnL = (Intrinsic Value - Cost) * Qty
    const pnl = (intrinsicValue - premium) * totalQuantity;

    data.push({
      price: currentPrice,
      pnl: parseFloat(pnl.toFixed(2)),
    });
  }

  return data;
}