import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import type { AiBrainActionLog } from '@shared/schema';
import { 
  Brain, 
  Clock, 
  Search, 
  Filter, 
  ChevronDown, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Activity,
  Shield,
  Database,
  RefreshCw
} from 'lucide-react';

import { SUPPORT_ROLES } from '@shared/platformConfig';

function getResultConfig(result: string | null | undefined): { color: string; icon: typeof CheckCircle2; label: string } {
  const r = (result || '').toLowerCase();
  if (r === 'success' || r === 'completed' || r === 'ok' || r === 'reviewed') {
    return { color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20', icon: CheckCircle2, label: result || 'Success' };
  }
  if (r === 'error' || r === 'failed' || r === 'failure') {
    return { color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', icon: XCircle, label: result || 'Failed' };
  }
  if (r === 'pending' || r === 'running' || r === 'initiated') {
    return { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: Activity, label: result || 'Pending' };
  }
  if (r === 'warning' || r === 'partial') {
    return { color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20', icon: AlertTriangle, label: result || 'Warning' };
  }
  return { color: 'bg-muted text-muted-foreground', icon: Brain, label: result || 'Unknown' };
}

function getDomainColor(actionType: string | null | undefined): string {
  const t = (actionType || '').split('.')[0].toLowerCase();
  switch (t) {
    case 'scheduling': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'payroll': return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'workforce': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    case 'auth': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    case 'billing': return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    case 'compliance': return 'bg-red-500/10 text-red-600 dark:text-red-400';
    case 'analytics': return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
    default: return 'bg-primary/10 text-primary';
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function ActionLogCard({ log, onReview }: { log: AiBrainActionLog; onReview: (id: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const resultConfig = getResultConfig(log.result);
  const ResultIcon = resultConfig?.icon ?? CheckCircle2;
  const domainColor = getDomainColor(log.actorType);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const actionData = log.actionData as Record<string, unknown> | null;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const createdAt = new Date(log.createdAt);
  const timeAgo = getTimeAgo(createdAt);

  const domain = (log.actorType || 'unknown').split('.')[0];
  const action = (log.actorType || 'unknown').split('.').slice(1).join('.');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-full ${domainColor}`}>
                  <Brain className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={domainColor} data-testid={`badge-domain-${log.id}`}>
                      {domain}
                    </Badge>
                    {action && (
                      <span className="text-xs text-muted-foreground font-mono truncate" data-testid={`text-action-${log.id}`}>
                        {action}
                      </span>
                    )}
                    <Badge variant="outline" className={resultConfig.color} data-testid={`badge-result-${log.id}`}>
                      <ResultIcon className="w-3 h-3 mr-1" />
                      {resultConfig.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate" data-testid={`text-id-${log.id}`}>
                    {log.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs whitespace-nowrap">{timeAgo}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {log.workspaceId && (
              <div className="flex items-center gap-2 text-sm">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Workspace:</span>
                <span className="font-mono text-xs">{log.workspaceId}</span>
              </div>
            )}
            {actionData && Object.keys(actionData).length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Action Data</h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(actionData, null, 2)}
                </pre>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-4 border-t">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Created: {createdAt.toLocaleString()}</span>
              </div>
              {(log as any).result !== 'REVIEWED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReview(log.id)}
                  data-testid={`button-review-${log.id}`}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Mark Reviewed
                </Button>
              )}
              {(log as any).result === 'REVIEWED' && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Reviewed
                </Badge>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function AIAuditLogViewer() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');

  const hasAccess = user && SUPPORT_ROLES.includes((user as any).platformRole || '');

  const { data: logsData, isLoading, refetch } = useQuery<{ success: boolean; data: AiBrainActionLog[] }>({
    queryKey: ['/api/ai/audit-logs', domainFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (domainFilter !== 'all') params.set('actionType', domainFilter);
      const url = `/api/ai/audit-logs${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
    enabled: hasAccess,
  });

  const { data: statsData } = useQuery<{ success: boolean; stats: any }>({
    queryKey: ['/api/ai/audit-logs/stats'],
    enabled: hasAccess,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return apiRequest('POST', `/api/ai/audit-logs/${id}/review`, {});
    },
    onSuccess: () => {
      toast({ title: 'Action marked as reviewed' });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/audit-logs/stats'] });
    },
    onError: () => {
      toast({ title: 'Failed to mark as reviewed', variant: 'destructive' });
    },
  });

  const logs = logsData?.data || [];
  const stats = statsData?.stats;

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesType = (log.actorType || '').toLowerCase().includes(searchLower);
        const matchesId = log.id.toLowerCase().includes(searchLower);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const matchesResult = (log.result || '').toLowerCase().includes(searchLower);
        if (!matchesType && !matchesId && !matchesResult) return false;
      }
      if (resultFilter !== 'all') {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const r = (log.result || '').toLowerCase();
        if (resultFilter === 'success' && !['success','completed','ok','reviewed'].includes(r)) return false;
        if (resultFilter === 'error' && !['error','failed','failure'].includes(r)) return false;
        if (resultFilter === 'pending' && !['pending','running','initiated'].includes(r)) return false;
      }
      return true;
    });
  }, [logs, searchQuery, resultFilter]);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              The AI Audit Log Viewer (AALV) is restricted to support staff with appropriate platform roles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'ai-audit-log-viewer',
    title: 'AI Audit Log Viewer',
    subtitle: 'Monitor Trinity™ actions across all workspaces',
    category: 'admin',
  };

  const topDomains = stats?.actionTypeBreakdown
    ? Object.entries(stats.actionTypeBreakdown as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
    : [];

  return (
    <CanvasHubPage config={pageConfig}>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:pt-4 sm:px-6">
              <div className="text-lg sm:text-2xl font-bold truncate" data-testid="stat-total-logs">{stats.totalLogs || 0}</div>
              <div className="text-xs sm:text-sm text-muted-foreground truncate">Total Actions</div>
            </CardContent>
          </Card>
          {topDomains.map(([domain, count]) => (
            <Card key={domain}>
              <CardContent className="p-3 sm:pt-4 sm:px-6">
                <div className="text-lg sm:text-2xl font-bold truncate" data-testid={`stat-domain-${domain}`}>{count}</div>
                <div className="text-xs sm:text-sm text-muted-foreground truncate capitalize">{domain}</div>
              </CardContent>
            </Card>
          ))}
          {topDomains.length < 3 && (
            <Card>
              <CardContent className="p-3 sm:pt-4 sm:px-6">
                <div className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 truncate">
                  {stats.resultBreakdown?.success || stats.resultBreakdown?.completed || 0}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground truncate">Successful</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-logs">
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by action type, ID, or result..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-logs"
                />
              </div>
            </div>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-full md:w-[160px]" data-testid="select-domain-filter">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                <SelectItem value="scheduling">Scheduling</SelectItem>
                <SelectItem value="payroll">Payroll</SelectItem>
                <SelectItem value="workforce">Workforce</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="analytics">Analytics</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="w-full md:w-[140px]" data-testid="select-result-filter">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span data-testid="text-log-count">
          {filteredLogs.length} action{filteredLogs.length !== 1 ? 's' : ''}
          {filteredLogs.length !== logs.length ? ` (filtered from ${logs.length})` : ''}
        </span>
        {isLoading && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Refreshing audit feed...</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        ) : filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium">No Trinity™ actions found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery || domainFilter !== 'all' || resultFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Trinity™ actions will appear here as they occur'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map(log => (
            <ActionLogCard
              key={log.id}
              log={log}
              onReview={(id) => reviewMutation.mutate({ id })}
            />
          ))
        )}
      </div>
    </CanvasHubPage>
  );
}
