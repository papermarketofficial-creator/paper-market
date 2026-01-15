import { Stock } from '@/types/equity.types';

export const indicesList: Stock[] = [
    {
        symbol: 'NIFTY 50',
        name: 'Nifty 50 Index',
        price: 21750.00,
        change: 125.50,
        changePercent: 0.58,
        volume: 0,
        lotSize: 0
    },
    {
        symbol: 'BANKNIFTY',
        name: 'Nifty Bank Index',
        price: 46500.00,
        change: -200.00,
        changePercent: -0.43,
        volume: 0,
        lotSize: 0
    },
    {
        symbol: 'SENSEX',
        name: 'BSE Sensex',
        price: 71500.00,
        change: 350.00,
        changePercent: 0.49,
        volume: 0,
        lotSize: 0
    }
];

export const getIndexBySymbol = (symbol: string): Stock | undefined => {
    return indicesList.find((i) => i.symbol === symbol);
};
