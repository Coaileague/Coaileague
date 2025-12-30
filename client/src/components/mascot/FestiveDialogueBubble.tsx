/**
 * FestiveDialogueBubble - Holiday-themed mascot dialogue with crisp canvas effects
 * 
 * Features:
 * - White background with black text (high contrast, readable)
 * - Festive holiday frame with decorative elements
 * - Typewriter text entry (chronological letter/word appearance)
 * - Creative disappear effects (shatter, scatter, dissolve, sparkle, snowfall, confetti)
 * - Canvas-based crisp animations (no blur/glow)
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { triggerHaptic } from '@/hooks/use-touch-swipe';
import type { Thought } from '@/lib/mascot/ThoughtManager';

interface FestiveDialogueBubbleProps {
  thought: Thought | null;
  mascotPosition: { x: number; y: number };
  mascotSize: number;
  isMobile?: boolean;
  onDismiss?: () => void;
}

interface LetterData {
  char: string;
  x: number;
  y: number;
  visible: boolean;
  exiting: boolean;
  exitEffect: ExitEffect;
  exitProgress: number;
  exitVelocity: { x: number; y: number; rotation: number };
}

type ExitEffect = 'shatter' | 'scatter' | 'dissolve' | 'sparkle' | 'snowfall' | 'confetti';
type AnimPhase = 'entering' | 'displaying' | 'exiting' | 'done';

const EXIT_EFFECTS: ExitEffect[] = ['shatter', 'scatter', 'dissolve', 'sparkle', 'snowfall', 'confetti'];

const HOLIDAY_COLORS = {
  primary: '#c41e3a',
  secondary: '#165b33',
  gold: '#ffd700',
  white: '#ffffff',
};

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const calculatePosition = (
  mascotPos: { x: number; y: number },
  mascotSize: number,
  isMobile: boolean,
  bubbleWidth: number,
  bubbleHeight: number
): { top: number; left: number } => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  const mascotCenterX = viewportWidth - mascotPos.x - (mascotSize / 2);
  const mascotTopY = viewportHeight - mascotPos.y - mascotSize;
  const mascotLeftX = mascotCenterX - (mascotSize / 2);
  const mascotRightX = mascotCenterX + (mascotSize / 2);
  
  const clearanceGap = isMobile ? 12 : 16;
  const edgePadding = 8;
  
  let bubbleLeftX = mascotLeftX - bubbleWidth - clearanceGap;
  let bubbleTop = mascotTopY + (mascotSize / 2) - (bubbleHeight / 2);
  
  if (bubbleLeftX < edgePadding) {
    bubbleLeftX = mascotCenterX - (bubbleWidth / 2);
    bubbleTop = mascotTopY - clearanceGap - bubbleHeight;
    bubbleLeftX = Math.max(edgePadding, Math.min(bubbleLeftX, viewportWidth - bubbleWidth - edgePadding));
    
    if (bubbleTop < edgePadding) {
      const rightSpace = viewportWidth - mascotRightX - edgePadding;
      if (rightSpace >= bubbleWidth + clearanceGap) {
        bubbleLeftX = mascotRightX + clearanceGap;
        bubbleTop = mascotTopY + (mascotSize / 2) - (bubbleHeight / 2);
      }
    }
  }
  
  bubbleTop = Math.max(edgePadding, Math.min(bubbleTop, viewportHeight - bubbleHeight - edgePadding));
  bubbleLeftX = Math.max(edgePadding, Math.min(bubbleLeftX, viewportWidth - bubbleWidth - edgePadding));
  
  return { top: bubbleTop, left: bubbleLeftX };
};

export const FestiveDialogueBubble = memo(function FestiveDialogueBubble({
  thought,
  mascotPosition,
  mascotSize,
  isMobile = false,
  onDismiss,
}: FestiveDialogueBubbleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const lastThoughtIdRef = useRef<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isDismissing, setIsDismissing] = useState(false);
  
  const lettersRef = useRef<LetterData[]>([]);
  const phaseRef = useRef<AnimPhase>('done');
  const startTimeRef = useRef<number>(0);
  const exitStartTimeRef = useRef<number>(0);
  // Use ref for animation loop (avoids stale closure) + state to trigger position effect
  const bubbleDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [bubbleDimensionsReady, setBubbleDimensionsReady] = useState(0); // Increment to trigger position update
  const dprRef = useRef<number>(2);
  
  // Swipe threshold for dismissal (in pixels)
  const SWIPE_THRESHOLD = 80;
  
  const fontSize = isMobile ? 11 : 13;
  const lineHeight = fontSize * 1.3;
  const innerPadding = isMobile ? 8 : 10;
  const frameWidth = isMobile ? 3 : 4;
  const maxWidth = isMobile ? 140 : 180;
  
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = HOLIDAY_COLORS.white;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    
    const radius = 12;
    ctx.beginPath();
    ctx.roundRect(frameWidth / 2, frameWidth / 2, width - frameWidth, height - frameWidth, radius);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, HOLIDAY_COLORS.primary);
    gradient.addColorStop(0.25, HOLIDAY_COLORS.secondary);
    gradient.addColorStop(0.5, HOLIDAY_COLORS.gold);
    gradient.addColorStop(0.75, HOLIDAY_COLORS.secondary);
    gradient.addColorStop(1, HOLIDAY_COLORS.primary);
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = frameWidth;
    ctx.beginPath();
    ctx.roundRect(frameWidth / 2, frameWidth / 2, width - frameWidth, height - frameWidth, radius);
    ctx.stroke();
    
    const ornamentRadius = isMobile ? 4 : 5;
    const ornamentPositions = [
      { x: radius + frameWidth, y: frameWidth / 2 },
      { x: width - radius - frameWidth, y: frameWidth / 2 },
      { x: radius + frameWidth, y: height - frameWidth / 2 },
      { x: width - radius - frameWidth, y: height - frameWidth / 2 },
      { x: width / 2, y: frameWidth / 2 },
      { x: width / 2, y: height - frameWidth / 2 },
    ];
    
    ornamentPositions.forEach((pos, i) => {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ornamentRadius, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? HOLIDAY_COLORS.primary : HOLIDAY_COLORS.gold;
      ctx.fill();
      ctx.strokeStyle = HOLIDAY_COLORS.white;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [frameWidth, isMobile]);
  
  const drawLetter = useCallback((ctx: CanvasRenderingContext2D, letter: LetterData) => {
    if (!letter.visible) return;
    if (letter.char === ' ') return;
    
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    
    if (letter.exiting && letter.exitProgress > 0) {
      const p = Math.min(letter.exitProgress, 1);
      const { x: vx, y: vy, rotation: vr } = letter.exitVelocity;
      
      switch (letter.exitEffect) {
        case 'shatter':
          ctx.globalAlpha = Math.max(0, 1 - p);
          ctx.translate(letter.x + vx * p * 20, letter.y + vy * p * 20 + p * p * 50);
          ctx.rotate((vr * p * Math.PI) / 180);
          ctx.scale(Math.max(0.1, 1 - p * 0.5), Math.max(0.1, 1 - p * 0.5));
          break;
          
        case 'scatter':
          ctx.globalAlpha = Math.max(0, 1 - p * p);
          ctx.translate(
            letter.x + Math.sin(p * Math.PI * 4) * 10 + vx * p * 30,
            letter.y + vy * p * 40 - p * 20
          );
          ctx.rotate((vr * p * Math.PI) / 180);
          break;
          
        case 'dissolve':
          ctx.globalAlpha = Math.max(0, (1 - p) * (1 - p));
          ctx.translate(letter.x, letter.y);
          ctx.scale(1 + p * 0.3, 1 + p * 0.3);
          break;
          
        case 'sparkle':
          ctx.globalAlpha = p < 0.5 ? 1 : Math.max(0, (1 - p) * 2);
          ctx.translate(letter.x, letter.y - p * 30);
          ctx.scale(1 + Math.sin(p * Math.PI * 3) * 0.2, 1 + Math.sin(p * Math.PI * 3) * 0.2);
          break;
          
        case 'snowfall':
          ctx.globalAlpha = Math.max(0, 1 - p);
          ctx.translate(
            letter.x + Math.sin(p * Math.PI * 6) * 15,
            letter.y + p * 60
          );
          ctx.rotate((Math.sin(p * Math.PI * 2) * 20 * Math.PI) / 180);
          break;
          
        case 'confetti':
          ctx.globalAlpha = Math.max(0, 1 - p * p);
          ctx.translate(
            letter.x + vx * p * 25,
            letter.y + vy * p * 15 + p * p * 80
          );
          ctx.rotate((vr * p * 2 * Math.PI) / 180);
          ctx.scale(Math.max(0.1, 1 - p * 0.3), Math.max(0.1, 1 - p * 0.3));
          break;
      }
      
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(letter.char, 0, 0);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(letter.char, letter.x, letter.y);
    }
    
    ctx.restore();
  }, [fontSize]);
  
  // Stage 1: Activate bubble when new thought arrives OR deactivate when cleared
  useEffect(() => {
    // Handle thought being cleared - start exit animation, do NOT reset lastThoughtIdRef here
    // The ref is reset in the exit completion block (line ~411) to prevent race conditions
    // where Stage 2 could run with mismatched thought during animation
    if (!thought) {
      if (isActive && phaseRef.current !== 'exiting' && phaseRef.current !== 'done') {
        // Thought cleared while bubble was active - let it exit gracefully
        phaseRef.current = 'exiting';
        exitStartTimeRef.current = performance.now();
      }
      return;
    }
    
    // Skip if same thought
    if (thought.id === lastThoughtIdRef.current) return;
    
    lastThoughtIdRef.current = thought.id;
    phaseRef.current = 'entering';
    startTimeRef.current = 0;
    exitStartTimeRef.current = 0;
    bubbleDimensionsRef.current = { width: 0, height: 0 }; // Reset for new thought
    lettersRef.current = []; // Clear letters for new thought
    setIsActive(true);
  }, [thought, isActive]);
  
  // Stage 2: Initialize canvas AFTER it mounts (useLayoutEffect runs after DOM update)
  useLayoutEffect(() => {
    // Robust guard: verify thought and thought.text exist before proceeding
    if (!isActive || !thought || !thought.text) {
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Skip if dimensions already calculated for this thought
    if (bubbleDimensionsRef.current.width > 0 && lettersRef.current.length > 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Capture thought.text at this point to avoid race conditions
    const thoughtText = thought.text;
    if (!thoughtText) return;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    
    ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    const words = thoughtText.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxTextWidth = maxWidth - (innerPadding * 2) - (frameWidth * 2);
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    const textHeight = lines.length * lineHeight;
    const bubbleWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)) + (innerPadding * 2) + (frameWidth * 2));
    const bubbleHeight = textHeight + (innerPadding * 2) + (frameWidth * 2);
    
    bubbleDimensionsRef.current = { width: bubbleWidth, height: bubbleHeight };
    setBubbleDimensionsReady(n => n + 1); // Trigger position effect
    
    canvas.width = Math.ceil(bubbleWidth * dpr);
    canvas.height = Math.ceil(bubbleHeight * dpr);
    canvas.style.width = `${bubbleWidth}px`;
    canvas.style.height = `${bubbleHeight}px`;
    
    const newLetters: LetterData[] = [];
    const startX = frameWidth + innerPadding;
    let y = frameWidth + innerPadding + fontSize;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let x = startX;
      
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const char = line[charIdx];
        newLetters.push({
          char,
          x,
          y,
          visible: false,
          exiting: false,
          exitEffect: pickRandom(EXIT_EFFECTS),
          exitProgress: 0,
          exitVelocity: {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8 - 2,
            rotation: (Math.random() - 0.5) * 720,
          },
        });
        
        ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
        x += ctx.measureText(char).width;
      }
      y += lineHeight;
    }
    
    lettersRef.current = newLetters;
    
    const totalChars = newLetters.length;
    const entryDuration = Math.min(totalChars * 60, 2500);
    // User feedback: thoughts rotate too fast - use ThoughtManager's expiry if available
    // Otherwise use generous timing: 30 sec minimum, 300ms per char for leisurely reading
    const fallbackDisplayDuration = Math.max(30000, thought.text.length * 300);
    const displayDuration = thought.expiresAt ? 
      Math.max(thought.expiresAt - Date.now() - entryDuration - 2000, 25000) : fallbackDisplayDuration;
    const exitDuration = 1800;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const { width, height } = bubbleDimensionsRef.current;
      const dpr = dprRef.current;
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      
      drawFrame(ctx, width, height);
      
      const letters = lettersRef.current;
      
      if (phaseRef.current === 'entering') {
        const progress = Math.min(elapsed / entryDuration, 1);
        const charsToShow = Math.floor(progress * totalChars);
        
        for (let i = 0; i < letters.length; i++) {
          letters[i].visible = i < charsToShow;
        }
        
        if (progress >= 1) {
          phaseRef.current = 'displaying';
          exitStartTimeRef.current = elapsed + displayDuration;
          for (const letter of letters) {
            letter.visible = true;
          }
        }
      } else if (phaseRef.current === 'displaying') {
        for (const letter of letters) {
          letter.visible = true;
        }
        
        if (elapsed >= exitStartTimeRef.current) {
          phaseRef.current = 'exiting';
          for (const letter of letters) {
            letter.exiting = true;
            letter.exitProgress = 0;
          }
        }
      } else if (phaseRef.current === 'exiting') {
        const exitElapsed = elapsed - exitStartTimeRef.current;
        
        for (let i = 0; i < letters.length; i++) {
          const letterExitDelay = i * 25;
          const letterProgress = Math.max(0, (exitElapsed - letterExitDelay) / 600);
          letters[i].exitProgress = letterProgress;
        }
        
        if (exitElapsed >= exitDuration) {
          phaseRef.current = 'done';
          setIsActive(false);
          lastThoughtIdRef.current = null;
          return;
        }
      }
      
      for (const letter of letters) {
        drawLetter(ctx, letter);
      }
      
      animFrameRef.current = requestAnimationFrame(animate);
    };
    
    animFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, thought?.id, thought?.text, fontSize, lineHeight, innerPadding, frameWidth, maxWidth, drawFrame, drawLetter]);
  
  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    
    const { width, height } = bubbleDimensionsRef.current;
    if (!width || !height) return;
    
    const pos = calculatePosition(mascotPosition, mascotSize, isMobile, width, height);
    
    containerRef.current.style.top = `${pos.top}px`;
    containerRef.current.style.left = `${pos.left}px`;
  }, [isActive, mascotPosition, mascotSize, isMobile, bubbleDimensionsReady]);
  
  // Handle manual dismiss
  const handleDismiss = useCallback(() => {
    if (isDismissing) return;
    setIsDismissing(true);
    triggerHaptic('light');
    setIsActive(false);
    lastThoughtIdRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    onDismiss?.();
  }, [onDismiss, isDismissing]);
  
  // Store touch start position for swipe detection
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const VELOCITY_THRESHOLD = 0.3;
  
  // Native touch event handlers for reliable mobile swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isDismissing) return;
    
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    setSwipeOffset({ x: deltaX, y: deltaY });
  }, [isDismissing]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isDismissing) return;
    
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const timeDiff = Date.now() - touchStartRef.current.time;
    
    // Calculate velocity
    const velocityX = Math.abs(deltaX) / timeDiff;
    const velocityY = Math.abs(deltaY) / timeDiff;
    const totalVelocity = Math.max(velocityX, velocityY);
    
    const totalMovement = Math.abs(deltaX) + Math.abs(deltaY);
    
    // Dismiss if moved far enough OR fast swipe
    if (totalMovement > SWIPE_THRESHOLD || totalVelocity > VELOCITY_THRESHOLD) {
      const dirX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
      const dirY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
      setSwipeOffset({ x: dirX * 300, y: dirY * 300 });
      handleDismiss();
    } else {
      // Snap back
      setSwipeOffset({ x: 0, y: 0 });
    }
    
    touchStartRef.current = null;
  }, [isDismissing, handleDismiss]);

  if (!isActive || !thought) return null;
  
  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="pointer-events-auto trinity-bubble"
      data-mascot="festive-dialogue"
      data-trinity="true"
      style={{
        position: 'fixed',
        zIndex: 9990,
        transform: `translate(${swipeOffset.x}px, ${swipeOffset.y}px)`,
        transition: isDismissing ? 'all 0.3s ease-out' : (swipeOffset.x === 0 && swipeOffset.y === 0 ? 'top 0.1s ease-out, left 0.1s ease-out, opacity 0.3s ease-out' : 'none'),
        opacity: isDismissing ? 0 : 1,
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'pan-y',
      }}
      data-testid="festive-dialogue-bubble"
    >
      {/* Close button wrapper - needs pointer-events-auto to be clickable */}
      {/* Mobile: larger 44x44 touch target, higher z-index to stay above seasonal effects */}
      <div 
        className="pointer-events-auto absolute -top-3 -right-3"
        style={{ zIndex: 10001 }}
      >
        <button
          onClick={handleDismiss}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDismiss();
          }}
          className={`
            rounded-full bg-white border-2 border-red-500 flex items-center justify-center 
            shadow-lg hover:bg-red-50 active:bg-red-100 transition-colors
            ${isMobile ? 'w-11 h-11' : 'w-7 h-7'}
          `}
          style={{ 
            fontSize: isMobile ? '20px' : '16px', 
            fontWeight: 'bold', 
            color: '#c41e3a',
            touchAction: 'manipulation',
          }}
          aria-label="Dismiss thought bubble"
          data-testid="button-close-festive-bubble"
        >
          ×
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
        }}
      />
    </div>
  );
});

export default FestiveDialogueBubble;
