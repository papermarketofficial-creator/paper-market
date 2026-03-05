"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AnalysisOverlayProps {
  children: React.ReactNode;
}

export function AnalysisOverlay({ children }: AnalysisOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background animate-in fade-in duration-200">
      {children}
    </div>,
    document.body
  );
}
