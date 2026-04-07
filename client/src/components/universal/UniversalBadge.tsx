import type { BadgeVariant } from '@/lib/tokens';
import { OVERFLOW } from '@/lib/tokens';

interface UniversalBadgeProps {
  children?: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
  count?: number;
  outline?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

function variantColors(v: BadgeVariant, outline: boolean): React.CSSProperties {
  const map: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
    default: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-secondary)', border: 'var(--color-border-default)' },
    success: { bg: 'var(--color-success)',         color: '#fff',                          border: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning)',         color: '#fff',                          border: 'var(--color-warning)' },
    danger:  { bg: 'var(--color-danger)',          color: '#fff',                          border: 'var(--color-danger)' },
    info:    { bg: 'var(--color-info)',            color: '#fff',                          border: 'var(--color-info)' },
    brand:   { bg: 'var(--color-brand-primary)',   color: 'var(--color-text-inverse)',     border: 'var(--color-brand-primary)' },
  };
  const c = map[v] ?? map.default;
  if (outline) {
    return {
      background: 'transparent',
      color: c.bg,
      border: `1px solid ${c.border}`,
    };
  }
  return {
    background: v === 'default' ? c.bg : `${c.bg}22`,
    color: v === 'default' ? c.color : c.bg,
    border: `1px solid ${v === 'default' ? c.border : `${c.bg}44`}`,
  };
}

const sizeStyles = {
  sm: { fontSize: 'var(--text-xs)',  padding: '2px 6px',  height: '18px', gap: '3px' },
  md: { fontSize: 'var(--text-xs)',  padding: '3px 8px',  height: '22px', gap: '4px' },
  lg: { fontSize: 'var(--text-sm)',  padding: '4px 10px', height: '26px', gap: '5px' },
};

export function UniversalBadge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  count,
  outline = false,
  className = '',
  style,
  'data-testid': testId,
}: UniversalBadgeProps) {
  const vc = variantColors(variant, outline);
  const sz = sizeStyles[size];

  const displayCount = count != null
    ? count > 99 ? '99+' : String(count)
    : null;

  if (dot) {
    const dotColor = vc.color === '#fff' ? 'var(--color-danger)' : vc.color;
    return (
      <span
        data-testid={testId}
        className={className}
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: '10px',
          height: '10px',
          borderRadius: 'var(--radius-full)',
          background: dotColor,
          flexShrink: 0,
          ...style,
        }}
      >
        {pulse && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-full)',
              background: dotColor,
              animation: 'u-pulse-ring 1.5s ease-out infinite',
            }}
          />
        )}
      </span>
    );
  }

  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sz.gap,
        height: sz.height,
        maxWidth: 'var(--u-badge-max-width)',
        padding: sz.padding,
        fontSize: sz.fontSize,
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-medium)' as any,
        lineHeight: 1,
        borderRadius: 'var(--radius-full)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        flexShrink: 0,
        ...vc,
        ...style,
      }}
    >
      {pulse && (
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            width: '6px',
            height: '6px',
            borderRadius: 'var(--radius-full)',
            background: 'currentColor',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-full)',
              background: 'currentColor',
              animation: 'u-pulse-ring 1.5s ease-out infinite',
            }}
          />
        </span>
      )}
      {displayCount ?? children}
    </span>
  );
}
