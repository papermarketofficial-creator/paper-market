/**
 * Utility functions for parsing and calculating risks for F&O instruments.
 */

export interface OptionDetails {
  underlying: string;
  expiry: string;
  strike: number;
  type: 'CE' | 'PE';
}

/**
 * Parses a standard NSE Option symbol string.
 * Example: NIFTY24JAN21700CE -> { underlying: 'NIFTY', expiry: '24JAN', strike: 21700, type: 'CE' }
 */
export function parseOptionSymbol(symbol: string): OptionDetails | null {
  // Regex Breakdown:
  // ([A-Z]+)       -> Underlying (e.g., NIFTY)
  // (\d{2}[A-Z]{3}) -> Expiry Date code (e.g., 24JAN)
  // (\d+)          -> Strike Price (e.g., 21700)
  // ([A-Z]{2})     -> Option Type (CE or PE)
  const match = symbol.match(/^([A-Z]+)(\d{2}[A-Z]{3})(\d+)([A-Z]{2})$/);
  
  if (!match) return null;
  
  const [, underlying, expiry, strikeStr, type] = match;
  
  return {
    underlying,
    expiry,
    strike: parseInt(strikeStr, 10),
    type: type as 'CE' | 'PE',
  };
}

export interface OptionRiskMetrics {
  maxLoss: number;
  maxProfit: number;
  breakeven: number;
  capitalAtRisk: number;
}

/**
 * Calculates static risk metrics (Max Profit, Max Loss, Breakeven).
 * Note: Uses Infinity for unlimited profit/loss scenarios.
 */
export function calculateOptionRiskMetrics(
  entryPrice: number, // Premium
  quantity: number,   // Number of lots (or raw qty if lotSize is handled outside)
  lotSize: number,
  optionDetails: OptionDetails | null,
  side: 'BUY' | 'SELL'
): OptionRiskMetrics | null {
  if (!optionDetails) return null;

  // Assuming 'quantity' passed here is raw quantity (lots * lotSize)
  // If your UI passes number of lots, ensure you multiply by lotSize before passing, 
  // or multiply inside. Based on previous context, quantityValue was raw quantity.
  
  // Total shares = quantity (already multiplied by lots in UI typically)
  const totalQuantity = quantity; 
  const premium = entryPrice;
  const strike = optionDetails.strike;
  const capitalAtRisk = side === 'BUY' ? premium * totalQuantity : Infinity; // Technically margin is risk for sellers

  let maxLoss: number;
  let maxProfit: number;
  let breakeven: number;

  if (optionDetails.type === 'CE') {
    // === CALL OPTION ===
    if (side === 'BUY') {
      // Long Call
      maxLoss = premium * totalQuantity;       // Limited to premium paid
      maxProfit = Infinity;                    // Unlimited upside
      breakeven = strike + premium;
    } else {
      // Short Call
      maxLoss = Infinity;                      // Unlimited downside
      maxProfit = premium * totalQuantity;     // Limited to premium received
      breakeven = strike + premium;
    }
  } else {
    // === PUT OPTION ===
    if (side === 'BUY') {
      // Long Put
      maxLoss = premium * totalQuantity;       // Limited to premium paid
      maxProfit = (strike - premium) * totalQuantity; // Stock can only go to 0
      breakeven = strike - premium;
    } else {
      // Short Put
      maxLoss = (strike - premium) * totalQuantity;   // Significant risk if stock goes to 0
      maxProfit = premium * totalQuantity;     // Limited to premium received
      breakeven = strike - premium;
    }
  }

  return {
    maxLoss,
    maxProfit,
    breakeven,
    capitalAtRisk,
  };
}