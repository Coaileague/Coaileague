import { useLocation } from "wouter";
import { CheckCircle, Activity, FileText, Bell, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: "compliance-officer-dashboard",
  title: "Compliance & AI Governance",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function ComplianceOfficerDashboard() {
  const [, setLocation] = useLocation();

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance & AI Governance</h1>
          <p className="text-sm text-muted-foreground mt-1">Platform-wide compliance monitoring, audits, and AI governance</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance</p>
            </div>
            <p className="text-2xl font-bold text-foreground">Monitor</p>
            <p className="text-xs text-muted-foreground mt-1">Platform compliance status</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Oversight</p>
            </div>
            <p className="text-2xl font-bold text-foreground">Review</p>
            <p className="text-xs text-muted-foreground mt-1">AI governance queue</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attestations</p>
            </div>
            <p className="text-2xl font-bold text-foreground">Audit</p>
            <p className="text-xs text-muted-foreground mt-1">Policy compliance tracking</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Retention</p>
            </div>
            <p className="text-2xl font-bold text-foreground">Configure</p>
            <p className="text-xs text-muted-foreground mt-1">Data retention policies</p>
          </div>
        </div>

        {/* Data cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-500/30 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 dark:bg-blue-700 rounded-lg">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-foreground">AI Action Audit Log</p>
                <p className="text-xs text-muted-foreground">Trinity decisions across all orgs</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/trinity/transparency")} className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              View Trinity Transparency
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <FileText className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Compliance Documents</p>
                <p className="text-xs text-muted-foreground">Document queue and policy attestations</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/compliance")} className="text-xs justify-start">
                <FileText className="w-3 h-3 mr-2" />
                Compliance Center
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/admin")} className="text-xs justify-start">
                <CheckCircle className="w-3 h-3 mr-2" />
                Audit Trail
              </Button>
            </div>
          </div>
        </div>

        {/* Access notice */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Compliance Officer Access</p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                You have platform-wide compliance oversight including audit trail reviews, AI governance monitoring, policy attestation tracking, and data retention management across all workspaces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
