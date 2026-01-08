import { ExpiryType } from './general.types';

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lotSize: number;
  expiryDate?: Date;
  expiryType?: ExpiryType;
  strikePrice?: number;
  optionType?: 'CE' | 'PE';
}