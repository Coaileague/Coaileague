/**
 * MutationFlashOverlay - Flash effect during Trinity mode transitions
 * 
 * Based on user's reference implementation: triggerFlash() with mix-blend-mode overlay
 * Creates subtle visual feedback when Trinity morphs between states
 * 
 * Features:
 * - Simple white overlay flash (not gradients)
 * - 0.4 opacity peak (subtle, not overwhelming)
 * - Quick 600ms fade using cubic-bezier easing
 */

import { useState, useEffect, useRef } from 'react';

interface MutationFlashOverlayProps {
  isActive: boolean;
  className?: string;
}

export function MutationFlashOverlay({ 
  isActive, 
  className = ''
}: MutationFlashOverlayProps) {
  const [isFlashing, setIsFlashing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (isActive) {
      setIsFlashing(true);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = window.setTimeout(() => {
        setIsFlashing(false);
      }, 600);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActive]);
  
  if (!isFlashing) return null;
  
  return (
    <>
      <style>{`
        @keyframes mutationFlash {
          0% { opacity: 0; }
          10% { opacity: 0.4; }
          100% { opacity: 0; }
        }
      `}</style>
      
      <div
        className={`absolute inset-0 pointer-events-none ${className}`}
        style={{ zIndex: 10 }}
        data-testid="mutation-flash-overlay"
      >
        <div
          className="absolute inset-0"
          style={{
            background: '#ffffff',
            opacity: 0,
            mixBlendMode: 'overlay',
            animation: 'mutationFlash 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
      </div>
    </>
  );
}

export default MutationFlashOverlay;
