import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ModernLayout from "@/components/ModernLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FileText, ClipboardCheck, Clock, AlertCircle, CheckCircle2, XCircle, Play, Pause } from "lucide-react";
import type { ReportTemplate, ReportSubmission } from "@shared/schema";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("templates");
  const { toast } = useToast();

  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useQuery<ReportTemplate[]>({
    queryKey: ["/api/reports/templates"],
  });

  const { data: submissions = [], isLoading: submissionsLoading, error: submissionsError } = useQuery<ReportSubmission[]>({
    queryKey: ["/api/reports/submissions"],
  });

  const toggleActivation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/reports/templates/${templateId}/toggle`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle template");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/templates"] });
      toast({
        title: "Template Updated",
        description: "Template activation status has been changed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  const activeTemplates = templates.filter(t => t.isActive);
  const inactiveTemplates = templates.filter(t => !t.isActive);

  // Schema status values: 'draft', 'pending_review', 'approved', 'rejected', 'sent_to_customer'
  const pendingReports = submissions.filter(s => s.status === "pending_review" || s.status === "draft");
  const approvedReports = submissions.filter(s => s.status === "approved" || s.status === "sent_to_customer");
  const rejectedReports = submissions.filter(s => s.status === "rejected");

  const getStatusIcon = (status: string | null) => {
    if (!status) return <AlertCircle className="w-4 h-4" />;
    
    switch (status) {
      case "draft":
      case "pending_review":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "approved":
      case "sent_to_customer":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      draft: { variant: "outline", label: "Draft" },
      pending_review: { variant: "secondary", label: "Pending Review" },
      approved: { variant: "default", label: "Approved" },
      rejected: { variant: "destructive", label: "Rejected" },
      sent_to_customer: { variant: "default", label: "Sent to Customer" },
    };
    
    const config = variants[status] || { variant: "outline", label: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  return (
    <ModernLayout>
      <div className="p-4 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[hsl(var(--cad-text-primary))]">
              Report Management System
            </h1>
            <p className="text-sm text-[hsl(var(--cad-text-secondary))] mt-1">
              Create, review, and manage organizational reports
            </p>
          </div>
        </div>
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Templates</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active-templates">{activeTemplates.length}</div>
              <p className="text-xs text-muted-foreground">
                {inactiveTemplates.length} inactive
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500" data-testid="stat-pending-reports">{pendingReports.length}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="stat-approved-reports">{approvedReports.length}</div>
              <p className="text-xs text-muted-foreground">
                Ready for customers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-reports">{submissions.length}</div>
              <p className="text-xs text-muted-foreground">
                All time submissions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="templates" data-testid="tab-templates">
              Templates
            </TabsTrigger>
            <TabsTrigger value="submissions" data-testid="tab-submissions">
              Submissions ({submissions.length})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending Review ({pendingReports.length})
            </TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Report Templates</CardTitle>
                <CardDescription>
                  Activate or deactivate report templates for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start justify-between p-4 border rounded-md">
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="h-9 w-24" />
                      </div>
                    ))}
                  </div>
                ) : templatesError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading templates: {templatesError.message}
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-start justify-between p-4 border rounded-md hover-elevate"
                        data-testid={`template-${template.id}`}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium" data-testid={`template-name-${template.id}`}>
                              {template.name}
                            </h4>
                            {template.isActive ? (
                              <Badge variant="default" data-testid={`template-status-${template.id}`}>
                                <Play className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" data-testid={`template-status-${template.id}`}>
                                <Pause className="w-3 h-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                            {template.isSystemTemplate && (
                              <Badge variant="outline" className="text-xs">
                                System
                              </Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">
                              {template.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {template.category && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {template.category.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant={template.isActive ? "outline" : "default"}
                          size="sm"
                          disabled={toggleActivation.isPending}
                          onClick={() => toggleActivation.mutate(template.id)}
                          data-testid={`button-toggle-${template.id}`}
                        >
                          {toggleActivation.isPending ? "..." : template.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Submissions Tab */}
          <TabsContent value="submissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Report Submissions</CardTitle>
                <CardDescription>
                  View all reports submitted by employees
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissionsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : submissionsError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading submissions: {submissionsError.message}
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No submissions yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((submission) => (
                      <div
                        key={submission.id}
                        className="flex items-start justify-between p-4 border rounded-md hover-elevate"
                        data-testid={`submission-${submission.id}`}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(submission.status)}
                            <h4 className="font-medium" data-testid={`submission-number-${submission.id}`}>
                              {submission.reportNumber}
                            </h4>
                            {getStatusBadge(submission.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Submitted {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString() : 'N/A'}
                          </p>
                          {submission.reviewedAt && (
                            <p className="text-xs text-muted-foreground">
                              Reviewed {new Date(submission.reviewedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" data-testid={`button-view-${submission.id}`}>
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Review</CardTitle>
                <CardDescription>
                  Reports awaiting supervisor approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissionsLoading ? (
                  <div className="space-y-3">
                    {[1].map((i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : submissionsError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading pending reports: {submissionsError.message}
                  </div>
                ) : pendingReports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending reports
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingReports.map((submission) => (
                      <div
                        key={submission.id}
                        className="flex items-start justify-between p-4 border rounded-md hover-elevate"
                        data-testid={`pending-${submission.id}`}
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-yellow-500" />
                            <h4 className="font-medium">{submission.reportNumber}</h4>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Submitted {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            data-testid={`button-reject-${submission.id}`}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            data-testid={`button-approve-${submission.id}`}
                          >
                            Approve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ModernLayout>
  );
}
