/**
 * Trinity Control Console
 * ========================
 * Real-time streaming view of Trinity's cognitive process
 * Shows thought signatures, action logs, and platform awareness events
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Brain, 
  Zap, 
  Eye, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Play, 
  Pause,
  RefreshCw,
  Terminal,
  Lightbulb,
  Activity,
  Database,
  Code,
  X
} from 'lucide-react';

// Types matching the backend
type ThoughtType = 'reasoning' | 'planning' | 'diagnosis' | 'reflection' | 'decision' | 'observation';
type ActionType = 'tool_call' | 'api_request' | 'database_query' | 'file_operation' | 'ai_generation' | 'notification' | 'workflow_step';
type ActionStatus = 'started' | 'completed' | 'failed' | 'skipped';

interface ThoughtEntry {
  id: string;
  sessionId: string;
  thoughtType: ThoughtType;
  content: string;
  confidence?: number;
  timestamp: string;
}

interface ActionEntry {
  id: string;
  sessionId: string;
  actionType: ActionType;
  actionName: string;
  status: ActionStatus;
  durationMs?: number;
  errorMessage?: string;
  timestamp: string;
}

interface AwarenessEvent {
  eventType: string;
  source: string;
  resourceType: string;
  operation: string;
  routedThroughTrinity: boolean;
  timestamp: string;
}

interface ConsoleEntry {
  type: 'thought' | 'action' | 'awareness';
  data: ThoughtEntry | ActionEntry | AwarenessEvent;
  timestamp: string;
}

interface TrinityControlConsoleProps {
  sessionId?: string;
  workspaceId?: string;
  onClose?: () => void;
  isOpen?: boolean;
  isEmbedded?: boolean;
}

export function TrinityControlConsole({ 
  sessionId = 'default', 
  workspaceId,
  onClose,
  isOpen = true,
  isEmbedded = false
}: TrinityControlConsoleProps) {
  const [isStreaming, setIsStreaming] = useState(true);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'thoughts' | 'actions' | 'awareness'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial timeline
  const { data: timeline, refetch } = useQuery({
    queryKey: ['/api/trinity/control-console/timeline', sessionId],
    enabled: !!sessionId,
    refetchInterval: isStreaming ? 5000 : false,
  });

  // Merge timeline data with streaming entries
  useEffect(() => {
    if (timeline && Array.isArray(timeline)) {
      const timelineEntries: ConsoleEntry[] = timeline.map((item: any) => ({
        type: item.type,
        data: item.data,
        timestamp: item.timestamp || item.data?.createdAt || new Date().toISOString(),
      }));
      setEntries(prev => {
        const existingIds = new Set(prev.map(e => (e.data as any).id));
        const newEntries = timelineEntries.filter(e => !(e.data as any).id || !existingIds.has((e.data as any).id));
        return [...newEntries, ...prev].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
    }
  }, [timeline]);

  // Setup SSE connection for real-time streaming with fallback
  useEffect(() => {
    if (!isStreaming) {
      eventSourceRef.current?.close();
      return;
    }

    // Check for EventSource support
    if (typeof EventSource === 'undefined') {
      console.warn('[TrinityConsole] SSE not supported, falling back to polling');
      return;
    }

    const url = `/api/trinity/control-console/stream?sessionId=${sessionId}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Skip connection messages
        if (payload.type === 'connected') return;
        
        // Use server-provided timestamp for consistency
        const entry: ConsoleEntry = {
          type: payload.type,
          data: payload.data,
          timestamp: payload.timestamp || new Date().toISOString(),
        };
        setEntries(prev => [entry, ...prev].slice(0, 500)); // Keep last 500 entries
      } catch (error) {
        console.error('[TrinityConsole] Failed to parse SSE event:', error);
      }
    };

    let retryCount = 0;
    const maxRetries = 5;
    
    eventSource.onerror = (err) => {
      console.warn('[TrinityConsole] SSE connection error:', err);
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error('[TrinityConsole] Max retries reached, stopping SSE');
        eventSource.close();
        setIsStreaming(false);
      }
    };
    
    eventSource.onopen = () => {
      retryCount = 0; // Reset on successful connection
    };

    return () => {
      eventSource.close();
    };
  }, [isStreaming, sessionId, workspaceId]);

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries, autoScroll]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'thoughts') return entries.filter(e => e.type === 'thought');
    if (filter === 'actions') return entries.filter(e => e.type === 'action');
    if (filter === 'awareness') return entries.filter(e => e.type === 'awareness');
    return entries;
  }, [entries, filter]);

  // Stats
  const stats = useMemo(() => {
    const thoughts = entries.filter(e => e.type === 'thought').length;
    const actions = entries.filter(e => e.type === 'action').length;
    const awareness = entries.filter(e => e.type === 'awareness').length;
    const completed = entries.filter(e => e.type === 'action' && (e.data as ActionEntry).status === 'completed').length;
    const failed = entries.filter(e => e.type === 'action' && (e.data as ActionEntry).status === 'failed').length;
    const routed = entries.filter(e => e.type === 'awareness' && (e.data as AwarenessEvent).routedThroughTrinity).length;
    return { thoughts, actions, awareness, completed, failed, routed };
  }, [entries]);

  if (!isOpen) return null;

  const containerClass = isEmbedded 
    ? "h-full" 
    : "fixed inset-4 z-50 bg-background/95 backdrop-blur-lg border rounded-xl shadow-2xl";

  return (
    <div className={containerClass} data-testid="trinity-control-console">
      <Card className="h-full flex flex-col border-0 bg-transparent">
        <CardHeader className="flex-shrink-0 border-b bg-gradient-to-r from-violet-500/10 to-indigo-500/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Trinity Control Console</CardTitle>
                <p className="text-xs text-muted-foreground">Real-time cognitive streaming</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={isStreaming}
                  onCheckedChange={setIsStreaming}
                  className="scale-75"
                  data-testid="switch-streaming"
                />
                <span className="text-xs text-muted-foreground">
                  {isStreaming ? 'Live' : 'Paused'}
                </span>
              </div>
              
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => refetch()}
                data-testid="button-refresh-console"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              
              {onClose && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={onClose}
                  data-testid="button-close-console"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <div className="flex-shrink-0 p-2 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs gap-1">
                <Lightbulb className="w-3 h-3" />
                {stats.thoughts}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Zap className="w-3 h-3" />
                {stats.actions}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Eye className="w-3 h-3" />
                {stats.awareness}
              </Badge>
            </div>
            
            <div className="flex items-center gap-1">
              <Badge 
                variant={stats.failed > 0 ? "destructive" : "secondary"} 
                className="text-xs gap-1"
              >
                <CheckCircle className="w-3 h-3" />
                {stats.completed}/{stats.actions}
              </Badge>
              <Badge 
                variant={stats.routed < stats.awareness ? "secondary" : "default"} 
                className="text-xs gap-1"
              >
                <Activity className="w-3 h-3" />
                {stats.routed}/{stats.awareness} routed
              </Badge>
            </div>
          </div>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="flex-shrink-0 w-full justify-start rounded-none border-b bg-transparent h-8 p-0">
            <TabsTrigger value="all" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500">
              All
            </TabsTrigger>
            <TabsTrigger value="thoughts" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500">
              Thoughts
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500">
              Actions
            </TabsTrigger>
            <TabsTrigger value="awareness" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500">
              Awareness
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="flex-1 m-0 min-h-0">
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="p-2 space-y-1">
                {filteredEntries.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No entries yet</p>
                    <p className="text-xs">Trinity's cognitive process will appear here</p>
                  </div>
                ) : (
                  filteredEntries.map((entry, index) => (
                    <ConsoleEntryRow key={`${entry.type}-${index}`} entry={entry} />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function ConsoleEntryRow({ entry }: { entry: ConsoleEntry }) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();

  if (entry.type === 'thought') {
    const thought = entry.data as ThoughtEntry;
    return (
      <div className="flex gap-2 p-2 rounded-md bg-violet-500/5 border border-violet-500/20" data-testid={`console-thought-${thought.id}`}>
        <div className="flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Lightbulb className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {thought.thoughtType}
            </Badge>
            {thought.confidence && (
              <span className="text-[10px] text-muted-foreground">
                {thought.confidence}% conf
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {timestamp}
            </span>
          </div>
          <p className="text-xs text-foreground/90">{thought.content}</p>
        </div>
      </div>
    );
  }

  if (entry.type === 'action') {
    const action = entry.data as ActionEntry;
    const statusIcon = {
      started: <Play className="w-3 h-3 text-blue-500" />,
      completed: <CheckCircle className="w-3 h-3 text-green-500" />,
      failed: <AlertTriangle className="w-3 h-3 text-red-500" />,
      skipped: <Clock className="w-3 h-3 text-muted-foreground" />,
    }[action.status];

    const actionIcon = {
      tool_call: <Terminal className="w-3 h-3" />,
      api_request: <Zap className="w-3 h-3" />,
      database_query: <Database className="w-3 h-3" />,
      file_operation: <Code className="w-3 h-3" />,
      ai_generation: <Brain className="w-3 h-3" />,
      notification: <Activity className="w-3 h-3" />,
      workflow_step: <RefreshCw className="w-3 h-3" />,
    }[action.actionType];

    return (
      <div 
        className={`flex gap-2 p-2 rounded-md border ${
          action.status === 'failed' 
            ? 'bg-red-500/5 border-red-500/20' 
            : action.status === 'completed'
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-blue-500/5 border-blue-500/20'
        }`}
        data-testid={`console-action-${action.id}`}
      >
        <div className="flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            {actionIcon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <code className="text-xs font-mono text-foreground">{action.actionName}</code>
            {statusIcon}
            {action.durationMs && (
              <span className="text-[10px] text-muted-foreground">
                {action.durationMs}ms
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {timestamp}
            </span>
          </div>
          {action.errorMessage && (
            <p className="text-xs text-red-500 truncate">{action.errorMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (entry.type === 'awareness') {
    const awareness = entry.data as AwarenessEvent;
    return (
      <div 
        className={`flex gap-2 p-2 rounded-md border ${
          awareness.routedThroughTrinity 
            ? 'bg-green-500/5 border-green-500/20' 
            : 'bg-amber-500/5 border-amber-500/20'
        }`}
        data-testid="console-awareness"
      >
        <div className="flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <Eye className={`w-3 h-3 ${awareness.routedThroughTrinity ? 'text-green-500' : 'text-amber-500'}`} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {awareness.operation}
            </Badge>
            <code className="text-xs font-mono text-foreground">{awareness.resourceType}</code>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {timestamp}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              via {awareness.source}
            </span>
            {!awareness.routedThroughTrinity && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-700">
                bypassed Trinity
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Compact floating toggle button for opening the console
export function TrinityConsoleToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg hover:shadow-xl"
      data-testid="button-open-trinity-console"
    >
      <Brain className="w-5 h-5 text-white" />
    </Button>
  );
}
