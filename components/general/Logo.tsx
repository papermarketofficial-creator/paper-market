import React from "react";

interface LogoProps {
  className?: string;
  hideText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", hideText = false }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* The Icon SVG */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        className="w-10 h-10 flex-shrink-0"
        fill="none"
      >
        <rect width="256" height="256" fill="none" />
        
        {/* The vertical stem of the P - Uses Primary Blue */}
        <path
          d="M64,32V224a16,16,0,0,0,32,0V176"
          className="stroke-primary"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* The Curve and Upward Arrow - Gradients from Primary to Secondary */}
        <path
          d="M96,176h48c44.18,0,80-35.82,80-80s-35.82-80-80-80H96"
          className="stroke-primary"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The Accent Arrow (The "Growth" part) */}
        <path
          d="M144,136 l32-32 l24,24 l40-40"
          className="stroke-secondary" 
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
         <polyline
          points="216 88 240 88 240 112"
          className="stroke-secondary"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* The Text - Hidden on small screens if specified */}
      {!hideText && (
        <div className="font-sans tracking-tight leading-none">
          <span className="block text-[18px] font-bold text-slate-900 dark:text-white transition-colors">
            Paper Market
          </span>
          <span className="block text-[18px] font-bold text-primary">
            Pro
          </span>
        </div>
      )}
    </div>
  );
};

export default Logo;