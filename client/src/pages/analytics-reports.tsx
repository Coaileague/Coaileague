import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { apiFetch } from "@/lib/apiError";
import { BillableHoursReportResponse, PayrollReportResponse, ClientSummaryReportResponse, EmployeeActivityReportResponse, AuditLogReportResponse } from "@shared/schemas/responses/analytics";
import { useToast } from "@/hooks/use-toast";
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
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { 
  FileText, Calendar, DollarSign, Users, 
  Download, Filter, Lock, AlertCircle 
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { SubscriptionTier } from "@/lib/sidebarModules";

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
  billable: ['supervisor', 'department_manager', 'co_owner', 'org_owner'],
  payroll: ['department_manager', 'co_owner', 'org_owner'],
  client: ['supervisor', 'department_manager', 'co_owner', 'org_owner'],
  activity: ['supervisor', 'department_manager', 'co_owner', 'org_owner'],
  audit: ['department_manager', 'co_owner', 'org_owner'],
};

export default function AnalyticsReportsPage() {
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading: accessLoading } = useWorkspaceAccess();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(subMonths(new Date(), 1)));

  // Determine first accessible tab for initial state
  const getFirstAccessibleTab = (): ReportTab => {
    const tabs: ReportTab[] = ['billable', 'payroll', 'client', 'activity', 'audit'];
    return tabs.find(tab => {
      const hasRole = isPlatformStaff || reportRoleRequirements[tab].includes(workspaceRole);
      const tierHierarchy = { free: 1, starter: 2, professional: 3, enterprise: 4 };
      const hasTier = isPlatformStaff || tierHierarchy[subscriptionTier] >= tierHierarchy[reportTierRequirements[tab]];
      return hasRole && hasTier;
    }) || 'billable';
  };

  const [activeTab, setActiveTab] = useState<ReportTab>(getFirstAccessibleTab());

  const handleExport = () => {
    // Check tier access - export is Enterprise feature
    if (!isPlatformStaff && subscriptionTier !== 'enterprise') {
      toast({
        title: "Upgrade Required",
        description: "Export functionality is available on Enterprise tier. Upgrade to unlock CSV/PDF exports.",
        variant: "default",
      });
      return;
    }

    // Placeholder for actual export implementation
    toast({
      title: "Export Started",
      description: `Exporting ${activeTab} report for ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`,
    });
  };

  const handleQuickSelect = (value: string) => {
    const now = new Date();
    switch (value) {
      case 'this-month':
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        break;
      case 'last-month':
        setStartDate(startOfMonth(subMonths(now, 1)));
        setEndDate(endOfMonth(subMonths(now, 1)));
        break;
      case 'this-quarter': {
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
        setStartDate(quarterStart);
        setEndDate(quarterEnd);
        break;
      }
      case 'last-quarter': {
        const lastQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
        const lastQuarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
        setStartDate(lastQuarterStart);
        setEndDate(lastQuarterEnd);
        break;
      }
    }
  };

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

  const actionButton = (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleExport}
      data-testid="button-export"
    >
      <Download className="w-4 h-4 mr-2" />
      Export Report
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'analytics-reports',
    title: 'Analytics Reports',
    subtitle: 'Comprehensive insights and reporting for workforce management',
    category: 'operations',
    headerActions: actionButton,
  };

  if (accessLoading) {
    return (
      <CanvasHubPage config={{ ...pageConfig, headerActions: undefined }}>
        <Skeleton className="h-12 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Filters Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Report Filters
            </CardTitle>
            <CardDescription>
              Select date range and filters for your reports
            </CardDescription>
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
                <Select defaultValue="last-month" onValueChange={handleQuickSelect}>
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
          <TabsList className="w-full overflow-x-auto grid grid-cols-2 sm:grid-cols-5 mb-6">
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
            {canAccessTab('billable') ? (
              <BillableHoursReport startDate={startDate} endDate={endDate} />
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium">Access Restricted</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Requires {reportRoleRequirements['billable'].includes('supervisor') ? 'Supervisor' : 'Manager'} role and {reportTierRequirements['billable']} tier.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Payroll Report */}
          <TabsContent value="payroll" className="space-y-4">
            {canAccessTab('payroll') ? (
              <PayrollReport startDate={startDate} endDate={endDate} />
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium">Access Restricted</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Requires Manager role and Professional tier.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Client Summary Report */}
          <TabsContent value="client" className="space-y-4">
            {canAccessTab('client') ? (
              <ClientSummaryReport startDate={startDate} endDate={endDate} />
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium">Access Restricted</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Requires Manager role and Starter tier.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Employee Activity Report */}
          <TabsContent value="activity" className="space-y-4">
            {canAccessTab('activity') ? (
              <EmployeeActivityReport startDate={startDate} endDate={endDate} />
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium">Access Restricted</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Requires Supervisor role and Starter tier.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Audit Trail Report */}
          <TabsContent value="audit" className="space-y-4">
            {canAccessTab('audit') ? (
              <AuditTrailReport startDate={startDate} endDate={endDate} />
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium">Access Restricted</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Requires Manager role and Professional tier.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
    </CanvasHubPage>
  );
}

// Billable Hours Report Component
function BillableHoursReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/billable-hours', { startDate: startDateStr, endDate: endDateStr }],
    queryFn: () => apiFetch(`/api/reports/billable-hours?startDate=${startDateStr}&endDate=${endDateStr}`, BillableHoursReportResponse),
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
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/payroll', { startDate: startDateStr, endDate: endDateStr }],
    queryFn: () => apiFetch(`/api/reports/payroll?startDate=${startDateStr}&endDate=${endDateStr}`, PayrollReportResponse),
  });

  if (isLoading) {
    return <Card><CardContent className="p-12"><Skeleton className="h-48 w-full" /></CardContent></Card>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Error loading payroll report</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const report = data as { data: any[]; total: number; filters: any };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Payroll Summary
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')} • {report?.total || 0} records
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!report?.data || report.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-payroll">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No payroll data for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Regular Hours</TableHead>
                  <TableHead>OT Hours</TableHead>
                  <TableHead>Holiday Hours</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.map((row: any, idx: number) => (
                  <TableRow key={idx} data-testid={`row-payroll-${idx}`}>
                    <TableCell className="font-medium">{row.employeeName || 'N/A'}</TableCell>
                    <TableCell>{row.regularHours?.toFixed(1) || '0.0'}</TableCell>
                    <TableCell>{row.overtimeHours?.toFixed(1) || '0.0'}</TableCell>
                    <TableCell>{row.holidayHours?.toFixed(1) || '0.0'}</TableCell>
                    <TableCell className="text-right">${row.grossPay?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell className="text-right">${row.netPay?.toFixed(2) || '0.00'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Client Summary Report Component
function ClientSummaryReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/client-summary', { startDate: startDateStr, endDate: endDateStr }],
    queryFn: () => apiFetch(`/api/reports/client-summary?startDate=${startDateStr}&endDate=${endDateStr}`, ClientSummaryReportResponse),
  });

  if (isLoading) {
    return <Card><CardContent className="p-12"><Skeleton className="h-48 w-full" /></CardContent></Card>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Error loading client summary</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const report = data as { data: any[]; total: number; filters: any };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Client Summary
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')} • {report?.total || 0} clients
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!report?.data || report.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-clients">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No client data for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead className="text-right">Total Billed</TableHead>
                  <TableHead>Active Employees</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.map((row: any, idx: number) => (
                  <TableRow key={idx} data-testid={`row-client-${idx}`}>
                    <TableCell className="font-medium">{row.clientName || 'N/A'}</TableCell>
                    <TableCell>{row.totalHours?.toFixed(1) || '0.0'}</TableCell>
                    <TableCell className="text-right">${row.totalBilled?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>{row.activeEmployees || 0}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                        {row.status || 'N/A'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Employee Activity Report Component
function EmployeeActivityReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/employee-activity', { startDate: startDateStr, endDate: endDateStr }],
    queryFn: () => apiFetch(`/api/reports/employee-activity?startDate=${startDateStr}&endDate=${endDateStr}`, EmployeeActivityReportResponse),
  });

  if (isLoading) {
    return <Card><CardContent className="p-12"><Skeleton className="h-48 w-full" /></CardContent></Card>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Error loading employee activity</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const report = data as { data: any[]; total: number; filters: any };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Employee Activity
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')} • {report?.total || 0} employees
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!report?.data || report.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-activity">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No employee activity for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Shifts Worked</TableHead>
                  <TableHead>Attendance Rate</TableHead>
                  <TableHead>Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.map((row: any, idx: number) => (
                  <TableRow key={idx} data-testid={`row-activity-${idx}`}>
                    <TableCell className="font-medium">{row.employeeName || 'N/A'}</TableCell>
                    <TableCell>{row.totalHours?.toFixed(1) || '0.0'}</TableCell>
                    <TableCell>{row.shiftsWorked || 0}</TableCell>
                    <TableCell>{row.attendanceRate ? `${row.attendanceRate.toFixed(1)}%` : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={row.performance === 'excellent' ? 'default' : 'secondary'}>
                        {row.performance || 'N/A'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Audit Trail Report Component
function AuditTrailReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/audit-logs', { startDate: startDateStr, endDate: endDateStr }],
    queryFn: () => apiFetch(`/api/reports/audit-logs?startDate=${startDateStr}&endDate=${endDateStr}`, AuditLogReportResponse),
  });

  if (isLoading) {
    return <Card><CardContent className="p-12"><Skeleton className="h-48 w-full" /></CardContent></Card>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Error loading audit logs</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const report = data as { data: any[]; total: number; filters: any; actionCounts?: any };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Audit Trail
        </CardTitle>
        <CardDescription>
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')} • {report?.total || 0} audit logs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!report?.data || report.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-audit">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No audit logs for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.map((row: any, idx: number) => (
                  <TableRow key={idx} data-testid={`row-audit-${idx}`}>
                    <TableCell className="font-medium">
                      {row.timestamp ? format(new Date(row.timestamp), 'MMM d, HH:mm') : 'N/A'}
                    </TableCell>
                    <TableCell>{row.userName || row.userId || 'System'}</TableCell>
                    <TableCell>{row.action || 'N/A'}</TableCell>
                    <TableCell className="max-w-xs truncate">{row.targetType || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'success' ? 'default' : 'destructive'}>
                        {row.status || 'N/A'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
