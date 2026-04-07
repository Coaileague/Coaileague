import { Badge } from "@/components/ui/badge";
import { Crown, Star, Sparkles, Lock, Coins } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PremiumTier = "core" | "premium" | "elite";

interface PremiumBadgeProps {
  tier: PremiumTier;
  creditCost?: number;
  showCreditCost?: boolean;
  className?: string;
  size?: "sm" | "default";
}

const tierConfig = {
  core: {
    label: "Core",
    icon: Star,
    className: "bg-muted text-muted-foreground",
    description: "Included in all plans",
  },
  premium: {
    label: "Premium",
    icon: Crown,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    description: "Professional tier or credits required",
  },
  elite: {
    label: "Elite",
    icon: Sparkles,
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    description: "Enterprise tier or add-on required",
  },
};

export function PremiumBadge({
  tier,
  creditCost,
  showCreditCost = true,
  className,
  size = "default",
}: PremiumBadgeProps) {
  const config = tierConfig[tier];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        config.className,
        size === "sm" && "text-xs py-0 px-1.5",
        className
      )}
      data-testid={`badge-premium-${tier}`}
    >
      <Icon className={cn("mr-1", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      {config.label}
      {showCreditCost && creditCost !== undefined && creditCost > 0 && (
        <span className="ml-1 flex items-center gap-0.5">
          <Coins className="h-3 w-3" />
          {creditCost}
        </span>
      )}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>{config.description}</p>
        {creditCost !== undefined && creditCost > 0 && (
          <p className="text-muted-foreground text-xs">
            Cost: {creditCost} credits per use
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

interface FeatureLockedBadgeProps {
  reason?: string;
  suggestedTier?: string;
  className?: string;
}

export function FeatureLockedBadge({
  reason,
  suggestedTier,
  className,
}: FeatureLockedBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "bg-destructive/10 text-destructive border-destructive/20",
            className
          )}
          data-testid="badge-feature-locked"
        >
          <Lock className="h-3 w-3 mr-1" />
          Locked
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{reason || "Feature not available"}</p>
        {suggestedTier && (
          <p className="text-muted-foreground text-xs">
            Upgrade to {suggestedTier} to unlock
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

interface CreditCostIndicatorProps {
  credits: number;
  unit?: string;
  className?: string;
}

export function CreditCostIndicator({
  credits,
  unit = "use",
  className,
}: CreditCostIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className
      )}
      data-testid="indicator-credit-cost"
    >
      <Coins className="h-3 w-3" />
      {credits} credits/{unit}
    </span>
  );
}
