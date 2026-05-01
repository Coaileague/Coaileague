import React from 'react';
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface LockedFeatureProps {
  featureName: string;
  description: string;
  requiredTier: string;
  price: string;
  children?: React.ReactNode;
}

export function LockedFeature({
  featureName,
  description,
  requiredTier,
  price,
  children,
}: LockedFeatureProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="locked-feature p-6 relative">
      <div className="lock-badge">
        <Lock className="w-3 h-3" />
        <span>{requiredTier}</span>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white/90 mb-2">{featureName}</h3>
          <p className="text-sm text-white/60">{description}</p>
        </div>

        {children && (
          <div className="pointer-events-none opacity-50 blur-sm">
            {children}
          </div>
        )}

        <Button
          onClick={() => setLocation("/settings?tab=billing")}
          className="w-full bg-indigo-gradient hover:opacity-90 btn-scale"
          data-testid={`button-upgrade-${featureName.toLowerCase().replace(/\s+/g, '-')}`}
        >
          Upgrade to {requiredTier} - {price}
        </Button>

        <p className="text-xs text-center text-white/40">
          Unlock this feature and more with {requiredTier}
        </p>
      </div>
    </div>
  );
}

interface FeatureGateProps {
  hasAccess: boolean;
  featureName: string;
  description: string;
  requiredTier: string;
  price: string;
  children: React.ReactNode;
}

export function FeatureGate({
  hasAccess,
  featureName,
  description,
  requiredTier,
  price,
  children,
}: FeatureGateProps) {
  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <LockedFeature
      featureName={featureName}
      description={description}
      requiredTier={requiredTier}
      price={price}
    >
      {children}
    </LockedFeature>
  );
}
