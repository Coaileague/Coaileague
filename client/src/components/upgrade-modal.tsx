import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import type { PremiumFeature } from "@/data/premiumFeatures";
import { ROICalculator } from "./roi-calculator";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: PremiumFeature | null;
}

const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    description: 'Essential automation for small teams',
    maxEmployees: 25,
    maxClients: -1,
    features: [
      'Up to 25 employees',
      'Unlimited clients',
      'Smart scheduling & time tracking',
      'Auto-billing & invoicing',
      'GPS clock-in/out verification',
      '$15/employee/mo overages',
      'Email support (24hr)',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 799,
    description: 'AI-powered workforce intelligence',
    maxEmployees: 100,
    maxClients: -1,
    popular: true,
    features: [
      'Everything in Starter',
      'Up to 100 employees',
      'RecordOS™ - Natural language search',
      'InsightOS™ - AI analytics & predictions',
      '$100/mo AI credits included',
      'Advanced analytics dashboard',
      '$12/employee/mo overages',
      'Priority support (8hr)',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 2999,
    description: 'Complete workforce automation platform',
    maxEmployees: 250,
    maxClients: -1,
    features: [
      'Everything in Professional',
      'Up to 250 employees',
      'Premium AI features & insights',
      '$500/mo AI credits included',
      'Auto-payroll processing',
      'White-label branding',
      '$10/employee/mo overages',
      'Dedicated account manager',
      'Priority support (2hr)',
    ],
  },
];

export function UpgradeModal({ isOpen, onClose, feature }: UpgradeModalProps) {
  const [selectedTier, setSelectedTier] = useState<string>('professional');

  const handleUpgrade = () => {
    // TODO: Integrate with Stripe checkout
    console.log('Upgrading to:', selectedTier, 'for feature:', feature?.id);
    // For now, just close the modal
    onClose();
  };

  if (!feature) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto cad-panel">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-md bg-[hsl(var(--cad-blue))]/10">
              <feature.icon className="h-6 w-6 text-[hsl(var(--cad-blue))]" />
            </div>
            <div>
              <DialogTitle className="text-xl cad-text-primary">
                Unlock {feature.name}
              </DialogTitle>
              <DialogDescription className="text-sm cad-text-secondary">
                {feature.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calculator" data-testid="tab-calculator">
              ROI Calculator
            </TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">
              Choose Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-4 mt-4">
            <ROICalculator feature={feature} />

            <div className="p-4 rounded-md bg-[hsl(var(--cad-blue))]/10 border border-[hsl(var(--cad-blue))]/20">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-[hsl(var(--cad-blue))] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold cad-text-primary mb-1">
                    Why {feature.name}?
                  </div>
                  <ul className="space-y-1">
                    {feature.benefits.map((benefit, idx) => (
                      <li key={idx} className="text-xs cad-text-secondary flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--cad-green))] flex-shrink-0 mt-0.5" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              {PRICING_TIERS.map((tier) => {
                const isSelected = selectedTier === tier.id;
                const includesFeature = 
                  (tier.id === 'professional' && feature.tier === 'professional') ||
                  (tier.id === 'enterprise');

                return (
                  <div
                    key={tier.id}
                    className={`cad-panel cursor-pointer transition-all relative ${
                      isSelected ? 'border-[hsl(var(--cad-blue))] ring-2 ring-[hsl(var(--cad-blue))]/20' : ''
                    }`}
                    onClick={() => setSelectedTier(tier.id)}
                    data-testid={`tier-${tier.id}`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-[hsl(var(--cad-blue))] text-white border-0">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-sm font-semibold cad-text-primary">
                          {tier.name}
                        </div>
                        <div className="text-xs cad-text-tertiary">
                          {tier.description}
                        </div>
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold cad-text-primary">
                          ${tier.price}
                        </span>
                        <span className="text-xs cad-text-tertiary">/month</span>
                      </div>

                      {includesFeature && (
                        <Badge 
                          variant="outline" 
                          className="bg-[hsl(var(--cad-green))]/10 border-[hsl(var(--cad-green))]/30 text-[hsl(var(--cad-green))]"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Includes {feature.name}
                          {feature.price > 0 && tier.id === 'professional' && (
                            <span className="ml-1">+${feature.price}/mo</span>
                          )}
                        </Badge>
                      )}

                      <ul className="space-y-2 pt-2 border-t border-[hsl(var(--cad-border))]">
                        {tier.features.map((f, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 cad-status-success flex-shrink-0 mt-0.5" />
                            <span className="cad-text-secondary">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {feature.status === 'coming_soon' && (
              <div className="p-4 rounded-md bg-[hsl(var(--cad-orange))]/10 border border-[hsl(var(--cad-orange))]/20">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-[hsl(var(--cad-orange))] flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--cad-orange))] mb-1">
                      Coming Soon
                    </div>
                    <div className="text-xs cad-text-secondary">
                      This feature is currently in development. Upgrade your plan now to get early access when it launches.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-upgrade">
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} data-testid="button-confirm-upgrade">
            Upgrade to {PRICING_TIERS.find(t => t.id === selectedTier)?.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
