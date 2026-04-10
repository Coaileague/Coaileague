/**
 * CoAIleague Design System Components — Navy + Gold Brand Theme
 *
 * Universal building blocks for the dark-navy page overhaul.
 * Import from "@/components/ui/ds-components"
 *
 * Components:
 *   DsPageHeader  — Page title + optional subtitle + right action slot
 *   DsStatCard    — KPI card with colored number and label
 *   DsTabBar      — Horizontal tab switcher (active = gold left border)
 *   DsEmptyState  — Centered empty-state with icon, title, subtitle, optional CTA
 *   DsDataRow     — List item row (hover = navy-light)
 *   DsSectionCard — Content panel with optional header
 *   DsBadge       — Status pill badge
 *   DsNavCard     — Dark card for navigation grids (used in NavigationOverlay)
 */

import { cn } from '@/lib/utils';
// @ts-expect-error — TS migration: fix in refactoring sprint
import type { ReactNode, LucideIcon, ButtonHTMLAttributes } from 'react';

// ─── CSS helpers ─────────────────────────────────────────────────────────────

const navy    = 'var(--ds-navy)';
const navyMid = 'var(--ds-navy-mid)';
const navyLt  = 'var(--ds-navy-light)';
const border  = 'var(--ds-border)';
const gold    = 'var(--ds-gold)';
const goldGlow = 'var(--ds-gold-glow)';
const goldBorder = 'var(--ds-gold-border)';
const textPrimary   = 'var(--ds-text-primary)';
const textSecondary = 'var(--ds-text-secondary)';
const textMuted     = 'var(--ds-text-muted)';
const fontDisplay = 'var(--ds-font-display)';
const fontBody    = 'var(--ds-font-body)';
const fontMono    = 'var(--ds-font-mono)';

// ─── DsPageHeader ─────────────────────────────────────────────────────────────

interface DsPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function DsPageHeader({ title, subtitle, actions, className }: DsPageHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 pb-4 mb-4 flex-wrap', className)}
      style={{ borderBottom: `1px solid ${border}` }}
    >
      <div className="min-w-0">
        <h1
          className="leading-tight"
          style={{
            fontFamily: fontDisplay,
            fontWeight: 700,
            fontSize: 'clamp(22px, 4vw, 28px)',
            color: textPrimary,
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-0.5"
            style={{ fontFamily: fontBody, fontSize: 14, color: gold }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ─── DsStatCard ───────────────────────────────────────────────────────────────

interface DsStatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: 'gold' | 'success' | 'danger' | 'warning' | 'info' | 'muted';
  className?: string;
}

const statColors: Record<NonNullable<DsStatCardProps['color']>, string> = {
  gold:    'var(--ds-gold)',
  success: 'var(--ds-success)',
  danger:  'var(--ds-danger)',
  warning: 'var(--ds-warning)',
  info:    'var(--ds-info)',
  muted:   'var(--ds-text-secondary)',
};

export function DsStatCard({ label, value, icon: Icon, color = 'gold', className }: DsStatCardProps) {
  const valueColor = statColors[color];

  return (
    <div
      className={cn('group rounded-md p-5 transition-all duration-200 cursor-default', className)}
      style={{
        background: navyMid,
        border: `1px solid ${border}`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = goldBorder;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${goldGlow}`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = border;
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {Icon && (
        <div className="mb-2" style={{ color: valueColor, opacity: 0.7 }}>
          <Icon size={18} />
        </div>
      )}
      <div
        style={{
          fontFamily: fontDisplay,
          fontWeight: 700,
          fontSize: 36,
          lineHeight: 1,
          color: valueColor,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      <div
        className="mt-1.5 uppercase tracking-widest"
        style={{ fontFamily: fontBody, fontSize: 11, color: textMuted }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── DsTabBar ─────────────────────────────────────────────────────────────────

interface DsTab {
  id: string;
  label: string;
  count?: number;
}

interface DsTabBarProps {
  tabs: DsTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function DsTabBar({ tabs, activeTab, onTabChange, className }: DsTabBarProps) {
  return (
    <div
      className={cn('flex gap-0.5 overflow-x-auto scrollbar-hide', className)}
      style={{
        background: navyMid,
        borderRadius: 10,
        padding: 4,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg transition-all duration-150 whitespace-nowrap outline-none focus-visible:ring-2"
            style={{
              padding: '7px 14px',
              fontFamily: fontBody,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? textPrimary : textMuted,
              background: isActive ? navyLt : 'transparent',
              borderLeft: isActive ? `2px solid ${gold}` : '2px solid transparent',
              transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = textSecondary;
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = textMuted;
            }}
            data-testid={`ds-tab-${tab.id}`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="rounded-full px-1.5 py-0.5 leading-none"
                style={{
                  fontFamily: fontBody,
                  fontSize: 10,
                  fontWeight: 700,
                  background: isActive ? gold : 'rgba(201,149,42,0.15)',
                  color: isActive ? '#000' : gold,
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── DsEmptyState ─────────────────────────────────────────────────────────────

interface DsEmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function DsEmptyState({ icon: Icon, title, subtitle, action, className }: DsEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center px-4', className)}>
      <div
        className="mb-4 rounded-md flex items-center justify-center"
        style={{ width: 72, height: 72, background: goldGlow }}
      >
        <Icon size={36} style={{ color: gold, opacity: 0.7 }} strokeWidth={1.5} />
      </div>
      <h3
        style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 20, color: textSecondary }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          className="mt-1.5 max-w-xs"
          style={{ fontFamily: fontBody, fontSize: 14, color: textMuted }}
        >
          {subtitle}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── DsDataRow ────────────────────────────────────────────────────────────────

interface DsDataRowProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function DsDataRow({ children, className, onClick, interactive = false }: DsDataRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        (interactive || onClick) && 'cursor-pointer',
        className,
      )}
      style={{
        background: navyMid,
        borderBottom: `1px solid ${border}`,
        padding: '14px 20px',
        transition: 'background 120ms ease',
      }}
      onClick={onClick}
      onMouseEnter={e => {
        if (interactive || onClick) {
          (e.currentTarget as HTMLElement).style.background = navyLt;
        }
      }}
      onMouseLeave={e => {
        if (interactive || onClick) {
          (e.currentTarget as HTMLElement).style.background = navyMid;
        }
      }}
    >
      {children}
    </div>
  );
}

// ─── DsSectionCard ────────────────────────────────────────────────────────────

interface DsSectionCardProps {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function DsSectionCard({ title, children, actions, className, bodyClassName, noPadding }: DsSectionCardProps) {
  return (
    <div
      className={cn('rounded-md overflow-hidden', className)}
      style={{ background: navyMid, border: `1px solid ${border}` }}
    >
      {title && (
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <span
            className="uppercase tracking-wide"
            style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 13, color: textSecondary }}
          >
            {title}
          </span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'p-5', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

// ─── DsBadge ─────────────────────────────────────────────────────────────────

interface DsBadgeProps {
  children: ReactNode;
  color?: 'gold' | 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'muted';
  className?: string;
}

const badgeStyles: Record<NonNullable<DsBadgeProps['color']>, { bg: string; text: string; border: string }> = {
  gold:    { bg: 'rgba(201,149,42,0.15)', text: 'var(--ds-gold)',    border: 'rgba(201,149,42,0.30)' },
  success: { bg: 'rgba(34,197,94,0.12)',  text: 'var(--ds-success)', border: 'rgba(34,197,94,0.25)' },
  danger:  { bg: 'rgba(239,68,68,0.12)',  text: 'var(--ds-danger)',  border: 'rgba(239,68,68,0.25)' },
  warning: { bg: 'rgba(245,158,11,0.12)', text: 'var(--ds-warning)', border: 'rgba(245,158,11,0.25)' },
  info:    { bg: 'rgba(59,130,246,0.12)', text: 'var(--ds-info)',    border: 'rgba(59,130,246,0.25)' },
  purple:  { bg: 'rgba(124,58,237,0.12)', text: 'var(--ds-trinity)', border: 'rgba(124,58,237,0.25)' },
  muted:   { bg: 'rgba(74,106,150,0.15)', text: 'var(--ds-text-secondary)', border: 'rgba(74,106,150,0.25)' },
};

export function DsBadge({ children, color = 'muted', className }: DsBadgeProps) {
  const s = badgeStyles[color];
  return (
    <span
      className={cn('inline-flex items-center rounded-full leading-none whitespace-nowrap', className)}
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        fontFamily: fontBody,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '3px 8px',
      }}
    >
      {children}
    </span>
  );
}

// ─── DsButton ─────────────────────────────────────────────────────────────────

interface DsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'danger' | 'trinity' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const btnBase: Record<NonNullable<DsButtonProps['variant']>, object> = {
  primary: {
    background: gold,
    color: '#000',
    border: `1px solid ${gold}`,
  },
  outline: {
    background: 'transparent',
    color: gold,
    border: `1px solid ${goldBorder}`,
  },
  danger: {
    background: 'rgba(239,68,68,0.10)',
    color: 'var(--ds-danger)',
    border: '1px solid rgba(239,68,68,0.35)',
  },
  trinity: {
    background: 'rgba(124,58,237,0.20)',
    color: '#fff',
    border: '1px solid rgba(124,58,237,0.45)',
  },
  ghost: {
    background: 'transparent',
    color: textSecondary,
    border: '1px solid transparent',
  },
};

const btnSizes: Record<NonNullable<DsButtonProps['size']>, string> = {
  sm: '7px 14px',
  md: '9px 18px',
  lg: '11px 24px',
};

const btnFontSizes: Record<NonNullable<DsButtonProps['size']>, number> = {
  sm: 12,
  md: 13,
  lg: 15,
};

export function DsButton({ variant = 'primary', size = 'md', children, className, style, disabled, ...rest }: DsButtonProps) {
  const base = btnBase[variant];
  return (
    <button
      {...rest}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 outline-none focus-visible:ring-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      style={{
        ...base,
        fontFamily: fontBody,
        fontWeight: 600,
        fontSize: btnFontSizes[size],
        padding: btnSizes[size],
        letterSpacing: '0.02em',
        ...(style || {}),
      }}
      onMouseEnter={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        if (variant === 'primary') el.style.background = 'var(--ds-gold-light)';
        else if (variant === 'outline') el.style.background = goldGlow;
        else if (variant === 'trinity') el.style.boxShadow = '0 0 12px var(--ds-trinity-glow)';
      }}
      onMouseLeave={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        if (variant === 'primary') el.style.background = gold;
        else if (variant === 'outline') el.style.background = 'transparent';
        else if (variant === 'trinity') el.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

// ─── DsNavCard ────────────────────────────────────────────────────────────────

interface DsNavCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  badgeColor?: DsBadgeProps['color'];
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DsNavCard({ icon: Icon, title, description, badge, badgeColor = 'gold', isActive, onClick, className }: DsNavCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-3 rounded-md p-4 text-left w-full outline-none focus-visible:ring-2 transition-all duration-150',
        className,
      )}
      style={{
        background: isActive ? navyLt : navyMid,
        border: `1px solid ${isActive ? goldBorder : border}`,
        boxShadow: isActive ? `0 0 12px ${goldGlow}` : 'none',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = goldBorder;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = `0 4px 16px ${goldGlow}`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = isActive ? goldBorder : border;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = isActive ? `0 0 12px ${goldGlow}` : 'none';
      }}
    >
      {badge && (
        <div className="absolute top-3 right-3">
          <DsBadge color={badgeColor}>{badge}</DsBadge>
        </div>
      )}
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          width: 36,
          height: 36,
          background: isActive ? gold : goldGlow,
          transition: 'background 120ms ease',
        }}
      >
        <Icon
          size={18}
          style={{ color: isActive ? '#000' : gold, transition: 'color 120ms ease' }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate leading-tight"
          style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: textPrimary }}
        >
          {title}
        </div>
        {description && (
          <div
            className="truncate mt-0.5"
            style={{ fontFamily: fontBody, fontSize: 12, color: textMuted }}
          >
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── DsPageWrapper ────────────────────────────────────────────────────────────
// Wrap page content in the dark navy background

interface DsPageWrapperProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function DsPageWrapper({ children, className, padding = true }: DsPageWrapperProps) {
  return (
    <div
      className={cn('min-h-full w-full', padding && 'px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-8', className)}
      style={{ background: navy, color: textPrimary, fontFamily: fontBody }}
    >
      {children}
    </div>
  );
}

// ─── DsInput ──────────────────────────────────────────────────────────────────

interface DsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function DsInput({ label, className, style, ...rest }: DsInputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label style={{ fontFamily: fontBody, fontSize: 12, color: textMuted, fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        {...rest}
        className={cn('rounded-lg outline-none transition-all duration-150', className)}
        style={{
          background: navyMid,
          border: `1px solid ${border}`,
          color: textPrimary,
          fontFamily: fontBody,
          fontSize: 13,
          padding: '8px 12px',
          ...(style || {}),
        }}
        onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = goldBorder; }}
        onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = border; }}
      />
    </div>
  );
}
