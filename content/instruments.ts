import { InstrumentType } from "@/components/trade/form/InstrumentSelector";

export const INSTRUMENTS: { value: InstrumentType; label: string }[] = [
    { value: "NIFTY", label: "NIFTY 50" },
    { value: "BANKNIFTY", label: "BANK NIFTY" },
    { value: "FINNIFTY", label: "FIN NIFTY" },
    { value: "SENSEX", label: "SENSEX" },
    { value: "MIDCAP", label: "MIDCAP NIFTY" },
    { value: "STOCK OPTIONS", label: "STOCK OPTIONS" },
];
