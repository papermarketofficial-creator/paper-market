import styles from "./chart-loader.module.css";

export function ChartLoadingIndicator() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background/45 dark:bg-background/30">
      <div className={`${styles.loader} text-foreground dark:text-cyan-200`} aria-label="Loading chart data" />
    </div>
  );
}
