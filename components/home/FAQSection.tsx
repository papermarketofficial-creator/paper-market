"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

type FAQItem = {
  question: string;
  answer: string;
};

type FAQData = {
  [key: string]: FAQItem[];
};

const faqData: FAQData = {
  General: [
    {
      question: "How do I withdraw funds?",
      answer: "You can withdraw funds at any time through your account dashboard. Select the \"Withdraw\" option, choose your withdrawal method, and follow the instructions. Withdrawals typically process within 1-3 business days."
    },
    {
      question: "Is my money safe?",
      answer: "Yes, we use bank-level encryption and 24/7 monitoring to ensure your funds and personal information are always protected."
    },
    {
      question: "What assets can I trade?",
      answer: "We offer a wide range of assets including Stocks, Cryptocurrencies, and Forex pairs with real-time market data."
    },
    {
      question: "Do I need experience?",
      answer: "No, our platform is designed for both beginners and seasoned traders. We provide educational resources and a virtual wallet to practice."
    }
  ],
  Features: [
    {
      question: "What trading tools are available?",
      answer: "Our features include advanced charting, real-time analytics, and automated trading bots to help optimize your strategy."
    }
  ],
  Pricing: [
    {
      question: "Are there any hidden fees?",
      answer: "No, we maintain a transparent fee structure with low spreads and zero account maintenance costs."
    }
  ],
  Community: [
    {
      question: "How can I join the community?",
      answer: "Once you create an account, you can access our community forums and Discord server to interact with other traders."
    }
  ]
};

const FAQSection = () => {
  const [activeTab, setActiveTab] = useState('General');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const categories = Object.keys(faqData);
  const currentFAQs = faqData[activeTab];

  return (
    <section className="py-24 bg-white dark:bg-[#02040a] relative overflow-hidden transition-colors duration-300">
      <div className="container mx-auto px-4 relative z-10">
        {/* Section Badge */}
        <div className="flex justify-center mb-6">
          <span className="px-5 py-1.5 rounded-full bg-blue-50 dark:bg-white/5 border border-blue-100 dark:border-white/10 text-[10px] font-bold text-blue-600 dark:text-white/50 uppercase tracking-widest backdrop-blur-md">
            FAQs
          </span>
        </div>

        {/* Heading */}
        <h2 className="text-center text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-12 tracking-tight">
          Frequently Asked Questions
        </h2>

        {/* Tab Navigation */}
        <div className="flex justify-center gap-8 md:gap-12 mb-16 border-b border-slate-200 dark:border-white/5">
          {categories.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIndex(0);
              }}
              className={`pb-4 text-sm font-semibold transition-all relative ${
                activeTab === tab 
                  ? 'text-blue-600 dark:text-blue-500' 
                  : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/60'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 dark:bg-blue-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* FAQ Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-start">
          {/* Left Side: Question List */}
          <div className="space-y-4">
            {currentFAQs.map((item, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`w-full flex items-center justify-between p-6 rounded-[20px] transition-all duration-300 border ${
                  selectedIndex === index
                    ? 'bg-white dark:bg-[#0b101b] border-blue-500/50 shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                    : 'bg-slate-50 dark:bg-[#0b101b]/40 border-slate-200 dark:border-white/5 hover:border-blue-200 dark:hover:border-white/10'
                }`}
              >
                <span className={`text-lg font-bold text-left transition-colors ${
                  selectedIndex === index ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-white/60'
                }`}>
                  {item.question}
                </span>
                <div className={`transition-transform duration-300 ${selectedIndex === index ? 'rotate-180' : 'rotate-0'}`}>
                  {selectedIndex === index ? (
                    <Minus className="w-5 h-5 text-blue-600 dark:text-white" />
                  ) : (
                    <Plus className="w-5 h-5 text-slate-300 dark:text-white/40" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right Side: Answer Display */}
          <div className="hidden lg:block h-full min-h-[400px]">
            <div className="bg-slate-50 dark:bg-[#0b101b]/60 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-[32px] p-10 h-full relative overflow-hidden shadow-sm">
              {/* Blue accent line */}
              <div className="absolute top-10 bottom-10 left-0 w-[3px] rounded-r-full bg-blue-600/50" />
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeTab}-${selectedIndex}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col justify-center"
                >
                  <p className="text-xl md:text-2xl leading-relaxed text-slate-700 dark:text-white/80 font-medium">
                    {currentFAQs[selectedIndex].answer}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;