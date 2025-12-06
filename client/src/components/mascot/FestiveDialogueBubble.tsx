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

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { Thought } from '@/lib/mascot/ThoughtManager';

interface FestiveDialogueBubbleProps {
  thought: Thought | null;
  mascotPosition: { x: number; y: number };
  mascotSize: number;
  isMobile?: boolean;
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
}: FestiveDialogueBubbleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const lastThoughtIdRef = useRef<string | null>(null);
  
  const lettersRef = useRef<LetterData[]>([]);
  const phaseRef = useRef<AnimPhase>('done');
  const startTimeRef = useRef<number>(0);
  const exitStartTimeRef = useRef<number>(0);
  const bubbleDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const dprRef = useRef<number>(2);
  
  const fontSize = isMobile ? 12 : 14;
  const lineHeight = fontSize * 1.35;
  const innerPadding = isMobile ? 10 : 14;
  const frameWidth = isMobile ? 4 : 5;
  const maxWidth = isMobile ? 180 : 260;
  
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
  
  useEffect(() => {
    if (!thought || thought.id === lastThoughtIdRef.current) return;
    
    lastThoughtIdRef.current = thought.id;
    phaseRef.current = 'entering';
    startTimeRef.current = 0;
    exitStartTimeRef.current = 0;
    setIsActive(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    
    ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    const words = thought.text.split(' ');
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
    const displayDuration = Math.max(4000, thought.text.length * 100);
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
  }, [thought?.id, thought?.text, fontSize, lineHeight, innerPadding, frameWidth, maxWidth, drawFrame, drawLetter]);
  
  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    
    const { width, height } = bubbleDimensionsRef.current;
    if (!width || !height) return;
    
    const pos = calculatePosition(mascotPosition, mascotSize, isMobile, width, height);
    
    containerRef.current.style.top = `${pos.top}px`;
    containerRef.current.style.left = `${pos.left}px`;
  }, [isActive, mascotPosition, mascotSize, isMobile]);
  
  if (!isActive || !thought) return null;
  
  return (
    <div
      ref={containerRef}
      className="pointer-events-none"
      style={{
        position: 'fixed',
        zIndex: 9990,
        transition: 'top 0.1s ease-out, left 0.1s ease-out',
      }}
      data-testid="festive-dialogue-bubble"
    >
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
