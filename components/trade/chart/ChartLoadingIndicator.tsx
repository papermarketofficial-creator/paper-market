import styles from "./chart-loader.module.css";

export function ChartLoadingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background/80 backdrop-blur-sm z-[100]">
      <div className={styles.loader}>
        <div className={styles.loader__bar} />
        <div className={styles.loader__bar} />
        <div className={styles.loader__bar} />
        <div className={styles.loader__bar} />
        <div className={styles.loader__bar} />
        <div className={styles.loader__ball} />
      </div>

      <span className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
        Loading Chart...
      </span>
    </div>
  );
}
