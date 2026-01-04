import { ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01.",
    title: "Create an Account",
    description: "Sign up in just minutes.",
    highlight: false,
  },
  {
    number: "02.",
    title: "Fund Your Wallet",
    description:
      "Choose from a range of trusted payment methods and deposit securely with full encryption.",
    highlight: true,
  },
  {
    number: "03.",
    title: "Start Trading",
    description: "Access global markets instantly.",
    highlight: false,
  },
];

const StepsSection = () => {
  return (
    <section className="relative py-24 overflow-hidden bg-slate-50 dark:bg-[#02040a]">
      {/* Background Grid */}
      <div
        className="absolute top-0 left-0 w-1/2 h-full pointer-events-none bg-no-repeat bg-left-top opacity-20 dark:opacity-50"
        style={{
          backgroundImage: "url('/shapes/steps-bg.png')",
          backgroundSize: "contain",
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-8">
          <div className="max-w-xl">
            <span className="inline-block px-4 py-1.5 mb-6 rounded-full text-xs font-medium
              bg-blue-100 text-blue-700
              dark:bg-white/5 dark:text-white/80 dark:border dark:border-white/10">
              Getting Started
            </span>

            <h2 className="text-4xl md:text-5xl font-bold leading-[1.1]
              text-slate-900 dark:text-white">
              Your <span className="text-blue-600 dark:text-blue-400">First Trade</span>, Made
              <br /> Simple
            </h2>
          </div>

          <p className="text-slate-600 dark:text-white/40 text-lg max-w-[400px] leading-relaxed mb-2">
            Jumpstart your trading experience with intuitive tools and instant market access.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6 items-center">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`relative group rounded-[32px] p-1 transition-all duration-500
                ${
                  step.highlight
                    ? `
                      bg-blue-600
                      shadow-[0_30px_80px_-20px_rgba(37,99,235,0.5)]
                      scale-105 z-20 h-[420px]
                      dark:shadow-[0_0_40px_rgba(37,99,235,0.2)]
                    `
                    : `
                      bg-gradient-to-br from-blue-200/60 via-white to-white
                      dark:from-blue-500/20 dark:via-transparent dark:to-transparent
                      h-[380px]
                    `
                }`}
            >
              <div
                className={`w-full h-full rounded-[30px] p-10 flex flex-col transition-all
                  ${
                    step.highlight
                      ? `
                        bg-blue-600
                      `
                      : `
                        bg-white
                        border border-slate-200
                        shadow-sm
                        dark:bg-[#060913]/45
                        dark:border-white/5
                        dark:backdrop-blur-2xl
                      `
                  }`}
              >
                {/* Number */}
                <span
                  className={`text-2xl font-bold mb-6 block
                    ${
                      step.highlight
                        ? "text-white"
                        : "text-blue-600 dark:text-blue-500"
                    }`}
                >
                  {step.number}
                </span>

                {/* Title */}
                <h3
                  className={`text-3xl font-bold mb-6 leading-tight
                    ${
                      step.highlight
                        ? "text-white"
                        : "text-slate-900 dark:text-white"
                    }`}
                >
                  {step.title}
                </h3>

                {/* Description */}
                <p
                  className={`text-lg mb-8 flex-grow leading-relaxed
                    ${
                      step.highlight
                        ? "text-white/90"
                        : "text-slate-600 dark:text-white/40"
                    }`}
                >
                  {step.description}
                </p>

                {/* CTA */}
                {step.highlight && (
                  <a
                    href="#"
                    className="flex items-center gap-2 text-lg font-semibold text-white group"
                  >
                    Learn more
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StepsSection;
