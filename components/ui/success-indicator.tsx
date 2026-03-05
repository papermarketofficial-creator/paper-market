"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type SuccessIndicatorProps = {
  isComplete: boolean;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const SuccessIndicator: React.FC<SuccessIndicatorProps> = ({
  isComplete,
  size = 80,
  color = "#10b981",
  strokeWidth = 6,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const center = 50;
  const radius = 42;
  const transition = {
    duration: shouldReduceMotion ? 0.1 : 0.6,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="status"
      aria-live="polite"
    >
      <motion.svg
        viewBox="0 0 100 100"
        fill="none"
        className="h-full w-full overflow-visible"
        initial={false}
        animate={isComplete ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{
          duration: shouldReduceMotion ? 0.1 : 0.35,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          className="opacity-10"
        />

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.circle
              key="loading-spinner"
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              initial={{ pathLength: 0.2, rotate: 0 }}
              animate={{ pathLength: 0.4, rotate: 360 }}
              exit={{
                pathLength: 1,
                transition: { duration: shouldReduceMotion ? 0.1 : 0.3 },
              }}
              transition={{
                rotate: {
                  repeat: Infinity,
                  duration: shouldReduceMotion ? 0.1 : 0.8,
                  ease: "linear",
                },
                pathLength: { duration: shouldReduceMotion ? 0.1 : 0.4 },
              }}
              style={{ originX: "50%", originY: "50%" }}
            />
          ) : (
            <motion.g key="success-mark">
              <motion.circle
                cx={center}
                cy={center}
                r={radius}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                initial={{ pathLength: 0, rotate: -90 }}
                animate={{ pathLength: 1, rotate: -90 }}
                transition={transition}
                style={{ originX: "50%", originY: "50%" }}
              />
              <motion.path
                d="M32 52L44 64L68 38"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.15 }}
              />
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>
    </div>
  );
};

export default SuccessIndicator;
