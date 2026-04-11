import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PremiumBadge, CreditCostIndicator, FeatureLockedBadge } from "@/components/ui/premium-badge";
import { usePremiumFeatures, usePremiumAccess } from "@/hooks/use-premium-features";
import { Loader2, Mic, FileText, MapPin, Brain, FileCheck, TrendingUp, Scale, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const featureIcons: Record<string, typeof Mic> = {
  trinity_meeting_recording: Mic,
  ai_dar_generation: FileText,
  gps_photo_verification: MapPin,
  trinity_strategic_optimization: Brain,
  claude_contract_analysis: FileCheck,
  trinity_predictive_analytics: TrendingUp,
  multi_state_compliance: Scale,
  security_compliance_vault: Shield,
};

const tierToCategory: Record<string, "core" | "premium" | "elite"> = {
  free: "core",
  starter: "core",
  professional: "premium",
  enterprise: "elite",
};

function getTierCategory(minimumTier: string): "core" | "premium" | "elite" {
  if (minimumTier === "enterprise") return "elite";
  if (minimumTier === "professional") return "premium";
  return "core";
}

interface PremiumFeatureCardProps {
  feature: {
    id: string;
    name: string;
    description: string;
    minimumTier: string;
    creditCost: number;
    unit?: string;
  };
  onActivate?: (featureId: string) => void;
}

function PremiumFeatureCard({ feature, onActivate }: PremiumFeatureCardProps) {
  const { allowed, reason, isLoading } = usePremiumAccess(feature.id);
  const Icon = featureIcons[feature.id] || Brain;
  const tier = getTierCategory(feature.minimumTier);

  return (
    <Card className={cn("hover-elevate", !allowed && "opacity-75")} data-testid={`card-premium-feature-${feature.id}`}>
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{feature.name}</CardTitle>
            <PremiumBadge
              tier={tier}
              creditCost={feature.creditCost}
              showCreditCost={feature.creditCost > 0}
              size="sm"
            />
          </div>
          <CardDescription className="text-xs">{feature.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          {feature.creditCost > 0 && (
            <CreditCostIndicator credits={feature.creditCost} unit={feature.unit || "use"} />
          )}
          {feature.creditCost === 0 && (
            <span className="text-xs text-muted-foreground">Included in {feature.minimumTier}+</span>
          )}
          
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isLoading && !allowed && (
              <FeatureLockedBadge reason={reason} suggestedTier={feature.minimumTier} />
            )}
            {!isLoading && allowed && onActivate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onActivate(feature.id)}
                data-testid={`button-activate-${feature.id}`}
              >
                Use Feature
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PremiumFeaturesPanelProps {
  className?: string;
  onActivateFeature?: (featureId: string) => void;
}

export function PremiumFeaturesPanel({ className, onActivateFeature }: PremiumFeaturesPanelProps) {
  const { features, creditPackages, isLoading, error } = usePremiumFeatures();

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground", className)}>
        Failed to load premium features
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-testid="panel-premium-features">
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <PremiumFeatureCard
            key={feature.id}
            feature={feature}
            onActivate={onActivateFeature}
          />
        ))}
      </div>
      
      {/* Credit packages removed — platform uses per-seat billing with token allowances */}
    </div>
  );
}
