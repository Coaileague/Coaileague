import { Loader2 } from 'lucide-react';
import type { ButtonVariant, ButtonSize } from '@/lib/tokens';
import { OVERFLOW } from '@/lib/tokens';

interface UniversalButtonProps {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  iconOnly?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  truncate?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
  'aria-label'?: string;
}

const sizeMap: Record<ButtonSize, { height: string; padding: string; fontSize: string; gap: string }> = {
  xs: { height: '28px',  padding: '0 8px',   fontSize: 'var(--text-xs)',  gap: '4px' },
  sm: { height: '34px',  padding: '0 12px',  fontSize: 'var(--text-sm)',  gap: '6px' },
  md: { height: '40px',  padding: '0 16px',  fontSize: 'var(--text-base)', gap: '8px' },
  lg: { height: '48px',  padding: '0 20px',  fontSize: 'var(--text-md)',   gap: '8px' },
  xl: { height: '56px',  padding: '0 24px',  fontSize: 'var(--text-md)',   gap: '10px' },
};

function variantStyles(v: ButtonVariant): React.CSSProperties {
  switch (v) {
    case 'primary':
      return {
        background: 'var(--color-brand-primary)',
        color: 'var(--color-text-inverse)',
        border: '1px solid var(--color-brand-primary)',
      };
    case 'secondary':
      return {
        background: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-primary)',
        border: `1px solid var(--color-border-default)`,
      };
    case 'outline':
      return {
        background: 'transparent',
        color: 'var(--color-brand-primary)',
        border: `1px solid var(--color-brand-primary)`,
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid transparent',
      };
    case 'danger':
      return {
        background: 'var(--color-danger)',
        color: '#fff',
        border: '1px solid var(--color-danger)',
      };
    case 'success':
      return {
        background: 'var(--color-success)',
        color: '#fff',
        border: '1px solid var(--color-success)',
      };
  }
}

export function UniversalButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  iconOnly = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  truncate = false,
  onClick,
  type = 'button',
  className = '',
  style,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: UniversalButtonProps) {
  const sz = sizeMap[size];
  const vs = variantStyles(variant);

  const isDisabled = disabled || loading;

  const iconSize = size === 'xs' || size === 'sm' ? 14 : size === 'lg' || size === 'xl' ? 18 : 16;

  const computedHeight = iconOnly ? sz.height : `max(${sz.height}, var(--u-touch-min))`;

  return (
    <button
      data-testid={testId}
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sz.gap,
        height: computedHeight,
        minHeight: computedHeight,
        width: iconOnly ? sz.height : fullWidth ? '100%' : 'auto',
        minWidth: iconOnly ? sz.height : truncate ? 0 : undefined,
        padding: iconOnly ? '0' : sz.padding,
        fontSize: sz.fontSize,
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-medium)' as any,
        lineHeight: 1,
        borderRadius: iconOnly ? 'var(--radius-full)' : 'var(--radius-md)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: `
          transform var(--duration-fast) var(--ease-default),
          filter var(--duration-fast) var(--ease-default),
          opacity var(--duration-fast)
        `,
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        flexShrink: truncate ? 1 : 0,
        overflow: truncate ? 'hidden' : undefined,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        ...vs,
        ...style,
      }}
      onPointerDown={(e) => {
        if (!isDisabled) {
          (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)';
          (e.currentTarget as HTMLElement).style.filter = 'brightness(0.9)';
        }
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLElement).style.filter = 'none';
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLElement).style.filter = 'none';
      }}
    >
      {loading ? (
        <>
          <Loader2 size={iconSize} style={{ animation: 'spin 0.8s linear infinite' }} />
          {!iconOnly && children && (
            <span style={truncate ? { ...OVERFLOW.ellipsis, flex: 1, minWidth: 0 } : undefined}>
              {children}
            </span>
          )}
        </>
      ) : (
        <>
          {icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
          {!iconOnly && children && (
            <span style={truncate ? { ...OVERFLOW.ellipsis, flex: 1, minWidth: 0 } : undefined}>
              {children}
            </span>
          )}
          {iconRight && <span style={{ display: 'flex', flexShrink: 0 }}>{iconRight}</span>}
          {iconOnly && icon}
        </>
      )}
    </button>
  );
}
