import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Send, Clock, Shield, User, Bot } from "lucide-react";

interface InterviewMessage {
  id: string;
  sender_type: string;
  sender_id: string;
  message_text: string;
  is_visible_to_candidate: boolean;
  sent_at: string;
}

interface RoomData {
  id: string;
  status: string;
  roomType: string;
  trinityActive: boolean;
  currentQuestionIndex: number;
  totalQuestions: number;
  candidateName: string;
  position: string;
  messages: InterviewMessage[];
  startedAt?: string;
  completedAt?: string;
}

export default function InterviewChatroomPage() {
  const { token } = useParams<{ token: string }>();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Use a ref to track room status inside the polling interval to avoid stale closure
  const roomStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    roomStatusRef.current = room?.status;
  }, [room?.status]);

  useEffect(() => {
    if (!token) return;
    loadRoom();
    // Poll every 3 seconds for new messages when room is active.
    // Read status from ref to avoid a stale closure over the initial `room` value.
    pollIntervalRef.current = setInterval(() => {
      if (roomStatusRef.current === 'active') pollMessages();
    }, 3000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [token]);

  useEffect(() => {
    scrollToBottom();
  }, [room?.messages]);

  async function loadRoom() {
    try {
      const res = await fetch(`/api/interview/room/${token}`);
      if (!res.ok) throw new Error((await res.json()).error || "Room not found");
      const data = await res.json();
      setRoom(data);
    } catch (err: any) {
      setError(err.message || "Interview room not found or has expired.");
    } finally {
      setLoading(false);
    }
  }

  async function pollMessages() {
    if (polling || !token) return;
    setPolling(true);
    try {
      const res = await fetch(`/api/interview/room/${token}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setRoom((prev) => {
        if (!prev) return prev;
        return { ...prev, messages: data.messages, status: data.status };
      });
    } catch {
      // Silent poll failure
    } finally {
      setPolling(false);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || sending || !room) return;
    setSending(true);
    const text = messageText.trim();
    setMessageText("");

    // Optimistic update
    const tempMsg: InterviewMessage = {
      id: `temp-${Date.now()}`,
      sender_type: "candidate",
      sender_id: "you",
      message_text: text,
      is_visible_to_candidate: true,
      sent_at: new Date().toISOString(),
    };
    setRoom((prev) => prev ? { ...prev, messages: [...prev.messages, tempMsg] } : prev);

    try {
      const res = await fetch(`/api/interview/room/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Failed to send");
      // Poll immediately to get Trinity's response
      setTimeout(() => pollMessages(), 1500);
      setTimeout(() => pollMessages(), 4000);
    } catch {
      setError("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading interview room...</p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Interview Room Not Found</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (room?.status === "completed") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">Interview Complete</h2>
            <p className="text-muted-foreground">
              Thank you, {room.candidateName}. Your responses have been recorded.
              The hiring team will review your interview and be in touch soon.
            </p>
            <Badge variant="secondary" className="gap-1">
              <Shield className="w-3 h-3" />
              Secured by CoAIleague
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (room?.status === "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Clock className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Interview Starting Soon</h2>
            <p className="text-muted-foreground">
              Hello, {room.candidateName}! Your interview room is ready and will begin shortly.
              The hiring team will start the session momentarily.
            </p>
            <Button variant="outline" onClick={loadRoom} data-testid="button-refresh-status">
              Check Status
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!room) return null;

  const visibleMessages = room.messages.filter((m) => m.is_visible_to_candidate);
  const progress = room.totalQuestions > 0
    ? Math.round((room.currentQuestionIndex / room.totalQuestions) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col py-4 px-4">
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-4 h-screen max-h-screen">
        {/* Header */}
        <Card className="shrink-0">
          <CardHeader className="py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base" data-testid="interview-title">
                  AI Screening Interview
                </CardTitle>
                <CardDescription>
                  {room.position} — {room.candidateName}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </Badge>
              </div>
            </div>
            {/* Progress bar */}
            {room.totalQuestions > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Question {Math.min(room.currentQuestionIndex + 1, room.totalQuestions)} of {room.totalQuestions}</span>
                  <span>{progress}% complete</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary rounded-full h-1.5 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                    data-testid="interview-progress"
                  />
                </div>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Messages */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {visibleMessages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                The interview is starting...
              </div>
            )}
            {visibleMessages.map((msg) => {
              const isTrinity = msg.sender_type === "trinity";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isTrinity ? "" : "flex-row-reverse"}`}
                  data-testid={`message-${msg.sender_type}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isTrinity ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {isTrinity ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className={`max-w-[80%] space-y-1 ${isTrinity ? "" : "items-end flex flex-col"}`}>
                    <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                      isTrinity
                        ? "bg-card border text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}>
                      {msg.message_text.split('\n').map((line, i) => (
                        <span key={i}>{line}{i < msg.message_text.split('\n').length - 1 && <br />}</span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground px-1">
                      {isTrinity ? "Trinity AI" : "You"} · {formatTime(msg.sent_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input */}
          {room.status === "active" && (
            <div className="border-t p-4 shrink-0">
              {error && (
                <p className="text-sm text-destructive mb-2">{error}</p>
              )}
              <form onSubmit={sendMessage} className="flex gap-3 items-end">
                <Textarea
                  data-testid="input-message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type your response..."
                  rows={2}
                  className="flex-1 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(e as any);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  data-testid="button-send-message"
                  disabled={sending || !messageText.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 shrink-0 pb-2">
          <Shield className="w-3 h-3" />
          This interview is secured and monitored by CoAIleague
        </p>
      </div>
    </div>
  );
}
