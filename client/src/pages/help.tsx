import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare, Send, Book, Video, FileText, Search, Sparkles,
  Phone, User, Clock, Star, CheckCircle, XCircle, AlertCircle,
  Bot, Loader2, LifeBuoy, HelpCircle, ChevronRight,
  Volume2, Mail, Cpu, Shield
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest } from "@/lib/queryClient";
import { CONTACTS } from "@shared/platformConfig";
import { useToast } from "@/hooks/use-toast";
import { sanitizeMessage } from "@/lib/sanitize";

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessage {
  id: string;
  role: "user" | "bot" | "system";
  content: string;
  timestamp: Date;
  isMarkdown?: boolean;
}

interface HelpAISession {
  sessionId: string;
  ticketNumber: string;
  state: string;
  queuePosition?: number;
}

type ChatState =
  | "idle"
  | "starting"
  | "queued"
  | "active"
  | "rating"
  | "disconnected";

// ============================================================================
// MARKDOWN RENDERER (lightweight)
// ============================================================================

function RenderMarkdown({ text }: { text: string }) {
  const rendered = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code class='bg-muted px-1 rounded text-sm font-mono'>$1</code>")
    .replace(/^---$/gm, "<hr class='border-border my-2' />")
    .replace(/\n/g, "<br />");
  
  // Sanitize with DOMPurify (via sanitizeMessage) to prevent XSS from bot/user content
  return <span dangerouslySetInnerHTML={{ __html: sanitizeMessage(rendered) }} />;
}

// ============================================================================
// STATE BADGE
// ============================================================================

function StateBadge({ state }: { state: string }) {
  const stateMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    queued: { label: "In Queue", variant: "secondary" },
    identifying: { label: "Verifying", variant: "secondary" },
    greeting: { label: "Connected", variant: "default" },
    searching: { label: "Searching", variant: "default" },
    answering: { label: "Active", variant: "default" },
    clarifying: { label: "Active", variant: "default" },
    escalating: { label: "Escalating", variant: "destructive" },
    waiting_for_human: { label: "Agent Queue", variant: "destructive" },
    satisfaction_check: { label: "Wrapping Up", variant: "secondary" },
    rating: { label: "Rating", variant: "outline" },
    resolved: { label: "Resolved", variant: "default" },
    disconnected: { label: "Ended", variant: "outline" },
  };
  const config = stateMap[state] || { label: state, variant: "secondary" as const };
  return <Badge variant={config.variant} data-testid="badge-session-state">{config.label}</Badge>;
}

// ============================================================================
// QUICK FAQ ARTICLES (static)
// ============================================================================

const helpArticles = [
  { id: "1", title: "Getting Started Guide", description: "Learn the basics and set up your workspace", category: "Basics", icon: Book },
  { id: "2", title: "Time Tracking Tutorial", description: "Master clock-in/out, timesheets, and GPS tracking", category: "Operations", icon: Video },
  { id: "3", title: "Billing & Invoicing", description: "Generate invoices, track payments, manage billing", category: "Finance", icon: FileText },
  { id: "4", title: "AI-Powered Features", description: "Use natural language search and AI analytics", category: "AI Features", icon: Sparkles },
  { id: "5", title: "Scheduling & Shifts", description: "Create shifts, manage swaps, and use the marketplace", category: "Scheduling", icon: Clock },
  { id: "6", title: "Compliance & Certifications", description: "Track certifications and maintain compliance", category: "Compliance", icon: CheckCircle },
  { id: "7", title: "Trinity Voice Phone System", description: "Call Trinity 24/7 — bilingual IVR, staff clock-in, emergency escalation", category: "Trinity AI", icon: Volume2 },
];

// ============================================================================
// MAIN HELP PAGE
// ============================================================================

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [session, setSession] = useState<HelpAISession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [ratingGiven, setRatingGiven] = useState(false);

  // Auth state (current user)
  const { data: authData } = useQuery<{ user: { id: string; email: string; firstName?: string; workspaceId?: string } }>({
    queryKey: ["/api/auth/me"],
  });

  const currentUser = authData?.user;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const addMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date(),
      isMarkdown: true,
    }]);
  }, []);

  // Start a new HelpAI session
  const startSession = useCallback(async () => {
    if (chatState === "starting") return;
    setChatState("starting");
    setMessages([]);
    setRatingGiven(false);

    try {
      const body: any = {
        workspaceId: currentUser?.workspaceId || 'platform',
      };

      const res = await apiRequest("POST", "/api/helpai/session/start", body);
      const data = await res.json();

      const sessionData: HelpAISession = {
        sessionId: data.sessionId,
        ticketNumber: data.ticketNumber,
        state: data.state || 'active',
        queuePosition: data.queuePosition,
      };
      setSession(sessionData);
      setChatState(data.queuePosition > 0 ? "queued" : "active");
      addMessage("bot", `Hello! I'm HelpAI. I've opened ticket ${data.ticketNumber} for you. How can I help?`);
    } catch (err: any) {
      toast({ title: "Could not start chat", description: err.message, variant: "destructive" });
      setChatState("idle");
    }
  }, [chatState, currentUser, addMessage, toast]);

  // Send a message
  const sendMessage = useCallback(async () => {
    const msg = inputMessage.trim();
    if (!msg || !session || isSending) return;

    setInputMessage("");
    setIsSending(true);
    addMessage("user", msg);

    try {
      const res = await apiRequest("POST", `/api/helpai/session/${session.sessionId}/message`, {
        message: msg,
      });
      const data = await res.json();

      addMessage("bot", data.reply);
      setSession(prev => prev ? { ...prev, state: data.state } : prev);

      if (data.state === "rating") {
        setChatState("rating");
      } else if (data.state === "disconnected") {
        setChatState("disconnected");
      } else if (data.state === "queued") {
        setChatState("queued");
      } else {
        setChatState("active");
      }
    } catch (err: any) {
      addMessage("system", "Connection error. Please try again.");
    } finally {
      setIsSending(false);
    }
  }, [inputMessage, session, isSending, addMessage]);

  const escalateToHuman = useCallback(async () => {
    if (!session) return;
    try {
      await apiRequest("POST", `/api/helpai/session/${session.sessionId}/escalate`, {
        reason: "User requested human agent"
      });
      addMessage("system", "Escalating to a human agent...");
      setChatState("queued");
    } catch (err: any) {
      toast({ title: "Escalation failed", description: err.message, variant: "destructive" });
    }
  }, [session, addMessage, toast]);

  const handleSatisfaction = useCallback(async (helpful: boolean) => {
    if (!session) return;
    if (helpful) {
      addMessage("bot", "Great! I'm glad I could help. Please rate your experience.");
      setChatState("rating");
    } else {
      escalateToHuman();
    }
  }, [session, addMessage, escalateToHuman]);

  const sendRating = useCallback(async (rating: number) => {
    if (!session || ratingGiven) return;
    setRatingGiven(true);
    addMessage("user", `Rating: ${rating}`);

    try {
      await apiRequest("POST", `/api/helpai/session/${session.sessionId}/close`, {
        rating
      });
      addMessage("bot", "Thank you for your feedback! Session closed.");
      setChatState("disconnected");
    } catch {
      setChatState("disconnected");
    }
  }, [session, ratingGiven, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredArticles = helpArticles.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pageConfig: CanvasPageConfig = {
    id: "help",
    title: "Help Center",
    subtitle: "Find answers or chat with HelpAI — our intelligent support assistant",
    category: "settings",
    maxWidth: "7xl",
    backButton: true,
    onBack: () => setLocation("/dashboard"),
  };

  const isChatOpen = chatState !== "idle";

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {/* Hero */}
        {!isMobile && (
          <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 dark:from-slate-900 dark:via-violet-950/20 dark:to-slate-900 border border-violet-100 dark:border-violet-900/30 rounded-lg">
            <div className="px-6 py-10 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="h-1 w-10 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-violet-600" />
                  AI-Powered Support
                </span>
                <div className="h-1 w-10 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full" />
              </div>
              <h2 className="text-3xl font-bold" data-testid="heading-help-center">
                How can we help you?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm">
                Chat with Trinity for instant answers, or browse our knowledge base
              </p>
              {chatState === "idle" && (
                <Button
                  size="lg"
                  className="gap-2 mt-2"
                  onClick={startSession}
                  data-testid="button-start-helpai-chat"
                >
                  <Bot className="h-5 w-5" />
                  Start HelpAI Chat
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={`grid gap-6 ${isChatOpen ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* ================================================================
              HELPAI CHAT PANEL
          ================================================================ */}
          {isChatOpen && (
            <div className="space-y-0">
              <Card className="flex flex-col" style={{ height: "600px" }}>
                {/* Chat Header */}
                <CardHeader className="pb-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-violet-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          HelpAI
                          {session && <StateBadge state={session.state} />}
                        </CardTitle>
                        {session && (
                          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-ticket-number">
                            Ticket {session.ticketNumber}
                            {session.queuePosition && chatState === "queued" && ` · Queue #${session.queuePosition}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chatState !== "disconnected" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setChatState("idle");
                            setSession(null);
                            setMessages([]);
                          }}
                          data-testid="button-close-chat"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {chatState === "disconnected" && (
                        <Button size="sm" variant="outline" onClick={startSession} data-testid="button-new-session">
                          New Chat
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-4">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                        data-testid={`msg-${msg.role}`}
                      >
                        {msg.role !== "user" && (
                          <div className="h-8 w-8 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                            {msg.role === "system"
                              ? <AlertCircle className="h-4 w-4 text-yellow-600" />
                              : <Bot className="h-4 w-4 text-violet-600" />
                            }
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-md px-3 py-2 text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "bg-violet-600 text-white"
                              : msg.role === "system"
                                ? "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-900/50"
                                : "bg-muted"
                          }`}
                        >
                          {msg.isMarkdown && msg.role !== "user"
                            ? <RenderMarkdown text={msg.content} />
                            : msg.content
                          }
                          <div className={`text-xs mt-1 opacity-60`}>
                            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Typing indicator */}
                    {isSending && (
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-violet-600" />
                        </div>
                        <div className="bg-muted rounded-md px-3 py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Satisfaction check */}
                {session?.state === "satisfaction_check" && (
                  <div className="border-t p-4 flex-shrink-0 bg-teal-50/50 dark:bg-teal-950/20">
                    <p className="text-sm font-medium mb-3 text-center">Was this helpful?</p>
                    <div className="flex justify-center gap-3">
                      <Button size="sm" className="bg-teal-600" onClick={() => handleSatisfaction(true)}>
                        Yes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSatisfaction(false)}>
                        No
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rating panel */}
                {chatState === "rating" && !ratingGiven && (
                  <div className="border-t p-4 flex-shrink-0">
                    <p className="text-sm text-muted-foreground mb-3 text-center">Rate your experience (1–5)</p>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map(r => (
                        <Button
                          key={r}
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => sendRating(r)}
                          data-testid={`button-rating-${r}`}
                        >
                          <Star className="h-3.5 w-3.5" />
                          {r}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input area */}
                {chatState !== "disconnected" && chatState !== "rating" && session?.state !== "satisfaction_check" && (
                  <div className="border-t p-4 flex-shrink-0">
                    {/* Quick Action Chips */}
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                      {["Report a Bug", "Billing Question", "Access Issue", "Request Feature"].map(chip => (
                        <Button 
                          key={chip} 
                          variant="outline" 
                          size="sm" 
                          className="h-7 px-3 text-[11px] rounded-full whitespace-nowrap bg-background"
                          onClick={() => setInputMessage(chip)}
                        >
                          {chip}
                        </Button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder={
                          chatState === "queued"
                            ? "You are in queue..."
                            : "Ask HelpAI anything..."
                        }
                        value={inputMessage}
                        onChange={e => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSending || chatState === "queued"}
                        data-testid="input-chat-message"
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        onClick={sendMessage}
                        disabled={isSending || !inputMessage.trim() || chatState === "queued"}
                        data-testid="button-send-message"
                      >
                        {isSending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Send className="h-4 w-4" />
                        }
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-muted-foreground">
                        Type <code className="bg-muted px-1 rounded">/help</code> for commands
                      </p>
                      {messages.filter(m => m.role === 'bot').length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-auto p-0 text-[10px] text-destructive hover:bg-transparent"
                          onClick={escalateToHuman}
                        >
                          Connect to Human
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Disconnected footer */}
                {chatState === "disconnected" && (
                  <div className="border-t p-4 flex-shrink-0 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm mb-3">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Session ended
                    </div>
                    <Button variant="outline" size="sm" onClick={startSession} data-testid="button-start-new-chat">
                      Start New Chat
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ================================================================
              HELP CONTENT (right side when chat open, full width when not)
          ================================================================ */}
          <div className="space-y-6">
            {/* Mobile start chat button */}
            {(isMobile || !isChatOpen) && (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base mb-1">Chat with Trinity</CardTitle>
                      <CardDescription>
                        Intelligent support powered by Trinity AI. Handles complex issues, escalates only when needed.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {chatState === "idle" ? (
                    <Button
                      className="w-full gap-2"
                      onClick={startSession}
                      data-testid="button-start-helpai-chat-card"
                    >
                      <LifeBuoy className="h-4 w-4" />
                      Start Support Chat
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {chatState === "starting" ? "Connecting..." : `Chat active — ${session?.ticketNumber}`}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Search */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search help articles..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-help"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick Access */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Quick Access</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="hover-elevate cursor-pointer">
                  <Link href="/chatrooms">
                    <CardHeader className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
                          <MessageSquare className="h-4 w-4 text-violet-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Live Chat Rooms</CardTitle>
                          <CardDescription className="text-xs">Team communication</CardDescription>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                      </div>
                    </CardHeader>
                  </Link>
                </Card>

                <Card className="hover-elevate cursor-pointer">
                  <Link href="/updates">
                    <CardHeader className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
                          <Sparkles className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Product Updates</CardTitle>
                          <CardDescription className="text-xs">What's new</CardDescription>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                      </div>
                    </CardHeader>
                  </Link>
                </Card>
              </div>
            </div>

            {/* Articles */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Knowledge Base</h2>
              <div className="grid gap-3">
                {filteredArticles.map(article => (
                  <Card
                    key={article.id}
                    className="hover-elevate cursor-pointer"
                    data-testid={`card-article-${article.id}`}
                  >
                    <CardHeader className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                          <article.icon className="h-4 w-4 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <CardTitle className="text-sm">{article.title}</CardTitle>
                            <Badge variant="secondary" className="text-xs">{article.category}</Badge>
                          </div>
                          <CardDescription className="text-xs">{article.description}</CardDescription>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Trinity Voice Contact Card */}
        <Card className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/40 shadow-md" data-testid="card-trinity-voice-help">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Volume2 className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white">Talk to Trinity — 24/7 AI Voice</p>
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs">Bilingual EN/ES</Badge>
                  </div>
                  <p className="text-xs text-indigo-300">
                    Trinity answers your call, routes to the right extension, assists staff with clock-in, and escalates emergencies — powered by Trinity AI.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <a
                  href="tel:+18664644151"
                  className="flex items-center gap-2 text-sm font-mono text-white hover:text-amber-300 transition-colors"
                  data-testid="link-help-trinity-phone"
                >
                  <Phone className="h-4 w-4 text-amber-400" />
                  {import.meta.env.VITE_TRINITY_PHONE || "+1 (866) 464-4151"}
                </a>
                <a
                  href={`mailto:${CONTACTS.trinity}`}
                  className="flex items-center gap-2 text-sm font-mono text-white hover:text-amber-300 transition-colors"
                  data-testid="link-help-trinity-email"
                >
                  <Mail className="h-4 w-4 text-amber-400" />
                  {CONTACTS.trinity}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HelpAI Capability Banner */}
        <Card className="border-violet-100 dark:border-violet-900/30 bg-violet-50/50 dark:bg-violet-950/10">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start gap-6">
              {[
                { icon: Bot, title: "Trinity AI Brain", desc: "Multi-node AI architecture for accurate, nuanced, and actionable answers" },
                { icon: Volume2, title: "Trinity Voice", desc: "Bilingual IVR phone system — staff clock-in, emergency escalation, client support" },
                { icon: Phone, title: "Human Escalation", desc: "Transfers to real agents only when needed, with full issue summary" },
                { icon: Star, title: "Action Tracking", desc: "Every action logged for admin review and quality assurance" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 flex-1 min-w-48">
                  <div className="h-8 w-8 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
