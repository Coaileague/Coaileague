import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, Users, UserCheck, TrendingUp, FileText } from "lucide-react";

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
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-muted-foreground">No analytics data available</p>
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="heading-analytics">Analytics Dashboard</h2>
            <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]">
              Track your business performance and usage metrics
            </p>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card data-testid="card-revenue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-revenue">
                ${analytics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                After platform fees
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-hours">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours Worked</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-hours">
                {analytics.totalHoursWorked.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total time tracked
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-active-employees">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-employees">
                {analytics.activeEmployees}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Out of {analytics.employeeCount} total
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-active-clients">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-clients">
                {analytics.activeClients}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Out of {analytics.clientCount} total
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card data-testid="card-usage">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Workspace Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Employee Capacity</span>
                  <span className="text-sm text-muted-foreground">
                    {analytics.employeeCount} / {analytics.workspace.maxEmployees}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(employeeUsagePercent, 100)}%` }}
                    data-testid="progress-employees"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {employeeUsagePercent}% utilized
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Client Capacity</span>
                  <span className="text-sm text-muted-foreground">
                    {analytics.clientCount} / {analytics.workspace.maxClients}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(clientUsagePercent, 100)}%` }}
                    data-testid="progress-clients"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {clientUsagePercent}% utilized
                </p>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm">
                  <span className="font-medium">Current Plan:</span>{" "}
                  <span className="capitalize">{analytics.workspace.subscriptionTier}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-invoice-stats">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-invoices">
                    {analytics.totalInvoices}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Invoices</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-paid-invoices">
                    {analytics.paidInvoices}
                  </p>
                  <p className="text-xs text-muted-foreground">Paid Invoices</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Payment Rate</span>
                  <span className="text-sm text-muted-foreground">
                    {paidInvoiceRate}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${paidInvoiceRate}%` }}
                    data-testid="progress-payment-rate"
                  />
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Draft/Sent</span>
                  <span className="font-medium">
                    {analytics.totalInvoices - analytics.paidInvoices}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
