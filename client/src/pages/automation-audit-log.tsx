/**
 * Automation Audit Log - View history of all Trinity™ automation runs
 * Connected to real-time automation events API
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, Calendar, DollarSign, Users, AlertCircle, CheckCircle, Clock, 
  RefreshCw, XCircle, SkipForward, Zap, Mail, Bell, Shield, Trash2, Loader2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

interface AutomationEvent {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  workspaceId?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: {
    processed?: number;
    skipped?: number;
    failed?: number;
    message?: string;
  };
  error?: string;
  retryCount: number;
  canRetry: boolean;
}

interface AutomationStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  successRate: number;
  lastRun: string | null;
  averageDuration: number;
}

interface AutomationJob {
  type: string;
  label: string;
  schedule: string;
  enabled: boolean;
}

export default function AutomationAuditLog() {
  const { toast } = useToast();

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<{
    success: boolean;
    events: AutomationEvent[];
    count: number;
  }>({
    queryKey: ['/api/automation-events/events'],
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    success: boolean;
    stats: Record<string, AutomationStats>;
    summary: {
      totalJobsToday: number;
      successfulToday: number;
      failedToday: number;
      overallSuccessRate: number;
    };
  }>({
    queryKey: ['/api/automation-events/stats'],
  });

  const { data: jobsData } = useQuery<{
    success: boolean;
    jobs: AutomationJob[];
  }>({
    queryKey: ['/api/automation-events/jobs'],
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/automation-events/retry/${jobId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Retry Queued',
        description: 'The job will be retried shortly.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation-events'] });
      refetchEvents();
    },
    onError: (error) => {
      toast({
        title: 'Retry Failed',
        description: error.message || 'Could not retry the job.',
        variant: 'destructive',
      });
    },
  });

  const events = eventsData?.events || [];
  const summary = statsData?.summary || { totalJobsToday: 0, successfulToday: 0, failedToday: 0, overallSuccessRate: 100 };
  const jobs = jobsData?.jobs || [];

  const getEventIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      invoicing: <FileText className="h-4 w-4" />,
      payroll: <DollarSign className="h-4 w-4" />,
      scheduling: <Calendar className="h-4 w-4" />,
      compliance: <Shield className="h-4 w-4" />,
      cleanup: <Trash2 className="h-4 w-4" />,
      email_automation: <Mail className="h-4 w-4" />,
      shift_reminders: <Bell className="h-4 w-4" />,
      platform_monitor: <Zap className="h-4 w-4" />,
    };
    return icons[type] || <Clock className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400">Running</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobLabel = (type: string) => {
    const job = jobs.find(j => j.type === type);
    return job?.label || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const pageConfig: CanvasPageConfig = {
    id: 'automation-audit-log',
    title: 'Automation Audit Log',
    subtitle: 'Real-time visibility into all Trinity™ automation runs',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card data-testid="card-total-jobs">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold truncate">{summary.totalJobsToday}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Jobs Today</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-successful-jobs">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600 truncate">{summary.successfulToday}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Successful</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-failed-jobs">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-red-600 truncate">{summary.failedToday}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-success-rate">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold truncate">{summary.overallSuccessRate}%</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Success Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="events" data-testid="tab-events">Recent Events</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Scheduled Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Automation Events</CardTitle>
              <CardDescription>Real-time log of all automation job executions with retry controls</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[min(500px,60dvh)]">
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-center py-12 space-y-3" data-testid="empty-events">
                    <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground opacity-30" />
                    <div className="text-muted-foreground">
                      No automation events recorded yet. Jobs will appear here when they run.
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Automation jobs run on schedule - invoices nightly, payroll biweekly, schedules weekly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="p-4 border rounded-lg hover-elevate"
                        data-testid={`event-${event.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-0.5 text-primary">
                              {getEventIcon(event.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{getJobLabel(event.type)}</div>
                              {event.result?.message && (
                                <div className="text-sm text-muted-foreground truncate">
                                  {event.result.message}
                                </div>
                              )}
                              {event.error && (
                                <div className="text-sm text-red-600 dark:text-red-400 truncate">
                                  Error: {event.error}
                                </div>
                              )}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span>{format(new Date(event.startedAt), 'PPp')}</span>
                                {event.duration && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(event.duration)}
                                  </span>
                                )}
                                {event.retryCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3" />
                                    Retry #{event.retryCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {getStatusBadge(event.status)}
                            {event.status === 'failed' && event.canRetry && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => retryMutation.mutate(event.id)}
                                disabled={retryMutation.isPending}
                                data-testid={`button-retry-${event.id}`}
                              >
                                <RefreshCw className={`h-3 w-3 mr-1 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                                Retry
                              </Button>
                            )}
                          </div>
                        </div>
                        {event.result?.processed !== undefined && (
                          <div className="flex gap-4 mt-2 pt-2 border-t text-xs text-muted-foreground">
                            <span className="text-green-600">Processed: {event.result.processed}</span>
                            {event.result.skipped !== undefined && event.result.skipped > 0 && (
                              <span className="text-yellow-600">Skipped: {event.result.skipped}</span>
                            )}
                            {event.result.failed !== undefined && event.result.failed > 0 && (
                              <span className="text-red-600">Failed: {event.result.failed}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Automation Jobs</CardTitle>
              <CardDescription>All configured automation jobs and their schedules</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map((job) => (
                  <div
                    key={job.type}
                    className="p-4 border rounded-lg flex items-center gap-4"
                    data-testid={`job-${job.type}`}
                  >
                    <div className="text-primary">
                      {getEventIcon(job.type)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{job.label}</div>
                      <div className="text-sm text-muted-foreground">{job.schedule}</div>
                    </div>
                    <Badge variant={job.enabled ? 'default' : 'secondary'}>
                      {job.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
