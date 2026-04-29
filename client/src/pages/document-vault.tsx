import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Eye,
  FileText,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderOpen,
  Tag,
  Calendar,
  Link as LinkIcon,
  Upload,
  Download,
  ClipboardList,
  Camera,
  CheckCheck,
  Clock,
  Send,
  FileDown,
  Sparkles,
} from 'lucide-react';;
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalFooter,
  UniversalModalContent,
} from "@/components/ui/universal-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface DocumentVaultItem {
  id: string;
  workspaceId: string;
  documentInstanceId: string | null;
  title: string;
  category: string | null;
  fileUrl: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  tags: string[];
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  uploadedBy: string | null;
  isSigned: boolean;
  retentionUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ShiftReport {
  id: string;
  workspace_id: string;
  shift_id: string | null;
  chatroom_id: string | null;
  title: string | null;
  summary: string | null;
  employee_id: string | null;
  employee_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  status: string;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  trinity_articulated: boolean;
  photo_count: number | null;
  photo_manifest: any[] | null;
  verified_by: string | null;
  verified_at: string | null;
  sent_to_client: boolean;
  created_at: string;
  updated_at: string;
}

interface VaultStats {
  totalDocuments: number;
  signedDocuments: number;
  byCategory: Record<string, number>;
}

interface VaultListResponse {
  items: DocumentVaultItem[];
  total: number;
  limit: number;
  offset: number;
}

interface ShiftReportsResponse {
  reports: ShiftReport[];
}

const CATEGORIES = [
  "employment",
  "onboarding",
  "compliance",
  "policy",
  "contract",
  "incident",
  "training",
  "certificate",
  "legal",
  "financial",
  "shifts",
  "meetings",
  "other",
];

const CATEGORY_COLORS: Record<string, string> = {
  employment: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  onboarding: "bg-green-500/15 text-green-600 dark:text-green-400",
  compliance: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  policy: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  contract: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  incident: "bg-red-500/15 text-red-600 dark:text-red-400",
  training: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  certificate: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  legal: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  financial: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  shifts: "bg-gold-500/15 text-yellow-600 dark:text-yellow-400",
  meetings: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  other: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const REPORT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400", icon: Clock },
  pending_review: { label: "Pending Review", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  verified: { label: "Verified", color: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CheckCheck },
  sent_to_client: { label: "Sent to Client", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Send },
};

const PAGE_SIZE = 20;

const pageConfig: CanvasPageConfig = {
  id: "document-vault",
  title: "Document Vault",
  subtitle: "Securely store, manage, and archive shift reports with photos and PDFs",
  category: "operations",
};

export default function DocumentVault() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("documents");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<DocumentVaultItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("all");

  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formRelatedEntityType, setFormRelatedEntityType] = useState("");
  const [formRelatedEntityId, setFormRelatedEntityId] = useState("");
  const [formSourceTemplateId, setFormSourceTemplateId] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formIsSigned, setFormIsSigned] = useState(false);

  const offset = page * PAGE_SIZE;

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<VaultStats>({
    queryKey: ["/api/document-vault", "stats"],
  });

  const { data: listData, isLoading: listLoading, isError: listError, refetch } = useQuery<VaultListResponse>({
    queryKey: ["/api/document-vault", { search: searchTerm || undefined, category: categoryFilter === "all" ? undefined : categoryFilter, limit: PAGE_SIZE, offset }],
  });

  const { data: shiftReportsData, isLoading: reportsLoading, isError: reportsError, refetch: refetchReports } = useQuery<ShiftReportsResponse>({
    queryKey: ["/api/rms/shift-reports", { status: reportStatusFilter === "all" ? undefined : reportStatusFilter, limit: 100, offset: 0 }],
    enabled: activeTab === "shift-reports",
  });

  const generatePdfMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("POST", `/api/rms/shift-reports/${reportId}/generate-pdf`, {});
      return res.json();
    },
    onSuccess: (data, reportId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rms/shift-reports"] });
      toast({ title: "PDF Generated", description: "Shift report PDF has been generated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate PDF. Please try again.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/document-vault", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-vault"] });
      setUploadOpen(false);
      resetForm();
      toast({ title: "Document Uploaded", description: "Document has been added to the vault." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to upload document", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/document-vault/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-vault"] });
      setDetailDoc(null);
      toast({ title: "Document Deleted", description: "Document has been removed from the vault." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete document", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormTitle("");
    setFormCategory("");
    setFormFileUrl("");
    setFormRelatedEntityType("");
    setFormRelatedEntityId("");
    setFormSourceTemplateId("");
    setFormTags("");
    setFormIsSigned(false);
  };

  const handleCreate = () => {
    if (!formTitle.trim() || !formFileUrl.trim()) {
      toast({ title: "Validation Error", description: "Title and File URL are required.", variant: "destructive" });
      return;
    }
    const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
    createMutation.mutate({
      title: formTitle.trim(),
      category: formCategory || null,
      fileUrl: formFileUrl.trim(),
      relatedEntityType: formRelatedEntityType || null,
      relatedEntityId: formRelatedEntityId || null,
      documentInstanceId: formSourceTemplateId || null,
      tags,
      isSigned: formIsSigned,
    });
  };

  const items = listData?.items || [];
  const total = listData?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const unsignedCount = (stats?.totalDocuments || 0) - (stats?.signedDocuments || 0);

  const allReports = shiftReportsData?.reports || [];
  const filteredReports = reportStatusFilter === "all"
    ? allReports
    : allReports.filter(r => r.status === reportStatusFilter);
  const reportsWithPdf = allReports.filter(r => !!r.pdf_url).length;
  const trinityArticulated = allReports.filter(r => r.trinity_articulated).length;

  const headerActions = (
    <Button onClick={() => setUploadOpen(true)} data-testid="button-upload-document">
      <Plus className="w-4 h-4 mr-2" />
      Upload Document
    </Button>
  );

  return (
    <CanvasHubPage config={{ ...pageConfig, headerActions }}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Docs</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-total-docs">
              {statsError ? "—" : statsLoading ? "..." : stats?.totalDocuments ?? 0}
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Signed</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-signed-docs">
              {statsError ? "—" : statsLoading ? "..." : stats?.signedDocuments ?? 0}
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Shift Reports</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-shift-reports">
              {allReports.length > 0 ? allReports.length : "—"}
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-500" />
              <span className="text-sm text-muted-foreground">Trinity Enhanced</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-trinity-enhanced">
              {trinityArticulated > 0 ? trinityArticulated : "—"}
            </p>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-vault">
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="w-4 h-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="shift-reports" data-testid="tab-shift-reports">
              <ClipboardList className="w-4 h-4 mr-2" />
              Shift Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents by title..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  className="pl-9"
                  data-testid="input-search-documents"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                <Button
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setCategoryFilter("all"); setPage(0); }}
                  data-testid="filter-category-all"
                >
                  All
                </Button>
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setCategoryFilter(cat); setPage(0); }}
                    data-testid={`filter-category-${cat}`}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {listError ? (
              <Card className="p-12 text-center" data-testid="document-list-error">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
                <p className="text-muted-foreground mb-3">Failed to load documents.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry">
                  Retry
                </Button>
              </Card>
            ) : listLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-40 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground" data-testid="text-no-documents">No documents found</p>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((doc) => (
                    <Card
                      key={doc.id}
                      className="p-4 cursor-pointer hover-elevate transition-colors"
                      onClick={() => setDetailDoc(doc)}
                      data-testid={`card-document-${doc.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {doc.category && (
                              <Badge
                                variant="outline"
                                className={CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}
                                data-testid={`badge-category-${doc.id}`}
                              >
                                {doc.category}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={doc.isSigned ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-slate-500/15 text-slate-600 dark:text-slate-400"}
                              data-testid={`badge-signed-${doc.id}`}
                            >
                              {doc.isSigned ? "Signed" : "Unsigned"}
                            </Badge>
                          </div>
                        </div>
                        <Eye className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : "N/A"}
                        </div>
                        {doc.relatedEntityType && (
                          <div className="flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" />
                            {doc.relatedEntityType}{doc.relatedEntityId ? ` #${doc.relatedEntityId}` : ""}
                          </div>
                        )}
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {doc.tags.slice(0, 3).join(", ")}{doc.tags.length > 3 ? ` +${doc.tags.length - 3}` : ""}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="shift-reports" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileDown className="w-4 h-4 text-blue-500" />
                  <span data-testid="stat-reports-with-pdf">{reportsWithPdf} PDF{reportsWithPdf !== 1 ? "s" : ""} ready</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-teal-500" />
                  <span data-testid="stat-trinity-reports">{trinityArticulated} Trinity-enhanced</span>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {["all", "draft", "pending_review", "verified", "sent_to_client"].map((s) => (
                  <Button
                    key={s}
                    variant={reportStatusFilter === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReportStatusFilter(s)}
                    data-testid={`filter-report-status-${s}`}
                  >
                    {s === "all" ? "All" : (REPORT_STATUS_CONFIG[s]?.label || s)}
                  </Button>
                ))}
              </div>
            </div>

            {reportsError ? (
              <Card className="p-12 text-center" data-testid="reports-list-error">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
                <p className="text-muted-foreground mb-3">Failed to load shift reports.</p>
                <Button variant="outline" size="sm" onClick={() => refetchReports()} data-testid="button-retry-reports">
                  Retry
                </Button>
              </Card>
            ) : reportsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : filteredReports.length === 0 ? (
              <Card className="p-12 text-center">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground" data-testid="text-no-reports">No shift reports found</p>
                <p className="text-sm text-muted-foreground mt-1">Shift reports appear here when employees submit Daily Activity Reports</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredReports.map((report) => {
                  const statusCfg = REPORT_STATUS_CONFIG[report.status] || { label: report.status, color: "bg-slate-500/15 text-slate-600", icon: Clock };
                  const StatusIcon = statusCfg.icon;
                  return (
                    <Card
                      key={report.id}
                      className="p-4 hover-elevate cursor-pointer"
                      onClick={() => setSelectedReport(report)}
                      data-testid={`card-shift-report-${report.id}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="shrink-0">
                            <ClipboardList className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate" data-testid={`text-report-title-${report.id}`}>
                                {report.title || report.employee_name || "Shift Report"}
                              </p>
                              {report.trinity_articulated && (
                                <Badge variant="outline" className="bg-teal-500/15 text-teal-600 dark:text-teal-400 shrink-0" data-testid={`badge-trinity-${report.id}`}>
                                  <Sparkles className="w-3 h-3 mr-1" />
                                  Trinity
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {report.employee_name && (
                                <span data-testid={`text-report-employee-${report.id}`}>{report.employee_name}</span>
                              )}
                              {report.shift_start_time && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(report.shift_start_time), "MMM d, yyyy")}
                                </span>
                              )}
                              {report.photo_count != null && report.photo_count > 0 && (
                                <span className="flex items-center gap-1">
                                  <Camera className="w-3 h-3" />
                                  {report.photo_count} photo{report.photo_count !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <Badge variant="outline" className={statusCfg.color} data-testid={`badge-report-status-${report.id}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusCfg.label}
                          </Badge>
                          {report.pdf_url ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); window.open(`/api/rms/shift-reports/${report.id}/download-pdf`, '_blank'); }}
                              data-testid={`button-download-pdf-${report.id}`}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              PDF
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); generatePdfMutation.mutate(report.id); }}
                              disabled={generatePdfMutation.isPending}
                              data-testid={`button-generate-pdf-${report.id}`}
                            >
                              <FileDown className="w-3 h-3 mr-1" />
                              Generate PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <UniversalModal open={!!detailDoc} onOpenChange={(open) => { if (!open) setDetailDoc(null); }}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-detail-modal-title">{detailDoc?.title}</UniversalModalTitle>
          </UniversalModalHeader>
          {detailDoc && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                {detailDoc.category && (
                  <Badge variant="outline" className={CATEGORY_COLORS[detailDoc.category] || CATEGORY_COLORS.other} data-testid="badge-detail-category">
                    {detailDoc.category}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={detailDoc.isSigned ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-slate-500/15 text-slate-600 dark:text-slate-400"}
                  data-testid="badge-detail-signed"
                >
                  {detailDoc.isSigned ? "Signed" : "Unsigned"}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">File URL</span>
                  <a href={detailDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary truncate max-w-[200px]" data-testid="link-detail-file-url">
                    {detailDoc.fileUrl}
                  </a>
                </div>
                {detailDoc.mimeType && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Type</span>
                    <span data-testid="text-detail-mime">{detailDoc.mimeType}</span>
                  </div>
                )}
                {detailDoc.fileSizeBytes && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Size</span>
                    <span data-testid="text-detail-size">{(detailDoc.fileSizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                )}
                {detailDoc.relatedEntityType && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Related Entity</span>
                    <span data-testid="text-detail-entity">{detailDoc.relatedEntityType}{detailDoc.relatedEntityId ? ` #${detailDoc.relatedEntityId}` : ""}</span>
                  </div>
                )}
                {detailDoc.documentInstanceId && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Template Instance</span>
                    <span data-testid="text-detail-instance">{detailDoc.documentInstanceId}</span>
                  </div>
                )}
                {detailDoc.uploadedBy && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Uploaded By</span>
                    <span data-testid="text-detail-uploaded-by">{detailDoc.uploadedBy}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Created</span>
                  <span data-testid="text-detail-created">{detailDoc.createdAt ? format(new Date(detailDoc.createdAt), "MMM d, yyyy h:mm a") : "N/A"}</span>
                </div>
                {detailDoc.updatedAt && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Updated</span>
                    <span data-testid="text-detail-updated">{format(new Date(detailDoc.updatedAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
                {detailDoc.retentionUntil && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Retention Until</span>
                    <span data-testid="text-detail-retention">{format(new Date(detailDoc.retentionUntil), "MMM d, yyyy")}</span>
                  </div>
                )}
                {detailDoc.tags && detailDoc.tags.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Tags</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {detailDoc.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs" data-testid={`badge-detail-tag-${idx}`}>{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <UniversalModalFooter>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => { if (detailDoc) deleteMutation.mutate(detailDoc.id); }}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-document"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setDetailDoc(null)} data-testid="button-close-detail">
              Close
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!selectedReport} onOpenChange={(open) => { if (!open) setSelectedReport(null); }}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-report-modal-title">
              {selectedReport?.title || selectedReport?.employee_name || "Shift Report"}
            </UniversalModalTitle>
          </UniversalModalHeader>
          {selectedReport && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={(REPORT_STATUS_CONFIG[selectedReport.status]?.color) || "bg-slate-500/15 text-slate-600"} data-testid="badge-report-detail-status">
                  {REPORT_STATUS_CONFIG[selectedReport.status]?.label || selectedReport.status}
                </Badge>
                {selectedReport.trinity_articulated && (
                  <Badge variant="outline" className="bg-teal-500/15 text-teal-600 dark:text-teal-400" data-testid="badge-report-trinity">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Trinity Enhanced
                  </Badge>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {selectedReport.employee_name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Officer</span>
                    <span data-testid="text-report-officer">{selectedReport.employee_name}</span>
                  </div>
                )}
                {selectedReport.shift_start_time && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Shift Start</span>
                    <span data-testid="text-report-start">{format(new Date(selectedReport.shift_start_time), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
                {selectedReport.shift_end_time && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Shift End</span>
                    <span data-testid="text-report-end">{format(new Date(selectedReport.shift_end_time), "h:mm a")}</span>
                  </div>
                )}
                {selectedReport.photo_count != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Photos</span>
                    <span className="flex items-center gap-1" data-testid="text-report-photos">
                      <Camera className="w-3 h-3" />
                      {selectedReport.photo_count} captured
                    </span>
                  </div>
                )}
                {selectedReport.verified_at && selectedReport.verified_by && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Verified</span>
                    <span data-testid="text-report-verified">{format(new Date(selectedReport.verified_at), "MMM d, yyyy")}</span>
                  </div>
                )}
                {selectedReport.pdf_generated_at && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">PDF Generated</span>
                    <span data-testid="text-report-pdf-date">{format(new Date(selectedReport.pdf_generated_at), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
              </div>
              {selectedReport.summary && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Report Summary</p>
                  <p className="text-sm leading-relaxed p-3 bg-muted/50 rounded-md" data-testid="text-report-summary">
                    {selectedReport.summary}
                  </p>
                </div>
              )}
            </div>
          )}
          <UniversalModalFooter>
            {selectedReport?.pdf_url ? (
              <Button
                onClick={() => window.open(`/api/rms/shift-reports/${selectedReport.id}/download-pdf`, '_blank')}
                data-testid="button-modal-download-pdf"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            ) : (
              <Button
                onClick={() => { generatePdfMutation.mutate(selectedReport!.id); setSelectedReport(null); }}
                disabled={generatePdfMutation.isPending}
                data-testid="button-modal-generate-pdf"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Generate PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedReport(null)} data-testid="button-close-report">
              Close
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={uploadOpen} onOpenChange={setUploadOpen}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-upload-modal-title">Upload Document</UniversalModalTitle>
          </UniversalModalHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title *</Label>
              <Input
                id="doc-title"
                placeholder="Document title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                data-testid="input-doc-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-category">Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger data-testid="select-doc-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} data-testid={`option-category-${cat}`}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-file-url">File URL *</Label>
              <Input
                id="doc-file-url"
                placeholder="https://..."
                value={formFileUrl}
                onChange={(e) => setFormFileUrl(e.target.value)}
                data-testid="input-doc-file-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-source-template">Source Template ID (optional)</Label>
              <Input
                id="doc-source-template"
                placeholder="Template instance ID"
                value={formSourceTemplateId}
                onChange={(e) => setFormSourceTemplateId(e.target.value)}
                data-testid="input-doc-source-template"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="doc-entity-type">Related Entity Type</Label>
                <Input
                  id="doc-entity-type"
                  placeholder="e.g., employee"
                  value={formRelatedEntityType}
                  onChange={(e) => setFormRelatedEntityType(e.target.value)}
                  data-testid="input-doc-entity-type"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-entity-id">Related Entity ID</Label>
                <Input
                  id="doc-entity-id"
                  placeholder="Entity ID"
                  value={formRelatedEntityId}
                  onChange={(e) => setFormRelatedEntityId(e.target.value)}
                  data-testid="input-doc-entity-id"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-tags">Tags (comma-separated)</Label>
              <Input
                id="doc-tags"
                placeholder="tag1, tag2, tag3"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                data-testid="input-doc-tags"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="doc-is-signed">Document is Signed</Label>
              <Switch
                id="doc-is-signed"
                checked={formIsSigned}
                onCheckedChange={setFormIsSigned}
                data-testid="switch-doc-is-signed"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); resetForm(); }} data-testid="button-cancel-upload">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-upload">
              <Upload className="w-4 h-4 mr-2" />
              {createMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
