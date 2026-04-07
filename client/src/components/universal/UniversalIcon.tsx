// ARCHITECTURE NOTE: This component uses a wildcard import from lucide-react.
// Tree-shaking is disabled for this module (~800KB unminified impact).
// The wildcard import is REQUIRED because:
//   1. IconName type = keyof typeof Icons (exhaustive type from all lucide icons)
//   2. Runtime lookup: Icons[name] — requires the full namespace at runtime
// To optimize: migrate callers to direct named imports when icon names are known at compile time.
// PERF-001: Tracked. Alternative: replace with a curated IconRegistry if icon usage stabilizes.
import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { ICON_SIZES } from '@/lib/tokens';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const iconSizeMap: Record<IconSize, number> = ICON_SIZES;

export type IconName = keyof typeof Icons;

interface UniversalIconProps {
  name: IconName;
  size?: IconSize;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  'data-testid'?: string;
}

export function UniversalIcon({
  name,
  size = 'md',
  color,
  className,
  style,
  strokeWidth = 2,
  'data-testid': testId,
}: UniversalIconProps) {
  const Component = Icons[name] as React.ComponentType<LucideProps>;

  if (!Component) {
    if (import.meta.env.MODE !== 'production') {
      console.warn(`[UniversalIcon] Unknown icon: "${name}"`);
    }
    return null;
  }

  return (
    <Component
      data-testid={testId}
      size={iconSizeMap[size]}
      color={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      className={className}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
