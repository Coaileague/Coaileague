import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { AiBrainActionLog } from '@shared/schema';
import { 
  Brain, 
  Code, 
  Clock, 
  Search, 
  Filter, 
  ChevronDown, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Activity,
  Eye,
  MessageSquare,
  Zap,
  Shield,
  Workflow,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle2 },
  INITIATED: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Activity },
  FAILED: { color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: XCircle },
  TIMEOUT: { color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: Clock },
  PENDING_HIL: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: AlertTriangle },
};

const CATEGORY_CONFIG: Record<string, { color: string; icon: typeof Brain }> = {
  PLANNING: { color: 'bg-purple-500/10 text-purple-600', icon: Brain },
  TOOL_USE: { color: 'bg-blue-500/10 text-blue-600', icon: Zap },
  CHECKPOINT: { color: 'bg-green-500/10 text-green-600', icon: CheckCircle2 },
  DIAGNOSTICS: { color: 'bg-orange-500/10 text-orange-600', icon: Activity },
  HIL_WAIT: { color: 'bg-yellow-500/10 text-yellow-600', icon: AlertTriangle },
  AGENTIC_CODING: { color: 'bg-cyan-500/10 text-cyan-600', icon: Code },
};

const ACTOR_CONFIG: Record<string, { color: string; icon: typeof Brain }> = {
  AI_BRAIN: { color: 'bg-primary/10 text-primary', icon: Brain },
  'RevenueOps Lead': { color: 'bg-green-500/10 text-green-600', icon: Activity },
  'SecurityOps Lead': { color: 'bg-red-500/10 text-red-600', icon: Shield },
  'Scheduling Subagent': { color: 'bg-blue-500/10 text-blue-600', icon: Clock },
  'Human User': { color: 'bg-gray-500/10 text-gray-600', icon: MessageSquare },
};

function ActionLogCard({ log, onReview }: { log: AiBrainActionLog; onReview: (id: string, notes: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  
  const statusConfig = STATUS_CONFIG[log.status] || STATUS_CONFIG.INITIATED;
  const StatusIcon = statusConfig.icon;
  
  const categoryConfig = log.categoryTag ? CATEGORY_CONFIG[log.categoryTag] : null;
  const CategoryIcon = categoryConfig?.icon || Brain;
  
  const actorConfig = ACTOR_CONFIG[log.actorType] || ACTOR_CONFIG.AI_BRAIN;
  const ActorIcon = actorConfig.icon;
  
  const geminiMeta = log.geminiMetadata as { model_used?: string; token_cost?: number; thinking_level?: string; thought_signature?: string } | null;
  const inputs = log.inputs as Record<string, unknown> | null;
  const outputs = log.outputs as Record<string, unknown> | null;
  
  const createdAt = new Date(log.createdAt);
  const timeAgo = getTimeAgo(createdAt);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`border-l-4 ${log.requiresHumanReview ? 'border-l-yellow-500' : 'border-l-border'}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-full ${actorConfig.color}`}>
                  <ActorIcon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={actorConfig.color}>
                      {log.actorType}
                    </Badge>
                    {log.categoryTag && (
                      <Badge variant="outline" className={categoryConfig?.color}>
                        <CategoryIcon className="w-3 h-3 mr-1" />
                        {log.categoryTag}
                      </Badge>
                    )}
                    <Badge variant="outline" className={statusConfig.color}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {log.status}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-foreground mt-1 truncate" data-testid={`text-summary-${log.id}`}>
                    {log.actionSummary}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs whitespace-nowrap">{timeAgo}</span>
                {log.requiresHumanReview && (
                  <Badge variant="destructive" className="text-xs">
                    <Eye className="w-3 h-3 mr-1" />
                    Needs Review
                  </Badge>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {geminiMeta && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Gemini Metadata
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {geminiMeta.model_used && (
                    <div>
                      <span className="text-muted-foreground">Model:</span>
                      <span className="ml-2 font-mono">{geminiMeta.model_used}</span>
                    </div>
                  )}
                  {geminiMeta.token_cost !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Tokens:</span>
                      <span className="ml-2 font-mono">{geminiMeta.token_cost.toLocaleString()}</span>
                    </div>
                  )}
                  {geminiMeta.thinking_level && (
                    <div>
                      <span className="text-muted-foreground">Thinking:</span>
                      <Badge variant="secondary" className="ml-2">{geminiMeta.thinking_level}</Badge>
                    </div>
                  )}
                  {log.durationMs && (
                    <div>
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 font-mono">{log.durationMs}ms</span>
                    </div>
                  )}
                </div>
                {geminiMeta.thought_signature && (
                  <div className="mt-2">
                    <span className="text-muted-foreground text-xs">Thought Signature:</span>
                    <code className="block text-xs font-mono bg-background p-2 rounded mt-1 break-all">
                      {geminiMeta.thought_signature}
                    </code>
                  </div>
                )}
              </div>
            )}
            
            {inputs && Object.keys(inputs).length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Inputs</h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(inputs, null, 2)}
                </pre>
              </div>
            )}
            
            {outputs && Object.keys(outputs).length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Outputs</h4>
                {(outputs as { code_diff?: string }).code_diff ? (
                  <div className="bg-muted rounded-lg overflow-hidden">
                    <div className="bg-muted-foreground/10 px-3 py-2 text-xs font-medium">
                      Code Diff
                    </div>
                    <pre className="text-xs p-3 overflow-x-auto font-mono">
                      {(outputs as { code_diff: string }).code_diff}
                    </pre>
                  </div>
                ) : (
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(outputs, null, 2)}
                  </pre>
                )}
              </div>
            )}
            
            {log.failureReason && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <h4 className="font-medium text-sm text-red-600 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Failure Reason
                </h4>
                <p className="text-sm mt-2">{log.failureReason}</p>
              </div>
            )}
            
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {log.workflowId && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" data-testid={`button-workflow-${log.id}`}>
                    <Workflow className="w-3 h-3 mr-1" />
                    {log.workflowId}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                )}
                <span>ID: {log.id.slice(0, 8)}...</span>
              </div>
              
              {log.requiresHumanReview && !log.humanReviewedAt && (
                <div className="flex items-center gap-2">
                  <Textarea
                    placeholder="Review notes..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="h-20 text-sm resize-none"
                    data-testid={`input-review-notes-${log.id}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => onReview(log.id, reviewNotes)}
                    data-testid={`button-review-${log.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Mark Reviewed
                  </Button>
                </div>
              )}
              
              {log.humanReviewedAt && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600">
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

export default function AIAuditLogViewer() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [requiresReviewFilter, setRequiresReviewFilter] = useState<string>('all');
  
  const hasAccess = user && SUPPORT_ROLES.includes((user as any).platformRole || '');
  
  const { data: logsData, isLoading, refetch } = useQuery<{ success: boolean; data: AiBrainActionLog[] }>({
    queryKey: ['/api/ai/audit-logs', actorTypeFilter, statusFilter, categoryFilter, requiresReviewFilter],
    enabled: hasAccess,
  });
  
  const { data: statsData } = useQuery<{ success: boolean; stats: any }>({
    queryKey: ['/api/ai/audit-logs/stats'],
    enabled: hasAccess,
  });
  
  const reviewMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      return apiRequest('POST', `/api/ai/audit-logs/${id}/review`, { notes });
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
      if (searchQuery && !log.actionSummary.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (actorTypeFilter !== 'all' && log.actorType !== actorTypeFilter) {
        return false;
      }
      if (statusFilter !== 'all' && log.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && log.categoryTag !== categoryFilter) {
        return false;
      }
      if (requiresReviewFilter === 'yes' && !log.requiresHumanReview) {
        return false;
      }
      if (requiresReviewFilter === 'no' && log.requiresHumanReview) {
        return false;
      }
      return true;
    });
  }, [logs, searchQuery, actorTypeFilter, statusFilter, categoryFilter, requiresReviewFilter]);
  
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
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-title-aalv">
            <Brain className="w-6 h-6 text-primary" />
            AI Audit Log Viewer
          </h1>
          <p className="text-muted-foreground text-sm">
            Monitor Trinity™ actions, review decisions, and investigate workflows
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-logs">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalLogs || 0}</div>
              <div className="text-sm text-muted-foreground">Total Actions</div>
            </CardContent>
          </Card>
          <Card className={stats.pendingReviewCount > 0 ? 'border-yellow-500' : ''}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingReviewCount || 0}</div>
              <div className="text-sm text-muted-foreground">Pending Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.statusBreakdown?.COMPLETED || 0}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.statusBreakdown?.FAILED || 0}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Filters</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-logs"
                />
              </div>
            </div>
            
            <Select value={actorTypeFilter} onValueChange={setActorTypeFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-actor-type">
                <SelectValue placeholder="Actor Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="AI_BRAIN">Trinity™</SelectItem>
                <SelectItem value="RevenueOps Lead">RevenueOps Lead</SelectItem>
                <SelectItem value="SecurityOps Lead">SecurityOps Lead</SelectItem>
                <SelectItem value="Scheduling Subagent">Scheduling</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="INITIATED">Initiated</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="TIMEOUT">Timeout</SelectItem>
                <SelectItem value="PENDING_HIL">Pending HIL</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="PLANNING">Planning</SelectItem>
                <SelectItem value="TOOL_USE">Tool Use</SelectItem>
                <SelectItem value="CHECKPOINT">Checkpoint</SelectItem>
                <SelectItem value="DIAGNOSTICS">Diagnostics</SelectItem>
                <SelectItem value="AGENTIC_CODING">Agentic Coding</SelectItem>
                <SelectItem value="HIL_WAIT">HIL Wait</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={requiresReviewFilter} onValueChange={setRequiresReviewFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-review-status">
                <SelectValue placeholder="Review Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">Needs Review</SelectItem>
                <SelectItem value="no">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
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
                {searchQuery || actorTypeFilter !== 'all' || statusFilter !== 'all' 
                  ? 'Try adjusting your filters'
                  : 'Trinity™ actions will appear here as they occur'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <VirtualizedTimeline 
            logs={filteredLogs} 
            onReview={(id, notes) => reviewMutation.mutate({ id, notes })} 
          />
        )}
      </div>
    </div>
  );
}

function VirtualizedTimeline({ 
  logs, 
  onReview 
}: { 
  logs: AiBrainActionLog[]; 
  onReview: (id: string, notes: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-400px)] overflow-auto"
      data-testid="virtualized-timeline"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualRow) => {
          const log = logs[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-3"
            >
              <ActionLogCard log={log} onReview={onReview} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
