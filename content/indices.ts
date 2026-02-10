import { Stock } from '@/types/equity.types';

export const indicesList: Stock[] = [
    {
        symbol: 'NIFTY 50',
        name: 'Nifty 50 Index',
        price: 24825.45,
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: 50
    },
    {
        symbol: 'NIFTY BANK',
        name: 'Nifty Bank Index',
        price: 58417.20,
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: 25
    },
    {
        symbol: 'NIFTY FIN SERVICE',
        name: 'Nifty Fin Service',
        price: 26699.10,
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: 40
    }
];

export const getIndexBySymbol = (symbol: string): Stock | undefined => {
    return indicesList.find((i) => i.symbol === symbol);
};
