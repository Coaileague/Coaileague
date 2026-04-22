import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Clock, CheckCircle, Activity, AlertCircle, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { CONTACTS } from "@shared/platformConfig";
import { AICreditBalancePanel } from "@/components/ai-brain";

const pageConfig: CanvasPageConfig = {
  id: "support-agent-dashboard",
  title: "My Support Queue",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function SupportAgentDashboard() {
  const [, setLocation] = useLocation();

  const { data: stats } = useQuery<{
    support: {
      openTickets: number;
      unresolvedEscalations: number;
      avgFirstResponseHours: number;
      liveChats: { active: number; staffOnline: number };
    };
  }>({ queryKey: ["/api/analytics/stats"], staleTime: 60000 });

  const { data: emailData } = useQuery<{ emails: any[]; total: number }>({
    queryKey: ["/api/email/inbox", { folder: "inbox", limit: 5 }],
    staleTime: 60000,
  });
  const unreadCount = emailData?.emails?.filter((e: any) => !e.is_read).length ?? 0;
  const totalEmails = emailData?.total ?? 0;

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Support Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Handle customer conversations and resolve tickets</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Tickets</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.openTickets ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Response</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.support?.avgFirstResponseHours != null
                ? `${stats.support.avgFirstResponseHours.toFixed(1)}h`
                : "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Chats</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.liveChats?.active ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escalations</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.unresolvedEscalations ?? "—"}</p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email inbox */}
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-900/20 border border-teal-500/30 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-600 dark:bg-teal-700 rounded-lg">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{CONTACTS.support}</p>
                  <p className="text-xs text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} unread · ${totalEmails} total` : `${totalEmails} total emails`}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && <Badge className="bg-teal-600 text-white text-xs">{unreadCount}</Badge>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/inbox")} className="text-xs">
              <Mail className="w-3 h-3 mr-1" />
              Open Inbox
            </Button>
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <MessageCircle className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Support Tools</p>
                <p className="text-xs text-muted-foreground">Quick access to your workspace</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/support")} className="text-xs justify-start">
                <MessageCircle className="w-3 h-3 mr-2" />
                View All Tickets
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin")} className="text-xs justify-start">
                <Activity className="w-3 h-3 mr-2" />
                Platform Search
              </Button>
            </div>
          </div>
        </div>

        {/* AI provider credit balances (read-only for agents) */}
        <AICreditBalancePanel canRefresh={false} showDashboardLinks={false} />

        {/* Access notice */}
        <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">Support Agent Access</p>
              <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                You can view your assigned conversation queue, respond to customer tickets, monitor your response times, and track your performance metrics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
