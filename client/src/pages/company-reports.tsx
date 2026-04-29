import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Eye,
  FileText,
  Download,
  Printer,
  Send,
  Filter,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  Calendar as CalendarIcon,
  Share2,
  Archive,
} from 'lucide-react';;
import { format } from "date-fns";

export default function CompanyReports() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().setDate(1)), // First day of month
    to: new Date(),
  });
  const [selectedReport, setSelectedReport] = useState<string>("payroll-summary");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareRecipients, setShareRecipients] = useState("");
  const [shareNotes, setShareNotes] = useState("");

  // Fetch aggregated data
  type ReportData = {
    totalPayroll?: number;
    payrollCount?: number;
    totalRevenue?: number;
    invoiceCount?: number;
    totalHours?: number;
    activeEmployees?: number;
    profitMargin?: number;
    details?: any[];
  };
  const { data: reportData, isLoading } = useQuery<ReportData>({
    queryKey: ['/api/reports/company-data', selectedReport, dateRange],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/reports/generate', {
        reportType: selectedReport,
        startDate: dateRange.from,
        endDate: dateRange.to,
      });
      return (res as unknown) as ReportData;
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: 'pdf' | 'excel' | 'csv') => {
      return await apiRequest('POST', '/api/reports/export', {
        reportType: selectedReport,
        startDate: dateRange.from,
        endDate: dateRange.to,
        format,
      });
    },
    onSuccess: (data) => {
      // Trigger download
      const link = document.createElement('a');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      link.href = data.downloadUrl;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      link.download = data.filename;
      link.click();
      toast({
        title: "Report Exported",
        // @ts-expect-error — TS migration: fix in refactoring sprint
        description: `${data.filename} is ready for download`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Export Report Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const printReport = () => {
    window.print();
  };

  const shareMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/reports/share', {
        reportType: selectedReport,
        startDate: dateRange.from,
        endDate: dateRange.to,
        recipients: shareRecipients.split(',').map(e => e.trim()),
        notes: shareNotes,
      });
    },
    onSuccess: () => {
      setShareDialogOpen(false);
      setShareRecipients("");
      setShareNotes("");
      toast({
        title: "Report Shared",
        description: "Report workflow initiated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reports/history'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Share Report Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const actionButtons = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={printReport} data-testid="button-print">
        <Printer className="h-4 w-4 mr-2" />
        Print
      </Button>
      <Button variant="outline" onClick={() => setShareDialogOpen(true)} data-testid="button-share">
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
      <Select onValueChange={(val) => exportMutation.mutate(val as any)}>
        <SelectTrigger className="w-full md:w-[140px]">
          <Download className="h-4 w-4 mr-2" />
          Export
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pdf">PDF</SelectItem>
          <SelectItem value="excel">Excel</SelectItem>
          <SelectItem value="csv">CSV</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'company-reports',
    title: 'Company Reports & Analytics',
    subtitle: 'View, export, print, and share organizational data',
    category: 'operations',
    headerActions: actionButtons,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Report Type</Label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll-summary">Payroll Summary</SelectItem>
                  <SelectItem value="time-tracking">Time & Attendance</SelectItem>
                  <SelectItem value="invoicing">Invoicing & Revenue</SelectItem>
                  <SelectItem value="employee-costs">Employee Labor Costs</SelectItem>
                  <SelectItem value="client-profitability">Client Profitability</SelectItem>
                  <SelectItem value="compliance-audit">Compliance Audit Trail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.to, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(reportData as any)?.totalPayroll?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">
              {(reportData as any)?.payrollCount || 0} employees paid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(reportData as any)?.totalRevenue?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">
              {(reportData as any)?.invoiceCount || 0} invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(reportData as any)?.totalHours?.toFixed(1) || '0.0'}</div>
            <p className="text-xs text-muted-foreground">
              // @ts-ignore — TS migration: fix in refactoring sprint
              Across {(reportData as any)?.activeEmployees || 0} employees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(reportData as any)?.profitMargin?.toFixed(1) || '0.0'}%</div>
            <p className="text-xs text-muted-foreground">
              Revenue minus labor costs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Report Data */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Report Data</CardTitle>
          <CardDescription>
            {selectedReport.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - {format(dateRange.from, 'MMM d')} to {format(dateRange.to, 'MMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading report data...</div>
          ) : reportData?.details ? (
            <div className="space-y-4">
              {reportData.details.map((item: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-2 p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{item.name || item.description}</p>
                    <p className="text-sm text-muted-foreground">{item.details}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{item.value}</p>
                    {item.badge && <Badge variant="outline" className="mt-1">{item.badge}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No report data matches the selected criteria yet. Adjust the filters or generate more activity for this reporting window.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share Dialog */}
      <UniversalModal open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Share Report Workflow</UniversalModalTitle>
            <UniversalModalDescription>
              Send this report to team members with optional notes
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Recipients (comma-separated emails)</Label>
              <Input
                placeholder="manager@company.com, hr@company.com"
                value={shareRecipients}
                onChange={(e) => setShareRecipients(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Please review this report and provide feedback..."
                value={shareNotes}
                onChange={(e) => setShareNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => shareMutation.mutate()} disabled={!shareRecipients || shareMutation.isPending}>
              {shareMutation.isPending ? "Sending..." : "Send Report"}
            </Button>
          </div>
        </UniversalModalContent>
      </UniversalModal>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          button, .no-print {
            display: none !important;
          }
        }
      `}</style>
    </CanvasHubPage>
  );
}
