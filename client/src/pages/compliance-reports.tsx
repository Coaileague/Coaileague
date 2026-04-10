import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { 
  FileText, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Shield,
  Scale,
  Users,
  CalendarDays,
  FileCheck,
  DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ReportType {
  id: string;
  name: string;
  description: string;
  regulations: string[];
  category: string;
}

interface ComplianceReport {
  id: string;
  workspaceId: number;
  reportType: string;
  reportName: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  hasViolations: boolean;
  violationCount: number;
  criticalViolationCount: number;
  potentialFinesUsd: number | null;
  regulations: string[];
  generatedAt: string;
  generatedBy: string;
  automated: boolean;
  reportData: any;
  exportFormats: string[];
  retentionYears: number;
}

const categoryIcons: Record<string, typeof Shield> = {
  labor: Scale,
  audit: FileCheck,
  hr: Users,
};

export default function ComplianceReportsPage() {
  const [selectedType, setSelectedType] = useState<string>("");
  const [activeTab, setActiveTab] = useState("generate");

  const { data: reportTypes, isLoading: typesLoading } = useQuery<{ reportTypes: ReportType[] }>({
    queryKey: ['/api/compliance-reports/types'],
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ reports: ComplianceReport[]; total: number }>({
    queryKey: ['/api/compliance-reports/list'],
  });

  const generateMutation = useMutation({
    mutationFn: async (reportType: string) => {
      const res = await apiRequest('POST', '/api/compliance-reports/generate', { reportType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance-reports/list'] });
    },
    onError: (error: Error) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      toast({
        title: 'Generate Report Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-500/10 text-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getViolationBadge = (report: ComplianceReport) => {
    if (!report.hasViolations) {
      return <Badge variant="secondary" className="bg-green-500/10 text-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />No Violations</Badge>;
    }
    if (report.criticalViolationCount > 0) {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />{report.criticalViolationCount} Critical</Badge>;
    }
    return <Badge variant="outline" className="border-orange-500 text-orange-600">{report.violationCount} Violations</Badge>;
  };

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || Shield;
    return <Icon className="w-5 h-5" />;
  };

  const pageConfig: CanvasPageConfig = {
    id: 'compliance-reports',
    title: 'Compliance Reports',
    subtitle: 'Generate and manage regulatory compliance reports with full audit trails',
    category: 'operations',
  };

  if (typesLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="generate" data-testid="tab-generate">
            <FileText className="w-4 h-4 mr-2" />
            Generate Report
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <CalendarDays className="w-4 h-4 mr-2" />
            Report History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Available Report Types</CardTitle>
              <CardDescription>
                Select a report type to generate. Reports include regulatory references and violation tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {reportTypes?.reportTypes?.map((type) => (
                  <Card 
                    key={type.id} 
                    className={`cursor-pointer transition-all ${selectedType === type.id ? 'ring-2 ring-primary bg-muted/50' : ''}`}
                    onClick={() => setSelectedType(type.id)}
                    data-testid={`card-report-type-${type.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(type.category)}
                        <CardTitle className="text-sm font-medium">{type.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-2">{type.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {type.regulations.slice(0, 2).map((reg, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{reg}</Badge>
                        ))}
                        {type.regulations.length > 2 && (
                          <Badge variant="secondary" className="text-xs">+{type.regulations.length - 2}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedType && (
                <div className="mt-6 flex items-center gap-4">
                  <Button 
                    onClick={() => generateMutation.mutate(selectedType)}
                    disabled={generateMutation.isPending}
                    data-testid="button-generate-report"
                  >
                    {generateMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Report
                      </>
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Selected: {reportTypes?.reportTypes?.find(t => t.id === selectedType)?.name}
                  </span>
                </div>
              )}

              {generateMutation.isSuccess && (
                <Alert className="mt-4 border-green-500/50 bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-600">
                    Report generated successfully! View it in the Report History tab.
                  </AlertDescription>
                </Alert>
              )}

              {generateMutation.isError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to generate report. Please try again.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Automated Compliance Monitoring
              </CardTitle>
              <CardDescription>
                Trinity AI continuously monitors your workforce data for compliance issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Labor Law</span>
                  </div>
                  <p className="text-xs text-muted-foreground">FLSA overtime, shift turnaround, fatigue prevention</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Break Compliance</span>
                  </div>
                  <p className="text-xs text-muted-foreground">50-state meal and rest break law enforcement</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Certifications</span>
                  </div>
                  <p className="text-xs text-muted-foreground">License expiry alerts and renewal tracking</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>
                All compliance reports with 7-year retention for regulatory audits
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : reportsData?.reports?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No reports generated yet</p>
                  <p className="text-sm">Generate your first compliance report to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reportsData?.reports?.map((report) => (
                    <Card key={report.id} data-testid={`card-report-${report.id}`}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{report.reportName}</h3>
                              {getStatusBadge(report.status)}
                              {getViolationBadge(report)}
                              {report.automated && (
                                <Badge variant="secondary" className="text-xs">Auto</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {format(new Date(report.generatedAt), "MMM dd, yyyy HH:mm")}
                              </span>
                              {report.periodStart && report.periodEnd && (
                                <span>
                                  Period: {format(new Date(report.periodStart), "MMM dd")} - {format(new Date(report.periodEnd), "MMM dd, yyyy")}
                                </span>
                              )}
                              {report.potentialFinesUsd && report.potentialFinesUsd > 0 && (
                                <span className="text-red-600 font-medium flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  Risk: ${report.potentialFinesUsd.toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {report.regulations.slice(0, 3).map((reg, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{reg}</Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`button-download-${report.id}`}
                              onClick={() => window.open(`/api/compliance-reports/${report.id}/pdf`, '_blank')}
                              title="Download compliance report"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
