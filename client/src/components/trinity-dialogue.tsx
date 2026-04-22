/**
 * TRINITY DIALOGUE - Floating Chat Interface
 * ===========================================
 * Universal AI conversation interface accessible from anywhere in the app.
 * Part of Phase 1D: Floating Trinity Dialogue UI
 * See: docs/trinity-platform-consciousness-roadmap.md
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { TrinityArrowMark } from "@/components/trinity-logo";
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  MessageCircle,
  Send,
  X,
  Minimize2,
  Maximize2,
  Activity,
  Loader2,
  ChevronDown,
  User,
  FileEdit,
  Play,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  Terminal,
  ListChecks,
} from 'lucide-react';
import { TrinityMascotIcon } from '@/components/ui/coaileague-logo-mark';
import { Suspense } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'action';
  content: string;
  timestamp: Date;
  confidenceScore?: number;
  mode?: 'demo' | 'pro' | 'guru';
  actionType?: 'edit' | 'analyze' | 'execute' | 'decide' | 'restart';
  actionStatus?: 'started' | 'completed' | 'failed';
}

interface TrustLevelResponse {
  trustLevel?: string;
  level?: number;
}

interface ActionEntry {
  id: string;
  actionType: string;
  actionName: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  timestamp: string;
}

interface TrinityDialogueProps {
  workspaceId?: string;
  userId?: string;
  defaultOpen?: boolean;
  position?: 'bottom-right' | 'bottom-left';
}

// Helper to get action icon based on type
const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case 'file_operation':
    case 'edit':
      return FileEdit;
    case 'api_request':
    case 'execute':
      return Terminal;
    case 'workflow_step':
    case 'restart':
      return RefreshCw;
    case 'ai_generation':
    case 'analyze':
      return Search;
    case 'database_query':
      return ListChecks;
    default:
      return Play;
  }
};

// Helper to format action name for display
const formatActionName = (action: ActionEntry): string => {
  const name = action.actionName || '';
  // Make it more readable like "Edited client/src/..." or "Analyzed file..."
  if (name.includes('/')) {
    const parts = name.split('/');
    return parts.slice(-2).join('/');
  }
  return name.length > 30 ? name.substring(0, 27) + '...' : name;
};

export function TrinityDialogue({
  workspaceId,
  userId,
  defaultOpen = false,
  position = 'bottom-right',
}: TrinityDialogueProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<'demo' | 'pro' | 'guru'>('pro');
  const [actionLogs, setActionLogs] = useState<ActionEntry[]>([]);
  const [taskProgress, setTaskProgress] = useState<{ current: number; total: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  // SSE connection for real-time action streaming from Control Console
  useEffect(() => {
    if (!isOpen || typeof EventSource === 'undefined') return;

    const sessionId = workspaceId || 'default';
    const url = `/api/trinity/control-console/stream?sessionId=${sessionId}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`;
    
    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'connected') return;
          
          if (payload.type === 'action' && payload.data) {
            const action: ActionEntry = {
              id: payload.data.id || `action-${Date.now()}`,
              actionType: payload.data.actionType || 'execute',
              actionName: payload.data.actionName || 'Processing...',
              status: payload.data.status || 'started',
              durationMs: payload.data.durationMs,
              timestamp: payload.data.timestamp || new Date().toISOString(),
            };
            setActionLogs(prev => [action, ...prev].slice(0, 20)); // Keep last 20
          }
          
          // Handle task progress updates
          if (payload.type === 'task_progress' && payload.data) {
            setTaskProgress({
              current: payload.data.current || 0,
              total: payload.data.total || 0,
            });
          }
        } catch (err) {
          console.warn('[TrinityDialogue] Failed to parse SSE:', err);
        }
      };

      eventSource.onerror = () => {
        // Silently handle errors - SSE will auto-reconnect or we fall back to polling
      };

      return () => {
        eventSource.close();
      };
    } catch (err) {
      console.warn('[TrinityDialogue] SSE not available:', err);
    }
  }, [isOpen, workspaceId]);

  const { data: userTrustLevel } = useQuery<TrustLevelResponse>({
    queryKey: ['/api/trinity/trust-level', userId, workspaceId],
    enabled: !!userId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', '/api/helpai/chat', {
        message,
        workspaceId,
        source: 'trinity-dialogue',
        mode,
      });
      return response.json();
    },
    onMutate: () => {
      setIsTyping(true);
    },
    onSuccess: (response: any) => {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply || response.message || 'I understand. How can I help further?',
        timestamp: new Date(),
        confidenceScore: response.confidenceScore,
        mode: response.mode || mode,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Message failed',
        description: error.message || 'Could not reach Trinity. Please try again.',
        variant: 'destructive',
      });
      setIsTyping(false);
    },
  });

  const handleSend = useCallback(() => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || sendMessageMutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    sendMessageMutation.mutate(trimmedInput);
  }, [inputValue, sendMessageMutation]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const positionClasses = position === 'bottom-right' 
    ? 'right-4 sm:right-6' 
    : 'left-4 sm:left-6';

  if (!isOpen) {
    return (
      <Button
        data-testid="button-trinity-dialogue-open"
        onClick={() => setIsOpen(true)}
        size="icon"
        className={`fixed bottom-20 ${positionClasses} z-50 h-14 w-14 rounded-full shadow-lg bg-primary/90 hover-elevate`}
      >
        <TrinityMascotIcon size="md" />
        <span className="sr-only">Open Trinity Chat</span>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <Card
        data-testid="card-trinity-dialogue-minimized"
        className={`fixed bottom-20 ${positionClasses} z-50 w-64 shadow-lg cursor-pointer hover-elevate`}
        onClick={() => setIsMinimized(false)}
      >
        <CardHeader className="p-3 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrinityMascotIcon size="xs" />
            <span className="font-medium text-sm">Trinity AI</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {mode}
            </Badge>
            <Button
              data-testid="button-trinity-maximize"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      data-testid="card-trinity-dialogue"
      className={`fixed bottom-20 ${positionClasses} z-50 w-80 sm:w-96 h-[500px] max-h-[70vh] shadow-xl flex flex-col`}
    >
      <CardHeader className="p-3 border-b flex flex-row items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <TrinityMascotIcon size="sm" />
            <TrinityLogo size={12} className="text-yellow-500 absolute -top-1 -right-1" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Trinity AI</CardTitle>
            <p className="text-xs text-muted-foreground">
              {userTrustLevel?.trustLevel ? `Trust: ${userTrustLevel.trustLevel}` : 'Platform Copilot'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge 
            variant={mode === 'guru' ? 'default' : 'outline'} 
            className="text-xs cursor-pointer"
            onClick={() => setMode(mode === 'guru' ? 'pro' : 'guru')}
            data-testid="badge-trinity-mode"
          >
            {mode === 'guru' && <Activity className="h-3 w-3 mr-1" />}
            {mode}
          </Badge>
          <Button
            data-testid="button-trinity-minimize"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            data-testid="button-trinity-close"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Task Progress Indicator - like Agent's "In progress tasks 6/6" */}
      {taskProgress && taskProgress.total > 0 && (
        <div className="px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2 text-xs">
            <ListChecks className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">In progress tasks</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {taskProgress.current} / {taskProgress.total}
            </Badge>
          </div>
        </div>
      )}

      {/* Action Logs Section - like Agent's action list */}
      {actionLogs.length > 0 && (
        <div className="px-3 py-2 border-b bg-muted/20 max-h-32 overflow-y-auto">
          <div className="space-y-1">
            {actionLogs.slice(0, 5).map((action) => {
              const ActionIcon = getActionIcon(action.actionType);
              const statusColor = action.status === 'completed' 
                ? 'text-green-500' 
                : action.status === 'failed' 
                  ? 'text-destructive' 
                  : 'text-muted-foreground';
              return (
                <div 
                  key={action.id} 
                  className="flex items-center gap-2 text-xs"
                  data-testid={`action-log-${action.id}`}
                >
                  {action.status === 'completed' ? (
                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                  ) : action.status === 'failed' ? (
                    <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                  ) : (
                    <ActionIcon className="h-3 w-3 text-primary shrink-0 animate-pulse" />
                  )}
                  <span className={`truncate ${statusColor}`}>
                    {formatActionName(action)}
                  </span>
                  {action.durationMs && (
                    <span className="text-muted-foreground/60 shrink-0">
                      {action.durationMs}ms
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 && actionLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            {/* @ts-ignore */}
            <Activity className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              Hi! I'm Trinity, your platform copilot.
            </p>
            <p className="text-xs text-muted-foreground">
              Ask me anything about scheduling, time tracking, billing, or platform features.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                data-testid={`message-${msg.role}-${msg.id}`}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <MessageCircle className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.confidenceScore !== undefined && (
                    <p className="text-xs opacity-70 mt-1">
                      Confidence: {msg.confidenceScore}%
                    </p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-secondary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2 justify-start items-center">
                <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                  <Suspense fallback={<div className="w-8 h-8" />}>
                    <TrinityArrowMark size={32} />
                  </Suspense>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground">Trinity is thinking...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-3 shrink-0">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            data-testid="input-trinity-message"
            placeholder="Ask Trinity anything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sendMessageMutation.isPending}
            className="flex-1"
          />
          <Button
            data-testid="button-trinity-send"
            onClick={handleSend}
            disabled={!inputValue.trim() || sendMessageMutation.isPending}
            size="icon"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default TrinityDialogue;
