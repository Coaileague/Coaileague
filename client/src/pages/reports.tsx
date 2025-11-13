import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, ClipboardCheck, Clock, AlertCircle, CheckCircle2, XCircle, Play, Pause, Plus, AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import { exportReport } from "@/lib/exportUtils";
import type { ReportTemplate, ReportSubmission } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ResponsiveLoading, LoadingCard } from "@/components/responsive-loading";

const disputeSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200, "Title too long"),
  reason: z.string().min(20, "Reason must be at least 20 characters").max(5000, "Reason too long"),
  requestedOutcome: z.string().max(1000, "Requested outcome too long").optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
});

type DisputeFormData = z.infer<typeof disputeSchema>;

interface TemplateField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
}

interface ReportSubmissionFormProps {
  template: ReportTemplate;
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ReportSubmissionForm({ template, onSubmit, onCancel, isSubmitting }: ReportSubmissionFormProps) {
  const fields = (template.fields as TemplateField[]) || [];
  const hasFileFields = fields.some(f => f.type === "file");
  
  const formSchema = z.object(
    fields.reduce((acc, field) => {
      let validator: any;
      
      if (field.type === "number") {
        if (field.required) {
          validator = z.string()
            .min(1, `${field.label} is required`)
            .refine((val) => !isNaN(Number(val)), {
              message: `${field.label} must be a valid number`,
            })
            .transform((val) => Number(val));
        } else {
          validator = z.string()
            .optional()
            .transform((val) => val && val.trim() !== "" ? Number(val) : undefined)
            .refine((val) => val === undefined || !isNaN(val as number), {
              message: `${field.label} must be a valid number`,
            });
        }
      } else if (field.type === "file") {
        validator = z.any().optional();
      } else {
        validator = z.string();
        if (field.required) {
          validator = validator.min(1, `${field.label} is required`);
        } else {
          validator = validator.optional();
        }
      }
      
      acc[field.name] = validator;
      return acc;
    }, {} as Record<string, any>)
  );

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: fields.reduce((acc, field) => {
      acc[field.name] = "";
      return acc;
    }, {} as Record<string, any>),
  });

  const handleSubmit = (data: Record<string, any>) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {hasFileFields && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-sm text-yellow-600 dark:text-yellow-500">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Note: File upload fields are displayed but attachments must be added separately after submission.
          </div>
        )}
        {fields.map((field) => (
          <FormField
            key={field.name}
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  {field.type === "textarea" ? (
                    <Textarea
                      {...formField}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      data-testid={`input-${field.name}`}
                    />
                  ) : field.type === "select" && field.options ? (
                    <Select 
                      onValueChange={formField.onChange} 
                      value={formField.value || undefined}
                      defaultValue={formField.value || undefined}
                    >
                      <SelectTrigger data-testid={`select-${field.name}`}>
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "number" ? (
                    <Input
                      {...formField}
                      type="number"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      data-testid={`input-${field.name}`}
                    />
                  ) : field.type === "date" ? (
                    <Input
                      {...formField}
                      type="date"
                      data-testid={`input-${field.name}`}
                    />
                  ) : field.type === "file" ? (
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files) {
                          formField.onChange(Array.from(files));
                        }
                      }}
                      data-testid={`input-${field.name}`}
                    />
                  ) : (
                    <Input
                      {...formField}
                      type="text"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      data-testid={`input-${field.name}`}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        
        <div className="flex gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="button-cancel-report"
          >
            Back
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit-report"
            className="flex-1"
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("templates");
  const [isNewReportOpen, setIsNewReportOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<ReportSubmission | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<ReportSubmission | null>(null);
  const { toast} = useToast();

  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useQuery<ReportTemplate[]>({
    queryKey: ["/api/report-templates"],
  });

  const { data: submissions = [], isLoading: submissionsLoading, error: submissionsError } = useQuery<ReportSubmission[]>({
    queryKey: ["/api/report-submissions"],
  });

  const toggleActivation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/report-templates/${templateId}/toggle`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle template");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-templates"] });
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

  const submitReport = useMutation({
    mutationFn: async (data: { templateId: string; formData: Record<string, any> }) => {
      const res = await fetch("/api/report-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit report");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-submissions"] });
      toast({
        title: "Report Submitted",
        description: "Your report has been submitted for review",
      });
      setIsNewReportOpen(false);
      setSelectedTemplate(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit report",
        variant: "destructive",
      });
    },
  });

  const reviewReport = useMutation({
    mutationFn: async (data: { submissionId: string; approved: boolean; reviewNotes: string }) => {
      const res = await fetch(`/api/report-submissions/${data.submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ approved: data.approved, reviewNotes: data.reviewNotes }),
      });
      if (!res.ok) throw new Error("Failed to review report");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-submissions"] });
      toast({
        title: variables.approved ? "Report Approved" : "Report Rejected",
        description: `Report has been ${variables.approved ? "approved" : "rejected"}`,
      });
      setReviewSubmission(null);
      setReviewNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review report",
        variant: "destructive",
      });
    },
  });

  const sendToClient = useMutation({
    mutationFn: async (submissionId: string) => {
      const res = await fetch(`/api/report-submissions/${submissionId}/send-to-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send report to client");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-submissions"] });
      toast({
        title: "Report Sent to Client",
        description: `Report ${data.submission.reportNumber} has been emailed to the client`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send report to client",
        variant: "destructive",
      });
    },
  });

  // Dispute filing mutation
  const fileDisputeMutation = useMutation({
    mutationFn: async (data: DisputeFormData) => {
      if (!selectedSubmission) throw new Error("No submission selected");
      return apiRequest('POST', '/api/disputes', {
        ...data,
        disputeType: 'report_write_up',
        targetType: 'report_submissions',
        targetId: selectedSubmission.id.toString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      setDisputeDialogOpen(false);
      disputeForm.reset();
      setSelectedSubmission(null);
      toast({
        title: "Success",
        description: "Dispute filed successfully. Support will review your case.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disputeForm = useForm<DisputeFormData>({
    resolver: zodResolver(disputeSchema),
    defaultValues: {
      title: "",
      reason: "",
      requestedOutcome: "",
      priority: "normal",
    },
  });

  const onDisputeSubmit = (data: DisputeFormData) => {
    fileDisputeMutation.mutate(data);
  };

  const handleOpenDisputeDialog = (submission: ReportSubmission) => {
    setSelectedSubmission(submission);
    disputeForm.setValue('title', `Dispute: Report ${submission.reportNumber}`);
    setDisputeDialogOpen(true);
  };

  const handleExport = (format: 'csv' | 'pdf') => {
    if (submissions.length === 0) {
      toast({
        title: "No data available",
        description: "Cannot export - no report submissions found",
        variant: "destructive",
      });
      return;
    }

    const exportData = submissions.map(sub => ({
      reportNumber: sub.reportNumber || 'N/A',
      template: templates.find(t => t.id === sub.templateId)?.name || 'Unknown',
      status: sub.status || 'Unknown',
      submittedBy: sub.submittedBy || 'System',
      submittedAt: sub.submittedAt ? format(new Date(sub.submittedAt), 'yyyy-MM-dd HH:mm') : 'N/A',
      reviewedBy: sub.reviewedBy || '-',
      reviewedAt: sub.reviewedAt ? format(new Date(sub.reviewedAt), 'yyyy-MM-dd HH:mm') : '-',
    }));

    exportReport(format, 'Report Submissions', exportData, {
      columns: ['reportNumber', 'template', 'status', 'submittedBy', 'submittedAt', 'reviewedBy', 'reviewedAt'],
      columnLabels: {
        reportNumber: 'Report #',
        template: 'Template',
        status: 'Status',
        submittedBy: 'Submitted By',
        submittedAt: 'Submitted At',
        reviewedBy: 'Reviewed By',
        reviewedAt: 'Reviewed At',
      },
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
        description: "Your report submissions are downloading",
      });
    }
  };

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
        return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
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

  // Show loading state
  if (templatesLoading || submissionsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <ResponsiveLoading message="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto mobile-scroll safe-bottom">
      <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-3 sm:space-y-4 md:space-y-6">
        {/* Mobile-optimized Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 safe-top">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[hsl(var(--cad-text-primary))] truncate">
              Report Management System
            </h1>
            <p className="text-xs sm:text-sm text-[hsl(var(--cad-text-secondary))] mt-0.5">
              Create, review, and manage organizational reports
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              data-testid="button-export-csv"
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              data-testid="button-export-pdf"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Dialog open={isNewReportOpen} onOpenChange={setIsNewReportOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto touch-target" data-testid="button-new-report">
                <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">New Report</span>
              </Button>
            </DialogTrigger>
            {/* Mobile: Full-screen dialog, Desktop: Standard modal */}
            <DialogContent className="w-full h-full sm:h-auto sm:w-auto sm:max-w-2xl p-0 sm:p-6 overflow-hidden bottom-sheet-enter">
              <div className="h-full overflow-y-auto mobile-scroll p-4 sm:p-0">
              <DialogHeader>
                <DialogTitle>Create New Report</DialogTitle>
                <DialogDescription>
                  {selectedTemplate ? `Complete the ${selectedTemplate.name}` : "Select a template to get started"}
                </DialogDescription>
              </DialogHeader>
              {!selectedTemplate ? (
                <div className="space-y-3">
                  {activeTemplates.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No active templates available. Please contact your administrator.
                    </p>
                  ) : (
                    activeTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className="w-full p-4 border rounded-md hover-elevate active-elevate-2 text-left"
                        data-testid={`button-select-template-${template.id}`}
                      >
                        <h3 className="font-semibold">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                        {template.category && (
                          <Badge variant="outline" className="text-xs capitalize mt-2">
                            {template.category.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <ReportSubmissionForm 
                  template={selectedTemplate} 
                  onSubmit={(formData) => {
                    submitReport.mutate({
                      templateId: selectedTemplate.id,
                      formData,
                    });
                  }}
                  onCancel={() => setSelectedTemplate(null)}
                  isSubmitting={submitReport.isPending}
                />
              )}
              </div>
            </DialogContent>
            </Dialog>
          </div>
        </div>
        {/* Mobile-optimized Header Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <Card className="mobile-card-enter">
            <CardHeader className="flex flex-row items-center justify-between gap-1 sm:gap-2 space-y-0 pb-1.5 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium truncate">Active Templates</CardTitle>
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold" data-testid="stat-active-templates">{activeTemplates.length}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {inactiveTemplates.length} inactive
              </p>
            </CardContent>
          </Card>

          <Card className="mobile-card-enter">
            <CardHeader className="flex flex-row items-center justify-between gap-1 sm:gap-2 space-y-0 pb-1.5 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium truncate">Pending Review</CardTitle>
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
            </CardHeader>
            <CardContent className="pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-yellow-500" data-testid="stat-pending-reports">{pendingReports.length}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card className="mobile-card-enter">
            <CardHeader className="flex flex-row items-center justify-between gap-1 sm:gap-2 space-y-0 pb-1.5 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium truncate">Approved</CardTitle>
              <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
            </CardHeader>
            <CardContent className="pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-blue-500" data-testid="stat-approved-reports">{approvedReports.length}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Ready for customers
              </p>
            </CardContent>
          </Card>

          <Card className="mobile-card-enter">
            <CardHeader className="flex flex-row items-center justify-between gap-1 sm:gap-2 space-y-0 pb-1.5 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium truncate">Total Reports</CardTitle>
              <ClipboardCheck className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold" data-testid="stat-total-reports">{submissions.length}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
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
                        <div className="flex gap-2">
                          {submission.status === 'approved' && (
                            <Button 
                              variant="default" 
                              size="sm" 
                              onClick={() => sendToClient.mutate(submission.id)}
                              disabled={sendToClient.isPending}
                              data-testid={`button-send-to-client-${submission.id}`}
                            >
                              {sendToClient.isPending ? "Sending..." : "Send to Client"}
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenDisputeDialog(submission)}
                            data-testid={`button-dispute-${submission.id}`}
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Dispute
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-view-${submission.id}`}>
                            View Details
                          </Button>
                        </div>
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
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewSubmission(submission)}
                            data-testid={`button-review-${submission.id}`}
                          >
                            Review
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

        {/* Review Dialog */}
        <Dialog open={!!reviewSubmission} onOpenChange={(open) => {
          if (!open) {
            setReviewSubmission(null);
            setReviewNotes("");
          }
        }}>
          <DialogContent className="w-full h-full sm:h-auto sm:w-auto sm:max-w-2xl p-0 sm:p-6">
            <div className="h-full overflow-y-auto p-4 sm:p-0">
            <DialogHeader>
              <DialogTitle>Review Report</DialogTitle>
              <DialogDescription>
                Review and approve or reject this report submission
              </DialogDescription>
            </DialogHeader>
            {reviewSubmission && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-md">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Report Number:</span> {reviewSubmission.reportNumber}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span> {getStatusBadge(reviewSubmission.status)}
                    </div>
                    <div>
                      <span className="font-medium">Submitted:</span> {reviewSubmission.submittedAt ? new Date(reviewSubmission.submittedAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Report Data:</h4>
                  <div className="p-4 bg-muted rounded-md space-y-2">
                    {Object.entries(reviewSubmission.formData as Record<string, any> || {}).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                        <span className="text-muted-foreground">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Review Notes {reviewNotes.trim() && <span className="text-muted-foreground">(Optional)</span>}
                  </label>
                  <Textarea
                    placeholder="Enter any notes about this review..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={4}
                    data-testid="input-review-notes"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReviewSubmission(null);
                      setReviewNotes("");
                    }}
                    disabled={reviewReport.isPending}
                    data-testid="button-cancel-review"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      reviewReport.mutate({
                        submissionId: reviewSubmission.id,
                        approved: false,
                        reviewNotes: reviewNotes.trim() || "Rejected",
                      });
                    }}
                    disabled={reviewReport.isPending}
                    data-testid="button-reject-confirm"
                    className="flex-1"
                  >
                    {reviewReport.isPending ? "Processing..." : "Reject Report"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      reviewReport.mutate({
                        submissionId: reviewSubmission.id,
                        approved: true,
                        reviewNotes: reviewNotes.trim() || "Approved",
                      });
                    }}
                    disabled={reviewReport.isPending}
                    data-testid="button-approve-confirm"
                    className="flex-1"
                  >
                    {reviewReport.isPending ? "Processing..." : "Approve Report"}
                  </Button>
                </div>
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dispute Filing Dialog */}
        <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
          <DialogContent className="w-full h-full sm:h-auto sm:w-auto sm:max-w-2xl p-0 sm:p-6">
            <div className="h-full overflow-y-auto p-4 sm:p-0">
            <DialogHeader>
              <DialogTitle>File Dispute - Report Submission</DialogTitle>
              <DialogDescription>
                Explain why you believe this write-up/report is inaccurate or unfair. Support will investigate and respond.
              </DialogDescription>
            </DialogHeader>
            <Form {...disputeForm}>
              <form onSubmit={disputeForm.handleSubmit(onDisputeSubmit)} className="space-y-4">
                {selectedSubmission && (
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium">Disputing report: {selectedSubmission.reportNumber}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted: {selectedSubmission.submittedAt ? format(new Date(selectedSubmission.submittedAt), 'MMM d, yyyy') : 'N/A'}
                      {' '} • Status: {selectedSubmission.status}
                    </p>
                  </div>
                )}

                <FormField
                  control={disputeForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dispute Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Brief summary of your dispute" data-testid="input-dispute-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={disputeForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Detailed Reason (minimum 20 characters)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          rows={6} 
                          placeholder="Explain in detail why this write-up/report is inaccurate or unfair. Include specific examples and data if available."
                          data-testid="input-dispute-reason"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={disputeForm.control}
                  name="requestedOutcome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requested Outcome (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          rows={3} 
                          placeholder="What resolution would you like? (e.g., 'Remove this write-up from my record', 'Correct the facts')"
                          data-testid="input-dispute-outcome"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={disputeForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-dispute-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setDisputeDialogOpen(false);
                    setSelectedSubmission(null);
                    disputeForm.reset();
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={fileDisputeMutation.isPending} data-testid="button-submit-dispute">
                    {fileDisputeMutation.isPending ? "Filing..." : "File Dispute"}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
