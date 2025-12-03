/**
 * MutationFlashOverlay - Flash effect during Trinity mode transitions
 * 
 * Based on reference implementation: triggerFlash() with mix-blend-mode overlay
 * Creates dramatic visual feedback when Trinity morphs between states
 */

import { useState, useEffect, useRef } from 'react';

interface WarpColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface MutationFlashOverlayProps {
  isActive: boolean;
  colors: WarpColors;
  className?: string;
}

export function MutationFlashOverlay({ 
  isActive, 
  colors,
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
          10% { opacity: 0.5; }
          30% { opacity: 0.3; }
          100% { opacity: 0; }
        }
        
        @keyframes colorWave {
          0% { 
            background: radial-gradient(circle at center, ${colors.primary}80 0%, transparent 70%);
          }
          33% { 
            background: radial-gradient(circle at center, ${colors.secondary}80 0%, transparent 70%);
          }
          66% { 
            background: radial-gradient(circle at center, ${colors.accent}80 0%, transparent 70%);
          }
          100% { 
            background: radial-gradient(circle at center, ${colors.primary}80 0%, transparent 70%);
          }
        }
        
        @keyframes flashExpand {
          0% { transform: scale(0.8); filter: blur(0px); }
          50% { transform: scale(1.2); filter: blur(2px); }
          100% { transform: scale(1.5); filter: blur(8px); }
        }
      `}</style>
      
      <div
        className={`absolute inset-0 pointer-events-none rounded-full overflow-hidden ${className}`}
        style={{ zIndex: 15 }}
        data-testid="mutation-flash-overlay"
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: '#ffffff',
            opacity: 0,
            mixBlendMode: 'overlay',
            animation: 'mutationFlash 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
        
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${colors.primary}60 0%, ${colors.secondary}40 30%, transparent 60%)`,
            opacity: 0.7,
            mixBlendMode: 'screen',
            animation: 'mutationFlash 0.5s ease-out forwards, flashExpand 0.6s ease-out forwards',
          }}
        />
        
        <div
          className="absolute inset-0 rounded-full"
          style={{
            opacity: 0.5,
            mixBlendMode: 'color-dodge',
            animation: 'colorWave 0.6s ease-in-out forwards',
          }}
        />
      </div>
    </>
  );
}

export default MutationFlashOverlay;
