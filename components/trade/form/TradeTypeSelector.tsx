"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Gauge, TrendingUp } from "lucide-react";

interface TradeTypeSelectorProps {
    value: "futures" | "options";
    onChange: (value: "futures" | "options") => void;
}

export function TradeTypeSelector({ value, onChange }: TradeTypeSelectorProps) {
    return (
        <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                2. Select Trade Type
            </Label>
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => onChange("futures")}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                        value === "futures"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                    )}
                >
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-semibold">Futures</span>
                </button>

                <button
                    onClick={() => onChange("options")}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                        value === "options"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                    )}
                >
                    <Gauge className="w-4 h-4" />
                    <span className="text-sm font-semibold">Options</span>
                </button>
            </div>
        </div>
    );
}
