/**
 * TrinityMascot - Five-pointed interwoven ribbon mascot
 * 
 * An intricate, five-pointed symbol formed by interwoven ribbons in gold and teal,
 * emanating digital energy with a crystalline glowing core at the center.
 * 
 * Features:
 * - Five interwoven loops (knot) alternating teal and gold
 * - Central glowing crystalline core
 * - Circuitry/data flow overlay with geometric shapes
 * - Breathing pulse animation (idle state)
 * - State-based color morphing and jitter effects
 * - Dark theme optimized
 */

import { useEffect, useRef, useCallback, memo, useState } from 'react';

export type TrinityMode = 
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
  | 'HOLIDAY'
  | 'GREETING';

interface TrinityMascotProps {
  mode?: TrinityMode;
  className?: string;
  size?: number;
  mini?: boolean;
  variant?: 'mini' | 'expanded' | 'full';
  onModeChange?: (mode: TrinityMode) => void;
}

// Trinity color palette
const TRINITY_COLORS = {
  ribbonTeal: '#00BFFF',
  ribbonGold: '#FFD700',
  coreLight: '#FFFFE0',
  dataFlow: '#FFFFFF',
  bgDark: '#0D1117',
};

// Mode-specific color overrides
const MODE_RIBBON_COLORS: Record<TrinityMode, { primary: string; secondary: string }> = {
  IDLE: { primary: '#00BFFF', secondary: '#FFD700' },
  SEARCHING: { primary: '#10b981', secondary: '#FFD700' },
  THINKING: { primary: '#a855f7', secondary: '#00BFFF' },
  ANALYZING: { primary: '#6366f1', secondary: '#FFD700' },
  CODING: { primary: '#34d399', secondary: '#00BFFF' },
  LISTENING: { primary: '#fbbf24', secondary: '#00BFFF' },
  UPLOADING: { primary: '#06b6d4', secondary: '#FFD700' },
  SUCCESS: { primary: '#22c55e', secondary: '#FFD700' },
  ERROR: { primary: '#ef4444', secondary: '#FFD700' },
  CELEBRATING: { primary: '#fbbf24', secondary: '#f472b6' },
  ADVISING: { primary: '#10b981', secondary: '#FFD700' },
  HOLIDAY: { primary: '#c41e3a', secondary: '#165b33' },
  GREETING: { primary: '#f472b6', secondary: '#00BFFF' },
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

interface RibbonSegment {
  startAngle: number;
  endAngle: number;
  color: string;
  depth: number;
}

const TrinityMascotComponent = ({
  mode = 'IDLE',
  className = '',
  size = 200,
  mini = false,
  variant = 'full',
  onModeChange,
}: TrinityMascotProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const particlesRef = useRef<DataParticle[]>([]);
  const prevModeRef = useRef<TrinityMode>(mode);
  const transitionRef = useRef<number>(0);

  // Calculate actual size based on variant
  const actualSize = variant === 'mini' ? 80 : variant === 'expanded' ? 180 : size;

  // Initialize particles
  const initParticles = useCallback((count: number) => {
    const particles: DataParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * actualSize * 0.4;
      particles.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        type: ['circle', 'square', 'cross', 'triangle'][Math.floor(Math.random() * 4)] as DataParticle['type'],
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 50,
        color: Math.random() > 0.5 ? TRINITY_COLORS.ribbonTeal : TRINITY_COLORS.ribbonGold,
      });
    }
    particlesRef.current = particles;
  }, [actualSize]);

  // Draw a single ribbon petal
  const drawRibbonPetal = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    angle: number,
    radius: number,
    ribbonWidth: number,
    color: string,
    pulseOffset: number
  ) => {
    const petalLength = radius * 0.85;
    const curveRadius = radius * 0.4;
    const pulse = Math.sin(pulseOffset) * 3;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    
    // Create gradient for 3D ribbon effect
    const gradient = ctx.createLinearGradient(-ribbonWidth, 0, ribbonWidth, 0);
    gradient.addColorStop(0, adjustBrightness(color, -30));
    gradient.addColorStop(0.3, adjustBrightness(color, 20));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(0.7, adjustBrightness(color, 20));
    gradient.addColorStop(1, adjustBrightness(color, -30));
    
    ctx.beginPath();
    
    // Draw looping ribbon petal using bezier curves
    const startY = -petalLength * 0.1;
    const peakY = -petalLength - pulse;
    const controlOffset = curveRadius;
    
    // Left side of ribbon
    ctx.moveTo(-ribbonWidth / 2, startY);
    ctx.bezierCurveTo(
      -ribbonWidth / 2 - controlOffset, startY - petalLength * 0.3,
      -ribbonWidth / 2 - controlOffset * 1.5, peakY + petalLength * 0.2,
      0, peakY
    );
    
    // Right side of ribbon (mirror)
    ctx.bezierCurveTo(
      ribbonWidth / 2 + controlOffset * 1.5, peakY + petalLength * 0.2,
      ribbonWidth / 2 + controlOffset, startY - petalLength * 0.3,
      ribbonWidth / 2, startY
    );
    
    // Close the petal with a curve at bottom
    ctx.bezierCurveTo(
      ribbonWidth / 4, startY + ribbonWidth * 0.3,
      -ribbonWidth / 4, startY + ribbonWidth * 0.3,
      -ribbonWidth / 2, startY
    );
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Add subtle highlight stroke
    ctx.strokeStyle = adjustBrightness(color, 40);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    ctx.restore();
  }, []);

  // Draw interwoven ribbons
  const drawInterwovenRibbons = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    colors: { primary: string; secondary: string }
  ) => {
    const numPetals = 5;
    const angleStep = (Math.PI * 2) / numPetals;
    const ribbonWidth = radius * 0.25;
    const pulseSpeed = 0.02;
    
    // Draw back layer petals first (odd indices)
    for (let i = 0; i < numPetals; i++) {
      if (i % 2 === 1) {
        const angle = angleStep * i - Math.PI / 2;
        const color = i % 2 === 0 ? colors.primary : colors.secondary;
        const pulseOffset = time * pulseSpeed + i * 0.5;
        drawRibbonPetal(ctx, centerX, centerY, angle, radius, ribbonWidth, color, pulseOffset);
      }
    }
    
    // Draw connecting center weave
    drawCenterWeave(ctx, centerX, centerY, radius * 0.35, time, colors);
    
    // Draw front layer petals (even indices)
    for (let i = 0; i < numPetals; i++) {
      if (i % 2 === 0) {
        const angle = angleStep * i - Math.PI / 2;
        const color = i % 2 === 0 ? colors.primary : colors.secondary;
        const pulseOffset = time * pulseSpeed + i * 0.5;
        drawRibbonPetal(ctx, centerX, centerY, angle, radius, ribbonWidth, color, pulseOffset);
      }
    }
  }, [drawRibbonPetal]);

  // Draw the center weave pattern
  const drawCenterWeave = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    colors: { primary: string; secondary: string }
  ) => {
    const numSegments = 10;
    const angleStep = (Math.PI * 2) / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
      const startAngle = angleStep * i;
      const endAngle = angleStep * (i + 1);
      const color = i % 2 === 0 ? colors.primary : colors.secondary;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, radius * 0.6, endAngle, startAngle, true);
      ctx.closePath();
      
      const gradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.5,
        centerX, centerY, radius
      );
      gradient.addColorStop(0, adjustBrightness(color, 30));
      gradient.addColorStop(1, color);
      
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, []);

  // Draw glowing central core
  const drawCore = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number
  ) => {
    const coreRadius = radius * 0.2;
    const pulse = 1 + Math.sin(time * 0.03) * 0.15;
    const actualRadius = coreRadius * pulse;
    
    // Outer glow
    const glowGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, actualRadius * 3
    );
    glowGradient.addColorStop(0, 'rgba(255, 255, 224, 0.8)');
    glowGradient.addColorStop(0.3, 'rgba(255, 215, 0, 0.4)');
    glowGradient.addColorStop(0.6, 'rgba(0, 191, 255, 0.2)');
    glowGradient.addColorStop(1, 'rgba(0, 191, 255, 0)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, actualRadius * 3, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    
    // Core crystal shape (hexagon)
    const numSides = 6;
    ctx.beginPath();
    for (let i = 0; i < numSides; i++) {
      const angle = (Math.PI * 2 / numSides) * i - Math.PI / 2 + time * 0.01;
      const x = centerX + Math.cos(angle) * actualRadius;
      const y = centerY + Math.sin(angle) * actualRadius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    const coreGradient = ctx.createRadialGradient(
      centerX - actualRadius * 0.3, centerY - actualRadius * 0.3, 0,
      centerX, centerY, actualRadius
    );
    coreGradient.addColorStop(0, '#FFFFFF');
    coreGradient.addColorStop(0.3, TRINITY_COLORS.coreLight);
    coreGradient.addColorStop(0.7, TRINITY_COLORS.ribbonGold);
    coreGradient.addColorStop(1, adjustBrightness(TRINITY_COLORS.ribbonGold, -20));
    
    ctx.fillStyle = coreGradient;
    ctx.fill();
    
    // Inner bright spot
    ctx.beginPath();
    ctx.arc(centerX - actualRadius * 0.2, centerY - actualRadius * 0.2, actualRadius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  }, []);

  // Draw data flow particles
  const drawDataParticles = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    time: number
  ) => {
    particlesRef.current.forEach((particle, index) => {
      // Update particle position
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life += 1;
      
      // Reset particle if life exceeded
      if (particle.life > particle.maxLife) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * actualSize * 0.3;
        particle.x = Math.cos(angle) * radius;
        particle.y = Math.sin(angle) * radius;
        particle.life = 0;
      }
      
      const alpha = Math.max(0, 1 - particle.life / particle.maxLife);
      const x = centerX + particle.x;
      const y = centerY + particle.y;
      
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
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
  }, [actualSize]);

  // Draw circuit lines
  const drawCircuitLines = useCallback((
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    time: number
  ) => {
    const numLines = 8;
    ctx.save();
    ctx.globalAlpha = 0.3;
    
    for (let i = 0; i < numLines; i++) {
      const angle = (Math.PI * 2 / numLines) * i + time * 0.005;
      const startRadius = radius * 0.6;
      const endRadius = radius * 1.2;
      
      const startX = centerX + Math.cos(angle) * startRadius;
      const startY = centerY + Math.sin(angle) * startRadius;
      const endX = centerX + Math.cos(angle) * endRadius;
      const endY = centerY + Math.sin(angle) * endRadius;
      
      // Draw dashed line
      ctx.beginPath();
      ctx.setLineDash([3, 5]);
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = i % 2 === 0 ? TRINITY_COLORS.ribbonTeal : TRINITY_COLORS.ribbonGold;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw endpoint node
      ctx.beginPath();
      ctx.arc(endX, endY, 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
    
    ctx.setLineDash([]);
    ctx.restore();
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Initialize particles
    initParticles(mini ? 10 : 25);
    
    const animate = () => {
      timeRef.current += 1;
      const time = timeRef.current;
      
      // Handle mode transition
      if (prevModeRef.current !== mode) {
        transitionRef.current = 0;
        prevModeRef.current = mode;
      }
      transitionRef.current = Math.min(1, transitionRef.current + 0.02);
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(canvas.width, canvas.height) * 0.35;
      
      // Get mode colors
      const colors = MODE_RIBBON_COLORS[mode];
      
      // Apply mode-specific effects
      let jitter = 0;
      if (mode === 'THINKING' || mode === 'ANALYZING') {
        jitter = Math.sin(time * 0.1) * 2;
      } else if (mode === 'ERROR') {
        jitter = (Math.random() - 0.5) * 4;
      }
      
      // Draw layers
      drawCircuitLines(ctx, centerX + jitter, centerY + jitter, radius, time);
      drawDataParticles(ctx, centerX, centerY, time);
      drawInterwovenRibbons(ctx, centerX + jitter, centerY + jitter, radius, time, colors);
      drawCore(ctx, centerX, centerY, radius, time);
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mode, mini, initParticles, drawCircuitLines, drawDataParticles, drawInterwovenRibbons, drawCore]);

  return (
    <canvas
      ref={canvasRef}
      width={actualSize}
      height={actualSize}
      className={`trinity-mascot ${className}`}
      style={{
        width: actualSize,
        height: actualSize,
        display: 'block',
      }}
      data-testid="trinity-mascot-canvas"
    />
  );
};

// Utility function to adjust color brightness
function adjustBrightness(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

export const TrinityMascot = memo(TrinityMascotComponent);
export default TrinityMascot;
