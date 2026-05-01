import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  BookOpen,
  Award,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  ChevronRight,
  XCircle,
  BarChart3,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEmployee } from "@/hooks/useEmployee";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  category: string;
  passingScore: number;
  certificateValidDays: number;
  isRequired: boolean;
  orderIndex: number;
}

interface CertEntry {
  cert: {
    id: string;
    certificateNumber: string;
    issuedAt: string;
    expiresAt: string;
    overallScore: number;
    isValid: boolean;
    pdfUrl: string | null;
  };
  moduleTitle: string | null;
  moduleCategory: string | null;
  passingScore: number | null;
}

interface ComplianceReport {
  summary: {
    totalOfficers: number;
    compliantOfficers: number;
    complianceRate: number;
    openInterventions: number;
    requiredModules: number;
  };
  officers: Array<{
    employeeId: string;
    officerName: string;
    complianceScore: number | null;
    trainingCompletionPercentage: number | null;
    compliant: boolean;
    openInterventions: number;
    requiredModuleStatus: Array<{
      moduleId: string;
      moduleTitle: string;
      status: 'current' | 'expiring_soon' | 'expired' | 'not_started';
      expiresAt: string | null;
    }>;
  }>;
  modules: TrainingModule[];
}

interface Intervention {
  id: string;
  employeeId: string;
  moduleId: string;
  flaggedAt: string;
  completed: boolean;
  completedAt: string | null;
  notes: string | null;
  outcome: string | null;
  consistentlyMissedTopics: string[] | null;
  moduleTitle: string | null;
  officerName: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: 'current' | 'expiring_soon' | 'expired' | 'not_started') {
  const map = {
    current: { label: 'Current', className: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20' },
    expiring_soon: { label: 'Expiring Soon', className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
    expired: { label: 'Expired', className: 'bg-red-500/15 text-red-500 border-red-500/20' },
    not_started: { label: 'Not Started', className: 'bg-muted text-muted-foreground border-border' },
  };
  const cfg = map[status];
  return <Badge className={`text-xs border ${cfg.className}`}>{cfg.label}</Badge>;
}

function daysUntil(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TrainingCertificationPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { employee } = useEmployee();
  const [activeTab, setActiveTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'modules';
  });

  const isManager = ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'supervisor'].includes(
    (employee as any)?.workspaceRole || '',
  );

  // Queries
  const { data: modules = [], isLoading: modulesLoading } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/certification/modules'],
  });

  const { data: myCerts = [], isLoading: certsLoading } = useQuery<CertEntry[]>({
    queryKey: ['/api/training/certification/my-certificates'],
  });

  const { data: complianceReport, isLoading: complianceLoading } = useQuery<ComplianceReport>({
    queryKey: ['/api/training/certification/compliance-report'],
    enabled: isManager,
  });

  const { data: interventions = [], isLoading: interventionsLoading } = useQuery<Intervention[]>({
    queryKey: ['/api/training/certification/interventions'],
    enabled: isManager,
  });

  const resolveIntervention = useMutation({
    mutationFn: ({ id, outcome, notes }: { id: string; outcome: string; notes: string }) =>
      apiRequest('PATCH', `/api/training/certification/interventions/${id}`, { outcome, notes, conductedBy: 'Manager', completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/certification/interventions'] });
      toast({ title: 'Intervention resolved' });
    },
    onError: (error) => {
      toast({ title: 'Failed to resolve intervention', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  // Module status based on certificates
  const certsByModule = new Map(myCerts.map(c => [
    (c as any).cert?.moduleId ?? '',
    c,
  ]));

  const getModuleStatus = (moduleId: string): 'current' | 'expiring_soon' | 'expired' | 'not_started' => {
    const entry = certsByModule.get(moduleId);
    if (!entry?.cert) return 'not_started';
    const days = daysUntil(entry.cert.expiresAt);
    if (!entry.cert.isValid || days < 0) return 'expired';
    if (days <= 30) return 'expiring_soon';
    return 'current';
  };

  // Stats
  const completedCount = modules.filter(m => getModuleStatus(m.id) === 'current' || getModuleStatus(m.id) === 'expiring_soon').length;
  const overdueCount = modules.filter(m => m.isRequired && (getModuleStatus(m.id) === 'expired' || getModuleStatus(m.id) === 'not_started')).length;
  const completionPct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-background px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 data-testid="text-page-title" className="text-2xl font-bold">Officer Training Certification</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Complete required training modules to maintain compliance and earn certifications.
            </p>
          </div>
          {isManager && (
            <Button
              data-testid="button-seed-modules"
              variant="outline"
              size="default"
              onClick={async () => {
                try {
                  await apiRequest('POST', '/api/training/certification/seed-modules', {});
                  queryClient.invalidateQueries({ queryKey: ['/api/training/certification/modules'] });
                  toast({ title: 'Modules seeded successfully' });
                } catch {
                  toast({ title: 'Seeding failed', variant: 'destructive' });
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Seed Modules
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total Modules</p>
                  <p data-testid="stat-total-modules" className="text-2xl font-bold">{modules.length}</p>
                </div>
                <BookOpen className="w-8 h-8 text-muted-foreground/40" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p data-testid="stat-completed" className="text-2xl font-bold text-green-600 dark:text-green-400">{completedCount}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                  <p data-testid="stat-overdue" className="text-2xl font-bold text-red-500">{overdueCount}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Completion</p>
                  <p data-testid="stat-completion-pct" className="text-sm font-bold">{completionPct}%</p>
                </div>
                <Progress value={completionPct} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList data-testid="tabs-training" className="flex w-max min-w-full">
              <TabsTrigger data-testid="tab-modules" value="modules" className="whitespace-nowrap">Modules</TabsTrigger>
              <TabsTrigger data-testid="tab-certificates" value="certificates" className="whitespace-nowrap">My Certificates</TabsTrigger>
              {isManager && <TabsTrigger data-testid="tab-compliance" value="compliance" className="whitespace-nowrap">Compliance Dashboard</TabsTrigger>}
              {isManager && <TabsTrigger data-testid="tab-interventions" value="interventions" className="whitespace-nowrap">Interventions</TabsTrigger>}
            </TabsList>
          </div>

          {/* MODULES TAB */}
          <TabsContent value="modules" className="mt-4">
            {modulesLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-md" />
                ))}
              </div>
            ) : modules.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No training modules found</p>
                  <p className="text-sm text-muted-foreground mt-1">Use the Seed Modules button to load the default training catalog.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {modules.map(mod => {
                  const status = getModuleStatus(mod.id);
                  const cert = certsByModule.get(mod.id);
                  const canStart = status === 'not_started' || status === 'expired';

                  return (
                    <Card key={mod.id} data-testid={`card-module-${mod.id}`} className="flex flex-col">
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground capitalize">{mod.category.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {mod.isRequired && (
                              <Badge className="text-xs border bg-primary/10 text-primary border-primary/20">Required</Badge>
                            )}
                            {statusBadge(status)}
                          </div>
                        </div>
                        <CardTitle className="text-base leading-snug mt-2">{mod.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col flex-1 gap-3">
                        {mod.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{mod.description}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Pass: {mod.passingScore}%</span>
                          <span>Valid: {mod.certificateValidDays} days</span>
                        </div>
                        {cert?.cert && !canStart && (
                          <div className="text-xs text-muted-foreground">
                            Expires {formatDate(cert.cert.expiresAt)}
                            {daysUntil(cert.cert.expiresAt) >= 0
                              ? ` (${daysUntil(cert.cert.expiresAt)} days)`
                              : ' (EXPIRED)'}
                          </div>
                        )}
                        <div className="mt-auto">
                          <Button
                            data-testid={`button-start-module-${mod.id}`}
                            variant={canStart ? 'default' : 'outline'}
                            size="default"
                            className="w-full"
                            onClick={() => navigate(`/training-certification/modules/${mod.id}`)}
                          >
                            {status === 'not_started' ? 'Start Training' :
                              status === 'expired' ? 'Retake Training' :
                              status === 'expiring_soon' ? 'Review & Renew' : 'Review Module'}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* CERTIFICATES TAB */}
          <TabsContent value="certificates" className="mt-4">
            {certsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={`skeleton-a-${i}`} className="h-24 rounded-md" />)}
              </div>
            ) : myCerts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Award className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No certificates yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Complete a training module to earn your first certificate.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {myCerts.map((entry, i) => {
                  const expired = !entry.cert.isValid || daysUntil(entry.cert.expiresAt) < 0;
                  const expiringSoon = !expired && daysUntil(entry.cert.expiresAt) <= 30;
                  return (
                    <Card key={entry.cert.id} data-testid={`card-cert-${i}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={['mt-0.5 rounded-full p-1.5', expired ? 'bg-red-500/10' : expiringSoon ? 'bg-yellow-500/10' : 'bg-green-500/10'].join(' ')}>
                              {expired ? <XCircle className="w-4 h-4 text-red-500" /> : expiringSoon ? <Clock className="w-4 h-4 text-yellow-500" /> : <Award className="w-4 h-4 text-green-500" />}
                            </div>
                            <div>
                              <p data-testid={`text-cert-module-${i}`} className="font-medium text-sm">{entry.moduleTitle ?? 'Unknown Module'}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                #{entry.cert.certificateNumber} &middot; Score: {entry.cert.overallScore}%
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Issued {formatDate(entry.cert.issuedAt)} &middot; Expires {formatDate(entry.cert.expiresAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {expired ? (
                              <Badge className="text-xs border bg-red-500/10 text-red-500 border-red-500/20">Expired</Badge>
                            ) : expiringSoon ? (
                              <Badge className="text-xs border bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                                Expires in {daysUntil(entry.cert.expiresAt)}d
                              </Badge>
                            ) : (
                              <Badge className="text-xs border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Valid</Badge>
                            )}
                            {entry.cert.pdfUrl && (
                              <Button
                                data-testid={`button-download-cert-${i}`}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = entry.cert.pdfUrl!;
                                  a.download = `${entry.cert.certificateNumber}.pdf`;
                                  a.click();
                                }}
                              >
                                Download PDF
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* COMPLIANCE DASHBOARD TAB (manager only) */}
          {isManager && (
            <TabsContent value="compliance" className="mt-4">
              {complianceLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-32 rounded-md" />
                  <Skeleton className="h-64 rounded-md" />
                </div>
              ) : !complianceReport ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium">No compliance data</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Compliance Rate</p>
                        <p data-testid="stat-compliance-rate" className="text-2xl font-bold">{complianceReport.summary.complianceRate}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Compliant Officers</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{complianceReport.summary.compliantOfficers}/{complianceReport.summary.totalOfficers}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Open Interventions</p>
                        <p className="text-2xl font-bold text-red-500">{complianceReport.summary.openInterventions}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Required Modules</p>
                        <p className="text-2xl font-bold">{complianceReport.summary.requiredModules}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Officers table */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-base">Officer Compliance Status</CardTitle>
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Officer</th>
                              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Status</th>
                              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Completion</th>
                              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Open Issues</th>
                            </tr>
                          </thead>
                          <tbody>
                            {complianceReport.officers.map((officer, i) => (
                              <tr key={officer.employeeId} data-testid={`row-officer-${i}`} className="border-b last:border-0 hover-elevate">
                                <td className="py-3 px-4 font-medium">{officer.officerName}</td>
                                <td className="py-3 px-4">
                                  {officer.compliant
                                    ? <Badge className="text-xs border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Compliant</Badge>
                                    : <Badge className="text-xs border bg-red-500/10 text-red-500 border-red-500/20">Non-Compliant</Badge>}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <Progress
                                      value={officer.trainingCompletionPercentage ?? 0}
                                      className="h-1.5 w-20"
                                    />
                                    <span className="text-xs text-muted-foreground">{officer.trainingCompletionPercentage ?? 0}%</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {officer.openInterventions > 0 ? (
                                    <Badge className="text-xs border bg-red-500/10 text-red-500 border-red-500/20">{officer.openInterventions} open</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">None</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          )}

          {/* INTERVENTIONS TAB (manager only) */}
          {isManager && (
            <TabsContent value="interventions" className="mt-4">
              {interventionsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={`skeleton-a-${i}`} className="h-24 rounded-md" />)}
                </div>
              ) : interventions.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CheckCircle className="w-12 h-12 mx-auto text-green-500/40 mb-3" />
                    <p className="font-medium">No open interventions</p>
                    <p className="text-sm text-muted-foreground mt-1">All officers are progressing well through their training.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {interventions.map((item, i) => (
                    <Card key={item.id} data-testid={`card-intervention-${i}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <p className="font-medium text-sm">{item.officerName}</p>
                              {item.completed
                                ? <Badge className="text-xs border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Resolved</Badge>
                                : <Badge className="text-xs border bg-red-500/10 text-red-500 border-red-500/20">Open</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">Module: {item.moduleTitle ?? 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">Flagged: {formatDate(item.flaggedAt)}</p>
                            {item.consistentlyMissedTopics && item.consistentlyMissedTopics.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Missed topics: {item.consistentlyMissedTopics.slice(0, 3).join('; ')}
                              </p>
                            )}
                          </div>
                          {!item.completed && (
                            <Button
                              data-testid={`button-resolve-intervention-${i}`}
                              variant="outline"
                              size="sm"
                              onClick={() => resolveIntervention.mutate({
                                id: item.id,
                                outcome: 'completed',
                                notes: 'Intervention completed by manager',
                              })}
                            >
                              Mark Resolved
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
