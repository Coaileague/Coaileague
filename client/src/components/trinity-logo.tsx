import { cn } from "@/lib/utils";
import { useId } from "react";

interface TrinityLogoProps {
  size?: number | string;
  className?: string;
}

/**
 * Trinity Convergence Logo - CoAIleague Brand Mark
 * Three elongated arrow/chevron shapes converging to a central point:
 * - Blue arrow (#3B82F6) - Top, pointing down toward center
 * - Gold arrow (#F59E0B) - Bottom-left, pointing up-right toward center
 * - Purple arrow (#8B5CF6) - Bottom-right, pointing up-left toward center
 *
 * Central nexus represents unified workforce management
 */
export function TrinityLogo({
  size = 40,
  className = ''
}: TrinityLogoProps) {
  const reactId = useId();

  const ids = {
    blueGrad: `trinityLogo-blueGrad${reactId}`,
    purpleGrad: `trinityLogo-purpleGrad${reactId}`,
    goldGrad: `trinityLogo-goldGrad${reactId}`,
    coreGrad: `trinityLogo-coreGrad${reactId}`,
    glowFilter: `trinityLogo-glow${reactId}`,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      data-testid="trinity-logo"
    >
      <defs>
        {/* Blue gradient - Intelligence */}
        <linearGradient id={ids.blueGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        
        {/* Purple gradient - Collaboration */}
        <linearGradient id={ids.purpleGrad} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        
        {/* Gold gradient - Innovation */}
        <linearGradient id={ids.goldGrad} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        
        {/* Central core gradient */}
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0.9" />
        </radialGradient>
        
        {/* Subtle glow filter */}
        <filter id={ids.glowFilter} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Three Elongated Arrow/Chevron Shapes Converging to Center */}
      
      {/* Arrow 1 - Blue (Top) - elongated pentagon pointing down to center */}
      <path
        d="M 50 5 
           L 59 15 
           L 56 15 
           L 56 42 
           L 50 50 
           L 44 42 
           L 44 15 
           L 41 15 
           Z"
        fill={`url(#${ids.blueGrad})`}
        filter={`url(#${ids.glowFilter})`}
      />

      {/* Arrow 2 - Gold (Bottom Left) - elongated pentagon pointing up-right to center */}
      <path
        d="M 50 5 
           L 59 15 
           L 56 15 
           L 56 42 
           L 50 50 
           L 44 42 
           L 44 15 
           L 41 15 
           Z"
        fill={`url(#${ids.goldGrad})`}
        filter={`url(#${ids.glowFilter})`}
        transform="rotate(120, 50, 50)"
      />

      {/* Arrow 3 - Purple (Bottom Right) - elongated pentagon pointing up-left to center */}
      <path
        d="M 50 5 
           L 59 15 
           L 56 15 
           L 56 42 
           L 50 50 
           L 44 42 
           L 44 15 
           L 41 15 
           Z"
        fill={`url(#${ids.purpleGrad})`}
        filter={`url(#${ids.glowFilter})`}
        transform="rotate(240, 50, 50)"
      />

      {/* Central convergence point - glowing core */}
      <circle 
        cx="50" 
        cy="50" 
        r="10" 
        fill={`url(#${ids.coreGrad})`} 
        filter={`url(#${ids.glowFilter})`}
      />
      <circle 
        cx="50" 
        cy="50" 
        r="5" 
        fill="#ffffff" 
        opacity="0.95"
      />
    </svg>
  );
}

export default TrinityLogo;
