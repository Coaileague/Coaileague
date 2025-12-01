/**
 * SUPPORT COMMAND CONSOLE - Interactive AI Brain Chat Interface
 * 
 * Real-time chat interface for support staff to interact with HelpAI/AI Brain.
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
  Settings
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
      content: 'Welcome to the Support Command Console. I\'m HelpAI, your AI Brain assistant. You can type commands or ask questions naturally. Try /health to check system status.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const sendCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      const response = await apiRequest('POST', '/api/helpai/orchestrator/command', {
        command,
        context: { source: 'support_console' }
      });
      return response.json();
    },
    onSuccess: (data) => {
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
    <div className="flex flex-col h-full bg-background">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl lg:text-2xl font-bold" data-testid="text-page-title">Support Command Console</h1>
                <p className="text-slate-400 text-sm">
                  HelpAI Interactive Command Interface
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge 
                variant={healthStatus?.status === 'healthy' ? 'default' : 'destructive'}
                className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                data-testid="badge-health-status"
              >
                <Activity className="w-3 h-3 mr-1" />
                {healthyCount}/{totalServices} Services
              </Badge>
              <Button 
                size="icon" 
                variant="ghost" 
                className="text-slate-400 hover:text-white"
                onClick={() => refetchHealth()}
                data-testid="button-refresh-health"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
          <ScrollArea 
            className="flex-1 pr-4" 
            ref={scrollRef}
            data-testid="scroll-chat-messages"
          >
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
                  <span className="text-sm">HelpAI is processing...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="mt-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_COMMANDS.map((cmd) => (
                <Button
                  key={cmd.command}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleQuickCommand(cmd.command)}
                  data-testid={`button-quick-${cmd.command.replace('/', '').split(' ')[0]}`}
                >
                  <cmd.icon className="w-3 h-3 mr-1" />
                  {cmd.description}
                </Button>
              ))}
            </div>

            <div className="flex space-x-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command or question... (/ for commands)"
                  className="pr-10"
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
                data-testid="button-send-command"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block w-80 border-l bg-muted/30 p-4 overflow-auto">
          <Tabs defaultValue="health">
            <TabsList className="w-full">
              <TabsTrigger value="health" className="flex-1" data-testid="tab-health">Health</TabsTrigger>
              <TabsTrigger value="tools" className="flex-1" data-testid="tab-tools">Tools</TabsTrigger>
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
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start space-x-2 max-w-[80%] ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white'
        }`}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
        <div className={`rounded-lg p-3 ${
          isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted'
        }`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          
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

          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
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
