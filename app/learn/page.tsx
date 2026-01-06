'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, TrendingUp, Clock, ArrowRight, Lock, BarChart2, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";

// Available learning modules
const learningModules = [
  {
    id: 'futures-options',
    title: 'Futures & Options',
    description: 'Master the fundamentals of derivatives trading, hedging strategies, and risk management.',
    estimatedTime: '1.5 hours',
    lessons: 18,
    icon: TrendingUp,
    available: true,
    popular: true,
    level: 'Beginner'
  },
  {
    id: 'technical-analysis',
    title: 'Technical Analysis',
    description: 'Learn to read charts, identify patterns, and use indicators to predict market movements.',
    estimatedTime: '2 hours',
    lessons: 15,
    icon: BarChart2,
    available: false,
    level: 'Intermediate'
  },
  {
    id: 'fundamental-analysis',
    title: 'Fundamental Analysis',
    description: 'Understand company valuations, read balance sheets, and analyze economic indicators.',
    estimatedTime: '2.5 hours',
    lessons: 20,
    icon: BookOpen,
    available: false,
    level: 'Advanced'
  },
];

const LearnPage = () => {
  return (
    <div className="relative min-h-[calc(100vh-65px)] w-full overflow-hidden bg-background">
      
      {/* Background Elements - Optimized for Light/Dark */}
      <div className="absolute inset-0 bg-grid-slate-200/60 dark:bg-grid-slate-800/20 bg-[size:30px_30px] [mask-image:linear-gradient(to_bottom,white,transparent)] -z-10" />
      
      {/* Ambient Glow - Subtle in Light, Visible in Dark */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/10 dark:bg-primary/20 blur-[120px] -z-10 rounded-full opacity-60 dark:opacity-40" />

      <div className="container mx-auto px-4 py-16 max-w-6xl">
        
        {/* Header Section */}
        <div className="flex flex-col items-center text-center mb-16 space-y-6">
          <Badge variant="outline" className="px-4 py-1.5 rounded-full border-blue-200 dark:border-primary/20 text-blue-700 dark:text-primary bg-blue-50/50 dark:bg-primary/5 text-sm backdrop-blur-sm shadow-sm">
            <GraduationCap className="w-3.5 h-3.5 mr-2" />
            Paper Market Academy
          </Badge>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-200 dark:to-white">
              Master the Market
            </span>
          </h1>
          
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            From basic terminology to advanced hedging strategies. 
            Select a module below to start your journey.
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {learningModules.map((module) => {
            const IconComponent = module.icon;
            const isLocked = !module.available;

            return (
              <Card 
                key={module.id} 
                className={`
                  group relative flex flex-col h-full overflow-hidden transition-all duration-300
                  ${isLocked 
                    ? 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 opacity-80' 
                    : 'bg-white/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 backdrop-blur-md hover:border-blue-300 dark:hover:border-primary/50 hover:shadow-xl hover:shadow-blue-900/5 dark:hover:shadow-primary/5 hover:-translate-y-1'
                  }
                `}
              >
                {/* Popular Badge */}
                {module.popular && !isLocked && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-gradient-to-bl from-blue-600 to-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-md">
                      POPULAR
                    </div>
                  </div>
                )}

                <CardContent className="flex flex-col h-full p-6 pt-8">
                  {/* Icon Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`
                      p-3 rounded-2xl transition-colors duration-300 shadow-sm
                      ${isLocked 
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500' 
                        : 'bg-blue-50 dark:bg-primary/10 text-blue-600 dark:text-primary group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-primary dark:group-hover:text-black'
                      }
                    `}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    {isLocked ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <Lock className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Locked</span>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent">
                        {module.level}
                      </Badge>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 space-y-3 mb-6">
                    <h3 className={`font-bold text-xl tracking-tight ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                      {module.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {module.description}
                    </p>
                  </div>

                  {/* Metadata & Action */}
                  <div className="mt-auto space-y-4">
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {module.estimatedTime}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" />
                        {module.lessons} Lessons
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
                      {isLocked ? (
                        <Button variant="ghost" disabled className="w-full justify-start cursor-not-allowed text-slate-400 hover:bg-transparent pl-0 h-auto py-0">
                          <span className="text-sm font-medium">Available soon</span>
                        </Button>
                      ) : (
                        <Link href={`/learn/${module.id}`} className="block">
                          <Button className="w-full bg-slate-900 dark:bg-primary hover:bg-blue-700 dark:hover:bg-primary/90 text-white dark:text-primary-foreground shadow-lg shadow-blue-900/10 transition-all duration-300 group/btn">
                            Start Learning
                            <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Prompt */}
        <div className="mt-20 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Want to test your knowledge immediately? 
            <Link href="/dashboard" className="text-blue-600 dark:text-primary hover:underline ml-1 font-medium transition-colors">
              Go to Paper Trading Terminal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LearnPage;