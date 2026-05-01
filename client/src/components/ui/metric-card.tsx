import React from 'react';
/**
 * MetricCard — Unified data card component
 *
 * Replaces raw divs throughout workspace pages, portals, and dashboards.
 * Every card has: label, value, trend indicator, status badge, loading/error states.
 * Fortune 500 grade — no generic placeholders, no raw numbers without context.
 */
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Loader2 } from 'lucide-react';
import { StatusBadge, type StatusVariant } from './status-badge';
import { Skeleton } from './skeleton';

interface MetricCardProps {
  label: string;
  value?: string | number;
  subValue?: string;
  trend?: number;           // positive = up, negative = down
  trendLabel?: string;
  status?: StatusVariant;
  statusLabel?: string;
  icon?: React.ReactNode;
  accent?: 'green' | 'red' | 'amber' | 'blue' | 'purple';
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const ACCENT_STYLES = {
  green:  { border: 'border-l-2 border-l-green-500', icon: 'text-green-500', value: 'text-green-700 dark:text-green-400' },
  red:    { border: 'border-l-2 border-l-red-500',   icon: 'text-red-500',   value: 'text-red-700 dark:text-red-400' },
  amber:  { border: 'border-l-2 border-l-amber-500', icon: 'text-amber-500', value: 'text-amber-700 dark:text-amber-400' },
  blue:   { border: 'border-l-2 border-l-blue-500',  icon: 'text-blue-500',  value: 'text-blue-700 dark:text-blue-400' },
  purple: { border: 'border-l-2 border-l-purple-500',icon: 'text-purple-500',value: 'text-purple-700 dark:text-purple-400' },
};

export function MetricCard({
  label, value, subValue, trend, trendLabel, status, statusLabel,
  icon, accent, isLoading, isError, errorMessage, onClick, className, size = 'md',
}: MetricCardProps) {
  const accentStyle = accent ? ACCENT_STYLES[accent] : null;
  const isClickable = !!onClick;

  if (isLoading) {
    return (
      <div className={cn('bg-background rounded-xl border p-4 space-y-2', className)}>
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('bg-background rounded-xl border border-red-200 dark:border-red-800 p-4', className)}>
        <div className="flex items-center gap-2 text-red-500">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">{errorMessage || 'Unable to load'}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-background rounded-xl border p-4 transition-shadow',
        accentStyle?.border,
        isClickable && 'cursor-pointer hover:shadow-md hover:border-primary/30',
        size === 'sm' && 'p-3',
        size === 'lg' && 'p-5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('text-xs font-medium text-muted-foreground', size === 'lg' && 'text-sm')}>
          {label}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {status && <StatusBadge variant={status} label={statusLabel} size="xs" />}
          {icon && <span className={cn('w-4 h-4', accentStyle?.icon)}>{icon}</span>}
        </div>
      </div>

      <div className={cn('mt-1.5', size === 'sm' ? 'mt-1' : size === 'lg' ? 'mt-2' : '')}>
        <span className={cn(
          'font-semibold tabular-nums',
          size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl',
          accentStyle?.value ?? 'text-foreground'
        )}>
          {value ?? '—'}
        </span>
        {subValue && (
          <span className="ml-1.5 text-xs text-muted-foreground">{subValue}</span>
        )}
      </div>

      {(trend !== undefined || trendLabel) && (
        <div className="mt-1.5 flex items-center gap-1">
          {trend !== undefined && trend !== 0 && (
            trend > 0
              ? <TrendingUp className="w-3 h-3 text-green-500" />
              : <TrendingDown className="w-3 h-3 text-red-500" />
          )}
          {trend === 0 && <Minus className="w-3 h-3 text-muted-foreground" />}
          <span className={cn(
            'text-[10px] font-medium',
            trend === undefined ? 'text-muted-foreground' :
            trend > 0 ? 'text-green-600 dark:text-green-400' :
            trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
          )}>
            {trendLabel ?? (trend !== undefined ? `${trend > 0 ? '+' : ''}${trend}%` : '')}
          </span>
        </div>
      )}
    </div>
  );
}

// ── MetricGrid — responsive grid wrapper ──────────────────────────────────────
export function MetricGrid({ children, cols = 4, className }: {
  children: React.ReactNode; cols?: 2 | 3 | 4; className?: string;
}) {
  return (
    <div className={cn(
      'grid gap-3',
      cols === 2 ? 'grid-cols-1 sm:grid-cols-2' :
      cols === 3 ? 'grid-cols-1 sm:grid-cols-3' :
      'grid-cols-2 sm:grid-cols-4',
      className
    )}>
      {children}
    </div>
  );
}
