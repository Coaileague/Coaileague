import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare, Plus, Hash, Volume2, Bot, BotMessageSquare, AlertTriangle, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import {
  TrinityIntakeWidget,
  TrinityIntakeCompleted,
  type ActiveIntakeSession,
  type IntakeStep,
} from "@/components/chat/TrinityIntakeWidget";

interface Room {
  id: string;
  room_name: string;
  room_slug: string;
  description?: string;
  unread_count?: string;
  last_message?: string;
}

interface ChatMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_type: string;
  message_type?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface CopilotEvent {
  content: string;
  createdAt: string;
  evasive?: boolean;
  score?: number;
}

interface IntakeCompletionCard {
  id: string;
  message: string;
  timestamp: Date;
}

function MessageBubble({ msg, currentUserId }: { msg: ChatMessage; currentUserId?: string }) {
  const isMe = msg.sender_id === currentUserId;
  const isBot = msg.sender_type === "bot" || msg.sender_type === "trinity";
  const isInterviewCopilot = msg.metadata?.copilot === true;

  if (isInterviewCopilot) return null;

  const displayName = isBot
    ? (msg.sender_type === "trinity" ? "Trinity" : "Bot")
    : msg.first_name
    ? `${msg.first_name} ${msg.last_name || ""}`.trim()
    : "Unknown";

  return (
    <div className={`flex flex-col gap-0.5 mb-3 ${isMe ? "items-end" : "items-start"}`}>
      {!isMe && (
        <span className="text-xs text-muted-foreground px-1">
          {isBot ? (
            <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{displayName}</span>
          ) : displayName}
        </span>
      )}
      <div className={`max-w-xs md:max-w-md px-3 py-2 rounded-md text-sm ${
        isMe
          ? "bg-primary text-primary-foreground"
          : isBot
          ? "bg-muted border border-border"
          : "bg-card border border-border"
      }`} data-testid={`msg-${msg.id}`}>
        <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
      </div>
      <span className="text-xs text-muted-foreground px-1">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function CopilotPanel({ roomId, workspaceId, candidateId }: { roomId: string; workspaceId?: string; candidateId?: string }) {
  const { data, isLoading } = useQuery<{ events: CopilotEvent[] }>({
    queryKey: ["/api/recruitment/candidates", candidateId, "chat-copilot"],
    queryFn: () =>
      candidateId
        ? fetch(`/api/recruitment/candidates/${candidateId}/chat-copilot`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve({ events: [] }),
    enabled: !!candidateId,
    refetchInterval: 10000,
  });

  const events = data?.events ?? [];

  return (
    <div className="w-72 border-l flex flex-col bg-muted/30 shrink-0">
      <div className="p-3 border-b flex items-center gap-2">
        <BotMessageSquare className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Trinity Co-Pilot</span>
        <Badge variant="secondary" className="text-xs ml-auto">Recruiter Only</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <BotMessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs text-muted-foreground">Trinity is listening. Co-pilot insights will appear here as the interview progresses.</p>
          </div>
        ) : (
          events.map((e, i) => (
            <div key={i} className="bg-card border border-border rounded-md p-2.5 text-xs" data-testid={`copilot-event-${i}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {e.evasive ? (
                  <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                ) : (
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                )}
                {e.evasive && <Badge variant="outline" className="text-xs text-orange-500 border-orange-200">Evasive</Badge>}
                {e.score !== undefined && (
                  <Badge variant="secondary" className="text-xs ml-auto">Score: {e.score}/10</Badge>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{e.content}</p>
              <p className="text-muted-foreground/60 mt-1 text-right">
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateRoomDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: { roomName: string; description: string }) => apiRequest("POST", "/api/chat/dock/rooms", data),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/dock/rooms"] });
      onCreated();
    },
    onError: () => toast({ title: "Failed to create room", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-create-room">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Room</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Input data-testid="input-room-name" placeholder="Room name *" value={name} onChange={e => setName(e.target.value)} />
          <Input data-testid="input-room-description" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <Button data-testid="button-submit-room" onClick={() => createMutation.mutate({ roomName: name, description })}
          disabled={!name || createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create Room"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Detect if a user message should trigger Trinity structured intake
function detectIntakeKeywords(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('locked out') || lower.includes('cannot log in') ||
    lower.includes("can't log in") || lower.includes('account locked') ||
    lower.includes('call off') || lower.includes('calloff') ||
    lower.includes('calling off') || lower.includes("can't make my shift") ||
    lower.includes('paycheck') || lower.includes('missing hours') ||
    lower.includes('wrong pay') || lower.includes('not paid') || lower.includes('pay dispute') ||
    lower.includes('incident') || lower.includes('report an incident') || lower.includes('file a report') ||
    lower.includes('notification') || lower.includes('not receiving') ||
    lower.includes('no alerts') || lower.includes('missing alerts') ||
    lower.includes('/intake') || lower.includes('@trinity help') ||
    lower.includes('i need support') || lower.includes('i need help') ||
    lower.includes('something is wrong') || lower.includes('problem with')
  );
}

export default function DockChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const interviewRoomId = params.get("interview");
  const interviewCandidateId = params.get("candidate");
  const isInterviewMode = !!interviewRoomId;
  const bus = useWebSocketBus();

  const [activeRoomId, setActiveRoomId] = useState<string | null>(interviewRoomId ?? null);
  const [messageInput, setMessageInput] = useState("");
  const [activeIntakeSession, setActiveIntakeSession] = useState<ActiveIntakeSession | null>(null);
  const [completionCards, setCompletionCards] = useState<IntakeCompletionCard[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const intakeEndRef = useRef<HTMLDivElement>(null);

  const { data: rooms, isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ["/api/chat/dock/rooms"],
    refetchInterval: 10000,
  });

  const { data: messagesData, isLoading: msgsLoading } = useQuery<{ messages: ChatMessage[] }>({
    queryKey: ["/api/chat/dock/rooms", activeRoomId, "messages"],
    queryFn: () =>
      activeRoomId
        ? fetch(`/api/chat/dock/rooms/${activeRoomId}/messages`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve({ messages: [] }),
    enabled: !!activeRoomId,
    refetchInterval: 5000,
  });

  const { data: commands } = useQuery<{ builtin: Array<{ prefix: string; description: string }> }>({
    queryKey: ["/api/chat/dock/commands"],
  });

  // Intake session start mutation
  const startIntakeMutation = useMutation({
    mutationFn: async (payload: { triggerMessage: string; chatRoomId: string }) => {
      const res = await fetch('/api/trinity/intake/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to start intake');
      return res.json();
    },
    onSuccess: (data) => {
      setActiveIntakeSession({
        sessionId: data.sessionId,
        step: data.firstStep,
        stepIndex: 0,
        totalSteps: data.totalSteps,
        greeting: data.greeting,
        flowTitle: data.flowTitle
      });
      setTimeout(() => intakeEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    },
    onError: () => {
      // Fall back to normal message send
    }
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/chat/dock/rooms/${activeRoomId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/dock/rooms", activeRoomId, "messages"] });
      setMessageInput("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const broadcastMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/chat/dock/rooms/${activeRoomId}/broadcast`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/dock/rooms", activeRoomId, "messages"] });
      toast({ title: "Broadcast sent to all members" });
    },
  });

  // Subscribe to trinity_intake_widget WebSocket events
  useEffect(() => {
    if (!bus) return;
    const unsub = bus.subscribe('trinity_intake_widget', (data: any) => {
      const { messageType, step, stepIndex, totalSteps, greeting,
              flowTitle, completionMessage, sessionId, chatRoomId } = data;

      // Only handle events for the currently active room
      if (chatRoomId && activeRoomId && chatRoomId !== activeRoomId) return;

      if (messageType === 'intake_complete') {
        setActiveIntakeSession(null);
        setCompletionCards(prev => [...prev, {
          id: `completion-${Date.now()}`,
          message: completionMessage,
          timestamp: new Date()
        }]);
        return;
      }

      if (messageType === 'intake_greeting' || messageType === 'intake_next_step') {
        setActiveIntakeSession({
          sessionId,
          step: step as IntakeStep,
          stepIndex,
          totalSteps,
          greeting: messageType === 'intake_greeting' ? greeting : undefined,
          flowTitle
        });
        setTimeout(() => intakeEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });
    return unsub;
  }, [bus, activeRoomId]);

  useEffect(() => {
    if (interviewRoomId) {
      setActiveRoomId(interviewRoomId);
    } else if (rooms?.length && !activeRoomId) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms, activeRoomId, interviewRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData]);

  // Clear intake state when switching rooms
  useEffect(() => {
    setActiveIntakeSession(null);
    setCompletionCards([]);
  }, [activeRoomId]);

  const handleSend = useCallback(() => {
    const trimmed = messageInput.trim();
    if (!trimmed || !activeRoomId) return;

    // If there's an active intake session, ignore normal send (user must use widget)
    if (activeIntakeSession) {
      toast({ title: "Please use the intake form below to respond." });
      return;
    }

    // Detect intake trigger keywords (skip in interview mode)
    if (!isInterviewMode && detectIntakeKeywords(trimmed)) {
      setMessageInput("");
      startIntakeMutation.mutate({ triggerMessage: trimmed, chatRoomId: activeRoomId });
      return;
    }

    sendMutation.mutate(trimmed);
  }, [messageInput, activeRoomId, activeIntakeSession, isInterviewMode, startIntakeMutation, sendMutation, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleIntakeComplete = useCallback((data: { complete: boolean; nextStep?: IntakeStep; nextStepIndex?: number; completionMessage?: string }) => {
    if (data.complete) {
      setActiveIntakeSession(null);
      if (data.completionMessage) {
        setCompletionCards(prev => [...prev, {
          id: `completion-${Date.now()}`,
          message: data.completionMessage!,
          timestamp: new Date()
        }]);
      }
    } else if (data.nextStep !== undefined && data.nextStepIndex !== undefined) {
      setActiveIntakeSession(prev => prev ? {
        ...prev,
        step: data.nextStep!,
        stepIndex: data.nextStepIndex!,
        greeting: undefined
      } : null);
      setTimeout(() => intakeEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, []);

  const handleIntakeAbandon = useCallback(() => {
    setActiveIntakeSession(null);
  }, []);

  const activeRoom = rooms?.find(r => r.id === activeRoomId);
  const allMessages = messagesData?.messages ?? [];
  const candidateVisibleMessages = allMessages.filter(m => m.metadata?.recruiter_only !== true && m.metadata?.copilot !== true);

  return (
    <div className="flex h-full">
      {/* Room list sidebar */}
      {!isInterviewMode && (
        <div className="w-60 border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="font-semibold text-sm">DockChat</span>
            </div>
            <CreateRoomDialog onCreated={() => {}} />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {roomsLoading ? (
              <div className="space-y-1">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (rooms?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No rooms yet</p>
            ) : (
              rooms?.map(room => (
                <button
                  key={room.id}
                  data-testid={`room-${room.id}`}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`w-full text-left px-2 py-2 rounded-md text-sm flex items-center gap-2 ${
                    activeRoomId === room.id ? "bg-sidebar-accent" : "hover-elevate"
                  }`}
                >
                  <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{room.room_name}</span>
                  {room.unread_count && parseInt(room.unread_count) > 0 && (
                    <Badge variant="secondary" className="shrink-0 text-xs">{room.unread_count}</Badge>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="p-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Bot Commands:</p>
            {(commands?.builtin ?? []).slice(0, 4).map(c => (
              <p key={c.prefix} className="text-xs text-muted-foreground truncate">
                <code className="text-foreground">{c.prefix}</code> {c.description}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeRoomId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a room to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Room header */}
            <div className="border-b p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{activeRoom?.room_name ?? (isInterviewMode ? "Interview Room" : "")}</span>
                {isInterviewMode && (
                  <Badge variant="secondary" className="text-xs">Interview Mode</Badge>
                )}
                {activeIntakeSession && (
                  <Badge variant="secondary" className="text-xs">
                    Trinity Intake Active
                  </Badge>
                )}
                {activeRoom?.description && (
                  <span className="text-xs text-muted-foreground hidden md:block">— {activeRoom.description}</span>
                )}
              </div>
              {!isInterviewMode && (
                <Button
                  size="default"
                  variant="outline"
                  data-testid="button-broadcast"
                  onClick={() => {
                    const content = prompt("Broadcast message to all room members:");
                    if (content) broadcastMutation.mutate(content);
                  }}
                >
                  <Volume2 className="h-4 w-4 mr-1" /> Broadcast
                </Button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {msgsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : candidateVisibleMessages.length === 0 && completionCards.length === 0 && !activeIntakeSession ? (
                <div className="text-center text-muted-foreground py-12 text-sm">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {isInterviewMode
                    ? "Interview room is ready. Waiting for candidate to join."
                    : <>No messages yet. Say hello or type <code>/help</code> for bot commands.</>
                  }
                </div>
              ) : (
                <>
                  {candidateVisibleMessages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} currentUserId={user?.id} />
                  ))}

                  {/* Completed intake confirmation cards */}
                  {completionCards.map(card => (
                    <TrinityIntakeCompleted key={card.id} message={card.message} />
                  ))}

                  {/* Active intake widget */}
                  {activeIntakeSession && (
                    <TrinityIntakeWidget
                      session={activeIntakeSession}
                      onComplete={handleIntakeComplete}
                      onAbandon={handleIntakeAbandon}
                    />
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
              <div ref={intakeEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <Input
                  data-testid="input-message"
                  placeholder={
                    activeIntakeSession
                      ? "Use the form above to respond to Trinity..."
                      : isInterviewMode
                      ? "Message — interviewing candidate"
                      : `Message #${activeRoom?.room_name ?? ""} — or try /help`
                  }
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                  disabled={!!activeIntakeSession || startIntakeMutation.isPending}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMutation.isPending || !!activeIntakeSession || startIntakeMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {!isInterviewMode && !activeIntakeSession && (
                <p className="text-xs text-muted-foreground mt-1">
                  Type <code>/help</code> for bot commands. @Trinity to ask the AI. Say "I need help" to start a guided intake.
                </p>
              )}
              {activeIntakeSession && (
                <p className="text-xs text-muted-foreground mt-1">
                  Trinity is collecting information. Complete the form above or click X to cancel.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Trinity Co-Pilot Panel */}
      {isInterviewMode && activeRoomId && (
        <CopilotPanel
          roomId={activeRoomId}
          candidateId={interviewCandidateId ?? undefined}
        />
      )}
    </div>
  );
}
