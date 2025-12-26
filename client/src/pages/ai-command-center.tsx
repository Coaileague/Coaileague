/**
 * AI COMMAND CENTER - Universal Trinity™ Dashboard
 * 
 * Mobile-first responsive page showing Trinity's unified intelligence:
 * - Global health and status
 * - Cross-organizational learnings  
 * - Pending approvals across all features
 * - Token usage and costs
 * - Automation logs and audit trail
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Globe
} from "lucide-react";
import { format } from "date-fns";

export default function AICommandCenter() {
  // Fetch Trinity™ health metrics
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['/api/ai-brain/health'],
  });

  // Fetch pending approvals
  const { data: approvals, isLoading: approvalsLoading } = useQuery({
    queryKey: ['/api/ai-brain/approvals'],
  });

  // Fetch global patterns
  const { data: patterns, isLoading: patternsLoading } = useQuery({
    queryKey: ['/api/ai-brain/patterns'],
  });

  // Fetch recent jobs
  const { data: recentJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['/api/ai-brain/jobs/recent'],
  });

  return (
    <div className="flex flex-col h-full">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">AI Command Center</h1>
              <p className="text-blue-100 text-sm lg:text-base">
                Powered by Trinity™ - Learning from all organizations
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Total Jobs"
              value={healthData?.jobs?.total || 0}
              loading={healthLoading}
            />
            <StatCard
              icon={<CheckCircle className="w-5 h-5" />}
              label="Success Rate"
              value={healthData?.jobs?.total > 0 
                ? `${Math.round((healthData.jobs.completed / healthData.jobs.total) * 100)}%`
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
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 lg:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Tabs for different views */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto">
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
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {/* Trinity™ Health */}
              <Card data-testid="card-brain-health">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <span>Trinity™ Health</span>
                      </CardTitle>
                      <CardDescription>
                        System status and performance metrics
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
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
                        icon={<CheckCircle className="w-4 h-4 text-green-600" />}
                      />
                      <MetricCard
                        label="Failed Jobs"
                        value={healthData?.jobs?.failed || 0}
                        icon={<AlertCircle className="w-4 h-4 text-red-600" />}
                      />
                      <MetricCard
                        label="Avg Execution Time"
                        value={healthData?.jobs?.avgExecutionTime 
                          ? `${Math.round(healthData.jobs.avgExecutionTime)}ms`
                          : 'N/A'}
                        icon={<Clock className="w-4 h-4 text-blue-600" />}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Token Usage */}
              <Card data-testid="card-token-usage">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-amber-600" />
                    <span>Token Usage</span>
                  </CardTitle>
                  <CardDescription>
                    AI processing costs and efficiency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {healthLoading ? (
                    <div className="h-20 flex items-center justify-center">
                      <div className="text-sm text-gray-500">Loading...</div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-bold text-gray-900">
                          {(healthData?.jobs?.totalTokens || 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Total tokens processed
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Model</div>
                        <div className="font-medium text-gray-900">Trinity AI Engine</div>
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
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">All caught up!</p>
                      <p className="text-sm text-gray-500">No pending approvals</p>
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
                    <Globe className="w-5 h-5 text-blue-600" />
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
                      <p className="text-gray-600">No patterns discovered yet</p>
                      <p className="text-sm text-gray-500">Trinity™ is learning...</p>
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
                      <p className="text-gray-600">No recent jobs</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component (used in header)
function StatCard({ icon, label, value, loading }: any) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-3 lg:p-4">
      <div className="flex items-center space-x-2 mb-1">
        {icon}
        <span className="text-xs lg:text-sm text-blue-100">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 flex items-center">
          <div className="text-sm text-blue-100">Loading...</div>
        </div>
      ) : (
        <div className="text-2xl lg:text-3xl font-bold">{value}</div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({ label, value, icon }: any) {
  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs text-gray-600">{label}</div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

// Approval Card Component
function ApprovalCard({ approval }: { approval: any }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors" data-testid={`approval-${approval.id}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Badge variant="outline">{approval.skill.replace('_', ' ')}</Badge>
            <Badge variant="secondary">
              Confidence: {(approval.confidenceScore * 100).toFixed(0)}%
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            Created {format(new Date(approval.createdAt), 'MMM dd, yyyy h:mm a')}
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700" data-testid={`button-approve-${approval.id}`}>
            <CheckCircle className="w-4 h-4 mr-1" />
            Approve
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" data-testid={`button-reject-${approval.id}`}>
            <AlertCircle className="w-4 h-4 mr-1" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

// Pattern Card Component
function PatternCard({ pattern }: { pattern: any }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4" data-testid={`pattern-${pattern.id}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <Badge variant="outline">{pattern.patternType}</Badge>
            {pattern.validated && (
              <Badge variant="default" className="bg-green-600">Validated</Badge>
            )}
          </div>
          <p className="text-sm text-gray-900 font-medium">{pattern.description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-xs text-gray-600 mt-3">
        <div className="flex items-center space-x-1">
          <Users className="w-3 h-3" />
          <span>{pattern.occurrences} occurrences</span>
        </div>
        <div className="flex items-center space-x-1">
          <Globe className="w-3 h-3" />
          <span>{pattern.affectedWorkspaces} workspaces</span>
        </div>
        {pattern.hasSolution && (
          <div className="flex items-center space-x-1 text-green-600">
            <Sparkles className="w-3 h-3" />
            <span>Solution available</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Job Card Component
function JobCard({ job }: { job: any }) {
  const statusColors = {
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    running: 'bg-blue-100 text-blue-700',
    requires_approval: 'bg-orange-100 text-orange-700'
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200" data-testid={`job-${job.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <Badge variant="outline" className="text-xs">{job.skill.replace('_', ' ')}</Badge>
          <Badge className={`text-xs ${statusColors[job.status] || 'bg-gray-100 text-gray-700'}`}>
            {job.status.replace('_', ' ')}
          </Badge>
        </div>
        <div className="text-xs text-gray-600 truncate">
          {format(new Date(job.createdAt), 'MMM dd, h:mm a')}
        </div>
      </div>
      {job.executionTimeMs && (
        <div className="text-xs text-gray-600 ml-4">
          {job.executionTimeMs}ms
        </div>
      )}
    </div>
  );
}
