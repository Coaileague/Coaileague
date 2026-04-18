import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Server, Database, Activity, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: "sysop-dashboard",
  title: "System Operations",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function SysopDashboard() {
  const [, setLocation] = useLocation();

  const { data: stats } = useQuery<{
    system: {
      cpu: number;
      memory: number;
      database: { status: string };
      uptimeSeconds: number;
      updatedAt: string;
    };
  }>({ queryKey: ["/api/analytics/stats"], staleTime: 30000 });

  const { data: healthData } = useQuery<{ status: string; services: Record<string, string> }>({
    queryKey: ["/api/ai-brain/health"],
    staleTime: 30000,
  });

  const dbStatus = stats?.system?.database?.status ?? "unknown";
  const dbColor = dbStatus === "healthy" ? "text-green-600" : "text-red-600";

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Operations Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor infrastructure, databases, and system performance</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CPU</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.system?.cpu != null ? `${Math.round(stats.system.cpu)}%` : "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memory</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.system?.memory != null ? `${Math.round(stats.system.memory)}%` : "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Database</p>
            </div>
            <p className={`text-2xl font-bold ${dbColor} capitalize`}>{dbStatus}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uptime</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats?.system?.uptimeSeconds != null ? formatUptime(stats.system.uptimeSeconds) : "—"}
            </p>
          </div>
        </div>

        {/* AI Brain status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-muted/50 to-muted/30 border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Activity className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">AI Brain Status</p>
                <p className="text-xs text-muted-foreground">
                  {healthData?.status ? `Status: ${healthData.status}` : "Fetching status…"}
                </p>
              </div>
            </div>
            {healthData?.services && (
              <div className="space-y-1">
                {Object.entries(healthData.services).slice(0, 4).map(([svc, status]) => (
                  <div key={svc} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{svc.replace(/_/g, " ")}</span>
                    <span className={status === "healthy" || status === "ok" ? "text-green-600" : "text-yellow-600"}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Server className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Infrastructure</p>
                <p className="text-xs text-muted-foreground">Server and diagnostics access</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin")} className="text-xs justify-start">
                <Activity className="w-3 h-3 mr-2" />
                System Diagnostics
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin/support")} className="text-xs justify-start">
                <AlertCircle className="w-3 h-3 mr-2" />
                View Error Logs
              </Button>
            </div>
          </div>
        </div>

        {/* Access notice */}
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">System Operations Access</p>
              <p className="text-xs text-muted-foreground mt-1">
                You can monitor infrastructure health, maintain databases, optimize performance metrics, and respond to system incidents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
