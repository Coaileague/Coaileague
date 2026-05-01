import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, User, MoreHorizontal, Power, PowerOff, RefreshCw, MessageSquare,
  Plus, Activity, Shield, ShieldOff, UserMinus, UserCheck, Lock, Unlock,
  Loader2, ChevronRight, Send, AlertTriangle, Sparkles, Settings2,
  UserCog, Info, BarChart3, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

// ============================================================================
// TYPES
// ============================================================================

interface SystemBot {
  id: string;
  agentId: string;
  name: string;
  description: string | null;
  missionObjective: string | null;
  status: "active" | "suspended" | "inactive";
  role: string | null;
  entityType: string;
  isGlobal: boolean;
  workspaceId: string | null;
  requestsPerHour: number;
  currentHourRequests: number;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  tokenCount24h: number;
  createdAt: string;
}

interface SupportAgent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  grantedAt: string;
  isSuspended: boolean;
  lastActiveAt: string | null;
}

interface TeamData {
  bots: SystemBot[];
  agents: SupportAgent[];
}

// ============================================================================
// BOT CONTEXT MENU
// ============================================================================

function BotContextMenu({ bot, onQuery, onAction, canManage }: {
  bot: SystemBot;
  onQuery: (bot: SystemBot) => void;
  onAction: (bot: SystemBot, action: string) => void;
  canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-bot-menu-${bot.agentId}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{bot.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onQuery(bot)} data-testid={`menu-query-${bot.agentId}`}>
          <MessageSquare className="h-4 w-4 mr-2 text-primary" />
          Ask {bot.name.split(" ")[0]}...
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(bot, 'stats')} data-testid={`menu-stats-${bot.agentId}`}>
          <BarChart3 className="h-4 w-4 mr-2" />
          View Stats
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction(bot, 'restart')} data-testid={`menu-restart-${bot.agentId}`}>
              <RefreshCw className="h-4 w-4 mr-2 text-amber-500" />
              Restart
            </DropdownMenuItem>
            {bot.status === 'active' ? (
              <DropdownMenuItem onClick={() => onAction(bot, 'suspend')} className="text-destructive" data-testid={`menu-suspend-${bot.agentId}`}>
                <PowerOff className="h-4 w-4 mr-2" />
                Take Offline
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onAction(bot, 'activate')} data-testid={`menu-activate-${bot.agentId}`}>
                <Power className="h-4 w-4 mr-2 text-green-500" />
                Bring Online
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onAction(bot, 'reset_stats')} data-testid={`menu-reset-${bot.agentId}`}>
              <Activity className="h-4 w-4 mr-2" />
              Reset Rate Counters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// AGENT CONTEXT MENU
// ============================================================================

function AgentContextMenu({ agent, onAction, canManage, isSelf }: {
  agent: SupportAgent;
  onAction: (agent: SupportAgent, action: string) => void;
  canManage: boolean;
  isSelf: boolean;
}) {
  if (isSelf) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-agent-menu-${agent.userId}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {agent.firstName} {agent.lastName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canManage && (
          <>
            <DropdownMenuItem onClick={() => onAction(agent, 'change_role')} data-testid={`menu-role-${agent.userId}`}>
              <UserCog className="h-4 w-4 mr-2" />
              Change Role
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(agent, 'demote')} data-testid={`menu-demote-${agent.userId}`}>
              <ChevronRight className="h-4 w-4 mr-2 rotate-90 text-amber-500" />
              Demote to Agent
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {agent.isSuspended ? (
              <DropdownMenuItem onClick={() => onAction(agent, 'unfreeze')} data-testid={`menu-unfreeze-${agent.userId}`}>
                <Unlock className="h-4 w-4 mr-2 text-green-500" />
                Unfreeze Account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onAction(agent, 'freeze')} className="text-destructive" data-testid={`menu-freeze-${agent.userId}`}>
                <Lock className="h-4 w-4 mr-2" />
                Freeze Account
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onAction(agent, 'remove')} className="text-destructive" data-testid={`menu-remove-${agent.userId}`}>
              <UserMinus className="h-4 w-4 mr-2" />
              Remove from Team
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// BOT QUERY DIALOG
// ============================================================================

function BotQueryDialog({ bot, open, onClose }: { bot: SystemBot | null; open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<Array<{ role: "user" | "bot"; text: string; time: string }>>([]);
  const { toast } = useToast();

  const queryMut = useMutation({
    mutationFn: (q: string) =>
      apiRequest("POST", `/api/platform/team/bots/${bot!.agentId}/query`, { question: q }).then(r => r.json()),
    onSuccess: (data) => {
      setConversation(prev => [...prev, { role: "bot", text: data.answer, time: new Date().toLocaleTimeString() }]);
    },
    onError: (err) => {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!question.trim() || queryMut.isPending) return;
    const q = question.trim();
    setConversation(prev => [...prev, { role: "user", text: q, time: new Date().toLocaleTimeString() }]);
    setQuestion("");
    queryMut.mutate(q);
  };

  const handleClose = () => {
    setConversation([]);
    setQuestion("");
    onClose();
  };

  if (!bot) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-bot-query">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", bot.status === 'active' ? "bg-green-500" : "bg-muted-foreground")} />
            {bot.name}
          </DialogTitle>
          <DialogDescription className="text-xs">{bot.missionObjective || bot.description || "System bot"}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-80 px-4 py-3">
          {conversation.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Ask {bot.name.split(" ")[0]} anything about their scope</p>
              <div className="mt-3 flex flex-col gap-1.5 text-xs">
                {["How many sessions handled today?", "What issues come up most?", "Any knowledge gaps to report?"].map(s => (
                  <button key={s} onClick={() => setQuestion(s)}
                    className="px-3 py-1.5 rounded-md border bg-muted/50 hover-elevate text-left"
                    data-testid={`suggestion-${s.slice(0, 10)}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {conversation.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs",
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className={cn("max-w-[80%] rounded-md px-3 py-2 text-sm",
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  <p className="text-[10px] opacity-60 mt-1">{msg.time}</p>
                </div>
              </div>
            ))}
            {queryMut.isPending && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="bg-muted rounded-md px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-3 border-t flex gap-2">
          <Input
            placeholder={`Ask ${bot.name.split(" ")[0]}...`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={queryMut.isPending}
            data-testid="input-bot-question"
          />
          <Button size="icon" onClick={handleSend} disabled={!question.trim() || queryMut.isPending} data-testid="button-send-question">
            {queryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ADD AGENT DIALOG
// ============================================================================

function AddAgentDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support_agent");
  const { toast } = useToast();

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/platform/team/agents", { email, role }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Agent added", description: `${data.agent?.name || email} added as ${role.replace(/_/g, " ")}` });
      setEmail(""); setRole("support_agent");
      onSuccess();
      onClose();
    },
    onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="dialog-add-agent">
        <DialogHeader>
          <DialogTitle>Add Support Agent</DialogTitle>
          <DialogDescription>Grant a platform team role to an existing ${PLATFORM_NAME} user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input placeholder="agent@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-agent-email" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-agent-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="support_agent">Support Agent</SelectItem>
                <SelectItem value="support_manager">Support Manager</SelectItem>
                <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
                <SelectItem value="sysop">Sysop</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => addMut.mutate()} disabled={!email.trim() || addMut.isPending} data-testid="button-confirm-add-agent">
            {addMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// REGISTER BOT DIALOG
// ============================================================================

function RegisterBotDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ agentId: "", name: "", description: "", missionObjective: "" });
  const { toast } = useToast();

  const regMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/platform/team/bots", form).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Bot registered", description: `${form.name} is now active` });
      setForm({ agentId: "", name: "", description: "", missionObjective: "" });
      onSuccess();
      onClose();
    },
    onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="dialog-register-bot">
        <DialogHeader>
          <DialogTitle>Register System Bot</DialogTitle>
          <DialogDescription>Add a new AI bot to the CoAI support platform.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Bot ID <span className="text-muted-foreground text-xs">(unique slug)</span></Label>
            <Input placeholder="my-bot-id" value={form.agentId} onChange={(e) => setForm(f => ({ ...f, agentId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} data-testid="input-bot-id" />
          </div>
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input placeholder="My Bot Name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-bot-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input placeholder="What does this bot do?" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} data-testid="input-bot-description" />
          </div>
          <div className="space-y-1.5">
            <Label>Mission Objective</Label>
            <Textarea placeholder="Detailed mission and scope..." value={form.missionObjective}
              onChange={(e) => setForm(f => ({ ...f, missionObjective: e.target.value }))}
              className="resize-none" rows={2} data-testid="input-bot-mission" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => regMut.mutate()} disabled={!form.agentId || !form.name || regMut.isPending} data-testid="button-confirm-register-bot">
            {regMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Register Bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ROLE CHANGE DIALOG
// ============================================================================

function ChangeRoleDialog({ agent, open, onClose, onSuccess }: {
  agent: SupportAgent | null; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [newRole, setNewRole] = useState("support_agent");
  const { toast } = useToast();

  const changeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/platform/team/agents/${agent!.userId}/action`, { action: 'change_role', newRole }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Role updated", description: `${agent!.firstName}'s role changed to ${newRole.replace(/_/g, " ")}` });
      onSuccess();
      onClose();
    },
    onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  if (!agent) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="dialog-change-role">
        <DialogHeader>
          <DialogTitle>Change Role — {agent.firstName} {agent.lastName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="support_agent">Support Agent</SelectItem>
              <SelectItem value="support_manager">Support Manager</SelectItem>
              <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
              <SelectItem value="sysop">Sysop</SelectItem>
              <SelectItem value="deputy_admin">Deputy Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => changeMut.mutate()} disabled={changeMut.isPending} data-testid="button-confirm-role">
            {changeMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status, suspended }: { status?: string; suspended?: boolean }) {
  if (suspended) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Frozen</Badge>;
  if (status === 'active') return <Badge className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">Online</Badge>;
  if (status === 'suspended') return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Offline</Badge>;
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactive</Badge>;
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    root_admin: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    deputy_admin: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    sysop: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
    support_manager: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    support_agent: "bg-muted text-muted-foreground border-border",
    compliance_officer: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    support: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge className={cn("text-[10px] px-1.5 py-0 font-medium", colors[role] || colors.support)}>
      {role.replace(/_/g, " ")}
    </Badge>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SupportTeamPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [queryBot, setQueryBot] = useState<SystemBot | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showRegisterBot, setShowRegisterBot] = useState(false);
  const [changeRoleAgent, setChangeRoleAgent] = useState<SupportAgent | null>(null);
  const [pendingAgentAction, setPendingAgentAction] = useState<{ agent: SupportAgent; action: string; message: string } | null>(null);

  const platformRole = (user as any)?.platformRole as string;
  const isRootAdmin = platformRole === 'root_admin';
  const canManage = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(platformRole);

  const { data, isLoading, refetch } = useQuery<TeamData>({
    queryKey: ['/api/platform/team'],
  });

  const botActionMut = useMutation({
    mutationFn: ({ agentId, action }: { agentId: string; action: string; reason?: string }) =>
      apiRequest("POST", `/api/platform/team/bots/${agentId}/action`, { action }).then(r => r.json()),
    onSuccess: (data, vars) => {
      toast({ title: "Bot action applied", description: `${vars.action} applied successfully` });
      refetch();
    },
    onError: (err) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  const agentActionMut = useMutation({
    mutationFn: ({ userId, action, reason, newRole }: { userId: string; action: string; reason?: string; newRole?: string }) =>
      apiRequest("POST", `/api/platform/team/agents/${userId}/action`, { action, reason, newRole }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Done", description: `${data.targetName}: ${data.action} applied` });
      refetch();
    },
    onError: (err) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  const handleBotAction = (bot: SystemBot, action: string) => {
    if (action === 'stats') {
      toast({ title: `${bot.name} Stats`, description: `Requests this hour: ${bot.currentHourRequests}/${bot.requestsPerHour} — Tokens 24h: ${bot.tokenCount24h}` });
      return;
    }
    botActionMut.mutate({ agentId: bot.agentId, action });
  };

  const handleAgentAction = (agent: SupportAgent, action: string) => {
    if (action === 'change_role') { setChangeRoleAgent(agent); return; }
    const confirmMap: Record<string, string> = {
      freeze: `Freeze ${agent.firstName}'s account? They will be locked out immediately.`,
      remove: `Remove ${agent.firstName} from the support team? This cannot be undone.`,
      demote: `Demote ${agent.firstName} to Support Agent role?`,
    };
    const confirmMsg = confirmMap[action];
    if (confirmMsg) {
      setPendingAgentAction({ agent, action, message: confirmMsg });
      return;
    }
    agentActionMut.mutate({ userId: agent.userId, action });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading support team...
      </div>
    );
  }

  const bots = data?.bots || [];
  const agents = data?.agents || [];

  return (
    <div className="space-y-6" data-testid="panel-support-team">

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Support Team</h2>
          <p className="text-xs text-muted-foreground">{bots.length} system bots · {agents.length} agents</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddAgent(true)} data-testid="button-add-agent">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Agent
            </Button>
            {isRootAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowRegisterBot(true)} data-testid="button-register-bot">
                <Bot className="h-3.5 w-3.5 mr-1" />
                Register Bot
              </Button>
            )}
          </div>
        )}
      </div>

      {/* System Bots */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">System Bots</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{bots.length}</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bots.map((bot) => (
            <Card key={bot.agentId} className="relative" data-testid={`card-bot-${bot.agentId}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={cn("h-10 w-10 rounded-md flex items-center justify-center",
                      bot.status === 'active' ? "bg-primary/10" : "bg-muted")}>
                      <Bot className={cn("h-5 w-5", bot.status === 'active' ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-background",
                      bot.status === 'active' ? "bg-green-500" : "bg-muted-foreground")} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" data-testid={`text-bot-name-${bot.agentId}`}>{bot.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <StatusBadge status={bot.status} />
                          {bot.role && <RoleBadge role={bot.role} />}
                          {bot.isGlobal && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Global</Badge>}
                        </div>
                      </div>
                      <BotContextMenu bot={bot} onQuery={setQueryBot} onAction={handleBotAction} canManage={canManage} />
                    </div>

                    {bot.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{bot.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>
                        <Activity className="h-3 w-3 inline mr-0.5" />
                        {bot.currentHourRequests}/{bot.requestsPerHour} req/hr
                      </span>
                      {bot.lastActiveAt && (
                        <span>Active {new Date(bot.lastActiveAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                {bot.status === 'suspended' && bot.suspensionReason && (
                  <div className="mt-3 px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/20 flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-destructive">{bot.suspensionReason}</p>
                  </div>
                )}

                {/* Quick query button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full text-xs"
                  onClick={() => setQueryBot(bot)}
                  disabled={bot.status === 'suspended'}
                  data-testid={`button-query-bot-${bot.agentId}`}
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Ask {bot.name.split(" ")[0]}...
                </Button>
              </CardContent>
            </Card>
          ))}

          {bots.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground text-sm border rounded-md border-dashed">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No system bots registered
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Support Agents */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Support Agents</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{agents.length}</Badge>
        </div>

        <div className="space-y-2">
          {agents.map((agent) => {
            const isSelf = agent.userId === (user as any)?.id;
            const initials = `${agent.firstName?.[0] || ''}${agent.lastName?.[0] || ''}`.toUpperCase() || '?';
            return (
              <div key={agent.userId}
                className="flex items-center gap-3 p-3 rounded-md border bg-card"
                data-testid={`row-agent-${agent.userId}`}>
                <div className="relative flex-shrink-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                  </Avatar>
                  <div className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background",
                    agent.isSuspended ? "bg-destructive" : "bg-green-500")} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" data-testid={`text-agent-name-${agent.userId}`}>
                      {agent.firstName} {agent.lastName}
                      {isSelf && <span className="text-muted-foreground text-xs ml-1">(you)</span>}
                    </span>
                    <RoleBadge role={agent.role} />
                    {agent.isSuspended && <StatusBadge suspended />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                </div>

                {!isSelf && canManage && (
                  <AgentContextMenu agent={agent} onAction={handleAgentAction} canManage={canManage} isSelf={isSelf} />
                )}
              </div>
            );
          })}

          {agents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-md border-dashed">
              <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No support agents found
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <BotQueryDialog bot={queryBot} open={!!queryBot} onClose={() => setQueryBot(null)} />
      <AddAgentDialog open={showAddAgent} onClose={() => setShowAddAgent(false)} onSuccess={refetch} />
      <RegisterBotDialog open={showRegisterBot} onClose={() => setShowRegisterBot(false)} onSuccess={refetch} />
      <ChangeRoleDialog agent={changeRoleAgent} open={!!changeRoleAgent} onClose={() => setChangeRoleAgent(null)} onSuccess={refetch} />

      <AlertDialog open={!!pendingAgentAction} onOpenChange={(o) => { if (!o) setPendingAgentAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>{pendingAgentAction?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-agent-action-cancel" onClick={() => setPendingAgentAction(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-agent-action-confirm"
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (pendingAgentAction) {
                  agentActionMut.mutate({ userId: pendingAgentAction.agent.userId, action: pendingAgentAction.action });
                }
                setPendingAgentAction(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
