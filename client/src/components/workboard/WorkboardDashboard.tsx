import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  useWorkboardTasks, 
  useWorkboardStats, 
  useWorkboardRBAC,
  useCancelWorkboardTask,
  useRetryWorkboardTask,
  useSubmitWorkboardTask
} from '@/hooks/useWorkboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal'
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Play, 
  Pause,
  RotateCcw,
  Send,
  Filter,
  BarChart3,
  ListTodo,
  Bot,
  Zap,
  Users,
  TrendingUp
} from 'lucide-react';
import type { AiWorkboardTask } from '@shared/schema';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', icon: Clock },
  analyzing: { label: 'Analyzing', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', icon: Brain },
  assigned: { label: 'Assigned', color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', icon: Bot },
  in_progress: { label: 'In Progress', color: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400', icon: Play },
  awaiting_approval: { label: 'Awaiting Approval', color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', icon: Pause },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-600 dark:text-red-400', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-600 dark:text-gray-400', icon: XCircle },
  escalated: { label: 'Escalated', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-600 text-white' },
  high: { label: 'High', color: 'bg-orange-500 text-white' },
  normal: { label: 'Normal', color: 'bg-blue-500 text-white' },
  low: { label: 'Low', color: 'bg-gray-500 text-white' },
  scheduled: { label: 'Scheduled', color: 'bg-purple-500 text-white' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} gap-1`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <Badge className={config.color} data-testid={`badge-priority-${priority}`}>
      {config.label}
    </Badge>
  );
}

function TaskCard({ 
  task, 
  onViewDetails, 
  onCancel, 
  onRetry,
  canCancel,
  canRetry,
  isMobile 
}: { 
  task: AiWorkboardTask;
  onViewDetails: () => void;
  onCancel: () => void;
  onRetry: () => void;
  canCancel: boolean;
  canRetry: boolean;
  isMobile: boolean;
}) {
  const isRetryable = task.status === 'failed' && (task.retryCount || 0) < (task.maxRetries || 3);
  const isCancellable = ['pending', 'analyzing', 'assigned', 'in_progress'].includes(task.status || '');
  
  return (
    <Card 
      className="hover-elevate cursor-pointer transition-all" 
      onClick={onViewDetails}
      data-testid={`card-task-${task.id}`}
    >
      <CardContent className={`${isMobile ? 'p-3' : 'p-4'}`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className={`${isMobile ? 'text-sm' : 'text-base'} font-medium truncate`} data-testid={`text-task-content-${task.id}`}>
                {task.requestContent?.slice(0, 100) || 'No content'}
                {(task.requestContent?.length || 0) > 100 ? '...' : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1" data-testid={`text-task-agent-${task.id}`}>
                {task.assignedAgentName || 'Unassigned'} • {task.category || 'General'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <PriorityBadge priority={task.priority || 'normal'} />
              <StatusBadge status={task.status || 'pending'} />
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
            <span data-testid={`text-task-time-${task.id}`}>
              {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Unknown time'}
            </span>
            <div className="flex items-center gap-2">
              {task.executionMode === 'trinity_fast' && (
                <Badge 
                  variant="outline" 
                  className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50 gap-1 text-xs"
                  data-testid={`badge-fast-mode-${task.id}`}
                >
                  <Zap className="h-3 w-3" />
                  Fast
                </Badge>
              )}
              {task.estimatedTokens && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {task.estimatedTokens} tokens
                </span>
              )}
            </div>
          </div>
          
          {(canCancel || canRetry) && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
              {canRetry && isRetryable && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  data-testid={`button-retry-${task.id}`}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
              {canCancel && isCancellable && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={(e) => { e.stopPropagation(); onCancel(); }}
                  data-testid={`button-cancel-${task.id}`}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskDetailSheet({ 
  task, 
  open, 
  onOpenChange 
}: { 
  task: AiWorkboardTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!task) return null;
  
  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="w-full sm:max-w-lg" data-testid="sheet-task-details">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Task Details
          </UniversalModalTitle>
          <UniversalModalDescription>
            ID: {task.id?.slice(0, 8)}...
          </UniversalModalDescription>
        </UniversalModalHeader>
        
        <ScrollArea className="h-[calc(100vh-10rem)] mt-4">
          <div className="space-y-4 pr-4">
            <div>
              <h4 className="text-sm font-medium mb-1">Status</h4>
              <StatusBadge status={task.status || 'pending'} />
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-1">Priority</h4>
              <PriorityBadge priority={task.priority || 'normal'} />
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-1">Request</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-task-full-content">
                {task.requestContent}
              </p>
            </div>
            
            {task.assignedAgentName && (
              <div>
                <h4 className="text-sm font-medium mb-1">Assigned Agent</h4>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span className="text-sm">{task.assignedAgentName}</span>
                </div>
              </div>
            )}
            
            {task.executionMode === 'trinity_fast' && (
              <div>
                <h4 className="text-sm font-medium mb-1">Execution Mode</h4>
                <Badge 
                  variant="outline" 
                  className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50 gap-1"
                  data-testid="badge-task-fast-mode"
                >
                  <Zap className="h-3 w-3" />
                  Trinity Fast Mode
                </Badge>
              </div>
            )}
            
            {task.intent && (
              <div>
                <h4 className="text-sm font-medium mb-1">Detected Intent</h4>
                <p className="text-sm text-muted-foreground">
                  {task.intent} ({((Number(task.confidence) || 0) * 100).toFixed(1)}% confidence)
                </p>
              </div>
            )}
            
            {task.resultSummary && (
              <div>
                <h4 className="text-sm font-medium mb-1">Result Summary</h4>
                <p className="text-sm text-muted-foreground" data-testid="text-task-result">
                  {task.resultSummary}
                </p>
              </div>
            )}
            
            {task.errorMessage && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-red-500">Error</h4>
                <p className="text-sm text-red-400" data-testid="text-task-error">
                  {task.errorMessage}
                </p>
              </div>
            )}
            
            <div>
              <h4 className="text-sm font-medium mb-1">Timeline</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Created: {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Unknown'}</p>
                {task.startedAt && <p>Started: {new Date(task.startedAt).toLocaleString()}</p>}
                {task.completedAt && <p>Completed: {new Date(task.completedAt).toLocaleString()}</p>}
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-1">Token Usage</h4>
              <div className="text-sm text-muted-foreground">
                <p>Estimated: {task.estimatedTokens || 0}</p>
                <p>Actual: {task.actualTokens || 'N/A'}</p>
                <p>Credits Deducted: {task.creditsDeducted ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </UniversalModalContent>
    </UniversalModal>
  );
}

function StatsCards({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = useWorkboardStats();
  
  if (isLoading) {
    return (
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  const stats = data?.stats;
  
  return (
    <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`}>
      <Card data-testid="card-stats-total">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <ListTodo className="h-4 w-4" />
            Total Tasks
          </div>
          <p className="text-2xl font-bold mt-1">{stats?.totalTasks || 0}</p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-stats-success">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <TrendingUp className="h-4 w-4" />
            Success Rate
          </div>
          <p className="text-2xl font-bold mt-1 text-green-500">
            {((stats?.successRate || 0) * 100).toFixed(0)}%
          </p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-stats-active">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Play className="h-4 w-4" />
            Active
          </div>
          <p className="text-2xl font-bold mt-1 text-blue-500">
            {(stats?.byStatus?.in_progress || 0) + (stats?.byStatus?.analyzing || 0)}
          </p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-stats-agents">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Users className="h-4 w-4" />
            Active Agents
          </div>
          <p className="text-2xl font-bold mt-1">
            {Object.keys(stats?.byAgent || {}).length}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitTaskDialog({ isMobile }: { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [fastModeEnabled, setFastModeEnabled] = useState(false);
  const { toast } = useToast();
  const submitTask = useSubmitWorkboardTask();
  
  const handleSubmit = async () => {
    if (!content.trim()) {
      toast({ title: 'Please enter a task', variant: 'destructive' });
      return;
    }
    
    try {
      await submitTask.mutateAsync({
        requestContent: content,
        requestType: 'direct_api',
        priority: priority as 'critical' | 'high' | 'normal' | 'low' | 'scheduled',
        executionMode: fastModeEnabled ? 'trinity_fast' : 'normal',
      });
      toast({ title: 'Task submitted successfully' });
      setContent('');
      setOpen(false);
    } catch (error) {
      toast({ title: 'Failed to submit task', variant: 'destructive' });
    }
  };
  
  const DialogWrapper = isMobile ? Sheet : Dialog;
  const ContentWrapper = isMobile ? SheetContent : DialogContent;
  const HeaderWrapper = isMobile ? SheetHeader : DialogHeader;
  const TitleWrapper = isMobile ? SheetTitle : DialogTitle;
  const DescWrapper = isMobile ? SheetDescription : DialogDescription;
  
  return (
    <DialogWrapper open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} data-testid="button-submit-task">
        <Send className="h-4 w-4 mr-2" />
        New Task
      </Button>
      <ContentWrapper data-testid="dialog-submit-task">
        <HeaderWrapper>
          <TitleWrapper>Submit New Task</TitleWrapper>
          <DescWrapper>Describe what you need help with</DescWrapper>
        </HeaderWrapper>
        <div className="space-y-4 mt-4">
          <Textarea
            placeholder="What would you like to accomplish?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            data-testid="input-task-content"
          />
          <div>
            <label className="text-sm font-medium mb-1 block">Priority</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className={['flex items-center justify-between gap-2 p-3 rounded-lg border', fastModeEnabled ? 'bg-amber-500/10 border-amber-500/50' : 'bg-muted/50'].join(' ')}>
            <div className="flex items-center gap-3">
              <div className={['p-2 rounded-full', fastModeEnabled ? 'bg-amber-500/20' : 'bg-muted'].join(' ')}>
                <Zap className={`h-4 w-4 ${fastModeEnabled ? 'text-amber-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <Label htmlFor="fast-mode" className="text-sm font-medium cursor-pointer">
                  Trinity Fast Mode
                </Label>
                <p className="text-xs text-muted-foreground">
                  Parallel subagent execution
                </p>
              </div>
            </div>
            <Switch
              id="fast-mode"
              checked={fastModeEnabled}
              onCheckedChange={setFastModeEnabled}
              data-testid="switch-fast-mode"
            />
          </div>
          
          <Button 
            onClick={handleSubmit} 
            className="w-full" 
            disabled={submitTask.isPending}
            data-testid="button-confirm-submit"
          >
            {submitTask.isPending ? 'Submitting...' : 'Submit Task'}
          </Button>
        </div>
      </ContentWrapper>
    </DialogWrapper>
  );
}

export default function WorkboardDashboard() {
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<AiWorkboardTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { toast } = useToast();
  
  const rbac = useWorkboardRBAC();
  const cancelTask = useCancelWorkboardTask();
  const retryTask = useRetryWorkboardTask();
  
  const queryParams = useMemo(() => ({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    limit: 50,
  }), [statusFilter, priorityFilter]);
  
  const { data, isLoading, error } = useWorkboardTasks(queryParams);
  
  const handleViewDetails = (task: AiWorkboardTask) => {
    setSelectedTask(task);
    setDetailsOpen(true);
  };
  
  const handleCancel = async (taskId: string) => {
    try {
      await cancelTask.mutateAsync(taskId);
      toast({ title: 'Task cancelled' });
    } catch {
      toast({ title: 'Failed to cancel task', variant: 'destructive' });
    }
  };
  
  const handleRetry = async (taskId: string) => {
    try {
      await retryTask.mutateAsync(taskId);
      toast({ title: 'Task retry initiated' });
    } catch {
      toast({ title: 'Failed to retry task', variant: 'destructive' });
    }
  };
  
  return (
    <div className={`${isMobile ? 'p-3' : 'p-6'} space-y-4`} data-testid="workboard-dashboard">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold flex items-center gap-2`}>
              <Brain className="h-6 w-6" />
              AI Workboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {rbac.roleLevel === 'admin' ? 'Platform-wide view' : 
               rbac.roleLevel === 'manager' ? 'Team tasks' : 'Your tasks'}
            </p>
          </div>
          <SubmitTaskDialog isMobile={isMobile} />
        </div>
        
        <StatsCards isMobile={isMobile} />
        
        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className={`${isMobile ? 'w-full' : ''}`}>
            <TabsTrigger value="tasks" className="flex-1 gap-1" data-testid="tab-tasks">
              <ListTodo className="h-4 w-4" />
              {!isMobile && 'Tasks'}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1 gap-1" data-testid="tab-analytics">
              <BarChart3 className="h-4 w-4" />
              {!isMobile && 'Analytics'}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="tasks" className="space-y-4 mt-4">
            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-3`}>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={`${isMobile ? 'w-full' : 'w-48'}`} data-testid="filter-status">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="analyzing">Analyzing</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className={`${isMobile ? 'w-full' : 'w-48'}`} data-testid="filter-priority">
                  <SelectValue placeholder="Filter by priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                  <p className="text-muted-foreground">Failed to load tasks</p>
                </CardContent>
              </Card>
            ) : data?.tasks?.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Brain className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No tasks found</p>
                  <p className="text-sm text-muted-foreground mt-1">Submit a new task to get started</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {data?.tasks?.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onViewDetails={() => handleViewDetails(task)}
                    onCancel={() => handleCancel(task.id)}
                    onRetry={() => handleRetry(task.id)}
                    canCancel={rbac.canCancelTasks}
                    canRetry={rbac.canRetryTasks}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
            
            {data?.pagination?.hasMore && (
              <div className="text-center">
                <Button variant="outline" data-testid="button-load-more">
                  Load More
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="analytics" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Task Analytics
                </CardTitle>
                <CardDescription>
                  Performance metrics and insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                  <div className="space-y-2">
                    <h4 className="font-medium">By Status</h4>
                    <div className="space-y-1">
                      {Object.entries(data?.tasks?.reduce((acc, t) => {
                        acc[t.status || 'unknown'] = (acc[t.status || 'unknown'] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>) || {}).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between gap-2 text-sm">
                          <StatusBadge status={status} />
                          {/* @ts-ignore */}
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">By Agent</h4>
                    <div className="space-y-1">
                      {Object.entries(data?.tasks?.reduce((acc, t) => {
                        const agent = t.assignedAgentName || 'Unassigned';
                        acc[agent] = (acc[agent] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>) || {}).map(([agent, count]) => (
                        <div key={agent} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            {agent}
                          </span>
                          {/* @ts-ignore */}
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      <TaskDetailSheet 
        task={selectedTask} 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
      />
    </div>
  );
}
