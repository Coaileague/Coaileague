/**
 * Token Usage Info Modal
 * Shows token allowance details and overage billing explanation.
 * Credit purchasing has been removed — platform uses per-seat billing.
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Cpu, TrendingUp, Check } from "lucide-react";

interface BuyCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyCreditsModal({ open, onOpenChange }: BuyCreditsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            AI Token Allowance
          </DialogTitle>
          <DialogDescription>
            CoAIleague uses per-seat billing. Your plan includes a monthly token allowance for all AI features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <span>Token allowance is included in your subscription — no separate credit purchases needed.</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <span>AI never stops working when you exceed your allowance — overage continues at $2.00 per 100,000 tokens.</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span>To increase your monthly token allowance, upgrade to a higher subscription tier.</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button asChild>
              <a href="/settings/billing">View Plans</a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


interface CreditPack {
  id: string;
  name: string;
  creditsAmount: number;
  bonusCredits: number | null;
  priceUsd: string;
  displayOrder: number;
  isPopular: boolean;
  description: string | null;
}

interface BuyCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyCreditsModal({ open, onOpenChange }: BuyCreditsModalProps) {
  const { toast } = useToast();

  // Fetch available credit packs
  const { data: packs, isLoading } = useQuery({
    queryKey: ['/api/credits/packs'],
    enabled: open,
  });

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (creditPackId: string) => {
      const baseUrl = window.location.origin;
      const response = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          creditPackId,
          successUrl: `${baseUrl}/usage?purchase=success`,
          cancelUrl: `${baseUrl}/usage?purchase=canceled`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      if (!data.sessionUrl) {
        throw new Error('No checkout URL returned');
      }

      return data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.sessionUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to initiate credit purchase. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePurchase = (packId: string) => {
    purchaseMutation.mutate(packId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Zap className="w-6 h-6 text-primary" />
            Buy Automation Credits
          </DialogTitle>
          <DialogDescription>
            Credits power all AI automations - scheduling, invoicing, payroll, and analytics. Purchase additional credits anytime.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {(packs as CreditPack[])?.map((pack: CreditPack) => {
              const totalCredits = pack.creditsAmount + (pack.bonusCredits || 0);
              const pricePerCredit = (parseFloat(pack.priceUsd) / totalCredits).toFixed(3);

              return (
                <Card
                  key={pack.id}
                  className={`relative p-6 hover-elevate ${pack.isPopular ? 'border-2 border-primary' : ''}`}
                  data-testid={`card-credit-pack-${pack.id}`}
                >
                  {pack.isPopular && (
                    <Badge className="absolute -top-3 left-4 bg-primary" data-testid="badge-popular">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Most Popular
                    </Badge>
                  )}

                  <div className="mb-4">
                    <h3 className="text-xl font-bold mb-1" data-testid={`text-pack-name-${pack.id}`}>
                      {pack.name}
                    </h3>
                    {pack.description && (
                      <p className="text-sm text-muted-foreground">{pack.description}</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-3xl font-bold" data-testid={`text-price-${pack.id}`}>
                        ${parseFloat(pack.priceUsd).toFixed(0)}
                      </span>
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ${pricePerCredit} per credit
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-600" />
                      <span data-testid={`text-credits-${pack.id}`}>
                        <strong>{pack.creditsAmount.toLocaleString()}</strong> automation credits
                      </span>
                    </div>
                    {pack.bonusCredits && pack.bonusCredits > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span data-testid={`text-bonus-${pack.id}`}>
                          <strong>+{pack.bonusCredits.toLocaleString()}</strong> bonus credits
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Zap className="w-4 h-4" />
                      <span>
                        {totalCredits.toLocaleString()} total credits
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    variant={pack.isPopular ? "default" : "outline"}
                    onClick={() => handlePurchase(pack.id)}
                    disabled={purchaseMutation.isPending}
                    data-testid={`button-buy-${pack.id}`}
                  >
                    {purchaseMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Buy ${pack.name}`
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
          <p className="font-semibold mb-2">💳 Secure Payment</p>
          <p>All payments are processed securely through Stripe. Credits are added instantly after payment confirmation.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
