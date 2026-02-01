import { Stock } from '@/types/equity.types';

export const stocksList: Stock[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 0, change: 0, changePercent: 0, volume: 0, lotSize: 1 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 0, change: 0, changePercent: 0, volume: 0, lotSize: 1 },
  { symbol: 'INFY', name: 'Infosys Ltd', price: 0, change: 0, changePercent: 0, volume: 0, lotSize: 1 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 0, change: 0, changePercent: 0, volume: 0, lotSize: 1 },
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
