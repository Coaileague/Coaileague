import { useQuery } from "@tanstack/react-query";
import { StatusBadge, ActionResult } from "@/components/ui/status-badge";
import { useLocation } from "wouter";
import { FileText, CheckCircle, AlertCircle, Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { SafeSection } from "@/components/ui/safe-section";

const pageConfig: CanvasPageConfig = {
  id: "auditor-dashboard",
  title: "Audit View",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function AuditorDashboard() {
  const [, setLocation] = useLocation();

  const { data: workspace, isError: workspaceIsError, error: workspaceError, refetch: refetchWorkspace } = useQuery<{ id: string; name?: string }>({
    queryKey: ["/api/workspace/current"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: docsRes, isError: docsIsError, error: docsError, refetch: refetchDocs } = useQuery<any[] | { data: any[] }>({
    queryKey: ["/api/sps/documents"],
    staleTime: 60000,
  });

  const docs: any[] = Array.isArray(docsRes) ? docsRes : (docsRes as any)?.data ?? [];
  const orgName = workspace?.name ?? "Your Organization";

  if (workspaceIsError || docsIsError) {
    const dashboardError = workspaceError || docsError;
    return (
      <CanvasHubPage config={pageConfig}>
        <DashboardLoadError
          message={dashboardError instanceof Error ? dashboardError.message : "An unexpected error occurred"}
          onRetry={() => {
            void Promise.allSettled([refetchWorkspace(), refetchDocs()]);
          }}
        />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit View — {orgName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Read-only compliance and audit access</p>
        </div>

        {/* Read-only notice */}
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Read-Only Access</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                You have read-only auditor access. You can view compliance documents, audit trails, and license status, but cannot make changes.
              </p>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Compliance documents */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group card-float-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
                  <FileText className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Compliance Documents</p>
                  <p className="text-xs text-muted-foreground">{docs.length} document(s) on file</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              {docs.slice(0, 4).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate max-w-[160px]">{doc.name || doc.title || "Document"}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{doc.status ?? "active"}</Badge>
                </div>
              ))}
              {docs.length === 0 && (
                <p className="text-xs text-muted-foreground">No documents on file</p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/documents")} className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              View All Documents
            </Button>
          </div>

          {/* Audit trail */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group card-float-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
                <CheckCircle className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Audit Trail</p>
                <p className="text-xs text-muted-foreground">Read-only activity log</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/compliance")} className="text-xs justify-start">
                <CheckCircle className="w-3 h-3 mr-2" />
                Compliance Center
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/employees")} className="text-xs justify-start">
                <AlertCircle className="w-3 h-3 mr-2" />
                License Status
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
