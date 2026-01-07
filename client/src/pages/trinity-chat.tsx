import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Send,
  Bot,
  User,
  Briefcase,
  Heart,
  Zap,
  Settings,
  History,
  Sparkles,
  MessageSquare,
  Clock,
  ChevronLeft,
  Loader2,
  Brain,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { LogoMark } from '@/components/ui/logo-mark';
import { TrinityAnimatedLogo, TrinityThinkingIndicator } from '@/components/ui/trinity-animated-logo';

type ConversationMode = 'business' | 'personal' | 'integrated';
type SpiritualGuidance = 'none' | 'general' | 'christian';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatSession {
  id: string;
  mode: ConversationMode;
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

const MODE_COLORS = {
  business: 'from-blue-500 to-cyan-500',
  personal: 'from-emerald-500 to-teal-500',
  integrated: 'from-purple-500 to-pink-500',
};

const MODE_ICONS = {
  business: Briefcase,
  personal: Heart,
  integrated: Zap,
};

const MODE_LABELS = {
  business: 'Business',
  personal: 'Personal',
  integrated: 'Integrated',
};

export default function TrinityChat() {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<ConversationMode>('business');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
    mutationFn: async (payload: { message: string; mode: ConversationMode; sessionId?: string }) => {
      const response = await apiRequest('POST', '/api/trinity/chat/chat', payload);
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
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
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  // Mode switch mutation
  const modeMutation = useMutation({
    mutationFn: async (newMode: ConversationMode) => {
      const response = await apiRequest('POST', '/api/trinity/chat/mode', { mode: newMode });
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session.id);
      setMessages([]);
      toast({
        title: 'Mode Changed',
        description: `Switched to ${MODE_LABELS[data.mode]} mode`,
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
      mode,
      sessionId: sessionId || undefined,
    });

    setMessage('');
  };

  const handleModeSwitch = (newMode: ConversationMode) => {
    // Check if personal mode requires settings
    if (newMode === 'personal' && !buddySettings?.personalDevelopmentEnabled) {
      toast({
        title: 'Personal Development Mode',
        description: 'Enable Personal Development in settings first',
        variant: 'destructive',
      });
      setSettingsOpen(true);
      return;
    }

    setMode(newMode);
    modeMutation.mutate(newMode);
  };

  const loadSession = async (session: ChatSession) => {
    try {
      const response = await apiRequest('GET', `/api/trinity/chat/session/${session.id}/messages`);
      const data = await response.json();
      setSessionId(session.id);
      setMode(session.mode);
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

  const ModeIcon = MODE_ICONS[mode];

  return (
    <>
      <Helmet>
        <title>Trinity Chat | CoAIleague</title>
        <meta name="description" content="Chat with Trinity, your AI workforce intelligence partner" />
      </Helmet>

      <div className="flex h-[calc(100vh-4rem)] bg-background" data-testid="trinity-chat-page">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="border-b p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrinityAnimatedLogo size="md" state="idle" mode={mode} />
              <div>
                <h1 className="text-base font-semibold flex items-center gap-2">
                  Trinity
                  <Badge variant="secondary">
                    {MODE_LABELS[mode]}
                  </Badge>
                </h1>
                <p className="text-[10px] text-muted-foreground">AI Intelligence Partner</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode Switcher */}
              <Tabs value={mode} onValueChange={(v) => handleModeSwitch(v as ConversationMode)}>
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="business" className="gap-1" data-testid="tab-business">
                    <Briefcase className="h-3 w-3" />
                    <span className="hidden sm:inline">Business</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="personal"
                    className="gap-1"
                    disabled={!buddySettings?.personalDevelopmentEnabled}
                    data-testid="tab-personal"
                  >
                    <Heart className="h-3 w-3" />
                    <span className="hidden sm:inline">Personal</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="integrated"
                    className="gap-1"
                    disabled={!buddySettings?.personalDevelopmentEnabled}
                    data-testid="tab-integrated"
                  >
                    <Zap className="h-3 w-3" />
                    <span className="hidden sm:inline">Integrated</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* History Button */}
              <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-history">
                    <History className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Conversation History</SheetTitle>
                    <SheetDescription>View and resume past conversations</SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
                    {historyLoading ? (
                      <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : historyData?.sessions?.length ? (
                      <div className="space-y-2">
                        {historyData.sessions.map((session) => {
                          const SessionIcon = MODE_ICONS[session.mode];
                          return (
                            <Card
                              key={session.id}
                              className="cursor-pointer hover-elevate"
                              onClick={() => loadSession(session)}
                              data-testid={`session-${session.id}`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <SessionIcon className="h-3 w-3" />
                                  <Badge variant="secondary" className="text-[10px]">
                                    {MODE_LABELS[session.mode]}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground ml-auto">
                                    {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}
                                  </span>
                                </div>
                                <p className="text-sm truncate">{session.previewMessage}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {session.turnCount} messages
                                </p>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No conversations yet</p>
                      </div>
                    )}
                  </ScrollArea>
                </SheetContent>
              </Sheet>

              {/* Settings Button */}
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent size="sm" className="p-4">
                  <DialogHeader className="pb-2 space-y-0">
                    <DialogTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Trinity Settings
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-3">
                    {/* Personal Development Toggle */}
                    <div className="flex items-center justify-between min-h-[44px]">
                      <Label className="text-sm">Personal Development</Label>
                      <Switch
                        checked={buddySettings?.personalDevelopmentEnabled || false}
                        onCheckedChange={(checked) =>
                          settingsMutation.mutate({ personalDevelopmentEnabled: checked })
                        }
                        disabled={settingsMutation.isPending}
                        data-testid="switch-personal-development"
                      />
                    </div>

                    {/* Spiritual Guidance (only if personal development enabled) */}
                    {buddySettings?.personalDevelopmentEnabled && (
                      <>
                        <Separator />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Spiritual Guidance</Label>
                          <RadioGroup
                            value={buddySettings?.spiritualGuidance || 'none'}
                            onValueChange={(value) =>
                              settingsMutation.mutate({ spiritualGuidance: value as SpiritualGuidance })
                            }
                            className="grid grid-cols-3 gap-1"
                          >
                            <Label htmlFor="spiritual-none" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="none" id="spiritual-none" className="sr-only" />
                              None
                            </Label>
                            <Label htmlFor="spiritual-general" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="general" id="spiritual-general" className="sr-only" />
                              General
                            </Label>
                            <Label htmlFor="spiritual-christian" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="christian" id="spiritual-christian" className="sr-only" />
                              Christian
                            </Label>
                          </RadioGroup>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Accountability Level</Label>
                          <RadioGroup
                            value={buddySettings?.accountabilityLevel || 'balanced'}
                            onValueChange={(value) =>
                              settingsMutation.mutate({
                                accountabilityLevel: value as 'gentle' | 'balanced' | 'challenging',
                              })
                            }
                            className="grid grid-cols-3 gap-1"
                          >
                            <Label htmlFor="acc-gentle" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="gentle" id="acc-gentle" className="sr-only" />
                              Gentle
                            </Label>
                            <Label htmlFor="acc-balanced" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="balanced" id="acc-balanced" className="sr-only" />
                              Balanced
                            </Label>
                            <Label htmlFor="acc-challenging" className="flex justify-center items-center text-xs cursor-pointer min-h-[44px] rounded-md border hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10">
                              <RadioGroupItem value="challenging" id="acc-challenging" className="sr-only" />
                              Challenge
                            </Label>
                          </RadioGroup>
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* Metacognition Settings */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Display</Label>
                      <div className="flex items-center justify-between min-h-[44px]">
                        <Label className="text-sm font-normal">Show Reasoning</Label>
                        <Switch
                          checked={buddySettings?.showThoughtProcess ?? true}
                          onCheckedChange={(checked) => settingsMutation.mutate({ showThoughtProcess: checked })}
                          data-testid="switch-thought-process"
                        />
                      </div>
                      <div className="flex items-center justify-between min-h-[44px]">
                        <Label className="text-sm font-normal">Proactive Insights</Label>
                        <Switch
                          checked={buddySettings?.proactiveInsights ?? true}
                          onCheckedChange={(checked) => settingsMutation.mutate({ proactiveInsights: checked })}
                          data-testid="switch-proactive-insights"
                        />
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto w-16 h-16 flex items-center justify-center mb-4">
                    <TrinityAnimatedLogo size="lg" state="idle" mode={mode} />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {mode === 'business' && "Ask me about schedules, payroll, profits, or any business insight."}
                    {mode === 'personal' && "I'm here as your accountability partner. Let's work on your growth."}
                    {mode === 'integrated' && "I see both your business and personal context. Let's connect the dots."}
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="shrink-0">
                        <TrinityAnimatedLogo size="sm" state="idle" mode={mode} />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] opacity-70 mt-1">
                        {format(msg.createdAt, 'h:mm a')}
                      </p>
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start items-center">
                  <TrinityAnimatedLogo size="sm" state="thinking" mode={mode} />
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-sm text-muted-foreground animate-pulse">Trinity is thinking...</p>
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
                    : mode === 'personal'
                    ? "Share what's on your mind..."
                    : "Ask me anything - business or personal..."
                }
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
      </div>
    </>
  );
}
