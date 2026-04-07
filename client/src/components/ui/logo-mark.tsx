/**
 * LogoMark - Re-exports TrinityLogo with convenient size presets
 * Single source of truth: trinity-logo.tsx
 */

import { TrinityLogo } from "@/components/trinity-logo";
import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  animate?: boolean;
}

const sizeMap = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

export function LogoMark({ size = "md", className }: LogoMarkProps) {
  return (
    <TrinityLogo 
      size={sizeMap[size]} 
      className={cn("shrink-0", className)} 
    />
  );
}
