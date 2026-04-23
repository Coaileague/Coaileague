/**
 * AI COMMAND CENTER - Universal Trinity™ Dashboard
 * 
 * Mobile-first responsive page showing Trinity's unified intelligence:
 * - Global health and status
 * - Cross-organizational learnings  
 * - Pending approvals across all features
 * - Token usage and costs
 * - Automation logs and audit trail
 * - Agent Activity (Agent Spawning System — Phase 6)
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Zap,
  Users,
  BarChart3,
  Sparkles,
  Activity,
  Shield,
  Globe,
  Bot,
  ListChecks,
  AlertTriangle,
  RotateCcw,
  ThumbsUp,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  Lock,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthJobs {
  total: number;
  completed: number;
  failed: number;
  avgExecutionTime: number;
  totalTokens: number;
}

interface HealthData {
  jobs: HealthJobs;
  globalPatterns: number;
  solutions: number;
}

interface Approval {
  id: string;
  skill: string;
  status: string;
  createdAt: string;
  summary?: string;
}

interface Pattern {
  id: string;
  name: string;
  confidence: number;
  appliedCount: number;
  category: string;
}

interface Job {
  id: string;
  skill: string;
  status: string;
  createdAt: string;
  executionTimeMs?: number;
}

interface AgentTask {
  id: string;
  agent_key: string;
  agent_name?: string;
  task_type: string;
  status: string;
  retry_count?: number;
  max_retries?: number;
  completion_score?: number;
  confidence_level?: string;
  evaluation_result?: string;
  trinity_evaluation?: string;
  flags?: string[];
  related_entity_type?: string;
  related_entity_id?: string;
  spawned_at: string;
  completed_at?: string;
  evaluated_at?: string;
  spawned_by?: string;
}

interface AgentRegistryEntry {
  id: string;
  agent_key: string;
  agent_name: string;
  domain: string;
  completion_criteria?: { min_score?: number };
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const pageConfig: CanvasPageConfig = {
  id: "ai-command-center",
  title: "AI Command Center",
  subtitle: "Powered by Trinity\u2122 - Learning from all organizations",
  category: "admin",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  re_tasked: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  complete: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  escalated: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AICommandCenter() {
  const { user } = useAuth();
  const workspaceRole = (user as any)?.workspaceRole || '';

  const isFullAccess = ['org_owner', 'co_owner'].includes(workspaceRole);
  const isManagement = ['org_owner', 'co_owner', 'department_manager'].includes(workspaceRole);
  const isSupervisor = workspaceRole === 'supervisor';
  const canViewAgentActivity = isManagement || isSupervisor;

  const { data: healthData, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ['/api/ai-brain/health'],
  });

  const { data: approvals, isLoading: approvalsLoading } = useQuery<Approval[]>({
    queryKey: ['/api/ai-brain/approvals'],
  });

  const { data: patterns, isLoading: patternsLoading } = useQuery<Pattern[]>({
    queryKey: ['/api/ai-brain/patterns'],
  });

  const { data: recentJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/ai-brain/jobs/recent'],
  });

  const { data: escalationCount } = useQuery<{ count: number }>({
    queryKey: ['/api/agent-activity/escalations/count'],
    enabled: isManagement,
  });
  const approvalCount = approvals?.length ?? 0;
  const patternCount = patterns?.length ?? 0;
  const recentJobCount = recentJobs?.length ?? 0;

  return (
    <CanvasHubPage config={pageConfig}>
      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <p className="font-semibold">Command center context</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                This page is your top-level view into Trinity health, approvals, learned patterns, and agent activity. Low counts here can mean the platform is stable or still early in adoption, not that automation is disconnected.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4 lg:w-[34rem]">
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Approvals</p>
                <p className="mt-1 text-sm font-medium">{approvalCount}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Patterns</p>
                <p className="mt-1 text-sm font-medium">{patternCount}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent jobs</p>
                <p className="mt-1 text-sm font-medium">{recentJobCount}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Escalations</p>
                <p className="mt-1 text-sm font-medium">{escalationCount?.count ?? 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-6">
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Total Jobs"
          value={healthData?.jobs?.total || 0}
          loading={healthLoading}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Success Rate"
          value={(healthData?.jobs?.total ?? 0) > 0 
            ? `${Math.round(((healthData?.jobs?.completed ?? 0) / (healthData?.jobs?.total ?? 1)) * 100)}%`
            : '0%'}
          loading={healthLoading}
        />
        <StatCard
          icon={<Globe className="w-5 h-5" />}
          label="Global Patterns"
          value={healthData?.globalPatterns || 0}
          loading={healthLoading}
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Validated Solutions"
          value={healthData?.solutions || 0}
          loading={healthLoading}
        />
      </div>

      <div className="space-y-6">
          
          {/* Tabs for different views */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className={`grid w-full ${canViewAgentActivity ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} lg:w-auto`}>
              <TabsTrigger value="overview" data-testid="tab-overview">
                Overview
              </TabsTrigger>
              <TabsTrigger value="approvals" data-testid="tab-approvals">
                Approvals
                {approvals && approvals.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{approvals.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="learnings" data-testid="tab-learnings">
                Learnings
              </TabsTrigger>
              <TabsTrigger value="jobs" data-testid="tab-jobs">
                Jobs
              </TabsTrigger>
              {canViewAgentActivity && (
                <TabsTrigger value="agent-activity" data-testid="tab-agent-activity">
                  <Bot className="w-3.5 h-3.5 mr-1" />
                  Agents
                  {(escalationCount?.count ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-2">{escalationCount!.count}</Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {/* Trinity™ Health */}
              <Card data-testid="card-brain-health">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span>Trinity™ Health</span>
                      </CardTitle>
                      <CardDescription>
                        System status and performance metrics
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                      <Activity className="w-3 h-3 mr-1" />
                      Operational
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {healthLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <MetricCard
                        label="Completed Jobs"
                        value={healthData?.jobs?.completed || 0}
                        icon={<CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />}
                      />
                      <MetricCard
                        label="Failed Jobs"
                        value={healthData?.jobs?.failed || 0}
                        icon={<AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
                      />
                      <MetricCard
                        label="Avg Execution Time"
                        value={healthData?.jobs?.avgExecutionTime 
                          ? `${Math.round(healthData.jobs.avgExecutionTime)}ms`
                          : 'N/A'}
                        icon={<Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Token Usage */}
              <Card data-testid="card-token-usage">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <span>Token Usage</span>
                  </CardTitle>
                  <CardDescription>
                    AI processing costs and efficiency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {healthLoading ? (
                    <div className="h-20 flex items-center justify-center">
                      <div className="text-sm text-muted-foreground">Checking current token processing totals...</div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xl sm:text-3xl font-bold text-foreground truncate">
                          {(healthData?.jobs?.totalTokens || 0).toLocaleString()}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                          Total tokens processed
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs sm:text-sm text-muted-foreground">Model</div>
                        <div className="text-xs sm:text-base font-medium text-foreground">Trinity AI</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Approvals Tab */}
            <TabsContent value="approvals" className="space-y-4">
              <Card data-testid="card-pending-approvals">
                <CardHeader>
                  <CardTitle>Pending Approvals</CardTitle>
                  <CardDescription>
                    AI jobs requiring human review across all features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {approvalsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : approvals && approvals.length > 0 ? (
                    <div className="space-y-3">
                      {approvals.map((approval: any) => (
                        <ApprovalCard key={approval.id} approval={approval} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <CheckCircle className="w-12 h-12 text-green-500 dark:text-green-400 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">All caught up!</p>
                      <p className="text-sm text-muted-foreground">No pending approvals</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Learnings Tab */}
            <TabsContent value="learnings" className="space-y-4">
              <Card data-testid="card-global-learnings">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span>Cross-Organizational Learnings</span>
                  </CardTitle>
                  <CardDescription>
                    Patterns and solutions learned from all workspaces
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {patternsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : patterns && patterns.length > 0 ? (
                    <div className="space-y-3">
                      {patterns.map((pattern: any) => (
                        <PatternCard key={pattern.id} pattern={pattern} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-muted-foreground">No patterns discovered yet</p>
                      <p className="text-sm text-muted-foreground">Trinity™ is learning...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs" className="space-y-4">
              <Card data-testid="card-recent-jobs">
                <CardHeader>
                  <CardTitle>Recent Jobs</CardTitle>
                  <CardDescription>
                    Latest AI operations across all features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {jobsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : recentJobs && recentJobs.length > 0 ? (
                    <div className="space-y-2">
                      {recentJobs.map((job: any) => (
                        <JobCard key={job.id} job={job} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">No recent jobs</p>
                      <p className="text-sm text-muted-foreground">Recent orchestration work will appear here after new AI jobs, approvals, or automations run.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Agent Activity Tab */}
            {canViewAgentActivity && (
              <TabsContent value="agent-activity" className="space-y-4">
                <AgentActivityTab
                  isFullAccess={isFullAccess}
                  isManagement={isManagement}
                  isSupervisor={isSupervisor}
                />
              </TabsContent>
            )}
          </Tabs>
      </div>
    </CanvasHubPage>
  );
}

// ─── Agent Activity Tab ───────────────────────────────────────────────────────

function AgentActivityTab({
  isFullAccess,
  isManagement,
  isSupervisor,
}: {
  isFullAccess: boolean;
  isManagement: boolean;
  isSupervisor: boolean;
}) {
  const { toast } = useToast();

  const { data: activeTasks, isLoading: activeLoading } = useQuery<AgentTask[]>({
    queryKey: ['/api/agent-activity/active'],
    enabled: isManagement,
    refetchInterval: 15000,
  });

  const { data: completions, isLoading: completionsLoading } = useQuery<AgentTask[]>({
    queryKey: ['/api/agent-activity/completions'],
    refetchInterval: 30000,
  });

  const { data: escalations, isLoading: escalationsLoading } = useQuery<AgentTask[]>({
    queryKey: ['/api/agent-activity/escalations'],
    enabled: isManagement,
  });

  const { data: registry, isLoading: registryLoading } = useQuery<AgentRegistryEntry[]>({
    queryKey: ['/api/agent-activity/registry'],
    enabled: isFullAccess,
  });

  const approveMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest('POST', `/api/agent-activity/escalations/${taskId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/escalations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/escalations/count'] });
      toast({ title: 'Task approved', description: 'Agent decision approved by management.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to approve task.', variant: 'destructive' }),
  });

  const dismissMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest('POST', `/api/agent-activity/escalations/${taskId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/escalations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/escalations/count'] });
      toast({ title: 'Task dismissed', description: 'Escalation dismissed.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to dismiss task.', variant: 'destructive' }),
  });

  const retaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest('POST', `/api/agent-activity/escalations/${taskId}/retask`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/escalations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/active'] });
      toast({ title: 'Agent retasked', description: 'A new task has been spawned.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to retask agent.', variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ agentKey, isActive }: { agentKey: string; isActive: boolean }) =>
      apiRequest('PATCH', `/api/agent-activity/registry/${agentKey}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent-activity/registry'] });
      toast({ title: 'Agent updated', description: 'Agent status changed.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to toggle agent.', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      {/* Panel 1: Active Tasks (management only) */}
      {isManagement && (
        <Card data-testid="card-active-agent-tasks">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Active Agent Tasks</span>
            </CardTitle>
            <CardDescription>Tasks currently running or queued</CardDescription>
          </CardHeader>
          <CardContent>
            {activeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : activeTasks && activeTasks.length > 0 ? (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <AgentTaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ListChecks className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No active tasks right now</p>
                <p className="text-xs text-muted-foreground">That usually means the current queue is healthy and agents are not waiting on action.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Panel 2: Recent Completions (all roles) */}
      <Card data-testid="card-agent-completions">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span>Recent Completions</span>
          </CardTitle>
          <CardDescription>Last 20 completed or escalated agent tasks</CardDescription>
        </CardHeader>
        <CardContent>
          {completionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : completions && completions.length > 0 ? (
            <div className="space-y-2">
              {completions.map((task) => (
                <AgentTaskRow key={task.id} task={task} showScore />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No completed tasks yet</p>
              <p className="text-xs text-muted-foreground">Completed agent work will show up here after the first routed tasks finish or are escalated.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel 3: Escalations (management only) */}
      {isManagement && (
        <Card data-testid="card-agent-escalations">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              <span>Escalated to Management</span>
            </CardTitle>
            <CardDescription>Tasks the agent could not resolve — your action needed</CardDescription>
          </CardHeader>
          <CardContent>
            {escalationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : escalations && escalations.length > 0 ? (
              <div className="space-y-3">
                {escalations.map((task) => (
                  <div key={task.id}
                    className="border border-orange-200 dark:border-orange-900/50 rounded-md p-4 space-y-3"
                    data-testid={`escalation-${task.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline">{task.agent_name || task.agent_key}</Badge>
                      <Badge variant="outline" className="text-xs">{task.task_type.replace(/_/g, ' ')}</Badge>
                      {task.completion_score != null && (
                        <Badge variant="secondary" className="text-xs">
                          Score: {task.completion_score}
                        </Badge>
                      )}
                    </div>
                    {task.trinity_evaluation && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.trinity_evaluation}</p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {task.evaluated_at
                        ? format(new Date(task.evaluated_at), 'MMM dd, yyyy h:mm a')
                        : format(new Date(task.spawned_at), 'MMM dd, yyyy h:mm a')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        data-testid={`button-approve-escalation-${task.id}`}
                        onClick={() => approveMutation.mutate(task.id)}
                        disabled={approveMutation.isPending}
                      >
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-retask-escalation-${task.id}`}
                        onClick={() => retaskMutation.mutate(task.id)}
                        disabled={retaskMutation.isPending}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Retask
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-dismiss-escalation-${task.id}`}
                        onClick={() => dismissMutation.mutate(task.id)}
                        disabled={dismissMutation.isPending}
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No escalations pending</p>
                <p className="text-xs text-muted-foreground">Management intervention is not currently required.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Panel 4: Agent Registry (org_owner / co_owner only) */}
      {isFullAccess && (
        <Card data-testid="card-agent-registry">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-primary" />
              <span>Agent Registry</span>
            </CardTitle>
            <CardDescription>Manage which agents are active for your organization</CardDescription>
          </CardHeader>
          <CardContent>
            {registryLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : registry && registry.length > 0 ? (
              <div className="space-y-2">
                {registry.map((agent) => (
                  <div key={agent.id}
                    className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-md"
                    data-testid={`registry-agent-${agent.agent_key}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{agent.agent_name}</span>
                        {agent.is_default && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{agent.domain}</Badge>
                      </div>
                      {agent.completion_criteria?.min_score != null && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Min score: {agent.completion_criteria.min_score}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={agent.is_active ? 'default' : 'outline'}
                      data-testid={`button-toggle-agent-${agent.agent_key}`}
                      onClick={() => toggleMutation.mutate({ agentKey: agent.agent_key, isActive: !agent.is_active })}
                      disabled={toggleMutation.isPending}
                    >
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No agents registered</p>
                <p className="text-xs text-muted-foreground">Agent registry entries will appear here after organization-level agent configuration is enabled.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supervisor: locked panels notice */}
      {isSupervisor && !isManagement && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-6">
            <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Active tasks, escalations, and agent registry are available to managers and above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Agent Task Row ───────────────────────────────────────────────────────────

function AgentTaskRow({ task, showScore }: { task: AgentTask; showScore?: boolean }) {
  const statusClass = TASK_STATUS_COLORS[task.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';

  return (
    <div
      className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-md"
      data-testid={`agent-task-${task.id}`}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">
            {task.agent_name || task.agent_key}
          </span>
          <Badge className={`text-xs ${statusClass}`}>
            {task.status.replace(/_/g, ' ')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {task.task_type.replace(/_/g, ' ')}
          </Badge>
          {showScore && task.completion_score != null && (
            <Badge variant="secondary" className="text-xs">
              {task.completion_score}%
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(task.spawned_at), 'MMM dd, h:mm a')}
          {task.related_entity_type && (
            <span className="ml-2">&middot; {task.related_entity_type}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Sub-Components ────────────────────────────────────────────────────

function StatCard({ icon, label, value, loading }: any) {
  return (
    <Card className="p-3 lg:p-4">
      <div className="flex items-center space-x-2 mb-1">
        <span className="text-primary">{icon}</span>
        <span className="text-xs lg:text-sm text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 flex items-center">
          <div className="text-sm text-muted-foreground">Loading current command metrics...</div>
        </div>
      ) : (
        <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground truncate">{value}</div>
      )}
    </Card>
  );
}

function MetricCard({ label, value, icon }: any) {
  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-base sm:text-xl font-bold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: any }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors" data-testid={`approval-${approval.id}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
            <Badge variant="outline">{approval.skill.replace('_', ' ')}</Badge>
            <Badge variant="secondary">
              Confidence: {(approval.confidenceScore * 100).toFixed(0)}%
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Created {format(new Date(approval.createdAt), 'MMM dd, yyyy h:mm a')}
          </div>
        </div>
        <div className="flex space-x-2 flex-wrap gap-1">
          <Button variant="default" size="sm" className="bg-green-600" data-testid={`button-approve-${approval.id}`}>
            <CheckCircle className="w-4 h-4 mr-1" />
            Approve
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" data-testid={`button-reject-${approval.id}`}>
            <AlertCircle className="w-4 h-4 mr-1" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

function PatternCard({ pattern }: { pattern: any }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4" data-testid={`pattern-${pattern.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1 flex-wrap gap-1">
            <Badge variant="outline">{pattern.patternType}</Badge>
            {pattern.validated && (
              <Badge variant="default" className="bg-green-600">Validated</Badge>
            )}
          </div>
          <p className="text-sm text-foreground font-medium">{pattern.description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-3 flex-wrap gap-2">
        <div className="flex items-center space-x-1">
          <Users className="w-3 h-3" />
          <span>{pattern.occurrences} occurrences</span>
        </div>
        <div className="flex items-center space-x-1">
          <Globe className="w-3 h-3" />
          <span>{pattern.affectedWorkspaces} workspaces</span>
        </div>
        {pattern.hasSolution && (
          <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
            <Sparkles className="w-3 h-3" />
            <span>Solution available</span>
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    running: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    requires_approval: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
  };

  return (
    <div className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700" data-testid={`job-${job.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1 flex-wrap gap-1">
          <Badge variant="outline" className="text-xs">{job.skill.replace('_', ' ')}</Badge>
          <Badge className={`text-xs ${statusColors[job.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
            {job.status.replace('_', ' ')}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {format(new Date(job.createdAt), 'MMM dd, h:mm a')}
        </div>
      </div>
      {job.executionTimeMs && (
        <div className="text-xs text-muted-foreground ml-4">
          {job.executionTimeMs}ms
        </div>
      )}
    </div>
  );
}
