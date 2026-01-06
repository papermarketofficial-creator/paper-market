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
      question: "Is this real trading?",
      answer:
        "No. This is a paper trading platform designed purely for educational purposes. All trades are executed using virtual money to help users learn without financial risk."
    },
    {
      question: "Do I need to invest real money?",
      answer:
        "No real money is required at any stage. Every user receives a virtual balance that can be used to practice trading strategies safely."
    },
    {
      question: "Who should use this platform?",
      answer:
        "This platform is ideal for beginners, students, working professionals, and traders who want to test strategies before entering real markets."
    },
    {
      question: "Do I need prior trading experience?",
      answer:
        "Not at all. The platform is beginner-friendly and includes simple workflows, guided learning, and performance tracking to help you grow step by step."
    }
  ],

  Features: [
    {
      question: "What markets can I practice trading?",
      answer:
        "You can practice trading across selected asset classes such as stocks, crypto, and forex using simulated trades powered by real or near-real-time market data."
    },
    {
      question: "How does paper trading work?",
      answer:
        "You place buy or sell orders just like a real trading platform, but the system uses virtual money and simulated execution while reflecting real market price movements."
    },
    {
      question: "Can I track my performance?",
      answer:
        "Yes. You can view your virtual balance, profit & loss, open and closed trades, win rate, and other performance metrics to analyze your progress."
    },
    {
      question: "Is there a trading journal?",
      answer:
        "Yes. You can add notes to your trades to record your reasoning, emotions, and mistakes—helping you improve discipline and decision-making."
    }
  ],

  Pricing: [
    {
      question: "Is there a free plan?",
      answer:
        "Yes. We offer a free plan that allows limited daily paper trades and access to basic performance statistics for learning purposes."
    },
    {
      question: "What does the premium plan include?",
      answer:
        "Premium plans may include unlimited paper trades, advanced analytics, detailed performance insights, and exportable trade history."
    },
    {
      question: "Are there any hidden charges?",
      answer:
        "No. Since this is a paper trading platform, there are no brokerage fees, no transaction costs, and no hidden charges."
    }
  ],

  Community: [
    {
      question: "Is there a learning community?",
      answer:
        "Yes. Users can engage with other learners through community discussions, shared strategies, and educational content."
    },
    {
      question: "Can I share my strategies?",
      answer:
        "You can discuss strategies and learning experiences with other users, but no buy/sell tips or investment advice is provided on the platform."
    },
    {
      question: "Will this help me trade in real markets?",
      answer:
        "Paper trading helps build confidence, discipline, and strategy validation. However, real markets involve emotions and risks that go beyond simulations."
    }
  ]
};

const FAQSection = () => {
  const [activeTab, setActiveTab] = useState('General');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const categories = Object.keys(faqData);
  const currentFAQs = faqData[activeTab];

  return (
    <section className="py-24 bg-blue-50/45 dark:bg-background relative overflow-hidden transition-colors duration-300">
      <div className="container mx-auto px-4 relative z-10">
        {/* Badge */}
        <div className="flex justify-center mb-6">
          <span className="px-5 py-1.5 rounded-full bg-blue-50 dark:bg-white/5 border border-blue-100 dark:border-white/10 text-[10px] font-bold text-blue-600 dark:text-white/50 uppercase tracking-widest backdrop-blur-md">
            FAQs
          </span>
        </div>

        {/* Heading */}
        <h2 className="text-center text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-12 tracking-tight">
          Frequently Asked Questions
        </h2>

        {/* Tabs */}
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

        {/* Content */}
        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-start">
          {/* Questions */}
          <div className="space-y-4">
            {currentFAQs.map((item, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`w-full flex items-center justify-between p-6 rounded-[20px] transition-all duration-300 border ${
                  selectedIndex === index
                    ? 'bg-white dark:bg-[#0b101b] border-blue-500/50 shadow-lg'
                    : 'bg-slate-50 dark:bg-[#0b101b]/40 border-slate-200 dark:border-white/5 hover:border-blue-200'
                }`}
              >
                <span
                  className={`text-lg font-bold text-left ${
                    selectedIndex === index
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-white/60'
                  }`}
                >
                  {item.question}
                </span>
                {selectedIndex === index ? (
                  <Minus className="w-5 h-5 text-blue-600" />
                ) : (
                  <Plus className="w-5 h-5 text-slate-300" />
                )}
              </button>
            ))}
          </div>

          {/* Answer */}
          <div className="hidden lg:block min-h-[400px]">
            <div className="bg-slate-50 dark:bg-[#0b101b]/60 border border-slate-200 dark:border-white/5 rounded-[32px] p-10 h-full relative shadow-sm">
              <div className="absolute top-10 bottom-10 left-0 w-[3px] rounded-r-full bg-blue-600/50" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeTab}-${selectedIndex}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex items-center"
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
