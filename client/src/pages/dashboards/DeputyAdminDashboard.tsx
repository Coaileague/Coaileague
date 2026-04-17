import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Activity, FileText, Settings, AlertCircle, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: "deputy-admin-dashboard",
  title: "Platform Operations",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function DeputyAdminDashboard() {
  const [, setLocation] = useLocation();

  const { data: stats } = useQuery<{
    support: { openTickets: number; unresolvedEscalations: number; avgFirstResponseHours: number };
    summary: { totalWorkspaces: number; activeEmployees: number };
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
          <h1 className="text-2xl font-bold text-foreground">Platform Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">Assist with platform administration and user management</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Orgs</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.summary?.totalWorkspaces ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Tickets</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.openTickets ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escalations</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats?.support?.unresolvedEscalations ?? "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Response</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.support?.avgFirstResponseHours != null
                ? `${stats.support.avgFirstResponseHours.toFixed(1)}h`
                : "—"}
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email inbox */}
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-900/20 border border-indigo-500/30 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-600 dark:bg-indigo-700 rounded-lg">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Support Email Inbox</p>
                <p className="text-xs text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} unread · ${totalEmails} total` : `${totalEmails} total emails`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Badge className="bg-indigo-600 text-white text-xs">{unreadCount}</Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => setLocation("/inbox")} className="text-xs">
                <Mail className="w-3 h-3 mr-1" />
                Open Inbox
              </Button>
            </div>
          </div>

          {/* Workspace support */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Settings className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Platform Administration</p>
                <p className="text-xs text-muted-foreground">Manage users and workspace settings</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin")} className="text-xs justify-start">
                <Users className="w-3 h-3 mr-2" />
                View All Workspaces
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/support")} className="text-xs justify-start">
                <Activity className="w-3 h-3 mr-2" />
                Support Operations
              </Button>
            </div>
          </div>
        </div>

        {/* Access notice */}
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Deputy Administrator Access</p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                You can assist with user management, workspace support, platform reporting, and configuration under Root Admin supervision. Destructive actions require root_admin approval.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
