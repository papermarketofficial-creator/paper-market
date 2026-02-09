import { Skeleton } from "@/components/ui/skeleton";

export function WatchlistSkeleton() {
  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header Skeleton */}
      <div className="px-3 h-9 border-b border-border bg-accent/30 flex items-center">
        <Skeleton className="h-4 w-24 bg-muted-foreground/20" />
      </div>
      
      {/* List Items Skeleton */}
      <div className="flex-1 p-2 space-y-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-16 bg-muted-foreground/20" />
              <Skeleton className="h-3 w-24 bg-muted-foreground/10" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-4 w-20 bg-muted-foreground/20" />
              <Skeleton className="h-3 w-16 bg-muted-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
