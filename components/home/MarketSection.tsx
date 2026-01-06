"use client";
import { useRef } from "react";
import { useInView } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// --- Types & Interfaces ---
interface MarketItem {
  symbol: string;
  price: string;
  change: string;
  up: boolean;
}

interface MarketDataPoint {
  date: string;
  value: number;
}

interface Market {
  name: string;
  color: string;
  darkColor: string;
  data: MarketDataPoint[];
  items: MarketItem[];
  date?: string;
}

// --- Helper Functions ---
const generateData = (base: number, volatility: number): MarketDataPoint[] =>
  Array.from({ length: 20 }, (_, i) => ({
    date:
      i === 0
        ? "2/26"
        : i === 4
        ? "3/13"
        : i === 8
        ? "3/26"
        : i === 12
        ? "4/13"
        : i === 16
        ? "5/13"
        : i === 19
        ? "5/26"
        : "",
    value: base + Math.random() * volatility - volatility / 2,
  }));

// --- Data (Educational / Simulation) ---
const markets: Market[] = [
  {
    name: "Stocks (Simulation)",
    color: "#10b981",
    darkColor: "#22c55e",
    data: generateData(180, 40),
    items: [
      { symbol: "AAPL", price: "189.84", change: "+1.2%", up: true },
      { symbol: "MSFT", price: "412.65", change: "+0.75%", up: true },
    ],
  },
  {
    name: "Crypto (Simulation)",
    date: "Sample Market Data",
    color: "#2563eb",
    darkColor: "#3b82f6",
    data: generateData(60000, 15000),
    items: [
      { symbol: "BTC/USD", price: "68,421", change: "+2.3%", up: true },
      { symbol: "ETH/USD", price: "3,845", change: "-0.5%", up: false },
    ],
  },
  {
    name: "Forex (Simulation)",
    date: "Sample Market Data",
    color: "#ea580c",
    darkColor: "#f97316",
    data: generateData(1.2, 0.4),
    items: [
      { symbol: "EUR/USD", price: "1.0921", change: "+0.15%", up: true },
      { symbol: "GBP/USD", price: "1.2654", change: "-0.08%", up: false },
    ],
  },
];

const MarketSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.3, once: true });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 bg-slate-50 dark:bg-[#02040a] transition-colors duration-300"
    >
      <div className="container mx-auto px-4">
        {/* Header Label */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-1.5 rounded-full bg-blue-50 dark:bg-white/5 border border-blue-100 dark:border-white/10 text-xs font-semibold text-blue-600 dark:text-white/80 backdrop-blur">
            Market Simulation
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-[40px] md:text-[48px] font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Practice with Real Market Behavior
          </h2>
          <p className="text-slate-500 dark:text-white/45 max-w-2xl mx-auto text-lg leading-relaxed">
            Analyze price movements across stocks, crypto, and forex using
            simulated trades powered by real market data.
          </p>
        </div>

        {/* Market Cards Grid */}
        <div className="grid md:grid-cols-3 gap-8 lg:gap-10 max-w-7xl mx-auto">
          {markets.map((market, index) => (
            <div
              key={index}
              className="relative rounded-[28px] overflow-hidden bg-white dark:bg-[#060913]/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-[0_30px_80px_rgba(0,0,0,0.6)] group transition-all duration-300 hover:border-blue-400/30"
            >
              <div className="px-6 pt-6 pb-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {market.name}
                  </h3>
                  {market.date && (
                    <span className="text-xs font-medium text-slate-400 dark:text-white/30">
                      {market.date}
                    </span>
                  )}
                </div>
              </div>

              {/* Chart Section */}
              <div className="h-[220px] w-full px-4">
                <ResponsiveContainer width="100%" height="100%">
                  {isInView ? (
                    <AreaChart data={market.data}>
                      <defs>
                        <linearGradient
                          id={`gradient-${index}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={market.color} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={market.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="currentColor"
                        className="text-slate-100 dark:text-white/5"
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        tick={{
                          fill: "currentColor",
                          fontSize: 10,
                          className: "text-slate-400 dark:text-white/25",
                        }}
                      />
                      <YAxis hide />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={market.color}
                        strokeWidth={2.5}
                        fill={`url(#gradient-${index})`}
                        dot={false}
                        isAnimationActive
                        animationDuration={1500}
                      />
                    </AreaChart>
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </ResponsiveContainer>
              </div>

              {/* Footer List */}
              <div className="mt-4 bg-slate-50/80 dark:bg-[#0b101b]/70 border-t border-slate-100 dark:border-white/10">
                <div className="grid grid-cols-2 px-6 py-5">
                  {market.items.map((item, i) => (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-1 ${
                        i === 0
                          ? "pr-6 border-r border-slate-200 dark:border-white/10"
                          : "pl-6"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-400 dark:text-white/40 uppercase tracking-wider text-center">
                        {item.symbol}
                      </span>
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.price}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            item.up
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-500"
                          }`}
                        >
                          {item.change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-16 text-center text-xs text-slate-500 dark:text-white/40">
          Educational simulation only. Market data shown for learning purposes —
          no real money trading or investment advice.
        </p>
      </div>
    </section>
  );
};

export default MarketSection;
