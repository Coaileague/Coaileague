import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, Check, TrendingUp, Crown, Zap } from "lucide-react";
import type { Workspace } from "@shared/schema";

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: workspace, isLoading } = useQuery<Workspace>({
    queryKey: ["/api/workspace"],
    enabled: !!user,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (tier: string) => {
      return await apiRequest(`/api/workspace/upgrade`, {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
      toast({
        title: "Upgrade Successful!",
        description: "Your workspace has been upgraded. Features are now unlocked.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upgrade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentTier = workspace?.subscriptionTier || "professional";
  const platformFee = workspace?.platformFeePercentage || 10;

  const tiers = [
    {
      id: "starter",
      name: "Starter",
      price: "$299",
      pricePerMonth: 299,
      platformFee: "10%",
      platformFeeValue: 10,
      description: "Essential automation for small teams",
      features: [
        "Up to 25 employees",
        "Smart scheduling & time tracking",
        "Auto-billing & invoicing",
        "GPS clock-in/out verification",
        "Photo verification",
        "Basic analytics & reporting",
        "$15/employee/mo for additional staff",
        "Email support (24hr)",
      ],
      savings: "$5k-$8k/month",
    },
    {
      id: "professional",
      name: "Professional",
      price: "$799",
      pricePerMonth: 799,
      platformFee: "7%",
      platformFeeValue: 7,
      description: "AI-powered workforce intelligence",
      popular: true,
      features: [
        "Everything in Starter",
        "Up to 100 employees",
        "RecordOS™ - Natural language search",
        "InsightOS™ - AI analytics & predictions",
        "$100/mo AI credits included",
        "Advanced analytics dashboard",
        "$12/employee/mo for additional staff",
        "Priority support (8hr)",
      ],
      savings: "$15k-$25k/month",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "$2,999",
      pricePerMonth: 2999,
      platformFee: "5%",
      platformFeeValue: 5,
      description: "Complete workforce automation platform",
      features: [
        "Everything in Professional",
        "Up to 250 employees",
        "Premium AI features & insights",
        "$500/mo AI credits included",
        "Auto-payroll processing",
        "SOC2-ready compliance",
        "White-label branding",
        "$10/employee/mo for additional staff",
        "Dedicated account manager",
        "Priority support (2hr)",
      ],
      savings: "$40k-$60k/month",
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-7xl">
      {/* Current Plan Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your workspace subscription and unlock advanced features
        </p>
      </div>

      {/* Current Plan Card */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Crown className="h-6 w-6 text-primary" />
                Current Plan: {tiers.find(t => t.id === currentTier)?.name || "Professional"}
              </CardTitle>
              <CardDescription className="mt-2">
                Platform fee: <span className="text-lg font-semibold text-primary">{platformFee}%</span> on all transactions
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {tiers.find(t => t.id === currentTier)?.price || "$799"}/mo
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Upgrade Options */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold">Upgrade Your Plan</h2>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => {
            const isCurrent = tier.id === currentTier;
            const isDowngrade = tiers.findIndex(t => t.id === tier.id) < tiers.findIndex(t => t.id === currentTier);

            return (
              <Card 
                key={tier.id}
                className={`relative ${
                  tier.popular ? "border-2 border-primary shadow-lg shadow-primary/20" : ""
                } ${isCurrent ? "opacity-60" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      <Zap className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge variant="outline" className="bg-background">
                      Current Plan
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="mt-4">
                    <div className="text-3xl font-bold">{tier.price}</div>
                    <div className="text-sm text-muted-foreground">per month</div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-sm">
                      Platform fee: <span className="font-semibold text-primary">{tier.platformFee}</span>
                    </div>
                    <div className="text-xs text-emerald-500 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Saves {tier.savings}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant={tier.popular ? "default" : "outline"}
                    disabled={isCurrent || isDowngrade || upgradeMutation.isPending}
                    onClick={() => upgradeMutation.mutate(tier.id)}
                    data-testid={`button-upgrade-${tier.id}`}
                  >
                    {upgradeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isCurrent ? "Current Plan" : isDowngrade ? "Contact Support" : "Upgrade Now"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* White-Label Call-to-Action */}
      {currentTier !== "elite" && (
        <Card className="border-2 border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Crown className="h-6 w-6 text-indigo-400" />
              Unlock White-Label Capabilities
            </CardTitle>
            <CardDescription className="text-base">
              Build your own branded workforce management platform with our Elite tier
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">White-Label Features:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Custom branding & logo
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Your own domain name
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Remove WorkforceOS branding
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Additional Benefits:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Only 2% platform fee
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Dedicated account manager
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    Custom integrations
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              size="lg"
              onClick={() => upgradeMutation.mutate("elite")}
              disabled={upgradeMutation.isPending}
              data-testid="button-upgrade-whitelabel"
            >
              {upgradeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade to White-Label - $7,999/mo
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Cost Savings Calculator */}
      <Card>
        <CardHeader>
          <CardTitle>Your Cost Savings</CardTitle>
          <CardDescription>
            See how much you're saving vs. traditional staffing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Traditional HR Cost</div>
              <div className="text-2xl font-bold text-red-500">
                ${tiers.find(t => t.id === currentTier)?.savings?.split('-')[1] || "$50k"}/mo
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">WorkforceOS Cost</div>
              <div className="text-2xl font-bold text-emerald-500">
                {tiers.find(t => t.id === currentTier)?.price || "$799"}/mo
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Your Savings</div>
              <div className="text-2xl font-bold text-primary">
                {tiers.find(t => t.id === currentTier)?.savings || "$8k-$10k"}/mo
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
