/**
 * StatusBadge — Universal success/failure/pending/warning visual indicator
 *
 * Used everywhere: action buttons, workflow steps, form submissions,
 * data cards, portal tables, Trinity action cards.
 *
 * Green arrow (↑ CheckArrow) = submitted/acknowledged/completed
 * Red X = failed/rejected/error
 * Amber pulse = pending/processing
 * Gray = draft/inactive
 */
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, AlertTriangle, ArrowUpCircle, Minus } from 'lucide-react';

export type StatusVariant = 'success' | 'failure' | 'pending' | 'warning' | 'draft' | 'neutral';

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
  className?: string;
  iconOnly?: boolean;
}

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    dot: 'bg-green-500',
    label: 'Success',
  },
  failure: {
    icon: XCircle,
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    label: 'Failed',
  },
  pending: {
    icon: Clock,
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    label: 'Pending',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
    dot: 'bg-orange-500',
    label: 'Warning',
  },
  draft: {
    icon: Minus,
    bg: 'bg-slate-50 dark:bg-slate-800/40',
    text: 'text-slate-500 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
    label: 'Draft',
  },
  neutral: {
    icon: ArrowUpCircle,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
    label: 'Active',
  },
};

const SIZES = {
  xs: { pill: 'text-[10px] px-1.5 py-0.5 gap-1', icon: 'w-3 h-3', dot: 'w-1.5 h-1.5' },
  sm: { pill: 'text-xs px-2 py-0.5 gap-1.5', icon: 'w-3.5 h-3.5', dot: 'w-2 h-2' },
  md: { pill: 'text-sm px-2.5 py-1 gap-1.5', icon: 'w-4 h-4', dot: 'w-2 h-2' },
};

export function StatusBadge({ variant, label, size = 'sm', pulse, className, iconOnly }: StatusBadgeProps) {
  const cfg = VARIANTS[variant];
  const sz = SIZES[size];
  const Icon = cfg.icon;
  const displayLabel = label ?? cfg.label;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        cfg.bg, cfg.text, cfg.border, sz.pill, className
      )}
    >
      {pulse ? (
        <span className="relative flex shrink-0" style={{ width: sz.dot.split('w-')[1]?.split(' ')[0] ? undefined : null }}>
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', cfg.dot, sz.dot)} />
          <span className={cn('relative inline-flex rounded-full', cfg.dot, sz.dot)} />
        </span>
      ) : (
        <Icon className={cn('shrink-0', sz.icon)} />
      )}
      {!iconOnly && <span>{displayLabel}</span>}
    </span>
  );
}

// ── Standalone icons for inline use (tables, cards, buttons) ─────────────────

export function SuccessIcon({ className }: { className?: string }) {
  return <CheckCircle2 className={cn('text-green-500', className)} />;
}

export function FailureIcon({ className }: { className?: string }) {
  return <XCircle className={cn('text-red-500', className)} />;
}

export function PendingIcon({ className, pulse = true }: { className?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex">
      {pulse && <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75')} />}
      <span className={cn('relative inline-flex rounded-full w-2 h-2 bg-amber-500', className)} />
    </span>
  );
}

// ── Action result feedback (shows after button press) ────────────────────────

interface ActionResultProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  successMessage?: string;
  errorMessage?: string;
  className?: string;
}

export function ActionResult({ status, successMessage = 'Done', errorMessage = 'Failed', className }: ActionResultProps) {
  if (status === 'idle') return null;
  if (status === 'loading') return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
      Processing…
    </span>
  );
  if (status === 'success') return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium', className)}>
      <CheckCircle2 className="w-3.5 h-3.5" />
      {successMessage}
    </span>
  );
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium', className)}>
      <XCircle className="w-3.5 h-3.5" />
      {errorMessage}
    </span>
  );
}
