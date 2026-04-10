/**
 * TrinityAnimatedLogo — animated wrapper around the CoAIleague Trinity arrow mark.
 *
 * STRICT BRAND RULE (2026-04-09): this component renders the canonical
 * CoAIleagueLogoMark (3-arrow Trinity symbol) with a state-driven CSS
 * animation class. It NEVER renders the old 5-petal ribbon knot or any
 * "blob/flower" mascot geometry.
 *
 * Animation states (applied as CSS classes):
 *   - idle       → `animate-trinity-pulse` (slow breathing glow)
 *   - thinking   → `animate-trinity-spin`  (spin while generating)
 *   - responding → `animate-trinity-fade`  (fade-in as text appears)
 *
 * For richer 10-state animation (speaking, listening, success, error, etc.)
 * use `ColorfulCelticKnot` from `@/components/ui/colorful-celtic-knot`.
 *
 * Size + mode props are preserved for backward compatibility with any
 * existing callers. `mode` is a no-op; the arrow mark has one canonical
 * colour palette and does not fork per Trinity mode.
 *
 * Canonical arrow mark source: `@/components/ui/coaileague-logo-mark.tsx`
 */

import { cn } from "@/lib/utils";
import { CoAIleagueLogoMark } from "@/components/ui/coaileague-logo-mark";

type AnimationState = "idle" | "thinking" | "responding";
type TrinityMode = "business" | "personal" | "integrated";

interface TrinityAnimatedLogoProps {
  size?: "sm" | "md" | "lg";
  state?: AnimationState;
  /** @deprecated kept for backward compatibility; no visual effect. */
  mode?: TrinityMode;
  className?: string;
}

const sizeMap: Record<NonNullable<TrinityAnimatedLogoProps["size"]>, number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

const animationClassByState: Record<AnimationState, string> = {
  idle: "animate-trinity-pulse",
  thinking: "animate-trinity-spin",
  responding: "animate-trinity-fade",
};

export function TrinityAnimatedLogo({
  size = "md",
  state = "idle",
  className,
}: TrinityAnimatedLogoProps) {
  return (
    <CoAIleagueLogoMark
      size={sizeMap[size]}
      className={cn("transition-all", animationClassByState[state], className)}
    />
  );
}

export function TrinityThinkingIndicator({
  className,
}: { mode?: TrinityMode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TrinityAnimatedLogo size="sm" state="thinking" />
      <span className="text-sm text-muted-foreground animate-pulse">
        Trinity is thinking...
      </span>
    </div>
  );
}
