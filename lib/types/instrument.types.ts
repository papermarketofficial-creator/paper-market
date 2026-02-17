export type InstrumentType = 'EQUITY' | 'FUTURE' | 'OPTION' | 'INDEX';

export const InstrumentTypes = {
  EQUITY: 'EQUITY',
  FUTURE: 'FUTURE',
  OPTION: 'OPTION',
  INDEX: 'INDEX',
} as const;

export function normalizeInstrumentType(type: string): InstrumentType {
  const t = type.toUpperCase();
  if (t === 'FUT' || t === 'FUTURES') return 'FUTURE';
  if (t === 'CE' || t === 'PE' || t === 'OPTIONS') return 'OPTION';
  if (t === 'EQ' || t === 'EQUITY') return 'EQUITY';
  if (t === 'INDEX' || t === 'INDICES') return 'INDEX';
  
  // Strict Safety Check
  if (t === 'FUTURE' || t === 'OPTION' || t === 'EQUITY' || t === 'INDEX') return t;

  throw new Error(`Unknown instrument type: ${type}`);
}
