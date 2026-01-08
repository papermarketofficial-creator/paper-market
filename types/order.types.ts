import { Side, InstrumentMode, TradeStatus, ExitReason } from './general.types';

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
}

export interface JournalEntry {
  tradeId: string;
  whyEntered: string;
  whatWentRight: string;
  whatWentWrong: string;
}