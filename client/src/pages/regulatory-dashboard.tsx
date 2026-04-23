import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  Building2,
  FileText,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Upload,
  Download,
  Scale,
  Truck,
  Shirt,
  BookOpen,
  Activity,
  FileSearch,
  MapPin,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  Home,
  Calendar,
  Award,
  ClipboardList,
} from "lucide-react";

function exportToCsv(rows: string[][], filename: string) {
  const csvContent = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useDashboardFetch<T>(section: string, workspaceId: string, token: string) {
  return useQuery<{ success: boolean; data: T }>({
    queryKey: [`/api/compliance/regulatory-portal/dashboard/${workspaceId}/${section}`, token],
    queryFn: async () => {
      const res = await fetch(`/api/compliance/regulatory-portal/dashboard/${workspaceId}/${section}`, {
        headers: { "x-auditor-portal-token": token },
      });
      return res.json();
    },
    enabled: !!token && !!workspaceId,
    retry: false,
  });
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-green-900/40 text-green-400 border-green-800" :
    score >= 70 ? "bg-blue-900/40 text-blue-400 border-blue-800" :
    score >= 50 ? "bg-amber-900/40 text-amber-400 border-amber-800" :
    "bg-red-900/40 text-red-400 border-red-800";
  return <Badge variant="outline" className={color}>{score}/100</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    compliant: { label: "Compliant", className: "bg-green-900/40 text-green-400 border-green-800" },
    pending_review: { label: "Pending Review", className: "bg-amber-900/40 text-amber-400 border-amber-800" },
    missing: { label: "Missing", className: "bg-red-900/40 text-red-400 border-red-800" },
    active: { label: "Active", className: "bg-green-900/40 text-green-400 border-green-800" },
    expired: { label: "Expired", className: "bg-red-900/40 text-red-400 border-red-800" },
  };
  const entry = map[status] ?? { label: status, className: "bg-slate-700 text-slate-300 border-slate-600" };
  return <Badge variant="outline" className={entry.className}>{entry.label}</Badge>;
}

function SectionCard({ title, icon: Icon, children, isLoading }: {
  title: string;
  icon: any;
  children: React.ReactNode;
  isLoading?: boolean;
}) {
  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="flex flex-row items-center gap-2 pb-3 flex-wrap">
        <Icon size={18} className="text-[#ffc83c] flex-shrink-0" />
        <CardTitle className="text-white text-base">{title}</CardTitle>
        {isLoading && <Badge variant="outline" className="text-slate-400 border-slate-600 ml-auto">Syncing records</Badge>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DocStatusPill({ label, onFile, fileUrl }: { label: string; onFile: boolean; fileUrl?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        {onFile ? (
          <>
            <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-800 text-xs">On File</Badge>
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="h-5 text-[10px] border-slate-600 text-slate-300 px-1.5">View</Button>
              </a>
            )}
          </>
        ) : (
          <Badge variant="outline" className="bg-red-900/30 text-red-400 border-red-800 text-xs">Missing</Badge>
        )}
      </div>
    </div>
  );
}

function OfficerCard({ officer, expanded, onToggle }: { officer: any; expanded: boolean; onToggle: () => void }) {
  const score = officer.complianceScore;
  const isBlocked = score?.isHardBlocked;
  const scoreTier = score?.tier?.replace(/_/g, " ") ?? "unknown";
  const licenseStatus = score?.breakdown?.licenseStatus ?? "unknown";

  const i9Doc = officer.documents?.find((d: any) => d.documentType === 'i9');
  const w4Doc = officer.documents?.find((d: any) => d.documentType === 'w4' || d.documentType === 'w_4');
  const w9Doc = officer.documents?.find((d: any) => d.documentType === 'w9' || d.documentType === 'w_9');
  const drugFreeDoc = officer.documents?.find((d: any) => d.documentType?.includes('drug'));
  const bgCheckDoc = officer.documents?.find((d: any) => d.documentType?.includes('background'));
  const applicationDoc = officer.documents?.find((d: any) => d.documentType?.includes('application'));
  const guardCardDoc = officer.documents?.find((d: any) => d.documentType?.includes('guard_card') || d.documentType?.includes('license'));

  const isContractor = officer.workerType === 'contractor' || officer.is1099Eligible;

  return (
    <div data-testid={`card-officer-${officer.id}`} className="rounded-md border border-slate-700 overflow-hidden mb-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800 hover-elevate text-left"
        data-testid={`button-expand-officer-${officer.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <User size={16} className={isBlocked ? "text-red-400" : "text-[#ffc83c]"} />
          <div className="min-w-0">
            <p className="text-white font-medium text-sm">{officer.firstName} {officer.lastName}</p>
            <p className="text-slate-400 text-xs">{officer.role ?? officer.position ?? "Officer"} · {isContractor ? "1099 Contractor" : "W-2 Employee"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {score ? <ScoreBadge score={score.totalScore} /> : null}
          {isBlocked ? (
            <Badge variant="outline" className="bg-red-900/40 text-red-400 border-red-800 text-xs">
              <XCircle size={10} className="mr-1" />Hard Blocked
            </Badge>
          ) : (
            <Badge variant="outline" className={
              licenseStatus === "active"
                ? "bg-green-900/30 text-green-400 border-green-800 text-xs"
                : licenseStatus === "expiring_soon"
                ? "bg-amber-900/30 text-amber-400 border-amber-800 text-xs"
                : "bg-red-900/30 text-red-400 border-red-800 text-xs"
            }>
              License: {licenseStatus.replace(/_/g, " ")}
            </Badge>
          )}
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="bg-slate-900 px-4 py-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Column 1: Personal & Contact */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <User size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Personal & Contact</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Full Name", value: `${officer.firstName} ${officer.lastName}` },
                  { label: "Date of Birth", value: officer.dateOfBirth ? new Date(officer.dateOfBirth).toLocaleDateString() : "Not on file" },
                  { label: "Place of Birth", value: officer.placeOfBirth ?? "Not on file" },
                  { label: "Phone", value: officer.phone ?? "Not on file" },
                  { label: "Email", value: officer.email ?? "Not on file" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</p>
                    <p className="text-white text-xs mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Home size={13} className="text-[#ffc83c]" />
                  <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Address</p>
                </div>
                <p className="text-white text-xs">
                  {officer.address ?? "—"}
                  {officer.addressLine2 ? `, ${officer.addressLine2}` : ""}
                </p>
                <p className="text-white text-xs">
                  {[officer.city, officer.state, officer.zipCode].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Phone size={13} className="text-[#ffc83c]" />
                  <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Emergency Contact</p>
                </div>
                <p className="text-white text-xs">{officer.emergencyContactName ?? "Not on file"}</p>
                <p className="text-slate-400 text-xs">{officer.emergencyContactPhone ?? ""}{officer.emergencyContactRelation ? ` · ${officer.emergencyContactRelation}` : ""}</p>
              </div>
            </div>

            {/* Column 2: Employment & Licensing */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Calendar size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Employment</p>
              </div>
              <div className="space-y-2 mb-4">
                {[
                  { label: "Hire Date", value: officer.hireDate ? new Date(officer.hireDate).toLocaleDateString() : "Not on file" },
                  { label: "Position", value: officer.role ?? officer.position ?? "—" },
                  { label: "Worker Type", value: isContractor ? "1099 Contractor" : "W-2 Employee" },
                  { label: "Armed Officer", value: officer.isArmed ? "Yes" : "No" },
                  { label: "Onboarding", value: officer.onboardingStatus?.replace(/_/g, " ") ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</p>
                    <p className="text-white text-xs mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Guard Card / License</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">Guard Card Verified</span>
                  {officer.guardCardVerified ? (
                    <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-800 text-xs">Verified</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-900/30 text-red-400 border-red-800 text-xs">Not Verified</Badge>
                  )}
                </div>
                {officer.isArmed && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs">Armed License Verified</span>
                    {officer.armedLicenseVerified ? (
                      <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-800 text-xs">Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-900/30 text-red-400 border-red-800 text-xs">Not Verified</Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">License Status</span>
                  <Badge variant="outline" className={
                    licenseStatus === "active" ? "bg-green-900/30 text-green-400 border-green-800 text-xs" :
                    licenseStatus === "expiring_soon" ? "bg-amber-900/30 text-amber-400 border-amber-800 text-xs" :
                    "bg-red-900/30 text-red-400 border-red-800 text-xs"
                  }>{licenseStatus.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            </div>

            {/* Column 3: Documents */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <ClipboardList size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Required Documents</p>
              </div>
              <div>
                <DocStatusPill label="Guard Card / License" onFile={!!guardCardDoc || officer.guardCardVerified} fileUrl={guardCardDoc?.fileUrl} />
                <DocStatusPill label="Employee Application" onFile={!!applicationDoc} fileUrl={applicationDoc?.fileUrl} />
                <DocStatusPill label="Background Check Auth" onFile={!!bgCheckDoc} fileUrl={bgCheckDoc?.fileUrl} />
                <DocStatusPill label="Drug-Free Acknowledgment" onFile={!!drugFreeDoc} fileUrl={drugFreeDoc?.fileUrl} />
                <DocStatusPill label="I-9 Employment Eligibility" onFile={!!i9Doc} fileUrl={i9Doc?.fileUrl} />
                {isContractor ? (
                  <DocStatusPill label="W-9 (Contractor)" onFile={!!w9Doc} fileUrl={w9Doc?.fileUrl} />
                ) : (
                  <DocStatusPill label="W-4 (Employee)" onFile={!!w4Doc} fileUrl={w4Doc?.fileUrl} />
                )}
              </div>
            </div>
          </div>

          {/* Compliance Score Breakdown */}
          {score && (
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center gap-1.5 mb-3">
                <Award size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Compliance Score Breakdown</p>
                <ScoreBadge score={score.totalScore} />
                <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs capitalize ml-1">{scoreTier}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: "License", pts: score.breakdown?.licenseScore ?? 0, max: 40 },
                  { label: "Onboarding", pts: score.breakdown?.onboardingScore ?? 0, max: 20 },
                  { label: "Post Orders", pts: score.breakdown?.postOrdersScore ?? 0, max: 15 },
                  { label: "Discipline", pts: score.breakdown?.disciplineScore ?? 0, max: 15 },
                  { label: "GPS", pts: score.breakdown?.gpsScore ?? 0, max: 10 },
                ].map(({ label, pts, max }) => (
                  <div key={label} className="bg-slate-800 rounded-md p-2 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-white font-bold text-sm">{pts}</p>
                    <p className="text-slate-500 text-[10px]">/ {max}</p>
                  </div>
                ))}
              </div>
              {score.isHardBlocked && score.hardBlockReasons?.length > 0 && (
                <div className="mt-2 p-2 rounded-md bg-red-900/20 border border-red-800">
                  {score.hardBlockReasons.map((r: string, i: number) => (
                    <p key={i} className="text-red-300 text-xs flex items-center gap-1">
                      <XCircle size={10} />{r}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Certifications */}
          {officer.certifications?.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center gap-1.5 mb-3">
                <Award size={13} className="text-[#ffc83c]" />
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Training & Certifications</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {officer.certifications.map((cert: any) => (
                  <div key={cert.id} className="bg-slate-800 rounded-md px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white text-xs font-medium">{cert.certificationName ?? cert.trainingType?.replace(/_/g, " ")}</p>
                      <p className="text-slate-500 text-[10px]">
                        {cert.issuedAt ? `Issued: ${new Date(cert.issuedAt).toLocaleDateString()}` : ""}
                        {cert.expiresAt ? ` · Exp: ${new Date(cert.expiresAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      cert.status === 'active' ? "bg-green-900/30 text-green-400 border-green-800 text-xs" :
                      "bg-amber-900/30 text-amber-400 border-amber-800 text-xs"
                    }>{cert.status ?? "active"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RegulatoryDashboard() {
  const [token, setToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [expandedOfficers, setExpandedOfficers] = useState<Set<string>>(new Set());
  const [officerSearch, setOfficerSearch] = useState("");
  const [auditOutcome, setAuditOutcome] = useState("");
  const [auditReportUrl, setAuditReportUrl] = useState("");
  const [auditFindings, setAuditFindings] = useState("");
  const [auditSubmitted, setAuditSubmitted] = useState(false);

  const toggleOfficer = (id: string) => {
    setExpandedOfficers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const overviewQuery = useDashboardFetch<any>("overview", workspaceId, isAuthenticated ? token : "");
  const officersQuery = useDashboardFetch<any>("officers", workspaceId, isAuthenticated ? token : "");
  const violationsQuery = useDashboardFetch<any>("violations", workspaceId, isAuthenticated ? token : "");
  const insuranceQuery = useDashboardFetch<any>("insurance", workspaceId, isAuthenticated ? token : "");
  const postingQuery = useDashboardFetch<any>("posting", workspaceId, isAuthenticated ? token : "");
  const uniformQuery = useDashboardFetch<any>("uniform", workspaceId, isAuthenticated ? token : "");
  const vehiclesQuery = useDashboardFetch<any>("vehicles", workspaceId, isAuthenticated ? token : "");
  const shiftsQuery = useDashboardFetch<any>("shifts", workspaceId, isAuthenticated ? token : "");
  const incidentsQuery = useDashboardFetch<any>("incidents", workspaceId, isAuthenticated ? token : "");
  const documentsQuery = useDashboardFetch<any>("documents", workspaceId, isAuthenticated ? token : "");

  const auditReportMutation = useMutation({
    mutationFn: async (payload: { reportUrl: string; auditOutcome: string; findings: string }) => {
      const res = await fetch(`/api/compliance/regulatory-portal/dashboard/${workspaceId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auditor-portal-token": token },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Server error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => setAuditSubmitted(true),
    onError: () => setAuditSubmitted(false),
  });

  const handleAuthenticate = () => {
    if (!token || !workspaceId) {
      setAuthError("Both portal token and organization ID are required.");
      return;
    }
    if (overviewQuery.isError || (overviewQuery.data && !overviewQuery.data.success)) {
      setAuthError("Invalid or expired token. Please check your credentials.");
      return;
    }
    setAuthError("");
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col">
        <div className="border-b border-slate-800 bg-[#0f172a]">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
            <Shield className="text-[#ffc83c]" size={28} />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Regulatory Compliance Dashboard</h1>
              <p className="text-slate-400 text-xs">Authorized Auditor Access</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Lock size={18} className="text-[#ffc83c]" />
                Enter Audit Credentials
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enter the portal token sent to your government email and the organization ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Organization ID</Label>
                <Input
                  data-testid="input-workspace-id"
                  placeholder="Organization workspace ID"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Auditor Portal Token</Label>
                <Input
                  data-testid="input-portal-token"
                  placeholder="Paste your portal token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              {authError && (
                <p className="text-red-400 text-sm">{authError}</p>
              )}
              <Button
                data-testid="button-authenticate"
                onClick={handleAuthenticate}
                className="w-full bg-[#ffc83c] hover:bg-[#ffc83c]/90 text-[#0f172a] font-semibold"
              >
                Access Audit Dashboard
              </Button>
              <p className="text-xs text-slate-500 text-center">
                Token received via your government email. All access is logged and WORM-recorded.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const overview = overviewQuery.data?.data;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <div className="border-b border-slate-800 bg-[#0f172a]/95 sticky top-0 z-[1020]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Shield className="text-[#ffc83c]" size={24} />
            <div>
              <h1 className="text-white font-bold text-base leading-tight">
                {overview?.legalName ?? "Organization"} — Compliance Audit
              </h1>
              <p className="text-slate-400 text-xs">
                License: {overview?.stateLicenseNumber ?? "—"} · State: {overview?.stateLicenseState ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {overview && <ScoreBadge score={overview.auditReadinessScore} />}
            <Badge variant="outline" className="text-amber-300 border-amber-700 bg-amber-900/20 text-xs">
              Official Audit Session
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-28 sm:pb-10">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-slate-800 border border-slate-700 flex-wrap h-auto gap-1 p-1">
            {[
              { value: "overview", label: "Overview", icon: Building2 },
              { value: "officers", label: "Officers", icon: Users },
              { value: "violations", label: "Violations", icon: Scale },
              { value: "insurance", label: "Insurance", icon: Shield },
              { value: "posting", label: "Labor Posting", icon: BookOpen },
              { value: "uniform", label: "Uniforms", icon: Shirt },
              { value: "vehicles", label: "Vehicles", icon: Truck },
              { value: "shifts", label: "Shifts", icon: Clock },
              { value: "incidents", label: "Incidents", icon: Activity },
              { value: "documents", label: "Documents", icon: FileText },
              { value: "audit-report", label: "Audit Report", icon: Upload },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700 text-xs flex items-center gap-1">
                <Icon size={12} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Section 1 — Overview */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Active Officers", value: overview?.officerBreakdown?.total ?? "—", icon: Users },
                { label: "Active Clients", value: overview?.activeClients ?? "—", icon: Building2 },
                { label: "Active Sites", value: overview?.activeSites ?? "—", icon: MapPin },
                { label: "Audit Readiness", value: overview ? `${overview.auditReadinessScore}%` : "—", icon: CheckCircle2 },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="bg-slate-800 border-slate-700">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <Icon size={20} className="text-[#ffc83c]" />
                    <div>
                      <p className="text-2xl font-bold text-white">{value}</p>
                      <p className="text-slate-400 text-xs">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <SectionCard title="Company License Information" icon={Building2} isLoading={overviewQuery.isLoading}>
              {overview ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Legal Name", value: overview.legalName },
                    { label: "State License Number", value: overview.stateLicenseNumber },
                    { label: "License State", value: overview.stateLicenseState },
                    { label: "License Expiry", value: overview.stateLicenseExpiry ? new Date(overview.stateLicenseExpiry).toLocaleDateString() : "Not on file" },
                    { label: "Active Clients", value: overview.activeClients },
                    { label: "Active Sites", value: overview.activeSites },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
                      <p className="text-white text-sm font-medium mt-0.5">{String(value ?? "—")}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading company license data, entity details, and audit readiness context...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 6 — Officer Roster (full personal detail, expandable) */}
          <TabsContent value="officers">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-white font-semibold">Full Officer Roster</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {officersQuery.data?.data?.total ?? "..."} active officers · Click any row to expand full personal and compliance details
                  </p>
                </div>
                <Input
                  data-testid="input-officer-search"
                  placeholder="Search officers..."
                  value={officerSearch}
                  onChange={(e) => setOfficerSearch(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 w-48 h-8 text-xs"
                />
              </div>

              {officersQuery.isLoading ? (
                <p className="text-slate-400 text-sm py-6 text-center">Loading officer roster, license status, and hard-block compliance signals...</p>
              ) : officersQuery.data?.data?.officers?.length === 0 ? (
                <div className="text-center py-10">
                  <Users size={32} className="text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500">No active officers are on file for this audit view yet.</p>
                </div>
              ) : (
                <>
                  {/* Hard-blocked officers shown first with a callout */}
                  {officersQuery.data?.data?.officers?.filter((o: any) => o.complianceScore?.isHardBlocked).length > 0 && (
                    <div className="p-3 rounded-md bg-red-900/20 border border-red-800 mb-2">
                      <div className="flex items-center gap-2">
                        <XCircle size={14} className="text-red-400" />
                        <p className="text-red-300 text-xs font-medium">
                          {officersQuery?.data?.data?.officers.filter((o: any) => (o as any).complianceScore?.isHardBlocked).length} officer(s) have active hard blocks (expired license or missing qualification).
                          These officers cannot be legally assigned to shifts.
                        </p>
                      </div>
                    </div>
                  )}
                  {officersQuery.data?.data?.officers
                    ?.filter((o: any) => {
                      const q = officerSearch.toLowerCase();
                      if (!q) return true;
                      return `${o.firstName} ${o.lastName}`.toLowerCase().includes(q)
                        || (o.role ?? o.position ?? "").toLowerCase().includes(q);
                    })
                    .map((officer: any) => (
                      <OfficerCard
                        key={officer.id}
                        officer={officer}
                        expanded={expandedOfficers.has(officer.id)}
                        onToggle={() => toggleOfficer(officer.id)}
                      />
                    ))}
                </>
              )}
            </div>
          </TabsContent>

          {/* Section 7 — Violations (WORM) */}
          <TabsContent value="violations">
            <SectionCard title="Regulatory Violation Records (WORM-Locked)" icon={Scale} isLoading={violationsQuery.isLoading}>
              <div className="mb-4 p-3 rounded-md bg-amber-900/20 border border-amber-800">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-amber-400" />
                  <p className="text-amber-300 text-xs font-medium">
                    These records are WORM-locked. They cannot be edited, altered, or deleted by anyone,
                    including platform staff. Every hard-block override is permanently recorded here.
                  </p>
                </div>
              </div>
              {violationsQuery.data?.data?.violations ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Date</TableHead>
                      <TableHead className="text-slate-400">Violation Type</TableHead>
                      <TableHead className="text-slate-400">Officer ID</TableHead>
                      <TableHead className="text-slate-400">State</TableHead>
                      <TableHead className="text-slate-400">Regulatory Reference</TableHead>
                      <TableHead className="text-slate-400">Owner Notified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {violationsQuery.data.data.violations.map((v: any) => (
                      <TableRow key={v.id} data-testid={`row-violation-${v.id}`} className="border-slate-700">
                        <TableCell className="text-slate-300 text-sm">{new Date(v.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-red-900/40 text-red-400 border-red-800 text-xs">
                            {v.violationType?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-400 font-mono text-xs">{v.officerId?.slice(0, 8)}...</TableCell>
                        <TableCell className="text-slate-300">{v.stateCode ?? "—"}</TableCell>
                        <TableCell className="text-slate-400 text-xs max-w-48 truncate" title={v.regulatoryReference}>
                          {v.regulatoryReference}
                        </TableCell>
                        <TableCell>
                          {v.ownerNotifiedAt ? (
                            <Badge variant="outline" className="bg-green-900/40 text-green-400 border-green-800 text-xs">
                              <CheckCircle2 size={10} className="mr-1" />
                              {new Date(v.ownerNotifiedAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-slate-400 text-sm">Loading WORM-locked violation history and owner notification status...</p>
              )}
              {violationsQuery.data?.data?.violations?.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                  <p className="text-green-400 font-medium">No regulatory violations on record</p>
                </div>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 2 — Insurance */}
          <TabsContent value="insurance">
            <SectionCard title="Insurance Documentation" icon={Shield} isLoading={insuranceQuery.isLoading}>
              {insuranceQuery.data?.data ? (
                <div className="space-y-4">
                  {insuranceQuery.data.data.stateMinimumCoverage?.length > 0 && (
                    <div className="p-3 rounded-md bg-slate-800 border border-slate-700">
                      <p className="text-slate-300 text-sm font-medium mb-2">State Minimum Coverage Requirements</p>
                      <div className="space-y-1">
                        {insuranceQuery.data.data.stateMinimumCoverage.map((req: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-slate-400">{req.type?.replace(/_/g, " ")}</span>
                            <span className="text-white font-medium">${req.minimumAmount?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {insuranceQuery.data.data.insuranceDocuments?.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700">
                          <TableHead className="text-slate-400">Document</TableHead>
                          <TableHead className="text-slate-400">Status</TableHead>
                          <TableHead className="text-slate-400">Uploaded</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {insuranceQuery.data.data.insuranceDocuments.map((doc: any) => (
                          <TableRow key={doc.id} className="border-slate-700">
                            <TableCell className="text-white text-sm">{doc.documentTitle ?? doc.documentType?.replace(/_/g, " ")}</TableCell>
                            <TableCell><StatusBadge status={doc.status} /></TableCell>
                            <TableCell className="text-slate-400 text-sm">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-6">
                      <AlertTriangle size={28} className="text-amber-400 mx-auto mb-2" />
                      <p className="text-amber-300 text-sm font-medium">No insurance documents on file</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading insurance certificates, coverage requirements, and compliance evidence...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 3 — Labor Law Posting */}
          <TabsContent value="posting">
            <SectionCard title="Labor Law Poster Compliance" icon={BookOpen} isLoading={postingQuery.isLoading}>
              {postingQuery.data?.data ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">Compliance Status:</span>
                    <StatusBadge status={postingQuery.data.data.status} />
                  </div>
                  {postingQuery.data.data.document && (
                    <div className="p-3 rounded-md bg-slate-800 border border-slate-700">
                      <p className="text-slate-400 text-xs">Photo uploaded: {postingQuery.data.data.uploadedAt ? new Date(postingQuery.data.data.uploadedAt).toLocaleDateString() : "—"}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-300 text-sm font-medium mb-2">Required Federal Posters</p>
                    <div className="space-y-1">
                      {postingQuery.data.data.requiredPosters?.map((poster: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 size={14} className="text-slate-500" />
                          <span className="text-slate-400">{poster}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading labor posting records and federal notice coverage...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 4 — Uniforms */}
          <TabsContent value="uniform">
            <SectionCard title="Uniform Compliance" icon={Shirt} isLoading={uniformQuery.isLoading}>
              {uniformQuery.data?.data ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">Status:</span>
                    <StatusBadge status={uniformQuery.data.data.status} />
                  </div>
                  <div className="p-3 rounded-md bg-slate-800 border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">State Requirement</p>
                    <p className="text-white text-sm">{uniformQuery.data.data.stateRequirement}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading uniform policy requirements and inspection evidence...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 5 — Vehicles */}
          <TabsContent value="vehicles">
            <SectionCard title="Patrol Vehicle Compliance" icon={Truck} isLoading={vehiclesQuery.isLoading}>
              {vehiclesQuery.data?.data ? (
                <div className="space-y-4">
                  {vehiclesQuery.data.data.notApplicable ? (
                    <div className="p-3 rounded-md bg-slate-800 border border-slate-700">
                      <p className="text-slate-300 text-sm">Organization has indicated patrol vehicles are not applicable to their operations.</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-md bg-slate-800 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">State Requirement</p>
                        <p className="text-white text-sm">{vehiclesQuery.data.data.stateRequirement}</p>
                      </div>
                      {vehiclesQuery.data.data.vehiclePhotos?.length > 0 ? (
                        <p className="text-green-400 text-sm">{vehiclesQuery.data.data.vehiclePhotos.length} vehicle photo(s) on file</p>
                      ) : (
                        <div className="text-center py-6">
                          <AlertTriangle size={28} className="text-amber-400 mx-auto mb-2" />
                          <p className="text-amber-300 text-sm">No vehicle compliance photos on file</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading patrol vehicle requirements, photos, and supporting documentation...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 8 — Shifts */}
          <TabsContent value="shifts">
            <SectionCard title="Shift & Assignment Records" icon={Clock} isLoading={shiftsQuery.isLoading}>
              {shiftsQuery.data?.data?.shifts ? (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="button-export-shifts-csv"
                      className="border-slate-600 text-slate-300 gap-1"
                      onClick={() => {
                        const shifts = shiftsQuery.data?.data?.shifts ?? [];
                        const header = ["Date", "Officer", "Site", "Client", "Hours", "GPS Status", "Status"];
                        const rows = shifts.slice(0, 100).map((s: any) => [
                          s.start_time ? new Date(s.start_time).toLocaleDateString() : "",
                          s.officer_name ?? "",
                          s.site_name ?? "",
                          s.client_name ?? "",
                          s.total_hours ? String(s.total_hours) : "",
                          s.gps_status ?? "",
                          s.status ?? "",
                        ]);
                        exportToCsv([header, ...rows], `shifts-audit-${new Date().toISOString().split("T")[0]}.csv`);
                      }}
                    >
                      <Download size={14} />
                      Export CSV
                    </Button>
                  </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Officer</TableHead>
                        <TableHead className="text-slate-400">Site</TableHead>
                        <TableHead className="text-slate-400">Client</TableHead>
                        <TableHead className="text-slate-400">Hours</TableHead>
                        <TableHead className="text-slate-400">Gps</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(shiftsQuery.data.data.shifts.slice(0, 100)).map((shift: any, i: number) => (
                        <TableRow key={shift.id ?? i} data-testid={`row-shift-${shift.id ?? i}`} className="border-slate-700">
                          <TableCell className="text-slate-300 text-sm">{shift.start_time ? new Date(shift.start_time).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-white text-sm">{shift.officer_name ?? "—"}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{shift.site_name ?? "—"}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{shift.client_name ?? "—"}</TableCell>
                          <TableCell className="text-slate-300 text-sm">{shift.total_hours ? `${shift.total_hours}h` : "—"}</TableCell>
                          <TableCell>
                            {shift.gps_status === "verified" ? (
                              <Badge variant="outline" className="bg-green-900/40 text-green-400 border-green-800 text-xs">Verified</Badge>
                            ) : shift.gps_status ? (
                              <Badge variant="outline" className="bg-amber-900/40 text-amber-400 border-amber-800 text-xs">{shift.gps_status}</Badge>
                            ) : <span className="text-slate-600">—</span>}
                          </TableCell>
                          <TableCell><StatusBadge status={shift.status ?? "unknown"} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Loading shift assignments, GPS verification, and staffing records...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 9 — Incidents */}
          <TabsContent value="incidents">
            <SectionCard title="Incident Reports" icon={Activity} isLoading={incidentsQuery.isLoading}>
              {incidentsQuery.data?.data?.incidents ? (
                incidentsQuery.data.data.incidents.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="button-export-incidents-csv"
                        className="border-slate-600 text-slate-300 gap-1"
                        onClick={() => {
                          const incidents = incidentsQuery.data?.data?.incidents ?? [];
                          const header = ["Date", "Title", "Type", "Status"];
                          const rows = incidents.map((inc: any) => [
                            inc.reportedAt ? new Date(inc.reportedAt).toLocaleDateString() : "",
                            inc.title ?? "Untitled",
                            inc.incidentType?.replace(/_/g, " ") ?? "",
                            inc.status ?? "",
                          ]);
                          exportToCsv([header, ...rows], `incidents-audit-${new Date().toISOString().split("T")[0]}.csv`);
                        }}
                      >
                        <Download size={14} />
                        Export CSV
                      </Button>
                    </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Title</TableHead>
                        <TableHead className="text-slate-400">Type</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incidentsQuery.data.data.incidents.map((inc: any) => (
                        <TableRow key={inc.id} data-testid={`row-incident-${inc.id}`} className="border-slate-700">
                          <TableCell className="text-slate-300 text-sm">{inc.reportedAt ? new Date(inc.reportedAt).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-white text-sm">{inc.title ?? "Untitled"}</TableCell>
                          <TableCell className="text-slate-400 text-sm capitalize">{inc.incidentType?.replace(/_/g, " ") ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={inc.status ?? "unknown"} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                    <p className="text-green-400 font-medium">No incident reports on file</p>
                  </div>
                )
              ) : (
                <p className="text-slate-400 text-sm">Loading incident history and report status for this audit session...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 10 — Documents */}
          <TabsContent value="documents">
            <SectionCard title="Compliance Document Safe" icon={FileText} isLoading={documentsQuery.isLoading}>
              <div className="mb-3 p-3 rounded-md bg-slate-800 border border-slate-700">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-[#ffc83c]" />
                  <p className="text-slate-400 text-xs">
                    Financial records, payroll, invoice data, and pay rates are excluded from auditor access and do not appear here.
                  </p>
                </div>
              </div>
              {documentsQuery.data?.data?.documents ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Document</TableHead>
                      <TableHead className="text-slate-400">Type</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Expires</TableHead>
                      <TableHead className="text-slate-400">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentsQuery.data.data.documents.map((doc: any) => (
                      <TableRow key={doc.id} data-testid={`row-doc-${doc.id}`} className="border-slate-700">
                        <TableCell className="text-white text-sm">{doc.documentTitle ?? doc.documentType?.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-slate-400 text-xs capitalize">{doc.documentType?.replace(/_/g, " ")}</TableCell>
                        <TableCell><StatusBadge status={doc.status} /></TableCell>
                        <TableCell className="text-slate-400 text-sm">{doc.expirationDate ? new Date(doc.expirationDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          {doc.fileUrl ? (
                            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 h-7 text-xs" asChild>
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                <FileSearch size={12} className="mr-1" />View
                              </a>
                            </Button>
                          ) : <span className="text-slate-600 text-xs">No file</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-slate-400 text-sm">Loading auditor-safe compliance documents and allowed evidence files...</p>
              )}
            </SectionCard>
          </TabsContent>

          {/* Section 11 — Audit Report Upload */}
          <TabsContent value="audit-report">
            <SectionCard title="Section 11 — Audit Report & Findings Upload" icon={Upload}>
              <div className="mb-4 p-3 rounded-md bg-slate-800 border border-slate-700">
                <div className="flex items-start gap-2">
                  <FileSearch size={14} className="text-[#ffc83c] mt-0.5 flex-shrink-0" />
                  <p className="text-slate-300 text-xs">
                    After completing your compliance review, upload your official audit report here.
                    Trinity will read the report, extract findings, and generate a corrective action plan for the organization owner.
                    Your report will be permanently saved to this organization's regulatory compliance record.
                  </p>
                </div>
              </div>

              {auditSubmitted ? (
                <div className="text-center py-10">
                  <CheckCircle2 size={40} className="text-green-400 mx-auto mb-3" />
                  <p className="text-green-400 font-semibold text-lg">Audit Report Submitted</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Trinity has been notified and will generate a corrective action plan for the organization owner.
                    The report has been permanently saved to this organization's regulatory compliance record.
                  </p>
                </div>
              ) : (
                <div className="space-y-5 max-w-2xl">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Overall Compliance Determination</Label>
                    <Select value={auditOutcome} onValueChange={setAuditOutcome}>
                      <SelectTrigger
                        data-testid="select-audit-outcome"
                        className="bg-slate-800 border-slate-600 text-white"
                      >
                        <SelectValue placeholder="Select audit outcome..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="compliant" className="text-green-400">Compliant</SelectItem>
                        <SelectItem value="conditional" className="text-amber-400">Conditional Compliance</SelectItem>
                        <SelectItem value="non_compliant" className="text-red-400">Non-Compliant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Official Audit Report URL</Label>
                    <Input
                      data-testid="input-audit-report-url"
                      placeholder="https://agency.state.gov/audit-reports/..."
                      value={auditReportUrl}
                      onChange={(e) => setAuditReportUrl(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <p className="text-slate-500 text-xs">Link to the official audit report PDF hosted on your agency's secure server.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Key Findings & Violations Noted</Label>
                    <Textarea
                      data-testid="textarea-audit-findings"
                      placeholder="Summarize the key findings, violations noted, corrective actions required, and any license suspension or revocation actions initiated..."
                      value={auditFindings}
                      onChange={(e) => setAuditFindings(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-32 resize-none"
                    />
                  </div>

                  {auditReportMutation.isError && (
                    <div className="p-3 rounded-md bg-red-900/20 border border-red-800">
                      <p className="text-red-300 text-xs">Failed to submit audit report. Please try again.</p>
                    </div>
                  )}

                  <Button
                    data-testid="button-submit-audit-report"
                    onClick={() => auditReportMutation.mutate({
                      reportUrl: auditReportUrl,
                      auditOutcome,
                      findings: auditFindings,
                    })}
                    disabled={!auditOutcome || auditReportMutation.isPending}
                    className="bg-[#ffc83c] text-[#0f172a] font-semibold w-full"
                  >
                    {auditReportMutation.isPending ? "Submitting..." : "Submit Official Audit Report"}
                  </Button>

                  <div className="p-3 rounded-md bg-amber-900/20 border border-amber-800">
                    <div className="flex items-start gap-2">
                      <Lock size={13} className="text-amber-400 mt-0.5" />
                      <p className="text-amber-300 text-xs">
                        This submission is permanent and WORM-recorded. Trinity will notify the organization owner,
                        generate a corrective action plan, and track completion of required remediation steps.
                        Your auditor account will auto-deactivate at the end of the 14-day audit period.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
