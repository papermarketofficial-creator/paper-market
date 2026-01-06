"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Layers , Clock, CheckCircle2, Play, ArrowRight, ChevronLeft, Trophy, Lock } from 'lucide-react';
import Link from 'next/link';

// Mock data for chapters
const chapters = [
  {
    id: 'introduction',
    title: 'Introduction to F&O',
    description: 'Learn the basics of derivatives and why Futures & Options exist in financial markets.',
    lessons: 4,
    completedLessons: 4, // 100% completed
    estimatedTime: '15 min',
    icon: Layers ,
    locked: false
  },
  {
    id: 'futures',
    title: 'Futures Trading Explained',
    description: 'Understand futures contracts, margins, leverage, and how P&L is calculated.',
    lessons: 5,
    completedLessons: 2, // Partial progress
    estimatedTime: '20 min',
    icon: Layers ,
    locked: false
  },
  {
    id: 'options',
    title: 'Options Trading Explained',
    description: 'Master call and put options, strike prices, premiums, and the Greeks.',
    lessons: 6,
    completedLessons: 0,
    estimatedTime: '25 min',
    icon: Layers ,
    locked: false
  },
  {
    id: 'platform',
    title: 'F&O in Paper Market Pro',
    description: 'How to practice Futures & Options safely in this educational platform.',
    lessons: 3,
    completedLessons: 0,
    estimatedTime: '10 min',
    icon: Layers ,
    locked: true
  },
];

const FuturesOptionsPage = () => {
  // Calculate total course progress
  const totalLessons = chapters.reduce((acc, curr) => acc + curr.lessons, 0);
  const totalCompleted = chapters.reduce((acc, curr) => acc + curr.completedLessons, 0);
  const overallProgress = Math.round((totalCompleted / totalLessons) * 100);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/20 bg-[size:30px_30px] [mask-image:linear-gradient(to_bottom,white,transparent)] -z-10" />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        
        {/* Navigation & Header Section */}
        <div className="mb-12 space-y-6">
          <Link href="/learn" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Learning Center
          </Link>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                  Intermediate Module
                </Badge>
                {/* XP Badge Removed */}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Futures & Options
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Master the fundamentals of derivatives trading. Learn how to hedge risks and speculate on future price movements.
              </p>
            </div>

            {/* Overall Progress Card */}
            <Card className="w-full md:w-80 bg-card/50 backdrop-blur-sm border-primary/20 shadow-lg shadow-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Course Progress</span>
                  <span className="text-sm font-bold text-primary">{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-2 mb-2" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                  <span>{totalCompleted}/{totalLessons} Lessons Completed</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Chapters Grid - 3 Columns */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {chapters.map((chapter, index) => {
            const progress = (chapter.completedLessons / chapter.lessons) * 100;
            const isCompleted = progress === 100;
            const isStarted = progress > 0 && progress < 100;
            const IconComponent = chapter.icon;

            return (
              <Card 
                key={chapter.id} 
                className={`
                  group relative flex flex-col h-full overflow-hidden transition-all duration-300 border-border/50
                  ${chapter.locked 
                    ? 'bg-muted/30 opacity-75' 
                    : 'bg-card/40 backdrop-blur-sm hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/30'
                  }
                `}
              >
                {/* Visual Status Indicator Strip */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300
                  ${isCompleted ? 'bg-green-500' : isStarted ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/30'}
                `} />

                <CardHeader className="pb-2 pl-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`
                      p-2.5 rounded-xl transition-colors
                      ${isCompleted ? 'bg-green-500/10 text-green-600' : 'bg-primary/10 text-primary'}
                    `}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-mono text-muted-foreground/60 mb-1">
                        0{index + 1}
                      </span>
                      {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                      {chapter.locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  
                  <CardTitle className="text-lg leading-tight mb-2 group-hover:text-primary transition-colors">
                    {chapter.title}
                  </CardTitle>
                  <CardDescription className="text-sm line-clamp-2">
                    {chapter.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 pl-6 flex flex-col flex-1">
                  {/* Metadata Row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6">
                    <div className="flex items-center gap-1.5 bg-background/50 px-2 py-1 rounded-md border border-border/50">
                      <Layers  className="h-3 w-3" />
                      {chapter.lessons} Lessons
                    </div>
                    <div className="flex items-center gap-1.5 bg-background/50 px-2 py-1 rounded-md border border-border/50">
                      <Clock className="h-3 w-3" />
                      {chapter.estimatedTime}
                    </div>
                  </div>

                  {/* Spacer to push content to bottom */}
                  <div className="mt-auto">
                    
                    {/* Progress Bar (Only if started or completed) */}
                    {(isStarted || isCompleted) && (
                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                          <span>{Math.round(progress)}% Complete</span>
                        </div>
                        <Progress value={progress} className={`h-1.5 ${isCompleted ? 'bg-green-100' : ''}`} />
                      </div>
                    )}

                    {/* Button */}
                    <Link href={`/learn/futures-options/${chapter.id}`} className={chapter.locked ? 'pointer-events-none' : ''}>
                      <Button 
                        variant={isCompleted ? "outline" : "default"}
                        size="sm" 
                        disabled={chapter.locked}
                        className={`
                          w-full justify-between group/btn transition-all h-10
                          ${isCompleted 
                            ? 'text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 dark:border-green-900/30 dark:hover:bg-green-900/20' 
                            : 'hover:bg-primary/90 shadow-lg shadow-primary/10'
                          }
                        `}
                      >
                        {chapter.locked ? (
                          <><span>Locked</span> <Lock className="h-3 w-3 opacity-50" /></>
                        ) : isCompleted ? (
                          <><span>Review Chapter</span> <CheckCircle2 className="h-3.5 w-3.5" /></>
                        ) : isStarted ? (
                          <><span>Continue Learning</span> <ArrowRight className="h-3.5 w-3.5 group-hover/btn:translate-x-1 transition-transform" /></>
                        ) : (
                          <><span>Start Chapter</span> <Play className="h-3.5 w-3.5 fill-current" /></>
                        )}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-12 pt-8 border-t border-border/40 text-center">
          <p className="text-sm text-muted-foreground">
            Complete all chapters to unlock the <span className="font-semibold text-primary">Advanced Derivatives Certificate</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FuturesOptionsPage;