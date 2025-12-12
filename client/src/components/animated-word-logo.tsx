/**
 * AnimatedWordLogo - Google Doodle-style animated logo with seasonal themes
 * 
 * Features:
 * - SVG-based letter animation
 * - Automatic seasonal theming (Christmas lights, fall leaves, etc.)
 * - Interactive hover effects
 * - Reduced motion support
 * - Canvas-based particle/decoration overlays
 */

import { useEffect, useRef, useState, memo, useMemo } from 'react';
import { useSeasonalTheme } from '@/context/SeasonalThemeContext';
import { SeasonalTheme, ThemeDecorations, getThemeConfig } from '@/config/seasonalThemes';
import { cn } from '@/lib/utils';

// Christmas color palette for alternating AI letter glow
const CHRISTMAS_COLORS = {
  red: { color: '#dc2626', glow: '0 0 6px #dc2626, 0 0 12px #dc262650' },
  green: { color: '#16a34a', glow: '0 0 6px #16a34a, 0 0 12px #16a34a50' },
  gold: { color: '#eab308', glow: '0 0 6px #eab308, 0 0 12px #eab30850' },
};

interface AnimatedWordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  themeOverride?: SeasonalTheme;
  showDecorations?: boolean;
  interactive?: boolean;
  className?: string;
}

const SIZES = {
  sm: { fontSize: 20, iconSize: 24, height: 32 },
  md: { fontSize: 28, iconSize: 32, height: 44 },
  lg: { fontSize: 36, iconSize: 40, height: 56 },
  xl: { fontSize: 48, iconSize: 52, height: 72 }
};

interface Decoration {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  type: string;
  phase: number;
}

class DecorationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private decorations: Decoration[] = [];
  private isRunning = false;
  private animationId: number | null = null;
  private time = 0;
  private config: ThemeDecorations;
  private width = 0;
  private height = 0;
  
  constructor(canvas: HTMLCanvasElement, config: ThemeDecorations) {
    this.canvas = canvas;
    this.config = config;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.resize();
    this.initDecorations();
  }
  
  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    // Reset transform before scaling to prevent cumulative scaling
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }
  
  private initDecorations() {
    this.decorations = [];
    if (this.config.type === 'none') return;
    
    const count = this.config.density === 'dense' ? 20 : 
                  this.config.density === 'medium' ? 12 : 6;
    
    for (let i = 0; i < count; i++) {
      this.spawnDecoration(i);
    }
  }
  
  private spawnDecoration(index: number) {
    const colors = this.config.colors;
    const color = colors[index % colors.length];
    
    let x, y, vx, vy, size;
    
    switch (this.config.type) {
      case 'lights':
        // Christmas lights: positioned along a sine wave path
        x = (index / 20) * this.width;
        y = this.height * 0.3 + Math.sin(index * 0.8) * 15;
        vx = 0;
        vy = 0;
        size = 6 + Math.random() * 4;
        break;
        
      case 'snowflakes':
        x = Math.random() * this.width;
        y = -20 - Math.random() * 50;
        vx = (Math.random() - 0.5) * 0.5;
        vy = 0.5 + Math.random() * 1;
        size = 3 + Math.random() * 5;
        break;
        
      case 'leaves':
        x = Math.random() * this.width;
        y = -20 - Math.random() * 30;
        vx = (Math.random() - 0.5) * 1;
        vy = 1 + Math.random() * 1.5;
        size = 8 + Math.random() * 6;
        break;
        
      case 'flowers':
        x = Math.random() * this.width;
        y = this.height + 10;
        vx = (Math.random() - 0.5) * 0.3;
        vy = -0.3 - Math.random() * 0.5;
        size = 6 + Math.random() * 4;
        break;
        
      case 'hearts':
        x = Math.random() * this.width;
        y = this.height + 10;
        vx = (Math.random() - 0.5) * 0.5;
        vy = -0.8 - Math.random() * 0.5;
        size = 8 + Math.random() * 6;
        break;
        
      case 'fireworks':
        x = Math.random() * this.width;
        y = Math.random() * this.height;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        size = 3 + Math.random() * 3;
        break;
        
      case 'sunrays':
        x = this.width * 0.9;
        y = -10;
        vx = -0.5;
        vy = 0.3;
        size = 2 + Math.random() * 2;
        break;
        
      case 'pumpkins':
        x = Math.random() * this.width;
        y = this.height - 10 - Math.random() * 20;
        vx = 0;
        vy = 0;
        size = 10 + Math.random() * 8;
        break;
        
      default:
        x = Math.random() * this.width;
        y = Math.random() * this.height;
        vx = (Math.random() - 0.5) * 0.5;
        vy = (Math.random() - 0.5) * 0.5;
        size = 4 + Math.random() * 4;
    }
    
    this.decorations.push({
      x, y, vx, vy, size, color,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      opacity: 0.6 + Math.random() * 0.4,
      type: this.config.type,
      phase: index * 0.3
    });
  }
  
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }
  
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  updateConfig(config: ThemeDecorations) {
    this.config = config;
    this.initDecorations();
  }
  
  private animate = () => {
    if (!this.isRunning) return;
    
    this.time += 1;
    this.update();
    this.draw();
    
    this.animationId = requestAnimationFrame(this.animate);
  };
  
  private update() {
    const speed = this.config.animationSpeed === 'fast' ? 1.5 :
                  this.config.animationSpeed === 'slow' ? 0.5 : 1;
    
    this.decorations.forEach((d, i) => {
      d.rotation += d.rotationSpeed * speed;
      
      switch (d.type) {
        case 'lights':
          // Twinkling effect
          d.opacity = 0.5 + Math.sin(this.time * 0.1 + d.phase) * 0.5;
          break;
          
        case 'snowflakes':
        case 'leaves':
          d.x += d.vx * speed;
          d.y += d.vy * speed;
          d.x += Math.sin(this.time * 0.02 + d.phase) * 0.5;
          if (d.y > this.height + 20) {
            d.y = -20;
            d.x = Math.random() * this.width;
          }
          break;
          
        case 'flowers':
        case 'hearts':
          d.x += d.vx * speed;
          d.y += d.vy * speed;
          d.opacity = Math.max(0, d.opacity - 0.003);
          if (d.y < -20 || d.opacity <= 0) {
            d.y = this.height + 10;
            d.x = Math.random() * this.width;
            d.opacity = 0.8;
          }
          break;
          
        case 'fireworks':
          d.x += d.vx * speed;
          d.y += d.vy * speed;
          d.opacity -= 0.015;
          if (d.opacity <= 0) {
            d.x = Math.random() * this.width;
            d.y = Math.random() * this.height;
            d.opacity = 1;
            const angle = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 2;
            d.vx = Math.cos(angle) * spd;
            d.vy = Math.sin(angle) * spd;
          }
          break;
          
        case 'sunrays':
          d.opacity = 0.3 + Math.sin(this.time * 0.05 + d.phase) * 0.2;
          break;
          
        case 'pumpkins':
          // Subtle bounce
          d.y = (this.height - 15) + Math.sin(this.time * 0.03 + d.phase) * 3;
          break;
      }
    });
  }
  
  private draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    this.decorations.forEach(d => {
      this.ctx.save();
      this.ctx.translate(d.x, d.y);
      this.ctx.rotate(d.rotation);
      this.ctx.globalAlpha = d.opacity;
      
      switch (d.type) {
        case 'lights':
          this.drawLight(d);
          break;
        case 'snowflakes':
          this.drawSnowflake(d);
          break;
        case 'leaves':
          this.drawLeaf(d);
          break;
        case 'flowers':
          this.drawFlower(d);
          break;
        case 'hearts':
          this.drawHeart(d);
          break;
        case 'fireworks':
          this.drawSparkle(d);
          break;
        case 'sunrays':
          this.drawRay(d);
          break;
        case 'pumpkins':
          this.drawPumpkin(d);
          break;
      }
      
      this.ctx.restore();
    });
  }
  
  private drawLight(d: Decoration) {
    // Draw bulb glow
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, d.size * 2);
    gradient.addColorStop(0, d.color);
    gradient.addColorStop(0.5, d.color + '80');
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, d.size * 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Draw bulb
    this.ctx.fillStyle = d.color;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, d.size * 0.6, d.size, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private drawSnowflake(d: Decoration) {
    this.ctx.strokeStyle = d.color;
    this.ctx.lineWidth = 1.5;
    
    for (let i = 0; i < 6; i++) {
      this.ctx.save();
      this.ctx.rotate((Math.PI / 3) * i);
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(0, -d.size);
      this.ctx.moveTo(0, -d.size * 0.6);
      this.ctx.lineTo(-d.size * 0.3, -d.size * 0.8);
      this.ctx.moveTo(0, -d.size * 0.6);
      this.ctx.lineTo(d.size * 0.3, -d.size * 0.8);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
  
  private drawLeaf(d: Decoration) {
    this.ctx.fillStyle = d.color;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, d.size * 0.4, d.size, 0, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Leaf vein
    this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -d.size);
    this.ctx.lineTo(0, d.size);
    this.ctx.stroke();
  }
  
  private drawFlower(d: Decoration) {
    // Petals
    for (let i = 0; i < 5; i++) {
      this.ctx.save();
      this.ctx.rotate((Math.PI * 2 / 5) * i);
      this.ctx.fillStyle = d.color;
      this.ctx.beginPath();
      this.ctx.ellipse(0, -d.size * 0.5, d.size * 0.3, d.size * 0.5, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
    
    // Center
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, d.size * 0.25, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private drawHeart(d: Decoration) {
    this.ctx.fillStyle = d.color;
    this.ctx.beginPath();
    
    const s = d.size * 0.5;
    this.ctx.moveTo(0, s * 0.3);
    this.ctx.bezierCurveTo(-s, -s * 0.5, -s * 2, s * 0.5, 0, s * 1.5);
    this.ctx.bezierCurveTo(s * 2, s * 0.5, s, -s * 0.5, 0, s * 0.3);
    this.ctx.fill();
  }
  
  private drawSparkle(d: Decoration) {
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, d.size);
    gradient.addColorStop(0, d.color);
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, d.size, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private drawRay(d: Decoration) {
    const gradient = this.ctx.createLinearGradient(0, 0, -this.width * 0.3, this.height * 0.3);
    gradient.addColorStop(0, d.color + '60');
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = d.size;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(-this.width * 0.3, this.height * 0.3);
    this.ctx.stroke();
  }
  
  private drawPumpkin(d: Decoration) {
    // Main body
    this.ctx.fillStyle = d.color;
    for (let i = 0; i < 5; i++) {
      this.ctx.beginPath();
      const offsetX = (i - 2) * d.size * 0.25;
      this.ctx.ellipse(offsetX, 0, d.size * 0.35, d.size * 0.5, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Stem
    this.ctx.fillStyle = '#22c55e';
    this.ctx.beginPath();
    this.ctx.rect(-d.size * 0.1, -d.size * 0.7, d.size * 0.2, d.size * 0.25);
    this.ctx.fill();
  }
  
  destroy() {
    this.stop();
  }
}

export const AnimatedWordLogo = memo(function AnimatedWordLogo({
  size = 'md',
  themeOverride,
  showDecorations = true,
  interactive = true,
  className
}: AnimatedWordLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DecorationEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredLetter, setHoveredLetter] = useState<number | null>(null);
  const [glowPhase, setGlowPhase] = useState(0);
  
  // Use the orchestrated seasonal theme from context
  const { seasonId, profile } = useSeasonalTheme();
  
  // Map seasonId to theme and get config
  const theme: SeasonalTheme = themeOverride || (seasonId as SeasonalTheme) || 'default';
  const config = getThemeConfig(theme);
  
  // Check for reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  const isChristmas = seasonId === 'christmas';
  const sizeConfig = SIZES[size];
  
  // Animate Christmas glow colors with alternating pattern
  useEffect(() => {
    if (!isChristmas) return;
    
    const interval = setInterval(() => {
      setGlowPhase(prev => (prev + 1) % 4);
    }, 1800);
    
    return () => clearInterval(interval);
  }, [isChristmas]);
  
  // Get Christmas glow for A and I letters (alternating)
  const getChristmasGlow = useMemo(() => {
    const colorSequence = [
      [CHRISTMAS_COLORS.red, CHRISTMAS_COLORS.green],
      [CHRISTMAS_COLORS.green, CHRISTMAS_COLORS.gold],
      [CHRISTMAS_COLORS.gold, CHRISTMAS_COLORS.red],
      [CHRISTMAS_COLORS.red, CHRISTMAS_COLORS.green],
    ];
    return colorSequence[glowPhase];
  }, [glowPhase]);
  
  // Initialize decoration engine
  useEffect(() => {
    // Skip entirely for reduced motion or no decorations
    if (!canvasRef.current || prefersReducedMotion || !showDecorations) return;
    if (config.decorations.type === 'none') return;
    
    const engine = new DecorationEngine(canvasRef.current, config.decorations);
    engineRef.current = engine;
    engine.start();
    
    const handleResize = () => {
      engine.resize();
    };
    
    // Use ResizeObserver for more accurate sizing
    const resizeObserver = new ResizeObserver(handleResize);
    if (canvasRef.current.parentElement) {
      resizeObserver.observe(canvasRef.current.parentElement);
    }
    
    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [config.decorations, prefersReducedMotion, showDecorations]);
  
  // Update engine config when theme changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig(config.decorations);
    }
  }, [config.decorations]);
  
  const letters = useMemo(() => {
    return 'CoAIleague'.split('').map((letter, index) => ({
      char: letter,
      index,
      isAccent: index >= 2 && index <= 3, // "AI" letters
      delay: index * 0.05
    }));
  }, []);
  
  const gradientId = `logo-gradient-${theme}`;
  const glowId = `logo-glow-${theme}`;
  
  return (
    <div 
      ref={containerRef}
      className={cn("relative inline-flex items-center", className)}
      style={{ height: sizeConfig.height }}
      data-testid="animated-word-logo"
    >
      {/* Decoration canvas overlay */}
      {showDecorations && config.decorations.type !== 'none' && !prefersReducedMotion && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{ mixBlendMode: 'screen' }}
          data-testid="logo-decorations-canvas"
        />
      )}
      
      {/* Icon */}
      <div 
        className="relative mr-2 flex-shrink-0"
        style={{ width: sizeConfig.iconSize, height: sizeConfig.iconSize }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              {config.letterEffects.gradient.map((color, i) => (
                <stop 
                  key={i} 
                  offset={`${(i / (config.letterEffects.gradient.length - 1)) * 100}%`} 
                  stopColor={color} 
                />
              ))}
            </linearGradient>
            <filter id={glowId}>
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* C shape */}
          <path
            d="M 70 25 
               A 35 35 0 1 0 70 75"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="8"
            strokeLinecap="round"
            filter={`url(#${glowId})`}
            className={cn(
              prefersReducedMotion ? '' : 'animate-pulse',
              config.letterEffects.animation === 'shimmer' && 'animate-shimmer'
            )}
            style={{
              animationDuration: '3s'
            }}
          />
          
          {/* Inner dot pattern */}
          <circle cx="50" cy="35" r="4" fill={config.colors.accent} opacity="0.8" />
          <circle cx="38" cy="50" r="3" fill={config.colors.primary} opacity="0.6" />
          <circle cx="50" cy="65" r="4" fill={config.colors.secondary} opacity="0.8" />
        </svg>
      </div>
      
      {/* Word mark */}
      <div className="flex items-baseline relative">
        {letters.map(({ char, index, isAccent, delay }) => {
          // Christmas: A (index 2) and I (index 3) get alternating glow colors
          const isA = index === 2;
          const isI = index === 3;
          const christmasStyle = isChristmas && (isA || isI) ? {
            color: isA ? getChristmasGlow[0].color : getChristmasGlow[1].color,
            textShadow: isA ? getChristmasGlow[0].glow : getChristmasGlow[1].glow,
            transition: 'color 0.6s ease, text-shadow 0.6s ease',
          } : {};
          
          return (
            <span
              key={index}
              className={cn(
                "font-black transition-all duration-300 cursor-default select-none",
                interactive && "hover:scale-110 hover:-translate-y-1",
                prefersReducedMotion ? '' : getAnimationClass(config.letterEffects.animation)
              )}
              style={{
                fontSize: sizeConfig.fontSize,
                background: (isAccent && !isChristmas)
                  ? `linear-gradient(135deg, ${config.letterEffects.gradient.join(', ')})`
                  : undefined,
                WebkitBackgroundClip: (isAccent && !isChristmas) ? 'text' : undefined,
                WebkitTextFillColor: (isAccent && !isChristmas) ? 'transparent' : undefined,
                color: (isAccent && !isChristmas) ? undefined : (isChristmas && isAccent) ? christmasStyle.color : 'currentColor',
                textShadow: (isChristmas && isAccent) 
                  ? christmasStyle.textShadow 
                  : (hoveredLetter === index ? config.letterEffects.shadow : undefined),
                animationDelay: `${delay}s`,
                animationDuration: '2s',
                ...christmasStyle,
              }}
              onMouseEnter={() => interactive && setHoveredLetter(index)}
              onMouseLeave={() => setHoveredLetter(null)}
              data-testid={`logo-letter-${index}`}
            >
              {char}
            </span>
          );
        })}
        
        {/* Trademark */}
        <span 
          className="text-xs align-super ml-0.5 opacity-70"
          style={{ color: config.colors.primary }}
        >
          ™
        </span>
      </div>
    </div>
  );
});

function getAnimationClass(animation: string): string {
  switch (animation) {
    case 'wave':
      return 'animate-wave';
    case 'bounce':
      return 'animate-bounce-subtle';
    case 'glow':
      return 'animate-glow';
    case 'shimmer':
      return 'animate-shimmer';
    default:
      return '';
  }
}

export { AnimatedWordLogo as SeasonalLogo };
