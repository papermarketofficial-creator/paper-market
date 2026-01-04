import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Flame } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-[url('/shapes/hero-bg.png')] bg-cover bg-center bg-no-repeat">
      {/* Blobs */}
      <div className="absolute inset-0 pointer-events-none">
        {/* CENTER BLUE GLOW */}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[1100px] h-[1100px]
          bg-blue-500/25
          rounded-full blur-[360px]" />

        {/* LEFT TOP SILVER */}
        <div className="absolute -top-[420px] -left-[420px]
          w-[900px] h-[900px]
          bg-gradient-to-br from-slate-300/25 via-slate-400/15 to-transparent
          rounded-full blur-[300px]" />

        {/* RIGHT TOP SILVER */}
        <div className="absolute -top-[420px] -right-[420px]
          w-[900px] h-[900px]
          bg-gradient-to-bl from-slate-300/25 via-slate-400/15 to-transparent
          rounded-full blur-[300px]" />

        {/* Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4">
        <div className="pt-[140px] pb-[120px] text-center">
          {/* Promo */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
              bg-white/5 border border-white/10
              text-sm text-white/80 backdrop-blur">
              <Flame className="w-4 h-4 text-blue-400" />
              Trade Smarter – Save 50% Now!
            </div>
          </div>

          {/* Heading */}
          <h1 className="max-w-5xl mx-auto text-[44px] leading-[1.15]
            md:text-[56px] lg:text-[72px]
            font-semibold text-white mb-6 text-gradient">
              <span className="">  Empower Your Financial 
          <br />
            Future</span> with Smart Trading
          </h1>

          {/* Subtext */}
          <p className="max-w-2xl mx-auto text-[15px] md:text-base
            text-white/60 leading-relaxed mb-12">
            Join millions of traders who trust our platform for real-time insights,
            powerful tools, and seamless trading experience.
          </p>

          {/* Primary CTA */}
          <div className="flex justify-center mb-6">
            <Link href="/dashboard">
              <Button
                size="lg"
                className="h-12 px-8 rounded-full gap-2
                bg-blue-600 hover:bg-blue-700 text-base font-medium"
              >
                Start Trading Now <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Secondary CTA */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              className="h-11 px-6 rounded-full
              border-white/25 text-white/80
              hover:bg-white/5"
            >
              Explore Features
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
