import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Force Flow - Linear progress bar with gradient fill
 */
export function ForceFlowBar({ 
  progress = 0,
  height = "h-8",
  showPercent = true,
  className 
}: { 
  progress?: number;
  height?: string;
  showPercent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div 
        className={cn(
          "relative rounded-full overflow-hidden bg-gradient-to-r from-background/50 to-muted/30",
          height
        )}
        style={{
          boxShadow: 'inset 0 0 8px rgba(0, 0, 0, 0.8)',
          padding: '2px'
        }}
        data-testid="force-flow-bar"
      >
        <div 
          className="h-full rounded-full relative transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #9B5DE5, #00DFFF)',
            boxShadow: '0 0 10px rgba(0, 223, 255, 0.7)'
          }}
        >
          {/* Segmentation effect */}
          <div 
            className="absolute inset-0 opacity-50"
            style={{
              background: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255, 255, 255, 0.1) 10px, rgba(255, 255, 255, 0.1) 11px)'
            }}
          />
        </div>
      </div>
      {showPercent && (
        <div className="text-right text-2xl font-bold" style={{ color: '#00DFFF' }}>
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

/**
 * AF Core Scan - Radial progress with animated A/F
 */
export function AFCoreScan({ 
  progress = 0,
  size = "md",
  className 
}: { 
  progress?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const showF = progress >= 100;
  
  const sizes: Record<string, { container: string; svg: string; text: string }> = {
    sm: { container: "w-24 h-24", svg: "w-16 h-16", text: "text-2xl" },
    md: { container: "w-36 h-36", svg: "w-24 h-24", text: "text-4xl" },
    lg: { container: "w-48 h-48", svg: "w-32 h-32", text: "text-5xl" }
  };
  
  // Fallback to md if size is invalid
  const sizeConfig = sizes[size] || sizes.md;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div 
      className={cn("relative", sizeConfig.container, className)}
      data-testid="af-core-scan"
    >
      {/* Outer ring */}
      <div 
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-purple-500/80 border-r-purple-500/80 animate-spin-slow"
        style={{ filter: 'drop-shadow(0 0 5px rgba(155, 93, 229, 0.5))' }}
      />

      {/* Progress circle */}
      <svg 
        className="w-full h-full -rotate-90"
        style={{ filter: 'drop-shadow(0 0 2px #00DFFF)' }}
      >
        {/* Track */}
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="rgba(155, 93, 229, 0.15)"
          strokeWidth="6"
          fill="none"
        />
        {/* Progress */}
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="#00DFFF"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-100"
          style={{ 
            filter: 'drop-shadow(0 0 8px #00DFFF) drop-shadow(0 0 15px rgba(0, 223, 255, 0.6))'
          }}
        />
      </svg>

      {/* Center A/F */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* A */}
        <svg 
          className={cn(
            sizeConfig.svg,
            progress < 100 && "animate-af-spin"
          )}
          viewBox="0 0 100 100"
          style={{ 
            transformOrigin: 'center',
            filter: 'drop-shadow(0 0 5px rgb(245, 122, 67)) drop-shadow(0 0 10px rgba(245, 122, 67, 0.8))'
          }}
        >
          <path 
            d="M 50 10 L 10 90 L 30 90 L 38 70 L 62 70 L 70 90 L 90 90 L 50 10 Z M 43 55 L 50 35 L 57 55 Z" 
            fill="#F57A43"
          />
        </svg>

        {/* F */}
        {showF && (
          <span
            className={cn(
              "absolute font-bold transition-all duration-500 translate-x-8",
              sizeConfig.text,
              "opacity-100 scale-100"
            )}
            style={{
              color: '#00DFFF',
              textShadow: '0 0 5px #00DFFF, 0 0 15px rgba(0, 223, 255, 0.8)',
              fontFamily: 'Teko, sans-serif'
            }}
          >
            F
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Data Stream - Liquid wave fill indicator
 */
export function DataStreamIndicator({ 
  progress = 0,
  height = "h-20",
  className 
}: { 
  progress?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-xl border-4",
        height,
        className
      )}
      style={{
        backgroundColor: 'rgba(14, 20, 35, 0.8)',
        borderColor: '#9B5DE5',
        boxShadow: '0 0 15px rgba(155, 93, 229, 0.6)'
      }}
      data-testid="data-stream-indicator"
    >
      {/* Liquid fill */}
      <div 
        className="absolute bottom-0 left-0 right-0 transition-all duration-300"
        style={{
          height: `${progress}%`,
          background: 'linear-gradient(to top, #00DFFF 0%, #9B5DE5 100%)',
          boxShadow: '0 0 10px #00DFFF',
          zIndex: 10
        }}
      >
        {/* Wave animation */}
        <div 
          className="absolute w-full h-5 -top-5 animate-liquid-wave opacity-100"
          style={{
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%2300DFFF' d='M0,15 C25,5 75,25 100,15 L100,20 L0,20 Z' /%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: '100px 20px',
            filter: 'drop-shadow(0 0 8px #00DFFF)'
          }}
        />
      </div>

      {/* Text overlay */}
      <div 
        className="absolute inset-0 flex items-center justify-center text-3xl font-bold tracking-wider"
        style={{ 
          color: progress > 50 ? '#03030A' : '#E2E8F0',
          textShadow: '0 0 15px rgba(0, 0, 0, 0.8)',
          zIndex: 20
        }}
      >
        {Math.round(progress)}% LOADED
      </div>
    </div>
  );
}

/**
 * Hex Grid Loader - Sequential pulse animation
 */
export function HexGridLoader({ 
  active = false,
  className 
}: { 
  active?: boolean;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hexCount = 30; // 6 columns x 5 rows

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % hexCount);
    }, 80);

    return () => clearInterval(interval);
  }, [active, hexCount]);

  return (
    <div 
      className={cn("perspective-1000", className)}
      style={{ transform: 'perspective(1000px) rotateX(30deg)' }}
      data-testid="hex-grid-loader"
    >
      <div 
        className="grid gap-y-0 gap-x-1 mx-auto"
        style={{ 
          gridTemplateColumns: 'repeat(6, 40px)',
          gridTemplateRows: 'repeat(5, 30px)'
        }}
      >
        {Array.from({ length: hexCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-10 h-10 transition-all duration-75",
              i % 2 === 1 && "ml-5",
              i >= 6 && "-mt-4"
            )}
            style={{
              backgroundColor: active && i === activeIndex 
                ? '#F57A43'
                : i === (activeIndex - 1 + hexCount) % hexCount
                ? 'rgba(155, 93, 229, 0.4)'
                : 'rgba(255, 255, 255, 0.05)',
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
              transform: active && i === activeIndex 
                ? 'scale(1.1) rotateZ(5deg)' 
                : 'scale(0.95)',
              boxShadow: active && i === activeIndex
                ? '0 0 8px #F57A43, 0 0 20px rgba(245, 122, 67, 0.8)'
                : i === (activeIndex - 1 + hexCount) % hexCount
                ? '0 0 5px rgba(155, 93, 229, 0.5)'
                : 'none'
            }}
          />
        ))}
      </div>
    </div>
  );
}
