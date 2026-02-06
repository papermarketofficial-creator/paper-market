"use client";

import { useEffect } from "react";
import { getMarketStream } from "@/lib/sse";

export default function MarketStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // ═══════════════════════════════════════════════════════════
    // 📡 TOPOLOGY ROOT: The only place that controls connection
    // ═══════════════════════════════════════════════════════════
    // This runs ONCE when the app mounts.
    // It creates the singleton connection.
    const stream = getMarketStream();

    // 🧹 Cleanup: detach listeners on unmount (e.g. strict mode re-mount)
    // But we DO NOT close the connection necessarily if we want persistence.
    // However, if the entire ROOT unmounts, the tab is closing anyway.
    return () => {
      // Optional: if we want to aggressively clean up
      // stream.close(); 
      // But getMarketStream singleton protects us.
    };
  }, []);

  return <>{children}</>;
}
