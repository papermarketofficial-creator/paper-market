// Mock data for learn content

export interface Chapter {
  id: string;
  title: string;
  description: string;
  lessons: number;
  completedLessons: number;
  estimatedTime: string;
  icon: any; // Lucide icon
  locked: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  completed: boolean;
}

export interface ChapterData {
  title: string;
  description: string;
  lessons: Lesson[];
}

export const chapters: Chapter[] = [
  {
    id: 'introduction',
    title: 'Introduction to F&O',
    description: 'Learn the basics of derivatives and why Futures & Options exist in financial markets.',
    lessons: 4,
    completedLessons: 4,
    estimatedTime: '15 min',
    icon: null, // Will import Layers
    locked: false
  },
  {
    id: 'futures',
    title: 'Futures Trading Explained',
    description: 'Understand futures contracts, margins, leverage, and how P&L is calculated.',
    lessons: 5,
    completedLessons: 2,
    estimatedTime: '20 min',
    icon: null,
    locked: false
  },
  {
    id: 'options',
    title: 'Options Trading Explained',
    description: 'Master call and put options, strike prices, premiums, and the Greeks.',
    lessons: 6,
    completedLessons: 0,
    estimatedTime: '25 min',
    icon: null,
    locked: false
  },
  {
    id: 'platform',
    title: 'F&O in Paper Market Pro',
    description: 'How to practice Futures & Options safely in this educational platform.',
    lessons: 3,
    completedLessons: 0,
    estimatedTime: '10 min',
    icon: null,
    locked: true
  },
];

// Mock chapter data - in a real app, this would be fetched from an API
export const chapterData: Record<string, ChapterData> = {
  introduction: {
    title: 'Introduction to F&O',
    description: 'Learn the basics of derivatives and why Futures & Options exist in financial markets.',
    lessons: [
      {
        id: 'what-are-derivatives',
        title: 'What are Derivatives?',
        description: 'Understanding derivative instruments and their role in finance',
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
  // Add other chapters...
};