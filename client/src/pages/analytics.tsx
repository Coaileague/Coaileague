import { useQuery } from "@tanstack/react-query";
import { DollarSign, Clock, Users, UserCheck, TrendingUp, FileText, BarChart3 } from "lucide-react";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

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
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center">
        <p className="text-slate-300">No analytics data available</p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Branded Header with Logo */}
        <div className="mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="transform hover:scale-105 transition-transform duration-300">
                <WorkforceOSLogo size="lg" showText={false} />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-1" data-testid="heading-analytics">
                  Analytics Dashboard
                </h2>
                <p className="text-slate-300 text-sm sm:text-base">
                  📊 Track your business performance and usage metrics
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20" data-testid="card-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Total Revenue</p>
            <div className="text-3xl font-bold text-white mb-1" data-testid="text-total-revenue">
              ${analytics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400">After platform fees</p>
          </div>

          {/* Hours Worked */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 rounded-2xl p-6 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20" data-testid="card-hours">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Hours Worked</p>
            <div className="text-3xl font-bold text-white mb-1" data-testid="text-total-hours">
              {analytics.totalHoursWorked.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </div>
            <p className="text-xs text-slate-400">Total time tracked</p>
          </div>

          {/* Active Employees */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 rounded-2xl p-6 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20" data-testid="card-active-employees">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <UserCheck className="w-6 h-6 text-indigo-400 animate-pulse" />
              </div>
              <div className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Active Employees</p>
            <div className="text-3xl font-bold text-white mb-1" data-testid="text-active-employees">
              {analytics.activeEmployees}
            </div>
            <p className="text-xs text-slate-400">Out of {analytics.employeeCount} total</p>
          </div>

          {/* Active Clients */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/20 rounded-2xl p-6 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20" data-testid="card-active-clients">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-purple-400" />
              </div>
              <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Active Clients</p>
            <div className="text-3xl font-bold text-white mb-1" data-testid="text-active-clients">
              {analytics.activeClients}
            </div>
            <p className="text-xs text-slate-400">Out of {analytics.clientCount} total</p>
          </div>
        </div>

        {/* Detailed Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workspace Usage */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden" data-testid="card-usage">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-indigo-400" />
                Workspace Usage
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Employee Capacity */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-300">Employee Capacity</span>
                  <span className="text-sm text-slate-400">
                    {analytics.employeeCount} / {analytics.workspace.maxEmployees}
                  </span>
                </div>
                <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-blue-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-indigo-500/30"
                    style={{ width: `${Math.min(employeeUsagePercent, 100)}%` }}
                    data-testid="progress-employees"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {employeeUsagePercent}% utilized
                </p>
              </div>

              {/* Client Capacity */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-300">Client Capacity</span>
                  <span className="text-sm text-slate-400">
                    {analytics.clientCount} / {analytics.workspace.maxClients}
                  </span>
                </div>
                <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-purple-500/30"
                    style={{ width: `${Math.min(clientUsagePercent, 100)}%` }}
                    data-testid="progress-clients"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {clientUsagePercent}% utilized
                </p>
              </div>

              {/* Current Plan */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  <span className="text-sm font-medium text-slate-300">Current Plan</span>
                  <span className="capitalize font-bold text-indigo-400">{analytics.workspace.subscriptionTier}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Statistics */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden" data-testid="card-invoice-stats">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="h-6 w-6 text-indigo-400" />
                Invoice Statistics
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Invoice Counts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-3xl font-bold text-white mb-1" data-testid="text-total-invoices">
                    {analytics.totalInvoices}
                  </p>
                  <p className="text-xs text-slate-400">Total Invoices</p>
                </div>
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-3xl font-bold text-white mb-1" data-testid="text-paid-invoices">
                    {analytics.paidInvoices}
                  </p>
                  <p className="text-xs text-slate-400">Paid Invoices</p>
                </div>
              </div>

              {/* Payment Rate */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-300">Payment Rate</span>
                  <span className="text-sm text-emerald-400 font-bold">
                    {paidInvoiceRate}%
                  </span>
                </div>
                <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-green-500 h-3 rounded-full transition-all duration-500 shadow-lg shadow-emerald-500/30"
                    style={{ width: `${paidInvoiceRate}%` }}
                    data-testid="progress-payment-rate"
                  />
                </div>
              </div>

              {/* Outstanding */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-sm text-slate-300">Draft/Sent</span>
                  <span className="font-bold text-amber-400">
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
