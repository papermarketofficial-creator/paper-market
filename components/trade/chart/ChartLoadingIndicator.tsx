import styles from "./chart-loader.module.css";

export function ChartLoadingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background/80 backdrop-blur-sm z-[100] text-blue-500">
      <div className={styles.loader}></div>
    </div>
  );
}
