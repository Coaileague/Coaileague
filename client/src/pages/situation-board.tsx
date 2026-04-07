import { useEffect, useCallback, useRef } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import {
  Shield, AlertTriangle, Clock, Users, Radio, MapPin,
  CircleDot, Activity, RefreshCw, Siren
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface GuardStatus {
  id: string;
  name: string;
  role: string;
  status: "on_duty" | "off_duty" | "inactive";
  currentSite: string | null;
  lastClockIn: string | null;
}

interface ActiveIncident {
  id: number;
  title: string;
  severity: string;
  status: string;
  location: string | null;
  reported_by: string | null;
  created_at: string;
}

interface OpenShift {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  site_name: string | null;
  assigned_to: string | null;
}

interface SituationSummary {
  totalGuards: number;
  onDuty: number;
  activeIncidents: number;
  criticalIncidents: number;
  openShifts: number;
  totalUpcomingShifts: number;
}

const STATUS_COLORS: Record<string, string> = {
  on_duty: "bg-green-500",
  off_duty: "bg-gray-400",
  inactive: "bg-red-400",
};

const SEVERITY_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatShiftTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SituationBoard() {
  const queryClient = useQueryClient();
  const bus = useWebSocketBus();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<SituationSummary>({
    queryKey: ["/api/situation", "summary"],
    // Cache invalidated by WebSocket push — no polling needed
  });

  const { data: guards, isLoading: guardsLoading } = useQuery<GuardStatus[]>({
    queryKey: ["/api/situation", "guards"],
    // Cache invalidated by WebSocket push — no polling needed
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery<ActiveIncident[]>({
    queryKey: ["/api/situation", "incidents"],
    // Cache invalidated by WebSocket push — no polling needed
  });

  const { data: openShifts, isLoading: shiftsLoading } = useQuery<OpenShift[]>({
    queryKey: ["/api/situation", "open-shifts"],
    // Cache invalidated by WebSocket push — no polling needed
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/situation"] });
  }, [queryClient]);

  useEffect(() => {
    if (!bus) return;

    const controller = new AbortController();

    bus.send({ type: "join_shift_updates" });

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/situation"] });
    };

    const unsubShift = bus.subscribe("shift_created", invalidateAll);
    const unsubShiftUpdate = bus.subscribe("shift_updated", invalidateAll);
    const unsubShiftDelete = bus.subscribe("shift_deleted", invalidateAll);
    const unsubClockIn = bus.subscribe("officer_clocked_in", invalidateAll);
    const unsubClockOut = bus.subscribe("officer_clocked_out", invalidateAll);
    const unsubIncident = bus.subscribe("dispatch_incident_created", invalidateAll);
    const unsubIncidentUpdate = bus.subscribe("dispatch_incident_updated", invalidateAll);

    return () => {
      controller.abort();
      unsubShift();
      unsubShiftUpdate();
      unsubShiftDelete();
      unsubClockIn();
      unsubClockOut();
      unsubIncident();
      unsubIncidentUpdate();
    };
  }, [bus, queryClient]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(invalidateAll, 60000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [invalidateAll]);

  const onDutyGuards = guards?.filter((g) => g.status === "on_duty") || [];
  const offDutyGuards = guards?.filter((g) => g.status === "off_duty") || [];

  const pageConfig: CanvasPageConfig = {
    id: 'situation-board',
    title: 'Situation Board',
    category: 'operations',
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-green-500 animate-pulse" />
          <h1 className="text-xl font-semibold" data-testid="text-situation-title">
            Situation Board
          </h1>
          <Badge variant="outline" data-testid="badge-live">
            <CircleDot className="h-3 w-3 mr-1 text-green-500" />
            LIVE
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={invalidateAll}
          data-testid="button-refresh-board"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card data-testid="card-stat-on-duty">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold" data-testid="text-on-duty-count">
                    {summary?.onDuty ?? 0}
                  </span>
                  <span className="text-sm text-muted-foreground">/ {summary?.totalGuards ?? 0}</span>
                </div>
                <p className="text-sm text-muted-foreground">Guards On Duty</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-incidents">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`h-4 w-4 ${(summary?.criticalIncidents ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                  <span className="text-2xl font-bold" data-testid="text-incident-count">
                    {summary?.activeIncidents ?? 0}
                  </span>
                  {(summary?.criticalIncidents ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {summary?.criticalIncidents} critical
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Active Incidents</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-open-shifts">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-2xl font-bold" data-testid="text-open-shift-count">
                    {summary?.openShifts ?? 0}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Open Shifts</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-upcoming">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold" data-testid="text-upcoming-count">
                    {summary?.totalUpcomingShifts ?? 0}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Upcoming Shifts (48h)</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1" data-testid="card-guard-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Guard Status
              {!guardsLoading && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {onDutyGuards.length} on duty
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto space-y-1">
            {guardsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))
            ) : guards && guards.length > 0 ? (
              <>
                {onDutyGuards.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                    data-testid={`guard-row-${g.id}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[g.status]} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      {g.currentSite && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {g.currentSite}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 text-green-600">
                      On Duty
                    </Badge>
                  </div>
                ))}
                {offDutyGuards.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 p-2 rounded-md opacity-60"
                    data-testid={`guard-row-${g.id}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[g.status]} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{g.name}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Off</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No guards found</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="card-active-incidents">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Siren className="h-4 w-4" />
              Active Incidents
              {!incidentsLoading && incidents && incidents.length > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs">
                  {incidents.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto space-y-2">
            {incidentsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))
            ) : incidents && incidents.length > 0 ? (
              incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="p-2 rounded-md border space-y-1"
                  data-testid={`incident-row-${inc.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={SEVERITY_VARIANTS[inc.severity] || "outline"} className="text-xs">
                      {inc.severity}
                    </Badge>
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {inc.title}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(inc.created_at)}
                    </span>
                  </div>
                  {inc.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {inc.location}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <Shield className="h-8 w-8 mx-auto text-green-500 mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No active incidents</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="card-open-shifts">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Open Shifts
              {!shiftsLoading && openShifts && openShifts.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs text-amber-600">
                  {openShifts.length} unfilled
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto space-y-2">
            {shiftsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))
            ) : openShifts && openShifts.length > 0 ? (
              openShifts.map((sh) => (
                <div
                  key={sh.id}
                  className="p-2 rounded-md border space-y-1"
                  data-testid={`shift-row-${sh.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {sh.title || "Untitled Shift"}
                    </span>
                    <Badge variant="outline" className="text-xs text-amber-600">
                      {sh.status || "open"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatShiftTime(sh.start_time)} - {formatShiftTime(sh.end_time)}
                    </span>
                    {sh.site_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {sh.site_name}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <Clock className="h-8 w-8 mx-auto text-green-500 mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">All shifts covered</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
