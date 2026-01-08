export interface OptionData {
  symbol: string;
  ltp: number;
  oi: number;
  volume: number;
}

export interface OptionStrike {
  strike: number;
  ce: OptionData;
  pe: OptionData;
}

export const optionsChainData: OptionStrike[] = [
  {
    strike: 21000,
    ce: { symbol: 'NIFTY26JAN21000CE', ltp: 1450.00, oi: 1250000, volume: 450000 },
    pe: { symbol: 'NIFTY26JAN21000PE', ltp: 25.50, oi: 1800000, volume: 320000 },
  },
  {
    strike: 21200,
    ce: { symbol: 'NIFTY26JAN21200CE', ltp: 1250.00, oi: 980000, volume: 380000 },
    pe: { symbol: 'NIFTY26JAN21200PE', ltp: 35.75, oi: 1450000, volume: 280000 },
  },
  {
    strike: 21400,
    ce: { symbol: 'NIFTY26JAN21400CE', ltp: 1050.00, oi: 750000, volume: 320000 },
    pe: { symbol: 'NIFTY26JAN21400PE', ltp: 48.25, oi: 1120000, volume: 240000 },
  },
  {
    strike: 21600,
    ce: { symbol: 'NIFTY26JAN21600CE', ltp: 850.50, oi: 620000, volume: 280000 },
    pe: { symbol: 'NIFTY26JAN21600PE', ltp: 65.00, oi: 890000, volume: 200000 },
  },
  {
    strike: 21700, // ATM
    ce: { symbol: 'NIFTY26JAN21700CE', ltp: 720.25, oi: 580000, volume: 250000 },
    pe: { symbol: 'NIFTY26JAN21700PE', ltp: 82.50, oi: 750000, volume: 180000 },
  },
  {
    strike: 21800,
    ce: { symbol: 'NIFTY26JAN21800CE', ltp: 605.75, oi: 520000, volume: 220000 },
    pe: { symbol: 'NIFTY26JAN21800PE', ltp: 105.00, oi: 680000, volume: 160000 },
  },
  {
    strike: 22000,
    ce: { symbol: 'NIFTY26JAN22000CE', ltp: 450.00, oi: 480000, volume: 190000 },
    pe: { symbol: 'NIFTY26JAN22000PE', ltp: 145.50, oi: 620000, volume: 140000 },
  },
  {
    strike: 22200,
    ce: { symbol: 'NIFTY26JAN22200CE', ltp: 320.25, oi: 420000, volume: 160000 },
    pe: { symbol: 'NIFTY26JAN22200PE', ltp: 205.00, oi: 580000, volume: 120000 },
  },
  {
    strike: 22400,
    ce: { symbol: 'NIFTY26JAN22400CE', ltp: 225.50, oi: 380000, volume: 130000 },
    pe: { symbol: 'NIFTY26JAN22400PE', ltp: 285.75, oi: 520000, volume: 100000 },
  },
];

export const atmStrike = 21700;