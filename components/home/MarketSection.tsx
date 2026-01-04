"use client";
import { useRef } from "react"; //
import { useInView } from "framer-motion"; //
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/* Dummy data generator remains the same */
const generateData = (base: number, volatility: number) =>
  Array.from({ length: 20 }, (_, i) => ({
    date: i === 0 ? "2/26" : i === 4 ? "3/13" : i === 8 ? "3/26" : i === 12 ? "4/13" : i === 16 ? "5/13" : i === 19 ? "5/26" : "",
    value: base + Math.random() * volatility - volatility / 2,
  }));

const markets = [
  {
    name: "Stocks",
    color: "#22c55e",
    data: generateData(180, 40),
    items: [
      { symbol: "AAPL", price: "189.84", change: "+1.2%", up: true },
      { symbol: "MSFT", price: "412.65", change: "+0.75%", up: true },
    ],
  },
  {
    name: "Crypto",
    date: "May 26, 2025",
    color: "#3b82f6",
    data: generateData(60000, 15000),
    items: [
      { symbol: "BTC/USD", price: "68,421", change: "+2.3%", up: true },
      { symbol: "ETH/USD", price: "3,845", change: "-0.5%", up: false },
    ],
  },
  {
    name: "Forex",
    date: "May 26, 2025",
    color: "#f97316",
    data: generateData(1.2, 0.4),
    items: [
      { symbol: "EUR/USD", price: "1.0921", change: "+0.15%", up: true },
      { symbol: "GBP/USD", price: "1.2654", change: "-0.08%", up: false },
    ],
  },
];

const MarketSection = () => {
  // 1. Create a ref for the section
  const sectionRef = useRef(null);
  
  // 2. Monitor visibility. "amount: 0.5" means it triggers when 50% (the center) is visible
  // "once: true" ensures it doesn't re-animate every time you scroll up and down
  const isInView = useInView(sectionRef, { amount: 0.5, once: true });

  return (
    <section ref={sectionRef} className="relative py-24 bg-[#02040a]">
      <div className="container mx-auto px-4">
        {/* Header Section */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 backdrop-blur">
            Market
          </span>
        </div>

        <div className="text-center mb-20">
          <h2 className="text-[42px] font-semibold text-white mb-4">
            Today’s Market Highlights
          </h2>
          <p className="text-white/45 max-w-2xl mx-auto text-base">
            Stay ahead with real-time updates on the biggest market movers and trending assets.
          </p>
        </div>

        {/* Market Cards Grid */}
        <div className="grid md:grid-cols-3 gap-10 max-w-7xl mx-auto">
          {markets.map((market, index) => (
            <div
              key={index}
              className="relative rounded-[28px] overflow-hidden bg-[#060913]/80 backdrop-blur-xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
            >
              <div className="px-6 pt-6 pb-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-white">{market.name}</h3>
                  {market.date && <span className="text-xs text-white/30">{market.date}</span>}
                </div>
              </div>

              {/* Chart Section */}
              <div className="h-[220px] w-full px-4">
                <ResponsiveContainer width="100%" height="100%">
                  {/* 3. Only render the AreaChart if isInView is true */}
                  {isInView ? (
                    <AreaChart data={market.data}>
                      <defs>
                        <linearGradient id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={market.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={market.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                      />
                      <YAxis hide />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={market.color}
                        strokeWidth={2}
                        fill={`url(#gradient-${index})`}
                        dot={false}
                        // Ensure animation is active when component mounts
                        isAnimationActive={true}
                        animationDuration={1500}
                      />
                    </AreaChart>
                  ) : (
                    <div className="w-full h-full" /> // Placeholder while off-screen
                  )}
                </ResponsiveContainer>
              </div>

              {/* Footer List */}
              <div className="mt-4 bg-[#0b101b]/70 border-t border-white/10">
                <div className="grid grid-cols-2 px-6 py-4">
                  {market.items.map((item, i) => (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-1 ${i === 0 ? "pr-6 border-r border-white/10" : "pl-6"}`}
                    >
                      <span className="text-xs text-white/40 uppercase text-center">{item.symbol}</span>
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-sm font-semibold text-white">{item.price}</span>
                        <span className={`text-xs font-semibold ${item.up ? "text-emerald-400" : "text-red-500"}`}>
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
      </div>
    </section>
  );
};

export default MarketSection;