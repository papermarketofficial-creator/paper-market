import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Flame } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-background bg-[url('/shapes/hero-bg.png')] bg-cover bg-center bg-no-repeat transition-colors duration-300">
      
      {/* Background Blobs / Glows */}
      <div className="absolute inset-0 pointer-events-none">
        {/* CENTER BLUE GLOW */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[1100px] h-[1100px]
          bg-blue-400/20 dark:bg-blue-500/25
          rounded-full blur-[120px] md:blur-[360px]"
        />

        {/* TOP LEFT SOFT GLOW */}
        <div
          className="absolute -top-[420px] -left-[420px]
          w-[900px] h-[900px]
          bg-gradient-to-br from-blue-200/30 dark:from-slate-300/25 via-transparent to-transparent
          rounded-full blur-[300px]"
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4">
        <div className="py-20 text-center">

          {/* Promo Pill */}
          <div className="flex justify-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full
              bg-blue-50/50 dark:bg-white/5 border border-blue-100 dark:border-white/10
              text-sm font-medium text-blue-700 dark:text-white/80 backdrop-blur-sm"
            >
              <Flame className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              Learn Trading with Zero Risk
            </div>
          </div>

          {/* Heading */}
          <h1
            className="max-w-5xl mx-auto text-[44px] leading-[1.15]
            md:text-[56px] lg:text-[72px]
            font-bold text-slate-900 dark:text-white mb-6 text-gradient"
          >
            Practice Stock Market Trading
            <br className="hidden md:block" />
            Without Using Real Money
          </h1>

          {/* Subtext */}
          <p
            className="max-w-2xl mx-auto text-[15px] md:text-base
            text-slate-600 dark:text-white/60 leading-relaxed mb-12"
          >
            Paper Market Pro is an educational paper trading platform where you can
            practice trading using virtual money based on real market prices.
            Learn strategies, risk management, and trading psychology safely.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button
                size="lg"
                className="h-12 px-8 rounded-full gap-2
                bg-blue-600 hover:bg-blue-700 text-white text-base font-medium shadow-lg shadow-blue-500/20"
              >
                Start Paper Trading <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>

  {/* CTA Button */}
                <Button
                  className={"w-fit rounded-full bg-muted hover:bg-muted/80 text-foreground"
                  }
                >
                  How It Works?
                </Button>
          </div>

          {/* Disclaimer */}
          <p className="mt-8 text-xs text-slate-500 dark:text-white/40">
            Educational simulation only. No real money trading or financial advice.
          </p>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
