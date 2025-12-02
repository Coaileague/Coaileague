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

type AccumulationPhase = 'forming' | 'holding' | 'dissolving';

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
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<AccumulationPhase>('forming');
  const phaseStartRef = useRef<number>(Date.now());
  const lastSpeedChangeRef = useRef<number>(Date.now());
  const currentSpeedRef = useRef<'fast' | 'medium' | 'slow'>('medium');
  
  const { enabled, intensity, accumulation, accumulationCycle } = useSeasonalEffect();
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const SPEEDS = {
    fast: { min: 3, max: 6, spawnRate: 0.4 },
    medium: { min: 1.5, max: 3.5, spawnRate: 0.25 },
    slow: { min: 0.5, max: 1.5, spawnRate: 0.15 },
  };
  
  const cycleDurations = accumulationCycle || {
    formDuration: 15000,
    holdDuration: 8000,
    dissolveDuration: 5000,
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
    
    const pileCount = Math.floor(dimensions.width / 120);
    const piles: SnowPile[] = [];
    
    for (let i = 0; i < pileCount; i++) {
      const x = (i / pileCount) * dimensions.width + Math.random() * 60;
      piles.push({
        x,
        width: 80 + Math.random() * 60,
        height: 0,
        targetHeight: 20 + Math.random() * 40,
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
  
  const updatePhase = useCallback(() => {
    const now = Date.now();
    const elapsed = now - phaseStartRef.current;
    
    switch (phaseRef.current) {
      case 'forming':
        if (elapsed > cycleDurations.formDuration) {
          phaseRef.current = 'holding';
          phaseStartRef.current = now;
        }
        break;
      case 'holding':
        if (elapsed > cycleDurations.holdDuration) {
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
  }, [cycleDurations, initSnowPiles]);
  
  const updateSpeedCycle = useCallback(() => {
    const now = Date.now();
    const speedCycleDuration = 8000 + Math.random() * 12000;
    
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
    
    const maxSnowflakes = Math.floor(150 * intensity);
    
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
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, dimensions, intensity, accumulation, createSnowflake, updatePhase, updateSpeedCycle, cycleDurations]);
  
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
