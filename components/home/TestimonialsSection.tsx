"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';

const testimonials = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=800&fit=crop',
    rating: 4.8,
    text: "As a beginner, I was intimidated by trading platforms. TradePro's interface and educational resources made it easy to get started.",
    author: "James K.",
    title: "Crypto Investor"
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=800&fit=crop',
    rating: 5.0,
    text: "The real-time data and analytics have completely transformed my trading strategy. I'm seeing consistent returns like never before.",
    author: "Michael T.",
    title: "Forex Trader"
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&h=800&fit=crop',
    rating: 4.5,
    text: "Low fees and fast execution are crucial for my day trading. TradePro delivers on both fronts flawlessly.",
    author: "Sarah L.",
    title: "Day Trader"
  }
];

const TestimonialsSection = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  const current = testimonials[currentIndex];
  const nextPreview = testimonials[(currentIndex + 1) % testimonials.length];

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 20 : -20,
      opacity: 0,
    }),
  };

  return (
    <section className="py-24 bg-[#02040a] relative overflow-hidden min-h-[700px]">
      {/* Background Image - Right Side */}
      <div 
        className="absolute top-0 right-0 w-1/2 h-full opacity-30 pointer-events-none bg-no-repeat bg-right-top z-0"
        style={{ backgroundImage: "url('/shapes/steps-bg.png')", backgroundSize: 'contain' }}
      />

      <div className="container mx-auto px-4 relative z-10">
        {/* HEADER LINE: H2 and Stats aligned */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-20 gap-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            Hear From Our Traders
          </h2>
          
          <div className="flex items-center gap-5">
            <span className="text-6xl md:text-7xl font-bold text-blue-600 leading-none">95%</span>
            <p className="text-white/60 text-lg font-medium leading-tight">
              Positive feedback<br />from our Traders.
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* LEFT CONTENT: Animated Testimonial */}
          <div className="flex-1">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              {/* User Image Animation */}
              <div className="w-full md:w-[320px] h-[380px] rounded-[32px] overflow-hidden shrink-0 border border-white/5 relative bg-[#0b101b]">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.img
                    key={current.id}
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    src={current.image}
                    alt={current.author}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </AnimatePresence>
              </div>

              {/* Text Animation */}
              <div className="flex flex-col flex-1 pt-2">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={current.id}
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.4, ease: "easeInOut", delay: 0.1 }}
                  >
                    <div className="flex items-center gap-1 mb-6">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-5 h-5 ${i < Math.floor(current.rating) ? 'text-blue-500 fill-blue-500' : 'text-white/10'}`} 
                        />
                      ))}
                      <span className="text-blue-500 ml-3 text-xl font-bold">{current.rating}</span>
                    </div>

                    <p className="text-white/80 text-xl leading-relaxed mb-8 font-medium">
                      "{current.text}"
                    </p>

                    <div className="mb-10">
                      <span className="text-white font-bold text-xl">{current.author}</span>
                      <span className="text-white/40 ml-3 font-medium">| {current.title}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Controls */}
                <div className="flex gap-4">
                  <button 
                    onClick={handlePrev}
                    className="p-4 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all active:scale-95"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={handleNext}
                    className="p-4 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all active:scale-95"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Preview Card positioned at the TOP */}
          <div className="lg:w-[380px] flex flex-col justify-start pt-2">
            <div className="relative">
               <div className="p-8 rounded-[32px] border  bg-white/[0.03] backdrop-blur-2xl relative overflow-hidden ">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={nextPreview.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="relative z-10"
                  >
                    <p className="text-white/40 text-sm leading-relaxed mb-6 italic">
                      "{nextPreview.text}"
                    </p>
                    <div className="text-sm">
                      <span className="text-white/70 font-bold">{nextPreview.author}</span>
                      <span className="text-white/30 ml-2">| {nextPreview.title}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#02040a]/60 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;