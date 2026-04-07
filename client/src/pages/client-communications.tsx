import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Mail,
  Phone,
  Inbox,
  Filter,
  Paperclip,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const pageConfig: CanvasPageConfig = {
  id: "client-communications",
  category: "operations",
  title: "Client Communications",
  subtitle: "Unified message hub for all client interactions",
};

type SlaStatus = "ok" | "amber" | "red";

interface Thread {
  id: string;
  clientId: string;
  clientName?: string;
  subject: string;
  status: string;
  channel: string;
  assignedToUserId?: string;
  assignedToName?: string;
  slaStatus: SlaStatus;
  lastMessageAt: string;
  lastClientReplyAt?: string;
  lastMessagePreview?: string;
  slaDeadline?: string;
  lastStaffReplyAt?: string;
  createdAt: string;
}

interface Message {
  id: string;
  threadId: string;
  senderType: string;
  senderName?: string;
  body: string;
  direction: string;
  isTrinityDraft: boolean;
  createdAt: string;
}

function formatRelative(date: string | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const hours = diff / 3_600_000;
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SlaBadge({ status }: { status: SlaStatus }) {
  if (status === "red") {
    return (
      <Badge variant="outline" className="text-[10px] border-red-500 text-red-600 dark:text-red-400 gap-1" data-testid="badge-sla-red">
        <AlertCircle className="h-2.5 w-2.5" />
        SLA Breached
      </Badge>
    );
  }
  if (status === "amber") {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400 gap-1" data-testid="badge-sla-amber">
        <AlertTriangle className="h-2.5 w-2.5" />
        SLA Warning
      </Badge>
    );
  }
  return null;
}

function slaCountdown(lastClientReplyAt: string | undefined, slaStatus: SlaStatus): string {
  if (slaStatus === "ok" || !lastClientReplyAt) return "";
  const elapsed = (Date.now() - new Date(lastClientReplyAt).getTime()) / 3_600_000;
  if (slaStatus === "red") {
    const overBy = Math.floor(elapsed - 48);
    return `${overBy}h+ overdue`;
  }
  const remaining = Math.floor(48 - elapsed);
  if (remaining <= 0) return "Due now";
  return `${remaining}h to respond`;
}

function ThreadListItem({ thread, selected, onClick }: { thread: Thread; selected: boolean; onClick: () => void }) {
  const slaHighlight =
    thread.slaStatus === "red"
      ? "border-l-2 border-l-red-500"
      : thread.slaStatus === "amber"
      ? "border-l-2 border-l-amber-500"
      : "";

  const countdown = slaCountdown(thread.lastClientReplyAt, thread.slaStatus);

  return (
    <button
      onClick={onClick}
      data-testid={`button-thread-${thread.id}`}
      className={`w-full text-left px-4 py-3 transition-colors border-b border-border hover-elevate ${slaHighlight} ${
        selected ? "bg-accent/60" : "bg-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" data-testid={`text-thread-subject-${thread.id}`}>{thread.subject}</p>
          {thread.clientName && (
            <p className="text-xs text-muted-foreground truncate" data-testid={`text-thread-client-${thread.id}`}>{thread.clientName}</p>
          )}
          {thread.lastMessagePreview && (
            <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-75">{thread.lastMessagePreview}</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(thread.lastMessageAt)}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {thread.status === "open" ? (
          <Badge variant="secondary" className="text-[10px]">Open</Badge>
        ) : thread.status === "archived" ? (
          <Badge variant="outline" className="text-[10px] opacity-60">Archived</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Resolved</Badge>
        )}
        <Badge variant="outline" className="text-[10px] capitalize">{thread.channel}</Badge>
        <SlaBadge status={thread.slaStatus} />
        {countdown && (
          <span className={`text-[10px] ${thread.slaStatus === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} data-testid={`text-sla-countdown-${thread.id}`}>
            {countdown}
          </span>
        )}
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const isTrinity = message.senderType === "trinity";

  return (
    <div
      className={`flex gap-3 mb-4 ${isOutbound ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`msg-${message.id}`}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className={`text-[10px] ${isTrinity ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" : isOutbound ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-muted"}`}>
          {isTrinity ? "AI" : (message.senderName?.charAt(0) || (isOutbound ? "S" : "C"))}
        </AvatarFallback>
      </Avatar>
      <div className={`max-w-[70%] ${isOutbound ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{message.senderName || message.senderType}</span>
          {isTrinity && (
            <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-600 dark:text-purple-400 gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Trinity
            </Badge>
          )}
        </div>
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            isOutbound
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          {message.body}
        </div>
        <span className="text-[10px] text-muted-foreground">{formatRelative(message.createdAt)}</span>
      </div>
    </div>
  );
}

function NewThreadModal({ open, onOpenChange, workspaceId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onCreated: (thread: Thread) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ clientId: "", subject: "", channel: "platform" as string, initialMessage: "" });

  const { data: clientList = [] } = useQuery<any[]>({
    queryKey: ["/api/clients/lookup", workspaceId],
    enabled: open && !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client-comms/threads", form);
      return res.json();
    },
    onSuccess: (thread) => {
      toast({ title: "Thread created", description: "New message thread started." });
      onCreated(thread);
      onOpenChange(false);
      setForm({ clientId: "", subject: "", channel: "platform", initialMessage: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-lg">
        <UniversalModalHeader>
          <UniversalModalTitle>New Message Thread</UniversalModalTitle>
        </UniversalModalHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
              <SelectTrigger data-testid="select-thread-client">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clientList.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName || `${c.firstName} ${c.lastName}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              data-testid="input-thread-subject"
              placeholder="e.g. Invoice question, Coverage update..."
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
              <SelectTrigger data-testid="select-thread-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone_note">Phone Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Initial Message (optional)</Label>
            <Textarea
              data-testid="input-thread-initial-message"
              placeholder="First message..."
              value={form.initialMessage}
              onChange={e => setForm(f => ({ ...f, initialMessage: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-thread">Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!form.clientId || !form.subject || createMutation.isPending}
            data-testid="button-create-thread"
          >
            {createMutation.isPending ? "Creating..." : "Create Thread"}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export default function ClientCommunications() {
  const { workspaceId } = useWorkspaceAccess();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [compose, setCompose] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [trinityDraft, setTrinityDraft] = useState<string | null>(null);
  const [trinityLoading, setTrinityLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: threads = [], isLoading: threadsLoading } = useQuery<Thread[]>({
    queryKey: ["/api/client-comms/threads", workspaceId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/client-comms/threads?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch threads");
      return res.json();
    },
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const selectedThread = threads.find(t => t.id === selectedThreadId) || null;

  const { data: msgData, isLoading: msgsLoading } = useQuery<{ thread: Thread; messages: Message[] }>({
    queryKey: ["/api/client-comms/threads", selectedThreadId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/client-comms/threads/${selectedThreadId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedThreadId,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgData?.messages]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/client-comms/threads/${selectedThreadId}/messages`, {
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/client-comms/threads", selectedThreadId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/client-comms/threads", workspaceId, statusFilter] });
      setCompose("");
      setAttachments([]);
      setTrinityDraft(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/client-comms/threads/${selectedThreadId}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Thread resolved" });
      qc.invalidateQueries({ queryKey: ["/api/client-comms/threads", workspaceId, statusFilter] });
      setSelectedThreadId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleTrinityDraft() {
    if (!selectedThreadId || !workspaceId) return;
    setTrinityLoading(true);
    try {
      const res = await apiRequest("POST", "/api/trinity/execute-action", {
        actionId: "client.comms.draft",
        payload: { threadId: selectedThreadId, workspaceId },
      });
      const data = await res.json();
      const draft = data?.data?.draft || data?.result?.data?.draft || "";
      if (draft) {
        setTrinityDraft(draft);
        setCompose(draft);
        toast({ title: "Trinity draft ready", description: "Review and edit before sending." });
      } else {
        toast({ title: "Draft generated", description: "No draft text returned.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTrinityLoading(false);
    }
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex h-full overflow-hidden">
        {/* ── Left Panel: Thread List ─────────────────────────────── */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Inbox</span>
              {threads.length > 0 && (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-thread-count">{threads.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 text-xs w-24" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" onClick={() => setNewThreadOpen(true)} data-testid="button-new-thread">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {threadsLoading ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p>No threads yet</p>
                <Button size="sm" variant="outline" onClick={() => setNewThreadOpen(true)} data-testid="button-empty-new-thread">
                  New Thread
                </Button>
              </div>
            ) : (
              threads.map(t => (
                <ThreadListItem
                  key={t.id}
                  thread={t}
                  selected={selectedThreadId === t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* ── Right Panel: Thread Detail + Composer ───────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedThread ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Select a thread to view messages</p>
              <Button variant="outline" onClick={() => setNewThreadOpen(true)} data-testid="button-select-prompt-new">
                <Plus className="h-4 w-4 mr-2" />
                Start New Thread
              </Button>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" data-testid="text-selected-subject">{selectedThread.subject}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {selectedThread.channel === "email" ? (
                        <Mail className="h-3 w-3 text-muted-foreground" />
                      ) : selectedThread.channel === "phone_note" ? (
                        <Phone className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground capitalize">{selectedThread.channel}</span>
                      <SlaBadge status={selectedThread.slaStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedThread.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate()}
                      disabled={resolveMutation.isPending}
                      data-testid="button-resolve-thread"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {resolveMutation.isPending ? "Resolving..." : "Resolve"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
                {msgsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-3/4" />
                    ))}
                  </div>
                ) : !msgData?.messages?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Start the conversation below.</p>
                ) : (
                  msgData.messages.map(m => <MessageBubble key={m.id} message={m} />)
                )}
              </div>

              {/* Composer */}
              {selectedThread.status === "open" && (
                <div className="border-t border-border p-4 space-y-3">
                  {trinityDraft && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Trinity draft — review before sending</span>
                    </div>
                  )}
                  <Textarea
                    value={compose}
                    onChange={e => setCompose(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    data-testid="input-compose-message"
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && compose.trim()) {
                        sendMutation.mutate(compose.trim());
                      }
                    }}
                  />
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attachments.map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs gap-1">
                          <Paperclip className="h-3 w-3" />
                          {name}
                          <button
                            onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                            className="ml-0.5"
                            data-testid={`button-remove-attachment-${i}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    data-testid="input-attachment-file"
                    onChange={e => {
                      const files = e.target.files;
                      if (files) {
                        setAttachments(prev => [...prev, ...Array.from(files).map(f => f.name)]);
                      }
                      e.target.value = "";
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTrinityDraft}
                        disabled={trinityLoading}
                        data-testid="button-trinity-draft"
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        {trinityLoading ? "Drafting..." : "Trinity Draft"}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-attach-file"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => compose.trim() && sendMutation.mutate(compose.trim())}
                      disabled={!compose.trim() || sendMutation.isPending}
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      {sendMutation.isPending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              )}

              {selectedThread.status === "resolved" && (
                <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 inline mr-1.5 text-green-500" />
                  This thread is resolved.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <NewThreadModal
        open={newThreadOpen}
        onOpenChange={setNewThreadOpen}
        workspaceId={workspaceId || ""}
        onCreated={(thread) => {
          qc.invalidateQueries({ queryKey: ["/api/client-comms/threads", workspaceId, statusFilter] });
          setSelectedThreadId(thread.id);
        }}
      />
    </CanvasHubPage>
  );
}
