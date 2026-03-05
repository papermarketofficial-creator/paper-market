export function resolveUpstoxPreviousClose(
  quote: any,
  lastPrice: number
): number | null {
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;

  const closePrice = Number(quote?.close_price);
  if (Number.isFinite(closePrice) && closePrice > 0) {
    return closePrice;
  }

  const prevClose = Number(
    quote?.prev_close ?? quote?.previous_close ?? quote?.ohlc?.prev_close
  );
  if (Number.isFinite(prevClose) && prevClose > 0) {
    return prevClose;
  }

  const netChange = Number(quote?.net_change);
  if (Number.isFinite(netChange)) {
    const derived = lastPrice - netChange;
    if (Number.isFinite(derived) && derived > 0) {
      return derived;
    }
  }

  return null;
}
