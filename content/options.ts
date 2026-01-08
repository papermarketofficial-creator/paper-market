import { Stock } from '@/types/equity.types';

export const optionsList: Stock[] = [
  // NIFTY Options Chain strikes
  { symbol: 'NIFTY26JAN21000CE', name: 'Nifty 21000 Call Jan 2026', price: 1450.00, change: 85.50, changePercent: 6.26, volume: 450000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21000PE', name: 'Nifty 21000 Put Jan 2026', price: 25.50, change: -2.25, changePercent: -8.11, volume: 320000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21200CE', name: 'Nifty 21200 Call Jan 2026', price: 1250.00, change: 72.00, changePercent: 6.11, volume: 380000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21200PE', name: 'Nifty 21200 Put Jan 2026', price: 35.75, change: -3.15, changePercent: -8.10, volume: 280000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21400CE', name: 'Nifty 21400 Call Jan 2026', price: 1050.00, change: 58.50, changePercent: 5.90, volume: 320000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21400PE', name: 'Nifty 21400 Put Jan 2026', price: 48.25, change: -4.25, changePercent: -8.09, volume: 240000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21600CE', name: 'Nifty 21600 Call Jan 2026', price: 850.50, change: 45.25, changePercent: 5.62, volume: 280000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21600PE', name: 'Nifty 21600 Put Jan 2026', price: 65.00, change: -5.75, changePercent: -8.12, volume: 200000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21700CE', name: 'Nifty 21700 Call Jan 2026', price: 720.25, change: 38.75, changePercent: 5.68, volume: 250000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21700PE', name: 'Nifty 21700 Put Jan 2026', price: 82.50, change: -7.25, changePercent: -8.08, volume: 180000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21800CE', name: 'Nifty 21800 Call Jan 2026', price: 605.75, change: 32.50, changePercent: 5.67, volume: 220000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN21800PE', name: 'Nifty 21800 Put Jan 2026', price: 105.00, change: -9.25, changePercent: -8.10, volume: 160000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22000CE', name: 'Nifty 22000 Call Jan 2026', price: 450.00, change: 24.00, changePercent: 5.63, volume: 190000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22000PE', name: 'Nifty 22000 Put Jan 2026', price: 145.50, change: -12.75, changePercent: -8.06, volume: 140000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22200CE', name: 'Nifty 22200 Call Jan 2026', price: 320.25, change: 17.25, changePercent: 5.69, volume: 160000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22200PE', name: 'Nifty 22200 Put Jan 2026', price: 205.00, change: -18.00, changePercent: -8.07, volume: 120000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22400CE', name: 'Nifty 22400 Call Jan 2026', price: 225.50, change: 12.25, changePercent: 5.74, volume: 130000, lotSize: 50, expiryDate: new Date('2026-01-30') },
  { symbol: 'NIFTY26JAN22400PE', name: 'Nifty 22400 Put Jan 2026', price: 285.75, change: -25.25, changePercent: -8.12, volume: 100000, lotSize: 50, expiryDate: new Date('2026-01-30') },

  // Additional options for variety
  { symbol: 'BANKNIFTY26JAN46000CE', name: 'Bank Nifty 46000 Call Jan 2026', price: 850.00, change: 45.50, changePercent: 5.65, volume: 1800000, lotSize: 25, expiryDate: new Date('2026-01-30') },
  { symbol: 'BANKNIFTY26JAN46000PE', name: 'Bank Nifty 46000 Put Jan 2026', price: 620.00, change: -28.00, changePercent: -4.32, volume: 1600000, lotSize: 25, expiryDate: new Date('2026-01-30') },
];

export const getOptionBySymbol = (symbol: string): Stock | undefined => {
  return optionsList.find((o) => o.symbol === symbol);
};

export const searchOptions = (query: string): Stock[] => {
  const lowerQuery = query.toLowerCase();
  return optionsList.filter(
    (o) =>
      o.symbol.toLowerCase().includes(lowerQuery) ||
      o.name.toLowerCase().includes(lowerQuery)
  );
};