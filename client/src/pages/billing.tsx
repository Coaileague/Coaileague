import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CONTACTS } from "@shared/platformConfig";
import { apiFetch } from "@/lib/apiError";
import { BillingInvoiceListResponse, UsageSummaryResponse, AddonPlanListResponse } from "@shared/schemas/responses/billing";
import { PREMIUM_FEATURES } from "@shared/config/premiumFeatures";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { secureFetch } from "@/lib/csrf";
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
  RefreshCw,
  Settings,
  ExternalLink,
  ShieldCheck,
  Wallet,
  Building2,
  Star,
  Trash2,
  Plus,
  CalendarDays,
  CalendarRange,
  AlertCircle,
  Shield,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { Workspace } from "@shared/schema";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { CheckpointAlert } from "@/components/checkpoint-alert";
import { PremiumFeaturesPanel } from "@/components/premium-features-panel";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { AiUsageDashboard } from "@/components/billing/AiUsageDashboard";
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

const billingConfig: CanvasPageConfig = {
  id: 'billing',
  title: 'Billing & Invoices',
  subtitle: 'Manage your subscription, view invoices, and track AI usage',
  category: 'settings',
  maxWidth: '7xl',
};

function HardCapToggleCard({ workspaceId }: { workspaceId?: string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<{ seatHardCapEnabled: boolean; maxEmployees: number; currentEmployees: number }>({
    queryKey: ['/api/billing-settings/seat-hard-cap'],
    enabled: !!workspaceId,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await secureFetch('/api/billing-settings/seat-hard-cap', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed to update seat cap');
      return res.json();
    },
    onSuccess: (_data, enabled) => {
      refetch();
      toast({
        title: enabled ? 'Hard seat cap enabled' : 'Hard seat cap disabled',
        description: enabled
          ? 'Officer activation will be blocked once the seat limit is reached.'
          : 'Officers can be activated beyond the seat limit — overage billing will apply.',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update seat cap setting', variant: 'destructive' });
    },
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Seat Cap Enforcement
        </CardTitle>
        <CardDescription className="text-xs">
          Control whether officers can be activated beyond your plan's included seat limit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {data?.seatHardCapEnabled ? 'Hard cap enabled' : 'Soft cap (overage billing)'}
            </p>
            <p className="text-xs text-muted-foreground">
              {data?.seatHardCapEnabled
                ? `Activation blocked at ${data?.maxEmployees} seats. Currently at ${data?.currentEmployees}.`
                : `Officers beyond ${data?.maxEmployees} seats billed at $25/seat/month overage.`}
            </p>
          </div>
          <Switch
            checked={data?.seatHardCapEnabled ?? false}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending}
            data-testid="toggle-seat-hard-cap"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const { user } = useAuth();
  const { workspaceRole, isPlatformStaff } = useWorkspaceAccess();
  const canManageBilling = ['org_owner', 'co_owner'].includes(workspaceRole || '') || isPlatformStaff;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
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
    if (urlParams.get('payment_success') === 'true') {
      toast({ title: 'Payment successful', description: 'Your subscription has been updated.' });
      window.history.replaceState({}, '', '/billing');
    }
    if (urlParams.get('payment_canceled') === 'true') {
      toast({ title: 'Payment canceled', description: 'Your checkout was canceled. No charges were made.', variant: 'destructive' });
      window.history.replaceState({}, '', '/billing');
    }
  }, []);

  // Fetch workspace details
  const { data: workspace, isLoading: workspaceLoading, isError: workspaceError } = useQuery<Workspace>({
    queryKey: ["/api/workspace"],
    enabled: !!user,
  });

  // Fetch subscription details
  const { data: subscriptionDetails, isLoading: subscriptionLoading, isError: subscriptionError, refetch: refetchSubscription } = useQuery<SubscriptionDetails>({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
    retry: false,
  });

  if (workspaceError || subscriptionError) return (
    <CanvasHubPage config={billingConfig}>
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load data. Please refresh.</p>
      </div>
    </CanvasHubPage>
  );

  // Fetch pricing tiers
  const { data: pricingData, isLoading: pricingLoading } = useQuery<PricingData>({
    queryKey: ["/api/billing/pricing"],
    enabled: !!user,
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/billing/invoices"],
    enabled: !!user,
    queryFn: () => apiFetch('/api/billing/invoices', BillingInvoiceListResponse),
  });

  // Fetch usage data (summary)
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["/api/billing/usage/summary"],
    enabled: !!user,
    queryFn: () => apiFetch('/api/billing/usage/summary', UsageSummaryResponse),
  });

  // Fetch available add-ons (marketplace)
  const { data: addons, isLoading: addonsLoading } = useQuery({
    queryKey: ["/api/billing/upsell/addon-plans"],
    enabled: !!user,
    queryFn: () => apiFetch('/api/billing/upsell/addon-plans', AddonPlanListResponse),
    select: (data: any) => data?.plans ?? data ?? [],
  });

  // Fetch active workspace add-ons
  const { data: activeAddons, isLoading: activeAddonsLoading } = useQuery({
    queryKey: ["/api/billing/upsell/addons"],
    enabled: !!user,
    queryFn: () => apiFetch('/api/billing/upsell/addons', AddonPlanListResponse),
    select: (data: any) => data?.addons ?? data ?? [],
  });


  // Open Stripe Billing Portal (manage payment method, view invoices)
  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await secureFetch("/api/billing/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Failed to open billing portal");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (error: Error) => {
      toast({ title: "Billing Portal Error", description: error.message, variant: "destructive" });
    },
  });

  // ── Payroll cycle settings ─────────────────────────────────────────────────
  const { data: workspaceBillingSettings, refetch: refetchWorkspaceBillingSettings } = useQuery<{ settings: Record<string, any> | null }>({
    queryKey: ["/api/billing-settings/workspace"],
    enabled: !!user,
  });
  const payrollSettings = workspaceBillingSettings?.settings || {};

  const [payrollCycle, setPayrollCycleLocal] = useState<string>("");
  const [payrollDayOfWeek, setPayrollDayOfWeek] = useState<string>("");
  const [payrollDayOfMonth, setPayrollDayOfMonth] = useState<string>("");
  const [payrollSecondDayOfMonth, setPayrollSecondDayOfMonth] = useState<string>("");
  const [payrollFirstPeriodStart, setPayrollFirstPeriodStart] = useState<string>("");
  const [payrollFirstPeriodEnd, setPayrollFirstPeriodEnd] = useState<string>("");
  const [payrollCutoffDays, setPayrollCutoffDays] = useState<string>("3");

  // Sync payroll state from server
  useEffect(() => {
    if (payrollSettings && Object.keys(payrollSettings).length > 0) {
      setPayrollCycleLocal(payrollSettings.payrollCycle || "");
      setPayrollDayOfWeek(String(payrollSettings.payrollDayOfWeek ?? ""));
      setPayrollDayOfMonth(String(payrollSettings.payrollDayOfMonth ?? ""));
      setPayrollSecondDayOfMonth(String(payrollSettings.payrollSecondDayOfMonth ?? ""));
      setPayrollFirstPeriodStart(payrollSettings.payrollFirstPeriodStart || "");
      setPayrollFirstPeriodEnd(payrollSettings.payrollFirstPeriodEnd || "");
      setPayrollCutoffDays(String(payrollSettings.payrollCutoffDays ?? "3"));
    }
  }, [workspaceBillingSettings]);

  const savePayrollMutation = useMutation({
    mutationFn: async (data: Record<string, any>) =>
      apiRequest("PATCH", "/api/billing-settings/workspace", data),
    onSuccess: () => {
      refetchWorkspaceBillingSettings();
      queryClient.invalidateQueries({ queryKey: ["/api/billing-settings/workspace"] });
      toast({ title: "Payroll Cycle Saved", description: "Trinity has learned your payroll schedule and will synchronize automatically." });
    },
    onError: (error: Error) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSavePayrollCycle = () => {
    if (!payrollCycle) {
      toast({ title: "Select a cycle", description: "Choose weekly, bi-weekly, or another frequency first.", variant: "destructive" });
      return;
    }
    const payload: Record<string, any> = {
      payrollCycle,
      payrollCutoffDays: parseInt(payrollCutoffDays) || 3,
    };
    if (payrollCycle === "weekly" || payrollCycle === "biweekly") {
      payload.payrollDayOfWeek = parseInt(payrollDayOfWeek) || 5;
    }
    if (payrollCycle === "monthly" || payrollCycle === "semimonthly") {
      payload.payrollDayOfMonth = parseInt(payrollDayOfMonth) || 1;
    }
    if (payrollCycle === "semimonthly") {
      payload.payrollSecondDayOfMonth = parseInt(payrollSecondDayOfMonth) || 15;
    }
    if (payrollFirstPeriodStart) payload.payrollFirstPeriodStart = payrollFirstPeriodStart;
    if (payrollFirstPeriodEnd) payload.payrollFirstPeriodEnd = payrollFirstPeriodEnd;
    savePayrollMutation.mutate(payload);
  };

  const handleOpenBillingPortal = () => {
    billingPortalMutation.mutate();
  };

  // ── Payment methods on file ─────────────────────────────────────────────────
  interface PaymentMethod {
    id: string;
    type: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    bankName: string | null;
    isDefault: boolean;
  }

  const { data: paymentMethodsData, refetch: refetchPaymentMethods, isLoading: pmLoading } = useQuery<{ paymentMethods: PaymentMethod[]; defaultPaymentMethodId: string | null }>({
    queryKey: ["/api/billing-settings/payment-methods"],
    enabled: !!user,
  });

  const setDefaultPmMutation = useMutation({
    mutationFn: async (pmId: string) =>
      apiRequest("POST", `/api/billing-settings/payment-methods/set-default/${pmId}`),
    onSuccess: () => {
      refetchPaymentMethods();
      toast({ title: "Default Updated", description: "This card will be charged for subscriptions, overages, and fees." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const removePmMutation = useMutation({
    mutationFn: async (pmId: string) =>
      apiRequest("DELETE", `/api/billing-settings/payment-methods/${pmId}`),
    onSuccess: () => {
      refetchPaymentMethods();
      toast({ title: "Card Removed", description: "Payment method removed from your account." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const addCardMutation = useMutation({
    mutationFn: async () => {
      const res = await secureFetch("/api/billing-settings/payment-methods/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      // For now, direct to Stripe billing portal where they can manage payment methods
      billingPortalMutation.mutate();
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  // ── Client billing terms ─────────────────────────────────────────────────────
  const { data: allClientsData } = useQuery<{ data: { id: string; companyName: string | null; firstName: string | null; lastName: string | null }[] }>({
    queryKey: ["/api/clients"],
    enabled: !!user && selectedTab === "client-terms",
  });
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const { data: clientTermsData, refetch: refetchClientTerms } = useQuery<{ settings: Record<string, any> | null }>({
    queryKey: ["/api/billing-settings/clients", selectedClientId],
    enabled: !!selectedClientId,
  });
  const clientTerms = clientTermsData?.settings || {} as Record<string, any>;

  const [ctBillingCycle, setCtBillingCycle] = useState<string>("monthly");
  const [ctPaymentTerms, setCtPaymentTerms] = useState<string>("net_30");
  const [ctDayOfWeek, setCtDayOfWeek] = useState<string>("5");
  const [ctDayOfMonth, setCtDayOfMonth] = useState<string>("1");
  const [ctSecondDay, setCtSecondDay] = useState<string>("15");
  const [ctServiceStart, setCtServiceStart] = useState<string>("");
  const [ctServiceEnd, setCtServiceEnd] = useState<string>("");

  useEffect(() => {
    if (clientTerms && selectedClientId) {
      setCtBillingCycle(clientTerms.billingCycle || "monthly");
      setCtPaymentTerms(clientTerms.paymentTerms || "net_30");
      setCtDayOfWeek(String(clientTerms.billingDayOfWeek ?? "5"));
      setCtDayOfMonth(String(clientTerms.billingDayOfMonth ?? "1"));
      setCtSecondDay(String(clientTerms.billingSecondDayOfMonth ?? "15"));
      setCtServiceStart(clientTerms.serviceStartDate || "");
      setCtServiceEnd(clientTerms.serviceEndDate || "");
    }
  }, [clientTermsData, selectedClientId]);

  const saveClientTermsMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await secureFetch(`/api/billing-settings/clients/${selectedClientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      refetchClientTerms();
      toast({ title: "Client Terms Saved", description: "Invoice schedule and payment terms updated for this client." });
    },
    onError: (error: Error) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveClientTerms = () => {
    if (!selectedClientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    const payload: Record<string, any> = {
      billingCycle: ctBillingCycle,
      paymentTerms: ctPaymentTerms,
    };
    if (ctBillingCycle === "weekly" || ctBillingCycle === "biweekly") {
      payload.billingDayOfWeek = parseInt(ctDayOfWeek) || 5;
    }
    if (ctBillingCycle === "monthly" || ctBillingCycle === "semimonthly") {
      payload.billingDayOfMonth = parseInt(ctDayOfMonth) || 1;
    }
    if (ctBillingCycle === "semimonthly") {
      payload.billingSecondDayOfMonth = parseInt(ctSecondDay) || 15;
    }
    if (ctServiceStart) payload.serviceStartDate = ctServiceStart;
    if (ctServiceEnd) payload.serviceEndDate = ctServiceEnd;
    saveClientTermsMutation.mutate(payload);
  };


  // Purchase add-on mutation
  const purchaseAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      return await apiRequest("POST", `/api/billing/upsell/addons`, { featureKey: addonId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/upsell/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/upsell/addon-plans"] });
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

  if (workspaceLoading || subscriptionLoading || pricingLoading || invoicesLoading) {
    return (
      <CanvasHubPage config={billingConfig}>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (workspaceRole && !canManageBilling) {
    return (
      <CanvasHubPage config={billingConfig}>
        <div className="flex flex-col items-center justify-center gap-4 text-center" style={{ minHeight: 'calc(100vh - 200px)' }} data-testid="billing-access-denied">
          <ShieldCheck className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            Billing and subscription settings are only accessible to organization owners. Contact your organization owner to make changes.
          </p>
        </div>
      </CanvasHubPage>
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
    <CanvasHubPage config={billingConfig}>
      {/* Account State Alert */}
      {accountState !== "active" && (
        <Card className={`border ${stateInfo.bgClassName}`}>
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
              <Button
                variant="default"
                data-testid="button-resolve-account"
                disabled={billingPortalMutation.isPending}
                onClick={() => {
                  if (accountState === "payment_failed") {
                    billingPortalMutation.mutate();
                  } else {
                    window.location.href = `mailto:${CONTACTS.support}`;
                  }
                }}
              >
                {billingPortalMutation.isPending ? "Opening..." : accountState === "payment_failed" ? "Update Payment Method" : "Contact Support"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Trinity™ Checkpoint Alert */}
      <CheckpointAlert workspaceId={workspace?.id || null} variant="detailed" />

      {/* Upgrade CTA Section */}
      {(workspace?.subscriptionTier === 'free' || !workspace?.subscriptionTier) && (
        <Card className="border-[hsl(var(--cad-blue))]/30 bg-[hsl(var(--cad-blue))]/5">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle>Ready to Unlock Premium Features?</CardTitle>
                <CardDescription>Upgrade your plan to access AI-powered scheduling, advanced analytics, and more.</CardDescription>
              </div>
              {canManageBilling && <Button variant="default" data-testid="button-upgrade-now" onClick={() => {
                setLocation('/billing?tab=upgrade');
              }} className="gap-2 whitespace-nowrap">
                <Zap className="h-4 w-4" />
                View Plans
              </Button>}
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
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
          <TabsTrigger value="payroll" data-testid="tab-payroll">
            <CalendarDays className="h-4 w-4 mr-2" />
            Payroll
          </TabsTrigger>
          <TabsTrigger value="client-terms" data-testid="tab-client-terms">
            <CalendarRange className="h-4 w-4 mr-2" />
            Client Terms
          </TabsTrigger>
          <TabsTrigger value="payment-methods" data-testid="tab-payment-methods">
            <Wallet className="h-4 w-4 mr-2" />
            Payment Methods
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
                  {subscriptionDetails?.tier || workspace?.subscriptionTier || "Trial"}
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
                  Billing cycle: {(subscriptionDetails as any)?.billingInterval
                    ? (subscriptionDetails as any).billingInterval.charAt(0).toUpperCase() + (subscriptionDetails as any).billingInterval.slice(1)
                    : "Monthly"}
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
                        <div className="text-sm text-muted-foreground">{formatCurrency(addon.price)}/mo</div>
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
                <div className="flex items-center justify-between gap-2">
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
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
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

          {/* Seat Hard Cap Setting — org_owner only */}
          {canManageBilling && (
            <HardCapToggleCard workspaceId={(workspace as any)?.id} />
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
                    className={`relative ${tier.popular ? 'border-primary shadow-sm' : ''} ${isCurrent ? 'border-primary/50 bg-primary/5' : ''}`}
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
                          <span>Up to {tier.maxEmployees === -1 ? '500+' : tier.maxEmployees} employees</span>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {tier.features.slice(0, 4).map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm">
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
                      className="flex items-center justify-between p-4 rounded-md border hover-elevate mobile-flex-col mobile-gap-3 cursor-pointer"
                      data-testid={`invoice-${invoice.id}`}
                      onClick={() => setLocation('/invoices')}
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
                          <div className="font-bold">{formatCurrency(invoice.totalAmount)}</div>
                          <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "pending" ? "secondary" : "destructive"}>
                            {invoice.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-download-invoice-${invoice.id}`} aria-label="Download invoice">
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
          <AiUsageDashboard />
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
                    const seatCount = subscriptionDetails?.limits?.maxEmployees || 5;
                    const planLimit = seatCount * 20000;
                    const totalUsed = (usageData as any)?.totalTokens || 0;
                    const usagePercent = Math.min(100, (totalUsed / planLimit) * 100);
                    const isOverage = totalUsed > planLimit;
                    const overageAmount = Math.max(0, totalUsed - planLimit);

                    return (
                      <>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">AI Operations Used</span>
                          <span className={`font-medium ${isOverage ? 'text-destructive' : ''}`}>
                            {formatNumber(totalUsed)} / {formatNumber(planLimit)}
                          </span>
                        </div>
                        
                        {/* Usage Progress Bar */}
                        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isOverage 
                                ? 'bg-gradient-to-r from-primary via-cyan-500 to-destructive' 
                                : usagePercent > 80 
                                  ? 'bg-gradient-to-r from-primary to-cyan-500'
                                  : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, usagePercent)}%` }}
                          />
                          {/* 80% warning marker */}
                          <div className="absolute top-0 left-[80%] h-full w-0.5 bg-cyan-500/50" />
                        </div>
                        
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="text-muted-foreground">
                            {usagePercent.toFixed(1)}% of allowance used
                          </span>
                          {isOverage ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {formatNumber(overageAmount)} overage tokens
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
                              Overage charges: ~{formatCurrency((overageAmount / 1000) * 0.03)} (billed weekly)
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
                      <div className="text-2xl font-bold">{formatNumber((usageData as any)?.recordOSTokens || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <TrendingUp className="h-4 w-4" />
                        AI Analytics™
                      </div>
                      <div className="text-2xl font-bold">{formatNumber((usageData as any)?.insightOSTokens || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Calendar className="h-4 w-4" />
                        AI Scheduling™
                      </div>
                      <div className="text-2xl font-bold">{formatNumber((usageData as any)?.scheduleOSTokens || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border mobile-compact-p">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Zap className="h-4 w-4" />
                        Total
                      </div>
                      <div className="text-2xl font-bold text-primary">{formatNumber((usageData as any)?.totalTokens || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                  </div>

                  {/* Middleware Fee Schedule */}
                  <div className="p-4 rounded-md border bg-muted/30 space-y-3">
                    <div className="flex items-start gap-3">
                      <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="w-full">
                        <p className="text-sm font-semibold mb-2">Transaction &amp; Middleware Fees</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          These fees are charged via Stripe per transaction when you use payroll, invoicing, or direct-pay features. All charges are off-session — no manual action needed.
                        </p>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex justify-between"><span>Payroll processing / employee / run</span><span className="font-mono">$3.50</span></div>
                          <div className="flex justify-between"><span>Invoice payment — card</span><span className="font-mono">3.4% + $0.80</span></div>
                          <div className="flex justify-between"><span>Invoice payment — ACH</span><span className="font-mono">1.3% (max $10)</span></div>
                          <div className="flex justify-between"><span>Direct bank payout</span><span className="font-mono">0.75%</span></div>
                          <div className="flex justify-between"><span>W-2 tax form</span><span className="font-mono">$5.00 / form</span></div>
                          <div className="flex justify-between"><span>1099-NEC tax form</span><span className="font-mono">$3.00 / form</span></div>
                          <div className="flex justify-between"><span>AI token overage</span><span className="font-mono">$2.00 / 100K</span></div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Professional tier: 15% discount on middleware fees. Business: 20%. Enterprise: 25%. Strategic: 30%.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Elite Feature Fee Schedule — April 2026 */}
                  <div className="p-4 rounded-md border bg-muted/30 space-y-3" data-testid="elite-fee-schedule">
                    <div className="flex items-start gap-3">
                      <Crown className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div className="w-full">
                        <p className="text-sm font-semibold mb-1">Elite Feature Fee Schedule</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Each elite feature includes a monthly quota at your tier. Additional uses are billed at the per-use rate shown. Enterprise: all elite features unlimited.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/50 text-muted-foreground">
                                <th className="text-left py-1.5 pr-2 font-medium">Feature</th>
                                <th className="text-right py-1.5 px-2 font-medium">Starter</th>
                                <th className="text-right py-1.5 px-2 font-medium">Professional</th>
                                <th className="text-right py-1.5 px-2 font-medium">Business</th>
                                <th className="text-right py-1.5 pl-2 font-medium">Enterprise</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              {Object.values(PREMIUM_FEATURES)
                                .filter(f => f.featureType === 'elite' && f.eliteSurchargeCents)
                                .map(f => {
                                  const s = f.eliteSurchargeCents!;
                                  const fmt = (cents: number | undefined) => {
                                    if (cents === undefined) return '—';
                                    if (cents === 0) return 'Included';
                                    const d = cents / 100;
                                    return d >= 1 && d === Math.floor(d) ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
                                  };
                                  const limit = (v: number | undefined) => {
                                    if (v === undefined) return '';
                                    if (v === -1) return ' (∞)';
                                    if (v === 0) return '';
                                    return ` (${v} free)`;
                                  };
                                  return (
                                    <tr key={f.id} className="border-b border-border/30 last:border-0" data-testid={`elite-fee-row-${f.id}`}>
                                      <td className="text-left py-1.5 pr-2 font-sans text-foreground">{f.name}</td>
                                      <td className="text-right py-1.5 px-2">{fmt(s.starter)}{limit(f.monthlyLimits.starter)}</td>
                                      <td className="text-right py-1.5 px-2">{fmt(s.professional)}{limit(f.monthlyLimits.professional)}</td>
                                      <td className="text-right py-1.5 px-2">{fmt(s.business)}{limit(f.monthlyLimits.business)}</td>
                                      <td className="text-right py-1.5 pl-2">{fmt(s.enterprise)}{limit(f.monthlyLimits.enterprise)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Pricing is anchored to human professional cost (attorneys, consultants, RFP firms). Trinity delivers the same output at 4–8% of the human price.
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
          {/* Premium Features Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                Premium Features
              </CardTitle>
              <CardDescription>
                Access advanced AI-powered features included with your subscription tier
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PremiumFeaturesPanel />
            </CardContent>
          </Card>
          
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
                          <div className="flex items-start justify-between gap-2">
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

        {/* ── Payroll Cycle Tab ────────────────────────────────────────────── */}
        <TabsContent value="payroll" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Payroll Cycle Configuration
              </CardTitle>
              <CardDescription>
                Set your payroll frequency and synchronization anchor. Trinity learns this once and generates every future payroll run automatically from your first period forward — change it any time and it will re-synchronize.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {payrollSettings.payrollCycle && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-primary/10 border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Currently set: <span className="capitalize">{payrollSettings.payrollCycle}</span></p>
                    {payrollSettings.payrollFirstPeriodStart && (
                      <p className="text-xs text-muted-foreground">
                        First period: {payrollSettings.payrollFirstPeriodStart} → {payrollSettings.payrollFirstPeriodEnd || "—"}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payroll-cycle-select">Pay Frequency</Label>
                  <Select value={payrollCycle} onValueChange={setPayrollCycleLocal}>
                    <SelectTrigger id="payroll-cycle-select" data-testid="select-payroll-cycle">
                      <SelectValue placeholder="Select frequency..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-Weekly (every 2 weeks)</SelectItem>
                      <SelectItem value="semimonthly">Semi-Monthly (1st & 15th or custom)</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payroll-cutoff">Cutoff Before Payday (days)</Label>
                  <Input
                    id="payroll-cutoff"
                    type="number"
                    min={0}
                    max={14}
                    value={payrollCutoffDays}
                    onChange={e => setPayrollCutoffDays(e.target.value)}
                    placeholder="3"
                    data-testid="input-payroll-cutoff"
                  />
                  <p className="text-xs text-muted-foreground">How many days before payday payroll locks for processing</p>
                </div>

                {(payrollCycle === "weekly" || payrollCycle === "biweekly") && (
                  <div className="space-y-2">
                    <Label>Pay Day of Week</Label>
                    <Select value={payrollDayOfWeek} onValueChange={setPayrollDayOfWeek}>
                      <SelectTrigger data-testid="select-payroll-day-of-week">
                        <SelectValue placeholder="Select day..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sunday</SelectItem>
                        <SelectItem value="1">Monday</SelectItem>
                        <SelectItem value="2">Tuesday</SelectItem>
                        <SelectItem value="3">Wednesday</SelectItem>
                        <SelectItem value="4">Thursday</SelectItem>
                        <SelectItem value="5">Friday</SelectItem>
                        <SelectItem value="6">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(payrollCycle === "monthly") && (
                  <div className="space-y-2">
                    <Label>Pay Day of Month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={payrollDayOfMonth}
                      onChange={e => setPayrollDayOfMonth(e.target.value)}
                      placeholder="1"
                      data-testid="input-payroll-day-of-month"
                    />
                  </div>
                )}

                {payrollCycle === "semimonthly" && (
                  <>
                    <div className="space-y-2">
                      <Label>First Pay Day of Month</Label>
                      <Input
                        type="number"
                        min={1}
                        max={15}
                        value={payrollDayOfMonth}
                        onChange={e => setPayrollDayOfMonth(e.target.value)}
                        placeholder="1"
                        data-testid="input-payroll-first-day"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Second Pay Day of Month</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={payrollSecondDayOfMonth}
                        onChange={e => setPayrollSecondDayOfMonth(e.target.value)}
                        placeholder="15"
                        data-testid="input-payroll-second-day"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="border-t pt-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    First Payroll Period — Synchronization Anchor
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Set the start and end of your very first payroll period. Trinity uses this as the anchor to calculate every future period automatically. Leave blank to start from today.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="payroll-period-start">First Period Start Date</Label>
                      <Input
                        id="payroll-period-start"
                        type="date"
                        value={payrollFirstPeriodStart}
                        onChange={e => setPayrollFirstPeriodStart(e.target.value)}
                        data-testid="input-payroll-first-period-start"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payroll-period-end">First Period End Date</Label>
                      <Input
                        id="payroll-period-end"
                        type="date"
                        value={payrollFirstPeriodEnd}
                        onChange={e => setPayrollFirstPeriodEnd(e.target.value)}
                        data-testid="input-payroll-first-period-end"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button
                onClick={handleSavePayrollCycle}
                disabled={savePayrollMutation.isPending}
                data-testid="button-save-payroll-cycle"
              >
                {savePayrollMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <>Save Payroll Cycle</>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Client Billing Terms Tab ─────────────────────────────────────── */}
        <TabsContent value="client-terms" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                Client Billing Terms
              </CardTitle>
              <CardDescription>
                Set service dates and invoice schedule independently for every client. Each client can have a different billing frequency, payment terms, and contract window.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Select Client</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-client-terms-client">
                    <SelectValue placeholder="Choose a client to configure..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(allClientsData?.data || []).map(c => (
                      <SelectItem key={c.id} value={c.id} data-testid={`option-client-${c.id}`}>
                        {c.companyName || `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClientId && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Invoice Frequency</Label>
                      <Select value={ctBillingCycle} onValueChange={setCtBillingCycle}>
                        <SelectTrigger data-testid="select-client-billing-cycle">
                          <SelectValue placeholder="Select frequency..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                          <SelectItem value="semimonthly">Semi-Monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <Select value={ctPaymentTerms} onValueChange={setCtPaymentTerms}>
                        <SelectTrigger data-testid="select-client-payment-terms">
                          <SelectValue placeholder="Select terms..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                          <SelectItem value="net_15">Net 15</SelectItem>
                          <SelectItem value="net_30">Net 30</SelectItem>
                          <SelectItem value="net_45">Net 45</SelectItem>
                          <SelectItem value="net_60">Net 60</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(ctBillingCycle === "weekly" || ctBillingCycle === "biweekly") && (
                      <div className="space-y-2">
                        <Label>Invoice Day of Week</Label>
                        <Select value={ctDayOfWeek} onValueChange={setCtDayOfWeek}>
                          <SelectTrigger data-testid="select-client-day-of-week">
                            <SelectValue placeholder="Select day..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Sunday</SelectItem>
                            <SelectItem value="1">Monday</SelectItem>
                            <SelectItem value="2">Tuesday</SelectItem>
                            <SelectItem value="3">Wednesday</SelectItem>
                            <SelectItem value="4">Thursday</SelectItem>
                            <SelectItem value="5">Friday</SelectItem>
                            <SelectItem value="6">Saturday</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(ctBillingCycle === "monthly") && (
                      <div className="space-y-2">
                        <Label>Invoice Day of Month</Label>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={ctDayOfMonth}
                          onChange={e => setCtDayOfMonth(e.target.value)}
                          placeholder="1"
                          data-testid="input-client-day-of-month"
                        />
                      </div>
                    )}

                    {ctBillingCycle === "semimonthly" && (
                      <>
                        <div className="space-y-2">
                          <Label>First Invoice Day</Label>
                          <Input
                            type="number"
                            min={1}
                            max={15}
                            value={ctDayOfMonth}
                            onChange={e => setCtDayOfMonth(e.target.value)}
                            placeholder="1"
                            data-testid="input-client-first-day"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Second Invoice Day</Label>
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            value={ctSecondDay}
                            onChange={e => setCtSecondDay(e.target.value)}
                            placeholder="15"
                            data-testid="input-client-second-day"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Service Contract Window
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="client-service-start">Service Start Date</Label>
                        <Input
                          id="client-service-start"
                          type="date"
                          value={ctServiceStart}
                          onChange={e => setCtServiceStart(e.target.value)}
                          data-testid="input-client-service-start"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-service-end">Service End Date (leave blank = ongoing)</Label>
                        <Input
                          id="client-service-end"
                          type="date"
                          value={ctServiceEnd}
                          onChange={e => setCtServiceEnd(e.target.value)}
                          data-testid="input-client-service-end"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            {selectedClientId && (
              <CardFooter className="flex justify-end gap-2">
                <Button
                  onClick={handleSaveClientTerms}
                  disabled={saveClientTermsMutation.isPending}
                  data-testid="button-save-client-terms"
                >
                  {saveClientTermsMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                  ) : (
                    <>Save Client Terms</>
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ── Payment Methods Tab ──────────────────────────────────────────── */}
        <TabsContent value="payment-methods" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Payment Methods on File
              </CardTitle>
              <CardDescription>
                Saved cards and bank accounts are used for subscription renewals and middleware transaction fees (payroll processing, invoice delivery, bank payouts). All charges are off-session — no manual action needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pmLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (paymentMethodsData?.paymentMethods || []).length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <CreditCard className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">No payment methods saved yet.</p>
                  <p className="text-xs text-muted-foreground">Add a card or bank account to enable automatic subscription renewals and fee collection.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(paymentMethodsData?.paymentMethods || []).map(pm => (
                    <div
                      key={pm.id}
                      className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-md border ${pm.isDefault ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                      data-testid={`card-payment-method-${pm.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {pm.type === "us_bank_account" ? (
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <CreditCard className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium capitalize" data-testid={`text-pm-brand-${pm.id}`}>
                            {pm.brand || pm.bankName || pm.type} •••• {pm.last4}
                          </p>
                          {pm.expMonth && pm.expYear && (
                            <p className="text-xs text-muted-foreground">
                              Expires {pm.expMonth}/{pm.expYear}
                            </p>
                          )}
                        </div>
                        {pm.isDefault && (
                          <Badge variant="outline" className="text-primary border-primary/30">
                            <Star className="h-3 w-3 mr-1" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!pm.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDefaultPmMutation.mutate(pm.id)}
                            disabled={setDefaultPmMutation.isPending}
                            data-testid={`button-set-default-${pm.id}`}
                          >
                            Set Default
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removePmMutation.mutate(pm.id)}
                          disabled={removePmMutation.isPending}
                          data-testid={`button-remove-pm-${pm.id}`}
                          aria-label="Remove payment method"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">What these cards are charged for:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" /> Monthly or yearly subscription renewal</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" /> Payroll processing fee ($3.50/employee/run via middleware)</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" /> Invoice payment processing (3.4% + $0.80 card / 1.3% ACH)</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" /> Direct-to-bank payout fee (0.75% via Stripe Connect)</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-primary" /> Year-end W-2: $5.00/form | 1099-NEC: $3.00/form</li>
                  </ul>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                onClick={() => billingPortalMutation.mutate()}
                disabled={billingPortalMutation.isPending}
                data-testid="button-add-payment-method"
              >
                {billingPortalMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening...</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" />Add Payment Method</>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Upgrade/Downgrade Confirmation Dialog */}
      <UniversalModal open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>
              {selectedTier && isUpgrade(selectedTier.id) ? 'Upgrade' : 'Change'} to {selectedTier?.name}
            </UniversalModalTitle>
            <UniversalModalDescription>
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
            </UniversalModalDescription>
          </UniversalModalHeader>
          {selectedTier && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between gap-2 p-4 rounded-md bg-muted/50">
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
                  <span>Up to {selectedTier.maxEmployees === -1 ? '500+' : selectedTier.maxEmployees} employees</span>
                </div>
              </div>
            </div>
          )}
          <UniversalModalFooter>
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
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>


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
    </CanvasHubPage>
  );
}
