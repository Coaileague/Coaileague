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
  autoCycle?: boolean;
  cycleInterval?: number;
  idleTimeout?: number;
}

const STATE_MUTATIONS = {
  IDLE: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#FFFFE0',
    animation: 'breathing',
    particleMode: 'gentle',
    scale: 1.0,
    petalLength: 45,
    petalWidth: 8,
    petalSpread: 72,
    coreSize: 8,
    coreGlow: 1.0,
    rotationSpeed: 0,
    ribbonCurve: 35,
  },
  THINKING: {
    primaryColor: '#a855f7',
    secondaryColor: '#FFD700',
    accentColor: '#d8b4fe',
    animation: 'rotating-rings',
    particleMode: 'constellation',
    scale: 1.1,
    petalLength: 40,
    petalWidth: 6,
    petalSpread: 72,
    coreSize: 12,
    coreGlow: 1.5,
    rotationSpeed: 15,
    ribbonCurve: 30,
  },
  ANALYZING: {
    primaryColor: '#6366f1',
    secondaryColor: '#00BFFF',
    accentColor: '#818cf8',
    animation: 'node-pulse',
    particleMode: 'connected-nodes',
    scale: 1.05,
    petalLength: 50,
    petalWidth: 4,
    petalSpread: 60,
    coreSize: 10,
    coreGlow: 2.0,
    rotationSpeed: 5,
    ribbonCurve: 25,
  },
  SEARCHING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#6ee7b7',
    animation: 'spotlight-scan',
    particleMode: 'expanding-rings',
    scale: 1.2,
    petalLength: 55,
    petalWidth: 10,
    petalSpread: 80,
    coreSize: 6,
    coreGlow: 1.8,
    rotationSpeed: 25,
    ribbonCurve: 40,
  },
  SUCCESS: {
    primaryColor: '#FFD700',
    secondaryColor: '#00BFFF',
    accentColor: '#FFFFE0',
    animation: 'bloom',
    particleMode: 'celebration',
    scale: 1.3,
    petalLength: 60,
    petalWidth: 12,
    petalSpread: 90,
    coreSize: 14,
    coreGlow: 2.5,
    rotationSpeed: 0,
    ribbonCurve: 45,
  },
  ERROR: {
    primaryColor: '#ef4444',
    secondaryColor: '#dc2626',
    accentColor: '#fca5a5',
    animation: 'shake',
    particleMode: 'alert',
    scale: 0.85,
    petalLength: 35,
    petalWidth: 10,
    petalSpread: 50,
    coreSize: 5,
    coreGlow: 3.0,
    rotationSpeed: 0,
    ribbonCurve: 20,
  },
  LISTENING: {
    primaryColor: '#fbbf24',
    secondaryColor: '#00BFFF',
    accentColor: '#fcd34d',
    animation: 'waveform',
    particleMode: 'sound-waves',
    scale: 1.1,
    petalLength: 42,
    petalWidth: 7,
    petalSpread: 75,
    coreSize: 10,
    coreGlow: 1.3,
    rotationSpeed: 0,
    ribbonCurve: 38,
  },
  UPLOADING: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#67e8f9',
    animation: 'ascend-spiral',
    particleMode: 'ascending-particles',
    scale: 1.15,
    petalLength: 48,
    petalWidth: 5,
    petalSpread: 65,
    coreSize: 8,
    coreGlow: 1.6,
    rotationSpeed: 30,
    ribbonCurve: 32,
  },
  CELEBRATING: {
    primaryColor: '#FFD700',
    secondaryColor: '#f472b6',
    accentColor: '#fef08a',
    animation: 'bloom',
    particleMode: 'confetti',
    scale: 1.35,
    petalLength: 65,
    petalWidth: 14,
    petalSpread: 100,
    coreSize: 16,
    coreGlow: 3.0,
    rotationSpeed: 10,
    ribbonCurve: 50,
  },
  ADVISING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#a7f3d0',
    animation: 'gentle-orbit',
    particleMode: 'wisdom-aura',
    scale: 1.08,
    petalLength: 44,
    petalWidth: 9,
    petalSpread: 70,
    coreSize: 11,
    coreGlow: 1.4,
    rotationSpeed: 3,
    ribbonCurve: 36,
  },
  HOLIDAY: {
    primaryColor: '#c41e3a',
    secondaryColor: '#165b33',
    accentColor: '#FFD700',
    animation: 'festive-spin',
    particleMode: 'snowfall',
    scale: 1.2,
    petalLength: 50,
    petalWidth: 11,
    petalSpread: 85,
    coreSize: 12,
    coreGlow: 2.2,
    rotationSpeed: 20,
    ribbonCurve: 42,
  },
  GREETING: {
    primaryColor: '#f472b6',
    secondaryColor: '#00BFFF',
    accentColor: '#fbcfe8',
    animation: 'wave',
    particleMode: 'sparkle',
    scale: 1.12,
    petalLength: 46,
    petalWidth: 8,
    petalSpread: 78,
    coreSize: 9,
    coreGlow: 1.5,
    rotationSpeed: 0,
    ribbonCurve: 34,
  },
  CODING: {
    primaryColor: '#34d399',
    secondaryColor: '#00BFFF',
    accentColor: '#a7f3d0',
    animation: 'grid-step',
    particleMode: 'matrix-rain',
    scale: 1.0,
    petalLength: 38,
    petalWidth: 4,
    petalSpread: 55,
    coreSize: 7,
    coreGlow: 1.8,
    rotationSpeed: 0,
    ribbonCurve: 22,
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

const CYCLE_MODES: MascotMode[] = [
  'IDLE', 'THINKING', 'ANALYZING', 'SEARCHING', 'SUCCESS', 
  'LISTENING', 'UPLOADING', 'CELEBRATING', 'ADVISING', 'CODING'
];

const TrinityRedesign = memo(function TrinityRedesign({
  mode = 'IDLE',
  size = 120,
  mini = false,
  className = '',
  autoCycle = false,
  cycleInterval = 2000,
  idleTimeout = 0,
}: TrinityRedesignProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef<number>(0);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [isUserIdle, setIsUserIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  
  useEffect(() => {
    if (idleTimeout <= 0) return;
    
    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
      setIsUserIdle(false);
      
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      
      idleTimerRef.current = setTimeout(() => {
        setIsUserIdle(true);
      }, idleTimeout);
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
  const activeMode = shouldCycle ? CYCLE_MODES[cycleIndex] : mode;
  const mutation = STATE_MUTATIONS[activeMode as keyof typeof STATE_MUTATIONS] || STATE_MUTATIONS.IDLE;
  
  useEffect(() => {
    if (!shouldCycle) return;
    const interval = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % CYCLE_MODES.length);
    }, cycleInterval);
    return () => clearInterval(interval);
  }, [shouldCycle, cycleInterval]);
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

      {/* Five-pointed interwoven ribbon mascot */}
      <g style={{ animation: `${mutation.animation} 2s ease-in-out infinite` }}>
        <defs>
          <linearGradient id="tealRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#007acc" />
            <stop offset="30%" stopColor="#00BFFF" />
            <stop offset="70%" stopColor="#4dd4ff" />
            <stop offset="100%" stopColor="#007acc" />
          </linearGradient>
          <linearGradient id="goldRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#cc9900" />
            <stop offset="30%" stopColor="#FFD700" />
            <stop offset="70%" stopColor="#ffe44d" />
            <stop offset="100%" stopColor="#cc9900" />
          </linearGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="30%" stopColor="#FFFFE0" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#FFD700" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00BFFF" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Outer glow aura */}
        <circle
          cx={centerX}
          cy={centerY}
          r={displaySize / 2.5}
          fill="url(#coreGlow)"
          opacity="0.3"
        />

        {/* Five interwoven ribbon petals - physical mutations based on state */}
        <g 
          transform={`translate(${centerX}, ${centerY}) scale(${mutation.scale * 0.6})`} 
          filter="url(#glow)"
          style={{ 
            transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            transformOrigin: 'center',
          }}
        >
          {/* Dynamic rotation wrapper for spinning states */}
          <g style={{ 
            animation: mutation.rotationSpeed > 0 ? `rotating-rings ${60 / mutation.rotationSpeed}s linear infinite` : 'none'
          }}>
            {/* Back layer ribbons (odd indices: 1, 3) - secondary color */}
            {[1, 3].map((i) => {
              const w = mutation.petalWidth;
              const h = mutation.petalLength;
              const curve = mutation.ribbonCurve;
              const rotate = i * mutation.petalSpread - 90;
              return (
                <g key={`back-${i}`} transform={`rotate(${rotate})`}>
                  <path
                    d={`M ${-w} 0 
                        C ${-w * 1.5} ${-h * 0.45}, ${-w * 0.75} ${-h * 0.78}, 0 ${-h} 
                        C ${w * 0.75} ${-h * 0.78}, ${w * 1.5} ${-h * 0.45}, ${w} 0 
                        C ${w * 0.5} ${curve * 0.14}, ${-w * 0.5} ${curve * 0.14}, ${-w} 0`}
                    fill={mutation.primaryColor}
                    stroke={mutation.primaryColor}
                    strokeWidth="0.5"
                    opacity="0.95"
                    style={{ transition: 'all 0.6s ease-out' }}
                  />
                </g>
              );
            })}

            {/* Center weave ring - size based on coreSize */}
            <circle 
              cx="0" cy="0" 
              r={mutation.coreSize * 2.2} 
              fill="none" 
              stroke={mutation.secondaryColor} 
              strokeWidth={mutation.petalWidth * 0.8} 
              opacity="0.4"
              style={{ transition: 'all 0.6s ease-out' }}
            />
            <circle 
              cx="0" cy="0" 
              r={mutation.coreSize * 2.2} 
              fill="none" 
              stroke={mutation.primaryColor} 
              strokeWidth={mutation.petalWidth * 0.4} 
              strokeDasharray={`${mutation.coreSize * 2.5} ${mutation.coreSize * 2.5}`}
              opacity="0.6"
              style={{ transition: 'all 0.6s ease-out' }}
            />

            {/* Front layer ribbons (even indices: 0, 2, 4) - secondary color */}
            {[0, 2, 4].map((i) => {
              const w = mutation.petalWidth;
              const h = mutation.petalLength;
              const curve = mutation.ribbonCurve;
              const rotate = i * mutation.petalSpread - 90;
              return (
                <g key={`front-${i}`} transform={`rotate(${rotate})`}>
                  <path
                    d={`M ${-w} 0 
                        C ${-w * 1.5} ${-h * 0.45}, ${-w * 0.75} ${-h * 0.78}, 0 ${-h} 
                        C ${w * 0.75} ${-h * 0.78}, ${w * 1.5} ${-h * 0.45}, ${w} 0 
                        C ${w * 0.5} ${curve * 0.14}, ${-w * 0.5} ${curve * 0.14}, ${-w} 0`}
                    fill={mutation.secondaryColor}
                    stroke={mutation.secondaryColor}
                    strokeWidth="0.5"
                    opacity="0.95"
                    style={{ transition: 'all 0.6s ease-out' }}
                  />
                </g>
              );
            })}
          </g>

          {/* Central glowing crystal core - size based on coreSize */}
          <polygon
            points={`0,${-mutation.coreSize * 1.5} ${mutation.coreSize * 1.25},${-mutation.coreSize * 0.5} ${mutation.coreSize * 0.75},${mutation.coreSize * 1.25} ${-mutation.coreSize * 0.75},${mutation.coreSize * 1.25} ${-mutation.coreSize * 1.25},${-mutation.coreSize * 0.5}`}
            fill="url(#coreGlow)"
            stroke={mutation.accentColor}
            strokeWidth="1"
            opacity="0.9"
            style={{ 
              transition: 'all 0.6s ease-out',
              filter: `drop-shadow(0 0 ${mutation.coreGlow * 4}px ${mutation.accentColor})`
            }}
          />
          
          {/* Inner core highlight - pulses with coreGlow */}
          <circle 
            cx={-mutation.coreSize * 0.4} 
            cy={-mutation.coreSize * 0.5} 
            r={mutation.coreSize * 0.5} 
            fill="white" 
            opacity={0.6 + mutation.coreGlow * 0.1}
            style={{ transition: 'all 0.6s ease-out' }}
          />
          <circle 
            cx="0" cy="0" 
            r={mutation.coreSize} 
            fill="white" 
            opacity={0.2 + mutation.coreGlow * 0.05}
            style={{ transition: 'all 0.6s ease-out' }}
          />
        </g>

        {/* Circuit/data lines extending outward */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i * 45) * Math.PI / 180;
          const startR = displaySize / 4;
          const endR = displaySize / 2.2;
          return (
            <line
              key={`circuit-${i}`}
              x1={centerX + Math.cos(angle) * startR}
              y1={centerY + Math.sin(angle) * startR}
              x2={centerX + Math.cos(angle) * endR}
              y2={centerY + Math.sin(angle) * endR}
              stroke={i % 2 === 0 ? '#00BFFF' : '#FFD700'}
              strokeWidth="1"
              strokeDasharray="3,5"
              opacity="0.4"
            />
          );
        })}
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
          {activeMode}
        </text>
      )}
    </svg>
  );
});

export default TrinityRedesign;
