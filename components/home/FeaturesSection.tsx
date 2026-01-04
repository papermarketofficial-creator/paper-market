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
    <section className="relative py-24 overflow-hidden bg-background transition-colors duration-300">
      {/* BACKGROUND GLOW - Softened for Light Mode */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          w-[600px] h-[600px]
          bg-blue-400/10 dark:bg-blue-500/20
          rounded-full blur-[120px] md:blur-[160px]"
        />
      </div>

      <div className="relative z-10 container mx-auto px-4">
        {/* ABOUT TAG */}
        <div className="flex justify-center mb-10">
          <span className="px-6 py-1.5 rounded-full 
            bg-blue-50 dark:bg-slate-800/50 
            border border-blue-100 dark:border-white/10 
            text-sm font-semibold text-blue-700 dark:text-white/90 
            backdrop-blur-md">
            About
          </span>
        </div>

        {/* SECTION HEADING */}
        <h2 className="text-center text-[40px] md:text-[52px] font-bold 
          text-slate-900 dark:text-white mb-6 tracking-tight">
          Why Traders Love Paper Market Pro
        </h2>

        {/* SUBTITLE */}
        <p className="max-w-2xl mx-auto text-center 
          text-slate-600 dark:text-white/50 
          text-[17px] leading-relaxed mb-20">
          Built for both beginners and seasoned traders, Paper Market Pro combines
          intuitive design, powerful analytics, and low fees.
        </p>

        {/* FEATURE CARDS GRID */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
          {features.map((feature, i) => {
            const Icon = feature.icon;

            return (
              <div
                key={i}
                className={`feature-card group ${
                  feature.highlight ? "feature-card-highlight md:-translate-y-6" : ""
                }`}
              >
                <div className="feature-card-inner px-10 py-12 h-full flex flex-col items-start transition-all duration-300">
                  {/* ICON CIRCLE */}
                  <div className="bg-blue-600 w-14 h-14 rounded-2xl mb-8 flex items-center justify-center 
                    shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>

                  {/* TITLE */}
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
                    {feature.title}
                  </h3>

                  {/* DESCRIPTION */}
                  <p className="text-slate-600 dark:text-white/40 text-[16px] leading-relaxed">
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