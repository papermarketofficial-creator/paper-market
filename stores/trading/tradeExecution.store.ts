import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { Trade } from '@/types/order.types';
import { InstrumentMode } from '@/types/general.types';
import { usePositionsStore } from './positions.store';
import { useOrdersStore } from './orders.store';
import { useRiskStore } from './risk.store';
import { useJournalStore } from './journal.store';
import { parseOptionSymbol, calculateOptionRiskMetrics } from '@/lib/fno-utils';
import { JournalEntry, ExitReason } from '@/types/journal.types';

interface TradeExecutionState {
  // ✅ Updated Signature: added instrumentMode
  executeTrade: (
    trade: Omit<Position, 'id' | 'currentPrice' | 'instrument' | 'lotSize' | 'currentPnL'>, 
    lotSize: number,
    instrumentMode: InstrumentMode 
  ) => Promise<void>;
  
  closePosition: (positionId: string, exitPrice: number, reason?: string) => void;
  settleExpiredPositions: () => void;
}

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const useTradeExecutionStore = create<TradeExecutionState>((set, get) => ({
  executeTrade: async (tradeParams, lotSize, instrumentMode) => { // ✅ Added param
    // 1. EXECUTION DELAY
    const delay = randomRange(300, 700);
    await new Promise(resolve => setTimeout(resolve, delay));

    const tradeId = Date.now().toString();
    
    // 2. SLIPPAGE SIMULATION (Using passed mode)
    let slippagePercent = 0;
    switch (instrumentMode) {
      case 'futures':
        slippagePercent = randomRange(0.0002, 0.0008);
        break;
      case 'options':
        slippagePercent = randomRange(0.0010, 0.0030); 
        break;
      case 'equity':
      default:
        slippagePercent = randomRange(0.0005, 0.0015);
        break;
    }

    // ... (Price Calculation - unchanged) ...
    const requestedPrice = tradeParams.entryPrice;
    let fillPrice = requestedPrice;
    if (tradeParams.side === 'BUY') {
      fillPrice = requestedPrice * (1 + slippagePercent);
    } else {
      fillPrice = requestedPrice * (1 - slippagePercent);
    }
    fillPrice = Math.round(fillPrice * 100) / 100;
    const slippageAmount = Math.abs(fillPrice - requestedPrice);
    const executionNote = `Req: ${requestedPrice.toFixed(2)} | Fill: ${fillPrice.toFixed(2)} | Slip: ${slippageAmount.toFixed(2)}`;

    // Create Position Object
    const newPosition: Position = {
      ...tradeParams,
      id: tradeId,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      instrument: instrumentMode, // ✅ Use param
      lotSize,
      currentPnL: 0,
    };

    // Create Trade Object
    const newTrade: Trade = {
      id: tradeId,
      symbol: tradeParams.symbol,
      name: tradeParams.name,
      side: tradeParams.side,
      quantity: tradeParams.quantity,
      filledQuantity: tradeParams.quantity,
      entryPrice: fillPrice,
      exitPrice: 0,
      pnl: 0,
      status: 'FILLED',
      entryTime: new Date(),
      exitTime: null,
      updatedAt: new Date(),
      instrument: instrumentMode, // ✅ Use param
      expiryDate: tradeParams.expiryDate,
      notes: executionNote,
      stopLoss: tradeParams.stopLoss,
      target: tradeParams.target,
    };

    const requiredMargin = (fillPrice * tradeParams.quantity) / tradeParams.leverage;

    // Update Stores
    usePositionsStore.getState().addPosition(newPosition);
    useOrdersStore.getState().addTrade(newTrade);
    useRiskStore.getState().deductMargin(requiredMargin);

    // Journaling
    let riskSnapshot = undefined;
    if (instrumentMode === 'options') {
       const optionDetails = parseOptionSymbol(tradeParams.symbol);
       const metrics = calculateOptionRiskMetrics(fillPrice, tradeParams.quantity * lotSize, lotSize, optionDetails, tradeParams.side);
       if(metrics) riskSnapshot = { maxLoss: metrics.maxLoss, maxProfit: metrics.maxProfit, breakeven: metrics.breakeven, capitalAtRisk: metrics.capitalAtRisk };
    }

    const journalEntry: JournalEntry = {
      id: tradeId,
      instrument: instrumentMode, // ✅ Use param
      symbol: tradeParams.symbol,
      expiryDate: tradeParams.expiryDate,
      side: tradeParams.side,
      quantity: tradeParams.quantity,
      entryPrice: fillPrice,
      entryTime: new Date(),
      riskSnapshot,
    };

    useJournalStore.getState().addJournalEntry(journalEntry);
  },

  closePosition: (positionId, exitPrice, reason = 'MANUAL') => {
      // ... (No changes needed here) ...
      const positionsStore = usePositionsStore.getState();
      const ordersStore = useOrdersStore.getState();
      const riskStore = useRiskStore.getState();
      
      const position = positionsStore.positions.find((p) => p.id === positionId);
      if (!position) return;
  
      const pnl = position.side === 'BUY'
        ? (exitPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPrice) * position.quantity;
  
      const requiredMargin = (position.entryPrice * position.quantity) / position.leverage;
  
      ordersStore.updateTrade(positionId, {
        exitPrice,
        pnl,
        status: 'CLOSED',
        exitTime: new Date(),
        notes: reason,
      });
  
      positionsStore.removePosition(positionId);
      riskStore.addToBalance(requiredMargin + pnl);
      riskStore.addEquityPoint(Date.now(), riskStore.balance + requiredMargin + pnl);
  
      const exitReason: ExitReason = reason === 'EXPIRY SETTLEMENT' ? 'EXPIRY' : 'MANUAL';
      
      useJournalStore.getState().updateJournalOnExit(positionId, {
        exitPrice,
        exitTime: new Date(),
        realizedPnL: pnl,
        exitReason
      });
  },

  settleExpiredPositions: () => {
    const positionsStore = usePositionsStore.getState();
    const expiredPositions = positionsStore.getExpiredPositions();
    if (expiredPositions.length === 0) return;

    expiredPositions.forEach((position) => {
      get().closePosition(
        position.id, 
        position.currentPrice, 
        'EXPIRY SETTLEMENT'
      );
    });
  }
}));