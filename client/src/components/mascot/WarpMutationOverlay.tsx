/**
 * WarpMutationOverlay - CSS-based warp mutation effects for mascot transitions
 * 
 * Uses CSS overlay techniques with blend modes, blur, and keyframed animations
 * to create visual warp/mutation effects during emote transitions.
 * 
 * Features:
 * - Radial + conic gradient mesh overlay
 * - Phase-based keyframe animations (enter, peak, exit)
 * - Scanline shimmer effects
 * - Chromatic aberration simulation
 * - Respects prefers-reduced-motion
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
  enabled = true
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
  
  if (!enabled || prefersReducedMotion || phase === 'idle') {
    return null;
  }
  
  const isActive = true;
  const isPeak = phase === 'peak';
  
  const warpScale = isPeak ? 1.08 : (phase === 'enter' ? 0.95 + intensity * 0.05 : 1.0 - intensity * 0.03);
  const warpSkew = isPeak ? 3 : intensity * 2;
  const blurAmount = isPeak ? 12 : intensity * 8;
  
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
      data-warp-primary={colors.primary}
      data-warp-secondary={colors.secondary}
      data-warp-accent={colors.accent}
      data-testid="warp-mutation-overlay"
    >
      {/* Primary warp gradient layer */}
      <div
        className="absolute inset-0 rounded-full transition-opacity duration-150"
        style={{
          opacity: intensity * 0.35,
          background: `
            radial-gradient(ellipse at 30% 30%, ${colors.primary}40 0%, transparent 50%),
            radial-gradient(ellipse at 70% 70%, ${colors.secondary}40 0%, transparent 50%),
            conic-gradient(from ${intensity * 360}deg at 50% 50%, 
              ${colors.primary}20 0deg, 
              ${colors.accent}30 120deg, 
              ${colors.secondary}20 240deg, 
              ${colors.primary}20 360deg
            )
          `,
          filter: `blur(${blurAmount}px) saturate(1.3) contrast(1.1)`,
          mixBlendMode: 'screen',
          transform: `scale(${warpScale}) skew(${warpSkew}deg, ${warpSkew * 0.5}deg)`,
          transition: 'transform 100ms ease-out, opacity 100ms ease-out',
        }}
      />
      
      {/* Energy pulse ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: isPeak ? 0.5 : intensity * 0.3,
          background: `
            radial-gradient(circle at center, 
              transparent 30%, 
              ${colors.primary}30 45%, 
              ${colors.accent}20 55%, 
              transparent 70%
            )
          `,
          transform: `scale(${1 + intensity * 0.2})`,
          animation: isActive ? 'warp-pulse 400ms ease-in-out infinite' : 'none',
        }}
      />
      
      {/* Chromatic aberration simulation */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: isPeak ? 0.25 : intensity * 0.15,
          background: `
            radial-gradient(ellipse at 45% 45%, ${colors.primary}50 0%, transparent 40%),
            radial-gradient(ellipse at 55% 55%, ${colors.secondary}50 0%, transparent 40%)
          `,
          mixBlendMode: 'color-dodge',
          transform: `translate(${isPeak ? 3 : intensity * 2}px, ${isPeak ? -2 : -intensity}px)`,
          filter: 'blur(4px)',
        }}
      />
      
      {/* Scanline shimmer effect */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          opacity: isPeak ? 0.15 : intensity * 0.08,
          background: `
            repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 2px,
              ${colors.accent}15 2px,
              ${colors.accent}15 4px
            )
          `,
          animation: isActive ? 'scanline-sweep 300ms linear infinite' : 'none',
          mixBlendMode: 'overlay',
        }}
      />
      
      {/* Edge refraction glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: intensity * 0.4,
          boxShadow: `
            inset 0 0 ${20 * intensity}px ${colors.primary}40,
            inset 0 0 ${40 * intensity}px ${colors.accent}20,
            0 0 ${30 * intensity}px ${colors.primary}30,
            0 0 ${60 * intensity}px ${colors.secondary}15
          `,
          backdropFilter: isPeak ? 'contrast(1.15) saturate(1.2)' : `contrast(${1 + intensity * 0.1}) saturate(${1 + intensity * 0.15})`,
        }}
      />
      
      {/* Peak burst effect */}
      {isPeak && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at center,
                ${colors.primary}60 0%,
                ${colors.accent}40 20%,
                transparent 50%
              )
            `,
            animation: 'warp-burst 200ms ease-out forwards',
            mixBlendMode: 'screen',
          }}
        />
      )}
      
      {/* CSS Keyframes injection */}
      <style>{`
        @keyframes warp-pulse {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.3;
          }
          50% { 
            transform: scale(1.15); 
            opacity: 0.5;
          }
        }
        
        @keyframes scanline-sweep {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes warp-burst {
          0% { 
            transform: scale(0.8); 
            opacity: 0.8;
          }
          50% { 
            transform: scale(1.3); 
            opacity: 0.4;
          }
          100% { 
            transform: scale(1.5); 
            opacity: 0;
          }
        }
        
        @keyframes chromatic-shift {
          0%, 100% { 
            transform: translate(2px, -1px);
          }
          50% { 
            transform: translate(-2px, 1px);
          }
        }
        
        @keyframes distortion-wave {
          0% {
            transform: skewX(0deg) skewY(0deg) scale(1);
          }
          25% {
            transform: skewX(2deg) skewY(-1deg) scale(1.02);
          }
          50% {
            transform: skewX(-2deg) skewY(1deg) scale(0.98);
          }
          75% {
            transform: skewX(1deg) skewY(-0.5deg) scale(1.01);
          }
          100% {
            transform: skewX(0deg) skewY(0deg) scale(1);
          }
        }
      `}</style>
    </div>
  );
});

export { WarpMutationOverlay };
export type { WarpMutationOverlayProps };
