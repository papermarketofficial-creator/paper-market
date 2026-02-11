interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({
  size = 28,
  className = "",
}: SpinnerProps) {
  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 
                     w-[3px] h-[9px] rounded-full
                     bg-muted-foreground
                     animate-spinnerFade"
          style={{
            transform: `rotate(${i * 30}deg) translate(-50%, -140%)`,
            transformOrigin: "center 12px",
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
