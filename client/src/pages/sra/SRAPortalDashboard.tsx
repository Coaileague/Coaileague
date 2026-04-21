import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, AlertTriangle, FileText, Shield, TrendingUp, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SRAPortalLayout from "./SRAPortalLayout";

function sraFetch(path: string) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  }).then(r => r.json());
}

export default function SRAPortalDashboard() {
  const [, setLocation] = useLocation();

  const { data: workspaceData, isLoading: isLoadingWorkspace, isError: isErrorWorkspace } = useQuery({
    queryKey: ["/api/sra/data/workspace"],
    queryFn: () => sraFetch("/api/sra/data/workspace"),
  });

  const { data: officersData, isLoading: isLoadingOfficers, isError: isErrorOfficers } = useQuery({
    queryKey: ["/api/sra/data/officers"],
    queryFn: () => sraFetch("/api/sra/data/officers"),
  });

  const { data: findingsData, isLoading: isLoadingFindings, isError: isErrorFindings } = useQuery({
    queryKey: ["/api/sra/findings"],
    queryFn: () => sraFetch("/api/sra/findings"),
  });

  const isLoading = isLoadingWorkspace || isLoadingOfficers || isLoadingFindings;
  const hasError = isErrorWorkspace || isErrorOfficers || isErrorFindings;

  const workspace = workspaceData?.data;
  const officers: any[] = officersData?.data || [];
  const findings: any[] = findingsData?.data || [];

  const expiredCards = officers.filter(o => {
    if (!o.guardCardExpiryDate) return false;
    return new Date(o.guardCardExpiryDate) < new Date();
  });

  const criticalFindings = findings.filter(f => f.severity === "critical" && f.status === "open");
  const openFindings = findings.filter(f => f.status === "open");

  const stats = [
    {
      label: "Active Officers",
      value: officers.length,
      icon: Users,
      color: "text-blue-700",
      bg: "bg-blue-50",
      action: () => setLocation("/regulatory-audit/portal/officers"),
    },
    {
      label: "Open Findings",
      value: openFindings.length,
      icon: AlertTriangle,
      color: "text-amber-700",
      bg: "bg-amber-50",
      action: () => setLocation("/regulatory-audit/portal/findings"),
    },
    {
      label: "Critical Issues",
      value: criticalFindings.length,
      icon: Shield,
      color: "text-red-700",
      bg: "bg-red-50",
      action: () => setLocation("/regulatory-audit/portal/findings"),
    },
    {
      label: "Expired Credentials",
      value: expiredCards.length,
      icon: Clock,
      color: "text-orange-700",
      bg: "bg-orange-50",
      action: () => setLocation("/regulatory-audit/portal/officers"),
    },
  ];

  if (isLoading) {
    return (
      <SRAPortalLayout activeRoute="/regulatory-audit/portal">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SRAPortalLayout>
    );
  }

  return (
    <SRAPortalLayout activeRoute="/regulatory-audit/portal">
      <div className="p-6 max-w-5xl mx-auto">
        {hasError && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm" data-testid="error-dashboard">
            One or more data sources failed to load. Some information may be incomplete.
          </div>
        )}
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Audit Dashboard</h1>
          {workspace && (
            <p className="text-muted-foreground text-sm mt-1">
              Reviewing: <span className="font-medium text-foreground">{workspace.name || workspace.companyName}</span>
              {workspace.stateLicenseNumber && (
                <span className="ml-2 text-muted-foreground">· License #{workspace.stateLicenseNumber}</span>
              )}
            </p>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.label}
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="cursor-pointer hover-elevate"
                onClick={stat.action}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 ${stat.bg} rounded-md flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{stat.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Organization Details */}
          {workspace && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#1a3a6b] flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Organization Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  ["Organization", workspace.name || workspace.companyName || "—"],
                  ["State", workspace.stateLicenseState || "—"],
                  ["License #", workspace.stateLicenseNumber || "Not on file"],
                  ["License Status", workspace.stateLicenseVerified ? "Verified" : "Pending Verification"],
                  ["License Expiry", workspace.stateLicenseExpiry ? new Date(workspace.stateLicenseExpiry).toLocaleDateString() : "—"],
                  ["Subscription", workspace.subscriptionTier || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground text-right max-w-[55%] truncate">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Findings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1a3a6b] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Recent Findings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No findings recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {findings.slice(0, 4).map((f: any) => (
                    <div key={f.id} data-testid={`finding-row-${f.id}`} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <span className="text-sm text-foreground truncate">{f.description?.slice(0, 45)}...</span>
                      <Badge
                        className={`ml-2 flex-shrink-0 text-xs ${
                          f.severity === "critical" ? "bg-red-100 text-red-700" :
                          f.severity === "major" ? "bg-orange-100 text-orange-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {f.severity}
                      </Badge>
                    </div>
                  ))}
                  {findings.length > 4 && (
                    <button
                      onClick={() => setLocation("/regulatory-audit/portal/findings")}
                      className="text-[#1a3a6b] text-xs hover:underline mt-1"
                    >
                      View all {findings.length} findings →
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1a3a6b] flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: "Review Officer Roster", icon: Users, path: "/regulatory-audit/portal/officers" },
                  { label: "Log New Finding", icon: AlertTriangle, path: "/regulatory-audit/portal/findings" },
                  { label: "Generate Audit Report", icon: FileText, path: "/regulatory-audit/portal/report-builder" },
                ].map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      data-testid={`action-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => setLocation(action.path)}
                      className="flex items-center gap-2 p-3 border border-border rounded-md text-sm text-foreground hover-elevate text-left"
                    >
                      <Icon className="w-4 h-4 text-[#1a3a6b] flex-shrink-0" />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SRAPortalLayout>
  );
}
