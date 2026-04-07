/**
 * FastModeStatusWidget - Real-time Fast Mode execution status display
 * 
 * Shows the progress of active Fast Mode tasks with:
 * - Parallel agent status indicators
 * - Progress bars for each agent
 * - SLA countdown timer
 * - Credit usage tracking
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FastModeAgent {
  agentId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: string;
  completedAt?: string;
}

interface FastModeTask {
  taskId: string;
  workspaceId: string;
  status: 'initializing' | 'analyzing' | 'dispatching' | 'executing' | 'aggregating' | 'completed' | 'failed';
  progress: number;
  activeAgents: FastModeAgent[];
  estimatedCompletion: string;
  creditsUsed: number;
  slaTarget: number;
  slaStatus: 'on_track' | 'at_risk' | 'exceeded';
  proactiveInsights?: string[];
  startedAt: string;
  lastUpdate: string;
}

interface FastModeStatusWidgetProps {
  workspaceId: string;
  className?: string;
}

export function FastModeStatusWidget({ workspaceId, className = '' }: FastModeStatusWidgetProps) {
  const [activeTasks, setActiveTasks] = useState<FastModeTask[]>([]);
  
  // Poll for active fast mode tasks
  const { data: tasksData } = useQuery<{ tasks: FastModeTask[] }>({
    queryKey: ['/api/ai-brain/fast-mode/active', workspaceId],
    refetchInterval: 1000, // Poll every second for real-time updates
    enabled: !!workspaceId,
  });
  
  useEffect(() => {
    if (tasksData?.tasks) {
      setActiveTasks(tasksData.tasks);
    }
  }, [tasksData]);
  
  // Also listen for WebSocket updates
  useEffect(() => {
    const handleFastModeProgress = (event: CustomEvent<FastModeTask>) => {
      const task = event.detail;
      if (task.workspaceId === workspaceId) {
        setActiveTasks(prev => {
          const existing = prev.findIndex(t => t.taskId === task.taskId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = task;
            return updated;
          }
          return [...prev, task];
        });
      }
    };
    
    window.addEventListener('fast_mode_progress', handleFastModeProgress as EventListener);
    return () => {
      window.removeEventListener('fast_mode_progress', handleFastModeProgress as EventListener);
    };
  }, [workspaceId]);
  
  // Remove completed tasks after a delay
  useEffect(() => {
    activeTasks.forEach(task => {
      if (task.status === 'completed' || task.status === 'failed') {
        setTimeout(() => {
          setActiveTasks(prev => prev.filter(t => t.taskId !== task.taskId));
        }, 5000);
      }
    });
  }, [activeTasks]);
  
  if (activeTasks.length === 0) {
    return null; // Don't render if no active tasks
  }
  
  return (
    <Card className={`border-amber-500/30 bg-amber-500/5 ${className}`} data-testid="card-fast-mode-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Fast Mode Active
          <Badge variant="outline" className="ml-auto text-xs">
            {activeTasks.length} task{activeTasks.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence mode="popLayout">
          {activeTasks.map(task => (
            <FastModeTaskCard key={task.taskId} task={task} />
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function FastModeTaskCard({ task }: { task: FastModeTask }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  useEffect(() => {
    const startTime = new Date(task.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [task.startedAt]);
  
  const getStatusIcon = (status: FastModeTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />;
    }
  };
  
  const getStatusLabel = (status: FastModeTask['status']) => {
    const labels: Record<FastModeTask['status'], string> = {
      initializing: 'Initializing...',
      analyzing: 'Analyzing request...',
      dispatching: 'Dispatching agents...',
      executing: 'Executing in parallel...',
      aggregating: 'Aggregating results...',
      completed: 'Completed',
      failed: 'Failed'
    };
    return labels[status];
  };
  
  const getSlaStatusColor = (slaStatus: FastModeTask['slaStatus']) => {
    switch (slaStatus) {
      case 'on_track': return 'text-green-500';
      case 'at_risk': return 'text-amber-500';
      case 'exceeded': return 'text-destructive';
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="p-3 rounded-lg border bg-background/50 space-y-2"
      data-testid={`fast-mode-task-${task.taskId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {getStatusIcon(task.status)}
          <span className="text-sm font-medium">{getStatusLabel(task.status)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className={getSlaStatusColor(task.slaStatus)}>
            {elapsedTime}s / {task.slaTarget}s
          </span>
        </div>
      </div>
      
      <Progress value={task.progress} className="h-2" />
      
      {task.activeAgents.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {task.activeAgents.map(agent => (
            <AgentStatusPill key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}
      
      {task.proactiveInsights && task.proactiveInsights.length > 0 && task.status === 'completed' && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-amber-500 mb-1">
            <Sparkles className="h-3 w-3" />
            <span className="font-medium">Proactive Insights</span>
          </div>
          {task.proactiveInsights.map((insight, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {insight}</p>
          ))}
        </div>
      )}
      
      {task.status !== 'completed' && task.status !== 'failed' && (
        <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground pt-1">
          <span>Credits: ~{task.creditsUsed}</span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {task.activeAgents.filter(a => a.status === 'running').length} agents active
          </span>
        </div>
      )}
    </motion.div>
  );
}

function AgentStatusPill({ agent }: { agent: FastModeAgent }) {
  const getStatusColor = (status: FastModeAgent['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 border-green-500/50 text-green-600';
      case 'failed': return 'bg-destructive/20 border-destructive/50 text-destructive';
      case 'running': return 'bg-amber-500/20 border-amber-500/50 text-amber-600';
      default: return 'bg-muted border-muted-foreground/20 text-muted-foreground';
    }
  };
  
  const getStatusIcon = (status: FastModeAgent['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3 w-3" />;
      case 'failed': return <XCircle className="h-3 w-3" />;
      case 'running': return <Loader2 className="h-3 w-3 animate-spin" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };
  
  return (
    <div 
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${getStatusColor(agent.status)}`}
      data-testid={`agent-status-${agent.agentId}`}
    >
      {getStatusIcon(agent.status)}
      <span className="truncate">{agent.agentName}</span>
      {agent.status === 'running' && (
        <span className="text-[10px] opacity-70">{agent.progress}%</span>
      )}
    </div>
  );
}

export default FastModeStatusWidget;
