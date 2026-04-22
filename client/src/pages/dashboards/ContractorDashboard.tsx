import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Briefcase, Clock, FileText, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { PageSkeleton } from "@/components/ui/skeleton-loaders";
import { useAuth } from "@/hooks/useAuth";

const pageConfig: CanvasPageConfig = {
  id: "contractor-dashboard",
  title: "My Assignments",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function ContractorDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: earningsData, isLoading: earningsLoading, isError: earningsIsError, error: earningsError, refetch: refetchEarnings } = useQuery<{
    hoursWorked: number;
    payPeriodStart: string | null;
    payPeriodEnd: string | null;
  }>({
    queryKey: ["/api/dashboard/worker-earnings"],
    staleTime: 60000,
  });

  const { data: docsRes, isLoading: docsLoading } = useQuery<any[] | { data: any[] }>({
    queryKey: ["/api/sps/documents"],
    staleTime: 60000,
  });

  const { data: shiftsRes, isLoading: shiftsLoading, isError: shiftsIsError, error: shiftsError, refetch: refetchShifts } = useQuery<any[] | { data: any[] }>({
    queryKey: ["/api/shifts"],
    staleTime: 30000,
  });

  const isLoading = earningsLoading || docsLoading || shiftsLoading;
  const isError = earningsIsError || shiftsIsError;
  const error = earningsError || shiftsError;

  const docs: any[] = Array.isArray(docsRes) ? docsRes : (docsRes as any)?.data ?? [];
  const pendingDocs = docs.filter((d: any) => d.status === "pending" || d.status === "requires_signature");

  const shifts: any[] = Array.isArray(shiftsRes) ? shiftsRes : (shiftsRes as any)?.data ?? [];
  const upcomingShifts = shifts.filter((s: any) => {
    if (!s.startTime) return false;
    return new Date(s.startTime) >= new Date();
  });

  const firstName = user?.firstName || user?.email?.split("@")[0] || "Contractor";

  if (isError) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center p-6">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Failed to load dashboard data</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
          </div>
          <Button variant="outline" onClick={() => { refetchEarnings(); refetchShifts(); }}>
            Try Again
          </Button>
        </div>
      </CanvasHubPage>
    );
  }

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <PageSkeleton />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back, {firstName}</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignments</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{upcomingShifts.length || "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hours This Period</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {earningsData?.hoursWorked != null ? earningsData.hoursWorked.toFixed(1) : "—"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Docs Pending</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{pendingDocs.length || "0"}</p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upcoming shifts */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">My Schedule</p>
                  <p className="text-xs text-muted-foreground">Next 7 days</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/schedule")} className="text-xs">
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {upcomingShifts.slice(0, 4).map((shift: any) => (
                <div key={shift.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate max-w-[160px]">{shift.siteName || "Assignment"}</span>
                  <Badge variant="secondary" className="text-xs">{shift.status ?? "scheduled"}</Badge>
                </div>
              ))}
              {upcomingShifts.length === 0 && (
                <p className="text-xs text-muted-foreground">No upcoming assignments</p>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <FileText className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">My Documents</p>
                  <p className="text-xs text-muted-foreground">{pendingDocs.length} pending signature</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/documents")} className="text-xs justify-start">
                <FileText className="w-3 h-3 mr-2" />
                View Documents
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/time-clock")} className="text-xs justify-start">
                <Clock className="w-3 h-3 mr-2" />
                Clock In / Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
