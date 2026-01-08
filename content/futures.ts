import { Stock } from '@/types/equity.types';

export const futuresList: Stock[] = [
  { symbol: 'NIFTY26JAN', name: 'Nifty 50 Jan 2026 Futures', price: 21750.00, change: 125.50, changePercent: 0.58, volume: 15000000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'BANKNIFTY26JAN', name: 'Bank Nifty Jan 2026 Futures', price: 46500.00, change: -200.00, changePercent: -0.43, volume: 8000000, lotSize: 25, expiryDate: new Date('2026-01-30') },
  { symbol: 'RELIANCE26JAN', name: 'Reliance Industries Jan 2026 Futures', price: 2480.25, change: 22.75, changePercent: 0.93, volume: 2500000, lotSize: 250, expiryDate: new Date('2026-01-30') },
  { symbol: 'TCS26JAN', name: 'Tata Consultancy Services Jan 2026 Futures', price: 3880.50, change: -15.50, changePercent: -0.40, volume: 1800000, lotSize: 200, expiryDate: new Date('2026-01-30') },
  { symbol: 'INFY26JAN', name: 'Infosys Ltd Jan 2026 Futures', price: 1445.75, change: -14.25, changePercent: -0.98, volume: 3200000, lotSize: 300, expiryDate: new Date('2026-01-30') },
];

export const getFutureBySymbol = (symbol: string): Stock | undefined => {
  return futuresList.find((f) => f.symbol === symbol);
};

export const searchFutures = (query: string): Stock[] => {
  const lowerQuery = query.toLowerCase();
  return futuresList.filter(
    (f) =>
      f.symbol.toLowerCase().includes(lowerQuery) ||
      f.name.toLowerCase().includes(lowerQuery)
  );
};