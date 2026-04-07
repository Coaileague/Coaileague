import { useState } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, AlertTriangle, Shield, ShieldAlert,
  ShieldCheck, RefreshCw, Clock, FileWarning, Globe, Stethoscope, Building2
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScenarioCheck {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
}

interface ScenarioResult {
  scenarioId: number;
  title: string;
  description: string;
  status: "PASS" | "FAIL" | "SKIP";
  checks: ScenarioCheck[];
  summary: string;
  data?: Record<string, unknown>;
}

interface ScenariosResponse {
  workspaceId: string;
  runAt: string;
  scenarios: ScenarioResult[];
  summary: { passed: number; failed: number; skipped: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCENARIO_ICONS = [Clock, ShieldAlert, ShieldCheck, Stethoscope, Building2, Globe];

const SCENARIO_ALERT_TIERS: Record<number, { label: string; color: string }> = {
  1: { label: "30-Day URGENT", color: "text-amber-600 dark:text-amber-400" },
  2: { label: "EXPIRED — Hard Block", color: "text-red-600 dark:text-red-400" },
  3: { label: "Renewal Restoration", color: "text-emerald-600 dark:text-emerald-400" },
  4: { label: "Cert Requirement", color: "text-blue-600 dark:text-blue-400" },
  5: { label: "60-Day WARNING", color: "text-orange-600 dark:text-orange-400" },
  6: { label: "Out-of-State Flag", color: "text-violet-600 dark:text-violet-400" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "PASS" | "FAIL" | "SKIP" }) {
  if (status === "PASS") return <Badge className="bg-emerald-600 text-white text-xs">PASS</Badge>;
  if (status === "FAIL") return <Badge className="bg-red-600 text-white text-xs">FAIL</Badge>;
  return <Badge className="bg-slate-500 text-white text-xs">SKIP</Badge>;
}

function CheckRow({ check }: { check: ScenarioCheck }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        {check.pass
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          : <XCircle className="h-4 w-4 text-red-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{check.label}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
          <span className="text-xs text-muted-foreground">Expected: <span className="font-mono">{check.expected}</span></span>
          <span className="text-xs text-muted-foreground">Actual: <span className={`font-mono ${check.pass ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{check.actual}</span></span>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioResult }) {
  const [expanded, setExpanded] = useState(scenario.status !== "PASS");
  const Icon = SCENARIO_ICONS[scenario.scenarioId - 1] ?? Shield;
  const tier = SCENARIO_ALERT_TIERS[scenario.scenarioId];
  const passCount = scenario.checks.filter(c => c.pass).length;
  const totalCount = scenario.checks.length;

  return (
    <Card data-testid={`card-scenario-${scenario.scenarioId}`} className="overflow-visible">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 p-2 rounded-md ${scenario.status === "PASS" ? "bg-emerald-100 dark:bg-emerald-900/30" : scenario.status === "FAIL" ? "bg-red-100 dark:bg-red-900/30" : "bg-slate-100 dark:bg-slate-800"}`}>
              <Icon className={`h-4 w-4 ${scenario.status === "PASS" ? "text-emerald-600 dark:text-emerald-400" : scenario.status === "FAIL" ? "text-red-500" : "text-slate-400"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scenario {scenario.scenarioId}</span>
                {tier && <span className={`text-xs font-medium ${tier.color}`}>{tier.label}</span>}
              </div>
              <CardTitle className="text-base leading-snug mt-0.5">{scenario.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{scenario.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">{passCount}/{totalCount} checks</span>
            <StatusBadge status={scenario.status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="bg-muted/40 rounded-md px-3 py-2 mb-3">
          <p className="text-sm text-foreground leading-relaxed">{scenario.summary}</p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(e => !e)}
          data-testid={`button-expand-scenario-${scenario.scenarioId}`}
          className="text-xs text-muted-foreground"
        >
          {expanded ? "Hide" : "Show"} {totalCount} verification checks
        </Button>

        {expanded && (
          <div className="mt-2 rounded-md border border-border bg-card">
            {scenario.checks.map((check, i) => (
              <CheckRow key={i} check={check} />
            ))}
          </div>
        )}

        {scenario.data && expanded && (
          <div className="mt-2 rounded-md bg-muted/20 border border-border px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Engine Data</p>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(scenario.data, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryBar({ summary, runAt }: { summary: ScenariosResponse["summary"]; runAt: string }) {
  const total = summary.passed + summary.failed + summary.skipped;
  const allPass = summary.failed === 0 && summary.skipped === 0;

  return (
    <div className={`rounded-md border px-4 py-3 flex flex-wrap items-center gap-4 ${allPass ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : summary.failed > 0 ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-amber-400 bg-amber-50 dark:bg-amber-950/20"}`}>
      {allPass
        ? <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        : summary.failed > 0
        ? <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0" />
        : <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />}
      <div className="flex-1">
        <p className={`text-sm font-semibold ${allPass ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
          {allPass ? `All ${total} scenarios passed — compliance intelligence fully verified` : `${summary.failed} scenario(s) failed — check seed data and engine configuration`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Run at {new Date(runAt).toLocaleString()} · {summary.passed} passed · {summary.failed} failed · {summary.skipped} skipped
        </p>
      </div>
      <div className="flex gap-2">
        {summary.passed > 0 && <Badge className="bg-emerald-600 text-white">{summary.passed} PASS</Badge>}
        {summary.failed > 0 && <Badge className="bg-red-600 text-white">{summary.failed} FAIL</Badge>}
        {summary.skipped > 0 && <Badge className="bg-slate-500 text-white">{summary.skipped} SKIP</Badge>}
      </div>
    </div>
  );
}

// ── Alert tier legend ─────────────────────────────────────────────────────────

function AlertTierLegend() {
  const tiers = [
    { days: 90, label: "INFO", desc: "Alert fires to employee + manager", bg: "bg-blue-100 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400" },
    { days: 60, label: "WARNING", desc: "Alert fires to employee + manager + org_owner + briefing channel", bg: "bg-orange-100 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-400" },
    { days: 30, label: "URGENT", desc: "All three channels simultaneously — email, notification, daily briefing", bg: "bg-amber-100 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400" },
    { days: 0, label: "EXPIRED", desc: "Scheduling eligibility immediately revoked — hard block on shift assignment", bg: "bg-red-100 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Multi-Tier Alert Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {tiers.map(t => (
            <div key={t.days} className={`rounded-md px-3 py-2 ${t.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${t.text}`}>{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.days === 0 ? "Expired" : `≤${t.days} days`}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{t.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComplianceScenariosPage() {
  const [runCount, setRunCount] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useQuery<ScenariosResponse>({
    queryKey: ["/api/compliance/acme-scenarios", runCount],
    enabled: runCount > 0,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const handleRunScenarios = () => {
    setRunCount(c => c + 1);
  };

  const pageConfig: CanvasPageConfig = {
    id: 'compliance-scenarios',
    title: 'Compliance Scenarios',
    category: 'operations',
    showHeader: false,
    maxWidth: '5xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-5">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-5 w-5 text-amber-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trinity Compliance Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Acme Security — Compliance Simulation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              6-scenario live verification suite for license expiry enforcement, certification requirements, and scheduling gate logic.
            </p>
          </div>
          <Button
            onClick={handleRunScenarios}
            disabled={isLoading || isFetching}
            data-testid="button-run-scenarios"
            className="flex-shrink-0"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(isLoading || isFetching) ? "animate-spin" : ""}`} />
            {runCount === 0 ? "Run All 6 Scenarios" : "Re-Run Scenarios"}
          </Button>
        </div>

        {/* Alert Tier Legend */}
        <AlertTierLegend />

        {/* Results */}
        {runCount === 0 && !data && (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Ready to verify compliance intelligence</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Click "Run All 6 Scenarios" to execute the Trinity compliance simulation against the Acme Security dev workspace.
                Each scenario runs live checks against real data and enforcement logic.
              </p>
              <Button onClick={handleRunScenarios} className="mt-4" data-testid="button-run-scenarios-empty">
                Run All 6 Scenarios
              </Button>
            </CardContent>
          </Card>
        )}

        {(isLoading || isFetching) && (
          <Card>
            <CardContent className="py-10 text-center">
              <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground">Running 6 compliance scenarios against Acme Security workspace...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-red-400">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <FileWarning className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Scenario run failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
                  <p className="text-xs text-muted-foreground mt-2">Verify the compliance scenario seed has run and the Acme dev workspace is accessible.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data && !isFetching && (
          <>
            <SummaryBar summary={data.summary} runAt={data.runAt} />

            <div className="space-y-4">
              {data.scenarios.map(scenario => (
                <ScenarioCard key={scenario.scenarioId} scenario={scenario} />
              ))}
            </div>

            <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Enforcement Architecture</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground mb-1">Shift Assignment (3 layers)</p>
                  <p>1. Onboarding compliance window (14-day)</p>
                  <p>2. License expiry hard block (engine)</p>
                  <p>3. Post certification requirements</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Alert Channels</p>
                  <p>Email (Resend) to relevant parties</p>
                  <p>In-platform notification</p>
                  <p>Trinity daily briefing channel post</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Data Sources</p>
                  <p>employee_certifications table</p>
                  <p>shifts.required_certifications field</p>
                  <p>Trinity Compliance Engine service</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </CanvasHubPage>
  );
}
