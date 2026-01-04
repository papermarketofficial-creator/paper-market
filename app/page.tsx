'use client';
import dynamic from 'next/dynamic';
import Navbar from "@/components/home/Navbar";
import HeroSection from "@/components/home/HeroSection";
import PartnersSection from '@/components/home/PartnersSection';
import FeaturesSection from "@/components/home/FeaturesSection";
import StepsSection from "@/components/home/StepsSection";
import PricingSection from "@/components/home/PricingSection";
import CTASection from "@/components/home/CTASection";
import Footer from "@/components/home/Footer";

const MarketSection = dynamic(() => import('@/components/home/MarketSection'), { ssr: false });
const TestimonialsSection = dynamic(() => import('@/components/home/TestimonialsSection'), { ssr: false });
const FAQSection = dynamic(() => import('@/components/home/FAQSection'), { ssr: false });

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <PartnersSection />
      <FeaturesSection />
      <StepsSection />
      <MarketSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Home;
