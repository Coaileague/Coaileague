/**
 * Trinity Marketing Hero Component
 * 
 * A polished, professional presentation of Trinity for marketing/promotional contexts.
 * Features:
 * - Gradient backgrounds with glow effects
 * - Animated shimmer and pulse
 * - Multiple size variants (badge, compact, standard, hero)
 * - Optional taglines and CTAs
 * - Works beautifully in both light and dark modes
 */

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Bot, Zap, Brain, Shield, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type TrinityVariant = 'badge' | 'compact' | 'standard' | 'hero' | 'inline';

interface TrinityMarketingHeroProps {
  variant?: TrinityVariant;
  tagline?: string;
  subtitle?: string;
  showGlow?: boolean;
  showSparkles?: boolean;
  animated?: boolean;
  className?: string;
  iconOnly?: boolean;
}

const VARIANT_STYLES: Record<TrinityVariant, {
  containerSize: string;
  iconSize: string;
  iconClass: string;
  textSize: string;
  subtitleSize: string;
  padding: string;
  gap: string;
}> = {
  badge: {
    containerSize: 'w-6 h-6',
    iconSize: 'w-3.5 h-3.5',
    iconClass: '',
    textSize: 'text-xs',
    subtitleSize: 'text-[10px]',
    padding: 'p-1',
    gap: 'gap-1.5',
  },
  compact: {
    containerSize: 'w-10 h-10',
    iconSize: 'w-5 h-5',
    iconClass: '',
    textSize: 'text-sm',
    subtitleSize: 'text-xs',
    padding: 'p-2',
    gap: 'gap-2',
  },
  inline: {
    containerSize: 'w-8 h-8',
    iconSize: 'w-4 h-4',
    iconClass: '',
    textSize: 'text-sm',
    subtitleSize: 'text-xs',
    padding: 'p-1.5',
    gap: 'gap-2',
  },
  standard: {
    containerSize: 'w-14 h-14',
    iconSize: 'w-7 h-7',
    iconClass: '',
    textSize: 'text-base',
    subtitleSize: 'text-sm',
    padding: 'p-3',
    gap: 'gap-3',
  },
  hero: {
    containerSize: 'w-20 h-20',
    iconSize: 'w-10 h-10',
    iconClass: '',
    textSize: 'text-xl',
    subtitleSize: 'text-base',
    padding: 'p-4',
    gap: 'gap-4',
  },
};

const TrinityMarketingHero = memo(function TrinityMarketingHero({
  variant = 'standard',
  tagline,
  subtitle,
  showGlow = true,
  showSparkles = true,
  animated = true,
  className,
  iconOnly = false,
}: TrinityMarketingHeroProps) {
  const styles = VARIANT_STYLES[variant];
  
  const glowAnimation = useMemo(() => ({
    animate: animated ? {
      boxShadow: [
        '0 0 20px rgba(0, 191, 255, 0.3), 0 0 40px rgba(255, 215, 0, 0.2)',
        '0 0 30px rgba(0, 191, 255, 0.5), 0 0 60px rgba(255, 215, 0, 0.3)',
        '0 0 20px rgba(0, 191, 255, 0.3), 0 0 40px rgba(255, 215, 0, 0.2)',
      ],
    } : {},
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  }), [animated]);

  const shimmerAnimation = useMemo(() => ({
    animate: animated ? {
      backgroundPosition: ['200% 50%', '-200% 50%'],
    } : {},
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: 'linear',
    },
  }), [animated]);

  const pulseAnimation = useMemo(() => ({
    animate: animated ? {
      scale: [1, 1.05, 1],
      opacity: [0.8, 1, 0.8],
    } : {},
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  }), [animated]);

  const sparklePositions = [
    { top: '5%', left: '10%', delay: 0 },
    { top: '15%', right: '8%', delay: 0.5 },
    { bottom: '20%', left: '15%', delay: 1 },
    { bottom: '10%', right: '12%', delay: 1.5 },
  ];

  const IconComponent = (
    <motion.div
      className={cn(
        'relative flex items-center justify-center rounded-2xl',
        styles.containerSize,
        styles.padding,
        'bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600',
        'dark:from-cyan-400 dark:via-blue-500 dark:to-purple-500',
        showGlow && 'shadow-lg shadow-cyan-500/30 dark:shadow-cyan-400/20'
      )}
      {...(animated ? glowAnimation : {})}
      data-testid="trinity-marketing-icon"
    >
      {/* Inner gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-transparent" />
      
      {/* Shimmer effect */}
      {animated && (
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            backgroundSize: '200% 100%',
          }}
          {...shimmerAnimation}
        />
      )}
      
      {/* Trinity Symbol - Stylized interlocking rings */}
      <div className="relative z-10">
        <svg
          viewBox="0 0 100 100"
          className={cn(styles.iconSize, 'text-white drop-shadow-lg')}
          fill="none"
        >
          {/* Central glow */}
          <defs>
            <radialGradient id="trinityGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFD700" stopOpacity="1" />
              <stop offset="50%" stopColor="#FFD700" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="petalGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="100%" stopColor="#FFA500" />
            </linearGradient>
            <linearGradient id="petalCyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00BFFF" />
              <stop offset="100%" stopColor="#00CED1" />
            </linearGradient>
          </defs>
          
          {/* Central core glow */}
          <circle cx="50" cy="50" r="20" fill="url(#trinityGlow)" opacity="0.6" />
          
          {/* Five-pointed interwoven petals */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <g key={angle} transform={`rotate(${angle} 50 50)`}>
              <path
                d={`M 50 50 
                    Q 50 25, 50 15 
                    Q 55 20, 60 30 
                    Q 55 40, 50 50`}
                fill={i % 2 === 0 ? 'url(#petalGold)' : 'url(#petalCyan)'}
                opacity="0.9"
              />
            </g>
          ))}
          
          {/* Central crystal core */}
          <circle cx="50" cy="50" r="8" fill="white" opacity="0.95" />
          <circle cx="48" cy="48" r="3" fill="white" opacity="0.6" />
        </svg>
      </div>
      
      {/* Sparkle decorations */}
      {showSparkles && variant !== 'badge' && sparklePositions.map((pos, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            top: pos.top,
            left: pos.left,
            right: pos.right,
            bottom: pos.bottom,
          }}
          {...(animated ? {
            animate: {
              scale: [0.5, 1, 0.5],
              opacity: [0.3, 1, 0.3],
            },
            transition: {
              duration: 2,
              repeat: Infinity,
              delay: pos.delay,
            },
          } : {})}
        >
          <Star className="w-2 h-2 text-yellow-300 fill-yellow-300" />
        </motion.div>
      ))}
    </motion.div>
  );

  if (iconOnly) {
    return (
      <div className={cn('inline-flex', className)} data-testid="trinity-marketing-hero">
        {IconComponent}
      </div>
    );
  }

  return (
    <div 
      className={cn('flex items-center', styles.gap, className)}
      data-testid="trinity-marketing-hero"
    >
      {IconComponent}
      
      {(tagline || subtitle) && (
        <div className="flex flex-col min-w-0">
          {tagline && (
            <span className={cn(
              'font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600',
              'dark:from-cyan-400 dark:via-blue-400 dark:to-purple-400',
              'bg-clip-text text-transparent',
              styles.textSize
            )}>
              {tagline}
            </span>
          )}
          {subtitle && (
            <span className={cn(
              'text-muted-foreground',
              styles.subtitleSize
            )}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Trinity Badge - Small inline presentation for headers, notifications
 */
export function TrinityBadge({ 
  className, 
  label,
  showLabel = true,
}: { 
  className?: string; 
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)} data-testid="trinity-badge">
      <TrinityMarketingHero 
        variant="badge" 
        iconOnly 
        animated={false}
        showGlow={false}
        showSparkles={false}
      />
      {showLabel && (
        <span className="text-xs font-semibold bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent">
          {label || 'Trinity'}
        </span>
      )}
    </div>
  );
}

/**
 * Trinity Spotlight - For featured sections like notifications Guru mode
 */
export function TrinitySpotlight({
  title = 'Trinity AI',
  message,
  className,
  children,
}: {
  title?: string;
  message?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div 
      className={cn(
        'relative overflow-hidden rounded-xl',
        'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
        'dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
        'border border-cyan-500/20',
        'p-4',
        className
      )}
      data-testid="trinity-spotlight"
    >
      {/* Background glow effect */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0,191,255,0.15) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,215,0,0.1) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex items-start gap-3">
        <TrinityMarketingHero 
          variant="compact" 
          iconOnly 
          showGlow
          showSparkles
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white">{title}</span>
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          {message && (
            <p className="text-sm text-slate-300 leading-relaxed">
              {message}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Trinity Welcome Banner - For onboarding and welcome screens
 */
export function TrinityWelcomeBanner({
  userName,
  message,
  showProgress,
  progress = 0,
  className,
  onAction,
  actionLabel = 'Get Started',
}: {
  userName?: string;
  message?: string;
  showProgress?: boolean;
  progress?: number;
  className?: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <motion.div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-cyan-600 via-blue-600 to-purple-700',
        'dark:from-cyan-700 dark:via-blue-700 dark:to-purple-800',
        'p-6 text-white shadow-xl',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      data-testid="trinity-welcome-banner"
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 opacity-20">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {[0, 72, 144, 216, 288].map((angle) => (
            <path
              key={angle}
              d={`M 100 100 Q 100 50, 100 20 Q 120 40, 130 60 Q 115 80, 100 100`}
              fill="white"
              transform={`rotate(${angle} 100 100)`}
              opacity="0.5"
            />
          ))}
        </svg>
      </div>
      
      <div className="relative z-10 flex items-center gap-4">
        <TrinityMarketingHero 
          variant="standard" 
          iconOnly 
          showGlow={false}
          className="shrink-0"
        />
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold mb-1">
            {userName ? `Welcome, ${userName}!` : 'Welcome to Trinity'}
          </h3>
          <p className="text-white/80 text-sm leading-relaxed">
            {message || 'Your AI-powered assistant is ready to help you get the most out of CoAIleague.'}
          </p>
          
          {showProgress && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Setup Progress</span>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
          
          {onAction && (
            <button
              onClick={onAction}
              className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
              data-testid="button-trinity-action"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Trinity Inline Mention - For inline text mentions of Trinity
 */
export function TrinityInline({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} data-testid="trinity-inline">
      <TrinityMarketingHero 
        variant="badge" 
        iconOnly 
        animated={false}
        showGlow={false}
        showSparkles={false}
      />
      <span className="font-semibold bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent">
        Trinity
      </span>
    </span>
  );
}

export default TrinityMarketingHero;
