/**
 * MutationFlashOverlay - Dramatic flash effect during Trinity mode transitions
 * 
 * Based on user's reference implementation: triggerFlash() with mix-blend-mode overlay
 * Uses void offsetWidth trick to force browser to restart CSS animation
 * 
 * Features:
 * - Bright radial gradient flash from center
 * - Full opacity peak for maximum visibility
 * - 600ms dramatic fade with scale pulse
 * - Shockwave ring effect
 */

import { useRef, useEffect } from 'react';

interface MutationFlashOverlayProps {
  isActive: boolean;
  triggerCount?: number;
  className?: string;
}

export function MutationFlashOverlay({ 
  isActive, 
  triggerCount = 0,
  className = ''
}: MutationFlashOverlayProps) {
  const flashRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef(0);
  
  useEffect(() => {
    // Trigger on either isActive becoming true OR triggerCount changing
    const shouldTrigger = isActive || triggerCount > lastTriggerRef.current;
    
    if (shouldTrigger && triggerCount > 0) {
      lastTriggerRef.current = triggerCount;
      
      if (flashRef.current) {
        const flash = flashRef.current;
        flash.classList.remove('mutation-flash-active');
        void flash.offsetWidth;
        flash.classList.add('mutation-flash-active');
      }
      
      if (ringRef.current) {
        const ring = ringRef.current;
        ring.classList.remove('mutation-ring-active');
        void ring.offsetWidth;
        ring.classList.add('mutation-ring-active');
      }
    }
  }, [isActive, triggerCount]);
  
  return (
    <>
      <style>{`
        @keyframes mutationFlash {
          0% { 
            opacity: 0; 
            transform: scale(0.8);
          }
          15% { 
            opacity: 1; 
            transform: scale(1.1);
          }
          30% { 
            opacity: 0.9; 
            transform: scale(1.0);
          }
          100% { 
            opacity: 0; 
            transform: scale(1.2);
          }
        }
        
        @keyframes mutationRing {
          0% { 
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(0.3);
            border-width: 8px;
          }
          50% {
            opacity: 0.6;
            border-width: 4px;
          }
          100% { 
            opacity: 0;
            transform: translate(-50%, -50%) scale(2.5);
            border-width: 1px;
          }
        }
        
        .mutation-flash-active {
          animation: mutationFlash 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        
        .mutation-ring-active {
          animation: mutationRing 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
      `}</style>
      
      {/* Main flash overlay */}
      <div
        ref={flashRef}
        className={`absolute inset-0 pointer-events-none ${className}`}
        style={{ 
          zIndex: 100,
          background: 'radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(168,85,247,0.6) 40%, rgba(56,189,248,0.3) 70%, transparent 100%)',
          opacity: 0,
          mixBlendMode: 'screen',
        }}
        data-testid="mutation-flash-overlay"
      />
      
      {/* Shockwave ring */}
      <div
        ref={ringRef}
        className={`absolute pointer-events-none ${className}`}
        style={{ 
          zIndex: 99,
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '4px solid rgba(168,85,247,0.8)',
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.3)',
        }}
        data-testid="mutation-ring-overlay"
      />
    </>
  );
}

export default MutationFlashOverlay;
