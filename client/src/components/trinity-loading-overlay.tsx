/**
 * Trinity Loading Overlay - Animated loading state with Trinity branding
 * 
 * Features:
 * - Animated Trinity logo with pulsing/rotating effects
 * - Customizable loading messages
 * - Full-screen overlay or inline placement
 * - Smooth fade transitions
 */

import { useEffect, useState, memo } from 'react';
import { cn } from '@/lib/utils';

interface TrinityLoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  subMessage?: string;
  variant?: 'fullscreen' | 'inline' | 'card';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LOADING_MESSAGES = [
  "Trinity is thinking...",
  "Analyzing your request...",
  "Processing data...",
  "Almost there...",
  "Optimizing results...",
];

function AnimatedTrinityLogo({ size = 80, isAnimating = true }: { size?: number; isAnimating?: boolean }) {
  const [rotation, setRotation] = useState(0);
  const [pulse, setPulse] = useState(1);

  useEffect(() => {
    if (!isAnimating) return;
    
    const rotationInterval = setInterval(() => {
      setRotation(r => (r + 2) % 360);
    }, 50);

    const pulseInterval = setInterval(() => {
      setPulse(p => 0.85 + Math.sin(Date.now() / 500) * 0.15);
    }, 50);

    return () => {
      clearInterval(rotationInterval);
      clearInterval(pulseInterval);
    };
  }, [isAnimating]);

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100"
      style={{ transform: `scale(${pulse})` }}
      className="transition-transform"
    >
      <defs>
        <radialGradient id="loadingCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFE0">
            <animate attributeName="stop-color" values="#FFFFE0;#00BFFF;#FFFFE0" dur="2s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#00BFFF">
            <animate attributeName="stop-color" values="#00BFFF;#FFD700;#00BFFF" dur="2s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#006699" />
        </radialGradient>
        <linearGradient id="loadingPetalGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFA500" />
        </linearGradient>
        <linearGradient id="loadingPetalTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00BFFF" />
          <stop offset="100%" stopColor="#008B8B" />
        </linearGradient>
        <filter id="loadingGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <g style={{ transformOrigin: 'center', transform: `rotate(${rotation}deg)` }}>
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <ellipse
            key={i}
            cx="50"
            cy="26"
            rx="9"
            ry="24"
            fill={`url(#loadingPetal${i % 2 === 0 ? 'Gold' : 'Teal'})`}
            transform={`rotate(${angle} 50 50)`}
            filter="url(#loadingGlow)"
            opacity="0.9"
          >
            <animate 
              attributeName="ry" 
              values="24;28;24" 
              dur={`${1.5 + i * 0.1}s`} 
              repeatCount="indefinite" 
            />
          </ellipse>
        ))}
      </g>
      
      <circle 
        cx="50" 
        cy="50" 
        r="14" 
        fill="url(#loadingCore)" 
        filter="url(#loadingGlow)"
      >
        <animate attributeName="r" values="14;16;14" dur="1s" repeatCount="indefinite" />
      </circle>
      
      <circle 
        cx="50" 
        cy="50" 
        r="7" 
        fill="#FFFFE0" 
        opacity="0.9"
      >
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.5s" repeatCount="indefinite" />
      </circle>

      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <circle
          key={`particle-${i}`}
          r="2"
          fill={i % 2 === 0 ? '#FFD700' : '#00BFFF'}
          opacity="0.6"
        >
          <animateMotion
            dur={`${2 + i * 0.2}s`}
            repeatCount="indefinite"
            path={`M50,50 L${50 + 35 * Math.cos(angle * Math.PI / 180)},${50 + 35 * Math.sin(angle * Math.PI / 180)}`}
          />
          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1s" repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

export const TrinityLoadingOverlay = memo(function TrinityLoadingOverlay({
  isLoading,
  message,
  subMessage,
  variant = 'fullscreen',
  size = 'md',
  className,
}: TrinityLoadingOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isLoading) return;

    const messageInterval = setInterval(() => {
      setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);

    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);

    return () => {
      clearInterval(messageInterval);
      clearInterval(dotsInterval);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  const logoSize = size === 'sm' ? 48 : size === 'lg' ? 120 : 80;
  const displayMessage = message || LOADING_MESSAGES[messageIndex];

  const containerClasses = cn(
    'flex flex-col items-center justify-center gap-4',
    variant === 'fullscreen' && 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
    variant === 'inline' && 'py-8',
    variant === 'card' && 'p-6 rounded-lg bg-card border',
    className
  );

  return (
    <div className={containerClasses} data-testid="trinity-loading-overlay">
      <AnimatedTrinityLogo size={logoSize} isAnimating={isLoading} />
      
      <div className="text-center space-y-1">
        <p className={cn(
          'font-medium bg-gradient-to-r from-[#00BFFF] to-[#FFD700] bg-clip-text text-transparent',
          size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'
        )}>
          {displayMessage}{dots}
        </p>
        {subMessage && (
          <p className="text-sm text-muted-foreground">{subMessage}</p>
        )}
      </div>

      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-gradient-to-r from-[#00BFFF] to-[#FFD700]"
            style={{
              animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
});

export function TrinityLoadingSpinner({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      <AnimatedTrinityLogo size={size} isAnimating={true} />
    </div>
  );
}

export default TrinityLoadingOverlay;
