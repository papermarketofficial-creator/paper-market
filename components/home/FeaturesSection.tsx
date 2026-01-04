import { ChartLine, DollarSign, Shield } from "lucide-react";

const features = [
  {
    icon: ChartLine,
    title: "Real-Time Market Data",
    description: "Stay ahead with up-to-the-second prices and news.",
  },
  {
    icon: DollarSign,
    title: "Low Fees, High Returns",
    description: "Maximize your profits with competitive spreads.",
    highlight: true,
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Bank-level encryption and 24/7 monitoring.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="relative py-16 overflow-hidden bg-[#030712]">
      {/* CENTRAL BLUE GLOW BLOB */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          w-[600px] h-[600px]
          bg-blue-500/30
          rounded-full blur-[160px]"
        />
      </div>

      <div className="relative z-10 container mx-auto px-4">
        {/* ABOUT TAG */}
        <div className="flex justify-center mb-10">
          <span className="px-6 py-1.5 rounded-full bg-[#1e293b]/50 border border-white/10 text-sm font-medium text-white/90 backdrop-blur-md">
            About
          </span>
        </div>

        {/* SECTION HEADING */}
        <h2 className="text-center text-[44px] md:text-[48px] font-bold text-white mb-6 tracking-tight">
          Why Traders Love TradePro
        </h2>

        {/* SUBTITLE */}
        <p className="max-w-3xl mx-auto text-center text-white/50 text-[17px] leading-relaxed mb-24">
          Built for both beginners and seasoned traders, TradePro combines
          intuitive design, powerful analytics, and low fees to help you trade
          faster, smarter, and more successfully.
        </p>

        {/* FEATURE CARDS GRID */}
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12 max-w-6xl mx-auto items-stretch">
          {features.map((feature, i) => {
            const Icon = feature.icon;

            return (
              <div
                key={i}
                className={`feature-card  ${
                  feature.highlight ? "feature-card-highlight md:-translate-y-6" : ""
                }`}
              >
                <div className="feature-card-inner px-10 py-12 h-full flex flex-col items-start">
                  {/* ICON CIRCLE */}
                  <div className="bg-blue-600 w-14 h-14 rounded-full mb-10 flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>

                  {/* TITLE */}
                  <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                    {feature.title}
                  </h3>

                  {/* DESCRIPTION */}
                  <p className="text-white/40 text-[16px] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;