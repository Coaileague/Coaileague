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
            background: 'linear-gradient(90deg, #059669, hsl(158, 34%, 32%), #6ee7b7)',
            boxShadow: 'none'
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
        <div className="text-right text-2xl font-bold" style={{ color: 'hsl(158, 34%, 32%)' }}>
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
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-emerald-500/80 border-r-emerald-500/80 animate-spin-slow"
        style={{ filter: 'none' }}
      />

      {/* Progress circle */}
      <svg 
        className="w-full h-full -rotate-90"
        style={{ filter: 'none' }}
      >
        {/* Track */}
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="rgba(47, 111, 94, 0.15)"
          strokeWidth="6"
          fill="none"
        />
        {/* Progress */}
        <circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="hsl(158, 34%, 32%)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-100"
          style={{ 
            filter: 'none'
          }}
        />
      </svg>

      {/* Center lightning bolt icon (simpler than A/F) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg 
          className={cn(
            sizeConfig.svg,
            progress < 100 && "animate-pulse"
          )}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ 
            filter: 'none'
          }}
        >
          <path 
            d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" 
            fill="hsl(158, 34%, 32%)"
            stroke="hsl(158, 34%, 32%)"
            strokeWidth="1"
          />
        </svg>

        {/* Checkmark when complete */}
        {showF && (
          <svg
            className={cn(
              "absolute transition-all duration-500",
              sizeConfig.svg,
              "opacity-100 scale-100"
            )}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              filter: 'none'
            }}
          >
            <path 
              d="M20 6L9 17l-5-5" 
              stroke="hsl(158, 34%, 32%)" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
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
        borderColor: 'hsl(158, 34%, 32%)',
        boxShadow: 'none'
      }}
      data-testid="data-stream-indicator"
    >
      {/* Liquid fill */}
      <div 
        className="absolute bottom-0 left-0 right-0 transition-all duration-300"
        style={{
          height: `${progress}%`,
          background: 'linear-gradient(to top, hsl(158, 34%, 32%) 0%, #6ee7b7 100%)',
          boxShadow: '0 0 10px hsl(158, 34%, 32%)',
          zIndex: 10
        }}
      >
        {/* Wave animation */}
        <div 
          className="absolute w-full h-5 -top-5 animate-liquid-wave opacity-100"
          style={{
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%2310b981' d='M0,15 C25,5 75,25 100,15 L100,20 L0,20 Z' /%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: '100px 20px',
            filter: 'none'
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
                ? 'hsl(158, 34%, 32%)'
                : i === (activeIndex - 1 + hexCount) % hexCount
                ? 'rgba(47, 111, 94, 0.4)'
                : 'rgba(255, 255, 255, 0.05)',
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
              transform: active && i === activeIndex 
                ? 'scale(1.1) rotateZ(5deg)' 
                : 'scale(0.95)',
              boxShadow: active && i === activeIndex
                ? '0 0 8px hsl(158, 34%, 32%), 0 0 20px rgba(47, 111, 94, 0.8)'
                : i === (activeIndex - 1 + hexCount) % hexCount
                ? '0 0 5px rgba(47, 111, 94, 0.5)'
                : 'none'
            }}
          />
        ))}
      </div>
    </div>
  );
}
