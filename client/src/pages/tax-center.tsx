import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  FileText, Calendar, AlertTriangle, CheckCircle, Download,
  ExternalLink, DollarSign, Users, Briefcase, Receipt, Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface FilingDeadline {
  formType: '941' | '940' | 'w2' | '1099';
  description: string;
  deadline: string;
  year: number;
  quarter?: number;
  status: 'upcoming' | 'due_soon' | 'overdue' | 'filed';
  daysUntilDue: number;
  filingInstructions: string;
  irsPortalUrl?: string;
}

interface TaxCenterResponse {
  taxYear: number;
  employees: {
    w2Count: number;
    total1099Count: number;
    contractorsAbove600: number;
    contractorDetails: Array<{
      employeeId: string;
      name: string;
      totalPaid: number;
      requiresFiling: boolean;
    }>;
  };
  forms: {
    w2sGenerated: number;
    form1099sGenerated: number;
    w2sExpected: number;
    form1099sExpected: number;
  };
  deadlines: FilingDeadline[];
  filingGuides: Record<string, { url: string; label: string }>;
  fees: {
    w2PerForm: number;
    form1099PerForm: number;
    tierDiscountPercent: number;
    estimatedTotal: number;
  };
  disclaimer: string;
}

const statusColor: Record<FilingDeadline['status'], string> = {
  upcoming: 'bg-muted text-foreground',
  due_soon: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  overdue: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  filed: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100',
};

export default function TaxCenterPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear - 1);

  const { data, isLoading, isError } = useQuery<TaxCenterResponse>({
    queryKey: ['/api/payroll/tax-center', selectedYear],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/payroll/tax-center?taxYear=${selectedYear}`);
      return res.json();
    },
    enabled: !!user,
  });

  const generate941 = useMutation({
    mutationFn: async ({ quarter, year }: { quarter: number; year: number }) => {
      const res = await apiRequest('POST', '/api/payroll/tax-forms/941', { quarter, year });
      return res;
    },
    onSuccess: () => {
      toast({ title: 'Form 941 generated', description: 'Your quarterly federal payroll tax return is ready to download.' });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/tax-center'] });
    },
    onError: (err: any) => {
      toast({ title: 'Generation failed', description: err?.message || 'Could not generate Form 941', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-4" data-testid="tax-center-loading">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto p-6" data-testid="tax-center-error">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>Failed to load tax center data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { employees, forms, deadlines, fees, filingGuides, disclaimer } = data;
  const upcomingDeadlines = deadlines
    .filter(d => d.status === 'upcoming' || d.status === 'due_soon' || d.status === 'overdue')
    .slice(0, 6);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="tax-center-page">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt className="h-8 w-8 text-primary" />
            Tax Center — FY {data.taxYear}
          </h1>
          <p className="text-muted-foreground mt-1">
            All tax obligations, forms, and deadlines in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tax Year</span>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v, 10))}>
            <SelectTrigger className="w-32" data-testid="select-tax-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-w2-employees">
          <CardHeader className="pb-2">
            <CardDescription>W-2 Employees</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              {employees.w2Count}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {forms.w2sGenerated}/{forms.w2sExpected} W-2s generated
          </CardContent>
        </Card>
        <Card data-testid="card-1099-contractors">
          <CardHeader className="pb-2">
            <CardDescription>1099 Contractors</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" />
              {employees.contractorsAbove600}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Above $600 threshold ({employees.total1099Count} total)
          </CardContent>
        </Card>
        <Card data-testid="card-estimated-cost">
          <CardHeader className="pb-2">
            <CardDescription>Estimated form fees</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              {formatCurrency(fees.estimatedTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            W-2 ${fees.w2PerForm.toFixed(2)} • 1099 ${fees.form1099PerForm.toFixed(2)}
            {fees.tierDiscountPercent > 0 && (
              <span className="block text-primary">Tier discount: {fees.tierDiscountPercent}% off</span>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-upcoming-deadlines">
          <CardHeader className="pb-2">
            <CardDescription>Upcoming deadlines</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              {upcomingDeadlines.filter(d => d.status !== 'filed').length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Next 30 days
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="deadlines" className="w-full">
        <TabsList>
          <TabsTrigger value="deadlines" data-testid="tab-deadlines">Deadlines</TabsTrigger>
          <TabsTrigger value="forms" data-testid="tab-forms">Forms</TabsTrigger>
          <TabsTrigger value="filing" data-testid="tab-filing">How to File</TabsTrigger>
          <TabsTrigger value="contractors" data-testid="tab-contractors">1099 Contractors</TabsTrigger>
        </TabsList>

        {/* Deadlines tab */}
        <TabsContent value="deadlines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Filing Deadlines</CardTitle>
              <CardDescription>
                Sorted by due date. We calculate and generate everything — you file.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-muted-foreground">No deadlines to display.</p>
              ) : (
                <div className="space-y-3">
                  {deadlines.map((d) => (
                    <div
                      key={`${d.formType}-${d.deadline}-${d.quarter || ''}`}
                      className="flex items-start justify-between p-3 rounded-md border gap-3"
                      data-testid={`deadline-${d.formType}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{d.description}</span>
                          <Badge className={statusColor[d.status]}>
                            {d.status === 'overdue' ? 'Overdue' :
                             d.status === 'due_soon' ? 'Due soon' :
                             d.status === 'filed' ? 'Filed' : 'Upcoming'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Due {format(new Date(d.deadline), 'MMM d, yyyy')}
                          {d.daysUntilDue > 0 && ` — ${d.daysUntilDue} days away`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{d.filingInstructions}</p>
                      </div>
                      {d.irsPortalUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`deadline-portal-${d.formType}`}
                        >
                          <a href={d.irsPortalUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Portal
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forms tab */}
        <TabsContent value="forms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generated Forms for FY {data.taxYear}</CardTitle>
              <CardDescription>
                Download, review, then file via IRS/SSA portals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-md border">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-semibold">W-2 Forms</span>
                    <Badge variant="outline">{forms.w2sGenerated}/{forms.w2sExpected}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(employees.w2Count * fees.w2PerForm)} total ({employees.w2Count} × ${fees.w2PerForm.toFixed(2)})
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={forms.w2sGenerated === 0} data-testid="button-download-w2s">
                    <Download className="h-4 w-4 mr-1" />
                    Download All
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-md border">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-semibold">1099-NEC Forms</span>
                    <Badge variant="outline">{forms.form1099sGenerated}/{forms.form1099sExpected}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(employees.contractorsAbove600 * fees.form1099PerForm)} total ({employees.contractorsAbove600} × ${fees.form1099PerForm.toFixed(2)})
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={forms.form1099sGenerated === 0} data-testid="button-download-1099s">
                    <Download className="h-4 w-4 mr-1" />
                    Download All
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-md border">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Form 941 — Quarterly</span>
                    <Badge variant="outline">Free</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Included in payroll processing fee
                  </p>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      onClick={() => generate941.mutate({ quarter: q, year: data.taxYear })}
                      disabled={generate941.isPending}
                      data-testid={`button-generate-941-q${q}`}
                    >
                      {generate941.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      Q{q}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Filing tab */}
        <TabsContent value="filing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How to File</CardTitle>
              <CardDescription>
                We generate your forms — filing happens at the official government portals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(filingGuides).map(([key, guide]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-md border" data-testid={`filing-guide-${key}`}>
                  <div>
                    <p className="font-semibold">
                      {key === 'w2' ? 'W-2s' : key === 'form1099' ? '1099-NECs' : key === 'form941' ? 'Form 941' : key === 'texasTWC' ? 'Texas TWC' : key}
                    </p>
                    <p className="text-sm text-muted-foreground">File via {guide.label}</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={guide.url} target="_blank" rel="noopener noreferrer" data-testid={`link-portal-${key}`}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open
                    </a>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contractors tab */}
        <TabsContent value="contractors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1099 Contractor Scan — FY {data.taxYear}</CardTitle>
              <CardDescription>
                Contractors with $600+ in payroll require a 1099-NEC. This scan runs automatically on January 1.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employees.contractorDetails.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contractors found on your roster.
                </p>
              ) : (
                <div className="space-y-2">
                  {employees.contractorDetails.map((c) => (
                    <div
                      key={c.employeeId}
                      className="flex items-center justify-between p-3 rounded-md border"
                      data-testid={`contractor-${c.employeeId}`}
                    >
                      <div>
                        <p className="font-semibold">{c.name || '(Unnamed contractor)'}</p>
                        <p className="text-sm text-muted-foreground">
                          FY {data.taxYear} total: {formatCurrency(c.totalPaid)}
                        </p>
                      </div>
                      {c.requiresFiling ? (
                        <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          1099-NEC required
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Below threshold
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Legal disclaimer */}
      <Card className="border-muted-foreground/20">
        <CardContent className="pt-6 text-xs text-muted-foreground">
          <p>{disclaimer}</p>
        </CardContent>
      </Card>
    </div>
  );
}
