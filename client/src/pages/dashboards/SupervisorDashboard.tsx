import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, AlertTriangle, FileText, Clock, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { PageSkeleton } from "@/components/ui/skeleton-loaders";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const pageConfig: CanvasPageConfig = {
  id: "supervisor-dashboard",
  title: "Site Supervisor Dashboard",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function SupervisorDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: workspace, isLoading: workspaceLoading, isError: workspaceIsError, error: workspaceError, refetch: refetchWorkspace } = useQuery<{ id: string; name?: string }>({
    queryKey: ["/api/workspace/current"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: clockStatus, isLoading: clockLoading, isError: clockIsError, error: clockError, refetch: refetchClockStatus } = useQuery<{ isClockedIn: boolean; activeTimeEntry?: any }>({
    queryKey: ["/api/time-entries/status"],
    staleTime: 30000,
  });

  const { data: shiftsRes, isLoading: shiftsLoading, isError: shiftsIsError, error: shiftsError, refetch: refetchShifts } = useQuery<any[] | { data: any[] }>({
    queryKey: ["/api/shifts"],
    staleTime: 30000,
  });

  const { data: incidentsRes, isLoading: incidentsLoading, isError: incidentsIsError, error: incidentsError, refetch: refetchIncidents } = useQuery<any[] | { data: any[] }>({
    queryKey: ["/api/incidents"],
    staleTime: 60000,
  });

  const isLoading = workspaceLoading || clockLoading || shiftsLoading || incidentsLoading;
  const isDashboardError = workspaceIsError || clockIsError || shiftsIsError || incidentsIsError;
  const dashboardError = workspaceError || clockError || shiftsError || incidentsError;

  const shifts: any[] = Array.isArray(shiftsRes)
    ? shiftsRes
    : (shiftsRes as any)?.data ?? [];

  const incidents: any[] = Array.isArray(incidentsRes)
    ? incidentsRes
    : (incidentsRes as any)?.data ?? [];

  const today = new Date();
  const todayShifts = shifts.filter((s: any) => {
    if (!s.startTime) return false;
    const start = new Date(s.startTime);
    return start.toDateString() === today.toDateString();
  });

  const openIncidents = incidents.filter((i: any) => i.status !== "closed" && i.status !== "resolved");

  const orgName = workspace?.name ?? "Your Organization";

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <PageSkeleton />
      </CanvasHubPage>
    );
  }

  if (isDashboardError) {
    return (
      <CanvasHubPage config={pageConfig}>
        <DashboardLoadError
          message={dashboardError instanceof Error ? dashboardError.message : "An unexpected error occurred"}
          onRetry={() => {
            void Promise.allSettled([
              refetchWorkspace(),
              refetchClockStatus(),
              refetchShifts(),
              refetchIncidents(),
            ]);
          }}
        />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Site Supervisor Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{orgName}</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On Shift</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {shifts.filter((s: any) => s.status === "active" || s.status === "clocked_in").length || "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's Shifts</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{todayShifts.length || "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Incidents</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{openIncidents.length || "0"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Status</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {clockStatus?.isClockedIn ? "On" : "Off"}
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Today's schedule */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Today's Schedule</p>
                  <p className="text-xs text-muted-foreground">{format(today, "EEEE, MMMM d")}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/schedule")} className="text-xs">
                Full View
              </Button>
            </div>
            <div className="space-y-2">
              {todayShifts.slice(0, 4).map((shift: any) => (
                <div key={shift.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-foreground truncate max-w-[140px]">{shift.siteName || "Site"}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize">{shift.status ?? "scheduled"}</Badge>
                </div>
              ))}
              {todayShifts.length === 0 && (
                <p className="text-xs text-muted-foreground">No shifts scheduled today</p>
              )}
            </div>
          </div>

          {/* Incidents & actions */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <FileText className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Supervisor Actions</p>
                <p className="text-xs text-muted-foreground">Reports and site management</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/incidents/new")} className="text-xs justify-start">
                <AlertTriangle className="w-3 h-3 mr-2" />
                Submit Incident Report
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/incidents")} className="text-xs justify-start">
                <FileText className="w-3 h-3 mr-2" />
                View All Incidents
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/schedule")} className="text-xs justify-start">
                <Calendar className="w-3 h-3 mr-2" />
                Schedule
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
