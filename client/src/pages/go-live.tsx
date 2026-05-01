import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle,
  Circle,
  AlertCircle,
  Upload,
  Users,
  Building2,
  Shield,
  Zap,
  BarChart3,
  Settings,
  CalendarDays,
  ArrowRight,
  FileText,
  RefreshCw,
  MapPin,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface WorkspaceStats {
  employeeCount: number;
  clientCount: number;
  activeShifts: number;
  timeEntryCount: number;
  invoiceCount: number;
  deliveredInvoiceCount: number;
}

interface ImportResult {
  success: boolean;
  imported?: number;
  skippedDuplicates?: number;
  skippedInvalid?: number;
  totalRows?: number;
  errors?: string[];
  invalidRows?: Array<{ rowNumber: number; errors: string[]; firstName: string; lastName: string }>;
  validRows?: number;
  invalid?: number;
  sample?: Record<string, string>[];
  preview?: boolean;
}

// ============================================================================
// LOCAL STORAGE — MANUAL STEP TRACKING
// ============================================================================

const MANUAL_STEPS_KEY = "statewide_golive_manual_steps";

function loadManualSteps(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_STEPS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveManualSteps(steps: Record<string, boolean>) {
  localStorage.setItem(MANUAL_STEPS_KEY, JSON.stringify(steps));
}

// ============================================================================
// CSV IMPORT PANEL
// ============================================================================

function CsvImportPanel({
  type,
  workspaceId,
}: {
  type: "employees" | "clients";
  workspaceId: string;
}) {
  const [csvText, setCsvText] = useState("");
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/import/${type}/preview`, { csvContent: csvText });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      setImportResult(null);
    },
    onError: (e) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/import/${type}`, { csvContent: csvText, workspaceId });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      setPreviewResult(null);
      toast({
        title: data.success ? "Import complete" : "Import finished with errors",
        description: `${data.imported ?? 0} ${type} imported, ${data.skippedDuplicates ?? 0} duplicates skipped`,
      });
    },
    onError: (e) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) || "");
    reader.readAsText(file);
  };

  const label = type === "employees" ? "Employee" : "Client/Site";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          data-testid={`button-upload-${type}-csv`}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload {label} CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        {csvText && (
          <span className="text-sm text-muted-foreground">
            {csvText.split("\n").length - 1} rows loaded
          </span>
        )}
      </div>

      <Textarea
        placeholder={`Paste ${label.toLowerCase()} CSV here, or upload a file above.\n\nRequired columns:\n${
          type === "employees"
            ? "first_name, last_name, email, phone, role, hourly_rate, hire_date"
            : "company_name, first_name, last_name, email, phone, address, city, state, zip, contract_rate"
        }`}
        className="min-h-[140px] font-mono text-xs"
        value={csvText}
        onChange={(e) => { setCsvText(e.target.value); setPreviewResult(null); setImportResult(null); }}
        data-testid={`textarea-${type}-csv`}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => previewMutation.mutate()}
          disabled={!csvText.trim() || previewMutation.isPending}
          data-testid={`button-preview-${type}`}
        >
          {previewMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Preview (dry run)
        </Button>
        <Button
          size="sm"
          onClick={() => importMutation.mutate()}
          disabled={!csvText.trim() || importMutation.isPending || (!previewResult && !importResult)}
          data-testid={`button-import-${type}`}
        >
          {importMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Import {label}s
        </Button>
      </div>

      {previewResult && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-muted-foreground">Total: <strong>{previewResult.totalRows}</strong></span>
            <span className="text-green-600">Valid: <strong>{previewResult.validRows}</strong></span>
            {(previewResult.invalid ?? 0) > 0 && (
              <span className="text-destructive">Invalid: <strong>{previewResult.invalid}</strong></span>
            )}
          </div>
          {previewResult.sample && previewResult.sample.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sample (first 5 valid rows):</p>
              <div className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-32">
                {previewResult.sample.map((row, i) => (
                  <div key={i}>{Object.entries(row).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" | ")}</div>
                ))}
              </div>
            </div>
          )}
          {(previewResult.errors ?? []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-destructive mb-1">Validation errors:</p>
              <div className="text-xs bg-muted rounded p-2 space-y-1 max-h-32 overflow-auto">
                {(previewResult.errors as any[]).slice(0, 10).map((e: any, i: number) => (
                  <div key={i}>Row {e.line}: {e.errors?.join(", ")}</div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Review above then click <strong>Import</strong> to proceed.
          </p>
        </div>
      )}

      {importResult && (
        <div className={['rounded-md border p-3 space-y-2', importResult.success ? "border-green-500/40 bg-green-500/5" : "border-yellow-500/40 bg-yellow-500/5"].join(' ')}>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-green-600 font-medium">Imported: {importResult.imported}</span>
            <span className="text-muted-foreground">Duplicates skipped: {importResult.skippedDuplicates}</span>
            <span className="text-muted-foreground">Invalid skipped: {importResult.skippedInvalid}</span>
          </div>
          {(importResult.errors ?? []).length > 0 && (
            <div className="text-xs text-destructive">
              {importResult.errors?.slice(0, 5).join("\n")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STEP CARD
// ============================================================================

function StepCard({
  stepNumber,
  title,
  description,
  icon: Icon,
  status,
  expanded,
  onToggle,
  children,
  detail,
}: {
  stepNumber: number;
  title: string;
  description: string;
  icon: typeof CheckCircle;
  status: "complete" | "pending" | "warning" | "action";
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  detail?: string;
}) {
  const statusBadge = {
    complete: <Badge variant="secondary" className="text-green-600 bg-green-500/10 text-xs">Done</Badge>,
    action: <Badge className="text-xs">Action needed</Badge>,
    warning: <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10 text-xs">Needs attention</Badge>,
    pending: null,
  }[status];

  const statusIcon = {
    complete: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
    pending: <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />,
    action: <ArrowRight className="w-5 h-5 text-blue-500 flex-shrink-0 animate-pulse" />,
  }[status];

  return (
    <Card className={`transition-all ${status === "complete" ? "opacity-80" : ""}`}>
      <button
        className="w-full text-left"
        onClick={onToggle}
        data-testid={`button-step-${stepNumber}`}
        type="button"
      >
        <CardHeader className="flex flex-row items-center gap-3 justify-between gap-y-2 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold flex-shrink-0">
              {stepNumber}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge}
            {statusIcon}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-4 space-y-3">
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// MANUAL CONFIRM BUTTON
// ============================================================================

function ManualConfirm({
  stepKey,
  label,
  confirmed,
  onToggle,
}: {
  stepKey: string;
  label: string;
  confirmed: boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <Button
      size="sm"
      variant={confirmed ? "secondary" : "outline"}
      onClick={() => onToggle(stepKey, !confirmed)}
      data-testid={`button-confirm-${stepKey}`}
      className={confirmed ? "text-green-600" : ""}
    >
      {confirmed ? (
        <><CheckCircle className="w-4 h-4 mr-2" />Confirmed</>
      ) : (
        <><Circle className="w-4 h-4 mr-2" />{label}</>
      )}
    </Button>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GoLivePage() {
  const [expandedStep, setExpandedStep] = useState<number | null>(3);
  const [manualSteps, setManualSteps] = useState<Record<string, boolean>>(loadManualSteps);

  const workspaceQuery = useQuery<{
    id: string;
    name: string;
    founderExemption: boolean;
    billingExempt: boolean;
    subscriptionTier: string;
    subscriptionStatus: string;
  }>({
    queryKey: ["/api/workspace/current"],
  });

  const statsQuery = useQuery<WorkspaceStats>({
    queryKey: ["/api/workspace/stats"],
    refetchInterval: 15000,
  });

  const workspace = workspaceQuery.data;
  const stats = statsQuery.data;
  const workspaceId = workspace?.id || "";
  const isFounder = !!(workspace?.founderExemption || workspace?.billingExempt);

  const toggleManual = (key: string, value: boolean) => {
    const updated = { ...manualSteps, [key]: value };
    setManualSteps(updated);
    saveManualSteps(updated);
  };

  // 10 steps — exactly matching the Statewide migration execution sequence
  const steps = [
    {
      id: 1,
      title: "Founder Exemption Verified",
      description: "Permanent enterprise access with zero billing charges",
      icon: Shield,
      status: isFounder ? "complete" : (workspaceQuery.isLoading ? "pending" : "warning"),
      detail: isFounder
        ? "founder_exemption=true and billing_exempt=true are confirmed on this workspace. No credits will be deducted. No Stripe charges will ever fire. Invoice generation for your clients is fully available."
        : "Contact CoAIleague to activate founder exemption (billing_exempt=true) on this workspace before going live.",
      content: !isFounder ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          Flags not detected: <code className="text-xs">billing_exempt</code> and <code className="text-xs">founder_exemption</code> are both false.
          This workspace may have charges applied. Confirm with CoAIleague before proceeding.
        </div>
      ) : null,
    },
    {
      id: 2,
      title: "Workspace & Company Setup",
      description: "Name, logo, timezone, and company settings confirmed",
      icon: Settings,
      status: workspace?.name ? "complete" : "action",
      detail: "Verify your company name, business address, timezone, and logo in Workspace Settings. These appear on every invoice, schedule, and pay stub.",
      content: (
        <Button size="sm" variant="outline" asChild>
          <a href="/settings" data-testid="link-settings">
            Open Workspace Settings <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </Button>
      ),
    },
    {
      id: 3,
      title: "Employee CSV Import",
      description: "Preview your CSV first — then execute. Invite emails fire automatically.",
      icon: Users,
      status: (stats?.employeeCount ?? 0) > 0 ? "complete" : "action",
      detail: `${(stats?.employeeCount ?? 0) > 0 ? `${stats!.employeeCount} employees imported.` : "No employees yet."} Run Preview first to validate all rows. Required: first_name, last_name. Recommended: email, phone, role, hourly_rate, hire_date.`,
      content: <CsvImportPanel type="employees" workspaceId={workspaceId} />,
    },
    {
      id: 4,
      title: "Verify Employee Pay Rates",
      description: "Confirm every officer has a pay rate set before running payroll",
      icon: DollarSign,
      status: manualSteps["pay-rates"] ? "complete" : ((stats?.employeeCount ?? 0) === 0 ? "pending" : "action"),
      detail: "Open the employee management page and verify every employee has hourly_rate or salary_rate set. Payroll calculations will be incorrect for any employee missing a pay rate.",
      content: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/employees" data-testid="link-employees">
              Open Employee Management <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <ManualConfirm
            stepKey="pay-rates"
            label="Mark pay rates verified"
            confirmed={!!manualSteps["pay-rates"]}
            onToggle={toggleManual}
          />
        </div>
      ),
    },
    {
      id: 5,
      title: "Client & Site CSV Import",
      description: "Preview your CSV first — then execute",
      icon: Building2,
      status: (stats?.clientCount ?? 0) > 0 ? "complete" : "action",
      detail: `${(stats?.clientCount ?? 0) > 0 ? `${stats!.clientCount} clients imported.` : "No clients yet."} Required: company_name or first_name/last_name. Recommended: address, contract_rate, poc_name, poc_phone, site_name.`,
      content: <CsvImportPanel type="clients" workspaceId={workspaceId} />,
    },
    {
      id: 6,
      title: "Verify Client Billing Rates",
      description: "Confirm every client has a billing rate before generating invoices",
      icon: BarChart3,
      status: manualSteps["billing-rates"] ? "complete" : ((stats?.clientCount ?? 0) === 0 ? "pending" : "action"),
      detail: "Open the client management page and verify every client has a billing rate (hourly or flat). Invoices will be $0 for any client missing a billing rate.",
      content: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/clients" data-testid="link-clients">
              Open Client Management <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <ManualConfirm
            stepKey="billing-rates"
            label="Mark billing rates verified"
            confirmed={!!manualSteps["billing-rates"]}
            onToggle={toggleManual}
          />
        </div>
      ),
    },
    {
      id: 7,
      title: "GPS Geofence Configuration",
      description: "Set GPS coordinates and geofence radius for every job site",
      icon: MapPin,
      status: manualSteps["gps-geofences"] ? "complete" : ((stats?.clientCount ?? 0) === 0 ? "pending" : "action"),
      detail: "GPS clock-in enforcement depends on accurate geofence coordinates per site. Officers clocking in outside the geofence radius will be flagged. Set coordinates in Site Settings for each location.",
      content: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/sites" data-testid="link-sites">
              Open Site Settings <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <ManualConfirm
            stepKey="gps-geofences"
            label="Mark geofences configured"
            confirmed={!!manualSteps["gps-geofences"]}
            onToggle={toggleManual}
          />
        </div>
      ),
    },
    {
      id: 8,
      title: "First Schedule Created",
      description: "Build the first week of shifts and publish to officers",
      icon: CalendarDays,
      status: (stats?.activeShifts ?? 0) > 0 ? "complete" : ((stats?.employeeCount ?? 0) === 0 ? "pending" : "action"),
      detail: `${(stats?.activeShifts ?? 0) > 0 ? `${stats!.activeShifts} active shifts published.` : "No published shifts yet."} Use the Scheduling page or ask Trinity AI to auto-generate a schedule from your team and client list.`,
      content: (
        <Button size="sm" variant="outline" asChild>
          <a href="/scheduling" data-testid="link-scheduling">
            Open Scheduling <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </Button>
      ),
    },
    {
      id: 9,
      title: "Live GPS Clock-In Test",
      description: "One real officer clocks in with GPS — confirm record created",
      icon: Clock,
      status: (stats?.timeEntryCount ?? 0) > 0 ? "complete" : ((stats?.activeShifts ?? 0) === 0 ? "pending" : "action"),
      detail: `${(stats?.timeEntryCount ?? 0) > 0 ? `${stats!.timeEntryCount} time entries on record — clock-in confirmed working.` : "No time entries yet."} Have one officer use the mobile app to clock in at their site. Verify the time entry appears with GPS coordinates in the Time Entries view.`,
      content: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/time-entries" data-testid="link-time-entries">
              View Time Entries <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/trinity" data-testid="link-trinity-step9">
              Ask Trinity AI <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      ),
    },
    {
      id: 10,
      title: "Generate & Confirm Invoice Delivery",
      description: "Generate one real invoice — confirm email arrives at the client",
      icon: Zap,
      status: (stats?.deliveredInvoiceCount ?? 0) > 0 ? "complete" : ((stats?.invoiceCount ?? 0) > 0 ? "warning" : ((stats?.clientCount ?? 0) === 0 ? "pending" : "action")),
      detail: (stats?.deliveredInvoiceCount ?? 0) > 0
        ? `${stats!.deliveredInvoiceCount} invoice(s) with confirmed email delivery. The pipeline is proven end-to-end for this workspace.`
        : (stats?.invoiceCount ?? 0) > 0
          ? `${stats!.invoiceCount} invoice(s) generated but no confirmed email delivery yet. Check the Resend webhook is receiving events.`
          : "No invoices generated yet. Generate your first invoice for a client and confirm the email delivers to the client email address.",
      content: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/billing" data-testid="link-billing-invoices">
              Open Billing / Invoices <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/trinity" data-testid="link-trinity-step10">
              Ask Trinity AI <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      ),
    },
  ] as const;

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const allComplete = completedCount === steps.length;

  const toggle = (id: number) => setExpandedStep((prev) => (prev === id ? null : id));

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-golive-title">
            Go-Live Checklist
          </h1>
          {isFounder && (
            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
              Founder Account
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          All 10 steps must be green before your workspace goes live on CoAIleague.
        </p>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-sm font-medium">Migration progress</span>
            <span className="text-sm text-muted-foreground" data-testid="text-progress">
              {completedCount}/{steps.length} complete
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              data-testid="progress-bar"
            />
          </div>
          {workspace && (
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span data-testid="text-workspace-name">Workspace: <strong>{workspace.name}</strong></span>
              <span data-testid="text-subscription-tier">Tier: <strong className="capitalize">{workspace.subscriptionTier || "—"}</strong></span>
              {stats && (
                <>
                  <span data-testid="text-employee-count">Employees: <strong>{stats.employeeCount}</strong></span>
                  <span data-testid="text-client-count">Clients: <strong>{stats.clientCount}</strong></span>
                  <span data-testid="text-shift-count">Active shifts: <strong>{stats.activeShifts}</strong></span>
                </>
              )}
            </div>
          )}
          {allComplete && (
            <div className="mt-3 rounded-md border border-green-500/40 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400 font-medium" data-testid="status-all-complete">
              All 10 steps complete. Your workspace is live on CoAIleague.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist steps */}
      <div className="space-y-3">
        {steps.map((step) => (
          <StepCard
            key={step.id}
            stepNumber={step.id}
            title={step.title}
            description={step.description}
            icon={step.icon}
            status={step.status as any}
            expanded={expandedStep === step.id}
            onToggle={() => toggle(step.id)}
            detail={step.detail}
          >
            {step.content}
          </StepCard>
        ))}
      </div>

      {/* CSV Template downloads */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">CSV Templates</CardTitle>
          <CardDescription className="text-xs">
            Download sample CSV files to use as a starting point when exporting from QuickBooks or spreadsheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csv = "first_name,last_name,email,phone,role,hourly_rate,hire_date\nJohn,Smith,john.smith@example.com,555-1234,Security Officer,18.50,2024-01-15\nJane,Doe,,555-5678,Sergeant,22.00,2023-06-01\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "employee_import_template.csv";
              a.click();
            }}
            data-testid="button-download-employee-template"
          >
            <FileText className="w-4 h-4 mr-2" />
            Employee Template
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csv = "company_name,first_name,last_name,email,phone,address,city,state,zip,contract_rate,poc_name,poc_phone\nAcme Corp,Jane,Doe,jane@acme.com,555-9999,123 Main St,Sacramento,CA,95814,28.50,Bob Manager,555-0000\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "client_import_template.csv";
              a.click();
            }}
            data-testid="button-download-client-template"
          >
            <FileText className="w-4 h-4 mr-2" />
            Client Template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
