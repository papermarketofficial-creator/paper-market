import { Side, InstrumentMode, ExitReason } from './general.types';

export type TradeStatus = 'FILLED' | 'CLOSED' | 'OPEN' | 'CANCELLED';

export interface Trade {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  quantity: number;
  filledQuantity: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: TradeStatus;
  entryTime: Date;
  exitTime: Date | null;
  updatedAt: Date;
  notes?: string;
  instrument: InstrumentMode;
  expiryDate?: Date;
  stopLoss?: number;
  target?: number;
  exitReason?: ExitReason;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  exchangeOrderId?: string;
}

export interface JournalEntry {
  tradeId: string;
  whyEntered: string;
  whatWentRight: string;
  whatWentWrong: string;
}