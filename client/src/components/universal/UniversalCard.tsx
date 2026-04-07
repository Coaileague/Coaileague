interface UniversalCardProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost' | 'gradient';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

const paddingValues = {
  none: '0',
  sm:   'var(--space-3)',
  md:   'var(--space-5)',
  lg:   'var(--space-6)',
} as const;

function cardBackground(variant: UniversalCardProps['variant']): string {
  switch (variant) {
    case 'elevated':  return 'var(--color-bg-tertiary)';
    case 'outlined':  return 'transparent';
    case 'ghost':     return 'transparent';
    case 'gradient':  return 'var(--color-bg-secondary)';
    default:          return 'var(--color-bg-secondary)';
  }
}

function cardBorder(variant: UniversalCardProps['variant']): string {
  switch (variant) {
    case 'outlined':  return `1px solid var(--color-border-emphasis)`;
    case 'ghost':     return 'none';
    case 'gradient':  return 'none';
    default:          return `1px solid var(--color-border-default)`;
  }
}

function cardShadow(variant: UniversalCardProps['variant']): string {
  switch (variant) {
    case 'elevated': return 'var(--shadow-md)';
    case 'ghost':    return 'none';
    default:         return 'var(--shadow-sm)';
  }
}

export function UniversalCard({
  children,
  title,
  subtitle,
  actions,
  footer,
  variant = 'default',
  padding = 'md',
  clickable = false,
  loading = false,
  className = '',
  onClick,
  style,
  'data-testid': testId,
}: UniversalCardProps) {
  const pad = paddingValues[padding];

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 'var(--radius-md)',
    background: cardBackground(variant),
    border: cardBorder(variant),
    boxShadow: cardShadow(variant),
    overflow: 'hidden',
    cursor: clickable ? 'pointer' : 'default',
    transition: clickable
      ? `transform var(--duration-fast) var(--ease-default),
         box-shadow var(--duration-fast) var(--ease-default)`
      : undefined,
    ...style,
  };

  if (variant === 'gradient') {
    Object.assign(cardStyle, {
      background: `
        linear-gradient(var(--color-bg-secondary), var(--color-bg-secondary)) padding-box,
        var(--color-brand-gradient) border-box
      `,
      border: '1px solid transparent',
    });
  }

  const handleClick = clickable ? onClick : undefined;

  const handlePointerDown = clickable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.99)';
      }
    : undefined;

  const handlePointerUp = clickable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
      }
    : undefined;

  if (loading) {
    return (
      <div
        data-testid={testId}
        className={`u-skeleton ${className}`}
        style={{ ...cardStyle, minHeight: '120px', background: undefined }}
      />
    );
  }

  return (
    <div
      data-testid={testId}
      className={className}
      style={cardStyle}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {/* Header */}
      {(title || subtitle || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: title || subtitle ? 'space-between' : 'flex-end',
            gap: 'var(--space-3)',
            padding: pad,
            paddingBottom: children || footer ? 'var(--space-3)' : pad,
          }}
        >
          {(title || subtitle) && (
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                <h3
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-base)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 'var(--weight-semibold)' as any,
                    color: 'var(--color-text-primary)',
                    lineHeight: 'var(--leading-tight)' as any,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 'var(--leading-normal)' as any,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          )}
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      )}

      {/* Body */}
      {children && (
        <div
          style={{
            padding: title || subtitle || actions ? `0 ${pad} ${pad}` : pad,
          }}
        >
          {children}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div
          style={{
            padding: `var(--space-3) ${pad}`,
            borderTop: `1px solid var(--color-border-subtle)`,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
