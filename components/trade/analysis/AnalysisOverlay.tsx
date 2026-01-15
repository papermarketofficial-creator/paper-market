"use client";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnalysisStore } from '@/stores/trading/analysis.store';
import { AnalysisToolbar } from './AnalysisToolbar';
import { AnalysisHeader } from './AnalysisHeader';

interface AnalysisOverlayProps {
  children: React.ReactNode;
  symbol: string; // ✅ Symbol Prop
}

export function AnalysisOverlay({ children, symbol }: AnalysisOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const { setAnalysisMode } = useAnalysisStore();

  useEffect(() => {
    setMounted(true);
    // document.body.style.overflow = 'hidden'; // Lock scroll
    return () => {
      // document.body.style.overflow = 'unset';
    }
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-card">
        <AnalysisHeader symbol={symbol} />

        <div className="flex items-center gap-2">
          {/* Close Button */}
          <Button variant="ghost" size="icon" onClick={() => setAnalysisMode(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <AnalysisToolbar />

        {/* Chart Canvas Area */}
        <div className="flex-1 relative bg-background/50">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
