import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { SEO, PAGE_SEO } from '@/components/seo';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocketBus } from '@/providers/WebSocketProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal'
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import {
  Send,
  User,
  Settings,
  History,
  MessageSquare,
  Loader2,
  Activity,
  Shield,
  Crown,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { LogoMark } from '@/components/ui/coaileague-logo-mark';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { TrinityEnhancedThoughtProcess } from '@/components/trinity-enhanced';

import {
  type SpiritualGuidance
} from '@/config/trinity';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatSession {
  id: string;
  startedAt: Date;
  lastActivityAt: Date;
  turnCount: number;
  previewMessage: string;
}

interface BuddySettings {
  personalDevelopmentEnabled: boolean;
  spiritualGuidance: SpiritualGuidance;
  accountabilityLevel: 'gentle' | 'balanced' | 'challenging';
  showThoughtProcess: boolean;
  proactiveInsights: boolean;
}

const THOUGHT_PHASE_LABELS: Record<string, string> = {
  perception: 'Perceiving',
  deliberation: 'Deliberating',
  planning: 'Deciding',
  execution: 'Executing',
  reflection: 'Reflecting',
};

export default function TrinityChat() {
  const { user } = useAuth();
  const { isPlatformStaff, workspaceRole } = useWorkspaceAccess();

  const isCOORole = !isPlatformStaff && (
    workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'manager'
  );

  const [message, setMessage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [thoughtPhase, setThoughtPhase] = useState<string | null>(null);
  const thoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const bus = useWebSocketBus();
  const mode = 'business' as const; // Trinity is unified — no external mode switching
  
  const userName = user?.firstName || user?.username || user?.email?.split('@')[0] || 'there';



  useEffect(() => {
    if (!bus) return;
    const unsub = bus.subscribeAll((data: any) => {
      if (data.type === 'trinity_thinking' && data.phase) {
        if (data.sessionId && sessionId && data.sessionId !== sessionId) return;
        setThoughtPhase(data.phase);
        if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
        thoughtTimerRef.current = setTimeout(() => setThoughtPhase(null), 8000);
      }
    });
    return () => {
      unsub();
      if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
    };
  }, [bus, sessionId]);

  // Fetch BUDDY settings
  const { data: buddySettings, isLoading: settingsLoading } = useQuery<BuddySettings>({
    queryKey: ['/api/trinity/chat/settings'],
  });

  // Fetch conversation history
  const { data: historyData, isLoading: historyLoading } = useQuery<{ sessions: ChatSession[]; total: number }>({
    queryKey: ['/api/trinity/chat/history'],
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (payload: { message: string; sessionId?: string }) => {
      const response = await apiRequest('POST', '/api/trinity/chat/chat', payload);
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setThoughtPhase(null);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.response,
          createdAt: new Date(),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/chat/history'] });
    },
    onError: (error: any) => {
      setThoughtPhase(null);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session.id);
      setMessages([]);
      toast({
        title: 'Mode Changed',
        description: 'Trinity updated',
      });
    },
  });

  // Settings update mutation
  const settingsMutation = useMutation({
    mutationFn: async (updates: Partial<BuddySettings>) => {
      const response = await apiRequest('PATCH', '/api/trinity/chat/settings', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/chat/settings'] });
      toast({
        title: 'Settings Updated',
        description: 'Your preferences have been saved',
      });
    },
    onError: (error: any) => {
      console.error('[TrinityChat] Settings update error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        createdAt: new Date(),
      },
    ]);

    chatMutation.mutate({
      message,
      sessionId: sessionId || undefined,
    });

    setMessage('');
  };


  const loadSession = async (session: ChatSession) => {
    try {
      const response = await apiRequest('GET', `/api/trinity/chat/session/${session.id}/messages`);
      const data = await response.json();
      setSessionId(session.id);
      // session.mode is always 'business' — Trinity unified mode
      setMessages(
        data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.createdAt),
        }))
      );
      setHistoryOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive',
      });
    }
  };

  const trinityRoleBadge = isPlatformStaff ? (
    <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/40 gap-1 shrink-0" data-testid="badge-trinity-platform-staff">
      <Shield className="h-3 w-3 shrink-0" />
      <span className="truncate">Platform Staff</span>
    </Badge>
  ) : isCOORole ? (
    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40 gap-1 shrink-0 max-w-[140px] sm:max-w-none" data-testid="badge-trinity-coo-mode">
      <Crown className="h-3 w-3 shrink-0" />
      <span className="truncate">COO Mode</span>
    </Badge>
  ) : null;

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {trinityRoleBadge}
      {/* History Button */}
      <UniversalModal open={historyOpen} onOpenChange={setHistoryOpen}>
        <UniversalModalTrigger asChild>
          <Button variant="outline" size="icon" data-testid="button-history" aria-label="View history">
            <History className="h-4 w-4" />
          </Button>
        </UniversalModalTrigger>
        <UniversalModalContent side="right">
          <UniversalModalHeader>
            <UniversalModalTitle>Conversation History</UniversalModalTitle>
            <UniversalModalDescription>View and resume past conversations</UniversalModalDescription>
          </UniversalModalHeader>
          <ScrollArea className="h-[calc(100dvh-8rem)] mt-4">
            {historyLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : historyData?.sessions && historyData.sessions.length > 0 ? (
              <div className="space-y-2">
                {historyData.sessions.map((session) => (
                  <Card
                    key={session.id}
                    className="p-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => loadSession(session)}
                    data-testid={`card-session-${session.id}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        Trinity
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm truncate">{session.previewMessage || 'Empty session'}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.turnCount} messages
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No conversation history yet</p>
              </div>
            )}
          </ScrollArea>
        </UniversalModalContent>
      </UniversalModal>

      {/* Settings Button */}
      <UniversalModal open={settingsOpen} onOpenChange={setSettingsOpen}>
        <UniversalModalTrigger asChild>
          <Button variant="outline" size="icon" data-testid="button-settings" aria-label="Trinity settings">
            <Settings className="h-4 w-4" />
          </Button>
        </UniversalModalTrigger>
        <UniversalModalContent className="sm:max-w-sm">
          <UniversalModalHeader>
            <UniversalModalTitle>BUDDY Settings</UniversalModalTitle>
            <UniversalModalDescription>Configure your Trinity experience</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-6 mt-6">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="personal-dev">Personal Development</Label>
              <Switch
                id="personal-dev"
                checked={buddySettings?.personalDevelopmentEnabled}
                onCheckedChange={(checked) =>
                  settingsMutation.mutate({ personalDevelopmentEnabled: checked })
                }
                data-testid="switch-personal-dev"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="show-thought">Show Thought Process</Label>
              <Switch
                id="show-thought"
                checked={buddySettings?.showThoughtProcess}
                onCheckedChange={(checked) =>
                  settingsMutation.mutate({ showThoughtProcess: checked })
                }
                data-testid="switch-thought-process"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="proactive">Proactive Insights</Label>
              <Switch
                id="proactive"
                checked={buddySettings?.proactiveInsights}
                onCheckedChange={(checked) =>
                  settingsMutation.mutate({ proactiveInsights: checked })
                }
                data-testid="switch-proactive"
              />
            </div>
            <Separator />
            <div className="space-y-3">
              <Label>Accountability Level</Label>
              <RadioGroup
                value={buddySettings?.accountabilityLevel}
                onValueChange={(value) =>
                  settingsMutation.mutate({
                    accountabilityLevel: value as 'gentle' | 'balanced' | 'challenging',
                  })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="gentle" id="gentle" data-testid="radio-gentle" />
                  <Label htmlFor="gentle" className="font-normal">
                    Gentle - Supportive and encouraging
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="balanced" id="balanced" data-testid="radio-balanced" />
                  <Label htmlFor="balanced" className="font-normal">
                    Balanced - Mix of support and challenge
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="challenging" id="challenging" data-testid="radio-challenging" />
                  <Label htmlFor="challenging" className="font-normal">
                    Challenging - Direct and growth-focused
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );

  return (
    <>
      <SEO
        title={PAGE_SEO.dashboard.title}
        description={PAGE_SEO.dashboard.description}
        noindex={true}
      />

      <CanvasHubPage config={{
        id: 'trinity-chat',
        title: 'Trinity Chat',
        subtitle: userName !== 'there' ? `Ready to help, ${userName}` : 'AI Intelligence Partner',
        category: 'communication',
        headerActions,
      }}>
        <div className="flex flex-col h-[calc(100dvh-12rem)] pb-safe" data-testid="trinity-chat-page">
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4" role="log" aria-label="Trinity AI chat messages" aria-live="polite" aria-relevant="additions">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <LogoMark size="lg" className="mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Welcome to Trinity Chat</h3>
                  <p className="text-muted-foreground mb-6">
                    "Ask me anything — schedules, reports, team insights, or whatever's on your mind"
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Badge className="cursor-pointer hover-elevate" onClick={() => setMessage("Show me today's schedule")}>
                          Today's schedule
                        </Badge>
                        <Badge className="cursor-pointer hover-elevate" onClick={() => setMessage("Any overtime issues this week?")}>
                          Overtime issues
                        </Badge>
                        <Badge className="cursor-pointer hover-elevate" onClick={() => setMessage("Generate a performance report")}>
                          Performance report
                        </Badge>
                    >
                          Set goals
                        </Badge>
                        <Badge className="cursor-pointer hover-elevate" onClick={() => setMessage("I need to have a difficult conversation")}>
                          Difficult conversation
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                        <LogoMark size="sm" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] opacity-60 mt-1">
                        {format(new Date(msg.createdAt), 'h:mm a')}
                      </p>
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start" data-testid="trinity-thinking-indicator">
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center animate-pulse">
                    <LogoMark size="sm" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    {buddySettings?.showThoughtProcess ? (
                      <TrinityEnhancedThoughtProcess
                        request={message}
                        isVisible={true}
                        actionCategories={['schedule', 'payment', 'communication', 'personalstate', 'ai']}
                      />
                    ) : (
                      thoughtPhase ? (
                        <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{THOUGHT_PHASE_LABELS[thoughtPhase] || thoughtPhase}</span>
                            <span className="animate-pulse">...</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground animate-pulse">Trinity is thinking...</p>
                      )
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="max-w-3xl mx-auto flex gap-2"
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === 'business'
                    ? "Ask about schedules, payroll, or business insights..."
                    : false}
                className="flex-1"
                disabled={chatMutation.isPending}
                data-testid="input-message"
              />
              <Button
                type="submit"
                disabled={!message.trim() || chatMutation.isPending}
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </CanvasHubPage>
    </>
  );
}
