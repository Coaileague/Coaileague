import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DollarSign, 
  TrendingUp, 
  Cpu, 
  Cloud, 
  CreditCard,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CostSummary {
  workspaceId: string;
  period: string;
  
  // AI Usage Costs
  aiTokenCost: number;
  aiApiCalls: number;
  
  // Partner API Costs
  partnerApiCost: number;
  partnerApiCalls: number;
  
  // By Partner Breakdown
  quickbooksCost: number;
  quickbooksApiCalls: number;
  gustoCost: number;
  gustoApiCalls: number;
  stripeCost: number;
  stripeApiCalls: number;
  
  // Total Costs
  totalBaseCost: number;
  markupRate: number;
  markupAmount: number;
  totalBillableAmount: number;
  
  // Metadata
  workspaceTier: string;
  generatedAt: string;
}

export default function UsageDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, subscriptionTier, isLoading: accessLoading } = useWorkspaceAccess();
  
  // Default to current month
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Fetch usage summary
  const { data: summary, isLoading, error } = useQuery<CostSummary>({
    queryKey: ['/api/workspace/usage-summary', { year: selectedYear, month: selectedMonth }],
    enabled: isAuthenticated,
  });

  // Show loading while auth or workspace access is loading
  if (authLoading || !isAuthenticated || accessLoading) {
    return <ResponsiveLoading message="Loading Usage Dashboard..." />;
  }

  // RBAC: Only org_owner and org_admin can view this page
  if (workspaceRole !== 'org_owner' && workspaceRole !== 'org_admin') {
    return (
      <WorkspaceLayout>
        <div className="flex items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md" data-testid="alert-permission-denied">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only organization owners and administrators can view billing and usage data.
            </AlertDescription>
          </Alert>
        </div>
      </WorkspaceLayout>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatPeriod = (year: number, month: number) => {
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedMonth === 1) {
        setSelectedYear(selectedYear - 1);
        setSelectedMonth(12);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 12) {
        setSelectedYear(selectedYear + 1);
        setSelectedMonth(1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  const getTierBadgeColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'free':
        return 'bg-gray-500';
      case 'starter':
        return 'bg-blue-500';
      case 'professional':
        return 'bg-purple-500';
      case 'enterprise':
        return 'bg-amber-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <WorkspaceLayout>
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="page-usage-dashboard">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary" data-testid="text-page-title">
              Usage & Cost Dashboard
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              Track AI usage, partner API costs, and billing details
            </p>
          </div>
          
          {/* Period Navigator */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigatePeriod('prev')}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center" data-testid="text-current-period">
              {formatPeriod(selectedYear, selectedMonth)}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigatePeriod('next')}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Loading usage data...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" data-testid="alert-load-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to Load Usage Data</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unable to fetch usage summary. Please try again later.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        {summary && !isLoading && (
          <>
            {/* Tier and Total Cost Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-subscription-tier">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Subscription Tier
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge className={getTierBadgeColor(summary.workspaceTier)} data-testid="badge-tier">
                      {summary.workspaceTier.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(summary.markupRate * 100)}% markup
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-billable">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Total Billable
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-billable">
                    {formatCurrency(summary.totalBillableAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base cost + markup
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-base-cost">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Base Cost
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-base-cost">
                    {formatCurrency(summary.totalBaseCost)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI + Partner APIs
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-markup-amount">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    CoAIleague Markup
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-markup-amount">
                    {formatCurrency(summary.markupAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round(summary.markupRate * 100)}% of base cost
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* AI Usage Section */}
            <Card data-testid="card-ai-usage">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-primary" />
                      Trinity™ Usage
                    </CardTitle>
                    <CardDescription>Trinity AI processing usage</CardDescription>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Total Cost</p>
                    <p className="text-3xl font-bold" data-testid="text-ai-cost">
                      {formatCurrency(summary.aiTokenCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">API Calls</p>
                    <p className="text-3xl font-bold" data-testid="text-ai-calls">
                      {formatNumber(summary.aiApiCalls)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Partner API Usage Section */}
            <Card data-testid="card-partner-usage">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cloud className="h-5 w-5 text-primary" />
                      Partner API Usage
                    </CardTitle>
                    <CardDescription>QuickBooks, Gusto, and Stripe integration costs</CardDescription>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Total Partner Cost</p>
                    <p className="text-3xl font-bold" data-testid="text-partner-cost">
                      {formatCurrency(summary.partnerApiCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Total API Calls</p>
                    <p className="text-3xl font-bold" data-testid="text-partner-calls">
                      {formatNumber(summary.partnerApiCalls)}
                    </p>
                  </div>
                </div>

                {/* Partner Breakdown */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Breakdown by Partner</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg" data-testid="card-quickbooks">
                      <p className="text-sm font-medium mb-2">QuickBooks Online</p>
                      <p className="text-xl font-bold" data-testid="text-quickbooks-cost">
                        {formatCurrency(summary.quickbooksCost)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-quickbooks-calls">
                        {formatNumber(summary.quickbooksApiCalls)} calls
                      </p>
                    </div>

                    <div className="p-4 border rounded-lg" data-testid="card-gusto">
                      <p className="text-sm font-medium mb-2">Gusto Payroll</p>
                      <p className="text-xl font-bold" data-testid="text-gusto-cost">
                        {formatCurrency(summary.gustoCost)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-gusto-calls">
                        {formatNumber(summary.gustoApiCalls)} calls
                      </p>
                    </div>

                    <div className="p-4 border rounded-lg" data-testid="card-stripe">
                      <p className="text-sm font-medium mb-2">Stripe Payments</p>
                      <p className="text-xl font-bold" data-testid="text-stripe-cost">
                        {formatCurrency(summary.stripeCost)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-stripe-calls">
                        {formatNumber(summary.stripeApiCalls)} calls
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info Alert */}
            <Alert data-testid="alert-info">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Usage Billing Transparency</AlertTitle>
              <AlertDescription>
                CoAIleague tracks all AI and partner API usage with complete transparency. 
                Costs are billed monthly based on your subscription tier markup ({Math.round(summary.markupRate * 100)}% for {summary.workspaceTier} tier). 
                Base costs reflect actual consumption from Trinity AI, QuickBooks, Gusto, and Stripe.
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
