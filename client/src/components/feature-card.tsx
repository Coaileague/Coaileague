import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, Clock, TrendingUp, Crown, Info } from "lucide-react";
import type { PremiumFeature } from "@/data/premiumFeatures";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FeatureCardProps {
  feature: PremiumFeature;
  isLocked: boolean;
  onUnlock?: () => void;
  className?: string;
}

export function FeatureCard({ feature, isLocked, onUnlock, className }: FeatureCardProps) {
  const Icon = feature.icon;
  
  return (
    <Card 
      className={cn(
        "cad-panel relative overflow-hidden transition-all",
        isLocked && "opacity-60",
        !isLocked && "border-[hsl(var(--cad-blue))]",
        className
      )}
      data-testid={`feature-card-${feature.id}`}
    >
      {/* Lock indicator overlay */}
      {isLocked && (
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-[hsl(var(--cad-chrome))] rounded-full p-2 border border-[hsl(var(--cad-border-strong))]">
            <Lock className="h-4 w-4 cad-text-tertiary" />
          </div>
        </div>
      )}

      {/* Unlocked indicator */}
      {!isLocked && (
        <div className="absolute top-4 right-4 z-10">
          <Badge className="bg-[hsl(var(--cad-green))] text-white border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-3 rounded-md",
            isLocked 
              ? "bg-[hsl(var(--cad-surface-elevated))]" 
              : "bg-[hsl(var(--cad-blue))]/10"
          )}>
            <Icon className={cn(
              "h-6 w-6",
              isLocked ? "cad-text-tertiary" : "text-[hsl(var(--cad-blue))]"
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base cad-text-primary">
                {feature.name}
              </CardTitle>
              {feature.status === 'coming_soon' && (
                <Badge variant="outline" className="cad-compact">
                  <Clock className="h-3 w-3 mr-1" />
                  Coming Soon
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs cad-text-secondary">
              {feature.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3 space-y-3">
        {/* ROI Badge */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md",
          "bg-[hsl(var(--cad-green))]/10 border border-[hsl(var(--cad-green))]/20"
        )}>
          <TrendingUp className="h-4 w-4 text-[hsl(var(--cad-green))]" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-[hsl(var(--cad-green))] flex items-center gap-1">
              {feature.savings.label}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help opacity-70" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Estimates based on BLS median wages. Actual results vary by organization.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-xs cad-text-tertiary">
              Up to ${feature.savings.value.toLocaleString()}/year potential savings
            </div>
          </div>
        </div>

        {/* Benefits list */}
        <ul className="space-y-1">
          {feature.benefits.slice(0, 3).map((benefit, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <CheckCircle2 className={cn(
                "h-3.5 w-3.5 mt-0.5 flex-shrink-0",
                isLocked ? "cad-text-tertiary" : "text-[hsl(var(--cad-green))]"
              )} />
              <span className="cad-text-secondary">{benefit}</span>
            </li>
          ))}
          {feature.benefits.length > 3 && (
            <li className="text-xs cad-text-tertiary pl-5">
              +{feature.benefits.length - 3} more features
            </li>
          )}
        </ul>
      </CardContent>

      <CardFooter className="pt-3 border-t border-[hsl(var(--cad-border))]">
        {isLocked ? (
          <div className="w-full space-y-2">
            {feature.price > 0 ? (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold cad-text-primary">
                  ${feature.price}
                </span>
                <span className="text-xs cad-text-tertiary">/month</span>
                <span className="ml-auto text-xs cad-text-tertiary">
                  ROI: {Math.round((feature.savings.value / (feature.price * 12)) * 100)}%
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cad-blue))]/10 border border-[hsl(var(--cad-blue))]/20">
                <Crown className="h-4 w-4 text-[hsl(var(--cad-blue))]" />
                <span className="text-xs font-semibold text-[hsl(var(--cad-blue))]">
                  Included in Enterprise Plan
                </span>
              </div>
            )}
            <Button 
              onClick={onUnlock}
              className="w-full"
              variant="default"
              size="sm"
              data-testid={`unlock-${feature.id}`}
            >
              <Lock className="h-3.5 w-3.5 mr-2" />
              Unlock Feature
            </Button>
          </div>
        ) : (
          <div className="w-full">
            <Button 
              variant="outline" 
              size="sm"
              className="w-full"
              data-testid={`manage-${feature.id}`}
            >
              Manage Settings
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
