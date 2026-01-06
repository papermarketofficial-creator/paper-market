"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  BookOpen,
  Clock,
  CheckCircle,
  Play,
  ArrowRight,
  Menu,
  ChevronRight,
  Lock
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// Mock data for all chapters and lessons
const chapterData = {
  introduction: {
    title: 'Introduction to Futures & Options',
    description: 'Learn the basics of derivatives and why Futures & Options exist in financial markets.',
    lessons: [
      {
        id: 'what-are-derivatives',
        title: 'What are Derivatives?',
        description: 'Understanding the foundation of financial derivatives',
        estimatedTime: '5 min',
        completed: true,
      },
      {
        id: 'why-futures-options',
        title: 'Why Futures & Options Exist',
        description: 'The purpose and benefits of derivative instruments',
        estimatedTime: '4 min',
        completed: true,
      },
      {
        id: 'futures-vs-options',
        title: 'Futures vs Options (Simple Comparison)',
        description: 'Key differences between futures and options contracts',
        estimatedTime: '3 min',
        completed: false,
      },
      {
        id: 'when-traders-use',
        title: 'When Traders Use F&O',
        description: 'Common scenarios for using derivatives',
        estimatedTime: '3 min',
        completed: false,
      },
    ],
  },
  futures: {
    title: 'Futures Trading Explained',
    description: 'Understand futures contracts, margins, and how P&L is calculated.',
    lessons: [
      {
        id: 'futures-contract',
        title: 'What is a Futures Contract?',
        description: 'The anatomy of a futures agreement',
        estimatedTime: '6 min',
        completed: false,
      },
      {
        id: 'lot-size',
        title: 'Lot Size & Contract Value',
        description: 'Understanding contract specifications',
        estimatedTime: '4 min',
        completed: false,
      },
      {
        id: 'margin-concept',
        title: 'Margin Concept',
        description: 'How leverage works in futures trading',
        estimatedTime: '5 min',
        completed: false,
      },
      {
        id: 'futures-pnl',
        title: 'Futures P&L Calculation',
        description: 'How profits and losses are calculated',
        estimatedTime: '5 min',
        completed: false,
      },
      {
        id: 'futures-risk',
        title: 'Risk Explanation',
        description: 'Understanding the risks involved',
        estimatedTime: '4 min',
        completed: false,
      },
    ],
  },
  options: {
    title: 'Options Trading Explained',
    description: 'Master call and put options, strike prices, and premium concepts.',
    lessons: [
      {
        id: 'call-put-options',
        title: 'Call (CE) & Put (PE) Options',
        description: 'The two types of options contracts',
        estimatedTime: '6 min',
        completed: false,
      },
      {
        id: 'strike-expiry',
        title: 'Strike Price & Expiry',
        description: 'Key parameters of options contracts',
        estimatedTime: '4 min',
        completed: false,
      },
      {
        id: 'premium-explained',
        title: 'Premium Explained',
        description: 'What you pay to buy an option',
        estimatedTime: '5 min',
        completed: false,
      },
      {
        id: 'buyer-vs-seller',
        title: 'Buyer vs Seller',
        description: 'Different perspectives in options trading',
        estimatedTime: '5 min',
        completed: false,
      },
      {
        id: 'options-pnl',
        title: 'Options P&L Examples',
        description: 'How profits and losses work in options',
        estimatedTime: '6 min',
        completed: false,
      },
      {
        id: 'options-strategies',
        title: 'Basic Options Strategies',
        description: 'Simple strategies for beginners',
        estimatedTime: '5 min',
        completed: false,
      },
    ],
  },
  platform: {
    title: 'F&O in Paper Market Pro',
    description: 'How to practice Futures & Options safely in this educational platform.',
    lessons: [
      {
        id: 'platform-overview',
        title: 'How F&O Works Here',
        description: 'Platform-specific implementation',
        estimatedTime: '3 min',
        completed: false,
      },
      {
        id: 'virtual-margin',
        title: 'Virtual Margin & Premium',
        description: 'How we simulate real trading costs',
        estimatedTime: '4 min',
        completed: false,
      },
      {
        id: 'no-real-delivery',
        title: 'No Real Delivery',
        description: 'Why this is completely risk-free',
        estimatedTime: '2 min',
        completed: false,
      },
      {
        id: 'learning-to-trading',
        title: 'From Learning → Paper Trading',
        description: 'Your journey to confident trading',
        estimatedTime: '3 min',
        completed: false,
      },
    ],
  },
};

const allChapters = Object.keys(chapterData);

const ChapterPage = () => {
  const params = useParams();
  const chapterId = params.chapter as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chapter = chapterData[chapterId as keyof typeof chapterData];
  if (!chapter) {
    return <div>Chapter not found</div>;
  }

  const completedLessons = chapter.lessons.filter(lesson => lesson.completed).length;
  const progress = (completedLessons / chapter.lessons.length) * 100;

  const SidebarContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Chapters</h2>
        <div className="space-y-2">
          {allChapters.map((chapId) => {
            const chap = chapterData[chapId as keyof typeof chapterData];
            const isActive = chapId === chapterId;
            const chapCompleted = chap.lessons.filter(l => l.completed).length;
            const chapProgress = (chapCompleted / chap.lessons.length) * 100;

            return (
              <Link key={chapId} href={`/learn/futures-options/${chapId}`}>
                <div className={`p-3 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
                      Chapter {allChapters.indexOf(chapId) + 1}
                    </span>
                    {chapCompleted > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(chapProgress)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {chap.title}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Lessons</h3>
        <div className="space-y-2">
          {chapter.lessons.map((lesson, index) => (
            <Link key={lesson.id} href={`/learn/futures-options/${chapterId}/${lesson.id}`}>
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                <div className="flex-shrink-0">
                  {lesson.completed ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">
                    {index + 1}. {lesson.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lesson.estimatedTime}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-8">
              <Card>
                <CardContent className="p-6">
                  <SidebarContent />
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Mobile Menu */}
            <div className="lg:hidden mb-6">
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Menu className="h-4 w-4 mr-2" />
                    Menu
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <ScrollArea className="h-full">
                    <SidebarContent />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>

            {/* Chapter Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">Chapter {allChapters.indexOf(chapterId) + 1}</Badge>
                <Badge variant="outline">{chapter.lessons.length} lessons</Badge>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {chapter.title}
              </h1>
              <p className="text-muted-foreground mb-6">
                {chapter.description}
              </p>

              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Chapter Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {completedLessons}/{chapter.lessons.length} completed
                  </span>
                </div>
                <Progress value={progress} className="mb-2" />
                <p className="text-xs text-muted-foreground">
                  {Math.round(progress)}% complete
                </p>
              </div>
            </div>

            {/* Lessons List */}
            <div className="space-y-4">
              {chapter.lessons.map((lesson, index) => (
                <Link key={lesson.id} href={`/learn/futures-options/${chapterId}/${lesson.id}`}>
                  <Card className="group hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                          {lesson.completed ? (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          ) : (
                            <div className="h-6 w-6 rounded-full border-2 border-muted-foreground flex items-center justify-center">
                              <span className="text-xs font-medium text-muted-foreground">
                                {index + 1}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold mb-1 group-hover:text-primary transition-colors">
                            {lesson.title}
                          </h3>
                          <p className="text-muted-foreground mb-3">
                            {lesson.description}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {lesson.estimatedTime}
                            </span>
                            <Badge variant={lesson.completed ? "default" : "secondary"}>
                              {lesson.completed ? "Completed" : "Not Started"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ChapterPage;