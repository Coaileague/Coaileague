import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from "@/components/ui/universal-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Search, FileText, AlertCircle, FileCheck, Trash2, Send,
  ClipboardList, Clock, ChevronRight,
} from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "employment", label: "Employment" },
  { value: "client_contract", label: "Client Contract" },
  { value: "post_order", label: "Post Order" },
  { value: "policy", label: "Policy" },
  { value: "incident", label: "Incident" },
  { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicle" },
  { value: "training", label: "Training" },
  { value: "compliance", label: "Compliance" },
  { value: "custom", label: "Custom" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  employment: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  client_contract: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  post_order: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  policy: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  incident: "bg-red-500/15 text-red-600 dark:text-red-400",
  equipment: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  vehicle: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  training: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  compliance: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  custom: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

interface Template {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  category: string;
  contentType: string;
  contentBody: string | null;
  mergeFields: any;
  signatureFields: any;
  requiresCountersign: boolean;
  autoSendOnEvent: string | null;
  expirationDays: number | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  category: "employment",
  contentType: "text",
  contentBody: "",
  mergeFields: "[]",
  signatureFields: "[]",
  requiresCountersign: false,
  autoSendOnEvent: "",
  expirationDays: "",
};

const pageConfig: CanvasPageConfig = {
  id: "document-templates",
  title: "Document Templates",
  subtitle: "Manage reusable document templates for your organization",
  category: "operations",
  maxWidth: "7xl",
};

interface UdtsTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  estimatedMinutes: number;
  requiresSignature: boolean;
  allowSaveForLater: boolean;
  sectionCount: number;
}

const UDTS_CATEGORY_COLORS: Record<string, string> = {
  employment: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  hr: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  payroll: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  compliance: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  operations: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  training: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  incident: "bg-red-500/15 text-red-600 dark:text-red-400",
  collections: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function UdtsSection() {
  const [, navigate] = useLocation();
  const [udtsSearch, setUdtsSearch] = useState("");

  const { data, isLoading } = useQuery<{ templates: UdtsTemplate[] }>({
    queryKey: ["/api/document-forms/templates"],
  });

  const templates = (data?.templates ?? []).filter((t) => {
    if (!udtsSearch) return true;
    const q = udtsSearch.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="udts-section">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Canonical Document Forms
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {templates.length} standardized forms — click to fill out
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={udtsSearch}
            onChange={(e) => setUdtsSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-search-udts-forms"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => navigate(`/document-form/${t.id.toLowerCase()}`)}
              data-testid={`card-udts-${t.id.toLowerCase()}`}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-udts-title-${t.id.toLowerCase()}`}>
                      {t.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {t.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-xs ${UDTS_CATEGORY_COLORS[t.category] || ""}`}
                    data-testid={`badge-udts-cat-${t.id.toLowerCase()}`}
                  >
                    {t.category.replace(/_/g, " ")}
                  </Badge>
                  {t.requiresSignature && (
                    <Badge variant="outline" className="text-xs">
                      <FileCheck className="w-2.5 h-2.5 mr-1" />
                      Signature
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" />
                    ~{t.estimatedMinutes}m
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentTemplatesPage() {
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data, isLoading, isError, refetch } = useQuery<{ items: Template[]; total: number }>({
    queryKey: ["/api/document-templates", { category: categoryFilter === "all" ? undefined : categoryFilter, search: searchTerm || undefined }],
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/document-templates", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      toast({ title: "Template Created", description: "Document template has been created." });
      setShowCreateModal(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/document-templates/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      toast({ title: "Template Updated", description: "Document template has been updated." });
      setEditTemplate(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update template", variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/document-templates/${id}`, { isActive: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      toast({ title: "Template Deactivated", description: "Template has been soft-deleted." });
      setEditTemplate(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to deactivate template", variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", "/api/document-templates/generate", {
        templateId,
        title: `Generated from template`,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document Generated", description: "A new document instance has been created from this template." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate document", variant: "destructive" });
    },
  });

  const parseFormBody = (f: typeof form) => {
    let mergeFields: any = [];
    let signatureFields: any = [];
    try { mergeFields = JSON.parse(f.mergeFields); } catch { /* keep default */ }
    try { signatureFields = JSON.parse(f.signatureFields); } catch { /* keep default */ }
    return {
      name: f.name,
      description: f.description || null,
      category: f.category,
      contentType: f.contentType,
      contentBody: f.contentBody || null,
      mergeFields,
      signatureFields,
      requiresCountersign: f.requiresCountersign,
      autoSendOnEvent: f.autoSendOnEvent || null,
      expirationDays: f.expirationDays ? parseInt(f.expirationDays) : null,
    };
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(parseFormBody(form));
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTemplate) return;
    updateMutation.mutate({ id: editTemplate.id, body: parseFormBody(form) });
  };

  const openEditModal = (t: Template) => {
    setEditTemplate(t);
    setForm({
      name: t.name,
      description: t.description || "",
      category: t.category,
      contentType: t.contentType || "text",
      contentBody: t.contentBody || "",
      mergeFields: JSON.stringify(t.mergeFields || [], null, 2),
      signatureFields: JSON.stringify(t.signatureFields || [], null, 2),
      requiresCountersign: t.requiresCountersign,
      autoSendOnEvent: t.autoSendOnEvent || "",
      expirationDays: t.expirationDays?.toString() || "",
    });
  };

  const templates = data?.items || [];

  const headerActions = (
    <Button onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreateModal(true); }} data-testid="button-create-template">
      <Plus className="w-4 h-4 mr-2" />
      Create Template
    </Button>
  );

  return (
    <CanvasHubPage config={{ ...pageConfig, headerActions }}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-templates"
            />
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat.value}
              variant={categoryFilter === cat.value ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter(cat.value)}
              data-testid={`filter-category-${cat.value}`}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {isError ? (
          <Card className="p-12 text-center" data-testid="templates-error">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
            <p className="text-muted-foreground mb-3">Failed to load templates.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-templates">Retry</Button>
          </Card>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-40 bg-muted rounded-md animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card className="p-12 text-center" data-testid="templates-empty">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground" data-testid="text-no-templates">No templates found</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer hover-elevate transition-colors"
                onClick={() => openEditModal(t)}
                data-testid={`card-template-${t.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm truncate" data-testid={`text-template-name-${t.id}`}>{t.name}</h3>
                    <Badge
                      variant={t.isActive ? "default" : "secondary"}
                      className={t.isActive ? "bg-green-600 dark:bg-green-500" : ""}
                      data-testid={`badge-active-${t.id}`}
                    >
                      {t.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <Badge variant="outline" className={CATEGORY_COLORS[t.category] || ""} data-testid={`badge-category-${t.id}`}>
                    {t.category.replace(/_/g, " ")}
                  </Badge>
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-template-desc-${t.id}`}>{t.description}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span data-testid={`text-template-version-${t.id}`}>v{t.version}</span>
                    <span>{t.contentType}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* UDTS Canonical Forms Section */}
        <div className="border-t border-border pt-6">
          <UdtsSection />
        </div>
      </div>

      <UniversalModal open={showCreateModal} onOpenChange={setShowCreateModal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Create Template</UniversalModalTitle>
          </UniversalModalHeader>
          <form onSubmit={handleCreate} className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
            <TemplateFormFields form={form} setForm={setForm} />
          </form>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} data-testid="button-cancel-create">Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-create">
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!editTemplate} onOpenChange={(open) => { if (!open) setEditTemplate(null); }}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Edit Template</UniversalModalTitle>
          </UniversalModalHeader>
          <form onSubmit={handleUpdate} className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
            <TemplateFormFields form={form} setForm={setForm} />
          </form>
          <UniversalModalFooter>
            <div className="flex items-center gap-2 flex-wrap w-full justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => editTemplate && deactivateMutation.mutate(editTemplate.id)}
                  disabled={deactivateMutation.isPending}
                  data-testid="button-delete-template"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deactivateMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => editTemplate && generateMutation.mutate(editTemplate.id)}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-document"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {generateMutation.isPending ? "Generating..." : "Generate Document"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" type="button" onClick={() => setEditTemplate(null)} data-testid="button-cancel-edit">Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}

function TemplateFormFields({ form, setForm }: { form: typeof EMPTY_FORM; setForm: (f: typeof EMPTY_FORM) => void }) {
  const update = (field: string, value: any) => setForm({ ...form, [field]: value });

  return (
    <>
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} data-testid="input-template-name" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={form.description} onChange={(e) => update("description", e.target.value)} rows={2} data-testid="input-template-description" />
      </div>
      <div>
        <Label htmlFor="category">Category</Label>
        <Select value={form.category} onValueChange={(v) => update("category", v)}>
          <SelectTrigger data-testid="select-template-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.filter(c => c.value !== "all").map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="contentType">Content Type</Label>
        <Select value={form.contentType} onValueChange={(v) => update("contentType", v)}>
          <SelectTrigger data-testid="select-content-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="html">HTML</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="contentBody">Content Body</Label>
        <Textarea id="contentBody" value={form.contentBody} onChange={(e) => update("contentBody", e.target.value)} rows={4} data-testid="input-content-body" />
      </div>
      <div>
        <Label htmlFor="mergeFields">Merge Fields (JSON)</Label>
        <Textarea id="mergeFields" value={form.mergeFields} onChange={(e) => update("mergeFields", e.target.value)} rows={3} className="font-mono text-xs" data-testid="input-merge-fields" />
      </div>
      <div>
        <Label htmlFor="signatureFields">Signature Fields (JSON)</Label>
        <Textarea id="signatureFields" value={form.signatureFields} onChange={(e) => update("signatureFields", e.target.value)} rows={3} className="font-mono text-xs" data-testid="input-signature-fields" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="requiresCountersign">Requires Countersign</Label>
        <Switch id="requiresCountersign" checked={form.requiresCountersign} onCheckedChange={(v) => update("requiresCountersign", v)} data-testid="switch-countersign" />
      </div>
      <div>
        <Label htmlFor="autoSendOnEvent">Auto Send on Event</Label>
        <Input id="autoSendOnEvent" value={form.autoSendOnEvent} onChange={(e) => update("autoSendOnEvent", e.target.value)} placeholder="e.g. employee_onboarded" data-testid="input-auto-send-event" />
      </div>
      <div>
        <Label htmlFor="expirationDays">Expiration Days</Label>
        <Input id="expirationDays" type="number" value={form.expirationDays} onChange={(e) => update("expirationDays", e.target.value)} placeholder="e.g. 365" data-testid="input-expiration-days" />
      </div>
    </>
  );
}
