import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, Calendar, DollarSign, Users, 
  Download, Filter, Lock, AlertCircle 
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { SubscriptionTier } from "@/lib/osModules";

// Report tab types
type ReportTab = 'billable' | 'payroll' | 'client' | 'activity' | 'audit';

// Tier requirements for each report
const reportTierRequirements: Record<ReportTab, SubscriptionTier> = {
  billable: 'starter',
  payroll: 'professional',
  client: 'starter',
  activity: 'starter',
  audit: 'professional',
};

// Role requirements for each report  
const reportRoleRequirements: Record<ReportTab, string[]> = {
  billable: ['supervisor', 'department_manager', 'org_admin', 'org_owner'],
  payroll: ['department_manager', 'org_admin', 'org_owner'],
  client: ['supervisor', 'department_manager', 'org_admin', 'org_owner'],
  activity: ['supervisor', 'department_manager', 'org_admin', 'org_owner'],
  audit: ['department_manager', 'org_admin', 'org_owner'],
};

export default function AnalyticsReportsPage() {
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading: accessLoading } = useWorkspaceAccess();
  const [activeTab, setActiveTab] = useState<ReportTab>('billable');
  const [startDate, setStartDate] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(subMonths(new Date(), 1)));

  // Check if user has access to current tab
  const hasRoleAccess = (tab: ReportTab): boolean => {
    if (isPlatformStaff) return true;
    return reportRoleRequirements[tab].includes(workspaceRole);
  };

  const hasTierAccess = (tab: ReportTab): boolean => {
    if (isPlatformStaff) return true;
    const tierHierarchy = { free: 1, starter: 2, professional: 3, enterprise: 4 };
    const required = tierHierarchy[reportTierRequirements[tab]];
    const current = tierHierarchy[subscriptionTier];
    return current >= required;
  };

  const canAccessTab = (tab: ReportTab): boolean => {
    return hasRoleAccess(tab) && hasTierAccess(tab);
  };

  if (accessLoading) {
    return (
      <div className="mobile-safe-container max-w-7xl mx-auto">
        <Skeleton className="h-12 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mobile-safe-container max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
                  Analytics Reports
                </h1>
                <p className="text-muted-foreground mt-1">
                  Comprehensive insights and reporting for workforce management
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Report Filters
                </CardTitle>
                <CardDescription>
                  Select date range and filters for your reports
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={format(startDate, 'yyyy-MM-dd')}
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  value={format(endDate, 'yyyy-MM-dd')}
                  onChange={(e) => setEndDate(new Date(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  data-testid="input-end-date"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quick Select</label>
                <Select defaultValue="last-month">
                  <SelectTrigger data-testid="select-quick-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-month">This Month</SelectItem>
                    <SelectItem value="last-month">Last Month</SelectItem>
                    <SelectItem value="this-quarter">This Quarter</SelectItem>
                    <SelectItem value="last-quarter">Last Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Report Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger 
              value="billable" 
              disabled={!canAccessTab('billable')}
              data-testid="tab-billable"
            >
              <div className="flex items-center gap-2">
                Billable Hours
                {!canAccessTab('billable') && <Lock className="w-3 h-3" />}
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="payroll"
              disabled={!canAccessTab('payroll')}
              data-testid="tab-payroll"
            >
              <div className="flex items-center gap-2">
                Payroll
                {!canAccessTab('payroll') && <Lock className="w-3 h-3" />}
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="client"
              disabled={!canAccessTab('client')}
              data-testid="tab-client"
            >
              <div className="flex items-center gap-2">
                Clients
                {!canAccessTab('client') && <Lock className="w-3 h-3" />}
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="activity"
              disabled={!canAccessTab('activity')}
              data-testid="tab-activity"
            >
              <div className="flex items-center gap-2">
                Activity
                {!canAccessTab('activity') && <Lock className="w-3 h-3" />}
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="audit"
              disabled={!canAccessTab('audit')}
              data-testid="tab-audit"
            >
              <div className="flex items-center gap-2">
                Audit Log
                {!canAccessTab('audit') && <Lock className="w-3 h-3" />}
              </div>
            </TabsTrigger>
          </TabsList>

          {/* Billable Hours Report */}
          <TabsContent value="billable" className="space-y-4">
            <BillableHoursReport startDate={startDate} endDate={endDate} />
          </TabsContent>

          {/* Payroll Report */}
          <TabsContent value="payroll" className="space-y-4">
            <PayrollReport startDate={startDate} endDate={endDate} />
          </TabsContent>

          {/* Client Summary Report */}
          <TabsContent value="client" className="space-y-4">
            <ClientSummaryReport startDate={startDate} endDate={endDate} />
          </TabsContent>

          {/* Employee Activity Report */}
          <TabsContent value="activity" className="space-y-4">
            <EmployeeActivityReport startDate={startDate} endDate={endDate} />
          </TabsContent>

          {/* Audit Trail Report */}
          <TabsContent value="audit" className="space-y-4">
            <AuditTrailReport startDate={startDate} endDate={endDate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Billable Hours Report Component
function BillableHoursReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/billable-hours', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
  });

  if (isLoading) {
    return <Card><CardContent className="p-12"><Skeleton className="h-48 w-full" /></CardContent></Card>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Error loading billable hours report</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Billable Hours Summary
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Report data will be displayed here</p>
          <p className="text-sm mt-2">Connected to /api/reports/billable-hours</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Payroll Report Component
function PayrollReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Payroll Summary
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Payroll report coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Client Summary Report Component
function ClientSummaryReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Client Summary
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Client summary coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Employee Activity Report Component
function EmployeeActivityReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Employee Activity
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Employee activity coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Audit Trail Report Component
function AuditTrailReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Audit Trail
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Audit trail coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
}
