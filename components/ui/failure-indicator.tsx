"use client";

import { motion, useReducedMotion } from "framer-motion";

type FailureIndicatorProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export default function FailureIndicator({
  size = 84,
  color = "#ef4444",
  strokeWidth = 6,
}: FailureIndicatorProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = {
    duration: shouldReduceMotion ? 0.1 : 0.45,
    ease: "easeOut" as const,
  };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Order failed"
    >
      <motion.svg
        viewBox="0 0 100 100"
        fill="none"
        className="h-full w-full overflow-visible"
        initial={false}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      >
        <circle
          cx={50}
          cy={50}
          r={42}
          stroke={color}
          strokeWidth={strokeWidth}
          className="opacity-12"
        />
        <motion.circle
          cx={50}
          cy={50}
          r={42}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0, rotate: -90 }}
          animate={{ pathLength: 1, rotate: -90 }}
          transition={transition}
          style={{ originX: "50%", originY: "50%" }}
        />
        <motion.path
          d="M36 36L64 64"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.08 }}
        />
        <motion.path
          d="M64 36L36 64"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.14 }}
        />
      </motion.svg>
    </div>
  );
}

