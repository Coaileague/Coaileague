/**
 * FloatingMascot - Transparent, freely-roaming AI companion
 * 
 * Features:
 * - No background/border - truly floating twin stars
 * - Smart UI avoidance system
 * - User action reactive animations
 * - Smooth roaming with physics-based movement
 * - Rich emote expressions
 * - Thought bubbles with AI insights
 */

import { useEffect, useRef, useCallback, useState, memo, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { uiAvoidanceSystem, type MascotPosition } from '@/lib/mascot/UIAvoidanceSystem';
import { userActionTracker, type ActionEvent } from '@/lib/mascot/UserActionTracker';
import { emotesManager, type Emote, EMOTE_ANIMATIONS } from '@/lib/mascot/EmotesLibrary';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { MASCOT_CONFIG, getDeviceSizes } from '@/config/mascotConfig';
import { TrinityPhysics } from '@/lib/mascot/TrinityPhysics';

export type MascotMode = 
  | 'IDLE' 
  | 'SEARCHING' 
  | 'THINKING' 
  | 'ANALYZING' 
  | 'CODING' 
  | 'LISTENING' 
  | 'UPLOADING' 
  | 'SUCCESS' 
  | 'ERROR'
  | 'CELEBRATING'
  | 'ADVISING'
  | 'HOLIDAY';

interface FloatingMascotProps {
  mode?: MascotMode;
  initialPosition?: MascotPosition;
  onPositionChange?: (pos: MascotPosition) => void;
  onModeChange?: (mode: MascotMode) => void;
  disabled?: boolean;
  userId?: string;
}

// Trinity color system: Cyan (Co), Purple (AI), Gold (NX/Nexus)
const MODE_COLORS: Record<MascotMode, { primary: string; secondary: string; tertiary: string; glow: string }> = {
  IDLE: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#f4c15d', glow: 'rgba(56, 189, 248, 0.6)' },
  SEARCHING: { primary: '#10b981', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(16, 185, 129, 0.6)' },
  THINKING: { primary: '#a855f7', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(168, 85, 247, 0.6)' },
  ANALYZING: { primary: '#6366f1', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(99, 102, 241, 0.6)' },
  CODING: { primary: '#34d399', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(52, 211, 153, 0.6)' },
  LISTENING: { primary: '#fbbf24', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(251, 191, 36, 0.6)' },
  UPLOADING: { primary: '#06b6d4', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(6, 182, 212, 0.6)' },
  SUCCESS: { primary: '#f472b6', secondary: '#ffffff', tertiary: '#fbbf24', glow: 'rgba(244, 114, 182, 0.6)' },
  ERROR: { primary: '#ef4444', secondary: '#ef4444', tertiary: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },
  CELEBRATING: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#fbbf24', glow: 'rgba(251, 191, 36, 0.6)' },
  ADVISING: { primary: '#10b981', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(16, 185, 129, 0.6)' },
  HOLIDAY: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#f4c15d', glow: 'rgba(244, 114, 182, 0.6)' }
};

interface Twin {
  x: number;
  y: number;
  angle: number;
  color: string;
  trail: { x: number; y: number; opacity: number }[];
}

// Text animation variants for thought bubbles - gives alive human feel
type TextAnimationType = 'typewriter' | 'fadeIn' | 'slideUp' | 'pop' | 'wave';

const AnimatedText = memo(function AnimatedText({ text }: { text: string }) {
  const [displayedChars, setDisplayedChars] = useState<string[]>([]);
  const [animationType] = useState<TextAnimationType>(() => {
    const types: TextAnimationType[] = ['typewriter', 'fadeIn', 'slideUp', 'pop', 'wave'];
    return types[Math.floor(Math.random() * types.length)];
  });
  
  useEffect(() => {
    if (!text) {
      setDisplayedChars([]);
      return;
    }
    
    const chars = text.split('');
    setDisplayedChars([]);
    
    if (animationType === 'typewriter') {
      let index = 0;
      const interval = setInterval(() => {
        if (index < chars.length) {
          setDisplayedChars(prev => [...prev, chars[index]]);
          index++;
        } else {
          clearInterval(interval);
        }
      }, 25 + Math.random() * 15);
      return () => clearInterval(interval);
    } else {
      // For other animations, show all chars immediately with staggered animation
      setDisplayedChars(chars);
    }
  }, [text, animationType]);
  
  const getCharStyle = (index: number): React.CSSProperties => {
    const delay = index * 0.03;
    
    switch (animationType) {
      case 'fadeIn':
        return {
          animation: `charFadeIn 0.4s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'slideUp':
        return {
          animation: `charSlideUp 0.3s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'pop':
        return {
          animation: `charPop 0.25s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'wave':
        return {
          animation: `charWave 0.5s ease-in-out ${delay}s both`,
          display: 'inline-block'
        };
      default:
        return { display: 'inline' };
    }
  };
  
  return (
    <>
      <style>{`
        @keyframes charFadeIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes charSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes charPop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes charWave {
          0% { transform: translateY(0); }
          30% { transform: translateY(-3px); }
          60% { transform: translateY(1px); }
          100% { transform: translateY(0); }
        }
      `}</style>
      <span>
        {displayedChars.map((char, i) => (
          <span key={`${i}-${char}`} style={getCharStyle(i)}>
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
    </>
  );
});

const FloatingMascot = memo(function FloatingMascot({
  mode = 'IDLE',
  initialPosition,
  onPositionChange,
  onModeChange,
  disabled = false,
  userId
}: FloatingMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  // Trinity Stars: Co (cyan), AI (purple), NX (gold) - 120° offset for triangular formation
  const twinsRef = useRef<Twin[]>([
    { x: 0, y: 0, angle: 0, color: '#38bdf8', trail: [] },                    // Cyan - "Co"
    { x: 0, y: 0, angle: (Math.PI * 2) / 3, color: '#a855f7', trail: [] },    // Purple - "AI"
    { x: 0, y: 0, angle: (Math.PI * 4) / 3, color: '#f4c15d', trail: [] }     // Gold - "NX"
  ]);
  const timeRef = useRef(0);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);
  
  // Trinity Physics for collision detection - uses tuned defaults from TrinityPhysics.ts
  const physicsRef = useRef<TrinityPhysics | null>(null);
  if (!physicsRef.current) {
    physicsRef.current = new TrinityPhysics();
  }

  const [currentMode, setCurrentMode] = useState<MascotMode>(mode);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [currentEmote, setCurrentEmote] = useState<Emote | null>(null);
  const [currentThought, setCurrentThought] = useState<string>('');
  const [showThought, setShowThought] = useState(false);
  
  const sizes = getDeviceSizes();
  const mascotSize = sizes.bubble;

  const posX = useMotionValue(initialPosition?.x ?? window.innerWidth - mascotSize - 20);
  const posY = useMotionValue(initialPosition?.y ?? window.innerHeight - mascotSize - 100);
  
  const springX = useSpring(posX, { stiffness: 300, damping: 30 });
  const springY = useSpring(posY, { stiffness: 300, damping: 30 });

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = mascotSize * dpr;
    canvas.height = mascotSize * dpr;
    ctx.scale(dpr, dpr);

    const colors = MODE_COLORS[currentMode];
    twinsRef.current[0].color = colors.primary;
    twinsRef.current[1].color = colors.secondary;
    twinsRef.current[2].color = colors.tertiary;

    const animate = () => {
      timeRef.current += 0.02;
      const t = timeRef.current;
      const center = mascotSize / 2;
      const radius = mascotSize * 0.22; // Slightly smaller for 3 stars

      ctx.clearRect(0, 0, mascotSize, mascotSize);

      ctx.globalAlpha = 0.15;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius * 2);
      gradient.addColorStop(0, colors.glow);
      gradient.addColorStop(0.5, 'rgba(244, 193, 93, 0.2)'); // Gold accent
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center, center, radius * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const twins = twinsRef.current;
      
      // Trinity positions with 120° offset
      let x1: number, y1: number, x2: number, y2: number, x3: number, y3: number;
      
      // Helper to calculate trinity positions with 120° offset
      const trinityOffset = (Math.PI * 2) / 3;
      
      switch (currentMode) {
        case 'IDLE':
          twins.forEach((twin, i) => { twin.angle += 0.015; });
          // Equilateral triangle formation - all 3 stars use consistent 120° offsets
          const idleAngle = twins[0].angle;
          x1 = center + Math.cos(idleAngle) * radius * 0.6;
          y1 = center + Math.sin(idleAngle) * radius * 0.5;
          x2 = center + Math.cos(idleAngle + trinityOffset) * radius * 0.6;
          y2 = center + Math.sin(idleAngle + trinityOffset) * radius * 0.5;
          x3 = center + Math.cos(idleAngle + trinityOffset * 2) * radius * 0.6;
          y3 = center + Math.sin(idleAngle + trinityOffset * 2) * radius * 0.5;
          break;
        
        case 'THINKING':
        case 'ANALYZING':
          twins.forEach((twin, i) => { twin.angle += 0.08; });
          x1 = center + Math.cos(twins[0].angle) * radius * 0.7;
          y1 = center + Math.sin(twins[0].angle) * radius * 0.7;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius * 0.7;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius * 0.7;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius * 0.7;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius * 0.7;
          break;
        
        case 'SEARCHING':
          twins[0].angle += 0.02;
          x1 = center;
          y1 = center;
          x2 = center + Math.cos(twins[0].angle) * radius;
          y2 = center + Math.sin(twins[0].angle) * radius;
          x3 = center + Math.cos(twins[0].angle + Math.PI) * radius * 0.5;
          y3 = center + Math.sin(twins[0].angle + Math.PI) * radius * 0.5;
          break;
        
        case 'CODING':
          const gridStep = t * 2;
          x1 = center + (Math.floor(gridStep) % 3 - 1) * (radius * 0.5);
          y1 = center + (Math.floor(gridStep / 3) % 3 - 1) * (radius * 0.5);
          x2 = center - (Math.floor(gridStep) % 3 - 1) * (radius * 0.5);
          y2 = center - (Math.floor(gridStep / 3) % 3 - 1) * (radius * 0.5);
          x3 = center + (Math.floor(gridStep + 1) % 3 - 1) * (radius * 0.5);
          y3 = center + (Math.floor((gridStep + 1) / 3) % 3 - 1) * (radius * 0.5);
          break;
        
        case 'LISTENING':
          const wave = Math.sin(t * 4) * radius * 0.3;
          x1 = center - radius * 0.4;
          y1 = center + wave;
          x2 = center;
          y2 = center - wave;
          x3 = center + radius * 0.4;
          y3 = center + wave * 0.5;
          break;
        
        case 'UPLOADING':
          const spiral = t * 2;
          const spiralR = radius * 0.5 * (1 - (spiral % 1));
          x1 = center + Math.cos(spiral * 3) * spiralR;
          y1 = center + Math.sin(spiral * 3) * spiralR - (spiral % 1) * radius;
          x2 = center + Math.cos(spiral * 3 + trinityOffset) * spiralR;
          y2 = center + Math.sin(spiral * 3 + trinityOffset) * spiralR - (spiral % 1) * radius;
          x3 = center + Math.cos(spiral * 3 + trinityOffset * 2) * spiralR;
          y3 = center + Math.sin(spiral * 3 + trinityOffset * 2) * spiralR - (spiral % 1) * radius;
          break;
        
        case 'SUCCESS':
        case 'CELEBRATING':
          const celebAngle = t * 3;
          x1 = center + Math.cos(celebAngle) * radius * 0.5 * (1 + Math.sin(t * 5) * 0.2);
          y1 = center + Math.sin(celebAngle) * radius * 0.5 - Math.abs(Math.sin(t * 4)) * radius * 0.3;
          x2 = center + Math.cos(celebAngle + trinityOffset) * radius * 0.5 * (1 + Math.sin(t * 5 + trinityOffset) * 0.2);
          y2 = center + Math.sin(celebAngle + trinityOffset) * radius * 0.5 - Math.abs(Math.sin(t * 4 + trinityOffset / 2)) * radius * 0.3;
          x3 = center + Math.cos(celebAngle + trinityOffset * 2) * radius * 0.5 * (1 + Math.sin(t * 5 + trinityOffset * 2) * 0.2);
          y3 = center + Math.sin(celebAngle + trinityOffset * 2) * radius * 0.5 - Math.abs(Math.sin(t * 4 + trinityOffset)) * radius * 0.3;
          break;
        
        case 'ERROR':
          const shake = Math.sin(t * 20) * radius * 0.1;
          x1 = center - radius * 0.3 + shake;
          y1 = center + shake * 0.5;
          x2 = center + radius * 0.3 + shake;
          y2 = center - shake * 0.5;
          x3 = center + shake;
          y3 = center + radius * 0.3 - shake * 0.3;
          break;
        
        default:
          twins.forEach((twin, i) => { twin.angle += 0.02; });
          x1 = center + Math.cos(twins[0].angle) * radius * 0.5;
          y1 = center + Math.sin(twins[0].angle) * radius * 0.5;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius * 0.5;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius * 0.5;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius * 0.5;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius * 0.5;
      }

      // Set physics target positions (relative to center)
      const physics = physicsRef.current;
      if (physics) {
        physics.setBounds(mascotSize, mascotSize);
        physics.setTargetPositions([
          { x: x1 - center, y: y1 - center },
          { x: x2 - center, y: y2 - center },
          { x: x3 - center, y: y3 - center }
        ]);
        
        // Run physics simulation with collision detection
        const positions = physics.update(1);
        
        // Apply physics positions (converted back to screen coords)
        twins[0].x = center + positions[0].x;
        twins[0].y = center + positions[0].y;
        twins[1].x = center + positions[1].x;
        twins[1].y = center + positions[1].y;
        twins[2].x = center + positions[2].x;
        twins[2].y = center + positions[2].y;
      } else {
        // Fallback to direct assignment
        twins[0].x = x1;
        twins[0].y = y1;
        twins[1].x = x2;
        twins[1].y = y2;
        twins[2].x = x3;
        twins[2].y = y3;
      }

      twins.forEach((twin, i) => {
        twin.trail.unshift({ x: twin.x, y: twin.y, opacity: 1 });
        if (twin.trail.length > 8) twin.trail.pop();
        
        twin.trail.forEach((point, j) => {
          const trailOpacity = (1 - j / twin.trail.length) * 0.4;
          const trailSize = 6 * (1 - j / twin.trail.length);
          
          ctx.beginPath();
          ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2);
          ctx.fillStyle = twin.color;
          ctx.globalAlpha = trailOpacity;
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      });

      // Draw connecting triangle between trinity stars
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(twins[0].x, twins[0].y);
      ctx.lineTo(twins[1].x, twins[1].y);
      ctx.lineTo(twins[2].x, twins[2].y);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Trinity branding: "Co" on cyan, "AI" on purple, "NX" on gold
      const brandingLabels = ['Co', 'AI', 'NX'];
      const brandingColors = ['#a855f7', '#38bdf8', '#38bdf8'];
      
      twins.forEach((twin, index) => {
        const starSize = mascotSize * 0.20;
        const innerSize = starSize * 0.6;
        const rimWidth = starSize * 0.08;
        
        // Outer glow halo
        const haloGradient = ctx.createRadialGradient(
          twin.x, twin.y, starSize * 0.5,
          twin.x, twin.y, starSize * 1.8
        );
        haloGradient.addColorStop(0, `${twin.color}40`);
        haloGradient.addColorStop(0.5, `${twin.color}15`);
        haloGradient.addColorStop(1, 'transparent');
        
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, starSize * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = haloGradient;
        ctx.fill();
        
        // Main star body with layered gradient
        const bodyGradient = ctx.createRadialGradient(
          twin.x - starSize * 0.2, twin.y - starSize * 0.2, 0,
          twin.x, twin.y, starSize
        );
        bodyGradient.addColorStop(0, '#ffffff');
        bodyGradient.addColorStop(0.3, twin.color);
        bodyGradient.addColorStop(0.7, twin.color);
        bodyGradient.addColorStop(1, `${twin.color}80`);
        
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, starSize, 0, Math.PI * 2);
        ctx.fillStyle = bodyGradient;
        ctx.fill();
        
        // Metallic rim stroke
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, starSize - rimWidth * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `${twin.color}90`;
        ctx.lineWidth = rimWidth;
        ctx.stroke();
        
        // Inner highlight ring
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, starSize * 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // White inner core with soft edge
        const coreGradient = ctx.createRadialGradient(
          twin.x - innerSize * 0.15, twin.y - innerSize * 0.15, 0,
          twin.x, twin.y, innerSize
        );
        coreGradient.addColorStop(0, '#ffffff');
        coreGradient.addColorStop(0.7, '#ffffff');
        coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0.85)');
        
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, innerSize, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.fill();
        
        // Text label with shadow
        const fontSize = Math.max(7, mascotSize * 0.12);
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        
        ctx.fillStyle = brandingColors[index];
        ctx.fillText(brandingLabels[index], twin.x, twin.y + 0.5);
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      });

      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.02;
        
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [currentMode, mascotSize]);

  useEffect(() => {
    setCurrentMode(mode);
    // Reset physics to prevent residual overlap when switching modes
    if (physicsRef.current) {
      physicsRef.current.resetToTargets();
    }
  }, [mode]);

  useEffect(() => {
    uiAvoidanceSystem.updateConfig({ mascotSize });
    uiAvoidanceSystem.start();
    userActionTracker.start();

    const unsubAvoidance = uiAvoidanceSystem.subscribe((newPos) => {
      if (!isDragging) {
        posX.set(newPos.x);
        posY.set(newPos.y);
        onPositionChange?.(newPos);
      }
    });

    const unsubEmotes = emotesManager.subscribe((emote) => {
      setCurrentEmote(emote);
    });

    const unsubActions = userActionTracker.subscribe((event) => {
      handleUserAction(event);
    });

    const unsubThoughts = thoughtManager.subscribe((thought) => {
      if (thought) {
        setCurrentThought(thought.text);
        setShowThought(true);
      } else {
        setShowThought(false);
      }
    });

    return () => {
      unsubAvoidance();
      unsubEmotes();
      unsubActions();
      unsubThoughts();
      uiAvoidanceSystem.stop();
      userActionTracker.stop();
    };
  }, [mascotSize, isDragging]);

  const handleUserAction = useCallback((event: ActionEvent) => {
    switch (event.action) {
      case 'loading_start':
        setCurrentMode('THINKING');
        onModeChange?.('THINKING');
        break;
      case 'success':
        setCurrentMode('SUCCESS');
        onModeChange?.('SUCCESS');
        spawnParticles(10);
        setTimeout(() => {
          setCurrentMode('IDLE');
          onModeChange?.('IDLE');
        }, 2000);
        break;
      case 'error':
        setCurrentMode('ERROR');
        onModeChange?.('ERROR');
        setTimeout(() => {
          setCurrentMode('IDLE');
          onModeChange?.('IDLE');
        }, 2000);
        break;
      case 'typing':
        setCurrentMode('LISTENING');
        onModeChange?.('LISTENING');
        break;
      case 'typing_stop':
        setCurrentMode('IDLE');
        onModeChange?.('IDLE');
        break;
      case 'form_submit':
        setCurrentMode('UPLOADING');
        onModeChange?.('UPLOADING');
        break;
      case 'idle_long':
        thoughtManager.triggerModeThought('IDLE');
        break;
    }
  }, [onModeChange]);

  const spawnParticles = useCallback((count: number) => {
    const colors = MODE_COLORS[currentMode];
    const center = mascotSize / 2;
    
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      particlesRef.current.push({
        x: center,
        y: center,
        vx: Math.cos(angle) * (2 + Math.random() * 2),
        vy: Math.sin(angle) * (2 + Math.random() * 2) - 2,
        life: 1,
        color: i % 2 === 0 ? colors.primary : colors.secondary
      });
    }
  }, [currentMode, mascotSize]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    emotesManager.triggerByCategory('playful');
  }, []);

  const handleDrag = useCallback((_: unknown, info: { point: { x: number; y: number } }) => {
    const newX = info.point.x - mascotSize / 2;
    const newY = info.point.y - mascotSize / 2;
    
    const boundedX = Math.max(10, Math.min(newX, window.innerWidth - mascotSize - 10));
    const boundedY = Math.max(10, Math.min(newY, window.innerHeight - mascotSize - 10));
    
    posX.set(boundedX);
    posY.set(boundedY);
    uiAvoidanceSystem.setCurrentPosition({ x: boundedX, y: boundedY });
  }, [mascotSize, posX, posY]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    
    const currentPos = { x: posX.get(), y: posY.get() };
    const safePos = uiAvoidanceSystem.findSafePosition(currentPos);
    
    posX.set(safePos.x);
    posY.set(safePos.y);
    onPositionChange?.(safePos);
    
    if (userId) {
      localStorage.setItem(`mascot-pos-${userId}`, JSON.stringify(safePos));
    }
    
    emotesManager.triggerById('drag-end-nice');
  }, [posX, posY, onPositionChange, userId]);

  const handleTap = useCallback(() => {
    emotesManager.triggerByCategory('clicking');
    spawnParticles(5);
  }, [spawnParticles]);

  const getEmoteAnimation = useCallback(() => {
    if (!currentEmote) return {};
    
    const anim = EMOTE_ANIMATIONS[currentEmote.animation];
    if (!anim) return {};
    
    return {
      animation: `${currentEmote.animation} ${anim.duration}ms ${anim.easing} ${anim.iterations === -1 ? 'infinite' : anim.iterations}`
    };
  }, [currentEmote]);

  if (disabled) return null;

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-8px) scale(1.05); }
          50% { transform: translateY(-12px) scale(1.1); }
          75% { transform: translateY(-4px) scale(1.02); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes jump {
          0% { transform: translateY(0) scaleY(1); }
          15% { transform: translateY(0) scaleY(0.8) scaleX(1.1); }
          30% { transform: translateY(-20px) scaleY(1.1) scaleX(0.95); }
          50% { transform: translateY(-25px) scaleY(1); }
          70% { transform: translateY(-10px) scaleY(1); }
          85% { transform: translateY(0) scaleY(0.9) scaleX(1.05); }
          100% { transform: translateY(0) scaleY(1); }
        }
        @keyframes sparkle {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 2px currentColor); }
          50% { filter: brightness(1.4) drop-shadow(0 0 8px currentColor); }
        }
        @keyframes dance {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-5px) rotate(-5deg); }
          50% { transform: translateY(0) rotate(5deg); }
          75% { transform: translateY(-3px) rotate(-3deg); }
        }
        @keyframes explode {
          0% { transform: scale(1); filter: brightness(1); }
          30% { transform: scale(1.5); filter: brightness(2); }
          100% { transform: scale(1); filter: brightness(1); }
        }
      `}</style>

      <motion.div
        ref={containerRef}
        className="fixed pointer-events-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          x: springX,
          y: springY,
          width: mascotSize,
          height: mascotSize,
          zIndex: MASCOT_CONFIG.zIndex,
          touchAction: 'none'
        }}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        data-testid="floating-mascot"
      >
        <motion.div
          className="relative w-full h-full"
          style={getEmoteAnimation()}
          animate={isDragging ? { scale: 1.1, rotate: [0, -3, 3, -3, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ 
              width: mascotSize, 
              height: mascotSize
            }}
            data-testid="mascot-canvas"
          />
          
          {isHovered && (
            <motion.div
              className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase whitespace-nowrap"
              style={{
                background: `linear-gradient(135deg, ${MODE_COLORS[currentMode].primary}25, ${MODE_COLORS[currentMode].secondary}25)`,
                color: '#ffffff',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${MODE_COLORS[currentMode].primary}40`,
                textShadow: `0 0 6px ${MODE_COLORS[currentMode].primary}`
              }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              CoAI
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {(showThought || currentEmote) && (
          <motion.div
            className="fixed pointer-events-none"
            style={{
              left: springX.get() + mascotSize + 10,
              top: springY.get() - 8,
              zIndex: MASCOT_CONFIG.zIndex + 1,
              maxWidth: 180
            }}
            initial={{ opacity: 0, scale: 0.85, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: -8 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <div
              className="relative px-3 py-2 rounded-2xl text-[11px] font-medium leading-relaxed"
              style={{
                background: 'rgba(255, 255, 255, 0.10)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.15)',
                color: '#ffffff',
                textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)'
              }}
            >
              <div
                className="absolute -left-[7px] top-3"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderRight: '7px solid rgba(255, 255, 255, 0.10)',
                  filter: 'drop-shadow(-1px 0 0 rgba(255, 255, 255, 0.15))'
                }}
              />
              <AnimatedText text={currentEmote?.expression || currentThought} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default FloatingMascot;
