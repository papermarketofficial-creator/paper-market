import { EquityPoint } from '@/types/pnl.types';

const INITIAL_BALANCE = 1000000; // ₹10,00,000

export const generateEquityHistory = (): EquityPoint[] => {
  const history = [];
  let value = INITIAL_BALANCE;
  const now = Date.now();
  for (let i = 30; i >= 0; i--) {
    const change = (Math.random() - 0.45) * 20000;
    value = Math.max(value + change, 800000);
    history.push({
      time: now - i * 24 * 60 * 60 * 1000,
      value: Math.round(value),
    });
  }
  return history;
};