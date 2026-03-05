"use client";
import { PerformanceSummary } from '@/components/analytics/PerformanceSummary';
import { EquityCurveChart } from '@/components/analytics/EquityCurveChart';
import { WeeklyReviewPanel } from '@/components/analytics/WeeklyReviewPanel';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">Performance metrics based on your closed journal entries.</p>
      </div>

      <div className="flex flex-col gap-6">
        <PerformanceSummary />
        <EquityCurveChart />
        <WeeklyReviewPanel />
      </div>
    </div>
  );
}