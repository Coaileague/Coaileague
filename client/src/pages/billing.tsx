import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import type { Workspace } from "@shared/schema";

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");

  // Fetch workspace details
  const { data: workspace, isLoading: workspaceLoading } = useQuery<Workspace>({
    queryKey: ["/api/workspace"],
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
      return await apiRequest(`/api/billing/addons/${addonId}/purchase`, "POST");
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

  if (workspaceLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  const accountState = workspace?.accountState || "active";
  const accountStateConfig = {
    active: { icon: CheckCircle2, label: "Active", className: "text-emerald-500", bgClassName: "bg-emerald-500/10 border-emerald-500/20" },
    payment_failed: { icon: AlertTriangle, label: "Payment Failed", className: "text-yellow-500", bgClassName: "bg-yellow-500/10 border-yellow-500/20" },
    suspended: { icon: XCircle, label: "Suspended", className: "text-red-500", bgClassName: "bg-red-500/10 border-red-500/20" },
    requires_support: { icon: Clock, label: "Requires Support", className: "text-orange-500", bgClassName: "bg-orange-500/10 border-orange-500/20" },
  };

  const stateInfo = accountStateConfig[accountState as keyof typeof accountStateConfig] || accountStateConfig.active;
  const StateIcon = stateInfo.icon;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
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

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <CreditCard className="h-4 w-4 mr-2" />
            Overview
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Current Plan */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-current-plan">
                  {workspace?.subscriptionTier || "Professional"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Platform fee: {workspace?.platformFeePercentage || 6}%
                </p>
              </CardContent>
            </Card>

            {/* Account Balance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">AI Token Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600" data-testid="text-token-balance">
                  {(usageData as any)?.tokenBalance?.toLocaleString() || "0"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Tokens remaining
                </p>
              </CardContent>
            </Card>

            {/* Next Invoice */}
            <Card>
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeAddons.map((addon: any) => (
                    <div key={addon.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`addon-active-${addon.id}`}>
                      <Zap className="h-5 w-5 text-emerald-500" />
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
                      className="flex items-center justify-between p-4 rounded-md border hover-elevate"
                      data-testid={`invoice-${invoice.id}`}
                    >
                      <div className="flex items-center gap-4">
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
                      <div className="flex items-center gap-4">
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
          <Card>
            <CardHeader>
              <CardTitle>AI Token Usage</CardTitle>
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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 rounded-md border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Brain className="h-4 w-4" />
                        RecordOS™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.recordOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <TrendingUp className="h-4 w-4" />
                        InsightOS™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.insightOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Calendar className="h-4 w-4" />
                        ScheduleOS™
                      </div>
                      <div className="text-2xl font-bold">{(usageData as any)?.scheduleOSTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                    <div className="p-4 rounded-md border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Zap className="h-4 w-4" />
                        Total
                      </div>
                      <div className="text-2xl font-bold text-primary">{(usageData as any)?.totalTokens?.toLocaleString() || "0"}</div>
                      <p className="text-xs text-muted-foreground mt-1">tokens used</p>
                    </div>
                  </div>

                  {/* Usage Chart Placeholder */}
                  <div className="p-8 rounded-md border border-dashed text-center">
                    <Database className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Usage charts coming soon
                    </p>
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {addons.map((addon: any) => {
                    const isActive = Array.isArray(activeAddons) && activeAddons.some((a: any) => a.addonId === addon.id);
                    return (
                      <Card key={addon.id} className={isActive ? "border-emerald-500 bg-emerald-500/5" : ""} data-testid={`addon-${addon.id}`}>
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
    </div>
  );
}
