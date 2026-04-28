import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {Eye, CheckCircle2, Clock, AlertCircle, ChevronRight, FileText, Users,
  Building2, Shield, Upload, PenLine, Search, Eye, Download,
  RefreshCw, Loader2, CheckCheck, Circle, Lock, ArrowLeft,
  ClipboardList, FileCheck, Zap,
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const PAGE_CONFIG: CanvasPageConfig = {
  title: "Onboarding Hub",
  description: "Track tenant setup and officer onboarding progress with Trinity guidance",
  // @ts-expect-error — TS migration: fix in refactoring sprint
  icon: ClipboardList,
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface TenantStep {
  id: string;
  step_key: string;
  step_number: number;
  title: string;
  description: string;
  required: boolean;
  category: string;
  estimated_minutes: number;
  trinity_prompt_template: string;
  upload_required: boolean;
  completion_trigger: string;
}

interface TenantProgress {
  workspace_id: string;
  overall_progress_pct: number;
  status: string;
  current_step: string;
  steps_completed: string[];
  steps_remaining: string[];
  company_profile_complete: boolean;
  billing_setup_complete: boolean;
  first_client_added: boolean;
  first_officer_added: boolean;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  email: string;
  overall_progress_pct: number | null;
  onboarding_progress_status: string | null;
  steps_completed: string[] | null;
  doc_count: number;
}

interface EmpStep {
  id: string;
  step_key: string;
  step_number: number;
  title: string;
  description: string;
  required: boolean;
  category: string;
  document_type: string | null;
  upload_required: boolean;
  signature_required: boolean;
  acknowledgment_required: boolean;
  estimated_minutes: number;
  trinity_prompt_template: string;
}

interface OnboardingDoc {
  id: string;
  document_type: string;
  document_category: string;
  title: string;
  status: string;
  uploaded_at: string | null;
  signed_at: string | null;
  expiration_date: string | null;
  generated_by: string;
  sha256_hash: string | null;
}

interface EmployeeDetail {
  employee: { id: string; first_name: string; last_name: string; position: string; email: string };
  progress: { overall_progress_pct: number; status: string; steps_completed: string[]; steps_remaining: string[]; completed_at: string | null };
  documents: OnboardingDoc[];
  steps: EmpStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  if (!status || status === "invited") return <Badge variant="secondary">Not Started</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-500 text-white">In Progress</Badge>;
  if (status === "complete") return <Badge className="bg-green-600 text-white">Complete</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function categoryIcon(cat: string) {
  const icons: Record<string, any> = {
    identity: Shield, tax: FileText, compliance: CheckCheck, policy: ClipboardList,
    equipment: Zap, company: Building2, documents: FileCheck, billing: FileText,
    clients: Users, team: Users, operations: Clock,
  };
  const Icon = icons[cat] || FileText;
  return <Icon className="h-4 w-4" />;
}

function docStatusBadge(s: string) {
  if (s === "signed") return <Badge className="bg-green-600 text-white text-xs">Signed</Badge>;
  if (s === "uploaded") return <Badge className="bg-blue-600 text-white text-xs">Uploaded</Badge>;
  if (s === "generated") return <Badge className="bg-purple-600 text-white text-xs">Generated</Badge>;
  if (s === "verified") return <Badge className="bg-green-700 text-white text-xs">Verified</Badge>;
  return <Badge variant="outline" className="text-xs">{s}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function DocViewerModal({ doc, open, onClose }: { doc: OnboardingDoc | null; open: boolean; onClose: () => void }) {
  if (!doc) return null;
  const viewUrl = `/api/smart-onboarding/document/${doc.id}/view`;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {doc.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {docStatusBadge(doc.status)}
            {doc.signed_at && <span className="text-xs text-muted-foreground">Signed: {new Date(doc.signed_at).toLocaleDateString()}</span>}
            {doc.expiration_date && <span className="text-xs text-amber-600">Expires: {new Date(doc.expiration_date).toLocaleDateString()}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-md overflow-hidden border">
          <iframe
            src={viewUrl}
            className="w-full h-full"
            title={doc.title}
            data-testid="doc-viewer-iframe"
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={viewUrl} target="_blank" rel="noopener noreferrer" data-testid="btn-open-doc-tab">
              <Eye className="h-4 w-4 mr-1" />
              Open in Tab
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-close-doc">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP SUBMISSION MODAL
// ─────────────────────────────────────────────────────────────────────────────

function StepSubmitModal({
  step, employeeId, employeeName, open, onClose, onSuccess,
}: {
  step: EmpStep | null;
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (pct: number) => void;
}) {
  const { toast } = useToast();
  const [signerName, setSignerName] = useState(employeeName);
  const [ackText, setAckText] = useState("");
  const [notes, setNotes] = useState("");

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/smart-onboarding/employee/${employeeId}/steps/${step!.step_key}/submit`, {
        signerName,
        acknowledgmentText: ackText || `I, ${signerName}, acknowledge completion of ${step!.title}.`,
        documentTitle: step!.title,
        metadata: { notes },
      }),
    onSuccess: (data: any) => {
      toast({ title: "Step completed", description: data.message || `${step!.title} completed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/employees"] });
      onSuccess(data.newProgressPct);
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {categoryIcon(step.category)}
            Complete: {step.title}
          </DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground italic border">
            {step.trinity_prompt_template?.replace("[Company Name]", "Acme Security Services").replace("[Officer First Name]", employeeName.split(" ")[0])}
          </div>
          <div className="space-y-1">
            <Label htmlFor="signer-name" className="text-xs uppercase text-muted-foreground">
              {step.signature_required ? "Signature Name (as signed)" : "Completed By"}
            </Label>
            <Input
              id="signer-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full name"
              data-testid="input-signer-name"
            />
          </div>
          {step.acknowledgment_required && (
            <div className="space-y-1">
              <Label htmlFor="ack-text" className="text-xs uppercase text-muted-foreground">Acknowledgment Statement</Label>
              <Textarea
                id="ack-text"
                value={ackText}
                onChange={(e) => setAckText(e.target.value)}
                placeholder={`I, ${employeeName}, acknowledge...`}
                className="resize-none"
                rows={3}
                data-testid="input-ack-text"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="step-notes" className="text-xs uppercase text-muted-foreground">Notes (optional)</Label>
            <Input
              id="step-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this completion"
              data-testid="input-step-notes"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Estimated time: {step.estimated_minutes} minutes
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-step">Cancel</Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !signerName}
            data-testid="btn-submit-step"
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            {step.signature_required ? "Sign & Complete" : "Mark Complete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT SETUP TAB
// ─────────────────────────────────────────────────────────────────────────────

function TenantDocUploadModal({
  step, open, onClose, onSuccess,
}: {
  step: TenantStep | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [docTitle, setDocTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileSelected, setFileSelected] = useState(false);

  const fileRef = useState<File | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!fileRef[0]) {
        throw new Error("Please select a file to upload");
      }
      const formData = new FormData();
      formData.append("file", fileRef[0]);
      formData.append("entityType", "organization");
      formData.append("entityId", "workspace");
      formData.append("documentType", step!.step_key);
      formData.append("documentCategory", step!.category);
      formData.append("title", docTitle || step!.title);
      formData.append("description", notes || `Uploaded for ${step!.title}`);
      formData.append("generatedBy", "org_owner");

      await apiRequest("POST", "/api/smart-onboarding/documents", {
        entityType: "organization",
        entityId: "workspace",
        documentType: step!.step_key,
        documentCategory: step!.category,
        title: docTitle || step!.title,
        description: notes || `Uploaded for ${step!.title}`,
        generatedBy: "org_owner",
        fileName: fileRef[0].name,
        fileSize: fileRef[0].size,
        mimeType: fileRef[0].type,
      });
      await apiRequest("POST", `/api/smart-onboarding/tenant/steps/${step!.step_key}/complete`, {});
    },
    onSuccess: () => {
      toast({ title: "Document uploaded", description: `${step!.title} completed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/tenant"] });
      onSuccess();
      onClose();
      setDocTitle("");
      setNotes("");
      setFileSelected(false);
      fileRef[1](null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload: {step.title}
          </DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {step.trinity_prompt_template && (
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground italic border">
              {step.trinity_prompt_template}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="doc-title" className="text-xs uppercase text-muted-foreground">Document Title</Label>
            <Input
              id="doc-title"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder={step.title}
              data-testid="input-doc-title"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">File (PDF, Image)</Label>
            <div className="border-2 border-dashed rounded-md p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setFileSelected(!!file);
                  fileRef[1](file);
                }}
                data-testid="input-doc-file"
              />
              <p className="text-xs text-muted-foreground mt-2">Upload your {step.title.toLowerCase()} document</p>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-notes" className="text-xs uppercase text-muted-foreground">Notes (optional)</Label>
            <Input
              id="doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes"
              data-testid="input-doc-notes"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-upload">Cancel</Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !fileSelected}
            data-testid="btn-confirm-upload"
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload & Complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TenantSetupTab() {
  const { toast } = useToast();
  const [uploadStep, setUploadStep] = useState<TenantStep | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading } = useQuery<{ progress: TenantProgress; steps: TenantStep[] }>({
    queryKey: ["/api/smart-onboarding/tenant"],
  });

  const completeMutation = useMutation({
    mutationFn: (stepKey: string) =>
      apiRequest("POST", `/api/smart-onboarding/tenant/steps/${stepKey}/complete`, {}),
    onSuccess: (data: any) => {
      toast({ title: "Step completed", description: `Progress: ${data.newProgressPct}%` });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/tenant"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const progress = data?.progress;
  const steps = data?.steps || [];
  const completed = progress?.steps_completed || [];
  const pct = progress?.overall_progress_pct || 0;

  const required = steps.filter((s) => s.required);
  const optional = steps.filter((s) => !s.required);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Setup Progress
              </CardTitle>
              <CardDescription>Complete all required steps to go fully operational</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary" data-testid="tenant-progress-pct">{pct}%</div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </div>
          <Progress value={pct} className="h-3 mt-2" data-testid="tenant-progress-bar" />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
            <span>{completed.length} of {steps.length} steps done</span>
            {progress?.status && statusBadge(progress.status)}
            {steps.reduce((acc, s) => !completed.includes(s.step_key) && s.required ? acc + s.estimated_minutes : acc, 0) > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ~{steps.reduce((acc, s) => !completed.includes(s.step_key) && s.required ? acc + s.estimated_minutes : acc, 0)} min remaining
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Required Steps</h3>
        {required.map((step) => {
          const done = completed.includes(step.step_key);
          const isCurrent = progress?.current_step === step.step_key;
          const needsUpload = step.upload_required;
          return (
            <Card
              key={step.step_key}
              className={isCurrent && !done ? "border-primary/50" : ""}
              data-testid={`tenant-step-${step.step_key}`}
            >
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 shrink-0 ${done ? "text-green-500" : isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : isCurrent ? <Circle className="h-5 w-5" /> : <Lock className="h-5 w-5 opacity-40" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                          {step.step_number}. {step.title}
                        </span>
                        <Badge variant="outline" className="text-xs">{step.category}</Badge>
                        {needsUpload && !done && (
                          <Badge variant="secondary" className="text-xs">
                            <Upload className="h-3 w-3 mr-1" />Upload Required
                          </Badge>
                        )}
                        {step.estimated_minutes && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />{step.estimated_minutes}m
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                      {isCurrent && !done && step.trinity_prompt_template && (
                        <div className="mt-2 text-xs italic text-muted-foreground bg-muted/50 px-3 py-2 rounded-md border-l-2 border-primary/40">
                          Trinity: "{step.trinity_prompt_template}"
                        </div>
                      )}
                    </div>
                  </div>
                  {!done && needsUpload && (
                    <Button
                      size="sm"
                      variant={isCurrent ? "default" : "outline"}
                      onClick={() => { setUploadStep(step); setUploadOpen(true); }}
                      disabled={completeMutation.isPending}
                      data-testid={`btn-upload-tenant-${step.step_key}`}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Upload Document
                    </Button>
                  )}
                  {!done && !needsUpload && (
                    <Button
                      size="sm"
                      variant={isCurrent ? "default" : "outline"}
                      onClick={() => completeMutation.mutate(step.step_key)}
                      disabled={completeMutation.isPending}
                      data-testid={`btn-complete-tenant-${step.step_key}`}
                    >
                      {completeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      <span className="ml-1">Mark Done</span>
                    </Button>
                  )}
                  {done && (
                    <Badge className="bg-green-600 text-white shrink-0" data-testid={`badge-done-${step.step_key}`}>Done</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {optional.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Optional Steps</h3>
          {optional.map((step) => {
            const done = completed.includes(step.step_key);
            const needsUpload = step.upload_required;
            return (
              <Card key={step.step_key} className="opacity-80">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={done ? "text-green-500" : "text-muted-foreground"}>
                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </div>
                      <div>
                        <span className="font-medium text-sm">{step.step_number}. {step.title}</span>
                        <Badge variant="secondary" className="ml-2 text-xs">Optional</Badge>
                        {needsUpload && !done && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            <Upload className="h-3 w-3 mr-1" />Upload
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      </div>
                    </div>
                    {!done && needsUpload && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setUploadStep(step); setUploadOpen(true); }}
                        disabled={completeMutation.isPending}
                        data-testid={`btn-upload-opt-${step.step_key}`}
                      >
                        <Upload className="h-3 w-3 mr-1" />Upload
                      </Button>
                    )}
                    {!done && !needsUpload && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => completeMutation.mutate(step.step_key)} 
                        disabled={completeMutation.isPending} 
                        data-testid={`btn-complete-opt-${step.step_key}`}
                      >
                        {completeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Mark Done
                      </Button>
                    )}
                    {done && <Badge className="bg-green-600 text-white">Done</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TenantDocUploadModal
        step={uploadStep}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/tenant"] })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE DETAIL VIEW
// ─────────────────────────────────────────────────────────────────────────────

function EmployeeDetailView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const [selectedDoc, setSelectedDoc] = useState<OnboardingDoc | null>(null);
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [submitStep, setSubmitStep] = useState<EmpStep | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const { data, isLoading } = useQuery<EmployeeDetail>({
    queryKey: ["/api/smart-onboarding/employee", employeeId],
    queryFn: () => fetch(`/api/smart-onboarding/employee/${employeeId}`, { credentials: "include" }).then((r) => r.json()).then((d) => d),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const { employee, progress, documents, steps } = data || {};
  if (!employee || !progress) return <div className="p-8 text-center text-muted-foreground">Employee not found</div>;

  const empName = `${employee.first_name} ${employee.last_name}`;
  const completed = progress.steps_completed || [];
  const pct = progress.overall_progress_pct || 0;

  const docsByType: Record<string, OnboardingDoc> = {};
  (documents || []).forEach((d) => { docsByType[d.document_type] = d; });

  const sections = [
    { label: "Identity", cat: "identity", keys: ["profile_photo", "government_id", "guard_card", "emergency_contact", "references", "employment_application"] },
    { label: "Tax & Payroll", cat: "tax", keys: ["ssn_card", "tax_withholding", "direct_deposit"] },
    { label: "Compliance", cat: "compliance", keys: ["i9_verification", "background_check"] },
    { label: "Policies", cat: "policy", keys: ["drug_free_policy", "handbook_acknowledgment", "sop_acknowledgment"] },
    { label: "Equipment", cat: "equipment", keys: ["equipment_issuance"] },
  ];

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1" data-testid="btn-back-employee-list">
        <ArrowLeft className="h-4 w-4" /> All Employees
      </Button>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                  {employee.first_name[0]}{employee.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xl font-bold" data-testid="emp-detail-name">{empName}</div>
                <div className="text-sm text-muted-foreground">{employee.position || "Security Officer"}</div>
                <div className="mt-1">{statusBadge(progress.status)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary" data-testid="emp-detail-pct">{pct}%</div>
              <div className="text-sm text-muted-foreground">{completed.length} of {steps?.length || 15} steps</div>
              {progress.completed_at && (
                <div className="text-xs text-green-600 mt-1">Completed {new Date(progress.completed_at).toLocaleDateString()}</div>
              )}
            </div>
          </div>
          <Progress value={pct} className="h-3 mt-4" data-testid="emp-detail-progress-bar" />
        </CardContent>
      </Card>

      <Tabs defaultValue="steps">
        <TabsList className="w-full">
          <TabsTrigger value="steps" className="flex-1">Steps ({steps?.length || 15})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({documents?.length || 0})</TabsTrigger>
          <TabsTrigger value="personnel-file" className="flex-1">Personnel File</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="space-y-2 mt-4">
          {(steps || []).map((step) => {
            const done = completed.includes(step.step_key);
            const docForStep = Object.values(docsByType).find((d) =>
              d.document_type === step.document_type || d.document_type === step.step_key
            );
            return (
              <Card key={step.step_key} data-testid={`emp-step-${step.step_key}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`mt-0.5 shrink-0 ${done ? "text-green-500" : "text-muted-foreground"}`}>
                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                            {step.step_number}. {step.title}
                          </span>
                          {!step.required && <Badge variant="secondary" className="text-xs">Optional</Badge>}
                          <Badge variant="outline" className="text-xs">{step.category}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          {step.upload_required && <span className="flex items-center gap-1"><Upload className="h-3 w-3" />Upload</span>}
                          {step.signature_required && <span className="flex items-center gap-1"><PenLine className="h-3 w-3" />Signature</span>}
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{step.estimated_minutes}m</span>
                        </div>
                        {docForStep && done && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 text-xs gap-1 text-blue-600"
                            onClick={() => { setSelectedDoc(docForStep); setDocViewerOpen(true); }}
                            data-testid={`btn-view-step-doc-${step.step_key}`}
                          >
                            <Eye className="h-3 w-3" /> View Document
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center shrink-0">
                      {done ? (
                        <Badge className="bg-green-600 text-white" data-testid={`badge-emp-step-done-${step.step_key}`}>Done</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSubmitStep(step); setSubmitOpen(true); }}
                          data-testid={`btn-complete-emp-step-${step.step_key}`}
                        >
                          {step.signature_required ? <PenLine className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {step.signature_required ? "Sign" : "Complete"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {!documents || documents.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No documents yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {sections.map((section) => {
                const sectionDocs = documents.filter((d) =>
                  section.keys.some((k) => d.document_type === k || d.document_type?.startsWith(k.replace("_", "")))
                );
                if (sectionDocs.length === 0) return null;
                return (
                  <div key={section.label} className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide pt-2">{section.label}</h4>
                    {sectionDocs.map((doc) => (
                      <Card key={doc.id} data-testid={`doc-card-${doc.id}`}>
                        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{doc.title}</div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {doc.uploaded_at && <span>Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</span>}
                                {doc.signed_at && <span>Signed {new Date(doc.signed_at).toLocaleDateString()}</span>}
                                {doc.expiration_date && (
                                  <span className="text-amber-600 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Expires {new Date(doc.expiration_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {docStatusBadge(doc.status)}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelectedDoc(doc); setDocViewerOpen(true); }}
                              data-testid={`btn-view-doc-${doc.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                              data-testid={`btn-open-doc-tab-${doc.id}`}
                            >
                              <a href={`/api/smart-onboarding/document/${doc.id}/view`} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3 w-3" />
                              </a>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="personnel-file" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Personnel File — {empName}
              </CardTitle>
              <CardDescription>
                Chronological document organizer — all {documents?.length || 0} documents on file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sections.map((section) => {
                const sectionDocs = (documents || []).filter((d) =>
                  section.keys.some((k) => d.document_type === k || d.document_type?.startsWith(k.replace("_", "")))
                );
                return (
                  <div key={section.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-muted-foreground">{categoryIcon(section.cat)}</div>
                      <h4 className="font-semibold text-sm uppercase tracking-wide">{section.label}</h4>
                      <Badge variant="outline" className="text-xs">{sectionDocs.length} docs</Badge>
                    </div>
                    {sectionDocs.length === 0 ? (
                      <div className="text-sm text-muted-foreground pl-6">No documents in this section yet</div>
                    ) : (
                      <div className="space-y-1.5 pl-6">
                        {sectionDocs.map((doc) => (
                          <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b last:border-b-0">
                            <div className="flex items-center gap-2 text-sm">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{doc.title}</span>
                              {docStatusBadge(doc.status)}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => { setSelectedDoc(doc); setDocViewerOpen(true); }}
                              data-testid={`btn-pf-view-${doc.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Separator className="mt-3" />
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" data-testid="btn-print-complete-file">
                  <FileText className="h-4 w-4 mr-1" />Print Complete File
                </Button>
                <Button variant="outline" size="sm" data-testid="btn-print-compliance-only">
                  <Shield className="h-4 w-4 mr-1" />Print Compliance Only
                </Button>
                <Button variant="outline" size="sm" data-testid="btn-print-for-audit">
                  <ClipboardList className="h-4 w-4 mr-1" />Print for Audit
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DocViewerModal doc={selectedDoc} open={docViewerOpen} onClose={() => setDocViewerOpen(false)} />
      <StepSubmitModal
        step={submitStep}
        employeeId={employeeId}
        employeeName={empName}
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSuccess={(pct) => {
          queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/employee", employeeId] });
          queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/employees"] });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE ONBOARDING TAB (manager list)
// ─────────────────────────────────────────────────────────────────────────────

function EmployeeOnboardingTab() {
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "incomplete" | "complete">("all");

  const { data, isLoading } = useQuery<{ employees: EmployeeRow[] }>({
    queryKey: ["/api/smart-onboarding/employees"],
  });

  if (selectedEmployee) {
    return <EmployeeDetailView employeeId={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  const allEmps = data?.employees || [];
  const filtered = allEmps.filter((e) => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    const pct = e.overall_progress_pct ?? 0;
    if (filter === "incomplete" && pct === 100) return false;
    if (filter === "complete" && pct !== 100) return false;
    return true;
  });

  const stats = {
    total: allEmps.length,
    complete: allEmps.filter((e) => (e.overall_progress_pct ?? 0) === 100).length,
    inProgress: allEmps.filter((e) => { const p = e.overall_progress_pct ?? 0; return p > 0 && p < 100; }).length,
    notStarted: allEmps.filter((e) => !e.overall_progress_pct || e.overall_progress_pct === 0).length,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Officers", value: stats.total, color: "text-foreground" },
          { label: "Complete", value: stats.complete, color: "text-green-600" },
          { label: "In Progress", value: stats.inProgress, color: "text-amber-600" },
          { label: "Not Started", value: stats.notStarted, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <div className={`text-3xl font-bold ${s.color}`} data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search officers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-employee-search"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "incomplete", "complete"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              data-testid={`btn-filter-${f}`}
            >
              {f === "all" ? "All" : f === "incomplete" ? "Incomplete" : "Complete"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No officers match your filter</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((emp) => {
            const pct = emp.overall_progress_pct ?? 0;
            const status = emp.onboarding_progress_status;
            const completedCount = emp.steps_completed?.length ?? 0;
            return (
              <Card
                key={emp.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedEmployee(emp.id)}
                data-testid={`emp-row-${emp.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                        {statusBadge(status)}
                      </div>
                      <div className="text-xs text-muted-foreground">{emp.position || "Security Officer"}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={pct} className="h-1.5 flex-1" data-testid={`emp-row-progress-${emp.id}`} />
                        <span className="text-xs font-semibold w-10 text-right" data-testid={`emp-row-pct-${emp.id}`}>{pct}%</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {completedCount} steps done · {emp.doc_count ?? 0} documents
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingHub() {
  const { data: tenantData } = useQuery<{ progress: TenantProgress }>({
    queryKey: ["/api/smart-onboarding/tenant"],
  });
  const tenantPct = tenantData?.progress?.overall_progress_pct ?? 0;

  return (
    <CanvasHubPage config={PAGE_CONFIG}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Onboarding Hub
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Company setup and officer onboarding — Trinity guided
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/tenant"] });
              queryClient.invalidateQueries({ queryKey: ["/api/smart-onboarding/employees"] });
            }}
            data-testid="btn-refresh-onboarding"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="company">
          <TabsList className="w-full">
            <TabsTrigger value="company" className="flex-1 gap-2" data-testid="tab-company-setup">
              <Building2 className="h-4 w-4" />
              Company Setup
              {tenantPct < 100 && (
                <Badge variant="secondary" className="text-xs ml-1">{tenantPct}%</Badge>
              )}
              {tenantPct === 100 && (
                <Badge className="bg-green-600 text-white text-xs ml-1">Done</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="officers" className="flex-1 gap-2" data-testid="tab-officer-onboarding">
              <Users className="h-4 w-4" />
              Officer Onboarding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="mt-4">
            <TenantSetupTab />
          </TabsContent>

          <TabsContent value="officers" className="mt-4">
            <EmployeeOnboardingTab />
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
