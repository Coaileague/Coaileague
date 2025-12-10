/**
 * SeasonalDecorator - Frontend Holiday Theme Component
 * 
 * Renders AI-generated holiday decorations with hit detection protection.
 * All decorations are click-through to preserve user interactions.
 * 
 * Features:
 * - Snowflakes, confetti, particles
 * - Corner decorations and overlays
 * - Safe zones for buttons and interactive elements
 * - Smooth theme transitions
 */

import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface SeasonalTheme {
  holidayId: string;
  holidayName: string;
  emoji: string;
  themeConfig: {
    cssVariables: Record<string, string>;
    decorationElements: DecorationElement[];
    greetingMessage: string;
    subTitle: string;
    safeZones: string[];
    animations: AnimationConfig[];
  };
  isActive: boolean;
}

interface DecorationElement {
  id: string;
  type: 'particle' | 'overlay' | 'border' | 'icon' | 'banner';
  position: 'fixed' | 'absolute' | 'sticky';
  placement: string;
  content?: string;
  cssClass: string;
  zIndex: number;
  clickThrough: boolean;
}

interface AnimationConfig {
  name: string;
  target: string;
  keyframes: string;
  duration: string;
  iterationCount: string;
  easing: string;
}

// Snowflake component for winter holidays
function Snowflake({ delay, duration, left }: { delay: number; duration: number; left: number }) {
  return (
    <motion.div
      className="pointer-events-none fixed text-white/60"
      style={{ left: `${left}%`, top: -20, zIndex: 9999 }}
      initial={{ y: -20, opacity: 0, rotate: 0 }}
      animate={{ 
        y: '100vh', 
        opacity: [0, 1, 1, 0],
        rotate: 360 
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <span className="text-lg select-none" aria-hidden="true">*</span>
    </motion.div>
  );
}

// Confetti piece for celebrations
function ConfettiPiece({ delay, color, left }: { delay: number; color: string; left: number }) {
  return (
    <motion.div
      className="pointer-events-none fixed w-2 h-3 rounded-sm"
      style={{ 
        left: `${left}%`, 
        top: -20, 
        backgroundColor: color,
        zIndex: 9999 
      }}
      initial={{ y: -20, opacity: 0, rotateZ: 0, rotateX: 0 }}
      animate={{ 
        y: '100vh', 
        opacity: [0, 1, 1, 0],
        rotateZ: [0, 360, 720],
        rotateX: [0, 180, 360],
      }}
      transition={{
        duration: 4 + Math.random() * 2,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

// Corner decoration overlay
function CornerDecoration({ position, holidayId }: { position: 'tl' | 'tr' | 'bl' | 'br'; holidayId: string }) {
  const positionClasses = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  };

  const decorationContent = {
    christmas: position === 'tl' || position === 'tr' ? (
      <svg width="120" height="120" viewBox="0 0 120 120" className="opacity-30">
        <defs>
          <linearGradient id="christmasGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c41e3a" />
            <stop offset="100%" stopColor="#165b33" />
          </linearGradient>
        </defs>
        <path
          d={position === 'tl' 
            ? "M0,0 L120,0 Q60,60 0,120 Z" 
            : "M0,0 L120,0 L120,120 Q60,60 0,0 Z"}
          fill="url(#christmasGrad)"
        />
        <circle cx={position === 'tl' ? 30 : 90} cy="30" r="5" fill="#f8b229" opacity="0.8" />
        <circle cx={position === 'tl' ? 50 : 70} cy="50" r="4" fill="#f8b229" opacity="0.6" />
        <circle cx={position === 'tl' ? 20 : 100} cy="60" r="3" fill="#f8b229" opacity="0.7" />
      </svg>
    ) : null,
    halloween: position === 'tl' || position === 'tr' ? (
      <svg width="100" height="100" viewBox="0 0 100 100" className="opacity-40">
        <path
          d={position === 'tl' 
            ? "M0,0 L100,0 Q50,50 0,100 Z" 
            : "M0,0 L100,0 L100,100 Q50,50 0,0 Z"}
          fill="#6a1b9a"
        />
      </svg>
    ) : null,
    'new-year': position === 'tl' || position === 'tr' ? (
      <svg width="100" height="100" viewBox="0 0 100 100" className="opacity-30">
        <defs>
          <linearGradient id="nyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="#c0c0c0" />
          </linearGradient>
        </defs>
        <path
          d={position === 'tl' 
            ? "M0,0 L100,0 Q50,50 0,100 Z" 
            : "M0,0 L100,0 L100,100 Q50,50 0,0 Z"}
          fill="url(#nyGrad)"
        />
      </svg>
    ) : null,
  };

  const content = decorationContent[holidayId as keyof typeof decorationContent];
  if (!content) return null;

  return (
    <motion.div
      className={`pointer-events-none fixed ${positionClasses[position]}`}
      style={{ zIndex: 9998 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.5 }}
    >
      {content}
    </motion.div>
  );
}

// Holiday banner
function HolidayBanner({ message, emoji, onDismiss }: { message: string; emoji: string; onDismiss: () => void }) {
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[9997] bg-gradient-to-r from-[var(--seasonal-primary)] to-[var(--seasonal-secondary)] text-white py-2 px-4 text-center"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -50, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-xl" aria-hidden="true">{emoji}</span>
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onDismiss}
          className="ml-4 text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss holiday banner"
          data-testid="button-dismiss-holiday-banner"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

// Particle system for various effects
function ParticleSystem({ holidayId, intensity }: { holidayId: string; intensity: 'subtle' | 'moderate' | 'festive' }) {
  const particleCount = {
    subtle: 10,
    moderate: 20,
    festive: 35,
  }[intensity];

  if (holidayId === 'christmas') {
    return (
      <>
        {Array.from({ length: particleCount }).map((_, i) => (
          <Snowflake
            key={`snow-${i}`}
            delay={i * 0.3}
            duration={5 + Math.random() * 5}
            left={Math.random() * 100}
          />
        ))}
      </>
    );
  }

  if (holidayId === 'new-year') {
    const colors = ['#ffd700', '#c0c0c0', '#ff6b6b', '#ffffff'];
    return (
      <>
        {Array.from({ length: particleCount }).map((_, i) => (
          <ConfettiPiece
            key={`confetti-${i}`}
            delay={i * 0.2}
            color={colors[i % colors.length]}
            left={Math.random() * 100}
          />
        ))}
      </>
    );
  }

  return null;
}

// Main Seasonal Decorator Component
export function SeasonalDecorator() {
  const [showBanner, setShowBanner] = useState(true);
  const [cssInjected, setCssInjected] = useState(false);

  // Fetch current seasonal theme from API
  const { data: theme } = useQuery<SeasonalTheme>({
    queryKey: ['/api/seasonal/current-theme'],
    refetchInterval: 60000, // Check every minute
    retry: false,
    staleTime: 30000,
  });

  // Inject CSS variables when theme changes
  useEffect(() => {
    if (theme?.themeConfig?.cssVariables) {
      const root = document.documentElement;
      Object.entries(theme.themeConfig.cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
      setCssInjected(true);

      // Cleanup on unmount or theme change
      return () => {
        Object.keys(theme.themeConfig.cssVariables).forEach((key) => {
          root.style.removeProperty(key);
        });
      };
    }
  }, [theme?.themeConfig?.cssVariables]);

  // Inject keyframe animations
  useEffect(() => {
    if (theme?.themeConfig?.animations) {
      const styleEl = document.createElement('style');
      styleEl.id = 'seasonal-animations';
      styleEl.textContent = theme.themeConfig.animations
        .map(a => a.keyframes)
        .join('\n');
      document.head.appendChild(styleEl);

      return () => {
        const el = document.getElementById('seasonal-animations');
        if (el) el.remove();
      };
    }
  }, [theme?.themeConfig?.animations]);

  const handleDismissBanner = useCallback(() => {
    setShowBanner(false);
    // Remember dismissal for this session
    sessionStorage.setItem('seasonal-banner-dismissed', 'true');
  }, []);

  // Check if banner was already dismissed
  useEffect(() => {
    if (sessionStorage.getItem('seasonal-banner-dismissed') === 'true') {
      setShowBanner(false);
    }
  }, []);

  // Don't render anything if no active theme
  if (!theme?.isActive) {
    return null;
  }

  const intensity = 'festive'; // Could come from theme config

  return (
    <div 
      className="seasonal-decorator pointer-events-none fixed inset-0"
      style={{ zIndex: 9990 }}
      aria-hidden="true"
      data-testid="seasonal-decorator"
    >
      <AnimatePresence>
        {/* Holiday Banner */}
        {showBanner && theme.themeConfig?.greetingMessage && (
          <div className="pointer-events-auto">
            <HolidayBanner
              message={theme.themeConfig.greetingMessage}
              emoji={theme.emoji}
              onDismiss={handleDismissBanner}
            />
          </div>
        )}

        {/* Corner Decorations */}
        <CornerDecoration position="tl" holidayId={theme.holidayId} />
        <CornerDecoration position="tr" holidayId={theme.holidayId} />

        {/* Particle Effects */}
        <ParticleSystem holidayId={theme.holidayId} intensity={intensity} />
      </AnimatePresence>
    </div>
  );
}

// Hook for components to check if seasonal theme is active
export function useSeasonalTheme() {
  const { data: theme } = useQuery<SeasonalTheme>({
    queryKey: ['/api/seasonal/current-theme'],
    retry: false,
    staleTime: 30000,
  });

  return {
    isActive: theme?.isActive ?? false,
    holidayId: theme?.holidayId,
    holidayName: theme?.holidayName,
    emoji: theme?.emoji,
    cssVariables: theme?.themeConfig?.cssVariables,
  };
}

export default SeasonalDecorator;
