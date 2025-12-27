/**
 * SUPPORT COMMAND CONSOLE - Interactive Trinity™ Chat Interface
 * 
 * Real-time chat interface for support staff to interact with Trinity™.
 * Features:
 * - Natural language commands
 * - Slash command palette
 * - Health monitoring dashboard
 * - Test tools (notifications, alerts, mock data)
 * - Orchestration telemetry
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Terminal, 
  Send, 
  Activity, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Bell,
  Megaphone,
  Heart,
  RefreshCw,
  Sparkles,
  Command,
  ChevronRight,
  Bot,
  User,
  Clock,
  Zap,
  Shield,
  Settings,
  Brain,
  Pause,
  Play,
  RotateCcw,
  Wrench,
  Database,
  Lock,
  Loader2,
  PanelRight,
  Maximize2,
  Minimize2
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  TrinityReasoningPanel, 
  ReasoningSession, 
  ReasoningStep,
  createReasoningSession,
  createReasoningStep 
} from "@/components/trinity-reasoning-panel";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  actionId?: string;
  executionTimeMs?: number;
  success?: boolean;
  data?: any;
}

interface OrchestratorAction {
  actionId: string;
  name: string;
  category: string;
  description: string;
  isTestTool?: boolean;
}

interface QuickFixAction {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  riskTier: 'safe' | 'moderate' | 'elevated' | 'critical';
  requiresApproval: boolean;
  aiSupported: boolean;
  estimatedDuration: number;
  reversible: boolean;
}

interface QuickFixLimit {
  actionCode: string;
  perDayLimit: number;
  usedToday: number;
  canExecuteImmediately: boolean;
  requiresApproval: boolean;
}

const RISK_COLORS: Record<string, string> = {
  safe: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  elevated: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

interface ServiceHealth {
  serviceName: string;
  isHealthy: boolean;
  lastCheck: string;
  errorMessage?: string;
  responseTimeMs?: number;
}

const QUICK_COMMANDS = [
  { command: '/health', description: 'Check system health', icon: Heart },
  { command: '/test-notification Hello!', description: 'Send test notification', icon: Bell },
  { command: '/test-alert Maintenance window', description: 'Send test alert', icon: AlertTriangle },
  { command: '/broadcast System update', description: 'Broadcast message', icon: Megaphone },
  { command: '/push-update New feature released', description: 'Push platform update', icon: Sparkles },
];

export default function SupportCommandConsole() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Welcome to the Support Command Console. I\'m Trinity™, your intelligent workforce assistant. You can type commands or ask questions naturally. Try /health to check system status.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Quick Fix state
  const [selectedQuickFix, setSelectedQuickFix] = useState<QuickFixAction | null>(null);
  const [showQuickFixDialog, setShowQuickFixDialog] = useState(false);
  const [quickFixNotes, setQuickFixNotes] = useState('');
  const [approvalCode, setApprovalCode] = useState('');

  // Trinity Reasoning state
  const [reasoningSession, setReasoningSession] = useState<ReasoningSession | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const [showReasoningPanel, setShowReasoningPanel] = useState(true);
  
  // Mobile tools sheet state
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  
  // Fullscreen chat mode for better visibility
  const [isFullscreenChat, setIsFullscreenChat] = useState(false);

  // Helper to add reasoning steps
  const addReasoningStep = (step: ReasoningStep) => {
    setReasoningSession(prev => {
      if (!prev) return prev;
      const updatedSteps = prev.steps.map(s => ({ ...s, isActive: false }));
      return {
        ...prev,
        steps: [...updatedSteps, step]
      };
    });
  };

  // Complete reasoning session
  const completeReasoningSession = (summary: string) => {
    setReasoningSession(prev => {
      if (!prev) return prev;
      const completedSteps = prev.steps.map(s => ({ ...s, isActive: false }));
      return {
        ...prev,
        steps: completedSteps,
        status: 'complete' as const,
        endTime: new Date(),
        summary
      };
    });
  };

  const { data: actions } = useQuery<{ actions: OrchestratorAction[] }>({
    queryKey: ['/api/helpai/orchestrator/actions'],
  });

  const { data: testTools } = useQuery<{ tools: OrchestratorAction[] }>({
    queryKey: ['/api/helpai/orchestrator/test-tools'],
  });

  const { data: healthStatus, refetch: refetchHealth } = useQuery<{ status: string; services: ServiceHealth[] }>({
    queryKey: ['/api/helpai/orchestrator/health'],
    refetchInterval: 30000,
  });

  // Trinity™ Orchestration services
  const { data: orchestrationHealth, refetch: refetchOrchestration } = useQuery<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Array<{
      name: string;
      status: 'running' | 'paused' | 'stopped' | 'error';
      pausedBy?: string;
      pauseReason?: string;
    }>;
    summary: {
      runningServices: number;
      pausedServices: number;
      errorServices: number;
      totalServices: number;
    };
  }>({
    queryKey: ['/api/ai-brain/control/health'],
    refetchInterval: 15000,
  });

  const pauseOrchestrationService = useMutation({
    mutationFn: async ({ serviceName, reason }: { serviceName: string; reason?: string }) => {
      const res = await apiRequest('POST', `/api/ai-brain/control/services/${serviceName}/pause`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/control/health'] });
      toast({ title: "Service paused", description: "Trinity™ service has been paused" });
    },
    onError: (error) => {
      toast({ title: "Failed to pause service", description: String(error), variant: "destructive" });
    },
  });

  const resumeOrchestrationService = useMutation({
    mutationFn: async (serviceName: string) => {
      const res = await apiRequest('POST', `/api/ai-brain/control/services/${serviceName}/resume`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/control/health'] });
      toast({ title: "Service resumed", description: "Trinity™ service has been resumed" });
    },
    onError: (error) => {
      toast({ title: "Failed to resume service", description: String(error), variant: "destructive" });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ai-brain/control/test-alert', {
        type: 'support_test',
        message: 'Test alert from Support Command Console'
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test alert sent", description: "Check WebSocket and notifications" });
    },
    onError: (error) => {
      toast({ title: "Failed to send test alert", description: String(error), variant: "destructive" });
    },
  });

  // Quick Fix actions
  const { data: quickFixData, isLoading: loadingQuickFix, refetch: refetchQuickFix } = useQuery<{
    actions: QuickFixAction[];
    limits: QuickFixLimit[];
    context: { role: string };
  }>({
    queryKey: ['/api/quick-fixes/actions'],
  });

  // Quick Fix AI suggestions
  const { data: quickFixSuggestions } = useQuery<{
    suggestions: Array<{
      action: QuickFixAction;
      confidence: number;
      reasoning: string;
    }>;
  }>({
    queryKey: ['/api/quick-fixes/suggestions'],
  });

  // Quick Fix history
  const { data: quickFixHistory } = useQuery<{
    requests: Array<{
      id: string;
      actionCode: string;
      status: string;
      requestedAt: string;
    }>;
  }>({
    queryKey: ['/api/quick-fixes/history'],
  });

  const executeQuickFix = useMutation({
    mutationFn: async ({ actionCode, notes }: { actionCode: string; notes?: string }) => {
      const res = await apiRequest('POST', '/api/quick-fixes/execute', { actionCode, notes });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Fix executed",
        description: data.message || "Quick fix completed successfully"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quick-fixes/actions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quick-fixes/history'] });
      setShowQuickFixDialog(false);
      setSelectedQuickFix(null);
      setQuickFixNotes('');
    },
    onError: (error) => {
      toast({ title: "Quick fix failed", description: String(error), variant: "destructive" });
    },
  });

  const requestQuickFixApproval = useMutation({
    mutationFn: async ({ actionCode, notes, approvalCode }: { actionCode: string; notes?: string; approvalCode?: string }) => {
      const res = await apiRequest('POST', '/api/quick-fixes/requests', { actionCode, notes, approvalCode });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Approval requested",
        description: data.message || "Quick fix request submitted for approval"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quick-fixes/actions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quick-fixes/history'] });
      setShowQuickFixDialog(false);
      setSelectedQuickFix(null);
      setQuickFixNotes('');
      setApprovalCode('');
    },
    onError: (error) => {
      toast({ title: "Request failed", description: String(error), variant: "destructive" });
    },
  });

  // Handler for Quick Fix action clicks
  const handleQuickFixClick = (action: QuickFixAction) => {
    setSelectedQuickFix(action);
    setQuickFixNotes('');
    setApprovalCode('');
    setShowQuickFixDialog(true);
  };

  // Handler for Quick Fix submission
  const handleQuickFixSubmit = () => {
    if (!selectedQuickFix) return;
    
    const limit = quickFixData?.limits?.find(l => l.actionCode === selectedQuickFix.code);
    const needsApproval = selectedQuickFix.requiresApproval || 
      (limit && !limit.canExecuteImmediately);

    // Validate approval metadata
    if (needsApproval && !approvalCode && !quickFixNotes) {
      toast({ 
        title: "Notes required", 
        description: "Please provide notes explaining why this fix is needed",
        variant: "destructive"
      });
      return;
    }

    if (needsApproval) {
      requestQuickFixApproval.mutate({
        actionCode: selectedQuickFix.code,
        notes: quickFixNotes || undefined,
        approvalCode: approvalCode || undefined,
      });
    } else {
      executeQuickFix.mutate({
        actionCode: selectedQuickFix.code,
        notes: quickFixNotes || undefined,
      });
    }
  };

  const sendCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      // Add reasoning step: Analyzing
      addReasoningStep(createReasoningStep(
        'thinking',
        'Understanding',
        `Analyzing your request: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}"`,
        'Parsing command intent and determining the best approach...'
      ));

      // Simulate brief delay for UX (reasoning feels more natural)
      await new Promise(resolve => setTimeout(resolve, fastMode ? 100 : 300));

      addReasoningStep(createReasoningStep(
        'searching',
        'Gathering Context',
        'Looking up relevant system state and service health...',
        'Querying Trinity™ orchestration services for current status'
      ));

      const response = await apiRequest('POST', '/api/helpai/orchestrator/command', {
        command,
        context: { source: 'support_console', fastMode }
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Add reasoning step: Executing
      addReasoningStep(createReasoningStep(
        'executing',
        'Processing',
        data.actionId ? `Executing action: ${data.actionId}` : 'Processing your request...',
        `Execution time: ${data.executionTimeMs || 'N/A'}ms`
      ));

      // Add reasoning step: Validating
      addReasoningStep(createReasoningStep(
        'validating',
        'Validating',
        'Verifying the result and preparing response...',
        undefined,
        false
      ));

      // Complete the reasoning session
      completeReasoningSession(
        data.success !== false 
          ? 'Task completed successfully. The response has been generated.' 
          : 'Task completed with warnings. Please review the response.'
      );

      const responseMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response || data.message || 'Command executed',
        timestamp: new Date(),
        actionId: data.actionId,
        executionTimeMs: data.executionTimeMs,
        success: data.success,
        data: data.data
      };
      setMessages(prev => [...prev, responseMessage]);
    },
    onError: (error: any) => {
      // Add error step and complete the session with error status
      setReasoningSession(prev => {
        if (!prev) return prev;
        const updatedSteps = prev.steps.map(s => ({ ...s, isActive: false }));
        const errorStep = createReasoningStep(
          'error',
          'Error',
          `Something went wrong: ${error.message || 'Unknown error'}`,
          'The operation could not be completed. Please try again.',
          false
        );
        return {
          ...prev,
          steps: [...updatedSteps, errorStep],
          status: 'error' as const,
          endTime: new Date(),
          summary: `Error: ${error.message || 'The operation failed. Please try again or check the logs for more details.'}`
        };
      });

      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to execute command'}`,
        timestamp: new Date(),
        success: false
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    // Create a new reasoning session for Trinity
    const newSession = createReasoningSession(
      input.length > 60 ? input.substring(0, 60) + '...' : input,
      fastMode
    );
    setReasoningSession(newSession);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    sendCommandMutation.mutate(input);
    setInput('');
  };

  const handleQuickCommand = (command: string) => {
    setInput(command);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && input === '') {
      setIsCommandPaletteOpen(true);
    }
  };

  const healthyCount = healthStatus?.services?.filter(s => s.isHealthy).length || 0;
  const totalServices = healthStatus?.services?.length || 0;

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 lg:p-6 shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 lg:space-x-3 min-w-0">
              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                <Terminal className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base lg:text-2xl font-bold truncate" data-testid="text-page-title">Support Console</h1>
                <p className="text-slate-400 text-xs lg:text-sm hidden sm:block">
                  Powered by Trinity™ — Interactive Command Interface
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1 lg:space-x-2 shrink-0">
              <Badge 
                variant={healthStatus?.status === 'healthy' ? 'default' : 'destructive'}
                className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] lg:text-xs px-1.5 lg:px-2"
                data-testid="badge-health-status"
              >
                <Activity className="w-3 h-3 mr-1" />
                {healthyCount}/{totalServices}
              </Badge>
              <Button 
                size="icon" 
                variant="ghost" 
                className="text-slate-400 hover:text-white h-8 w-8"
                onClick={() => refetchHealth()}
                data-testid="button-refresh-health"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="text-cyan-400 border-cyan-500/50 gap-1.5"
                onClick={() => setIsFullscreenChat(true)}
                data-testid="button-fullscreen-chat"
                aria-label="Expand Trinity chat to fullscreen"
                title="Expand Trinity chat to fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-medium">Expand</span>
              </Button>
              <Sheet open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
                <SheetTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="text-slate-400 hover:text-white h-8 w-8 lg:hidden"
                    data-testid="button-mobile-tools"
                    aria-label="Open tools and status panel"
                  >
                    <PanelRight className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[85vw] sm:w-80 p-4 overflow-auto">
                  <SheetHeader>
                    <SheetTitle>Tools & Status</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <MobileToolsPanel 
                      healthStatus={healthStatus}
                      orchestrationHealth={orchestrationHealth}
                      refetchOrchestration={refetchOrchestration}
                      pauseOrchestrationService={pauseOrchestrationService}
                      resumeOrchestrationService={resumeOrchestrationService}
                      testAlertMutation={testAlertMutation}
                      quickFixSuggestions={quickFixSuggestions}
                      quickFixData={quickFixData}
                      loadingQuickFix={loadingQuickFix}
                      refetchQuickFix={refetchQuickFix}
                      handleQuickFixClick={handleQuickFixClick}
                      quickFixHistory={quickFixHistory}
                      testTools={testTools}
                      handleQuickCommand={handleQuickCommand}
                      actions={actions}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-2 lg:p-4">
          <ScrollArea 
            className="flex-1 pr-2 lg:pr-4 min-h-0" 
            ref={scrollRef}
            data-testid="scroll-chat-messages"
          >
            <div className="space-y-3 lg:space-y-4 pb-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {sendCommandMutation.isPending && (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <div className="animate-pulse flex space-x-1">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">Trinity is thinking...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Trinity AI Reasoning Panel - Hidden on mobile for space */}
          {showReasoningPanel && (
            <div className="hidden lg:block mt-4 mb-2">
              <TrinityReasoningPanel
                session={reasoningSession}
                isActive={sendCommandMutation.isPending}
                fastMode={fastMode}
                onFastModeChange={setFastMode}
              />
            </div>
          )}

          <div className="mt-2 lg:mt-4 shrink-0 pb-2 lg:pb-0">
            {/* Quick commands - scrollable on mobile */}
            <div className="flex gap-2 mb-2 lg:mb-3 overflow-x-auto pb-1 -mx-2 px-2 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
              {QUICK_COMMANDS.slice(0, 3).map((cmd) => (
                <Button
                  key={cmd.command}
                  variant="outline"
                  size="sm"
                  className="text-[10px] lg:text-xs shrink-0 h-7 lg:h-8 px-2 lg:px-3"
                  onClick={() => handleQuickCommand(cmd.command)}
                  data-testid={`button-quick-${cmd.command.replace('/', '').split(' ')[0]}`}
                >
                  <cmd.icon className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">{cmd.description}</span>
                  <span className="sm:hidden">{cmd.command.split(' ')[0]}</span>
                </Button>
              ))}
              <div className="hidden lg:contents">
                {QUICK_COMMANDS.slice(3).map((cmd) => (
                  <Button
                    key={cmd.command}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 px-3"
                    onClick={() => handleQuickCommand(cmd.command)}
                    data-testid={`button-quick-${cmd.command.replace('/', '').split(' ')[0]}`}
                  >
                    <cmd.icon className="w-3 h-3 mr-1" />
                    {cmd.description}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex space-x-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Trinity anything..."
                  className="pr-10 h-10 lg:h-9 text-sm"
                  data-testid="input-command"
                />
                <Popover open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      data-testid="button-command-palette"
                    >
                      <Command className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Available Commands</h4>
                      <Separator />
                      <div className="space-y-1 max-h-60 overflow-auto">
                        {QUICK_COMMANDS.map((cmd) => (
                          <Button
                            key={cmd.command}
                            variant="ghost"
                            className="w-full justify-start text-left h-auto py-2"
                            onClick={() => {
                              handleQuickCommand(cmd.command);
                              setIsCommandPaletteOpen(false);
                            }}
                          >
                            <cmd.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                            <div>
                              <div className="font-mono text-sm">{cmd.command}</div>
                              <div className="text-xs text-muted-foreground">{cmd.description}</div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button 
                onClick={handleSend} 
                disabled={!input.trim() || sendCommandMutation.isPending}
                className="h-10 lg:h-9 px-3 lg:px-4"
                data-testid="button-send-command"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block w-80 border-l bg-muted/30 p-4 overflow-auto">
          <Tabs defaultValue="health">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="health" data-testid="tab-health">Health</TabsTrigger>
              <TabsTrigger value="orchestration" data-testid="tab-orchestration">AI</TabsTrigger>
              <TabsTrigger value="quickfix" data-testid="tab-quickfix">Fixes</TabsTrigger>
              <TabsTrigger value="tools" data-testid="tab-tools">Tools</TabsTrigger>
            </TabsList>

            <TabsContent value="health" className="mt-4 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Service Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {healthStatus?.services?.map((service) => (
                    <div 
                      key={service.serviceName} 
                      className="flex items-center justify-between text-sm"
                      data-testid={`status-service-${service.serviceName}`}
                    >
                      <div className="flex items-center space-x-2">
                        {service.isHealthy ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="capitalize">{service.serviceName}</span>
                      </div>
                      {service.responseTimeMs && (
                        <span className="text-muted-foreground text-xs">
                          {service.responseTimeMs}ms
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orchestration" className="mt-4 space-y-3">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm flex items-center">
                    <Brain className="w-4 h-4 mr-2 text-indigo-500" />
                    Orchestration
                  </CardTitle>
                  <Badge 
                    className={
                      orchestrationHealth?.overall === 'healthy' 
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                        : orchestrationHealth?.overall === 'degraded'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }
                    data-testid="badge-orchestration-status"
                  >
                    {orchestrationHealth?.overall || 'loading'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>{orchestrationHealth?.summary?.runningServices || 0}/{orchestrationHealth?.summary?.totalServices || 0} running</span>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6" 
                      onClick={() => refetchOrchestration()}
                      data-testid="button-refresh-orchestration"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {orchestrationHealth?.services?.map((service) => (
                    <div 
                      key={service.name} 
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      data-testid={`orchestration-service-${service.name}`}
                    >
                      <div className="flex items-center space-x-2">
                        {service.status === 'running' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : service.status === 'paused' ? (
                          <Pause className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-xs capitalize">{service.name.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {service.status === 'running' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => pauseOrchestrationService.mutate({ 
                              serviceName: service.name, 
                              reason: 'Manual pause from Support Console' 
                            })}
                            disabled={pauseOrchestrationService.isPending}
                            data-testid={`button-pause-${service.name}`}
                          >
                            <Pause className="w-3 h-3 text-yellow-600" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => resumeOrchestrationService.mutate(service.name)}
                            disabled={resumeOrchestrationService.isPending}
                            data-testid={`button-resume-${service.name}`}
                          >
                            <Play className="w-3 h-3 text-emerald-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {orchestrationHealth?.services?.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No services found</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Test Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => testAlertMutation.mutate()}
                    disabled={testAlertMutation.isPending}
                    data-testid="button-test-alert"
                  >
                    <AlertTriangle className="w-3 h-3 mr-2" />
                    Send Test Alert
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="quickfix" className="mt-4 space-y-3">
              {/* AI Suggestions */}
              {quickFixSuggestions?.suggestions && quickFixSuggestions.suggestions.length > 0 && (
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center">
                      <Sparkles className="w-4 h-4 mr-2 text-blue-500" />
                      AI Suggested
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {quickFixSuggestions.suggestions.slice(0, 2).map((suggestion, idx) => (
                      <div 
                        key={idx}
                        className="p-2 rounded-md bg-blue-500/10 space-y-1 hover-elevate cursor-pointer"
                        onClick={() => handleQuickFixClick(suggestion.action)}
                        data-testid={`suggestion-${suggestion.action.code}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium">{suggestion.action.name}</span>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{suggestion.reasoning}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Actions List */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm flex items-center">
                    <Wrench className="w-4 h-4 mr-2 text-orange-500" />
                    Quick Fixes
                  </CardTitle>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6" 
                    onClick={() => refetchQuickFix()}
                    data-testid="button-refresh-quickfix"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingQuickFix ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : quickFixData?.actions?.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No fixes available</p>
                  ) : (
                    quickFixData?.actions?.slice(0, 6).map((action) => {
                      const limit = quickFixData.limits?.find(l => l.actionCode === action.code);
                      const needsApproval = action.requiresApproval || (limit && !limit.canExecuteImmediately);
                      const isOverLimit = limit && limit.usedToday >= limit.perDayLimit;
                      return (
                        <div 
                          key={action.id} 
                          className="p-2 rounded-md bg-muted/50 space-y-1 hover-elevate cursor-pointer"
                          onClick={() => handleQuickFixClick(action)}
                          data-testid={`quickfix-action-${action.code}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-medium truncate">{action.name}</span>
                            <Badge className={`text-[10px] h-4 shrink-0 ${RISK_COLORS[action.riskTier]}`}>
                              {action.riskTier}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground line-clamp-2">{action.description}</p>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {limit ? `${limit.usedToday}/${limit.perDayLimit}` : ''} 
                              {isOverLimit && <span className="text-red-500 ml-1">limit</span>}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-4">
                              {needsApproval ? (
                                <><Lock className="w-2 h-2 mr-1" /> Approval</>
                              ) : (
                                <><Zap className="w-2 h-2 mr-1" /> Instant</>
                              )}
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Recent History */}
              {quickFixHistory?.requests && quickFixHistory.requests.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                      Recent
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {quickFixHistory.requests.slice(0, 3).map((request) => (
                      <div 
                        key={request.id}
                        className="flex items-center justify-between text-xs py-1"
                      >
                        <span className="truncate">{request.actionCode}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] h-4 ${
                            request.status === 'completed' ? 'text-green-600' :
                            request.status === 'failed' ? 'text-red-600' :
                            request.status === 'pending' ? 'text-yellow-600' : ''
                          }`}
                        >
                          {request.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="tools" className="mt-4 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-amber-500" />
                    Test Tools
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Support-only testing utilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {testTools?.tools?.map((tool) => (
                    <Button
                      key={tool.actionId}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => handleQuickCommand(`/${tool.actionId.replace('.', '-')}`)}
                      data-testid={`button-tool-${tool.actionId}`}
                    >
                      <div>
                        <div className="font-medium text-xs">{tool.name}</div>
                        <div className="text-xs text-muted-foreground">{tool.description}</div>
                      </div>
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center">
                    <Shield className="w-4 h-4 mr-2 text-blue-500" />
                    Available Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {actions?.actions?.length || 0} actions available
                  </div>
                  {actions?.actions?.slice(0, 5).map((action) => (
                    <div 
                      key={action.actionId} 
                      className="text-xs py-1 border-b last:border-0"
                    >
                      <div className="font-medium">{action.name}</div>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {action.category}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Quick Fix Confirmation Dialog */}
      <Dialog open={showQuickFixDialog} onOpenChange={setShowQuickFixDialog}>
        <DialogContent className="sm:max-w-md" showHomeButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-500" />
              {selectedQuickFix?.name || 'Quick Fix'}
            </DialogTitle>
            <DialogDescription>
              {selectedQuickFix?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedQuickFix && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Risk Level:</span>
                <Badge className={RISK_COLORS[selectedQuickFix.riskTier]}>
                  {selectedQuickFix.riskTier}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated Duration:</span>
                <span>{selectedQuickFix.estimatedDuration}s</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Reversible:</span>
                <span>{selectedQuickFix.reversible ? 'Yes' : 'No'}</span>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="quickfix-notes">Notes (optional)</Label>
                <Textarea
                  id="quickfix-notes"
                  placeholder="Add any relevant context..."
                  value={quickFixNotes}
                  onChange={(e) => setQuickFixNotes(e.target.value)}
                  className="resize-none"
                  rows={2}
                  data-testid="input-quickfix-notes"
                />
              </div>

              {(selectedQuickFix.requiresApproval || 
                quickFixData?.limits?.find(l => l.actionCode === selectedQuickFix.code && !l.canExecuteImmediately)) && (
                <div className="space-y-2">
                  <Label htmlFor="approval-code">Approval Code (if you have one)</Label>
                  <Input
                    id="approval-code"
                    placeholder="Enter approval code..."
                    value={approvalCode}
                    onChange={(e) => setApprovalCode(e.target.value)}
                    data-testid="input-approval-code"
                  />
                  <p className="text-xs text-muted-foreground">
                    This action requires approval. Enter an approval code to skip the queue, or submit to request approval.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowQuickFixDialog(false)}
              data-testid="button-cancel-quickfix"
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickFixSubmit}
              disabled={executeQuickFix.isPending || requestQuickFixApproval.isPending}
              data-testid="button-confirm-quickfix"
            >
              {(executeQuickFix.isPending || requestQuickFixApproval.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {selectedQuickFix?.requiresApproval || 
                quickFixData?.limits?.find(l => l.actionCode === selectedQuickFix?.code && !l.canExecuteImmediately)
                ? 'Request Approval'
                : 'Execute Fix'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFullscreenChat} onOpenChange={setIsFullscreenChat}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0" showHomeButton={false}>
          <DialogHeader className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 shrink-0 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">Trinity Chat</DialogTitle>
                  <DialogDescription className="text-slate-400 text-sm">
                    Full-screen mode for better visibility
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge 
                  variant={healthStatus?.status === 'healthy' ? 'default' : 'destructive'}
                  className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  data-testid="badge-fullscreen-health"
                >
                  <Activity className="w-3 h-3 mr-1" />
                  {healthyCount}/{totalServices}
                </Badge>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="text-slate-400 hover:text-white h-8 w-8"
                  onClick={() => setIsFullscreenChat(false)}
                  data-testid="button-minimize-chat"
                >
                  <Minimize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col overflow-hidden bg-background p-4">
            <ScrollArea className="flex-1 pr-4 min-h-0" data-testid="scroll-fullscreen-messages">
              <div className="space-y-4 pb-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {sendCommandMutation.isPending && (
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    <div className="animate-pulse flex space-x-1">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm">Trinity is thinking...</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            {showReasoningPanel && reasoningSession && (
              <div className="mt-4 mb-2">
                <TrinityReasoningPanel
                  session={reasoningSession}
                  isActive={sendCommandMutation.isPending}
                  fastMode={fastMode}
                  onFastModeChange={setFastMode}
                />
              </div>
            )}

            <div className="mt-4 shrink-0">
              <div className="flex gap-2 mb-3 flex-wrap">
                {QUICK_COMMANDS.map((cmd) => (
                  <Button
                    key={cmd.command}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 px-3"
                    onClick={() => handleQuickCommand(cmd.command)}
                    data-testid={`button-fullscreen-quick-${cmd.command.replace('/', '').split(' ')[0]}`}
                  >
                    <cmd.icon className="w-3 h-3 mr-1" />
                    {cmd.description}
                  </Button>
                ))}
              </div>

              <div className="flex space-x-2">
                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Trinity anything..."
                    className="pr-10 h-11 text-base"
                    data-testid="input-fullscreen-command"
                  />
                  <Popover open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                        data-testid="button-fullscreen-command-palette"
                      >
                        <Command className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Available Commands</h4>
                        <Separator />
                        <div className="space-y-1 max-h-60 overflow-auto">
                          {QUICK_COMMANDS.map((cmd) => (
                            <Button
                              key={cmd.command}
                              variant="ghost"
                              className="w-full justify-start text-left h-auto py-2"
                              onClick={() => {
                                handleQuickCommand(cmd.command);
                                setIsCommandPaletteOpen(false);
                              }}
                            >
                              <cmd.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                              <div>
                                <div className="font-mono text-sm">{cmd.command}</div>
                                <div className="text-xs text-muted-foreground">{cmd.description}</div>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button 
                  onClick={handleSend} 
                  disabled={!input.trim() || sendCommandMutation.isPending}
                  className="h-11 px-6"
                  data-testid="button-fullscreen-send"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start space-x-2 max-w-[85%] lg:max-w-[80%] ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white'
        }`}>
          {isUser ? <User className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> : <Bot className="w-3.5 h-3.5 lg:w-4 lg:h-4" />}
        </div>
        <div className={`rounded-lg p-2.5 lg:p-3 ${
          isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted'
        }`}>
          <p className="text-xs lg:text-sm whitespace-pre-wrap">{message.content}</p>
          
          {message.data && (
            <div className="mt-2 pt-2 border-t border-border/50">
              {Array.isArray(message.data) ? (
                <div className="space-y-1">
                  {message.data.map((item: any, i: number) => (
                    <div key={i} className="flex items-center text-xs">
                      {item.isHealthy !== undefined && (
                        item.isHealthy 
                          ? <CheckCircle className="w-3 h-3 text-emerald-500 mr-1" />
                          : <XCircle className="w-3 h-3 text-red-500 mr-1" />
                      )}
                      <span className="capitalize">{item.serviceName}</span>
                      {item.responseTimeMs && (
                        <span className="ml-auto text-muted-foreground">{item.responseTimeMs}ms</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-xs overflow-auto max-h-32">
                  {JSON.stringify(message.data, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-2 text-[10px] lg:text-xs text-muted-foreground gap-2">
            <span>{format(new Date(message.timestamp), 'HH:mm:ss')}</span>
            {message.executionTimeMs && (
              <span className="flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                {message.executionTimeMs}ms
              </span>
            )}
            {message.success !== undefined && (
              message.success 
                ? <CheckCircle className="w-3 h-3 text-emerald-500" />
                : <XCircle className="w-3 h-3 text-red-500" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileToolsPanel({
  healthStatus,
  orchestrationHealth,
  refetchOrchestration,
  pauseOrchestrationService,
  resumeOrchestrationService,
  testAlertMutation,
  quickFixSuggestions,
  quickFixData,
  loadingQuickFix,
  refetchQuickFix,
  handleQuickFixClick,
  quickFixHistory,
  testTools,
  handleQuickCommand,
  actions
}: any) {
  return (
    <Tabs defaultValue="health" className="w-full">
      <TabsList className="w-full grid grid-cols-4 h-8">
        <TabsTrigger value="health" className="text-[10px] px-1">Health</TabsTrigger>
        <TabsTrigger value="ai" className="text-[10px] px-1">AI</TabsTrigger>
        <TabsTrigger value="fixes" className="text-[10px] px-1">Fixes</TabsTrigger>
        <TabsTrigger value="tools" className="text-[10px] px-1">Tools</TabsTrigger>
      </TabsList>

      <TabsContent value="health" className="mt-3 space-y-3">
        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-sm">Service Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            {healthStatus?.services?.map((service: any) => (
              <div key={service.serviceName} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  {service.isHealthy ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className="capitalize">{service.serviceName}</span>
                </div>
                {service.responseTimeMs && (
                  <span className="text-muted-foreground text-[10px]">{service.responseTimeMs}ms</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ai" className="mt-3 space-y-3">
        <Card>
          <CardHeader className="pb-2 px-3 pt-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center">
              <Brain className="w-4 h-4 mr-2 text-indigo-500" />
              Orchestration
            </CardTitle>
            <Badge 
              className={`text-[10px] ${
                orchestrationHealth?.overall === 'healthy' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : orchestrationHealth?.overall === 'degraded'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {orchestrationHealth?.overall || 'loading'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
              <span>{orchestrationHealth?.summary?.runningServices || 0}/{orchestrationHealth?.summary?.totalServices || 0} running</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => refetchOrchestration()}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            {orchestrationHealth?.services?.slice(0, 5).map((service: any) => (
              <div key={service.name} className="flex items-center justify-between p-1.5 rounded-md bg-muted/50 text-xs">
                <div className="flex items-center space-x-2">
                  {service.status === 'running' ? (
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                  ) : service.status === 'paused' ? (
                    <Pause className="w-3 h-3 text-yellow-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                  <span className="text-[10px] capitalize truncate max-w-[120px]">{service.name.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="fixes" className="mt-3 space-y-3">
        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-sm flex items-center">
              <Wrench className="w-4 h-4 mr-2 text-orange-500" />
              Quick Fixes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            {loadingQuickFix ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : quickFixData?.actions?.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No fixes available</p>
            ) : (
              quickFixData?.actions?.slice(0, 4).map((action: any) => (
                <div 
                  key={action.id}
                  className="p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                  onClick={() => handleQuickFixClick(action)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium truncate">{action.name}</span>
                    <Badge className={`text-[10px] h-4 shrink-0 ${RISK_COLORS[action.riskTier]}`}>
                      {action.riskTier}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tools" className="mt-3 space-y-3">
        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-sm flex items-center">
              <Zap className="w-4 h-4 mr-2 text-amber-500" />
              Test Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            {testTools?.tools?.slice(0, 4).map((tool: any) => (
              <Button
                key={tool.actionId}
                variant="outline"
                size="sm"
                className="w-full justify-start text-left h-auto py-2 text-xs"
                onClick={() => handleQuickCommand(`/${tool.actionId.replace('.', '-')}`)}
              >
                <div className="truncate">
                  <div className="font-medium text-xs truncate">{tool.name}</div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-sm flex items-center">
              <Shield className="w-4 h-4 mr-2 text-blue-500" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="text-xs text-muted-foreground">
              {actions?.actions?.length || 0} actions available
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
