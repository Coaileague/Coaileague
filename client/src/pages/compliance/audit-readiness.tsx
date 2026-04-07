import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Shield,
  Users,
  ChevronRight,
  RefreshCw,
  Lock,
  Building2,
  Scale,
  BellRing,
  X,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";

interface ComplianceDoc {
  key: string;
  label: string;
  uploaded: boolean;
  required: boolean;
}

interface OfficerSummary {
  total: number;
  compliant: number;
  hardBlocked: number;
  avgScore: number;
}

interface ReadinessData {
  score: number;
  companyDocuments: ComplianceDoc[];
  officerSummary: OfficerSummary;
  missingItems: string[];
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "#22c55e" : score >= 70 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="absolute inset-0" width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="54" fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle
          cx="64" cy="64" r="54"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${2 * Math.PI * 54}`}
          strokeDashoffset={`${2 * Math.PI * 54 * (1 - score / 100)}`}
          strokeLinecap="round"
          transform="rotate(-90 64 64)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="text-center">
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-slate-400 text-sm block">/ 100</span>
      </div>
    </div>
  );
}

function DocUploadSlot({
  doc,
  onUpload,
}: {
  doc: ComplianceDoc;
  onUpload: (key: string, label: string, file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await onUpload(doc.key, doc.label, file);
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-md border ${
        doc.uploaded ? "bg-green-900/10 border-green-800/40" : "bg-slate-800 border-slate-700"
      }`}
      data-testid={`doc-slot-${doc.key}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {doc.uploaded ? (
          <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
        ) : doc.required ? (
          <XCircle size={18} className="text-red-400 flex-shrink-0" />
        ) : (
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{doc.label}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {doc.required && (
              <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 py-0">
                Required
              </Badge>
            )}
            {doc.uploaded ? (
              <span className="text-green-400 text-xs">Uploaded</span>
            ) : (
              <span className="text-red-400 text-xs">Missing</span>
            )}
          </div>
        </div>
      </div>
      {!doc.uploaded && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleChange}
            data-testid={`input-file-${doc.key}`}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="border-slate-600 text-slate-300 flex-shrink-0 ml-2"
            data-testid={`button-upload-${doc.key}`}
          >
            {isUploading ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Upload size={14} className="mr-1" />
            )}
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </>
      )}
    </div>
  );
}

export default function AuditReadiness() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reminderDismissed, setReminderDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("audit-readiness-reminder-dismissed") === "true";
    } catch {
      return false;
    }
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<{ success: boolean; data: ReadinessData }>({
    queryKey: ["/api/compliance/regulatory-portal/audit-readiness"],
  });

  const readiness = data?.data;

  const dismissReminder = () => {
    setReminderDismissed(true);
    try { sessionStorage.setItem("audit-readiness-reminder-dismissed", "true"); } catch {}
  };

  const handleUpload = async (docKey: string, docLabel: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docKey", docKey);
    formData.append("docLabel", docLabel);

    const res = await fetch("/api/compliance/regulatory-portal/upload-document", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      toast({
        title: "Upload Failed",
        description: err.error || "Could not upload the document. Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Document Uploaded",
      description: `${docLabel} has been saved. Your readiness score will update shortly.`,
    });
    await refetch();
  };

  const requiredDocs = readiness?.companyDocuments?.filter(d => d.required) ?? [];
  const optionalDocs = readiness?.companyDocuments?.filter(d => !d.required) ?? [];

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-28 sm:pb-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield size={24} className="text-[#ffc83c]" />
              Audit Readiness
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your organization's regulatory compliance readiness score.
              Complete all items to achieve 100% audit readiness.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-readiness"
          >
            <RefreshCw size={14} className={`mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh Score
          </Button>
        </div>

        {/* Trinity daily reminder when score is below 100% */}
        {!isLoading && readiness && readiness.score < 100 && !reminderDismissed && (
          <div
            className="flex items-start gap-3 p-4 rounded-md border"
            style={{ backgroundColor: "rgba(255,200,60,0.08)", borderColor: "rgba(255,200,60,0.25)" }}
            data-testid="trinity-readiness-reminder"
          >
            <BellRing size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#ffc83c" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Trinity Compliance Reminder</p>
              <p className="text-sm text-slate-300 mt-0.5">
                Your audit readiness score is <span className="font-semibold" style={{ color: "#ffc83c" }}>{readiness.score}/100</span>.
                {readiness.missingItems?.length > 0 && (
                  <> Complete the following to reach 100%: <span className="text-slate-400">{readiness.missingItems.slice(0, 3).join(", ")}{readiness.missingItems.length > 3 ? ` and ${readiness.missingItems.length - 3} more` : ""}.</span></>
                )}
              </p>
            </div>
            <button
              onClick={dismissReminder}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
              data-testid="button-dismiss-trinity-reminder"
              aria-label="Dismiss reminder"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : readiness ? (
          <>
            {/* Score Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="sm:col-span-1">
                <CardContent className="pt-6 flex flex-col items-center">
                  <ScoreRing score={readiness.score} />
                  <p className="text-muted-foreground text-sm mt-3 text-center">Overall Audit Readiness</p>
                  <Badge
                    variant="outline"
                    className={`mt-2 ${
                      readiness.score >= 85 ? "bg-green-900/40 text-green-400 border-green-800" :
                      readiness.score >= 70 ? "bg-blue-900/40 text-blue-400 border-blue-800" :
                      readiness.score >= 50 ? "bg-amber-900/40 text-amber-400 border-amber-800" :
                      "bg-red-900/40 text-red-400 border-red-800"
                    }`}
                  >
                    {readiness.score >= 85 ? "Audit Ready" :
                     readiness.score >= 70 ? "Mostly Ready" :
                     readiness.score >= 50 ? "Needs Work" : "Not Ready"}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="sm:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users size={16} className="text-[#ffc83c]" />
                    Officer Compliance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Officers", value: readiness.officerSummary.total, color: "text-white" },
                      { label: "Fully Compliant", value: readiness.officerSummary.compliant, color: "text-green-400" },
                      { label: "Hard Blocked", value: readiness.officerSummary.hardBlocked, color: "text-red-400" },
                      { label: "Avg Score", value: `${readiness.officerSummary.avgScore}/100`, color: "text-[#ffc83c]" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center p-3 rounded-md bg-muted/30">
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-muted-foreground text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                  {readiness.officerSummary.hardBlocked > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-red-900/20 border border-red-800">
                      <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-red-300 text-xs">
                        {readiness.officerSummary.hardBlocked} officer(s) have expired or missing licenses
                        and are hard blocked from work assignments. Resolve immediately.
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Officer compliance rate</span>
                      <span>{readiness.officerSummary.total > 0 ? Math.round((readiness.officerSummary.compliant / readiness.officerSummary.total) * 100) : 0}%</span>
                    </div>
                    <Progress
                      value={readiness.officerSummary.total > 0 ? (readiness.officerSummary.compliant / readiness.officerSummary.total) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Missing Items Alert */}
            {readiness.missingItems.length > 0 && (
              <Card className="border-amber-800 bg-amber-900/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-amber-300 text-base flex items-center gap-2">
                    <AlertTriangle size={16} />
                    {readiness.missingItems.length} Item{readiness.missingItems.length !== 1 ? "s" : ""} Need Attention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {readiness.missingItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-200/80">
                        <ChevronRight size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Company Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 size={16} className="text-[#ffc83c]" />
                  Company-Level Required Documents
                </CardTitle>
                <CardDescription>
                  These documents must be on file before a regulatory audit. Upload and keep them current.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {requiredDocs.map(doc => (
                  <DocUploadSlot key={doc.key} doc={doc} onUpload={handleUpload} />
                ))}
                {optionalDocs.length > 0 && (
                  <div className="pt-2">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Optional</p>
                    {optionalDocs.map(doc => (
                      <DocUploadSlot key={doc.key} doc={doc} onUpload={handleUpload} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audit Privacy Notice */}
            <Card className="border-slate-700 bg-slate-900/50">
              <CardContent className="pt-4 flex items-start gap-3">
                <Lock size={18} className="text-[#ffc83c] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Financial Data Access Control</p>
                  <p className="text-muted-foreground text-sm">
                    Regulatory auditors have access to compliance documents, officer certifications, shift records,
                    and incident reports only. Pay rates, payroll data, invoices, and all financial information are
                    completely invisible to auditors — enforced at the API level, not just the UI.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Violation Records Notice */}
            <Card className="border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale size={16} className="text-[#ffc83c]" />
                  Regulatory Violation Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Any time a manager manually overrides a hard-block (expired license, missing guard card, etc.),
                  a WORM-locked violation record is created automatically. These records are permanently visible
                  to regulatory auditors and cannot be deleted or altered. The org owner is notified immediately
                  by email and in-platform notification when any violation is recorded.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  data-testid="button-view-violations"
                  onClick={() => setLocation("/security-compliance")}
                >
                  <Scale size={14} className="mr-2" />
                  View Violation Records
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-20">
            <AlertTriangle size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Failed to load readiness data. Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>Retry</Button>
          </div>
        )}
      </div>
    </div>
  );
}
