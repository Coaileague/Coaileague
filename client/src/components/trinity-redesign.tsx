/**
 * Trinity Redesigned - Enhanced Polished Mascot
 * 
 * A beautiful, smooth SVG-based mascot with:
 * - Liquid SVG morphing between states
 * - Particle effects and auras
 * - Smooth color transitions
 * - State-based visual mutations
 * - Gemini connection maintained
 * 
 * States with visual mutations:
 * - IDLE: Gentle breathing, warm glow
 * - THINKING: Rotating rings, contemplative aura
 * - ANALYZING: Connected nodes, data flow
 * - SEARCHING: Spotlight scan, expanding rings
 * - SUCCESS: Bloom effect, celebration particles
 * - ERROR: Shake, red warning aura
 * - LISTENING: Waveform response, color pulse
 * - UPLOADING: Ascending particles, spiral motion
 */

import { useState, useEffect, useRef, memo } from 'react';
import type { MascotMode } from '@/config/mascotConfig';

interface TrinityRedesignProps {
  mode?: MascotMode;
  size?: number;
  mini?: boolean;
  className?: string;
}

const STATE_MUTATIONS = {
  IDLE: {
    primaryColor: '#38bdf8',
    secondaryColor: '#0ea5e9',
    accentColor: '#06b6d4',
    animation: 'breathing',
    particleMode: 'gentle',
    scale: 1.0,
  },
  THINKING: {
    primaryColor: '#a855f7',
    secondaryColor: '#7c3aed',
    accentColor: '#d8b4fe',
    animation: 'rotating-rings',
    particleMode: 'constellation',
    scale: 1.2,
  },
  ANALYZING: {
    primaryColor: '#6366f1',
    secondaryColor: '#4f46e5',
    accentColor: '#818cf8',
    animation: 'node-pulse',
    particleMode: 'connected-nodes',
    scale: 1.15,
  },
  SEARCHING: {
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    accentColor: '#6ee7b7',
    animation: 'spotlight-scan',
    particleMode: 'expanding-rings',
    scale: 1.25,
  },
  SUCCESS: {
    primaryColor: '#f472b6',
    secondaryColor: '#ec4899',
    accentColor: '#fbcfe8',
    animation: 'bloom',
    particleMode: 'celebration',
    scale: 1.3,
  },
  ERROR: {
    primaryColor: '#ef4444',
    secondaryColor: '#dc2626',
    accentColor: '#fca5a5',
    animation: 'shake',
    particleMode: 'alert',
    scale: 0.9,
  },
  LISTENING: {
    primaryColor: '#fbbf24',
    secondaryColor: '#f59e0b',
    accentColor: '#fcd34d',
    animation: 'waveform',
    particleMode: 'sound-waves',
    scale: 1.1,
  },
  UPLOADING: {
    primaryColor: '#06b6d4',
    secondaryColor: '#0891b2',
    accentColor: '#67e8f9',
    animation: 'ascend-spiral',
    particleMode: 'ascending-particles',
    scale: 1.2,
  },
  CELEBRATING: {
    primaryColor: '#fbbf24',
    secondaryColor: '#fcd34d',
    accentColor: '#fef08a',
    animation: 'bloom',
    particleMode: 'confetti',
    scale: 1.25,
  },
  ADVISING: {
    primaryColor: '#10b981',
    secondaryColor: '#34d399',
    accentColor: '#a7f3d0',
    animation: 'gentle-orbit',
    particleMode: 'wisdom-aura',
    scale: 1.1,
  },
  HOLIDAY: {
    primaryColor: '#c41e3a',
    secondaryColor: '#165b33',
    accentColor: '#ffd700',
    animation: 'festive-spin',
    particleMode: 'snowfall',
    scale: 1.2,
  },
  GREETING: {
    primaryColor: '#f472b6',
    secondaryColor: '#ec4899',
    accentColor: '#fbcfe8',
    animation: 'wave',
    particleMode: 'sparkle',
    scale: 1.15,
  },
  CODING: {
    primaryColor: '#34d399',
    secondaryColor: '#10b981',
    accentColor: '#a7f3d0',
    animation: 'grid-step',
    particleMode: 'matrix-rain',
    scale: 1.1,
  },
};

type ParticleType = 'circle' | 'sparkle' | 'square' | 'line';

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  type: ParticleType;
  color: string;
  size: number;
}

const TrinityRedesign = memo(function TrinityRedesign({
  mode = 'IDLE',
  size = 120,
  mini = false,
  className = '',
}: TrinityRedesignProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef<number>(0);
  
  const mutation = STATE_MUTATIONS[mode as keyof typeof STATE_MUTATIONS] || STATE_MUTATIONS.IDLE;
  const displaySize = mini ? size * 0.8 : size;
  const centerX = displaySize / 2;
  const centerY = displaySize / 2;

  // Particle generation based on mode
  const generateParticles = (
    mode: string,
    count: number = 2,
    particleMode: string
  ) => {
    const particles: Particle[] = [];
    const colors = [mutation.primaryColor, mutation.accentColor, mutation.secondaryColor];

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const distance = 30 + Math.random() * 20;
      
      let particle: Particle;

      switch (particleMode) {
        case 'celebration':
          particle = {
            id: `${mode}-${Date.now()}-${i}`,
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3 - 1,
            life: 1,
            type: Math.random() > 0.5 ? 'sparkle' : 'circle',
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 2 + Math.random() * 3,
          };
          break;
          
        case 'expanding-rings':
          particle = {
            id: `${mode}-${Date.now()}-${i}`,
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * 0.5,
            vy: Math.sin(angle) * 0.5,
            life: 1,
            type: 'circle',
            color: mutation.accentColor,
            size: 1,
          };
          break;
          
        case 'ascending-particles':
          particle = {
            id: `${mode}-${Date.now()}-${i}`,
            x: centerX + (Math.random() - 0.5) * 30,
            y: centerY,
            vx: 0,
            vy: -1.5 - Math.random() * 1,
            life: 1,
            type: 'sparkle',
            color: colors[i % colors.length],
            size: 2,
          };
          break;
          
        case 'snowfall':
          particle = {
            id: `${mode}-${Date.now()}-${i}`,
            x: centerX + (Math.random() - 0.5) * 40,
            y: centerY - 30,
            vx: Math.sin(Date.now() / 100 + i) * 0.5,
            vy: 0.5,
            life: 1,
            type: 'circle',
            color: '#ffffff',
            size: 1.5,
          };
          break;
          
        default:
          particle = {
            id: `${mode}-${Date.now()}-${i}`,
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 1,
            type: 'sparkle',
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 2,
          };
      }

      particles.push(particle);
    }

    return particles;
  };

  // Update particles
  const updateParticles = (deltaTime: number) => {
    const particles = particlesRef.current;
    
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      
      p.x += p.vx;
      p.y += p.vy;
      p.life -= deltaTime / 1000;
      
      if (mutation.particleMode === 'sound-waves') {
        p.vy -= 0.1; // Upward drift
      } else if (mutation.particleMode === 'ascending-particles') {
        p.vy -= 0.05; // Gentle ascent
      }
      
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
    
    // Add new particles periodically
    if (timeRef.current % 5 === 0) {
      const newParticles = generateParticles(mode, 1, mutation.particleMode);
      particlesRef.current.push(...newParticles);
    }
  };

  // Animation loop
  useEffect(() => {
    const svg = containerRef.current;
    if (!svg) return;

    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = now - lastTime;
      lastTime = now;
      timeRef.current += deltaTime;

      updateParticles(deltaTime);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [mode, mutation.particleMode]);

  // Render particle
  const renderParticle = (particle: Particle) => {
    const opacity = Math.max(0, particle.life);
    
    switch (particle.type) {
      case 'sparkle':
        return (
          <g
            key={particle.id}
            opacity={opacity}
            style={{
              transform: `translate(${particle.x}px, ${particle.y}px)`,
              transformOrigin: '0 0',
            }}
          >
            <circle r={particle.size} fill={particle.color} />
            <circle
              r={particle.size * 0.5}
              fill={particle.color}
              opacity={0.5}
              style={{ animation: 'pulse 1s infinite' }}
            />
          </g>
        );
      case 'circle':
        return (
          <circle
            key={particle.id}
            cx={particle.x}
            cy={particle.y}
            r={particle.size}
            fill={particle.color}
            opacity={opacity}
          />
        );
      case 'square':
        return (
          <rect
            key={particle.id}
            x={particle.x - particle.size}
            y={particle.y - particle.size}
            width={particle.size * 2}
            height={particle.size * 2}
            fill={particle.color}
            opacity={opacity}
          />
        );
      case 'line':
        return (
          <line
            key={particle.id}
            x1={particle.x}
            y1={particle.y}
            x2={particle.x + particle.vx * 5}
            y2={particle.y + particle.vy * 5}
            stroke={particle.color}
            strokeWidth="1"
            opacity={opacity}
          />
        );
      default:
        return null;
    }
  };

  return (
    <svg
      ref={containerRef}
      width={displaySize}
      height={displaySize}
      viewBox={`0 0 ${displaySize} ${displaySize}`}
      className={`transition-all duration-300 ${className}`}
      style={{
        filter: mode === 'ERROR' ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.5))' : 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2))',
      }}
    >
      <defs>
        <style>{`
          @keyframes breathing {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes rotating-rings {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes spotlight-scan {
            0% { cx: ${centerX - 20}; }
            50% { cx: ${centerX + 20}; }
            100% { cx: ${centerX - 20}; }
          }
          @keyframes bloom {
            0% { r: 15; opacity: 0.8; }
            100% { r: 25; opacity: 0; }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-2px); }
            75% { transform: translateX(2px); }
          }
          @keyframes waveform {
            0%, 100% { cy: ${centerY}; }
            50% { cy: ${centerY - 3}; }
          }
          @keyframes ascend-spiral {
            0% { transform: translateY(0) rotate(0deg); }
            100% { transform: translateY(-40px) rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>
      </defs>

      {/* Background aura glow */}
      <circle
        cx={centerX}
        cy={centerY}
        r={displaySize / 2 - 5}
        fill={mutation.accentColor}
        opacity="0.1"
      />

      {/* Animated ring (varies by state) */}
      {mutation.animation === 'rotating-rings' && (
        <circle
          cx={centerX}
          cy={centerY}
          r={displaySize / 3}
          fill="none"
          stroke={mutation.accentColor}
          strokeWidth="2"
          opacity="0.5"
          style={{ animation: 'rotating-rings 3s linear infinite' }}
        />
      )}

      {/* Main mascot body with morphing shape */}
      <g style={{ animation: `${mutation.animation} 2s ease-in-out infinite` }}>
        {/* Outer ring */}
        <circle
          cx={centerX}
          cy={centerY}
          r={displaySize / 3}
          fill={mutation.primaryColor}
          opacity="0.2"
        />

        {/* Core shape - morphs based on state */}
        <g transform={`translate(${centerX}, ${centerY}) scale(${mutation.scale})`}>
          {/* Smooth blob using multiple circles */}
          <circle cx="0" cy="0" r="12" fill={mutation.primaryColor} />
          <circle cx="8" cy="0" r="10" fill={mutation.primaryColor} opacity="0.8" />
          <circle cx="-8" cy="0" r="10" fill={mutation.primaryColor} opacity="0.8" />
          <circle cx="0" cy="8" r="10" fill={mutation.secondaryColor} opacity="0.8" />
          <circle cx="0" cy="-8" r="10" fill={mutation.secondaryColor} opacity="0.8" />

          {/* Accent highlights */}
          <circle cx="6" cy="-6" r="3" fill={mutation.accentColor} opacity="0.6" />
          <circle cx="-6" cy="6" r="3" fill={mutation.accentColor} opacity="0.4" />
        </g>

        {/* Eyes/detail for personality */}
        <circle cx={centerX - 8} cy={centerY - 5} r="2" fill="white" opacity="0.8" />
        <circle cx={centerX + 8} cy={centerY - 5} r="2" fill="white" opacity="0.8" />
      </g>

      {/* Particle effects */}
      {particlesRef.current.map(renderParticle)}

      {/* Mode indicator - subtle label */}
      {!mini && (
        <text
          x={centerX}
          y={displaySize - 8}
          textAnchor="middle"
          fontSize="10"
          fill={mutation.primaryColor}
          opacity="0.6"
          fontFamily="system-ui, sans-serif"
          fontWeight="600"
        >
          {mode}
        </text>
      )}
    </svg>
  );
});

export default TrinityRedesign;
