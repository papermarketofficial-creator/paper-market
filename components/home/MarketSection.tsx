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
  Tooltip
} from "recharts";
import { IndianRupee } from "lucide-react";

// --- Types ---
interface MarketItem {
  symbol: string;
  name: string;
  price: string;
  change: string;
  up: boolean;
}

interface MarketDataPoint {
  time: string;
  value: number;
}

interface Market {
  name: string;
  indexValue: string;
  color: string;
  data: MarketDataPoint[];
  items: MarketItem[];
}

// --- Helper: Generate Intraday-like Data ---
const generateData = (base: number, volatility: number): MarketDataPoint[] =>
  Array.from({ length: 25 }, (_, i) => ({
    time: `${9 + Math.floor(i / 4)}:${(i % 4) * 15 || "00"}`,
    value: base + Math.random() * volatility - volatility / 2,
  }));

// --- Data: Indian Context ---
const markets: Market[] = [
  {
    name: "NIFTY 50",
    indexValue: "22,450.30",
    color: "#10b981", // Emerald
    data: generateData(22400, 120),
    items: [
      { symbol: "RELIANCE", name: "Reliance Ind.", price: "2,980.45", change: "+1.2%", up: true },
      { symbol: "TCS", name: "Tata Consultancy", price: "4,120.65", change: "+0.75%", up: true },
    ],
  },
  {
    name: "BANK NIFTY",
    indexValue: "47,850.15",
    color: "#ef4444", // Red
    data: generateData(47800, 350),
    items: [
      { symbol: "HDFCBANK", name: "HDFC Bank", price: "1,440.00", change: "-0.85%", up: false },
      { symbol: "SBIN", name: "State Bank India", price: "765.30", change: "-1.10%", up: false },
    ],
  },
  {
    name: "TOP GAINERS",
    indexValue: "Intraday",
    color: "#3b82f6", // Blue
    data: generateData(18000, 150),
    items: [
      { symbol: "TATAMOTORS", name: "Tata Motors", price: "985.50", change: "+3.4%", up: true },
      { symbol: "BAJFINANCE", name: "Bajaj Finance", price: "7,240.00", change: "+2.1%", up: true },
    ],
  },
];

const MarketSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.3, once: true });

  return (
    <section
      ref={sectionRef}
      className="relative py-20 bg-slate-50 dark:bg-[#02040a] transition-colors duration-300"
    >
      <div className="container mx-auto px-4">
        {/* Header Label */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-1.5 rounded-full bg-blue-50 dark:bg-white/5 border border-blue-100 dark:border-white/10 text-xs font-semibold text-blue-600 dark:text-white/80 backdrop-blur">
            Indian Markets
          </span>
        </div>

        {/* Header Title */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Trade the Indian Markets
          </h2>
          <p className="text-slate-500 dark:text-white/45 max-w-2xl mx-auto text-lg leading-relaxed">
            Practice trading NIFTY, BANKNIFTY, and top Indian stocks with 
            simulated data before risking real capital.
          </p>
        </div>

        {/* Market Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {markets.map((market, index) => (
            <div
              key={index}
              // Changes: rounded-xl (less curvy), remove hover scale, smaller padding
              className="relative rounded-xl overflow-hidden bg-white dark:bg-[#060913]/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-colors duration-300 hover:border-blue-400/40"
            >
              {/* Card Header - Compact */}
              <div className="px-5 pt-5 pb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {market.name}
                    </h3>
                    <div className="flex items-center text-xs font-medium text-slate-400 dark:text-white/40 mt-0.5">
                      {market.name !== "TOP GAINERS" && <IndianRupee className="w-3 h-3 mr-0.5" />}
                      {market.indexValue}
                    </div>
                  </div>
                  
                 
                </div>
              </div>

              {/* Chart Section - Reduced Height */}
              <div className="h-[160px] w-full px-4 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {isInView ? (
                    <AreaChart data={market.data}>
                      <defs>
                        <linearGradient id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={market.color} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={market.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="currentColor"
                        className="text-slate-100 dark:text-white/5"
                        strokeDasharray="3 3"
                      />
                      <XAxis hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '6px', fontSize: '11px', padding: '6px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(value: number) => [`₹${value.toFixed(2)}`, "Value"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={market.color}
                        strokeWidth={2}
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

              {/* Footer List - Compact 2-column layout */}
              <div className="mt-2 bg-slate-50/80 dark:bg-[#0b101b]/70 border-t border-slate-100 dark:border-white/10">
                <div className="grid grid-cols-2 px-4 py-4">
                  {market.items.map((item, i) => (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-0.5 ${
                        i === 0
                          ? "pr-4 border-r border-slate-200 dark:border-white/10"
                          : "pl-4"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-400 dark:text-white/40 uppercase tracking-wider text-center truncate w-full">
                        {item.name}
                      </span>
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
                          <span className="text-[10px] text-slate-400 mr-0.5">₹</span>
                          {item.price}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
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
        <p className="mt-12 text-center text-[10px] text-slate-500 dark:text-white/30 uppercase tracking-wider">
          Educational simulation only. Market data shown for learning purposes.
        </p>
      </div>
    </section>
  );
};

export default MarketSection;