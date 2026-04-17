import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Clock, Calendar, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: "org-manager-dashboard",
  title: "Management Dashboard",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function OrgManagerDashboard() {
  const [, setLocation] = useLocation();

  const { data: workspace } = useQuery<{ id: string; name?: string }>({
    queryKey: ["/api/workspace/current"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: pendingTimeOff = [] } = useQuery<any[]>({
    queryKey: ["/api/time-off-requests/pending"],
    staleTime: 30000,
  });

  const { data: pendingTimesheetEdits = [] } = useQuery<any[]>({
    queryKey: ["/api/timesheet-edit-requests/pending"],
    staleTime: 30000,
  });

  const { data: pendingShifts = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-actions/pending"],
    staleTime: 30000,
  });

  const { data: pendingExpenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses/pending-approval"],
    staleTime: 30000,
  });

  const { data: employeesRes } = useQuery<{ data: any[] }>({
    queryKey: ["/api/employees"],
    staleTime: 60000,
  });

  const totalPending =
    pendingTimeOff.length +
    pendingTimesheetEdits.length +
    pendingShifts.length +
    pendingExpenses.length;

  const totalEmployees = employeesRes?.data?.length ?? 0;
  const orgName = workspace?.name ?? "Your Organization";

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{orgName} — Management Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Approvals, scheduling, and employee management</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Approvals</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalPending}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Employees</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalEmployees || "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shift Actions</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{pendingShifts.length}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expense Reviews</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{pendingExpenses.length}</p>
          </div>
        </div>

        {/* Approval queue */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Approval Queue</p>
                  <p className="text-xs text-muted-foreground">{totalPending} pending</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/manager-dashboard")} className="text-xs">
                Full View
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time-Off Requests</span>
                <Badge variant={pendingTimeOff.length > 0 ? "default" : "secondary"} className="text-xs">
                  {pendingTimeOff.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Timesheet Edits</span>
                <Badge variant={pendingTimesheetEdits.length > 0 ? "default" : "secondary"} className="text-xs">
                  {pendingTimesheetEdits.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Shift Actions</span>
                <Badge variant={pendingShifts.length > 0 ? "default" : "secondary"} className="text-xs">
                  {pendingShifts.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expense Reports</span>
                <Badge variant={pendingExpenses.length > 0 ? "default" : "secondary"} className="text-xs">
                  {pendingExpenses.length}
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Users className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Management Tools</p>
                <p className="text-xs text-muted-foreground">Employee and schedule management</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/employees")} className="text-xs justify-start">
                <Users className="w-3 h-3 mr-2" />
                Employee Directory
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/schedule")} className="text-xs justify-start">
                <Calendar className="w-3 h-3 mr-2" />
                Schedule Overview
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/compliance")} className="text-xs justify-start">
                <AlertCircle className="w-3 h-3 mr-2" />
                Compliance Alerts
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
