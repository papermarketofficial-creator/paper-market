import { AlertTriangle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 px-4 py-4">
      <div className="flex items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Simulated Trading Only.</span>{' '}
          No real money involved. Market data may be delayed. 
          This platform is not a registered investment advisor.
        </p>
      </div>
    </footer>
  );
}
