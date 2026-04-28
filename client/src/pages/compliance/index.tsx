import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {Eye, Shield, 
  FileCheck, 
  AlertTriangle, 
  Clock, 
  Users, 
  Lock,
  CheckCircle2,
  XCircle,
  Building2,
  FileWarning,
  Eye,
  ClipboardCheck
} from "lucide-react";
import { Link } from "wouter";

interface ComplianceStats {
  totalEmployees: number;
  compliantEmployees: number;
  pendingReview: number;
  expiringWithin30Days: number;
  expiringWithin90Days: number;
  documentsUploaded: number;
  documentsLocked: number;
  pendingApprovals: number;
}

interface ComplianceState {
  id: string;
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAcronym: string;
  portalUrl: string;
}

export default function ComplianceDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: statesData, isLoading: statesLoading } = useQuery<{ success: boolean; states: ComplianceState[] }>({
    queryKey: ['/api/security-compliance/states'],
  });

  const { data: approvalsData, isLoading: approvalsLoading } = useQuery<{ success: boolean; approvals: any[]; count: number }>({
    queryKey: ['/api/security-compliance/approvals/pending'],
  });

  const { data: recordsData, isLoading: recordsLoading } = useQuery<{ success: boolean; records: any[] }>({
    queryKey: ['/api/security-compliance/records'],
  });

  const { data: statsData } = useQuery<{ success: boolean; stats: ComplianceStats }>({
    queryKey: ['/api/security-compliance/records/stats'],
  });

  const states = statesData?.states || [];
  const pendingApprovals = approvalsData?.approvals || [];
  const records = recordsData?.records || [];

  const stats: ComplianceStats = statsData?.stats || {
    totalEmployees: records.length,
    compliantEmployees: records.filter((r: any) => r.record?.overallStatus === 'complete').length,
    pendingReview: records.filter((r: any) => r.record?.overallStatus === 'pending_review').length,
    expiringWithin30Days: 0,
    expiringWithin90Days: 0,
    documentsUploaded: 0,
    documentsLocked: records.filter((r: any) => r.record?.vaultLocked).length,
    pendingApprovals: pendingApprovals.length
  };

  const complianceRate = stats.totalEmployees > 0 
    ? Math.round((stats.compliantEmployees / stats.totalEmployees) * 100) 
    : 0;

  const pageConfig: CanvasPageConfig = {
    id: 'compliance-dashboard',
    title: 'Security Compliance Vault',
    subtitle: 'State-Regulated Document Management & License Tracking',
    category: 'operations',
    maxWidth: '6xl',
    headerActions: (
      <Button onClick={() => setActiveTab("records")} data-testid="btn-add-employee-record">
        Add Employee Record
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="compliance-dashboard">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="stat-compliance-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{complianceRate}%</div>
              <Progress value={complianceRate} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {stats.compliantEmployees} of {stats.totalEmployees} employees
              </p>
            </CardContent>
          </Card>

          <Card data-testid="stat-pending-approvals">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{stats.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground">
                Documents awaiting review
              </p>
              {stats.pendingApprovals > 0 && (
                <Link href="/security-compliance/approvals">
                  <Button variant="outline" size="sm" className="mt-2 w-full" data-testid="btn-view-approvals">
                    Review Now
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-expiring-soon">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-amber-600">{stats.expiringWithin30Days}</div>
              <p className="text-xs text-muted-foreground">
                Within 30 days
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.expiringWithin90Days} within 90 days
              </p>
              {(stats.expiringWithin30Days > 0 || stats.expiringWithin90Days > 0) && (
                <Link href="/security-compliance/expiration-alerts">
                  <Button variant="outline" size="sm" className="mt-2 w-full" data-testid="btn-view-expiring">
                    View All
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-locked-documents">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Locked Documents</CardTitle>
              <Lock className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-green-600">{stats.documentsLocked}</div>
              <p className="text-xs text-muted-foreground">
                WORM-protected files
              </p>
            </CardContent>
          </Card>

          <Card data-testid="stat-audit-readiness">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Audit Readiness</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Review your audit readiness score, upload required company documents, and prepare for state inspections.
              </p>
              <Link href="/security-compliance/audit-readiness">
                <Button variant="outline" size="sm" className="w-full" data-testid="btn-audit-readiness">
                  View Readiness
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Shield className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="employees" data-testid="tab-employees">
              <Users className="h-4 w-4 mr-2" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileCheck className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="states" data-testid="tab-states">
              <Building2 className="h-4 w-4 mr-2" />
              States
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileWarning className="h-5 w-5" />
                    Required Documents (Texas PSB)
                  </CardTitle>
                  <CardDescription>
                    Documents required for state compliance. DL and Guard Card must be COLOR scans, front and back.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">Driver's License</p>
                          <p className="text-xs text-muted-foreground truncate">COLOR - Front & Back Required</p>
                        </div>
                      </div>
                      <Badge variant="outline">Critical</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">Social Security Card</p>
                          <p className="text-xs text-muted-foreground truncate">Front Only</p>
                        </div>
                      </div>
                      <Badge variant="outline">Critical</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">Security Guard License</p>
                          <p className="text-xs text-muted-foreground truncate">COLOR - Front & Back Required</p>
                        </div>
                      </div>
                      <Badge variant="outline">Critical</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">Training Certificate</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Can substitute for Guard Card - System notes "Pending Guard Card"
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">Substitute</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Audit Integrity
                  </CardTitle>
                  <CardDescription>
                    Document security and verification status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                      <Lock className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">WORM Protection</p>
                        <p className="text-sm text-muted-foreground">
                          Write Once Read Many - Documents cannot be modified after approval
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                      <FileCheck className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">SHA-256 Hashing</p>
                        <p className="text-sm text-muted-foreground">
                          Cryptographic verification ensures document integrity for audits
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 border rounded-lg">
                      <Eye className="h-8 w-8 text-purple-500" />
                      <div>
                        <p className="font-medium">Full Audit Trail</p>
                        <p className="text-sm text-muted-foreground">
                          Every view, download, and action is logged immutably
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="employees" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Employee Compliance Records</CardTitle>
                <CardDescription>
                  Track document status and compliance score for each employee
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recordsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-md" />
                    ))}
                  </div>
                ) : records.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No compliance records found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add employees to start tracking their compliance documents
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {records.map((item: any) => (
                      <div 
                        key={item.record?.id} 
                        className="flex items-center justify-between gap-2 p-4 border rounded-lg hover-elevate"
                        data-testid={`employee-record-${item.record?.id}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {item.employee?.firstName} {item.employee?.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {item.state?.stateCode} - Guard Card: {item.record?.guardCardNumber || 'Pending'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={item.record?.complianceScore || 0} 
                                className="w-24"
                              />
                              <span className="text-sm font-medium">
                                {item.record?.complianceScore || 0}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.record?.completedRequirements || 0} / {item.record?.totalRequirements || 0} items
                            </p>
                          </div>
                          <Badge 
                            variant={item.record?.overallStatus === 'complete' ? 'default' : 'secondary'}
                          >
                            {item.record?.overallStatus === 'complete' ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" />Complete</>
                            ) : (
                              <><XCircle className="h-3 w-3 mr-1" />Incomplete</>
                            )}
                          </Badge>
                          <Link href={`/security-compliance/employee/${item.record?.employeeId}`}>
                            <Button variant="outline" size="sm" data-testid={`btn-view-employee-${item.record?.employeeId}`}>
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Document Vault</CardTitle>
                <CardDescription>
                  All compliance documents with cryptographic verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="h-12 w-12 mx-auto mb-4" />
                  <p>Select an employee to view their document vault</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="states" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configured States</CardTitle>
                <CardDescription>
                  State regulatory bodies and compliance requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-md" />
                    ))}
                  </div>
                ) : states.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No states configured
                  </div>
                ) : (
                  <div className="space-y-3">
                    {states.map((state) => (
                      <div 
                        key={state.id}
                        className="flex items-center justify-between gap-2 p-4 border rounded-lg"
                        data-testid={`state-${state.stateCode}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold shrink-0">
                            {state.stateCode}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{state.stateName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {state.regulatoryBody}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge>{state.regulatoryBodyAcronym}</Badge>
                          {state.portalUrl && (
                            <a 
                              href={state.portalUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <Button variant="outline" size="sm" data-testid={`btn-portal-${state.stateCode}`}>
                                Portal
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
