/**
 * SnowfallEngine - Advanced snowfall with pile accumulation
 * 
 * Features:
 * - Realistic falling snowflakes with physics
 * - Snow piles that form, hold, and dissolve over time
 * - Variable speed cycles (fast/slow/medium)
 * - Responsive to screen size
 * - Performance optimized with requestAnimationFrame
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useSeasonalEffect } from '@/context/SeasonalThemeContext';
import { getSnowConfig } from '@/config/seasonalThemes';

interface Snowflake {
  x: number;
  y: number;
  size: number;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
}

interface SnowPile {
  x: number;
  width: number;
  height: number;
  targetHeight: number;
  phase: 'forming' | 'holding' | 'dissolving';
  phaseStart: number;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
}

interface TrinitySwoosh {
  active: boolean;
  x: number;
  y: number;
  direction: 'left' | 'right';
  progress: number; // 0 to 1
  startTime: number;
}

type AccumulationPhase = 'forming' | 'holding' | 'dissolving';

// Trinity swoosh happens 25% of the time when snow piles are ready to dissolve
const SWOOSH_CHANCE = 0.25;
const SWOOSH_DURATION = 2000; // 2 seconds for Trinity to swoosh across

const SNOWFLAKE_CHARS = ['*', '+', '.', 'o'];

function getSnowflakeChar(size: number): string {
  if (size < 3) return '.';
  if (size < 5) return '+';
  if (size < 7) return '*';
  return 'o';
}

const SnowfallEngine = memo(function SnowfallEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snowflakesRef = useRef<Snowflake[]>([]);
  const snowPilesRef = useRef<SnowPile[]>([]);
  const splashParticlesRef = useRef<SplashParticle[]>([]);
  const trinitySwooshRef = useRef<TrinitySwoosh>({
    active: false,
    x: 0,
    y: 0,
    direction: 'right',
    progress: 0,
    startTime: 0,
  });
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<AccumulationPhase>('forming');
  const phaseStartRef = useRef<number>(Date.now());
  const lastSpeedChangeRef = useRef<number>(Date.now());
  const currentSpeedRef = useRef<'fast' | 'medium' | 'slow'>('medium');
  const swooshDecidedRef = useRef<boolean>(false);
  
  const { enabled, accumulation, accumulationCycle } = useSeasonalEffect();
  
  // Use centralized config for all timing/performance values
  const snowConfig = getSnowConfig();
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // PERFORMANCE: Use centralized spawn rates from config
  const SPEEDS = {
    fast: { min: 2.5, max: 5, spawnRate: snowConfig.spawnRates.fast },
    medium: { min: 1.2, max: 3, spawnRate: snowConfig.spawnRates.medium },
    slow: { min: 0.4, max: 1.2, spawnRate: snowConfig.spawnRates.slow },
  };
  
  // Use config values with API override fallback
  const cycleDurations = accumulationCycle || {
    formDuration: snowConfig.formDuration,
    holdDuration: snowConfig.holdDuration,
    dissolveDuration: snowConfig.dissolveDuration,
  };
  
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  const initSnowPiles = useCallback(() => {
    if (!accumulation) return;
    
    // Mobile gets larger, more visible snow piles
    const isMobile = dimensions.width < 768;
    const pileCount = Math.floor(dimensions.width / (isMobile ? 80 : 120));
    const piles: SnowPile[] = [];
    
    for (let i = 0; i < pileCount; i++) {
      const x = (i / pileCount) * dimensions.width + Math.random() * 60;
      piles.push({
        x,
        width: isMobile ? 100 + Math.random() * 80 : 80 + Math.random() * 60,
        height: 0,
        // Mobile: shorter snow piles (30-50px), Desktop: minimal (10-25px)
        targetHeight: isMobile ? 30 + Math.random() * 20 : 10 + Math.random() * 15,
        phase: 'forming',
        phaseStart: Date.now(),
      });
    }
    
    snowPilesRef.current = piles;
  }, [dimensions.width, accumulation]);
  
  useEffect(() => {
    initSnowPiles();
  }, [initSnowPiles]);
  
  const createSnowflake = useCallback((): Snowflake => {
    const speed = SPEEDS[currentSpeedRef.current];
    return {
      x: Math.random() * dimensions.width,
      y: -10,
      size: 2 + Math.random() * 6,
      speed: speed.min + Math.random() * (speed.max - speed.min),
      wobble: 0,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      opacity: 0.6 + Math.random() * 0.4,
    };
  }, [dimensions.width]);
  
  // Trigger splash particles at a position
  const createSplashParticles = useCallback((x: number, y: number, count: number = 8) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2); // Upward spray
      const speed = 3 + Math.random() * 5;
      splashParticlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        vy: -Math.sin(angle) * speed,
        size: 2 + Math.random() * 4,
        opacity: 0.8 + Math.random() * 0.2,
        life: 1.0,
      });
    }
  }, []);

  // Start the Trinity swoosh animation
  const startTrinitySwoosh = useCallback(() => {
    const direction = Math.random() > 0.5 ? 'left' : 'right';
    trinitySwooshRef.current = {
      active: true,
      x: direction === 'right' ? -100 : dimensions.width + 100,
      y: dimensions.height - 60,
      direction,
      progress: 0,
      startTime: Date.now(),
    };
    swooshDecidedRef.current = true;
  }, [dimensions]);

  const updatePhase = useCallback(() => {
    const now = Date.now();
    const elapsed = now - phaseStartRef.current;
    
    switch (phaseRef.current) {
      case 'forming':
        swooshDecidedRef.current = false; // Reset swoosh decision for next cycle
        if (elapsed > cycleDurations.formDuration) {
          phaseRef.current = 'holding';
          phaseStartRef.current = now;
        }
        break;
      case 'holding':
        if (elapsed > cycleDurations.holdDuration) {
          // 25% chance to trigger Trinity swoosh instead of normal dissolve
          if (!swooshDecidedRef.current && Math.random() < SWOOSH_CHANCE) {
            startTrinitySwoosh();
          } else {
            swooshDecidedRef.current = true;
          }
          phaseRef.current = 'dissolving';
          phaseStartRef.current = now;
        }
        break;
      case 'dissolving':
        if (elapsed > cycleDurations.dissolveDuration) {
          phaseRef.current = 'forming';
          phaseStartRef.current = now;
          initSnowPiles();
        }
        break;
    }
  }, [cycleDurations, initSnowPiles, startTrinitySwoosh]);
  
  const updateSpeedCycle = useCallback(() => {
    const now = Date.now();
    const { min, max } = snowConfig.speedCycleDuration;
    const speedCycleDuration = min + Math.random() * (max - min);
    
    if (now - lastSpeedChangeRef.current > speedCycleDuration) {
      const speeds: ('fast' | 'medium' | 'slow')[] = ['fast', 'medium', 'slow'];
      const currentIndex = speeds.indexOf(currentSpeedRef.current);
      const nextIndex = (currentIndex + 1) % speeds.length;
      currentSpeedRef.current = speeds[nextIndex];
      lastSpeedChangeRef.current = now;
    }
  }, []);
  
  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    
    // PERFORMANCE: Use config-based max snowflakes
    const isMobile = dimensions.width < 768;
    const baseMax = isMobile ? snowConfig.maxSnowflakes.mobile : snowConfig.maxSnowflakes.desktop;
    const maxSnowflakes = Math.floor(baseMax * snowConfig.intensity);
    
    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      
      updatePhase();
      updateSpeedCycle();
      
      const speed = SPEEDS[currentSpeedRef.current];
      if (snowflakesRef.current.length < maxSnowflakes && Math.random() < speed.spawnRate) {
        snowflakesRef.current.push(createSnowflake());
      }
      
      snowflakesRef.current = snowflakesRef.current.filter(flake => {
        flake.y += flake.speed;
        flake.wobble += flake.wobbleSpeed;
        flake.x += Math.sin(flake.wobble) * 0.5;
        
        if (flake.y > dimensions.height + 10) {
          return false;
        }
        
        ctx.globalAlpha = flake.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${flake.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 3;
        ctx.fillText(getSnowflakeChar(flake.size), flake.x, flake.y);
        ctx.shadowBlur = 0;
        
        return true;
      });
      
      if (accumulation) {
        ctx.globalAlpha = 1;
        
        snowPilesRef.current.forEach(pile => {
          const phase = phaseRef.current;
          const elapsed = Date.now() - phaseStartRef.current;
          
          if (phase === 'forming') {
            const progress = Math.min(1, elapsed / cycleDurations.formDuration);
            pile.height = pile.targetHeight * progress;
          } else if (phase === 'dissolving') {
            const progress = Math.min(1, elapsed / cycleDurations.dissolveDuration);
            pile.height = pile.targetHeight * (1 - progress);
          }
          
          if (pile.height > 1) {
            const gradient = ctx.createLinearGradient(
              pile.x, dimensions.height - pile.height,
              pile.x, dimensions.height
            );
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            gradient.addColorStop(0.3, 'rgba(240, 248, 255, 0.95)');
            gradient.addColorStop(1, 'rgba(220, 235, 250, 1)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(pile.x - pile.width / 2, dimensions.height);
            
            ctx.quadraticCurveTo(
              pile.x - pile.width / 4,
              dimensions.height - pile.height * 0.8,
              pile.x,
              dimensions.height - pile.height
            );
            ctx.quadraticCurveTo(
              pile.x + pile.width / 4,
              dimensions.height - pile.height * 0.8,
              pile.x + pile.width / 2,
              dimensions.height
            );
            
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(200, 220, 240, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
        
        // Update and draw Trinity swoosh
        const swoosh = trinitySwooshRef.current;
        if (swoosh.active) {
          const now = Date.now();
          const elapsed = now - swoosh.startTime;
          swoosh.progress = Math.min(1, elapsed / SWOOSH_DURATION);
          
          // Easing function for smooth motion
          const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const easedProgress = easeInOut(swoosh.progress);
          
          // Calculate Trinity position
          const startX = swoosh.direction === 'right' ? -80 : dimensions.width + 80;
          const endX = swoosh.direction === 'right' ? dimensions.width + 80 : -80;
          swoosh.x = startX + (endX - startX) * easedProgress;
          swoosh.y = dimensions.height - 50;
          
          // Create splash particles where Trinity passes through snow piles
          snowPilesRef.current.forEach(pile => {
            if (pile.height > 5) {
              const pileLeft = pile.x - pile.width / 2;
              const pileRight = pile.x + pile.width / 2;
              if (swoosh.x >= pileLeft && swoosh.x <= pileRight) {
                if (Math.random() < 0.3) { // 30% chance per frame per pile
                  createSplashParticles(swoosh.x, dimensions.height - pile.height, 4);
                }
                // Instantly reduce pile height when Trinity passes
                pile.height = Math.max(0, pile.height - 2);
              }
            }
          });
          
          // Draw Trinity character (cute silhouette)
          ctx.save();
          ctx.globalAlpha = 0.9;
          
          // Motion blur trail
          for (let i = 0; i < 5; i++) {
            const trailX = swoosh.x - (swoosh.direction === 'right' ? 1 : -1) * i * 15;
            const trailAlpha = 0.3 - i * 0.05;
            ctx.globalAlpha = trailAlpha;
            
            // Draw cute mascot silhouette
            ctx.fillStyle = '#38bdf8'; // Sky blue
            ctx.beginPath();
            ctx.arc(trailX, swoosh.y - 20, 18 - i * 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Body
            ctx.fillStyle = '#60a5fa';
            ctx.beginPath();
            ctx.ellipse(trailX, swoosh.y + 5, 15 - i * 2, 20 - i * 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          
          // Main Trinity character
          ctx.globalAlpha = 0.95;
          
          // Glow effect
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 20;
          
          // Head
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(swoosh.x, swoosh.y - 20, 20, 0, Math.PI * 2);
          ctx.fill();
          
          // Eyes (simple dots)
          ctx.fillStyle = '#1e3a5f';
          ctx.beginPath();
          ctx.arc(swoosh.x - 6, swoosh.y - 22, 3, 0, Math.PI * 2);
          ctx.arc(swoosh.x + 6, swoosh.y - 22, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Happy smile
          ctx.strokeStyle = '#1e3a5f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(swoosh.x, swoosh.y - 18, 8, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();
          
          // Body
          ctx.fillStyle = '#60a5fa';
          ctx.beginPath();
          ctx.ellipse(swoosh.x, swoosh.y + 8, 16, 22, 0, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.shadowBlur = 0;
          ctx.restore();
          
          // End swoosh when complete and reset snow piles
          if (swoosh.progress >= 1) {
            swoosh.active = false;
            // Reset snow piles to start fresh after swoosh clears them
            snowPilesRef.current.forEach(pile => {
              pile.height = 0;
            });
            // Force immediate transition to forming phase
            phaseRef.current = 'forming';
            phaseStartRef.current = Date.now();
          }
        }
        
        // Update and draw splash particles (cap at 100 particles to prevent memory bloat)
        if (splashParticlesRef.current.length > 100) {
          splashParticlesRef.current = splashParticlesRef.current.slice(-100);
        }
        splashParticlesRef.current = splashParticlesRef.current.filter(particle => {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.vy += 0.3; // Gravity
          particle.life -= 0.02;
          particle.opacity = particle.life;
          
          if (particle.life <= 0) return false;
          
          ctx.globalAlpha = particle.opacity;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
          
          return true;
        });
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, dimensions, snowConfig.intensity, accumulation, createSnowflake, updatePhase, updateSpeedCycle, cycleDurations, createSplashParticles]);
  
  if (!enabled) return null;
  
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        zIndex: 9998,
      }}
      data-testid="snowfall-canvas"
    />
  );
});

export default SnowfallEngine;
