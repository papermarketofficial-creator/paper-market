import { create } from 'zustand';

export interface Position {
  id: string;
  symbol: string;
  name: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  productType: 'CNC' | 'MIS';
  leverage: number;
  timestamp: Date;
}

export interface Trade {
  id: string;
  symbol: string;
  name: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  status: 'OPEN' | 'CLOSED';
  entryTime: Date;
  exitTime: Date | null;
  notes?: string;
}

export interface JournalEntry {
  tradeId: string;
  whyEntered: string;
  whatWentRight: string;
  whatWentWrong: string;
}

interface TradingState {
  balance: number;
  positions: Position[];
  trades: Trade[];
  journalEntries: JournalEntry[];
  equityHistory: { time: number; value: number }[];
  
  // Actions
  executeTrade: (trade: Omit<Position, 'id' | 'currentPrice'>) => void;
  closePosition: (positionId: string, exitPrice: number) => void;
  updatePositionPrice: (positionId: string, newPrice: number) => void;
  saveJournalEntry: (entry: JournalEntry) => void;
  resetBalance: () => void;
}

const INITIAL_BALANCE = 1000000; // ₹10,00,000

const generateEquityHistory = () => {
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

export const useTradingStore = create<TradingState>((set, get) => ({
  balance: INITIAL_BALANCE,
  positions: [
    {
      id: '1',
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      side: 'BUY',
      quantity: 10,
      entryPrice: 2456.50,
      currentPrice: 2478.25,
      productType: 'CNC',
      leverage: 1,
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: '2',
      symbol: 'TCS',
      name: 'Tata Consultancy Services',
      side: 'BUY',
      quantity: 5,
      entryPrice: 3890.00,
      currentPrice: 3875.50,
      productType: 'MIS',
      leverage: 2,
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: '3',
      symbol: 'INFY',
      name: 'Infosys Ltd',
      side: 'SELL',
      quantity: 15,
      entryPrice: 1456.00,
      currentPrice: 1442.75,
      productType: 'MIS',
      leverage: 1,
      timestamp: new Date(),
    },
  ],
  trades: [
    {
      id: 't1',
      symbol: 'HDFC',
      name: 'HDFC Bank Ltd',
      side: 'BUY',
      quantity: 20,
      entryPrice: 1650.00,
      exitPrice: 1695.00,
      pnl: 900,
      status: 'CLOSED',
      entryTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      exitTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
    {
      id: 't2',
      symbol: 'ICICI',
      name: 'ICICI Bank Ltd',
      side: 'SELL',
      quantity: 25,
      entryPrice: 1120.00,
      exitPrice: 1095.00,
      pnl: 625,
      status: 'CLOSED',
      entryTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      exitTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 't3',
      symbol: 'SBIN',
      name: 'State Bank of India',
      side: 'BUY',
      quantity: 30,
      entryPrice: 785.00,
      exitPrice: 768.00,
      pnl: -510,
      status: 'CLOSED',
      entryTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      exitTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: 't4',
      symbol: 'WIPRO',
      name: 'Wipro Ltd',
      side: 'BUY',
      quantity: 40,
      entryPrice: 456.00,
      exitPrice: 472.50,
      pnl: 660,
      status: 'CLOSED',
      entryTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      exitTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: 't5',
      symbol: 'TATAMOTORS',
      name: 'Tata Motors Ltd',
      side: 'SELL',
      quantity: 15,
      entryPrice: 945.00,
      exitPrice: 962.00,
      pnl: -255,
      status: 'CLOSED',
      entryTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      exitTime: new Date(),
    },
  ],
  journalEntries: [],
  equityHistory: generateEquityHistory(),

  executeTrade: (trade) => {
    const tradeId = Date.now().toString();
    
    const newPosition: Position = {
      ...trade,
      id: tradeId,
      currentPrice: trade.entryPrice,
    };
    
    // Create an OPEN trade record immediately
    const newTrade: Trade = {
      id: tradeId,
      symbol: trade.symbol,
      name: trade.name,
      side: trade.side,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: 0,
      pnl: 0,
      status: 'OPEN',
      entryTime: trade.timestamp,
      exitTime: null,
    };
    
    const requiredMargin = (trade.entryPrice * trade.quantity) / trade.leverage;
    
    set((state) => ({
      positions: [...state.positions, newPosition],
      trades: [newTrade, ...state.trades],
      balance: state.balance - requiredMargin,
    }));
  },

  closePosition: (positionId, exitPrice) => {
    const state = get();
    const position = state.positions.find((p) => p.id === positionId);
    
    if (!position) return;

    const pnl = position.side === 'BUY'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;

    const requiredMargin = (position.entryPrice * position.quantity) / position.leverage;

    set((state) => ({
      positions: state.positions.filter((p) => p.id !== positionId),
      trades: state.trades.map((t) => 
        t.id === positionId 
          ? { ...t, exitPrice, pnl, status: 'CLOSED' as const, exitTime: new Date() }
          : t
      ),
      balance: state.balance + requiredMargin + pnl,
      equityHistory: [
        ...state.equityHistory,
        { time: Date.now(), value: state.balance + requiredMargin + pnl },
      ],
    }));
  },

  updatePositionPrice: (positionId, newPrice) => {
    set((state) => ({
      positions: state.positions.map((p) =>
        p.id === positionId ? { ...p, currentPrice: newPrice } : p
      ),
    }));
  },

  saveJournalEntry: (entry) => {
    set((state) => ({
      journalEntries: [
        ...state.journalEntries.filter((e) => e.tradeId !== entry.tradeId),
        entry,
      ],
    }));
  },

  resetBalance: () => {
    set({
      balance: INITIAL_BALANCE,
      positions: [],
      trades: [],
      equityHistory: generateEquityHistory(),
    });
  },
}));
