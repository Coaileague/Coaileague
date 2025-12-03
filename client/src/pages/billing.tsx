import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Loader2, 
  CreditCard, 
  TrendingUp, 
  ShoppingCart, 
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Zap,
  Brain,
  Database,
  Calendar,
  Crown,
  Check,
  ArrowUp,
  ArrowDown,
  Users,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import type { Workspace } from "@shared/schema";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { CheckpointAlert } from "@/components/checkpoint-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PricingTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  formattedMonthlyPrice: string;
  formattedYearlyPrice: string;
  yearlySavingsPercent: number;
  maxEmployees: number;
  monthlyCredits: number;
  features: string[];
  popular?: boolean;
}

interface PricingData {
  tiers: PricingTier[];
  creditPacks: any[];
  overages: any;
}

interface SubscriptionDetails {
  tier: string;
  status: string;
  billingCycle: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  credits: {
    total: number;
    used: number;
    remaining: number;
  };
  limits: {
    maxEmployees: number;
    currentEmployees: number;
    employeesRemaining: number;
  };
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'upgrade') {
      setSelectedTab('subscription');
    }
  }, []);

  // Fetch workspace details
  const { data: workspace, isLoading: workspaceLoading } = useQuery<Workspace>({
    queryKey: ["/api/workspace"],
    enabled: !!user,
  });

  // Fetch subscription details
  const { data: subscriptionDetails, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery<SubscriptionDetails>({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
    retry: false,
  });

  // Fetch pricing tiers
  const { data: pricingData, isLoading: pricingLoading } = useQuery<PricingData>({
    queryKey: ["/api/billing/pricing"],
    enabled: !!user,
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/billing/invoices"],
    enabled: !!user,
  });

  // Fetch usage data (summary)
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["/api/billing/usage/summary"],
    enabled: !!user,
  });

  // Fetch available add-ons (marketplace)
  const { data: addons, isLoading: addonsLoading } = useQuery({
    queryKey: ["/api/billing/addons/available"],
    enabled: !!user,
  });

  // Fetch active workspace add-ons
  const { data: activeAddons, isLoading: activeAddonsLoading } = useQuery({
    queryKey: ["/api/billing/addons"],
    enabled: !!user,
  });

  // Purchase add-on mutation
  const purchaseAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      return await apiRequest("POST", `/api/billing/addons/${addonId}/purchase`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/addons/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/usage/summary"] });
      toast({
        title: "Add-on Purchased!",
        description: "The add-on has been added to your workspace.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Purchase Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Change subscription mutation
  const changeSubscriptionMutation = useMutation({
    mutationFn: async ({ newTier, billingCycle }: { newTier: string; billingCycle: string }) => {
      return await apiRequest("POST", "/api/billing/subscription/change", { newTier, billingCycle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
      setUpgradeDialogOpen(false);
      setSelectedTier(null);
      toast({
        title: "Subscription Updated!",
        description: "Your subscription has been changed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription Change Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (immediate: boolean = false) => {
      return await apiRequest("POST", "/api/billing/subscription/cancel", { immediate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
      setCancelDialogOpen(false);
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will end at the current billing period.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getCurrentTierOrder = (tier: string) => {
    const order: Record<string, number> = { free: 0, starter: 1, professional: 2, enterprise: 3 };
    return order[tier.toLowerCase()] ?? 0;
  };

  const isUpgrade = (targetTier: string) => {
    const currentTier = (subscriptionDetails?.tier || workspace?.subscriptionTier || 'free').toLowerCase();
    return getCurrentTierOrder(targetTier) > getCurrentTierOrder(currentTier);
  };

  const handleSelectTier = (tier: PricingTier) => {
    const currentTier = (subscriptionDetails?.tier || workspace?.subscriptionTier || 'free').toLowerCase();
    if (tier.id.toLowerCase() === currentTier) return;
    setSelectedTier(tier);
    setUpgradeDialogOpen(true);
  };

  const handleConfirmChange = () => {
    if (!selectedTier) return;
    changeSubscriptionMutation.mutate({
      newTier: selectedTier.id,
      billingCycle,
    });
  };

  if (workspaceLoading) {
    return (
      <WorkspaceLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
        </div>
      </WorkspaceLayout>
    );
  }

  const accountState = workspace?.accountState || "active";
  const accountStateConfig = {
    active: { icon: CheckCircle2, label: "Active", className: "text-primary", bgClassName: "bg-muted/10 border-primary/20" },
    payment_failed: { icon: AlertTriangle, label: "Payment Failed", className: "text-yellow-500", bgClassName: "bg-yellow-500/10 border-yellow-500/20" },
    suspended: { icon: XCircle, label: "Suspended", className: "text-red-500", bgClassName: "bg-red-500/10 border-red-500/20" },
    requires_support: { icon: Clock, label: "Requires Support", className: "text-orange-500", bgClassName: "bg-orange-500/10 border-orange-500/20" },
  };

  const stateInfo = accountStateConfig[accountState as keyof typeof accountStateConfig] || accountStateConfig.active;
  const StateIcon = stateInfo.icon;

  return (
    <WorkspaceLayout maxWidth="7xl">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Billing & Invoices</h1>
        <p className="text-muted-foreground">
          Manage your subscription, view invoices, and track AI usage
        </p>
      </div>

      {/* Account State Alert */}
      {accountState !== "active" && (
        <Card className={`border-2 ${stateInfo.bgClassName}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <StateIcon className={`h-6 w-6 ${stateInfo.className}`} />
              <div>
                <CardTitle className="text-lg">Account Status: {stateInfo.label}</CardTitle>
                <CardDescription className="mt-1">
                  {accountState === "payment_failed" && "Your last payment failed. Please update your payment method to restore access."}
                  {accountState === "suspended" && "Your account has been suspended due to payment issues. Contact support to reactivate."}
                  {accountState === "requires_support" && "Your account requires support intervention. Please contact our team."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {accountState !== "suspended" && (
            <CardContent>
              <Button variant="default" data-testid="button-resolve-account">
                {accountState === "payment_failed" ? "Update Payment Method" : "Contact Support"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* AI Brain Checkpoint Alert */}
      <CheckpointAlert workspaceId={workspace?.id || null} variant="detailed" />

      {/* Upgrade CTA Section */}
      {(workspace?.subscriptionTier === 'free' || !workspace?.subscriptionTier) && (
        <Card className="border-[hsl(var(--cad-blue))]/30 bg-[hsl(var(--cad-blue))]/5">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle>Ready to Unlock Premium Features?</CardTitle>
                <CardDescription>Upgrade your plan to access AI-powered scheduling, advanced analytics, and more.</CardDescription>
              </div>
              <Button variant="default" data-testid="button-upgrade-now" onClick={() => {
                window.location.href = '/billing?tab=upgrade';
              }} className="gap-2 whitespace-nowrap">
                <Zap className="h-4 w-4" />
                View Plans
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <CreditCard className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription">
            <Crown className="h-4 w-4 mr-2" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            <FileText className="h-4 w-4 mr-2" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">
            <TrendingUp className="h-4 w-4 mr-2" />
            AI Usage
          </TabsTrigger>
          <TabsTrigger value="addons" data-testid="tab-addons">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add-ons
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mobile-cols-1 mobile-gap-4">
            {/* Current Plan */}
            <Card className="mobile-card-tight">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize" data-testid="text-current-plan">
                  {subscriptionDetails?.tier || workspace?.subscriptionTier || "Free"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {subscriptionDetails?.status === 'active' ? (
                    <Badge variant="outline" className="text-primary border-primary/30">Active</Badge>
                  ) : subscriptionDetails?.status === 'trial' ? (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/30">Trial</Badge>
                  ) : subscriptionDetails?.status === 'past_due' ? (
                    <Badge variant="destructive">Past Due</Badge>
                  ) : (
                    <Badge variant="secondary">{subscriptionDetails?.status || 'Active'}</Badge>
                  )}
                </p>
                {subscriptionDetails?.currentPeriodEnd && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Renews: {format(new Date(subscriptionDetails.currentPeriodEnd), "MMM d, yyyy")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Employee Usage */}
            <Card className="mobile-card-tight">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Employees
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-count">
                  {subscriptionDetails?.limits?.currentEmployees || 0}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{subscriptionDetails?.limits?.maxEmployees || 5}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ 
                      width: `${Math.min(100, ((subscriptionDetails?.limits?.currentEmployees || 0) / (subscriptionDetails?.limits?.maxEmployees || 1)) * 100)}%` 
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {subscriptionDetails?.limits?.employeesRemaining || 0} remaining
                </p>
              </CardContent>
            </Card>

            {/* Account Balance */}
            <Card className="mobile-card-tight">
              <CardHeader>
                <CardTitle className="text-sm font-medium">AI Token Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary" data-testid="text-token-balance">
                  {(usageData as any)?.tokenBalance?.toLocaleString() || "0"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Tokens remaining
                </p>
              </CardContent>
            </Card>

            {/* Next Invoice */}
            <Card className="mobile-card-tight">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Next Invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-next-invoice-date">
                  {(workspace as any)?.nextBillingDate ? format(new Date((workspace as any).nextBillingDate), "MMM d, yyyy") : "Not scheduled"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Billing cycle: Weekly
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Add-ons */}
          <Card>
            <CardHeader>
              <CardTitle>Active Add-ons</CardTitle>
              <CardDescription>
                OS modules currently enabled for your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeAddonsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : Array.isArray(activeAddons) && activeAddons.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mobile-cols-1">
                  {activeAddons.map((addon: any) => (
                    <div key={addon.id} className="flex items-center gap-3 p-3 rounded-md border mobile-compact-p" data-testid={`addon-active-${addon.id}`}>
                      <Zap className="h-5 w-5 text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{addon.name}</div>
                        <div className="text-sm text-muted-foreground">${addon.price}/mo</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active add-ons. Visit the Add-ons tab to browse available modules.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-6">
          {/* Current Subscription Status */}
          {subscriptionDetails && subscriptionDetails.tier !== 'free' && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5 text-primary" />
                      Current Subscription
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {subscriptionDetails.tier.charAt(0).toUpperCase() + subscriptionDetails.tier.slice(1)} plan
                      {subscriptionDetails.billingCycle && ` - billed ${subscriptionDetails.billingCycle}`}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant={subscriptionDetails.status === 'active' ? 'default' : 'secondary'}>
                      {subscriptionDetails.status}
                    </Badge>
                    {subscriptionDetails.cancelAtPeriodEnd && (
                      <p className="text-xs text-amber-500 mt-1">Cancels at period end</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 mobile-cols-1">
                  <div>
                    <p className="text-sm text-muted-foreground">AI Credits</p>
                    <p className="text-lg font-semibold">
                      {subscriptionDetails.credits?.remaining?.toLocaleString() || 0} / {subscriptionDetails.credits?.total?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Employees</p>
                    <p className="text-lg font-semibold">
                      {subscriptionDetails.limits?.currentEmployees || 0} / {subscriptionDetails.limits?.maxEmployees || 0}
                    </p>
                  </div>
                  {subscriptionDetails.currentPeriodEnd && (
                    <div>
                      <p className="text-sm text-muted-foreground">Renewal Date</p>
                      <p className="text-lg font-semibold">
                        {format(new Date(subscriptionDetails.currentPeriodEnd), "MMM d, yyyy")}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
              {!subscriptionDetails.cancelAtPeriodEnd && subscriptionDetails.tier !== 'free' && (
                <CardFooter className="border-t pt-4">
                  <Button 
                    variant="ghost" 
                    className="text-muted-foreground" 
                    onClick={() => setCancelDialogOpen(true)}
                    data-testid="button-cancel-subscription"
                  >
                    Cancel Subscription
                  </Button>
                </CardFooter>
              )}
            </Card>
          )}

          {/* Billing Cycle Toggle */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={billingCycle === "monthly" ? "default" : "outline"}
              onClick={() => setBillingCycle("monthly")}
              data-testid="button-billing-monthly"
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "yearly" ? "default" : "outline"}
              onClick={() => setBillingCycle("yearly")}
              className="gap-2"
              data-testid="button-billing-yearly"
            >
              Yearly
              <Badge variant="secondary" className="text-xs">Save up to 17%</Badge>
            </Button>
          </div>

          {/* Pricing Cards */}
          {pricingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : pricingData?.tiers ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mobile-cols-1 mobile-gap-4">
              {pricingData.tiers.map((tier) => {
                const currentTier = (subscriptionDetails?.tier || workspace?.subscriptionTier || 'free').toLowerCase();
                const isCurrent = tier.id.toLowerCase() === currentTier;
                const isUpgrading = isUpgrade(tier.id);
                const price = billingCycle === "monthly" ? tier.monthlyPrice : tier.yearlyPrice;
                const formattedPrice = billingCycle === "monthly" ? tier.formattedMonthlyPrice : tier.formattedYearlyPrice;

                return (
                  <Card 
                    key={tier.id} 
                    className={`relative ${tier.popular ? 'border-primary shadow-lg' : ''} ${isCurrent ? 'border-primary/50 bg-primary/5' : ''}`}
                    data-testid={`card-tier-${tier.id}`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-xl">{tier.name}</CardTitle>
                      <CardDescription className="min-h-[40px]">{tier.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center">
                        <div className="text-4xl font-bold">{formattedPrice}</div>
                        <p className="text-sm text-muted-foreground">
                          per {billingCycle === "monthly" ? "month" : "year"}
                        </p>
                        {billingCycle === "yearly" && tier.yearlySavingsPercent > 0 && (
                          <Badge variant="secondary" className="mt-2">
                            Save {tier.yearlySavingsPercent}%
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>Up to {tier.maxEmployees === -1 ? 'Unlimited' : tier.maxEmployees} employees</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          <span>{tier.monthlyCredits.toLocaleString()} AI credits/month</span>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {tier.features.slice(0, 4).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                        {tier.features.length > 4 && (
                          <li className="text-sm text-muted-foreground pl-6">
                            +{tier.features.length - 4} more features
                          </li>
                        )}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full gap-2"
                        variant={isCurrent ? "outline" : tier.popular ? "default" : "outline"}
                        disabled={isCurrent || changeSubscriptionMutation.isPending}
                        onClick={() => handleSelectTier(tier)}
                        data-testid={`button-select-tier-${tier.id}`}
                      >
                        {isCurrent ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Current Plan
                          </>
                        ) : isUpgrading ? (
                          <>
                            <ArrowUp className="h-4 w-4" />
                            Upgrade
                          </>
                        ) : (
                          <>
                            <ArrowDown className="h-4 w-4" />
                            Downgrade
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Unable to load pricing information. Please try again later.</p>
              <Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/billing/pricing"] })}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>
                Weekly aggregated invoices for your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : Array.isArray(invoices) && invoices.length > 0 ? (
                <div className="space-y-3">
                  {invoices.map((invoice: any) => (
                    <div 
                      key={invoice.id} 
                      className="flex items-center justify-between p-4 rounded-md border hover-elevate mobile-flex-col mobile-gap-3"
                      data-testid={`invoice-${invoice.id}`}
                    >
                      <div className="flex items-center gap-4 mobile-w-full">
                        <div className="p-2 rounded-md bg-muted">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">
                            Invoice #{invoice.invoiceNumber}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {invoice.periodStart && invoice.periodEnd ? 
                              `${format(new Date(invoice.periodStart), "MMM d")} - ${format(new Date(invoice.periodEnd), "MMM d, yyyy")}` :
                              format(new Date(invoice.createdAt), "MMM d, yyyy")
                            }
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mobile-w-full mobile-justify-between">
                        <div className="text-right">
                          <div className="font-bold">${invoice.totalAmount.toFixed(2)}</div>
                          <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "pending" ? "secondary" : "destructive"}>
                            {invoice.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-download-invoice-${invoice.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No invoices yet. Your first invoice will be generated weekly based on usage.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          {/* Monthly Allowance Meter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Monthly AI Token Allowance
              </CardTitle>
              <CardDescription>
                Your plan includes a monthly token allocation. Usage beyond this incurs overage charges.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const monthlyAllowance = subscriptionDetails?.credits?.total || 100000;
                    const totalUsed = (usageData as any)?.totalTokens || 0;
                    const usagePercent = Math.min(100, (totalUsed / monthlyAllowance) * 100);
                    const isOverage = totalUsed > monthlyAllowance;
                    const overageAmount = Math.max(0, totalUsed - monthlyAllowance);
                    
                    return (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tokens Used</span>
                          <span className={`font-medium ${isOverage ? 'text-destructive' : ''}`}>
                            {totalUsed.toLocaleString()} / {monthlyAllowance.toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Usage Progress Bar */}
                        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isOverage 
                                ? 'bg-gradient-to-r from-primary via-yellow-500 to-destructive' 
                                : usagePercent > 80 
                                  ? 'bg-gradient-to-r from-primary to-yellow-500'
                                  : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, usagePercent)}%` }}
                          />
                          {/* 80% warning marker */}
                          <div className="absolute top-0 left-[80%] h-full w-0.5 bg-yellow-500/50" />
                        </div>
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {usagePercent.toFixed(1)}% of allowance used
                          </span>
                          {isOverage ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {overageAmount.toLocaleString()} overage tokens
                            </Badge>
                          ) : usagePercent > 80 ? (
                            <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Approaching limit
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Within allowance
                            </Badge>
                          )}
                        </div>
                        
                        {isOverage && (
                          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mt-2">
                            <p className="text-sm text-destructive flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Overage charges: ~${((overageAmount / 1000) * 0.03).toFixed(2)} (billed weekly)
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage by Feature */}
          <Card>
            <CardHeader>
              <CardTitle>AI Token Usage by Feature</CardTitle>
              <CardDescription>
                Track your AI-powered feature consumption across OS modules
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Usage Summary */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mobile-cols-1">
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Brain className="h-4 w-4" />
                        AI Records™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.recordOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <TrendingUp className="h-4 w-4" />
                        AI Analytics™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.insightOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Calendar className="h-4 w-4" />
                        AI Scheduling™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.scheduleOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Zap className="h-4 w-4" />
                        Total
                      </div>
                      <div className="text-2xl font-bold text-primary">{(usageData as any)?.totalTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                  </div>

                  {/* Weekly Billing Info */}
                  <div className="p-4 rounded-md border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <RefreshCw className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Weekly Overage Billing</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI token overages are billed automatically every Sunday at midnight. 
                          Overage rate: $0.03 per 1,000 tokens beyond your monthly allowance.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add-ons Tab */}
        <TabsContent value="addons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add-on Marketplace</CardTitle>
              <CardDescription>
                À la carte OS modules to enhance your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {addonsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : Array.isArray(addons) && addons.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mobile-cols-1">
                  {addons.map((addon: any) => {
                    const isActive = Array.isArray(activeAddons) && activeAddons.some((a: any) => a.addonId === addon.id);
                    return (
                      <Card key={addon.id} className={isActive ? "border-primary bg-muted/5" : ""} data-testid={`addon-${addon.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{addon.name}</CardTitle>
                              <CardDescription className="mt-1 text-xs">
                                {addon.description}
                              </CardDescription>
                            </div>
                            {isActive && (
                              <Badge variant="default" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold">${addon.price}</span>
                            <span className="text-sm text-muted-foreground">/month</span>
                          </div>
                          <Button
                            className="w-full"
                            variant={isActive ? "outline" : "default"}
                            disabled={isActive || purchaseAddonMutation.isPending}
                            onClick={() => purchaseAddonMutation.mutate(addon.id)}
                            data-testid={`button-purchase-addon-${addon.id}`}
                          >
                            {purchaseAddonMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                              </>
                            ) : isActive ? (
                              "Installed"
                            ) : (
                              "Purchase Add-on"
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No add-ons available. Check back soon for new OS modules.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upgrade/Downgrade Confirmation Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTier && isUpgrade(selectedTier.id) ? 'Upgrade' : 'Change'} to {selectedTier?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTier && isUpgrade(selectedTier.id) ? (
                <>
                  You're upgrading to the {selectedTier.name} plan. Your new features will be available immediately.
                  You'll be charged a prorated amount for the remainder of your billing period.
                </>
              ) : (
                <>
                  You're changing to the {selectedTier?.name} plan. This change will take effect at the end of your current billing period.
                  You'll continue to have access to your current features until then.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedTier && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-md bg-muted/50">
                <div>
                  <p className="font-semibold">{selectedTier.name}</p>
                  <p className="text-sm text-muted-foreground">{billingCycle} billing</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {billingCycle === "monthly" ? selectedTier.formattedMonthlyPrice : selectedTier.formattedYearlyPrice}
                  </p>
                  <p className="text-sm text-muted-foreground">per {billingCycle === "monthly" ? "month" : "year"}</p>
                </div>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Up to {selectedTier.maxEmployees === -1 ? 'Unlimited' : selectedTier.maxEmployees} employees</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedTier.monthlyCredits.toLocaleString()} AI credits per month</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmChange}
              disabled={changeSubscriptionMutation.isPending}
              data-testid="button-confirm-change"
            >
              {changeSubscriptionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Confirm ${selectedTier && isUpgrade(selectedTier.id) ? 'Upgrade' : 'Change'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will remain active until the end of your current billing period.
              After that, you'll be moved to the free tier with limited features.
              You can resubscribe at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelSubscriptionMutation.mutate(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cancel"
            >
              {cancelSubscriptionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel Subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  );
}
