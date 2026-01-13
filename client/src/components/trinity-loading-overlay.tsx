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

export type TrinityOverlayStatus = 'loading' | 'success' | 'error' | 'denied' | 'info';

interface TrinityLoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  subMessage?: string;
  variant?: 'fullscreen' | 'inline' | 'card';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  status?: TrinityOverlayStatus;
  progress?: number;
}

const LOADING_MESSAGES = [
  "Trinity is thinking...",
  "Analyzing your request...",
  "Processing data...",
  "Almost there...",
  "Optimizing results...",
];

/**
 * Animated Trinity Celtic Knot Logo - Flowing ribbon animation
 * Three interwoven ribbon paths with animated color flow
 * Distinctly Trinity branding - NOT similar to Claude's starburst
 */
/**
 * AnimatedTrinityLogo - Uses the REAL Trinity Redesign canvas mascot
 */
import { Suspense, lazy } from 'react';
const TrinityRedesign = lazy(() => import('@/components/trinity-redesign'));

function AnimatedTrinityLogo({ size = 80, isAnimating = true }: { size?: number; isAnimating?: boolean }) {
  return (
    <Suspense fallback={<div style={{ width: size, height: size }} />}>
      <TrinityRedesign 
        size={size} 
        mode={isAnimating ? "THINKING" : "IDLE"}
      />
    </Suspense>
  );
}

/**
 * Status icon component for success/error/denied states
 */
function StatusIcon({ status, size }: { status: TrinityOverlayStatus; size: number }) {
  const iconSize = size * 0.6;
  
  if (status === 'success') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        className="rounded-full bg-gradient-to-br from-green-400 to-emerald-500 p-4"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={iconSize} height={iconSize} className="text-white mx-auto">
          <motion.path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          />
        </svg>
      </motion.div>
    );
  }
  
  if (status === 'error') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        className="rounded-full bg-gradient-to-br from-red-400 to-rose-500 p-4 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={iconSize} height={iconSize} className="text-white">
          <motion.path
            d="M6 6l12 12M6 18L18 6"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          />
        </svg>
      </motion.div>
    );
  }
  
  if (status === 'denied') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        className="rounded-full bg-gradient-to-br from-amber-400 to-orange-500 p-4 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={iconSize} height={iconSize} className="text-white">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} />
          <motion.path
            d="M12 8v4M12 16h.01"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          />
        </svg>
      </motion.div>
    );
  }
  
  if (status === 'info') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        className="rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 p-4 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={iconSize} height={iconSize} className="text-white">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} />
          <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      </motion.div>
    );
  }
  
  return null;
}

export const TrinityLoadingOverlay = memo(function TrinityLoadingOverlay({
  isLoading,
  message,
  subMessage,
  variant = 'fullscreen',
  size = 'md',
  className,
  status = 'loading',
  progress,
}: TrinityLoadingOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isLoading || status !== 'loading') return;

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
  }, [isLoading, status]);

  const logoSize = size === 'sm' ? 80 : size === 'lg' ? 200 : 160;
  const displayMessage = message || (status === 'loading' ? LOADING_MESSAGES[messageIndex] : message);
  
  // Color theming based on status
  const statusColors = {
    loading: 'from-teal-500 via-cyan-500 to-blue-500',
    success: 'from-green-500 via-emerald-500 to-teal-500',
    error: 'from-red-500 via-rose-500 to-pink-500',
    denied: 'from-amber-500 via-orange-500 to-red-500',
    info: 'from-blue-500 via-indigo-500 to-purple-500',
  };
  
  const isLoadingStatus = status === 'loading';

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
            {/* Centered Logo or Status Icon */}
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
              {isLoadingStatus ? (
                <AnimatedTrinityLogo size={logoSize} isAnimating={true} />
              ) : (
                <StatusIcon status={status} size={logoSize} />
              )}
            </motion.div>
            
            {/* Progress bar for loading with progress */}
            {isLoadingStatus && progress !== undefined && progress > 0 && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 200 }}
                className="mt-4 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </motion.div>
            )}
            
            {/* Message below logo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-center space-y-2 mt-6"
            >
              <p className={cn(
                'font-semibold bg-gradient-to-r bg-clip-text text-transparent',
                statusColors[status],
                size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl'
              )}>
                {displayMessage}{isLoadingStatus ? dots : ''}
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
          size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl'
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
