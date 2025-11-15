import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useClientLookup } from "@/hooks/useClients";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  FileText,
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import type { Invoice, TimeEntry, Employee, Client } from "@shared/schema";
import { DashboardShell, ResponsiveSection } from "@/components/dashboard-shell";

export default function AuditorPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");

  // Fetch data
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clients = [] } = useClientLookup();

  // Calculate financial metrics
  const totalRevenue = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const outstandingInvoices = invoices
    .filter(inv => inv.status === 'sent')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const totalLaborCost = timeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);

  const profitMargin = totalRevenue > 0
    ? ((totalRevenue - totalLaborCost) / totalRevenue * 100)
    : 0;

  const totalHours = timeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);

  const averageHourlyRate = totalHours > 0 ? totalLaborCost / totalHours : 0;

  // Filter by period
  const getDateRange = () => {
    const now = new Date();
    const start = new Date();
    
    switch (selectedPeriod) {
      case "current-month":
        start.setDate(1);
        break;
      case "last-month":
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        break;
      case "current-quarter":
        start.setMonth(Math.floor(start.getMonth() / 3) * 3);
        start.setDate(1);
        break;
      case "current-year":
        start.setMonth(0);
        start.setDate(1);
        break;
      default:
        start.setDate(1);
    }
    
    return { start, end: now };
  };

  const { start, end } = getDateRange();

  const filteredInvoices = invoices.filter(inv => {
    const date = inv.createdAt ? new Date(inv.createdAt) : new Date();
    return date >= start && date <= end;
  });

  const filteredTimeEntries = timeEntries.filter(entry => {
    const date = new Date(entry.clockIn);
    return date >= start && date <= end;
  });

  // Export functions
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportInvoices = () => {
    const data = filteredInvoices.map(inv => ({
      id: inv.id,
      date: inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '',
      client: clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown',
      subtotal: inv.subtotal,
      tax: inv.taxAmount,
      total: inv.total,
      status: inv.status,
    }));
    exportToCSV(data, `invoices-${selectedPeriod}`);
  };

  const exportTimeEntries = () => {
    const data = filteredTimeEntries.map(entry => ({
      id: entry.id,
      employee: employees.find(e => e.id === entry.employeeId)?.firstName || 'Unknown',
      date: new Date(entry.clockIn).toLocaleDateString(),
      clockIn: new Date(entry.clockIn).toLocaleTimeString(),
      clockOut: entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString() : 'In Progress',
      hours: entry.totalHours,
      amount: entry.totalAmount,
    }));
    exportToCSV(data, `time-entries-${selectedPeriod}`);
  };

  const exportPayrollSummary = () => {
    const payrollByEmployee = employees.map(emp => {
      const empEntries = filteredTimeEntries.filter(e => e.employeeId === emp.id);
      const hours = empEntries.reduce((sum, e) => sum + Number(e.totalHours || 0), 0);
      const amount = empEntries.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);
      
      return {
        employeeId: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        hourlyRate: emp.hourlyRate,
        totalHours: hours.toFixed(2),
        totalAmount: amount.toFixed(2),
      };
    }).filter(e => Number(e.totalHours) > 0);

    exportToCSV(payrollByEmployee, `payroll-summary-${selectedPeriod}`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-indigo-500" />
                Auditor & Bookkeeper Portal
              </h1>
              <p className="text-muted-foreground mt-1">
                Read-only financial reports and analytics
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[180px]" data-testid="select-period">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="current-quarter">Current Quarter</SelectItem>
                  <SelectItem value="current-year">Current Year</SelectItem>
                  <SelectItem value="all-time">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Financial Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <Badge className="bg-muted/10 text-primary border-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Paid
                  </Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  ${totalRevenue.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <AlertCircle className="h-5 w-5 text-blue-500" />
                  <Badge variant="secondary">Outstanding</Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-outstanding">
                  ${outstandingInvoices.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Outstanding Invoices</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-5 w-5 text-rose-500" />
                  <Badge variant="secondary">Labor</Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-labor-cost">
                  ${totalLaborCost.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Total Labor Cost</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-indigo-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  {profitMargin >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-primary" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-rose-500" />
                  )}
                  <Badge 
                    className={profitMargin >= 0 
                      ? "bg-muted/10 text-primary border-0" 
                      : "bg-rose-500/10 text-rose-600 border-0"
                    }
                  >
                    {profitMargin >= 0 ? '+' : ''}{profitMargin.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-profit-margin">
                  {profitMargin.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground">Profit Margin</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll</TabsTrigger>
            <TabsTrigger value="exports" data-testid="tab-exports">Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    Labor Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Hours Worked</span>
                    <Badge variant="secondary">{totalHours.toFixed(1)}h</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Average Hourly Rate</span>
                    <Badge variant="secondary">${averageHourlyRate.toFixed(2)}/hr</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active Employees</span>
                    <Badge variant="secondary">{employees.filter(e => e.onboardingStatus === 'completed').length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Time Entries</span>
                    <Badge variant="secondary">{filteredTimeEntries.length}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Client Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active Clients</span>
                    <Badge variant="secondary">{clients.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Paid Invoices</span>
                    <Badge className="bg-muted/10 text-primary border-0">
                      {invoices.filter(i => i.status === 'paid').length}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Pending Invoices</span>
                    <Badge className="bg-blue-500/10 text-blue-600 border-0">
                      {invoices.filter(i => i.status === 'sent').length}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Draft Invoices</span>
                    <Badge variant="secondary">{invoices.filter(i => i.status === 'draft').length}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Invoice History</CardTitle>
                    <CardDescription>All invoices for selected period</CardDescription>
                  </div>
                  <Button onClick={exportInvoices} size="sm" data-testid="button-export-invoices">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">#{invoice.id?.slice(0, 8)}</TableCell>
                          <TableCell>
                            {invoice.createdAt 
                              ? new Date(invoice.createdAt).toLocaleDateString() 
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {clients.find(c => c.id === invoice.clientId)?.companyName || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-right">
                            ${Number(invoice.subtotal || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            ${Number(invoice.taxAmount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            ${Number(invoice.total || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                invoice.status === 'paid'
                                  ? 'bg-muted/10 text-primary border-0'
                                  : invoice.status === 'sent'
                                  ? 'bg-blue-500/10 text-blue-600 border-0'
                                  : ''
                              }
                              variant={invoice.status === 'draft' ? 'secondary' : 'outline'}
                            >
                              {invoice.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payroll" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Payroll Summary</CardTitle>
                    <CardDescription>Employee labor costs for selected period</CardDescription>
                  </div>
                  <Button onClick={exportPayrollSummary} size="sm" data-testid="button-export-payroll">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Hourly Rate</TableHead>
                        <TableHead className="text-right">Total Hours</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((employee) => {
                        const empEntries = filteredTimeEntries.filter(e => e.employeeId === employee.id);
                        const hours = empEntries.reduce((sum, e) => sum + Number(e.totalHours || 0), 0);
                        const amount = empEntries.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);

                        if (hours === 0) return null;

                        return (
                          <TableRow key={employee.id}>
                            <TableCell className="font-medium">
                              {employee.firstName} {employee.lastName}
                            </TableCell>
                            <TableCell>{employee.email}</TableCell>
                            <TableCell className="text-right">
                              ${Number(employee.hourlyRate || 0).toFixed(2)}/hr
                            </TableCell>
                            <TableCell className="text-right">{hours.toFixed(2)}h</TableCell>
                            <TableCell className="text-right font-semibold">
                              ${amount.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Export Financial Data</CardTitle>
                <CardDescription>Download financial reports in CSV format</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border hover-elevate transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-semibold">Invoice Report</p>
                      <p className="text-sm text-muted-foreground">
                        All invoices with client details and amounts
                      </p>
                    </div>
                  </div>
                  <Button onClick={exportInvoices} data-testid="button-export-invoices-alt">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-border hover-elevate transition-colors">
                  <div className="flex items-center gap-3">
                    <Clock className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-semibold">Time Entry Report</p>
                      <p className="text-sm text-muted-foreground">
                        Detailed clock-in/out records with hours and amounts
                      </p>
                    </div>
                  </div>
                  <Button onClick={exportTimeEntries} data-testid="button-export-time-entries">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-border hover-elevate transition-colors">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-indigo-500" />
                    <div>
                      <p className="font-semibold">Payroll Summary</p>
                      <p className="text-sm text-muted-foreground">
                        Employee labor costs aggregated by person
                      </p>
                    </div>
                  </div>
                  <Button onClick={exportPayrollSummary} data-testid="button-export-payroll-alt">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
