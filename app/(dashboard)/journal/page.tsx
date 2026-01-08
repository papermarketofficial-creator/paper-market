"use client";
import { useJournalStore } from '@/stores/trading/journal.store';
import { JournalTable } from '@/components/journal/JournalTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function JournalPage() {
  const entries = useJournalStore((state) => state.entries);

  // Sort entries by date descending (newest first)
  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade Journal</h1>
        <p className="text-muted-foreground">
          Automated log of all trading activity and risk snapshots.
        </p>
      </div>

      {/* Journal Table View */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Entry Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <JournalTable entries={sortedEntries} />
        </CardContent>
      </Card>
    </div>
  );
}