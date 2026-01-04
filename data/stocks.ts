export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export const stocksList: Stock[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2478.25, change: 21.75, changePercent: 0.89, volume: 12456789 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3875.50, change: -14.50, changePercent: -0.37, volume: 3456789 },
  { symbol: 'INFY', name: 'Infosys Ltd', price: 1442.75, change: -13.25, changePercent: -0.91, volume: 8765432 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', price: 1695.00, change: 45.00, changePercent: 2.73, volume: 5678901 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', price: 1095.00, change: -25.00, changePercent: -2.23, volume: 4567890 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 768.00, change: -17.00, changePercent: -2.17, volume: 9876543 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', price: 472.50, change: 16.50, changePercent: 3.62, volume: 2345678 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', price: 962.00, change: 17.00, changePercent: 1.80, volume: 7654321 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', price: 2456.00, change: 8.50, changePercent: 0.35, volume: 1234567 },
  { symbol: 'ITC', name: 'ITC Ltd', price: 465.25, change: 5.75, changePercent: 1.25, volume: 15678901 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', price: 1567.00, change: 23.00, changePercent: 1.49, volume: 3456789 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1756.00, change: -12.50, changePercent: -0.71, volume: 2345678 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', price: 3456.00, change: 67.00, changePercent: 1.98, volume: 1567890 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', price: 1123.50, change: 15.50, changePercent: 1.40, volume: 4567890 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', price: 12456.00, change: 234.00, changePercent: 1.91, volume: 567890 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', price: 1678.00, change: -23.00, changePercent: -1.35, volume: 2345678 },
  { symbol: 'TITAN', name: 'Titan Company Ltd', price: 3567.00, change: 89.00, changePercent: 2.56, volume: 987654 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', price: 2890.00, change: 45.00, changePercent: 1.58, volume: 876543 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', price: 6789.00, change: -123.00, changePercent: -1.78, volume: 1234567 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', price: 11234.00, change: 178.00, changePercent: 1.61, volume: 345678 },
];

export const getStockBySymbol = (symbol: string): Stock | undefined => {
  return stocksList.find((s) => s.symbol === symbol);
};

export const searchStocks = (query: string): Stock[] => {
  const lowerQuery = query.toLowerCase();
  return stocksList.filter(
    (s) =>
      s.symbol.toLowerCase().includes(lowerQuery) ||
      s.name.toLowerCase().includes(lowerQuery)
  );
};
