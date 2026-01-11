/**
 * Support Queue Page - Staff view of waiting users
 * 
 * Shows users waiting for human support, with ability to join their chat
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Headset, Clock, MessageSquare, User, Send, 
  Loader2, CheckCircle, RefreshCw, Inbox, UserCheck
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { HELPAI } from '@shared/platformConfig';

interface QueueItem {
  id: string;
  ticketNumber?: string;
  userName: string;
  email?: string;
  waitingSince: string;
  messageCount: number;
  lastMessage?: string;
  metadata?: {
    url?: string;
    userAgent?: string;
  };
}

interface SessionStats {
  totalActive: number;
  aiActive: number;
  waitingHuman: number;
  humanJoined: number;
  avgWaitTime: number;
}

interface ActiveSession {
  id: string;
  ticketNumber?: string;
  userName: string;
  status: string;
  messageCount: number;
  lastMessage?: string;
  updatedAt: string;
  messages?: any[];
}

export default function SupportQueue() {
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery<{
    queue: QueueItem[];
    stats: SessionStats;
  }>({
    queryKey: ['/api/support/chat/queue'],
    refetchInterval: 10000,
  });

  const { data: mySessionsData, refetch: refetchMySessions } = useQuery<{
    sessions: ActiveSession[];
  }>({
    queryKey: ['/api/support/chat/my-sessions'],
    refetchInterval: 5000,
  });

  const joinMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest('POST', `/api/support/chat/session/${sessionId}/join`, {
        staffName: 'Support Agent',
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Joined Session',
        description: `You've joined the support chat. The user has been notified.`,
      });
      setSelectedSession({
        id: data.session.id,
        ticketNumber: data.session.ticketNumber,
        userName: 'User',
        status: 'human_joined',
        messageCount: data.session.messages?.length || 0,
        messages: data.session.messages,
        updatedAt: new Date().toISOString(),
      });
      setActiveTab('active');
      queryClient.invalidateQueries({ queryKey: ['/api/support/chat/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/support/chat/my-sessions'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Join',
        description: 'Could not join the session. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ sessionId, content }: { sessionId: string; content: string }) => {
      const res = await apiRequest('POST', `/api/support/chat/session/${sessionId}/staff-message`, {
        content,
      });
      return res.json();
    },
    onSuccess: async () => {
      setMessageInput('');
      if (selectedSession) {
        const res = await fetch(`/api/support/chat/session/${selectedSession.id}`);
        const data = await res.json();
        if (data.success) {
          setSelectedSession(prev => prev ? {
            ...prev,
            messages: data.session.messages,
            messageCount: data.session.messages?.length || 0,
          } : null);
        }
      }
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest('POST', `/api/support/chat/session/${sessionId}/resolve`, {
        resolution: 'Resolved by support staff',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Session Resolved',
        description: 'The support session has been marked as resolved.',
      });
      setSelectedSession(null);
      queryClient.invalidateQueries({ queryKey: ['/api/support/chat/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/support/chat/my-sessions'] });
    },
  });

  const formatWaitTime = (dateStr: string) => {
    const waitMs = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(waitMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  };

  return (
    <div className="container max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headset className="w-6 h-6 text-primary" />
            Support Queue
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Help users waiting for human support
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchQueue();
            refetchMySessions();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{queueData?.stats?.totalActive || 0}</div>
            <p className="text-xs text-muted-foreground">Active Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-500">
              {queueData?.stats?.waitingHuman || 0}
            </div>
            <p className="text-xs text-muted-foreground">Waiting for Help</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">
              {queueData?.stats?.humanJoined || 0}
            </div>
            <p className="text-xs text-muted-foreground">Being Helped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {queueData?.stats?.avgWaitTime || 0}m
            </div>
            <p className="text-xs text-muted-foreground">Avg Wait Time</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            <Inbox className="w-4 h-4" />
            Waiting Queue
            {(queueData?.stats?.waitingHuman || 0) > 0 && (
              <Badge variant="destructive" className="ml-1">
                {queueData?.stats?.waitingHuman}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <UserCheck className="w-4 h-4" />
            My Sessions
            {(mySessionsData?.sessions?.length || 0) > 0 && (
              <Badge variant="secondary" className="ml-1">
                {mySessionsData?.sessions?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {queueLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !queueData?.queue?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                <h3 className="font-semibold">Queue is Empty</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  No users waiting for human support right now.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {queueData.queue.map((item) => (
                <Card key={item.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{item.userName}</span>
                          {item.ticketNumber && (
                            <Badge variant="outline" className="text-xs">
                              #{item.ticketNumber}
                            </Badge>
                          )}
                        </div>
                        {item.email && (
                          <p className="text-xs text-muted-foreground mt-1">{item.email}</p>
                        )}
                        {item.lastMessage && (
                          <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                            "{item.lastMessage}"
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatWaitTime(item.waitingSince)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {item.messageCount} messages
                          </span>
                        </div>
                      </div>
                      <Button
                        onClick={() => joinMutation.mutate(item.id)}
                        disabled={joinMutation.isPending}
                        size="sm"
                      >
                        {joinMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Headset className="w-4 h-4 mr-2" />
                            Join Chat
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm text-muted-foreground mb-3">Active Chats</h3>
              {!mySessionsData?.sessions?.length ? (
                <Card>
                  <CardContent className="p-4 text-center text-muted-foreground text-sm">
                    No active sessions
                  </CardContent>
                </Card>
              ) : (
                mySessionsData.sessions.map((session) => (
                  <Card 
                    key={session.id}
                    className={cn(
                      "cursor-pointer hover-elevate",
                      selectedSession?.id === session.id && "ring-2 ring-primary"
                    )}
                    onClick={async () => {
                      const res = await fetch(`/api/support/chat/session/${session.id}`);
                      const data = await res.json();
                      if (data.success) {
                        setSelectedSession({
                          ...session,
                          messages: data.session.messages,
                        });
                      }
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="font-medium text-sm">{session.userName}</span>
                        {session.ticketNumber && (
                          <Badge variant="outline" className="text-xs ml-auto">
                            #{session.ticketNumber}
                          </Badge>
                        )}
                      </div>
                      {session.lastMessage && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {session.lastMessage}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="lg:col-span-2">
              {selectedSession ? (
                <Card className="h-[500px] flex flex-col">
                  <CardHeader className="py-3 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {selectedSession.userName}
                        </CardTitle>
                        {selectedSession.ticketNumber && (
                          <CardDescription>
                            Ticket #{selectedSession.ticketNumber}
                          </CardDescription>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveMutation.mutate(selectedSession.id)}
                        disabled={resolveMutation.isPending}
                      >
                        {resolveMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Resolve
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {selectedSession.messages?.map((msg: any) => (
                        <div 
                          key={msg.id}
                          className={cn(
                            "flex gap-2",
                            msg.sender === 'staff' && "flex-row-reverse"
                          )}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs",
                            msg.sender === 'user' && "bg-muted",
                            msg.sender === 'helpai' && "bg-violet-600 text-white",
                            msg.sender === 'staff' && "bg-green-600 text-white"
                          )}>
                            {msg.sender === 'user' && <User className="w-3 h-3" />}
                            {msg.sender === 'helpai' && 'AI'}
                            {msg.sender === 'staff' && <Headset className="w-3 h-3" />}
                          </div>
                          <div className={cn(
                            "rounded-lg px-3 py-2 text-sm max-w-[80%]",
                            msg.sender === 'user' && "bg-muted",
                            msg.sender === 'helpai' && "bg-violet-500/10",
                            msg.sender === 'staff' && "bg-green-500/10"
                          )}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="p-3 border-t flex gap-2">
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && messageInput.trim()) {
                          sendMessageMutation.mutate({
                            sessionId: selectedSession.id,
                            content: messageInput,
                          });
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        if (messageInput.trim()) {
                          sendMessageMutation.mutate({
                            sessionId: selectedSession.id,
                            content: messageInput,
                          });
                        }
                      }}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      size="icon"
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="h-[500px] flex items-center justify-center">
                  <CardContent className="text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Select a chat to view conversation</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
