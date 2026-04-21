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
import { CheckCircle2, Lock, Sparkles, Loader2 } from "lucide-react";
import type { PremiumFeature } from "@/data/premiumFeatures";
import { ROICalculator } from "./roi-calculator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { redirectToCheckout } from "@/lib/stripeCheckout";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: PremiumFeature | null;
}

const PRICING_TIERS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 299,
    description: 'Manual workforce management tools',
    maxEmployees: 25,
    maxClients: -1,
    features: [
      'Up to 25 employees',
      'Manual scheduling & time tracking',
      'Basic invoicing (manual entry)',
      'GPS clock-in/out verification',
      'Basic reports (PDF export)',
      '$20/employee/mo overages',
      'Email support (48hr)',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 599,
    description: 'Full automation for growing teams',
    maxEmployees: 50,
    maxClients: -1,
    popular: true,
    features: [
      'Up to 50 employees',
      'Smart scheduling & auto-assignment',
      'Auto-billing & invoicing (weekly/bi-weekly)',
      'Auto-payroll processing (weekly/bi-weekly)',
      'GPS + photo verification',
      'Advanced analytics & reporting',
      '$15/employee/mo overages',
      'Priority email support (24hr)',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 999,
    description: 'AI-powered workforce intelligence',
    maxEmployees: 150,
    maxClients: -1,
    features: [
      'Everything in Starter',
      'Up to 150 employees',
      'AI Records™ - Natural language search',
      'AI Analytics™ - AI analytics & predictions',
      'Predictive scheduling & cost optimization',
      '$150/mo AI tokens included',
      '$12/employee/mo overages',
      'Priority support (8hr)',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 2999,
    description: 'Complete workforce automation at scale',
    maxEmployees: -1,
    maxClients: -1,
    features: [
      'Everything in Professional',
      'Unlimited employees',
      'Premium AI features & insights',
      '$500/mo AI tokens included',
      'White-label branding',
      'API access & custom webhooks',
      '$10/employee/mo overages',
      'Dedicated account manager',
      'Priority support (2hr)',
    ],
  },
];

export function UpgradeModal({ isOpen, onClose, feature }: UpgradeModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string>('professional');
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceId] = useState(user?.workspace_id || '');

  const PRICE_MAP: Record<string, string> = {
    starter:      import.meta.env.VITE_STRIPE_STARTER_MONTHLY_PRICE_ID || '',
    professional: import.meta.env.VITE_STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || '',
    business:     import.meta.env.VITE_STRIPE_BUSINESS_MONTHLY_PRICE_ID || '',
    enterprise:   import.meta.env.VITE_STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || '',
  };

  const handleUpgrade = async () => {
    if (!workspaceId) {
      toast({ title: "Error", description: "No workspace found", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const priceId = PRICE_MAP[selectedTier];
      await redirectToCheckout(priceId, workspaceId);
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  if (!feature) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="full" className="max-h-[90vh] overflow-y-auto cad-panel">
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
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-upgrade" disabled={isLoading}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} data-testid="button-confirm-upgrade" disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing Payment...
              </>
            ) : (
              `Upgrade to ${PRICING_TIERS.find(t => t.id === selectedTier)?.name}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
