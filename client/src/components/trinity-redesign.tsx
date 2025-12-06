/**
 * Trinity Redesigned - Universal Responsive Mascot
 * 
 * A polished, smooth SVG-based mascot with:
 * - Fixed viewBox (0 0 200 200) for consistent scaling at any size
 * - CSS transitions for smooth state morphing
 * - Responsive container sizing for mobile/desktop
 * - State-based visual mutations with tweened interpolation
 * - Unified rendering for demo and live modes
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
 */

import { useState, useEffect, useRef, memo, useMemo } from 'react';
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

// Fixed viewBox dimensions - all coordinates relative to this
const VIEWBOX_SIZE = 200;
const CENTER = VIEWBOX_SIZE / 2;

// Transition duration for smooth morphing
const TRANSITION_DURATION = '0.8s';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

const STATE_MUTATIONS = {
  IDLE: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#FFFFE0',
    animation: 'breathing',
    scale: 1.0,
    petalLength: 70,
    petalWidth: 12,
    petalSpread: 72,
    coreSize: 14,
    coreGlow: 4,
    rotationSpeed: 0,
  },
  THINKING: {
    primaryColor: '#a855f7',
    secondaryColor: '#FFD700',
    accentColor: '#d8b4fe',
    animation: 'rotating-rings',
    scale: 1.05,
    petalLength: 65,
    petalWidth: 10,
    petalSpread: 72,
    coreSize: 18,
    coreGlow: 6,
    rotationSpeed: 15,
  },
  ANALYZING: {
    primaryColor: '#6366f1',
    secondaryColor: '#00BFFF',
    accentColor: '#818cf8',
    animation: 'node-pulse',
    scale: 1.0,
    petalLength: 75,
    petalWidth: 6,
    petalSpread: 60,
    coreSize: 16,
    coreGlow: 8,
    rotationSpeed: 5,
  },
  SEARCHING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#6ee7b7',
    animation: 'spotlight-scan',
    scale: 1.1,
    petalLength: 80,
    petalWidth: 14,
    petalSpread: 80,
    coreSize: 12,
    coreGlow: 7,
    rotationSpeed: 25,
  },
  SUCCESS: {
    primaryColor: '#FFD700',
    secondaryColor: '#00BFFF',
    accentColor: '#FFFFE0',
    animation: 'bloom',
    scale: 1.15,
    petalLength: 85,
    petalWidth: 16,
    petalSpread: 90,
    coreSize: 20,
    coreGlow: 10,
    rotationSpeed: 0,
  },
  ERROR: {
    primaryColor: '#ef4444',
    secondaryColor: '#dc2626',
    accentColor: '#fca5a5',
    animation: 'shake',
    scale: 0.9,
    petalLength: 55,
    petalWidth: 14,
    petalSpread: 50,
    coreSize: 10,
    coreGlow: 12,
    rotationSpeed: 0,
  },
  LISTENING: {
    primaryColor: '#fbbf24',
    secondaryColor: '#00BFFF',
    accentColor: '#fcd34d',
    animation: 'waveform',
    scale: 1.05,
    petalLength: 68,
    petalWidth: 11,
    petalSpread: 75,
    coreSize: 16,
    coreGlow: 5,
    rotationSpeed: 0,
  },
  UPLOADING: {
    primaryColor: '#00BFFF',
    secondaryColor: '#FFD700',
    accentColor: '#67e8f9',
    animation: 'ascend-spiral',
    scale: 1.08,
    petalLength: 72,
    petalWidth: 8,
    petalSpread: 65,
    coreSize: 14,
    coreGlow: 6,
    rotationSpeed: 30,
  },
  CELEBRATING: {
    primaryColor: '#FFD700',
    secondaryColor: '#f472b6',
    accentColor: '#fef08a',
    animation: 'bloom',
    scale: 1.2,
    petalLength: 90,
    petalWidth: 18,
    petalSpread: 100,
    coreSize: 22,
    coreGlow: 12,
    rotationSpeed: 10,
  },
  ADVISING: {
    primaryColor: '#10b981',
    secondaryColor: '#FFD700',
    accentColor: '#a7f3d0',
    animation: 'gentle-orbit',
    scale: 1.02,
    petalLength: 70,
    petalWidth: 13,
    petalSpread: 70,
    coreSize: 17,
    coreGlow: 5,
    rotationSpeed: 3,
  },
  HOLIDAY: {
    primaryColor: '#c41e3a',
    secondaryColor: '#165b33',
    accentColor: '#FFD700',
    animation: 'festive-spin',
    scale: 1.1,
    petalLength: 75,
    petalWidth: 15,
    petalSpread: 85,
    coreSize: 18,
    coreGlow: 9,
    rotationSpeed: 20,
  },
  GREETING: {
    primaryColor: '#f472b6',
    secondaryColor: '#00BFFF',
    accentColor: '#fbcfe8',
    animation: 'wave',
    scale: 1.06,
    petalLength: 72,
    petalWidth: 12,
    petalSpread: 78,
    coreSize: 15,
    coreGlow: 6,
    rotationSpeed: 0,
  },
  CODING: {
    primaryColor: '#34d399',
    secondaryColor: '#00BFFF',
    accentColor: '#a7f3d0',
    animation: 'grid-step',
    scale: 0.98,
    petalLength: 60,
    petalWidth: 6,
    petalSpread: 55,
    coreSize: 12,
    coreGlow: 7,
    rotationSpeed: 0,
  },
};

const CYCLE_MODES: MascotMode[] = [
  'IDLE', 'THINKING', 'ANALYZING', 'SEARCHING', 'SUCCESS', 
  'LISTENING', 'UPLOADING', 'CELEBRATING', 'ADVISING', 'CODING'
];

// Responsive size presets
const RESPONSIVE_SIZES = {
  mobile: 80,
  tablet: 100,
  desktop: 120,
  demo: 180,
};

const TrinityRedesign = memo(function TrinityRedesign({
  mode = 'IDLE',
  size = 'responsive',
  mini = false,
  className = '',
  autoCycle = false,
  cycleInterval = 2500,
  idleTimeout = 0,
}: TrinityRedesignProps) {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [isUserIdle, setIsUserIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Idle detection
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
  
  // Auto-cycling
  const shouldCycle = autoCycle || (idleTimeout > 0 && isUserIdle);
  
  useEffect(() => {
    if (!shouldCycle) return;
    const interval = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % CYCLE_MODES.length);
    }, cycleInterval);
    return () => clearInterval(interval);
  }, [shouldCycle, cycleInterval]);
  
  // Determine active mode
  const activeMode = shouldCycle ? CYCLE_MODES[cycleIndex] : mode;
  const mutation = STATE_MUTATIONS[activeMode as keyof typeof STATE_MUTATIONS] || STATE_MUTATIONS.IDLE;
  
  // Calculate responsive size with resize listener
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
  
  // Generate petal path for given parameters
  const generatePetalPath = (w: number, h: number) => {
    return `M ${-w} 0 
            C ${-w * 1.3} ${-h * 0.4}, ${-w * 0.6} ${-h * 0.75}, 0 ${-h} 
            C ${w * 0.6} ${-h * 0.75}, ${w * 1.3} ${-h * 0.4}, ${w} 0 
            C ${w * 0.4} ${h * 0.12}, ${-w * 0.4} ${h * 0.12}, ${-w} 0`;
  };
  
  // CSS transition style for smooth morphing
  const transitionStyle = {
    transition: `all ${TRANSITION_DURATION} ${TRANSITION_EASING}`,
  };
  
  // Animation keyframes based on current state
  const animationStyle = useMemo(() => {
    const rotationDuration = mutation.rotationSpeed > 0 ? `${60 / mutation.rotationSpeed}s` : '0s';
    return {
      animation: mutation.rotationSpeed > 0 
        ? `trinity-rotate ${rotationDuration} linear infinite` 
        : mutation.animation === 'breathing' 
          ? 'trinity-breathe 3s ease-in-out infinite'
          : mutation.animation === 'shake'
            ? 'trinity-shake 0.5s ease-in-out infinite'
            : 'none',
    };
  }, [mutation.rotationSpeed, mutation.animation]);

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
      <style>{`
        @keyframes trinity-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes trinity-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes trinity-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        @keyframes trinity-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
      
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          overflow: 'visible',
          filter: `drop-shadow(0 0 ${mutation.coreGlow * 2}px ${mutation.accentColor})`,
          ...transitionStyle,
        }}
      >
        <defs>
          {/* Primary ribbon gradient */}
          <linearGradient id="trinity-primary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={mutation.primaryColor} stopOpacity="0.9">
              <animate attributeName="stop-color" values={`${mutation.primaryColor};${mutation.accentColor};${mutation.primaryColor}`} dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor={mutation.primaryColor} />
            <stop offset="100%" stopColor={mutation.primaryColor} stopOpacity="0.9" />
          </linearGradient>
          
          {/* Secondary ribbon gradient */}
          <linearGradient id="trinity-secondary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={mutation.secondaryColor} stopOpacity="0.9" />
            <stop offset="50%" stopColor={mutation.secondaryColor} />
            <stop offset="100%" stopColor={mutation.secondaryColor} stopOpacity="0.9" />
          </linearGradient>
          
          {/* Core radial glow */}
          <radialGradient id="trinity-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="30%" stopColor="#FFFFE0" stopOpacity="0.9" />
            <stop offset="60%" stopColor={mutation.accentColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={mutation.primaryColor} stopOpacity="0" />
          </radialGradient>
          
          {/* Glow filter */}
          <filter id="trinity-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Outer aura glow */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={mutation.petalLength * 1.1}
          fill="url(#trinity-core)"
          opacity="0.2"
          style={transitionStyle}
        />
        
        {/* Main mascot group with scale transform */}
        <g 
          transform={`translate(${CENTER}, ${CENTER}) scale(${mutation.scale})`}
          filter="url(#trinity-glow)"
          style={transitionStyle}
        >
          {/* Rotating wrapper for spinning states */}
          <g style={animationStyle}>
            {/* Back layer petals (indices 1, 3) - primary color */}
            {[1, 3].map((i) => {
              const rotate = i * mutation.petalSpread - 90;
              return (
                <g key={`back-${i}`} transform={`rotate(${rotate})`}>
                  <path
                    d={generatePetalPath(mutation.petalWidth, mutation.petalLength)}
                    fill="url(#trinity-primary)"
                    stroke={mutation.primaryColor}
                    strokeWidth="0.5"
                    opacity="0.95"
                    style={transitionStyle}
                  />
                </g>
              );
            })}
            
            {/* Center weave ring */}
            <circle 
              cx="0" cy="0" 
              r={mutation.coreSize * 1.8} 
              fill="none" 
              stroke="url(#trinity-secondary)" 
              strokeWidth={mutation.petalWidth * 0.6} 
              opacity="0.4"
              style={transitionStyle}
            />
            <circle 
              cx="0" cy="0" 
              r={mutation.coreSize * 1.8} 
              fill="none" 
              stroke="url(#trinity-primary)" 
              strokeWidth={mutation.petalWidth * 0.3} 
              strokeDasharray={`${mutation.coreSize * 2} ${mutation.coreSize * 2}`}
              opacity="0.6"
              style={transitionStyle}
            />
            
            {/* Front layer petals (indices 0, 2, 4) - secondary color */}
            {[0, 2, 4].map((i) => {
              const rotate = i * mutation.petalSpread - 90;
              return (
                <g key={`front-${i}`} transform={`rotate(${rotate})`}>
                  <path
                    d={generatePetalPath(mutation.petalWidth, mutation.petalLength)}
                    fill="url(#trinity-secondary)"
                    stroke={mutation.secondaryColor}
                    strokeWidth="0.5"
                    opacity="0.95"
                    style={transitionStyle}
                  />
                </g>
              );
            })}
          </g>
          
          {/* Central glowing crystal core */}
          <polygon
            points={`0,${-mutation.coreSize * 1.2} ${mutation.coreSize},${-mutation.coreSize * 0.4} ${mutation.coreSize * 0.6},${mutation.coreSize} ${-mutation.coreSize * 0.6},${mutation.coreSize} ${-mutation.coreSize},${-mutation.coreSize * 0.4}`}
            fill="url(#trinity-core)"
            stroke={mutation.accentColor}
            strokeWidth="1"
            opacity="0.95"
            style={{
              ...transitionStyle,
              filter: `drop-shadow(0 0 ${mutation.coreGlow}px ${mutation.accentColor})`,
            }}
          />
          
          {/* Inner core highlights */}
          <circle 
            cx={-mutation.coreSize * 0.3} 
            cy={-mutation.coreSize * 0.4} 
            r={mutation.coreSize * 0.4} 
            fill="white" 
            opacity="0.8"
            style={transitionStyle}
          />
          <circle 
            cx="0" cy="0" 
            r={mutation.coreSize * 0.7} 
            fill="white" 
            opacity="0.25"
            style={{ ...transitionStyle, animation: 'trinity-pulse 2s ease-in-out infinite' }}
          />
        </g>
        
        {/* Mode label (only when not mini) */}
        {!mini && (
          <text
            x={CENTER}
            y={VIEWBOX_SIZE - 10}
            textAnchor="middle"
            fontSize="12"
            fill={mutation.primaryColor}
            opacity="0.7"
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
            style={transitionStyle}
          >
            {activeMode}
          </text>
        )}
      </svg>
    </div>
  );
});

export default TrinityRedesign;
