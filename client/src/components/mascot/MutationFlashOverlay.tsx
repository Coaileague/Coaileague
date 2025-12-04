/**
 * MutationFlashOverlay - Flash effect during Trinity mode transitions
 * 
 * Based on user's reference implementation: triggerFlash() with mix-blend-mode overlay
 * Uses void offsetWidth trick to force browser to restart CSS animation
 * 
 * Features:
 * - Simple white overlay flash (not gradients)
 * - 0.8 opacity peak for visible flash
 * - Quick 500ms fade using forwards animation
 */

import { useRef, useEffect } from 'react';

interface MutationFlashOverlayProps {
  isActive: boolean;
  className?: string;
}

export function MutationFlashOverlay({ 
  isActive, 
  className = ''
}: MutationFlashOverlayProps) {
  const flashRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isActive && flashRef.current) {
      const flash = flashRef.current;
      flash.classList.remove('mutation-active');
      void flash.offsetWidth;
      flash.classList.add('mutation-active');
    }
  }, [isActive]);
  
  return (
    <>
      <style>{`
        @keyframes flash {
          0% { opacity: 0; }
          10% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        .mutation-active {
          animation: flash 0.5s forwards;
        }
      `}</style>
      
      <div
        ref={flashRef}
        className={`absolute inset-0 pointer-events-none ${className}`}
        style={{ 
          zIndex: 10,
          background: '#ffffff',
          opacity: 0,
          mixBlendMode: 'overlay',
        }}
        data-testid="mutation-flash-overlay"
      />
    </>
  );
}

export default MutationFlashOverlay;
