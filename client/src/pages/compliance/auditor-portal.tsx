import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { UniversalEmptyState } from "@/components/universal";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  FileSearch,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Scale,
  Building2,
  Lock,
  Loader2,
} from "lucide-react";

async function auditorFetch<T>(url: string): Promise<T> {
  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
    return null;
  };
  const token = getCookie('auditor_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

interface StateConfig {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAbbreviation: string;
  portalUrl: string;
  retentionPeriodDescription: string;
}

interface AuditReport {
  compliancePercentage: number;
  totalEmployees: number;
  compliant: number;
  nonCompliant: number;
  suspended: number;
  expiringWithin30Days: number;
  actions: string[];
  lastAuditDate: string | null;
  riskLevel: string;
  scoreboard: Array<{
    employeeId: string;
    employeeName: string;
    score: number;
    grade: string;
    riskLevel: string;
  }>;
}

interface PointRule {
  eventType: string;
  points: number;
  category: string;
  description: string;
  regulatoryCitation?: string;
}

function getRiskLevel(score: number): { label: string; color: string; bgClass: string } {
  if (score >= 80) return { label: "Low Risk", color: "text-green-700 dark:text-green-300", bgClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
  if (score >= 60) return { label: "Medium Risk", color: "text-yellow-700 dark:text-yellow-300", bgClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" };
  return { label: "High Risk", color: "text-red-700 dark:text-red-300", bgClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" };
}

export default function AuditorPortal() {
  const [, navigate] = useLocation();

  const { data: stateConfigsData, isLoading: statesLoading } = useQuery<{ success: boolean; configs: StateConfig[] }>({
    queryKey: ['/api/security-compliance/enforcement/state-configs'],
    queryFn: () => auditorFetch('/api/security-compliance/enforcement/state-configs'),
  });

  const { data: auditReportData, isLoading: reportLoading } = useQuery<{ success: boolean; report: AuditReport }>({
    queryKey: ['/api/security-compliance/enforcement/audit-report'],
    queryFn: () => auditorFetch('/api/security-compliance/enforcement/audit-report'),
  });

  const { data: pointRulesData, isLoading: rulesLoading } = useQuery<{ success: boolean; rules: PointRule[] }>({
    queryKey: ['/api/security-compliance/enforcement/point-rules'],
    queryFn: () => auditorFetch('/api/security-compliance/enforcement/point-rules'),
  });

  const isLoading = statesLoading || reportLoading;

  const states = stateConfigsData?.configs || [];
  const report = auditReportData?.report || {
    compliancePercentage: 0,
    totalEmployees: 0,
    compliant: 0,
    nonCompliant: 0,
    suspended: 0,
    expiringWithin30Days: 0,
    actions: [],
    lastAuditDate: null,
    riskLevel: 'low',
    scoreboard: [],
  };
  const pointRules = pointRulesData?.rules || [];

  const risk = getRiskLevel(report.compliancePercentage);

  if (isLoading) {
    const loadingConfig: CanvasPageConfig = {
      id: 'auditor-portal-loading',
      title: 'Auditor Access Portal',
      subtitle: 'Loading...',
      category: 'operations',
      backButton: true,
      onBack: () => navigate('/security-compliance'),
    };
    return (
      <CanvasHubPage config={loadingConfig}>
        <div className="flex justify-center items-center py-12" data-testid="loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CanvasHubPage>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'auditor-portal',
    title: 'Auditor Access Portal',
    subtitle: 'State Regulatory Compliance Review',
    category: 'operations',
    maxWidth: '6xl',
    backButton: true,
    onBack: () => navigate('/security-compliance'),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="auditor-portal-page">
        <div className="flex items-center gap-2 p-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" data-testid="banner-read-only">
          <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Auditor View - Read Only
          </span>
        </div>

        <Card data-testid="card-compliance-overview">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Compliance Overview
            </CardTitle>
            <CardDescription>Company-wide compliance status summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="flex flex-col items-center justify-center p-6 rounded-md border min-w-[160px]" data-testid="score-display">
                <span className="text-5xl font-bold" data-testid="text-compliance-score">
                  {report.compliancePercentage}%
                </span>
                <span className="text-sm text-muted-foreground mt-1">Compliance Score</span>
                <Badge className={`mt-2 ${risk.bgClass}`} data-testid="badge-risk-level">
                  {risk.label}
                </Badge>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-md border" data-testid="stat-total-employees">
                  <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{report.totalEmployees}</div>
                  <p className="text-xs text-muted-foreground">Total Employees</p>
                </div>
                <div className="text-center p-3 rounded-md border" data-testid="stat-compliant">
                  <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 dark:text-green-400 mb-1" />
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{report.compliant}</div>
                  <p className="text-xs text-muted-foreground">Compliant</p>
                </div>
                <div className="text-center p-3 rounded-md border" data-testid="stat-non-compliant">
                  <XCircle className="h-5 w-5 mx-auto text-red-600 dark:text-red-400 mb-1" />
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{report.nonCompliant}</div>
                  <p className="text-xs text-muted-foreground">Non-Compliant</p>
                </div>
                <div className="text-center p-3 rounded-md border" data-testid="stat-suspended">
                  <AlertTriangle className="h-5 w-5 mx-auto text-amber-600 dark:text-amber-400 mb-1" />
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{report.suspended}</div>
                  <p className="text-xs text-muted-foreground">Suspended</p>
                </div>
              </div>
            </div>
            {report.lastAuditDate && (
              <div className="mt-4 flex items-center gap-2" data-testid="last-audit-date">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Last Audit: {new Date(report.lastAuditDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-state-compliance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              State Compliance Summary
            </CardTitle>
            <CardDescription>Regulatory bodies and requirements by state</CardDescription>
          </CardHeader>
          <CardContent>
            {states.length === 0 ? (
              <UniversalEmptyState
                icon={<Building2 size={32} />}
                title="No State Configurations"
                description="No state configurations found"
                data-testid="empty-states"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {states.map((state) => (
                  <div
                    key={state.stateCode}
                    className="flex items-start justify-between gap-2 p-4 border rounded-md"
                    data-testid={`state-card-${state.stateCode}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center font-bold text-sm shrink-0">
                        {state.stateCode}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium" data-testid={`text-state-name-${state.stateCode}`}>
                          {state.stateName}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-regulatory-body-${state.stateCode}`}>
                          {state.regulatoryBody}
                        </p>
                        <Badge variant="outline" className="mt-1" data-testid={`badge-acronym-${state.stateCode}`}>
                          {state.regulatoryBodyAbbreviation}
                        </Badge>
                        {state.retentionPeriodDescription && (
                          <p className="text-xs text-muted-foreground mt-1" data-testid={`text-retention-${state.stateCode}`}>
                            Retention: {state.retentionPeriodDescription}
                          </p>
                        )}
                      </div>
                    </div>
                    {state.portalUrl && (
                      <a
                        href={state.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-portal-${state.stateCode}`}
                      >
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Portal
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-point-rules">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Compliance Point Rules Reference
            </CardTitle>
            <CardDescription>Point values assigned for compliance events</CardDescription>
          </CardHeader>
          <CardContent>
            {rulesLoading ? (
              <div className="flex justify-center py-8" data-testid="loading-rules">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pointRules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="empty-rules">
                <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No point rules configured</p>
              </div>
            ) : (
              <Table data-testid="table-point-rules">
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Regulatory Citation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pointRules.map((rule) => (
                    <TableRow key={rule.eventType} data-testid={`rule-row-${rule.eventType}`}>
                      <TableCell className="font-medium" data-testid={`text-rule-event-${rule.eventType}`}>
                        {rule.eventType.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell data-testid={`text-rule-points-${rule.eventType}`}>
                        <span className={rule.points >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                          {rule.points > 0 ? `+${rule.points}` : rule.points}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-rule-category-${rule.eventType}`}>
                          {rule.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm" data-testid={`text-rule-desc-${rule.eventType}`}>
                        {rule.description}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm italic" data-testid={`text-rule-citation-${rule.eventType}`}>
                        {rule.regulatoryCitation || "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-employee-scoreboard">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Employee Compliance Scoreboard
            </CardTitle>
            <CardDescription>Individual employee compliance scores and grades</CardDescription>
          </CardHeader>
          <CardContent>
            {report.scoreboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="empty-scoreboard">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No employee scores available</p>
              </div>
            ) : (
              <Table data-testid="table-scoreboard">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Risk Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(report.scoreboard) ? report.scoreboard : []).map((entry) => (
                    <TableRow key={entry.employeeId} data-testid={`scoreboard-row-${entry.employeeId}`}>
                      <TableCell className="font-medium" data-testid={`text-scoreboard-name-${entry.employeeId}`}>
                        {entry.employeeName}
                      </TableCell>
                      <TableCell data-testid={`text-scoreboard-score-${entry.employeeId}`}>
                        <span className="font-bold">{entry.score}</span>
                        <span className="text-muted-foreground text-xs ml-1">/1000</span>
                      </TableCell>
                      <TableCell data-testid={`text-scoreboard-grade-${entry.employeeId}`}>
                        <Badge variant="secondary">{entry.grade}</Badge>
                      </TableCell>
                      <TableCell data-testid={`text-scoreboard-risk-${entry.employeeId}`}>
                        <Badge className={getRiskLevel(entry.score / 10).bgClass}>
                          {entry.riskLevel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {report.actions.length > 0 && (
          <Card data-testid="card-recommended-actions">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recommended Actions
              </CardTitle>
              <CardDescription>Items requiring attention for compliance</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`text-action-${idx}`}>
                    <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </CanvasHubPage>
  );
}
