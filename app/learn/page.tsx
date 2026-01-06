'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, TrendingUp, Clock, ArrowRight, Lock, BarChart2 } from 'lucide-react';
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
    <div className="relative min-h-[calc(100vh-65px)] w-full overflow-hidden">
      
      {/* Background Elements */}
      <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/20 bg-[size:30px_30px] [mask-image:linear-gradient(to_bottom,white,transparent)] -z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 blur-[100px] -z-10 rounded-full opacity-50" />

      <div className="container mx-auto px-4 py-16 max-w-6xl">
        
        {/* Header Section */}
        <div className="flex flex-col items-center text-center mb-16 space-y-4">
          <Badge variant="outline" className="px-4 py-1.5 rounded-full border-primary/20 text-primary bg-primary/5 text-sm backdrop-blur-sm">
          Paper Market Learn
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gradient-primary">
            Master the Market
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
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
                  group relative flex flex-col h-full border-border/50 overflow-hidden transition-all duration-300
                  ${isLocked 
                    ? 'bg-muted/20 opacity-80 hover:opacity-100' 
                    : 'bg-card/40 backdrop-blur-sm hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1'
                  }
                `}
              >
                {/* Popular Badge */}
                {module.popular && !isLocked && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-xl shadow-sm">
                      Popular
                    </div>
                  </div>
                )}

                <CardContent className="flex flex-col h-full p-6 pt-8">
                  {/* Icon Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`
                      p-3 rounded-2xl transition-colors duration-300
                      ${isLocked 
                        ? 'bg-muted text-muted-foreground' 
                        : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                      }
                    `}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    {isLocked ? (
                      <Lock className="h-4 w-4 text-muted-foreground/50" />
                    ) : (
                      <Badge variant="secondary" className="bg-secondary/50">
                        {module.level}
                      </Badge>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 space-y-2 mb-6">
                    <h3 className={`font-bold text-xl ${isLocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {module.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {module.description}
                    </p>
                  </div>

                  {/* Metadata & Action */}
                  <div className="mt-auto space-y-4">
                    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {module.estimatedTime}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" />
                        {module.lessons} Lessons
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40">
                      {isLocked ? (
                        <Button variant="ghost" disabled className="w-full justify-start cursor-not-allowed text-muted-foreground hover:bg-transparent pl-0">
                          <Lock className="mr-2 h-4 w-4" />
                          Coming Soon
                        </Button>
                      ) : (
                        <Link href={`/learn/${module.id}`} className="block">
                          <Button className="w-full group-hover:bg-primary/90 transition-all">
                            Start Learning
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
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
          <p className="text-sm text-muted-foreground">
            Want to test your knowledge? 
            <Link href="/dashboard" className="text-primary hover:underline ml-1 font-medium">
              Go to Paper Trading Terminal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LearnPage;