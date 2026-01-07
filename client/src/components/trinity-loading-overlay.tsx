/**
 * Trinity Loading Overlay - GetSling-style transition with Trinity branding
 * 
 * Features:
 * - Animated filled Trinity triquetra logo (centered like GetSling)
 * - Smooth fade/scale transitions
 * - Full-screen overlay for screen changes and heavy loading
 * - Brand-compliant teal/cyan/blue gradient palette
 */

import { useEffect, useState, memo, useId } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

/**
 * Animated Trinity Triquetra Logo - GetSling-style animation
 * Three filled loops with staggered fade/scale animations
 */
function AnimatedTrinityLogo({ size = 80, isAnimating = true }: { size?: number; isAnimating?: boolean }) {
  const reactId = useId();
  
  const ids = {
    tealGrad: `trinity-loader-teal${reactId}`,
    cyanGrad: `trinity-loader-cyan${reactId}`,
    blueGrad: `trinity-loader-blue${reactId}`,
    coreGrad: `trinity-loader-core${reactId}`,
    glowFilter: `trinity-loader-glow${reactId}`,
  };

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100"
      className="transition-transform"
    >
      <defs>
        <linearGradient id={ids.tealGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id={ids.cyanGrad} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={ids.blueGrad} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
        </radialGradient>
        <filter id={ids.glowFilter} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Loop 1 - Top (Teal) - with staggered animation */}
      <path 
        d="M 50 12 C 70 12, 82 30, 82 48 C 82 58, 72 70, 50 50 C 28 70, 18 58, 18 48 C 18 30, 30 12, 50 12 Z"
        fill={`url(#${ids.tealGrad})`}
        filter={`url(#${ids.glowFilter})`}
      >
        {isAnimating && (
          <animate 
            attributeName="opacity" 
            values="0.4;0.95;0.4" 
            dur="1.2s" 
            repeatCount="indefinite"
            begin="0s"
          />
        )}
      </path>
      
      {/* Loop 2 - Bottom Left (Cyan) */}
      <path 
        d="M 22 80 C 10 68, 10 48, 22 36 C 32 26, 48 32, 50 50 C 42 64, 30 76, 22 80 C 32 92, 48 90, 50 78 Z"
        fill={`url(#${ids.cyanGrad})`}
        filter={`url(#${ids.glowFilter})`}
      >
        {isAnimating && (
          <animate 
            attributeName="opacity" 
            values="0.4;0.95;0.4" 
            dur="1.2s" 
            repeatCount="indefinite"
            begin="0.4s"
          />
        )}
      </path>
      
      {/* Loop 3 - Bottom Right (Blue) */}
      <path 
        d="M 78 80 C 90 68, 90 48, 78 36 C 68 26, 52 32, 50 50 C 58 64, 70 76, 78 80 C 68 92, 52 90, 50 78 Z"
        fill={`url(#${ids.blueGrad})`}
        filter={`url(#${ids.glowFilter})`}
      >
        {isAnimating && (
          <animate 
            attributeName="opacity" 
            values="0.4;0.95;0.4" 
            dur="1.2s" 
            repeatCount="indefinite"
            begin="0.8s"
          />
        )}
      </path>
      
      {/* Central core */}
      <circle cx="50" cy="50" r="10" fill={`url(#${ids.coreGrad})`} filter={`url(#${ids.glowFilter})`}>
        {isAnimating && (
          <animate 
            attributeName="r" 
            values="8;12;8" 
            dur="1.5s" 
            repeatCount="indefinite"
          />
        )}
      </circle>
      <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95"/>
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

  const logoSize = size === 'sm' ? 56 : size === 'lg' ? 140 : 100;
  const displayMessage = message || LOADING_MESSAGES[messageIndex];

  // Fullscreen variant uses AnimatePresence for smooth transitions
  if (variant === 'fullscreen') {
    return (
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              'fixed inset-0 z-[9999] flex flex-col items-center justify-center',
              'bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-sm',
              className
            )}
            data-testid="trinity-loading-overlay"
          >
            {/* Centered Trinity Logo with GetSling-style animation */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ 
                type: "spring", 
                damping: 20, 
                stiffness: 200,
                delay: 0.1
              }}
            >
              <AnimatedTrinityLogo size={logoSize} isAnimating={isLoading} />
            </motion.div>
            
            {/* Message below logo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-center space-y-2 mt-6"
            >
              <p className={cn(
                'font-semibold bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent',
                size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'
              )}>
                {displayMessage}{dots}
              </p>
              {subMessage && (
                <p className="text-sm text-muted-foreground">{subMessage}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Non-fullscreen variants
  if (!isLoading) return null;

  const containerClasses = cn(
    'flex flex-col items-center justify-center gap-4',
    variant === 'inline' && 'py-8',
    variant === 'card' && 'p-6 rounded-lg bg-card border',
    className
  );

  return (
    <div className={containerClasses} data-testid="trinity-loading-overlay">
      <AnimatedTrinityLogo size={logoSize} isAnimating={isLoading} />
      
      <div className="text-center space-y-1">
        <p className={cn(
          'font-semibold bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent',
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
            className="w-2 h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
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
