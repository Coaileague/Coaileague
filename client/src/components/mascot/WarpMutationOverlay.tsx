/**
 * WarpMutationOverlay - Subtle CSS-based transition effects for mascot state changes
 * 
 * DRAMATICALLY TONED DOWN from the original "dramatic warp" effects.
 * Now provides subtle, gentle visual feedback during emote transitions.
 * 
 * Features:
 * - Very subtle radial glow (not the large gradient aura)
 * - Slow, smooth animations (4-12 second duration range)
 * - Minimal visual footprint - does NOT obscure the mascot
 * - Respects prefers-reduced-motion
 * - Disabled by default - enable only during actual transitions
 */

import { useEffect, useState, useRef, memo } from 'react';
import type { WarpPhase, WarpColors } from '@/lib/mascot/EmoteTransitionRenderer';

interface WarpMutationOverlayProps {
  phase: WarpPhase;
  intensity: number;
  colors: WarpColors;
  size: number;
  enabled?: boolean;
}

const WarpMutationOverlay = memo(function WarpMutationOverlay({
  phase,
  intensity,
  colors,
  size,
  enabled = false  // DISABLED by default - no large gradient overlay
}: WarpMutationOverlayProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  // Return null in most cases - this overlay should be rarely visible
  if (!enabled || prefersReducedMotion || phase === 'idle') {
    return null;
  }
  
  const isPeak = phase === 'peak';
  
  // VERY SUBTLE scaling - almost imperceptible
  const subtleScale = isPeak ? 1.02 : 1 + intensity * 0.01;
  // Minimal blur - just enough for softness
  const subtleBlur = isPeak ? 3 : intensity * 2;
  // Very low opacity - should NOT create a visible "glow aura"
  const baseOpacity = isPeak ? 0.12 : intensity * 0.08;
  
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
      }}
      data-warp-phase={phase}
      data-warp-intensity={intensity.toFixed(2)}
      data-testid="warp-mutation-overlay"
    >
      {/* Subtle inner glow only - NO large gradient */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: baseOpacity,
          boxShadow: `
            inset 0 0 ${8 * intensity}px ${colors.primary}20,
            inset 0 0 ${4 * intensity}px ${colors.accent}15
          `,
          transform: `scale(${subtleScale})`,
          filter: `blur(${subtleBlur}px)`,
          transition: 'all 4s ease-in-out',  // Slow 4-second transitions
        }}
      />
      
      {/* Very subtle edge highlight during peak only */}
      {isPeak && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            opacity: 0.1,
            boxShadow: `0 0 12px ${colors.primary}30`,
            animation: 'subtle-glow 6s ease-in-out forwards',  // Slow 6-second animation
          }}
        />
      )}
      
      {/* Minimal CSS Keyframes - slow animations */}
      <style>{`
        @keyframes subtle-glow {
          0% { 
            opacity: 0.1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.15;
            transform: scale(1.01);
          }
          100% { 
            opacity: 0;
            transform: scale(1.02);
          }
        }
      `}</style>
    </div>
  );
});

export { WarpMutationOverlay };
export type { WarpMutationOverlayProps };
