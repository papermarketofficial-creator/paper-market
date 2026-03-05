import { Side, InstrumentMode, ExitReason } from './general.types';


export type TradeStatus = 'FILLED' | 'CLOSED' | 'OPEN' | 'CANCELLED' | 'PENDING' | 'REJECTED';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';

export interface TradeParams {
  instrumentToken: string;
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice?: number;
  orderType?: OrderType;
}

export interface Trade {
  id: string;
  instrumentToken?: string;
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
  orderType?: OrderType;
  exchangeOrderId?: string;
}

export interface JournalEntry {
  tradeId: string;
  whyEntered: string;
  whatWentRight: string;
  whatWentWrong: string;
}
