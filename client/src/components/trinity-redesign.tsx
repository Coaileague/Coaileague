/**
 * Trinity Redesigned - Universal Canvas-Based Mascot
 * 
 * A dynamic five-pointed interwoven ribbon knot mascot with:
 * - 5 interwoven ribbon petals alternating gold (#FFD700) and teal (#00BFFF)
 * - Central glowing crystalline core with radial gradient
 * - Digital data flow particles and circuitry overlays
 * - Breathing pulse, jitter, and morph animations
 * - State-based visual mutations with smooth transitions
 * - Responsive sizing for mobile/tablet/desktop
 * 
 * States with physical mutations:
 * - IDLE: Gentle breathing, warm teal/gold glow
 * - THINKING: Purple aura, rotating rings, enlarged core
 * - ANALYZING: Indigo tones, thin petals, node pulse
 * - SEARCHING: Green spotlight, wide spread, fast rotation
 * - SUCCESS: Gold bloom, celebration particles, max spread
 * - ERROR: Red shake, contracted petals, intense glow
 * - LISTENING: Amber waveform, medium spread
 * - UPLOADING: Cyan spiral, ascending particles
 * - CELEBRATING: Gold/pink confetti, maximum expansion
 * - ADVISING: Emerald wisdom, gentle orbit
 * - CODING: Matrix green, grid-step pattern
 * - WORKING: Active processing, moderate jitter
 * - AUTOMATING: Blue pulse, systematic flow
 */

import { useEffect, useRef, useCallback, memo, useState, useMemo } from 'react';
import type { MascotMode } from '@/config/mascotConfig';

interface TrinityRedesignProps {
  mode?: MascotMode;
  size?: number | 'responsive';
  mini?: boolean;
  className?: string;
  autoCycle?: boolean;
  cycleInterval?: number;
  idleTimeout?: number;
}

const NUM_PETALS = 5;

const STATE_MUTATIONS: Record<string, {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  animation: string;
  scale: number;
  petalLength: number;
  petalWidth: number;
  jitter: number;
  coreSize: number;
  coreGlow: number;
  rotationSpeed: number;
  particleCount: number;
}> = {
  IDLE: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#FFFFE0',
    animation: 'breathing',
    scale: 1.0,
    petalLength: 0.38,
    petalWidth: 0.12,
    jitter: 0,
    coreSize: 0.12,
    coreGlow: 0.2,
    rotationSpeed: 0,
    particleCount: 15,
  },
  THINKING: {
    primaryColor: '#a855f7',
    secondaryColor: '#FFD700',
    accentColor: '#d8b4fe',
    animation: 'rotating-rings',
    scale: 1.05,
    petalLength: 0.36,
    petalWidth: 0.10,
    jitter: 1,
    coreSize: 0.15,
    coreGlow: 0.3,
    rotationSpeed: 15,
    particleCount: 25,
  },
  ANALYZING: {
    primaryColor: '#6366f1',
    secondaryColor: '#00BFFF',
    accentColor: '#818cf8',
    animation: 'node-pulse',
    scale: 1.0,
    petalLength: 0.40,
    petalWidth: 0.08,
    jitter: 0.5,
    coreSize: 0.13,
    coreGlow: 0.35,
    rotationSpeed: 5,
    particleCount: 30,
  },
  SEARCHING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#6ee7b7',
    animation: 'spotlight-scan',
    scale: 1.1,
    petalLength: 0.42,
    petalWidth: 0.14,
    jitter: 0,
    coreSize: 0.10,
    coreGlow: 0.25,
    rotationSpeed: 25,
    particleCount: 20,
  },
  SUCCESS: {
    primaryColor: '#FFD700',
    secondaryColor: '#00BFFF',
    accentColor: '#FFFFE0',
    animation: 'bloom',
    scale: 1.15,
    petalLength: 0.45,
    petalWidth: 0.16,
    jitter: 0,
    coreSize: 0.16,
    coreGlow: 0.4,
    rotationSpeed: 0,
    particleCount: 35,
  },
  ERROR: {
    primaryColor: '#ef4444',
    secondaryColor: '#dc2626',
    accentColor: '#fca5a5',
    animation: 'shake',
    scale: 0.9,
    petalLength: 0.30,
    petalWidth: 0.14,
    jitter: 4,
    coreSize: 0.10,
    coreGlow: 0.5,
    rotationSpeed: 0,
    particleCount: 10,
  },
  LISTENING: {
    primaryColor: '#fbbf24',
    secondaryColor: '#00BFFF',
    accentColor: '#fcd34d',
    animation: 'waveform',
    scale: 1.05,
    petalLength: 0.37,
    petalWidth: 0.11,
    jitter: 0,
    coreSize: 0.13,
    coreGlow: 0.22,
    rotationSpeed: 0,
    particleCount: 18,
  },
  UPLOADING: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#67e8f9',
    animation: 'ascend-spiral',
    scale: 1.08,
    petalLength: 0.38,
    petalWidth: 0.09,
    jitter: 0,
    coreSize: 0.12,
    coreGlow: 0.25,
    rotationSpeed: 30,
    particleCount: 25,
  },
  CELEBRATING: {
    primaryColor: '#FFD700',
    secondaryColor: '#f472b6',
    accentColor: '#fef08a',
    animation: 'bloom',
    scale: 1.2,
    petalLength: 0.48,
    petalWidth: 0.18,
    jitter: 0,
    coreSize: 0.18,
    coreGlow: 0.5,
    rotationSpeed: 10,
    particleCount: 40,
  },
  ADVISING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#a7f3d0',
    animation: 'gentle-orbit',
    scale: 1.02,
    petalLength: 0.38,
    petalWidth: 0.13,
    jitter: 0,
    coreSize: 0.14,
    coreGlow: 0.2,
    rotationSpeed: 3,
    particleCount: 15,
  },
  HOLIDAY: {
    primaryColor: '#c41e3a',
    secondaryColor: '#165b33',
    accentColor: '#FFD700',
    animation: 'festive-spin',
    scale: 1.1,
    petalLength: 0.40,
    petalWidth: 0.15,
    jitter: 0,
    coreSize: 0.15,
    coreGlow: 0.35,
    rotationSpeed: 20,
    particleCount: 30,
  },
  GREETING: {
    primaryColor: '#f472b6',
    secondaryColor: '#00BFFF',
    accentColor: '#fbcfe8',
    animation: 'wave',
    scale: 1.06,
    petalLength: 0.38,
    petalWidth: 0.12,
    jitter: 0,
    coreSize: 0.13,
    coreGlow: 0.25,
    rotationSpeed: 0,
    particleCount: 20,
  },
  CODING: {
    primaryColor: '#34d399',
    secondaryColor: '#00BFFF',
    accentColor: '#a7f3d0',
    animation: 'grid-step',
    scale: 0.98,
    petalLength: 0.32,
    petalWidth: 0.08,
    jitter: 0,
    coreSize: 0.10,
    coreGlow: 0.3,
    rotationSpeed: 0,
    particleCount: 35,
  },
};

const CYCLE_MODES: MascotMode[] = [
  'IDLE', 'THINKING', 'ANALYZING', 'SEARCHING', 'SUCCESS', 
  'LISTENING', 'UPLOADING', 'CELEBRATING', 'ADVISING', 'CODING'
];

const RESPONSIVE_SIZES = {
  mobile: 90,
  tablet: 120,
  desktop: 140,
  demo: 180,
};

interface DataParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: 'circle' | 'square' | 'cross' | 'triangle';
  life: number;
  maxLife: number;
  color: string;
}

function adjustBrightness(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

const TrinityRedesign = memo(function TrinityRedesign({
  mode = 'IDLE',
  size = 'responsive',
  mini = false,
  className = '',
  autoCycle = false,
  cycleInterval = 2500,
  idleTimeout = 0,
}: TrinityRedesignProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const particlesRef = useRef<DataParticle[]>([]);
  const prevModeRef = useRef<MascotMode>(mode);
  const transitionRef = useRef<number>(1);
  
  const [cycleIndex, setCycleIndex] = useState(0);
  const [isUserIdle, setIsUserIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (idleTimeout <= 0) return;
    
    const resetIdleTimer = () => {
      setIsUserIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIsUserIdle(true), idleTimeout);
    };
    
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    
    return () => {
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [idleTimeout]);
  
  const shouldCycle = autoCycle || (idleTimeout > 0 && isUserIdle);
  
  useEffect(() => {
    if (!shouldCycle) return;
    const interval = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % CYCLE_MODES.length);
    }, cycleInterval);
    return () => clearInterval(interval);
  }, [shouldCycle, cycleInterval]);
  
  const activeMode = shouldCycle ? CYCLE_MODES[cycleIndex] : mode;
  const mutation = STATE_MUTATIONS[activeMode as keyof typeof STATE_MUTATIONS] || STATE_MUTATIONS.IDLE;
  
  const [windowWidth, setWindowWidth] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  
  useEffect(() => {
    if (typeof size === 'number') return;
    
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);
  
  const computedSize = useMemo(() => {
    if (typeof size === 'number') return size;
    if (windowWidth < 640) return RESPONSIVE_SIZES.mobile;
    if (windowWidth < 1024) return RESPONSIVE_SIZES.tablet;
    return RESPONSIVE_SIZES.desktop;
  }, [size, windowWidth]);
  
  const displaySize = mini ? computedSize * 0.75 : computedSize;
  
  const initParticles = useCallback((count: number, colors: { primary: string; secondary: string }) => {
    const particles: DataParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * displaySize * 0.35;
      particles.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 3 + 1,
        type: ['circle', 'square', 'cross', 'triangle'][Math.floor(Math.random() * 4)] as DataParticle['type'],
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 60,
        color: Math.random() > 0.5 ? colors.primary : colors.secondary,
      });
    }
    particlesRef.current = particles;
  }, [displaySize]);
  
  const drawRibbonPetal = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    angle: number,
    petalLength: number,
    ribbonWidth: number,
    color: string,
    pulseOffset: number
  ) => {
    const pulse = Math.sin(pulseOffset) * 3;
    const actualLength = petalLength + pulse;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    
    const gradient = ctx.createLinearGradient(-ribbonWidth, 0, ribbonWidth, 0);
    gradient.addColorStop(0, adjustBrightness(color, -25));
    gradient.addColorStop(0.25, adjustBrightness(color, 15));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(0.75, adjustBrightness(color, 15));
    gradient.addColorStop(1, adjustBrightness(color, -25));
    
    ctx.beginPath();
    
    const startY = -actualLength * 0.08;
    const peakY = -actualLength;
    const controlOffset = ribbonWidth * 1.5;
    
    ctx.moveTo(-ribbonWidth / 2, startY);
    ctx.bezierCurveTo(
      -ribbonWidth / 2 - controlOffset, startY - actualLength * 0.35,
      -ribbonWidth / 2 - controlOffset * 1.2, peakY + actualLength * 0.25,
      0, peakY
    );
    ctx.bezierCurveTo(
      ribbonWidth / 2 + controlOffset * 1.2, peakY + actualLength * 0.25,
      ribbonWidth / 2 + controlOffset, startY - actualLength * 0.35,
      ribbonWidth / 2, startY
    );
    ctx.bezierCurveTo(
      ribbonWidth / 3, startY + ribbonWidth * 0.25,
      -ribbonWidth / 3, startY + ribbonWidth * 0.25,
      -ribbonWidth / 2, startY
    );
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.strokeStyle = adjustBrightness(color, 35);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    
    ctx.restore();
  }, []);
  
  const drawInterwovenRibbons = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    mut: typeof mutation
  ) => {
    const angleStep = (Math.PI * 2) / NUM_PETALS;
    const ribbonWidth = radius * mut.petalWidth;
    const petalLen = radius * mut.petalLength;
    const pulseSpeed = 0.025;
    
    const frontLayer: Array<{index: number, color: string}> = [
      { index: 0, color: mut.secondaryColor },
      { index: 2, color: mut.secondaryColor },
      { index: 4, color: mut.secondaryColor },
    ];
    const backLayer: Array<{index: number, color: string}> = [
      { index: 1, color: mut.primaryColor },
      { index: 3, color: mut.primaryColor },
    ];
    
    for (const petal of backLayer) {
      const angle = angleStep * petal.index - Math.PI / 2 + (time * mut.rotationSpeed * 0.001);
      const pulseOffset = time * pulseSpeed + petal.index * 0.6;
      drawRibbonPetal(ctx, centerX, centerY, angle, petalLen, ribbonWidth, petal.color, pulseOffset);
    }
    
    drawCenterWeave(ctx, centerX, centerY, radius * 0.22, time, mut);
    
    for (const petal of frontLayer) {
      const angle = angleStep * petal.index - Math.PI / 2 + (time * mut.rotationSpeed * 0.001);
      const pulseOffset = time * pulseSpeed + petal.index * 0.6;
      drawRibbonPetal(ctx, centerX, centerY, angle, petalLen, ribbonWidth, petal.color, pulseOffset);
    }
  }, [drawRibbonPetal]);
  
  const drawCenterWeave = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    mut: typeof mutation
  ) => {
    const numSegments = 10;
    const angleStep = (Math.PI * 2) / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
      const startAngle = angleStep * i + (time * 0.008);
      const endAngle = angleStep * (i + 1) + (time * 0.008);
      const color = i % 2 === 0 ? mut.primaryColor : mut.secondaryColor;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, radius * 0.55, endAngle, startAngle, true);
      ctx.closePath();
      
      const gradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.4,
        centerX, centerY, radius
      );
      gradient.addColorStop(0, adjustBrightness(color, 25));
      gradient.addColorStop(1, color);
      
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, []);
  
  const drawCore = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    mut: typeof mutation
  ) => {
    const coreRadius = radius * mut.coreSize;
    const pulse = 1 + Math.sin(time * 0.04) * 0.12;
    const actualRadius = coreRadius * pulse;
    
    const glowGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, actualRadius * 3.5
    );
    glowGradient.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
    glowGradient.addColorStop(0.25, `${mut.accentColor}cc`);
    glowGradient.addColorStop(0.5, `${mut.primaryColor}66`);
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, actualRadius * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    
    const numSides = 5;
    ctx.beginPath();
    for (let i = 0; i < numSides; i++) {
      const angle = (Math.PI * 2 / numSides) * i - Math.PI / 2 + time * 0.012;
      const r = i % 2 === 0 ? actualRadius : actualRadius * 0.6;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    const coreGradient = ctx.createRadialGradient(
      centerX - actualRadius * 0.25, centerY - actualRadius * 0.25, 0,
      centerX, centerY, actualRadius
    );
    coreGradient.addColorStop(0, '#FFFFFF');
    coreGradient.addColorStop(0.3, mut.accentColor);
    coreGradient.addColorStop(0.7, mut.secondaryColor);
    coreGradient.addColorStop(1, adjustBrightness(mut.secondaryColor, -15));
    
    ctx.fillStyle = coreGradient;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(centerX - actualRadius * 0.2, centerY - actualRadius * 0.2, actualRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }, []);
  
  const drawDataParticles = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    time: number,
    mut: typeof mutation
  ) => {
    particlesRef.current.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life += 1;
      
      if (particle.life > particle.maxLife) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * displaySize * 0.3;
        particle.x = Math.cos(angle) * radius;
        particle.y = Math.sin(angle) * radius;
        particle.life = 0;
        particle.color = Math.random() > 0.5 ? mut.primaryColor : mut.secondaryColor;
      }
      
      const alpha = Math.max(0, 1 - particle.life / particle.maxLife) * 0.7;
      const x = centerX + particle.x;
      const y = centerY + particle.y;
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 1;
      
      switch (particle.type) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(x, y, particle.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.fillRect(x - particle.size / 2, y - particle.size / 2, particle.size, particle.size);
          break;
        case 'cross':
          ctx.beginPath();
          ctx.moveTo(x - particle.size, y);
          ctx.lineTo(x + particle.size, y);
          ctx.moveTo(x, y - particle.size);
          ctx.lineTo(x, y + particle.size);
          ctx.stroke();
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(x, y - particle.size);
          ctx.lineTo(x - particle.size, y + particle.size);
          ctx.lineTo(x + particle.size, y + particle.size);
          ctx.closePath();
          ctx.fill();
          break;
      }
      
      ctx.restore();
    });
  }, [displaySize]);
  
  const drawCircuitLines = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    mut: typeof mutation
  ) => {
    const numLines = 8;
    ctx.save();
    ctx.globalAlpha = 0.25;
    
    for (let i = 0; i < numLines; i++) {
      const angle = (Math.PI * 2 / numLines) * i + time * 0.006;
      const startRadius = radius * 0.55;
      const endRadius = radius * 1.15;
      
      const startX = centerX + Math.cos(angle) * startRadius;
      const startY = centerY + Math.sin(angle) * startRadius;
      const endX = centerX + Math.cos(angle) * endRadius;
      const endY = centerY + Math.sin(angle) * endRadius;
      
      ctx.beginPath();
      ctx.setLineDash([4, 6]);
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = i % 2 === 0 ? mut.primaryColor : mut.secondaryColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(endX, endY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
    
    ctx.setLineDash([]);
    ctx.restore();
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    ctx.scale(dpr, dpr);
    
    initParticles(mutation.particleCount, { primary: mutation.primaryColor, secondary: mutation.secondaryColor });
    
    const animate = () => {
      timeRef.current += 1;
      const time = timeRef.current;
      
      if (prevModeRef.current !== activeMode) {
        transitionRef.current = 0;
        prevModeRef.current = activeMode as MascotMode;
        initParticles(mutation.particleCount, { primary: mutation.primaryColor, secondary: mutation.secondaryColor });
      }
      transitionRef.current = Math.min(1, transitionRef.current + 0.03);
      
      ctx.clearRect(0, 0, displaySize, displaySize);
      
      const centerX = displaySize / 2;
      const centerY = displaySize / 2;
      const radius = Math.min(displaySize, displaySize) * 0.42;
      
      let jitterX = 0;
      let jitterY = 0;
      if (mutation.jitter > 0) {
        if (mutation.animation === 'shake') {
          jitterX = (Math.random() - 0.5) * mutation.jitter;
          jitterY = (Math.random() - 0.5) * mutation.jitter;
        } else {
          jitterX = Math.sin(time * 0.15) * mutation.jitter * 0.5;
          jitterY = Math.cos(time * 0.12) * mutation.jitter * 0.5;
        }
      }
      
      drawCircuitLines(ctx, centerX + jitterX, centerY + jitterY, radius, time, mutation);
      drawDataParticles(ctx, centerX, centerY, time, mutation);
      drawInterwovenRibbons(ctx, centerX + jitterX, centerY + jitterY, radius, time, mutation);
      drawCore(ctx, centerX, centerY, radius, time, mutation);
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [activeMode, displaySize, mutation, initParticles, drawCircuitLines, drawDataParticles, drawInterwovenRibbons, drawCore]);
  
  return (
    <div 
      className={`trinity-container ${className}`}
      style={{
        width: displaySize,
        height: displaySize,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        className="trinity-mascot-canvas"
        style={{
          width: displaySize,
          height: displaySize,
          display: 'block',
        }}
        data-testid="trinity-mascot-canvas"
      />
    </div>
  );
});

export default TrinityRedesign;
