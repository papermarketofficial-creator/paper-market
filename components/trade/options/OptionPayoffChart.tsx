"use client";

import { MultiLegPayoffChart } from "@/components/trade/form/MultiLegPayoffChart";
import { MultiLegPayoffLeg } from "@/lib/options/multi-leg-payoff";
import { OptionSide } from "@/components/trade/options/types";

type OptionPayoffChartProps = {
  side: "BUY" | "SELL";
  optionType: OptionSide;
  strike: number;
  quantity: number;
  premium: number;
  spotPrice: number;
};

export function OptionPayoffChart({
  side,
  optionType,
  strike,
  quantity,
  premium,
  spotPrice,
}: OptionPayoffChartProps) {
  const legs: MultiLegPayoffLeg[] = [
    {
      id: "SINGLE_LEG",
      side,
      optionType,
      strike,
      quantity,
      premium,
    },
  ];

  return (
    <MultiLegPayoffChart
      legs={legs}
      spotPrice={spotPrice}
      title="Payoff At Expiry"
      pointCount={160}
      height={220}
    />
  );
}
