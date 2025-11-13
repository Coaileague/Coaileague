import { useQuery } from "@tanstack/react-query";
import { DollarSign, Clock, Users, UserCheck, TrendingUp, FileText, BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { Button } from "@/components/ui/button";
import { exportReport } from "@/lib/exportUtils";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  totalRevenue: number;
  totalHoursWorked: number;
  activeEmployees: number;
  activeClients: number;
  employeeCount: number;
  clientCount: number;
  totalInvoices: number;
  paidInvoices: number;
  workspace: {
    subscriptionTier: string;
    maxEmployees: number;
    maxClients: number;
  };
}

export default function Analytics() {
  const { toast } = useToast();
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics'],
  });

  const handleExport = (format: 'csv' | 'pdf') => {
    if (!analytics) {
      toast({
        title: "No data available",
        description: "Cannot export - please wait for data to load",
        variant: "destructive",
      });
      return;
    }

    // Calculate payment rate safely (avoid division by zero)
    const paymentRate = analytics.totalInvoices > 0
      ? `${Math.round((analytics.paidInvoices / analytics.totalInvoices) * 100)}%`
      : 'N/A';

    const exportData = [
      { metric: 'Total Revenue', value: `$${analytics.totalRevenue.toLocaleString()}`, category: 'Financial' },
      { metric: 'Hours Worked', value: analytics.totalHoursWorked.toLocaleString(), category: 'Operations' },
      { metric: 'Active Employees', value: analytics.activeEmployees, category: 'Team' },
      { metric: 'Total Employees', value: analytics.employeeCount, category: 'Team' },
      { metric: 'Active Clients', value: analytics.activeClients, category: 'Business' },
      { metric: 'Total Clients', value: analytics.clientCount, category: 'Business' },
      { metric: 'Total Invoices', value: analytics.totalInvoices, category: 'Billing' },
      { metric: 'Paid Invoices', value: analytics.paidInvoices, category: 'Billing' },
      { metric: 'Payment Rate', value: paymentRate, category: 'Performance' },
      { metric: 'Subscription Plan', value: analytics.workspace.subscriptionTier, category: 'Account' },
      { metric: 'Employee Capacity', value: `${analytics.employeeCount} / ${analytics.workspace.maxEmployees}`, category: 'Limits' },
      { metric: 'Client Capacity', value: `${analytics.clientCount} / ${analytics.workspace.maxClients}`, category: 'Limits' },
    ];

    exportReport(format, 'Analytics Dashboard', exportData, {
      columns: ['metric', 'value', 'category'],
      columnLabels: { metric: 'Metric', value: 'Value', category: 'Category' },
      onPopupBlocked: () => {
        toast({
          title: "Pop-up Blocked",
          description: "Please allow pop-ups for this site to download PDF reports. Then try again.",
          variant: "destructive",
        });
      },
    });

    if (format === 'csv') {
      toast({
        title: "CSV Export Started",
        description: "Your analytics report is downloading",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-gray-600">No analytics data available</p>
      </div>
    );
  }

  const employeeUsagePercent = analytics.workspace.maxEmployees && analytics.workspace.maxEmployees > 0
    ? Math.round((analytics.employeeCount / analytics.workspace.maxEmployees) * 100)
    : 0;

  const clientUsagePercent = analytics.workspace.maxClients && analytics.workspace.maxClients > 0
    ? Math.round((analytics.clientCount / analytics.workspace.maxClients) * 100)
    : 0;

  const paidInvoiceRate = analytics.totalInvoices > 0
    ? Math.round((analytics.paidInvoices / analytics.totalInvoices) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/5 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Branded Header with Logo */}
        <div className="mb-8">
          <div className="backdrop-blur-xl bg-white/80 border border-gray-200 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-4">
              <div className="transform hover:scale-105 transition-transform duration-300">
                <AnimatedAutoForceLogo size="lg" variant="icon" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-1" data-testid="heading-analytics">
                  Analytics Dashboard
                </h2>
                <p className="text-gray-600 text-sm sm:text-base">
                  📊 Track your business performance and usage metrics
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv')}
                  data-testid="button-export-csv"
                  className="gap-2 bg-white hover-elevate"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">CSV</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('pdf')}
                  data-testid="button-export-pdf"
                  className="gap-2 bg-white hover-elevate"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-primary/10 to-blue-500/5 border border-primary/20 rounded-2xl p-6 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20" data-testid="card-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-muted/20 rounded-xl group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
            </div>
            <p className="text-gray-600 text-sm mb-2">Total Revenue</p>
            <div className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-total-revenue">
              ${analytics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500">After platform fees</p>
          </div>

          {/* Hours Worked */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-2xl p-6 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20" data-testid="card-hours">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-gray-600 text-sm mb-2">Hours Worked</p>
            <div className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-total-hours">
              {analytics.totalHoursWorked.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </div>
            <p className="text-xs text-gray-500">Total time tracked</p>
          </div>

          {/* Active Employees */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20" data-testid="card-active-employees">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <UserCheck className="w-6 h-6 text-emerald-700 dark:text-emerald-400 animate-pulse" />
              </div>
              <div className="h-2 w-2 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-gray-600 text-sm mb-2">Active Employees</p>
            <div className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-active-employees">
              {analytics.activeEmployees}
            </div>
            <p className="text-xs text-gray-500">Out of {analytics.employeeCount} total</p>
          </div>

          {/* Active Clients */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 rounded-2xl p-6 hover:border-cyan-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20" data-testid="card-active-clients">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-cyan-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-cyan-700 dark:text-cyan-400" />
              </div>
              <div className="h-2 w-2 bg-cyan-600 dark:bg-cyan-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-gray-600 text-sm mb-2">Active Clients</p>
            <div className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-active-clients">
              {analytics.activeClients}
            </div>
            <p className="text-xs text-gray-500">Out of {analytics.clientCount} total</p>
          </div>
        </div>

        {/* Detailed Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workspace Usage */}
          <div className="backdrop-blur-xl bg-white/80 border border-gray-200 rounded-2xl overflow-hidden" data-testid="card-usage">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                Workspace Usage
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Employee Capacity */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">Employee Capacity</span>
                  <span className="text-sm text-gray-500">
                    {analytics.employeeCount} / {analytics.workspace.maxEmployees}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-blue-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-indigo-500/30"
                    style={{ width: `${Math.min(employeeUsagePercent, 100)}%` }}
                    data-testid="progress-employees"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {employeeUsagePercent}% utilized
                </p>
              </div>

              {/* Client Capacity */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">Client Capacity</span>
                  <span className="text-sm text-gray-500">
                    {analytics.clientCount} / {analytics.workspace.maxClients}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-purple-500/30"
                    style={{ width: `${Math.min(clientUsagePercent, 100)}%` }}
                    data-testid="progress-clients"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {clientUsagePercent}% utilized
                </p>
              </div>

              {/* Current Plan */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-sm font-medium text-gray-600">Current Plan</span>
                  <span className="capitalize font-bold text-emerald-700 dark:text-emerald-400">{analytics.workspace.subscriptionTier}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Statistics */}
          <div className="backdrop-blur-xl bg-white/80 border border-gray-200 rounded-2xl overflow-hidden" data-testid="card-invoice-stats">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                Invoice Statistics
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Invoice Counts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-total-invoices">
                    {analytics.totalInvoices}
                  </p>
                  <p className="text-xs text-gray-500">Total Invoices</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/10 border border-primary/20">
                  <p className="text-3xl font-bold text-gray-900 mb-1" data-testid="text-paid-invoices">
                    {analytics.paidInvoices}
                  </p>
                  <p className="text-xs text-gray-500">Paid Invoices</p>
                </div>
              </div>

              {/* Payment Rate */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">Payment Rate</span>
                  <span className="text-sm text-primary font-bold">
                    {paidInvoiceRate}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-blue-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-primary/30"
                    style={{ width: `${paidInvoiceRate}%` }}
                    data-testid="progress-payment-rate"
                  />
                </div>
              </div>

              {/* Outstanding */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span className="text-sm text-gray-600">Draft/Sent</span>
                  <span className="font-bold text-blue-400">
                    {analytics.totalInvoices - analytics.paidInvoices}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
