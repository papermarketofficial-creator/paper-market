"use client";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  Target,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

// Content item type definition
type ContentItem = {
  type: 'text' | 'alert' | 'example' | 'key-points' | 'comparison' | 'scenario';
  content?: string;
  variant?: 'info' | 'warning';
  title?: string;
  points?: string[];
  items?: Array<{
    aspect: string;
    futures: string;
    options: string;
  }>;
  icon?: React.ComponentType<{ className?: string }>;
};

// Mock lesson content data
const lessonContent = {
  'what-are-derivatives': {
    title: 'What are Derivatives?',
    chapter: 'introduction',
    estimatedTime: '5 min',
    content: [
      {
        type: 'text',
        content: 'Derivatives are financial contracts whose value is derived from an underlying asset. Think of them as "side bets" on the price movement of stocks, commodities, currencies, or indices.'
      },
      {
        type: 'alert',
        variant: 'info',
        content: 'The underlying asset could be anything: Apple stock, gold, the US Dollar, or even the Nifty 50 index.'
      },
      {
        type: 'text',
        content: 'Unlike buying the actual asset (like buying Apple shares), derivatives allow you to bet on price movements without owning the asset itself.'
      },
      {
        type: 'example',
        title: 'Simple Analogy',
        content: 'Imagine you think Apple stock will go up. Instead of buying the stock, you could buy a derivative contract that gives you the right to buy Apple stock at today\'s price in the future. If Apple goes up, you profit. If it goes down, you lose only your premium.'
      },
      {
        type: 'text',
        content: 'Derivatives exist because they help manage risk and provide leverage. Farmers use them to lock in crop prices, investors use them to hedge portfolios, and traders use them to speculate.'
      },
      {
        type: 'key-points',
        points: [
          'Value comes from an underlying asset',
          'Can be used for hedging or speculation',
          'Provide leverage (control more with less money)',
          'Have expiration dates',
          'Can be complex and risky'
        ]
      }
    ]
  },
  'why-futures-options': {
    title: 'Why Futures & Options Exist',
    chapter: 'introduction',
    estimatedTime: '4 min',
    content: [
      {
        type: 'text',
        content: 'Futures and Options were created to solve real problems in the economy. They help businesses and investors manage risk in uncertain markets.'
      },
      {
        type: 'example',
        title: 'Farmer\'s Problem',
        content: 'A wheat farmer plants crops in January but won\'t harvest until June. What if wheat prices crash by June? The farmer could starve. Futures contracts let farmers lock in today\'s price for future delivery.'
      },
      {
        type: 'example',
        title: 'Investor\'s Problem',
        content: 'You own ₹1 lakh worth of Tata Steel shares. You\'re worried about a market crash. Options let you buy "insurance" against price drops without selling your shares.'
      },
      {
        type: 'text',
        content: 'These instruments also provide leverage. With ₹10,000, you can control ₹1 lakh worth of assets. This amplifies both profits and losses.'
      },
      {
        type: 'alert',
        variant: 'warning',
        content: '⚠️ Leverage is a double-edged sword. It can multiply your profits, but it can also multiply your losses beyond your investment.'
      },
      {
        type: 'key-points',
        points: [
          'Risk management for businesses',
          'Price discovery in markets',
          'Liquidity and trading opportunities',
          'Leverage for smaller investors',
          'Speculation and market efficiency'
        ]
      }
    ]
  },
  'futures-vs-options': {
    title: 'Futures vs Options (Simple Comparison)',
    chapter: 'introduction',
    estimatedTime: '3 min',
    content: [
      {
        type: 'comparison',
        title: 'Key Differences',
        items: [
          {
            aspect: 'Obligation',
            futures: 'Must buy/sell at expiration',
            options: 'Right, not obligation'
          },
          {
            aspect: 'Premium',
            futures: 'No upfront premium',
            options: 'Pay premium to buy'
          },
          {
            aspect: 'Risk',
            futures: 'Unlimited risk',
            options: 'Limited to premium paid'
          },
          {
            aspect: 'Margin',
            futures: 'Margin required',
            options: 'Premium is your max loss'
          }
        ]
      },
      {
        type: 'text',
        content: 'Think of futures as a guaranteed appointment - you must show up. Options are like having a reservation - you can cancel if you change your mind.'
      },
      {
        type: 'example',
        title: 'Futures Example',
        content: 'You agree to buy 100 shares of Reliance at ₹2,500 each in March. If price goes to ₹3,000, you buy at ₹2,500 (profit). If it goes to ₹2,000, you still buy at ₹2,500 (loss).'
      },
      {
        type: 'example',
        title: 'Options Example',
        content: 'You pay ₹200 to buy right to buy 100 Reliance shares at ₹2,500 in March. If price goes to ₹3,000, you exercise and profit. If it stays at ₹2,500, you let it expire (lose ₹200).'
      }
    ]
  },
  'when-traders-use': {
    title: 'When Traders Use F&O',
    chapter: 'introduction',
    estimatedTime: '3 min',
    content: [
      {
        type: 'text',
        content: 'Traders use Futures & Options in different situations based on their market outlook and risk tolerance.'
      },
      {
        type: 'scenario',
        title: 'Strong Bullish View',
        icon: TrendingUp,
        content: 'You\'re very confident stock will go up significantly. Use Futures for maximum leverage or Call Options for limited risk.'
      },
      {
        type: 'scenario',
        title: 'Strong Bearish View',
        icon: TrendingDown,
        content: 'You\'re very confident stock will go down. Use Futures to sell short or Put Options for limited risk.'
      },
      {
        type: 'scenario',
        title: 'Slightly Bullish/Bearish',
        icon: Target,
        content: 'You think stock will move but not sure how much. Options give you exposure with limited risk.'
      },
      {
        type: 'scenario',
        title: 'Hedging Existing Position',
        icon: AlertTriangle,
        content: 'You own stocks and want to protect against downside. Buy Put Options as "insurance".'
      },
      {
        type: 'scenario',
        title: 'Income Generation',
        icon: BookOpen,
        content: 'You own stocks and want extra income. Sell covered Call Options against your holdings.'
      },
      {
        type: 'alert',
        variant: 'info',
        content: '💡 Most retail traders lose money in F&O because they trade without a clear strategy or risk management plan.'
      }
    ]
  }
};

const LessonPage = () => {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.chapter as string;
  const lessonId = params.lesson as string;
  const [progress, setProgress] = useState(0);

  // Simulate reading progress - moved before early return to follow rules of hooks
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (scrollTop / docHeight) * 100;
      setProgress(Math.min(scrollPercent, 100));
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const lesson = lessonContent[lessonId as keyof typeof lessonContent];
  if (!lesson) {
    return <div>Lesson not found</div>;
  }

  const renderContent = (item: ContentItem, index: number) => {
    switch (item.type) {
      case 'text':
        return (
          <p key={index} className="text-muted-foreground leading-relaxed mb-6">
            {item.content}
          </p>
        );
      case 'alert':
        return (
          <Alert key={index} className={`mb-6 ${
            item.variant === 'warning' ? 'border-amber-200 bg-amber-50 dark:bg-amber-950' :
            item.variant === 'info' ? 'border-blue-200 bg-blue-50 dark:bg-blue-950' :
            ''
          }`}>
            <Info className="h-4 w-4" />
            <AlertDescription>{item.content}</AlertDescription>
          </Alert>
        );
      case 'example':
        return (
          <Card key={index} className="mb-6 border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{item.content}</p>
            </CardContent>
          </Card>
        );
      case 'key-points':
        return (
          <Card key={index} className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Key Points</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {item.points.map((point: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      case 'comparison':
        return (
          <Card key={index} className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="font-semibold text-center p-2 bg-muted rounded">Aspect</div>
                <div className="font-semibold text-center p-2 bg-blue-100 dark:bg-blue-900 rounded">Futures</div>
                <div className="font-semibold text-center p-2 bg-green-100 dark:bg-green-900 rounded">Options</div>
                {item.items?.map((comp, i: number) => (
                  <>
                    <div key={`aspect-${i}`} className="p-2 border-b">{comp.aspect}</div>
                    <div key={`futures-${i}`} className="p-2 border-b bg-blue-50 dark:bg-blue-950">{comp.futures}</div>
                    <div key={`options-${i}`} className="p-2 border-b bg-green-50 dark:bg-green-950">{comp.options}</div>
                  </>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      case 'scenario': {
        const IconComponent = item.icon;
        return (
          <Card key={index} className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <IconComponent className="h-5 w-5 text-primary" />
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{item.content}</p>
            </CardContent>
          </Card>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Progress Bar */}
      <div className="sticky top-16 z-40 bg-background border-b">
        <div className="container mx-auto px-4 py-2 max-w-4xl">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/learn/futures-options/${chapterId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Chapter
              </Button>
            </Link>
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              {lesson.estimatedTime}
            </Badge>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            {lesson.title}
          </h1>

          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>Chapter: {chapterId.charAt(0).toUpperCase() + chapterId.slice(1)}</span>
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-gray dark:prose-invert max-w-none">
          {lesson.content.map((item, index) => renderContent(item, index))}
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t">
          <div className="flex justify-between items-center">
            <Link href={`/learn/futures-options/${chapterId}`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Chapter
              </Button>
            </Link>

            <div className="flex gap-3">
              <Button variant="outline">
                Mark as Complete
              </Button>
              <Button>
                Next Lesson
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonPage;