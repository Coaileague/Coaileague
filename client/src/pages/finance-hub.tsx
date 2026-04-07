import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  CreditCard,
  DollarSign,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Receipt,
  Users,
  Landmark,
  Settings,
  TrendingDown,
  FileText,
  Link2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectStatus {
  status: "not_started" | "onboarding_incomplete" | "pending_verification" | "active" | "not_configured" | "stripe_not_configured";
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  onboardingComplete?: boolean;
}

interface FeeSchedule {
  fees: {
    invoiceProcessing: { ratePercent: number; flatFeeCents: number; description: string };
    achPayments: { ratePercent: number; capCents: number; description: string };
    payrollMiddleware: { baseMonthly: number; perEmployeeCents: number; description: string };
    stripePayouts: { ratePercent: number; description: string };
    tierDiscount: number;
  };
  competitors: Record<string, {
    name: string;
    invoiceRate: number | null;
    invoiceFlatCents: number | null;
    achRate: number | null;
    achCapCents: number | null;
    payrollBase: number;
    payrollPerEmployee: number;
    payrollProviderName: string;
  }>;
  savings: {
    invoiceProcessingSavingsPercent: number;
    payrollSavingsPercent: number;
    headline: string;
  };
  tier: string;
  tierDiscount: number;
}

interface FinanceSettings {
  id: string;
  workspaceId: string;
  accountingMode: string;
  quickbooksSyncEnabled: boolean;
  payrollProvider: string;
  defaultPaymentTermsDays: number;
  autoGenerateInvoices: boolean;
  autoSendInvoices: boolean;
  invoicePrefix: string;
  invoiceFooterNotes: string;
}

export default function FinanceHub() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("payments");

  const pageConfig: CanvasPageConfig = {
    id: "finance-hub",
    title: "Finance Hub",
    subtitle: "Payment processing, payroll, and financial configuration",
    category: "settings",
    maxWidth: "7xl",
  };

  const connectStatus = useQuery<ConnectStatus>({
    queryKey: ["/api/stripe/connect-status"],
  });

  const feeSchedule = useQuery<FeeSchedule>({
    queryKey: ["/api/stripe/fee-schedule"],
  });

  const financeSettings = useQuery<FinanceSettings>({
    queryKey: ["/api/finance-settings"],
  });

  const connectAccountMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stripe/connect-account"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/connect-status"] });
    },
  });

  const onboardingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stripe/onboarding-link"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create onboarding link", variant: "destructive" });
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stripe/connect-dashboard"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to open Stripe dashboard", variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<FinanceSettings>) =>
      apiRequest("PATCH", "/api/finance-settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-settings"] });
      toast({ title: "Settings saved", description: "Finance settings updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
    },
  });

  const handleStartOnboarding = async () => {
    try {
      await connectAccountMutation.mutateAsync();
      onboardingMutation.mutate();
    } catch {
      toast({ title: "Error", description: "Failed to start Stripe Connect setup", variant: "destructive" });
    }
  };

  const status = connectStatus.data;
  const fees = feeSchedule.data;
  const settings = financeSettings.data;

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="payments" data-testid="tab-payments">
            <CreditCard className="w-4 h-4 mr-2" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="fees" data-testid="tab-fees">
            <Receipt className="w-4 h-4 mr-2" />
            Fee Schedule
          </TabsTrigger>
          <TabsTrigger value="accounting" data-testid="tab-accounting">
            <Building2 className="w-4 h-4 mr-2" />
            Accounting
          </TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">
            <FileText className="w-4 h-4 mr-2" />
            Invoicing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-6">
          <PaymentSetupSection
            status={status}
            isLoading={connectStatus.isLoading}
            onStartOnboarding={handleStartOnboarding}
            onResumeOnboarding={() => onboardingMutation.mutate()}
            onOpenDashboard={() => dashboardMutation.mutate()}
            isStarting={connectAccountMutation.isPending || onboardingMutation.isPending}
            isDashboardLoading={dashboardMutation.isPending}
          />
          <PayrollProviderSection
            currentProvider={settings?.payrollProvider || "internal"}
            onUpdate={(provider) => updateSettingsMutation.mutate({ payrollProvider: provider })}
            isLoading={financeSettings.isLoading}
            fees={fees}
          />
        </TabsContent>

        <TabsContent value="fees" className="space-y-6">
          <FeeScheduleSection fees={fees} isLoading={feeSchedule.isLoading} />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-6">
          <AccountingModeSection
            currentMode={settings?.accountingMode || "native"}
            onUpdate={(mode) => updateSettingsMutation.mutate({ accountingMode: mode, quickbooksSyncEnabled: mode !== "native" })}
            isLoading={financeSettings.isLoading}
          />
        </TabsContent>

        <TabsContent value="invoicing" className="space-y-6">
          <InvoiceSettingsSection
            settings={settings}
            onUpdate={(updates) => updateSettingsMutation.mutate(updates)}
            isLoading={financeSettings.isLoading}
            isSaving={updateSettingsMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}

function PaymentSetupSection({
  status,
  isLoading,
  onStartOnboarding,
  onResumeOnboarding,
  onOpenDashboard,
  isStarting,
  isDashboardLoading,
}: {
  status?: ConnectStatus;
  isLoading: boolean;
  onStartOnboarding: () => void;
  onResumeOnboarding: () => void;
  onOpenDashboard: () => void;
  isStarting: boolean;
  isDashboardLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getStatusConfig = () => {
    switch (status?.status) {
      case "active":
        return {
          icon: CheckCircle,
          iconColor: "text-green-600 dark:text-green-400",
          badge: "Active",
          badgeVariant: "default" as const,
          title: "Stripe Connect Active",
          description: "Your bank account is connected. Payments flow directly to your account.",
        };
      case "onboarding_incomplete":
        return {
          icon: Clock,
          iconColor: "text-amber-600 dark:text-amber-400",
          badge: "Incomplete",
          badgeVariant: "secondary" as const,
          title: "Complete Onboarding",
          description: "Resume your Stripe Connect setup to start receiving payments.",
        };
      case "pending_verification":
        return {
          icon: AlertCircle,
          iconColor: "text-blue-600 dark:text-blue-400",
          badge: "Pending",
          badgeVariant: "secondary" as const,
          title: "Verification Pending",
          description: "Stripe is verifying your account. This usually takes 1-2 business days.",
        };
      default:
        return {
          icon: Landmark,
          iconColor: "text-muted-foreground",
          badge: "Not Connected",
          badgeVariant: "outline" as const,
          title: "Connect Your Bank Account",
          description: "Link your bank via Stripe Connect to receive invoice payments and payroll deposits directly.",
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-md bg-muted", config.iconColor)}>
              <StatusIcon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.title}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
          <Badge variant={config.badgeVariant} data-testid="badge-connect-status">
            {config.badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {status?.status === "active" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span>Charges enabled</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span>Payouts enabled</span>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={onOpenDashboard}
                disabled={isDashboardLoading}
                data-testid="button-stripe-dashboard"
              >
                {isDashboardLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Stripe Dashboard
              </Button>
            </div>
          </div>
        )}

        {status?.status === "onboarding_incomplete" && (
          <Button onClick={onResumeOnboarding} disabled={isStarting} data-testid="button-resume-onboarding">
            {isStarting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
            Resume Onboarding
          </Button>
        )}

        {status?.status === "pending_verification" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Stripe is reviewing your account details</span>
            </div>
            <div className="ml-auto">
              <Button variant="outline" onClick={onOpenDashboard} disabled={isDashboardLoading} data-testid="button-check-status">
                {isDashboardLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Check Status
              </Button>
            </div>
          </div>
        )}

        {status?.status === "stripe_not_configured" && (
          <div className="flex items-center gap-2 rounded-md bg-muted p-3">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-muted-foreground">
              Stripe API keys are not configured. Contact your platform administrator to enable payment processing.
            </p>
          </div>
        )}

        {(!status?.status || status?.status === "not_started" || status?.status === "not_configured") && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Accept card payments</p>
                  <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Landmark className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">ACH bank transfers</p>
                  <p className="text-xs text-muted-foreground">Lower fees for large invoices</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Direct deposits</p>
                  <p className="text-xs text-muted-foreground">Funds go straight to your bank</p>
                </div>
              </div>
            </div>
            <Button onClick={onStartOnboarding} disabled={isStarting} data-testid="button-start-onboarding">
              {isStarting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              Connect Your Bank Account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeeScheduleSection({ fees, isLoading }: { fees?: FeeSchedule; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!fees) return null;

  const feeCards = [
    {
      title: "Invoice Processing",
      icon: CreditCard,
      rate: `${fees.fees.invoiceProcessing.ratePercent}% + $${(fees.fees.invoiceProcessing.flatFeeCents / 100).toFixed(2)}`,
      description: fees.fees.invoiceProcessing.description,
      comparison: fees.competitors.quickbooks
        ? `QuickBooks: ${fees.competitors.quickbooks.invoiceRate}% + $${((fees.competitors.quickbooks.invoiceFlatCents || 0) / 100).toFixed(2)}`
        : null,
      comparisonSquare: fees.competitors.square
        ? `Square: ${fees.competitors.square.invoiceRate}% + $${((fees.competitors.square.invoiceFlatCents || 0) / 100).toFixed(2)}`
        : null,
    },
    {
      title: "ACH Payments",
      icon: Landmark,
      rate: `${fees.fees.achPayments.ratePercent}% (max $${(fees.fees.achPayments.capCents / 100).toFixed(2)})`,
      description: fees.fees.achPayments.description,
      comparison: `QuickBooks: 1.0% (max $10.00)`,
      comparisonSquare: null,
    },
    {
      title: "Payroll Processing",
      icon: Users,
      rate: `$${(fees.fees.payrollMiddleware.perEmployeeCents / 100).toFixed(2)}/employee/mo`,
      description: fees.fees.payrollMiddleware.description,
      comparison: `Gusto: $6.00/employee/mo + $40/mo base`,
      comparisonSquare: `Patriot: $4.00/employee/mo + $17/mo base`,
    },
    {
      title: "Direct Payouts",
      icon: DollarSign,
      rate: `${fees.fees.stripePayouts.ratePercent}%`,
      description: fees.fees.stripePayouts.description,
      comparison: null,
      comparisonSquare: null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Your Fee Schedule</h3>
          <p className="text-sm text-muted-foreground">
            {fees.fees.tierDiscount > 0
              ? `${fees.fees.tierDiscount}% discount applied for your ${fees.tier} plan`
              : "Competitive rates that beat the industry"}
          </p>
        </div>
        <Badge variant="default" data-testid="badge-savings">
          <TrendingDown className="w-3 h-3 mr-1" />
          {fees.savings.headline}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {feeCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" data-testid={`text-fee-title-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      {card.title}
                    </p>
                    <p className="text-xl font-bold mt-1" data-testid={`text-fee-rate-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      {card.rate}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                    {card.comparison && (
                      <p className="text-xs text-muted-foreground mt-2 line-through">
                        {card.comparison}
                      </p>
                    )}
                    {card.comparisonSquare && (
                      <p className="text-xs text-muted-foreground line-through">
                        {card.comparisonSquare}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-4">Competitor Comparison — Payroll Costs for 25 Employees</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <ComparisonCard
              name="CoAIleague"
              monthlyCost={`$${((fees.fees.payrollMiddleware.baseMonthly + (fees.fees.payrollMiddleware.perEmployeeCents * 25)) / 100).toFixed(0)}/mo`}
              isBest
            />
            {Object.values(fees.competitors).filter(c => c.payrollBase > 0).map((comp) => (
              <ComparisonCard
                key={comp.name}
                name={comp.payrollProviderName}
                monthlyCost={`$${((comp.payrollBase + comp.payrollPerEmployee * 25) / 100).toFixed(0)}/mo`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComparisonCard({ name, monthlyCost, isBest }: { name: string; monthlyCost: string; isBest?: boolean }) {
  return (
    <div className={cn(
      "rounded-md p-3 text-center",
      isBest ? "bg-primary/10 border border-primary/20" : "bg-muted"
    )}>
      <p className="text-sm font-medium">{name}</p>
      <p className={cn("text-lg font-bold mt-1", isBest && "text-primary")}>{monthlyCost}</p>
      {isBest && (
        <Badge variant="default" className="mt-1">
          Lowest Cost
        </Badge>
      )}
    </div>
  );
}

function PayrollProviderSection({
  currentProvider,
  onUpdate,
  isLoading,
  fees,
}: {
  currentProvider: string;
  onUpdate: (provider: string) => void;
  isLoading: boolean;
  fees?: FeeSchedule;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const providers = [
    {
      id: "internal",
      name: "CoAIleague Payroll",
      description: "Built-in payroll processing via Stripe Connect",
      cost: fees ? `$${(fees.fees.payrollMiddleware.perEmployeeCents / 100).toFixed(2)}/employee/mo` : "$4.95/employee/mo",
      recommended: true,
    },
    {
      id: "gusto",
      name: "Gusto",
      description: "Full-service payroll with benefits administration",
      cost: "$6.00/employee/mo + $40/mo base",
      recommended: false,
    },
    {
      id: "patriot",
      name: "Patriot Software",
      description: "Affordable payroll for small businesses",
      cost: "$4.00/employee/mo + $17/mo base",
      recommended: false,
    },
    {
      id: "check",
      name: "Check (Payroll API)",
      description: "Infrastructure for embedded payroll",
      cost: "Custom pricing",
      recommended: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payroll Provider</CardTitle>
        <CardDescription>Choose how payroll is processed for your organization</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={cn(
                "rounded-md p-4 cursor-pointer transition-colors border",
                currentProvider === provider.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover-elevate"
              )}
              onClick={() => onUpdate(provider.id)}
              data-testid={`card-provider-${provider.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">{provider.name}</p>
                {provider.recommended && (
                  <Badge variant="default">
                    Lowest Cost
                  </Badge>
                )}
                {currentProvider === provider.id && (
                  <CheckCircle className="w-4 h-4 text-primary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{provider.description}</p>
              <p className="text-xs font-medium mt-2">{provider.cost}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountingModeSection({
  currentMode,
  onUpdate,
  isLoading,
}: {
  currentMode: string;
  onUpdate: (mode: string) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const modes = [
    {
      id: "native",
      title: "CoAIleague Native",
      description: "Use CoAIleague for everything — invoicing, payroll, financial reporting. No external tools needed.",
      recommended: true,
      features: ["Built-in invoicing", "Payroll processing", "Financial intelligence", "P&L dashboards", "Lower processing fees"],
    },
    {
      id: "quickbooks",
      title: "QuickBooks Online",
      description: "Sync all financial data with QuickBooks Online. CoAIleague handles operations, QB handles accounting.",
      recommended: false,
      features: ["Automatic data sync", "QB invoice generation", "Expense categorization", "Familiar QB workflow"],
    },
    {
      id: "hybrid",
      title: "Hybrid Mode",
      description: "Use CoAIleague for daily operations and payroll while keeping QuickBooks for accounting records.",
      recommended: false,
      features: ["Best of both worlds", "CoAIleague for ops", "QB for accounting", "Dual record keeping"],
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Accounting Mode</CardTitle>
        <CardDescription>Choose how your financial data is managed</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modes.map((mode) => (
            <div
              key={mode.id}
              className={cn(
                "rounded-md p-4 cursor-pointer transition-colors border",
                currentMode === mode.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover-elevate"
              )}
              onClick={() => onUpdate(mode.id)}
              data-testid={`card-mode-${mode.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-sm font-semibold">{mode.title}</p>
                {mode.recommended && (
                  <Badge variant="default">
                    Recommended
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{mode.description}</p>
              <ul className="space-y-1">
                {mode.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {currentMode === mode.id && (
                <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Active
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceSettingsSection({
  settings,
  onUpdate,
  isLoading,
  isSaving,
}: {
  settings?: FinanceSettings;
  onUpdate: (updates: Partial<FinanceSettings>) => void;
  isLoading: boolean;
  isSaving: boolean;
}) {
  const [prefix, setPrefix] = useState(settings?.invoicePrefix || "INV");
  const [footerNotes, setFooterNotes] = useState(settings?.invoiceFooterNotes || "");
  const [paymentTerms, setPaymentTerms] = useState(String(settings?.defaultPaymentTermsDays || 30));

  useEffect(() => {
    if (settings) {
      setPrefix(settings.invoicePrefix || "INV");
      setFooterNotes(settings.invoiceFooterNotes || "");
      setPaymentTerms(String(settings.defaultPaymentTermsDays || 30));
    }
  }, [settings]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Configuration</CardTitle>
          <CardDescription>Customize how invoices are generated and sent to your clients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-prefix">Invoice Prefix</Label>
              <Input
                id="invoice-prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="INV"
                data-testid="input-invoice-prefix"
              />
              <p className="text-xs text-muted-foreground">Preview: {prefix}-2026-0001</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-terms">Payment Terms (days)</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger data-testid="select-payment-terms">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Net 15</SelectItem>
                  <SelectItem value="30">Net 30</SelectItem>
                  <SelectItem value="45">Net 45</SelectItem>
                  <SelectItem value="60">Net 60</SelectItem>
                  <SelectItem value="90">Net 90</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer-notes">Invoice Footer Notes</Label>
            <Textarea
              id="footer-notes"
              value={footerNotes}
              onChange={(e) => setFooterNotes(e.target.value)}
              placeholder="Thank you for your business. Payment is due within the specified terms."
              rows={3}
              data-testid="input-footer-notes"
            />
          </div>

          <Button
            onClick={() => onUpdate({
              invoicePrefix: prefix,
              invoiceFooterNotes: footerNotes,
              defaultPaymentTermsDays: parseInt(paymentTerms, 10),
            })}
            disabled={isSaving}
            data-testid="button-save-invoice-settings"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
            Save Invoice Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Automation</CardTitle>
          <CardDescription>Configure automatic invoice generation and delivery</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-generate invoices</p>
              <p className="text-xs text-muted-foreground">Automatically create invoices from approved time entries</p>
            </div>
            <Switch
              checked={settings?.autoGenerateInvoices ?? true}
              onCheckedChange={(checked) => onUpdate({ autoGenerateInvoices: checked })}
              data-testid="switch-auto-generate"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-send invoices</p>
              <p className="text-xs text-muted-foreground">Automatically email invoices to clients when generated</p>
            </div>
            <Switch
              checked={settings?.autoSendInvoices ?? false}
              onCheckedChange={(checked) => onUpdate({ autoSendInvoices: checked })}
              data-testid="switch-auto-send"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
