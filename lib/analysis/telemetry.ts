export type AnalysisTelemetryLevel = "info" | "warn" | "error";

export type AnalysisTelemetryEvent = {
  name: string;
  level?: AnalysisTelemetryLevel;
  payload?: Record<string, unknown>;
};

export function trackAnalysisEvent(event: AnalysisTelemetryEvent) {
  const level = event.level || "info";
  const logger =
    level === "error" ? console.error : level === "warn" ? console.warn : console.info;

  logger(`[analysis:${event.name}]`, event.payload || {});

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("analysis:telemetry", {
        detail: {
          name: event.name,
          level,
          payload: event.payload || {},
          ts: Date.now(),
        },
      })
    );
  }
}
