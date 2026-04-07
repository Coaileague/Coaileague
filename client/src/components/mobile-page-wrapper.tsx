/**
 * Mobile Page Wrapper & Layout Primitives
 * Optimized container for mobile pages with safe areas and responsive layouts
 * Uses centralized MOBILE_CONFIG for all sizing and behavior
 * Now with Universal Seasonal Handler integration for holidays and themed effects
 */

import { ReactNode, useState, useEffect } from 'react';
import { useIsMobile, useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MOBILE_CONFIG } from "@/config/mobileConfig";
import { useSeasonalTheme, SeasonId, EffectType } from "@/context/SeasonalThemeContext";
import { Sparkles, Snowflake, Heart, Sun, Leaf, Moon, PartyPopper, Gift } from 'lucide-react';

// ============================================================================
// SEASONAL MINI HANDLER FOR MOBILE
// ============================================================================

interface SeasonalMiniConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gradient: string;
  accentColor: string;
  particleColor: string;
}

const SEASONAL_CONFIG: Record<SeasonId, SeasonalMiniConfig> = {
  winter: {
    icon: Snowflake,
    label: 'Winter Mode',
    gradient: 'from-blue-400/20 to-cyan-400/10',
    accentColor: 'text-blue-400',
    particleColor: '#87CEEB',
  },
  christmas: {
    icon: Gift,
    label: 'Holiday Season',
    gradient: 'from-red-500/20 to-green-500/10',
    accentColor: 'text-red-400',
    particleColor: '#FF6B6B',
  },
  newYear: {
    icon: PartyPopper,
    label: 'New Year',
    gradient: 'from-yellow-400/20 to-purple-400/10',
    accentColor: 'text-yellow-400',
    particleColor: '#FFD700',
  },
  valentines: {
    icon: Heart,
    label: 'Valentine\'s',
    gradient: 'from-pink-400/20 to-red-400/10',
    accentColor: 'text-pink-400',
    particleColor: '#FF69B4',
  },
  spring: {
    icon: Sparkles,
    label: 'Spring',
    gradient: 'from-green-300/20 to-pink-300/10',
    accentColor: 'text-green-400',
    particleColor: '#98FB98',
  },
  easter: {
    icon: Sparkles,
    label: 'Easter',
    gradient: 'from-purple-300/20 to-yellow-300/10',
    accentColor: 'text-purple-400',
    particleColor: '#DDA0DD',
  },
  summer: {
    icon: Sun,
    label: 'Summer Mode',
    gradient: 'from-orange-400/20 to-yellow-400/10',
    accentColor: 'text-orange-400',
    particleColor: '#FFB347',
  },
  fall: {
    icon: Leaf,
    label: 'Autumn',
    gradient: 'from-orange-500/20 to-red-500/10',
    accentColor: 'text-orange-500',
    particleColor: '#D2691E',
  },
  halloween: {
    icon: Moon,
    label: 'Spooky Season',
    gradient: 'from-orange-600/20 to-purple-600/10',
    accentColor: 'text-orange-500',
    particleColor: '#FF7518',
  },
  thanksgiving: {
    icon: Leaf,
    label: 'Thanksgiving',
    gradient: 'from-amber-500/20 to-orange-500/10',
    accentColor: 'text-amber-500',
    particleColor: '#DAA520',
  },
  default: {
    icon: Sparkles,
    label: 'Normal Mode',
    gradient: 'from-primary/10 to-primary/5',
    accentColor: 'text-primary',
    particleColor: '#38bdf8',
  },
};

// Mobile Seasonal Banner Component
function MobileSeasonalBanner({ 
  seasonId, 
  isHoliday, 
  holidayName,
  effectType,
}: { 
  seasonId: SeasonId; 
  isHoliday: boolean; 
  holidayName: string | null;
  effectType: EffectType;
}) {
  const config = SEASONAL_CONFIG[seasonId] || SEASONAL_CONFIG.default;
  const IconComponent = config.icon;
  
  // Only show banner if it's a holiday or non-default season
  if (seasonId === 'default' && !isHoliday) return null;
  
  return (
    <div
      className={cn(
        'px-3 py-2 flex items-center gap-2 border-b border-border/50',
        `bg-gradient-to-r ${config.gradient}`
      )}
      data-testid="mobile-seasonal-banner"
    >
      <div className={cn('animate-pulse', config.accentColor)}>
        <IconComponent className="w-4 h-4" />
      </div>
      <span className="text-xs font-medium text-foreground/80">
        {isHoliday && holidayName ? holidayName : config.label}
      </span>
      {effectType !== 'none' && (
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground capitalize">
            {effectType}
          </span>
          <div 
            className="w-1.5 h-1.5 rounded-full animate-ping"
            style={{ backgroundColor: config.particleColor }}
          />
        </div>
      )}
    </div>
  );
}

// Mini Seasonal Effects Overlay for Mobile
function MobileSeasonalEffects({ 
  effectType, 
  intensity,
  seasonId,
}: { 
  effectType: EffectType; 
  intensity: number;
  seasonId: SeasonId;
}) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const config = SEASONAL_CONFIG[seasonId] || SEASONAL_CONFIG.default;
  
  useEffect(() => {
    if (effectType === 'none' || intensity === 0) {
      setParticles([]);
      return;
    }
    
    // Create fewer particles for mobile performance
    const particleCount = Math.floor(intensity * 8);
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
  }, [effectType, intensity]);
  
  if (effectType === 'none' || particles.length === 0) return null;
  
  return (
    <>
      <div 
        className="pointer-events-none fixed inset-0 overflow-hidden z-10"
        data-testid="mobile-seasonal-effects"
      >
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute animate-mobile-float-down"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: '8s',
            }}
          >
            <div
              className="w-2 h-2 rounded-full opacity-60"
              style={{ backgroundColor: config.particleColor }}
            />
          </div>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes mobile-float-down {
          0% { transform: translateY(-10px) translateX(0); opacity: 0; }
          10% { opacity: 0.6; }
          50% { transform: translateY(50vh) translateX(15px); }
          90% { opacity: 0.4; }
          100% { transform: translateY(100vh) translateX(-8px); opacity: 0; }
        }
        .animate-mobile-float-down {
          animation: mobile-float-down ease-in-out infinite;
        }
      `}} />
    </>
  );
}

interface MobilePageWrapperProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
  enablePullToRefresh?: boolean;
  className?: string;
  withBottomNav?: boolean;
  showSeasonalBanner?: boolean;
  showSeasonalEffects?: boolean;
}

export function MobilePageWrapper({
  children,
  // onRefresh and enablePullToRefresh kept in interface for compat but PTR is removed —
  // the platform syncs live via WebSocket + background polling.
  className,
  withBottomNav = false,
  showSeasonalBanner = true,
  showSeasonalEffects = true,
}: MobilePageWrapperProps) {
  const isMobile = useIsMobile();

  const { 
    seasonId, 
    isHoliday, 
    holidayName, 
    primaryEffect, 
    effectIntensity 
  } = useSeasonalTheme();

  return (
    <div 
      className={cn(
        "w-full relative flex flex-col min-h-full overflow-x-hidden",
        className
      )}
      data-testid="mobile-page-wrapper"
    >
      {showSeasonalEffects && isMobile && (
        <MobileSeasonalEffects 
          effectType={primaryEffect} 
          intensity={effectIntensity}
          seasonId={seasonId}
        />
      )}
      
      {showSeasonalBanner && isMobile && (
        <MobileSeasonalBanner 
          seasonId={seasonId}
          isHoliday={isHoliday}
          holidayName={holidayName}
          effectType={primaryEffect}
        />
      )}
      
      <div
        id="mobile-scroll-container"
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overscroll-y-contain",
          withBottomNav && "pb-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height,44px))]"
        )}
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * MobilePageHeader - Sticky mobile-friendly page header
 */
interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backButton?: boolean;
  onBack?: () => void;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  action,
  backButton = false,
  onBack,
  className,
}: MobilePageHeaderProps) {
  const { isMobile } = useMobile();

  return (
    <div
      className={cn(
        'mobile-header bg-background border-b border-border',
        'px-2.5 py-1.5 sm:px-4 sm:py-3 md:px-6 md:py-4',
        className
      )}
      style={{
        minHeight: isMobile
          ? `${MOBILE_CONFIG.header.heightMobile}px`
          : `${MOBILE_CONFIG.header.heightTablet}px`,
      }}
    >
      <div className="flex flex-col gap-1 sm:gap-3">
        <div className="flex items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            {backButton && onBack && (
              <button
                onClick={onBack}
                className="mobile-touch-target shrink-0 hover-elevate active-elevate-2 rounded-lg"
                style={{
                  minHeight: `${MOBILE_CONFIG.touchTargets.minHeight}px`,
                  minWidth: `${MOBILE_CONFIG.touchTargets.minWidth}px`,
                  padding: `${MOBILE_CONFIG.touchTargets.padding}px`,
                }}
                data-testid="button-back"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  'font-bold',
                  isMobile ? 'text-sm xs:text-base sm:text-lg leading-tight' : 'text-2xl'
                )}
                style={isMobile ? { fontSize: 'clamp(0.8rem, 4vw, 1.125rem)' } : undefined}
              >
                {title}
              </h1>
              {subtitle && (
                <p className={cn(
                  'text-muted-foreground mt-0.5',
                  isMobile ? 'text-[10px] sm:text-xs leading-tight line-clamp-1' : 'text-sm truncate'
                )}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && !isMobile && <div className="shrink-0 flex-none ml-1">{action}</div>}
        </div>
        {action && isMobile && <div className="w-full">{action}</div>}
      </div>
    </div>
  );
}

/**
 * MobileGrid - Responsive grid that adapts to screen size
 * Uses MOBILE_CONFIG for columns configuration
 * Supports any column count from 1-12, responsive across breakpoints
 */
interface MobileGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: number;
  className?: string;
}

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>(() => {
    if (typeof window === 'undefined') return 'mobile';
    const width = window.innerWidth;
    if (width >= DESKTOP_BREAKPOINT) return 'desktop';
    if (width >= TABLET_BREAKPOINT) return 'tablet';
    return 'mobile';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= DESKTOP_BREAKPOINT) setBreakpoint('desktop');
      else if (width >= TABLET_BREAKPOINT) setBreakpoint('tablet');
      else setBreakpoint('mobile');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

export function MobileGrid({
  children,
  cols = {
    mobile: MOBILE_CONFIG.grid.columnsMobile,
    tablet: MOBILE_CONFIG.grid.columnsTablet,
    desktop: MOBILE_CONFIG.grid.columnsDesktop,
  },
  gap = MOBILE_CONFIG.spacing.md,
  className,
}: MobileGridProps) {
  const breakpoint = useBreakpoint();

  const mobileCol = Math.max(1, Math.min(12, cols.mobile ?? 1));
  const tabletCol = Math.max(1, Math.min(12, cols.tablet ?? 2));
  const desktopCol = Math.max(1, Math.min(12, cols.desktop ?? 4));

  const columnCount = breakpoint === 'desktop' ? desktopCol :
                      breakpoint === 'tablet' ? tabletCol : mobileCol;

  return (
    <div
      className={cn('grid w-full', className)}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * MobileCard - Mobile-optimized card with touch feedback
 */
interface MobileCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  interactive?: boolean;
}

export function MobileCard({
  children,
  onClick,
  className,
  interactive = false,
}: MobileCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-lg p-4',
        interactive && 'hover-elevate active-elevate-2 mobile-active-state cursor-pointer',
        className
      )}
      data-testid="mobile-card"
    >
      {children}
    </div>
  );
}
