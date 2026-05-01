import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { useState } from 'react';
import {
  Eye,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  RotateCcw,
  Settings,
  FileCode,
  Clock,
  Activity,
  Lock,
  Unlock,
  Loader2,
  GitBranch,
  TestTube,
} from 'lucide-react';;
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

interface EditingRules {
  allowedTiers: string[];
  blockedPaths: string[];
  maxDailyChanges: number;
  maxChangesPerHour: number;
  confidenceThreshold: number;
  requireHumanApprovalFor: string[];
  sandboxRequired: boolean;
  testingRequired: boolean;
  gitTrackingRequired: boolean;
}

interface CircuitBreakerState {
  isOpen: boolean;
  openedAt?: string;
  reason?: string;
  changesInLastHour: number;
  changesInLastDay: number;
  errorRate: number;
  lastError?: string;
  cooldownUntil?: string;
}

interface ProposedChange {
  file: string;
  operation: 'create' | 'modify' | 'delete';
  lineCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ChangeProposal {
  id: string;
  timestamp: string;
  trinitySessionId: string;
  workspaceId?: string;
  userId?: string;
  proposedChanges: ProposedChange[];
  reasoning: string;
  confidenceScore: number;
  permissionTier: string;
  status: string;
  sandboxStatus: string;
  testResults?: Array<{ testName: string; passed: boolean; duration: number }>;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

interface Stats {
  circuitBreakerOpen: boolean;
  changesInLastHour: number;
  changesInLastDay: number;
  errorRate: number;
  pendingProposalCount: number;
  maxDailyChanges: number;
  maxChangesPerHour: number;
  confidenceThreshold: number;
  sandboxRequired: boolean;
  testingRequired: boolean;
}

export default function TrinitySelfEditGovernancePage() {
  const { toast } = useToast();
  const [selectedProposal, setSelectedProposal] = useState<ChangeProposal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: statsData, isLoading: statsLoading } = useQuery<{ success: boolean; stats: Stats }>({
    queryKey: ['/api/trinity/self-edit/stats'],
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ success: boolean; rules: EditingRules }>({
    queryKey: ['/api/trinity/self-edit/rules'],
  });

  const { data: proposalsData, isLoading: proposalsLoading } = useQuery<{ success: boolean; proposals: ChangeProposal[] }>({
    queryKey: ['/api/trinity/self-edit/proposals'],
  });

  const { data: circuitData } = useQuery<{ success: boolean; state: CircuitBreakerState }>({
    queryKey: ['/api/trinity/self-edit/circuit-breaker'],
  });

  const resetCircuitBreakerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/trinity/self-edit/circuit-breaker/reset', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/circuit-breaker'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/stats'] });
      toast({ title: 'Circuit Breaker Reset', description: 'Trinity self-editing is now enabled.' });
    },
    onError: (error) => {
      toast({ title: 'Reset Failed', description: error.message, variant: 'destructive' });
    },
  });

  const runSandboxMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await apiRequest('POST', `/api/trinity/self-edit/proposals/${proposalId}/sandbox`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/proposals'] });
      toast({ title: 'Sandbox Tests Complete', description: 'Check the results below.' });
    },
    onError: (error) => {
      toast({ title: 'Sandbox Failed', description: error.message, variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await apiRequest('POST', `/api/trinity/self-edit/proposals/${proposalId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/proposals'] });
      setSelectedProposal(null);
      toast({ title: 'Proposal Approved', description: 'The changes can now be applied.' });
    },
    onError: (error) => {
      toast({ title: 'Approval Failed', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: string; reason: string }) => {
      const res = await apiRequest('POST', `/api/trinity/self-edit/proposals/${proposalId}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/proposals'] });
      setSelectedProposal(null);
      setShowRejectDialog(false);
      setRejectReason('');
      toast({ title: 'Proposal Rejected', description: 'The changes will not be applied.' });
    },
    onError: (error) => {
      toast({ title: 'Rejection Failed', description: error.message, variant: 'destructive' });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await apiRequest('POST', `/api/trinity/self-edit/proposals/${proposalId}/apply`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/stats'] });
      setSelectedProposal(null);
      toast({ 
        title: 'Changes Applied', 
        description: data.commitHash ? `Committed: ${data.commitHash.slice(0, 8)}` : 'Changes applied successfully.' 
      });
    },
    onError: (error) => {
      toast({ title: 'Apply Failed', description: error.message, variant: 'destructive' });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await apiRequest('POST', `/api/trinity/self-edit/proposals/${proposalId}/rollback`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/self-edit/proposals'] });
      setSelectedProposal(null);
      toast({ title: 'Rollback Complete', description: 'Changes have been reverted.' });
    },
    onError: (error) => {
      toast({ title: 'Rollback Failed', description: error.message, variant: 'destructive' });
    },
  });

  const stats = statsData?.stats;
  const rules = rulesData?.rules;
  const proposals = proposalsData?.proposals || [];
  const circuitState = circuitData?.state;

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'low': return <Badge variant="outline" className="text-green-600">Low Risk</Badge>;
      case 'medium': return <Badge variant="secondary">Medium Risk</Badge>;
      case 'high': return <Badge variant="destructive">High Risk</Badge>;
      case 'critical': return <Badge variant="destructive" className="bg-red-900">Critical</Badge>;
      default: return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved': return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'auto_approved': return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Auto-Approved</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSandboxBadge = (status: string) => {
    switch (status) {
      case 'passed': return <Badge variant="default" className="bg-green-600"><TestTube className="w-3 h-3 mr-1" />Passed</Badge>;
      case 'failed': return <Badge variant="destructive"><TestTube className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'testing': return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Testing</Badge>;
      default: return <Badge variant="outline"><TestTube className="w-3 h-3 mr-1" />Not Run</Badge>;
    }
  };

  if (statsLoading || rulesLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'trinity-self-edit-governance',
    title: 'Trinity Self-Edit Governance',
    subtitle: "Safety controls for Trinity's autonomous code editing capabilities",
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {circuitState?.isOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Circuit Breaker Tripped</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>
              Trinity self-editing is paused. Reason: {circuitState.reason}
              {circuitState.cooldownUntil && ` (Cooldown until ${new Date(circuitState.cooldownUntil).toLocaleTimeString()})`}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resetCircuitBreakerMutation.mutate()}
              disabled={resetCircuitBreakerMutation.isPending}
              data-testid="button-reset-circuit-breaker"
            >
              {resetCircuitBreakerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              Reset
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-circuit-breaker">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Circuit Breaker</CardTitle>
            {circuitState?.isOpen ? <Lock className="w-4 h-4 text-destructive" /> : <Unlock className="w-4 h-4 text-green-600" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-circuit-status">
              {circuitState?.isOpen ? 'OPEN' : 'CLOSED'}
            </div>
            <p className="text-xs text-muted-foreground">
              Error rate: {((circuitState?.errorRate || 0) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-changes-hour">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Changes (Hour)</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-changes-hour">
              {stats?.changesInLastHour || 0} / {stats?.maxChangesPerHour || 10}
            </div>
            <p className="text-xs text-muted-foreground">
              Hourly limit
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-changes-day">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Changes (Day)</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-changes-day">
              {stats?.changesInLastDay || 0} / {stats?.maxDailyChanges || 50}
            </div>
            <p className="text-xs text-muted-foreground">
              Daily limit
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-pending">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Proposals</CardTitle>
            <FileCode className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {stats?.pendingProposalCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting review
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="proposals" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="proposals" data-testid="tab-proposals">Change Proposals</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Editing Rules</TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety">Safety Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending Change Proposals</CardTitle>
              <CardDescription>
                Review and approve Trinity's proposed code changes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No pending change proposals</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {proposals.map((proposal) => (
                    <Card key={proposal.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedProposal(proposal)} data-testid={`card-proposal-${proposal.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {getStatusBadge(proposal.status)}
                              {getSandboxBadge(proposal.sandboxStatus)}
                              <Badge variant="outline">{proposal.permissionTier}</Badge>
                              <Badge variant="outline" className="gap-1">
                                <GitBranch className="w-3 h-3" />
                                {(proposal.confidenceScore * 100).toFixed(0)}% confidence
                              </Badge>
                            </div>
                            <p className="text-sm font-medium mb-1">{proposal.reasoning.slice(0, 100)}...</p>
                            <p className="text-xs text-muted-foreground">
                              {proposal.proposedChanges.length} file(s) · {new Date(proposal.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" className="gap-1" data-testid={`button-view-${proposal.id}`}>
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Current Editing Rules
              </CardTitle>
              <CardDescription>
                Configuration for Trinity's self-editing permissions and limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Allowed Permission Tiers</Label>
                  <div className="flex gap-2 flex-wrap">
                    {rules?.allowedTiers.map((tier) => (
                      <Badge key={tier} variant="default">{tier}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Requires Human Approval</Label>
                  <div className="flex gap-2 flex-wrap">
                    {rules?.requireHumanApprovalFor.map((tier) => (
                      <Badge key={tier} variant="destructive">{tier}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Confidence Threshold</Label>
                  <div className="text-2xl font-bold">{((rules?.confidenceThreshold || 0.9) * 100).toFixed(0)}%</div>
                  <p className="text-xs text-muted-foreground">Minimum for auto-approval</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Max Changes Per Hour</Label>
                  <div className="text-2xl font-bold">{rules?.maxChangesPerHour || 10}</div>
                  <p className="text-xs text-muted-foreground">Hourly rate limit</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Max Changes Per Day</Label>
                  <div className="text-2xl font-bold">{rules?.maxDailyChanges || 50}</div>
                  <p className="text-xs text-muted-foreground">Daily rate limit</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center space-x-2">
                  <Switch checked={rules?.sandboxRequired} disabled />
                  <Label>Sandbox Required</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={rules?.testingRequired} disabled />
                  <Label>Testing Required</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={rules?.gitTrackingRequired} disabled />
                  <Label>Git Tracking Required</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Blocked Paths</Label>
                <ScrollArea className="h-32 rounded-md border p-2">
                  <div className="space-y-1">
                    {rules?.blockedPaths.map((path, i) => (
                      <code key={i} className="block text-xs bg-muted px-2 py-1 rounded">{path}</code>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Circuit Breaker Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Status</span>
                  <Badge variant={circuitState?.isOpen ? 'destructive' : 'default'}>
                    {circuitState?.isOpen ? 'OPEN (Blocked)' : 'CLOSED (Active)'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Error Rate</span>
                  <span>{((circuitState?.errorRate || 0) * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Changes (Last Hour)</span>
                  <span>{circuitState?.changesInLastHour || 0}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Changes (Last Day)</span>
                  <span>{circuitState?.changesInLastDay || 0}</span>
                </div>
                {circuitState?.lastError && (
                  <div className="text-sm text-destructive">
                    Last Error: {circuitState.lastError}
                  </div>
                )}
                {circuitState?.isOpen && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => resetCircuitBreakerMutation.mutate()}
                    disabled={resetCircuitBreakerMutation.isPending}
                    data-testid="button-reset-circuit-breaker-2"
                  >
                    {resetCircuitBreakerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                    Reset Circuit Breaker
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Safety Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Sandbox Testing Before Deploy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Git-Tracked All Changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Automatic Rollback on Errors</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Confidence Thresholds (90%+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Human Approval for High-Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Rate Limiting (Hourly/Daily)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Protected Paths Blocklist</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Dangerous Pattern Detection</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <UniversalModal open={!!selectedProposal} onOpenChange={() => setSelectedProposal(null)}>
        <UniversalModalContent size="full" className="max-h-[80dvh] sm:max-h-[90dvh] overflow-y-auto" data-testid="dialog-proposal-detail">
          {selectedProposal && (
            <>
              <UniversalModalHeader>
                <UniversalModalTitle className="flex items-center gap-2">
                  <FileCode className="w-5 h-5" />
                  Change Proposal
                </UniversalModalTitle>
                <UniversalModalDescription>
                  Review the proposed changes and take action
                </UniversalModalDescription>
              </UniversalModalHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(selectedProposal.status)}
                  {getSandboxBadge(selectedProposal.sandboxStatus)}
                  <Badge variant="outline">{selectedProposal.permissionTier}</Badge>
                  <Badge variant="outline">
                    {(selectedProposal.confidenceScore * 100).toFixed(0)}% confidence
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium">Reasoning</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{selectedProposal.reasoning}</p>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium">Proposed Changes ({selectedProposal.proposedChanges.length} files)</Label>
                  <ScrollArea className="h-48 rounded-md border">
                    <div className="p-3 space-y-2">
                      {selectedProposal.proposedChanges.map((change, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 bg-muted/50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" size="sm">{change.operation}</Badge>
                            <code className="text-xs">{change.file}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{change.lineCount} lines</span>
                            {getRiskBadge(change.riskLevel)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {selectedProposal.testResults && selectedProposal.testResults.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-medium">Test Results</Label>
                    <div className="space-y-1">
                      {selectedProposal.testResults.map((test, i) => (
                        <div key={i} className="flex items-center justify-between gap-1 text-sm">
                          <span className="flex items-center gap-2">
                            {test.passed ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            {test.testName}
                          </span>
                          <span className="text-muted-foreground">{test.duration}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <UniversalModalFooter className="gap-2 flex-wrap">
                {selectedProposal.sandboxStatus === 'idle' && (
                  <Button
                    variant="secondary"
                    onClick={() => runSandboxMutation.mutate(selectedProposal.id)}
                    disabled={runSandboxMutation.isPending}
                    className="gap-2"
                    data-testid="button-run-sandbox"
                  >
                    {runSandboxMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    Run Sandbox Tests
                  </Button>
                )}

                {selectedProposal.status === 'pending' && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                      className="gap-2"
                      data-testid="button-reject-proposal"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => approveMutation.mutate(selectedProposal.id)}
                      disabled={approveMutation.isPending}
                      className="gap-2"
                      data-testid="button-approve-proposal"
                    >
                      {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </Button>
                  </>
                )}

                {selectedProposal.status === 'approved' && (
                  <Button
                    onClick={() => applyMutation.mutate(selectedProposal.id)}
                    disabled={applyMutation.isPending || selectedProposal.sandboxStatus !== 'passed'}
                    className="gap-2"
                    data-testid="button-apply-changes"
                  >
                    {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Apply Changes
                  </Button>
                )}

                // @ts-ignore — TS migration: fix in refactoring sprint
                {(selectedProposal as any).rollbackHash && (
                  <Button
                    variant="outline"
                    onClick={() => rollbackMutation.mutate(selectedProposal.id)}
                    disabled={rollbackMutation.isPending}
                    className="gap-2"
                    data-testid="button-rollback"
                  >
                    {rollbackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Rollback
                  </Button>
                )}
              </UniversalModalFooter>
            </>
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <UniversalModalContent size="md" data-testid="dialog-reject">
          <UniversalModalHeader>
            <UniversalModalTitle>Reject Proposal</UniversalModalTitle>
            <UniversalModalDescription>
              Please provide a reason for rejecting this change proposal.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-24"
            data-testid="input-reject-reason"
          />
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedProposal && rejectReason) {
                  rejectMutation.mutate({ proposalId: selectedProposal.id, reason: rejectReason });
                }
              }}
              disabled={!rejectReason || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
