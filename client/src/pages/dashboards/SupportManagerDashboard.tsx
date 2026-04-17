import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Activity, Bell, FileText, AlertCircle, Mail, Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: "support-manager-dashboard",
  title: "Support Operations",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function SupportManagerDashboard() {
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
          <h1 className="text-2xl font-bold text-foreground">Support Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">Oversee support operations, team performance, and escalations</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Tickets</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.openTickets ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff Online</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.liveChats?.staffOnline ?? "—"}</p>
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
              <Bell className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escalations</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.unresolvedEscalations ?? "—"}</p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email inbox */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-500/30 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 dark:bg-blue-700 rounded-lg">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">support@coaileague.com</p>
                  <p className="text-xs text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} unread · ${totalEmails} total` : `${totalEmails} total emails`}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && <Badge className="bg-blue-600 text-white text-xs">{unreadCount}</Badge>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/inbox")} className="text-xs">
              <Mail className="w-3 h-3 mr-1" />
              Open Inbox
            </Button>
          </div>

          {/* Team & escalations */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Activity className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Team Management</p>
                <p className="text-xs text-muted-foreground">Monitor agents and handle escalations</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/support")} className="text-xs justify-start">
                <MessageCircle className="w-3 h-3 mr-2" />
                All Support Tickets
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin")} className="text-xs justify-start">
                <FileText className="w-3 h-3 mr-2" />
                Support Analytics
              </Button>
            </div>
          </div>
        </div>

        {/* Access notice */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Support Manager Access</p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                You can manage all support conversations, monitor agent performance, handle escalations, and access support analytics across all workspaces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
