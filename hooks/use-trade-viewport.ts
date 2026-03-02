"use client";

import { useEffect, useMemo, useState } from "react";

type Viewport = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 767;
const TABLET_MAX = 1279;

function getViewport(width: number): Viewport {
  if (width <= MOBILE_MAX) return "mobile";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
}

export function useTradeViewport() {
  // Keep first client render aligned with SSR output to avoid hydration mismatch.
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    const onResize = () => setViewport(getViewport(window.innerWidth));
    const mqlMobile = window.matchMedia("(max-width: 767px)");
    const mqlTablet = window.matchMedia("(min-width: 768px) and (max-width: 1279px)");
    const mqlDesktop = window.matchMedia("(min-width: 1280px)");

    mqlMobile.addEventListener("change", onResize);
    mqlTablet.addEventListener("change", onResize);
    mqlDesktop.addEventListener("change", onResize);
    onResize();

    return () => {
      mqlMobile.removeEventListener("change", onResize);
      mqlTablet.removeEventListener("change", onResize);
      mqlDesktop.removeEventListener("change", onResize);
    };
  }, []);

  return useMemo(
    () => ({
      viewport,
      isMobile: viewport === "mobile",
      isTablet: viewport === "tablet",
      isDesktop: viewport === "desktop",
    }),
    [viewport],
  );
}

export type { Viewport };

