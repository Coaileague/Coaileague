import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
/**
 * WFLogo - Re-exports TrinityLogo for backwards compatibility
 * Single source of truth: trinity-logo.tsx
 */

import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { cn } from "@/lib/utils";

interface WFLogoProps {
  className?: string;
  size?: number;
}

export function WFLogo({ className = "", size = 24 }: WFLogoProps) {
  return <TrinityAnimatedLogo size={size} className={className} />;
}

export function WFLogoCompact({ className = "", size = 20 }: WFLogoProps) {
  return <TrinityAnimatedLogo size={size} className={cn("shrink-0", className)} />;
}
