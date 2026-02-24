export type OptionSide = "CE" | "PE";

export type OptionChainLeg = {
  symbol: string;
  ltp: number;
  oi: number;
  volume: number;
};

export type OptionChainRow = {
  strike: number;
  ce?: OptionChainLeg;
  pe?: OptionChainLeg;
};

export type OptionTradeMode = "single" | "strategy";

export type StrategyKind =
  | "STRADDLE"
  | "STRANGLE"
  | "VERTICAL_SPREAD"
  | "IRON_CONDOR";
