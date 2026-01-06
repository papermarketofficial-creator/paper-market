"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Clock, CheckCircle, Play, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Mock data for chapters
const chapters = [
  {
    id: 'introduction',
    title: 'Introduction to Futures & Options',
    description: 'Learn the basics of derivatives and why Futures & Options exist in financial markets.',
    lessons: 4,
    completedLessons: 2,
    estimatedTime: '15 min',
    icon: BookOpen,
  },
  {
    id: 'futures',
    title: 'Futures Trading Explained',
    description: 'Understand futures contracts, margins, and how P&L is calculated.',
    lessons: 5,
    completedLessons: 0,
    estimatedTime: '20 min',
    icon: BookOpen,
  },
  {
    id: 'options',
    title: 'Options Trading Explained',
    description: 'Master call and put options, strike prices, and premium concepts.',
    lessons: 6,
    completedLessons: 0,
    estimatedTime: '25 min',
    icon: BookOpen,
  },
  {
    id: 'platform',
    title: 'F&O in Paper Market Pro',
    description: 'How to practice Futures & Options safely in this educational platform.',
    lessons: 3,
    completedLessons: 0,
    estimatedTime: '10 min',
    icon: BookOpen,
  },
];

const FuturesOptionsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Simple Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Futures & Options
          </h1>
          <p className="text-muted-foreground">
            Master the fundamentals of derivatives trading
          </p>
        </div>

        {/* Chapters Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {chapters.map((chapter, index) => {
            const progress = (chapter.completedLessons / chapter.lessons) * 100;
            const IconComponent = chapter.icon;

            return (
              <Card key={chapter.id} className="group hover:shadow-md transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-primary/10 rounded-md">
                        <IconComponent className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <Badge variant="secondary" className="mb-1 text-xs">
                          Chapter {index + 1}
                        </Badge>
                        <CardTitle className="text-base">{chapter.title}</CardTitle>
                      </div>
                    </div>
                    {chapter.completedLessons > 0 && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    {chapter.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {chapter.lessons} lessons
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {chapter.estimatedTime}
                      </span>
                    </div>
                    {chapter.completedLessons > 0 && (
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 w-16" />
                        <span className="text-xs text-muted-foreground">
                          {chapter.completedLessons}/{chapter.lessons}
                        </span>
                      </div>
                    )}
                  </div>

                  <Link href={`/learn/futures-options/${chapter.id}`}>
                    <Button size="sm" className="w-full group-hover:bg-primary/90 transition-colors">
                      {chapter.completedLessons > 0 ? (
                        <>
                          Continue
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </>
                      ) : (
                        <>
                          <Play className="mr-1 h-3 w-3" />
                          Start
                        </>
                      )}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            Educational content for understanding Futures & Options concepts
          </p>
        </div>
      </div>
    </div>
  );
};

export default FuturesOptionsPage;