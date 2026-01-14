"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { INSTRUMENTS } from "@/content/instruments";

export type InstrumentType = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX" | "MIDCAP" | "STOCK OPTIONS";

interface InstrumentSelectorProps {
    value: InstrumentType;
    onChange: (value: InstrumentType) => void;
    hideStockOptions?: boolean;
}

export function InstrumentSelector({ value, onChange, hideStockOptions }: InstrumentSelectorProps) {
    const filteredInstruments = INSTRUMENTS.filter(
        (inst) => !(hideStockOptions && inst.value === "STOCK OPTIONS")
    );

    return (
        <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                1. Select Instrument
            </label>
            <Select value={value} onValueChange={(v) => onChange(v as InstrumentType)}>
                <SelectTrigger className="w-full h-10 bg-muted/30 border-border/50 focus:ring-primary/20">
                    <SelectValue placeholder="Select Instrument" />
                </SelectTrigger>
                <SelectContent>
                    {filteredInstruments.map((inst) => (
                        <SelectItem key={inst.value} value={inst.value}>
                            {inst.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
