import { DsPageWrapper, DsPageHeader, DsStatCard, DsSectionCard, DsButton, DsBadge, DsTabBar, DsEmptyState } from "@/components/ui/ds-components";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Radio, Plus, AlertCircle, CheckCircle, MapPin, Activity, Clock, RefreshCw,
  Send, Map, List, AlertTriangle, UserCheck, Users, User, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const CALL_PRIORITY_COLORS: Record<number, string> = { 1: "destructive", 2: "default", 3: "secondary", 4: "outline" };
const UNIT_STATUS_COLORS: Record<string, string> = {
  available: "secondary", dispatched: "default", on_scene: "destructive",
  off_duty: "outline", break: "outline", out_of_service: "outline", needs_check: "destructive",
};
const CALL_STATUS_COLORS: Record<string, string> = {
  pending: "destructive", dispatched: "default", on_scene: "secondary", resolved: "outline",
};
const UNIT_MAP_COLORS: Record<string, string> = {
  available: "var(--ds-success)", dispatched: "var(--ds-info)", on_scene: "var(--ds-danger)",
  off_duty: "var(--color-text-secondary)", break: "var(--ds-warning)", out_of_service: "var(--color-text-disabled)", needs_check: "var(--ds-warning)",
};

const FIELD_STATE_COLORS: Record<string, string> = {
  active_on_site: "var(--ds-success)",
  scheduled_not_in: "var(--ds-info)",
  geofence_departed: "var(--ds-warning)",
};

function timeAgo(ts: string) {
  if (!ts) return "—";
  try { return format(new Date(ts), "HH:mm"); } catch { return ts; }
}

function minutesSince(ts: string | null) {
  if (!ts) return null;
  try { return differenceInMinutes(new Date(), new Date(ts)); } catch { return null; }
}

function createUnitIcon(status: string, initials: string) {
  const color = UNIT_MAP_COLORS[status] || "var(--color-text-secondary)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="50" viewBox="0 0 44 50">
    <circle cx="22" cy="20" r="18" fill="${color}" stroke="white" stroke-width="3" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>
    <text x="22" y="26" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="Arial,sans-serif">${initials.slice(0, 2).toUpperCase()}</text>
    <polygon points="15,36 22,50 29,36" fill="${color}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [44, 50], iconAnchor: [22, 50], popupAnchor: [0, -52] });
}

function createOfficerIcon(fieldState: string, initials: string) {
  const color = FIELD_STATE_COLORS[fieldState] || "var(--color-text-secondary)";
  const isHollow = fieldState === "scheduled_not_in";
  const isPulsing = fieldState === "geofence_departed";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="50" viewBox="0 0 44 50">
    ${isPulsing ? `<circle cx="22" cy="20" r="22" fill="${color}" opacity="0.3"/>` : ""}
    <circle cx="22" cy="20" r="18" fill="${isHollow ? "none" : color}" stroke="${color}" stroke-width="${isHollow ? "3" : "2"}" stroke-dasharray="${isHollow ? "5,3" : "none"}" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>
    <text x="22" y="26" text-anchor="middle" fill="${isHollow ? color : "white"}" font-size="11" font-weight="bold" font-family="Arial,sans-serif">${initials.slice(0, 2).toUpperCase()}</text>
    <polygon points="15,36 22,50 29,36" fill="${color}" opacity="${isHollow ? "0.5" : "1"}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [44, 50], iconAnchor: [22, 50], popupAnchor: [0, -52] });
}

function createCallIcon(priority: number) {
  const colors: Record<number, string> = { 1: "var(--ds-danger)", 2: "var(--ds-warning)", 3: "var(--ds-info)", 4: "var(--ds-success)" };
  const color = colors[priority] || "var(--ds-info)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="4" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))"/>
    <text x="16" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial,sans-serif">P${priority}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34] });
}

function CADMap({ units, activeCalls, scheduledOfficers }: { units: any[]; activeCalls: any[]; scheduledOfficers: any[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([37.0902, -95.7129], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapInstance.current);
    }
    const map = mapInstance.current;
    markers.current.forEach(m => m.remove());
    markers.current = [];

    // Layer 1: Scheduled-not-in officers (hollow blue)
    for (const off of scheduledOfficers) {
      if (off.fieldState === "scheduled_not_in" && off.latitude && off.longitude) {
        const initials = off.employeeName?.split(" ").map((n: string) => n[0]).join("") || "??";
        const marker = L.marker([parseFloat(off.latitude), parseFloat(off.longitude)], { icon: createOfficerIcon("scheduled_not_in", initials) })
          .bindPopup(`<b>${off.employeeName}</b><br>Scheduled not clocked in<br>${off.siteName || "—"}<br>${format(new Date(off.shiftStart), "h:mm a")} – ${format(new Date(off.shiftEnd), "h:mm a")}`)
          .addTo(map);
        markers.current.push(marker);
      }
    }

    // Layer 2: Active on-site officers (solid green) and geofence departed (amber)
    for (const off of scheduledOfficers) {
      if ((off.fieldState === "active_on_site" || off.fieldState === "geofence_departed") && off.latitude && off.longitude) {
        const initials = off.employeeName?.split(" ").map((n: string) => n[0]).join("") || "??";
        const marker = L.marker([parseFloat(off.latitude), parseFloat(off.longitude)], { icon: createOfficerIcon(off.fieldState, initials) })
          .bindPopup(`<b>${off.employeeName}</b><br>${off.fieldState === "geofence_departed" ? "⚠️ GEOFENCE DEPARTED" : "On site"}<br>${off.siteName || "—"}<br>Clocked in: ${off.clockInTime ? format(new Date(off.clockInTime), "h:mm a") : "—"}<br>Last GPS: ${off.lastPingAt ? minutesSince(off.lastPingAt) + "m ago" : "—"}`)
          .addTo(map);
        markers.current.push(marker);
      }
    }

    // Layer 3: CAD units (registered)
    for (const unit of units) {
      if (unit.latitude && unit.longitude && !scheduledOfficers.some(o => o.cadUnitId === unit.id)) {
        const initials = unit.employee_name?.split(" ").map((n: string) => n[0]).join("") || unit.unit_identifier?.slice(0, 2) || "U";
        const marker = L.marker([parseFloat(unit.latitude), parseFloat(unit.longitude)], { icon: createUnitIcon(unit.current_status, initials) })
          .bindPopup(`<b>${unit.unit_identifier}</b><br>${unit.employee_name}<br>${unit.current_status.replace(/_/g, " ")}<br>${unit.current_site_name || "—"}`)
          .addTo(map);
        markers.current.push(marker);
      }
    }

    // Active calls layer
    for (const call of activeCalls) {
      if (call.latitude && call.longitude) {
        const marker = L.marker([parseFloat(call.latitude), parseFloat(call.longitude)], { icon: createCallIcon(call.priority) })
          .bindPopup(`<b>P${call.priority} — ${call.call_type?.replace(/_/g, " ")}</b><br>${call.location_description}<br>${call.status}`)
          .addTo(map);
        markers.current.push(marker);
      }
    }

    const allPoints = [
      ...scheduledOfficers.filter(o => o.latitude && o.longitude).map(o => [parseFloat(o.latitude), parseFloat(o.longitude)] as [number, number]),
      ...units.filter(u => u.latitude && u.longitude).map(u => [parseFloat(u.latitude), parseFloat(u.longitude)] as [number, number]),
      ...activeCalls.filter(c => c.latitude && c.longitude).map(c => [parseFloat(c.latitude), parseFloat(c.longitude)] as [number, number]),
    ];
    if (allPoints.length > 0) {
      try { map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 14 }); } catch (_) {}
    }
  }, [units, activeCalls, scheduledOfficers]);

  const hasLocations = scheduledOfficers.some(o => o.latitude && o.longitude) || units.some(u => u.latitude && u.longitude);

  return (
    <div className="relative rounded-lg overflow-hidden border bg-ds-navy-light" style={{ height: "clamp(280px, 50vh, 480px)", isolation: "isolate" }}>
      <div ref={mapRef} className="absolute inset-0" />
      {!hasLocations && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ds-navy/60 backdrop-blur-sm pointer-events-none z-[400]">
          <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-ds-text-muted mb-2" />
          <p className="text-xs sm:text-sm font-medium text-ds-text-muted">No GPS locations available yet</p>
          <p className="text-[10px] sm:text-xs text-ds-text-muted mt-1">Unit positions appear as officers clock in via mobile</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 sm:top-2 sm:right-2 sm:bottom-auto sm:left-auto z-[500] bg-ds-navy/90 border rounded-md p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
        {[
          { color: FIELD_STATE_COLORS.active_on_site, label: "On Site" },
          { color: FIELD_STATE_COLORS.scheduled_not_in, label: "Scheduled" },
          { color: FIELD_STATE_COLORS.geofence_departed, label: "Departed" },
          { color: "var(--ds-danger)", label: "Call" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-ds-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Geofence departure alert strip
function GeofenceAlertStrip({ departures, onAcknowledge }: { departures: any[]; onAcknowledge: (id: string, note: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [ackId, setAckId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");

  if (!departures.length) return null;

  return (
    <div className="rounded-md border border-ds-gold/50 bg-ds-navy-light/30 overflow-hidden mb-4">
      <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setExpanded(prev => !prev)}>
        <AlertTriangle className="h-4 w-4 text-ds-gold shrink-0" />
        <span className="text-sm font-semibold text-ds-gold flex-1">
          {departures.length} Geofence Departure{departures.length > 1 ? "s" : ""} — Action Required
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-ds-gold" /> : <ChevronDown className="h-4 w-4 text-ds-gold" />}
      </div>
      {expanded && (
        <div className="border-t border-ds-gold/20 divide-y divide-ds-gold/10">
          {departures.map((dep: any) => {
            const mins = minutesSince(dep.departed_at);
            return (
              <div key={dep.id} className="p-2.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <User className="h-3.5 w-3.5 text-ds-gold shrink-0" />
                      <span className="text-sm font-medium text-ds-text">{dep.employee_name}</span>
                      <span className="text-xs text-ds-text-muted truncate">{dep.site_name || "Unknown site"}</span>
                    </div>
                    <p className="text-xs text-ds-text-muted ml-5 mt-0.5 font-mono">
                      Departed {mins !== null ? `${mins}m ago` : format(new Date(dep.departed_at), "h:mm a")}
                    </p>
                  </div>
                  {ackId !== dep.id && (
                    <DsButton size="sm" variant="outline" onClick={() => setAckId(dep.id)}>
                      Acknowledge
                    </DsButton>
                  )}
                </div>
                {ackId === dep.id && (
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input
                      placeholder="Add note..."
                      value={ackNote}
                      onChange={e => setAckNote(e.target.value)}
                      className="text-xs flex-1 min-w-[120px] bg-ds-navy border-ds-gold/20"
                    />
                    <div className="flex gap-1.5 shrink-0">
                      <DsButton size="sm" variant="primary" onClick={() => { onAcknowledge(dep.id, ackNote); setAckId(null); setAckNote(""); }}>
                        Confirm
                      </DsButton>
                      <DsButton size="sm" variant="outline" onClick={() => setAckId(null)}>Cancel</DsButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CADConsole() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId;
  const { toast } = useToast();
  const [showNewCall, setShowNewCall] = useState(false);
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [dispatchCallId, setDispatchCallId] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"board" | "map" | "officers">("board");
  const bus = useWebSocketBus();

  const stats = useQuery<any>({ queryKey: ["/api/cad/stats", { workspaceId }], enabled: !!workspaceId }); // Cache invalidated by WebSocket push — no polling needed
  const calls = useQuery<any>({ queryKey: ["/api/cad/calls", { workspaceId }], enabled: !!workspaceId }); // Cache invalidated by WebSocket push — no polling needed
  const units = useQuery<any>({ queryKey: ["/api/cad/units", { workspaceId }], enabled: !!workspaceId }); // Cache invalidated by WebSocket push — no polling needed
  const scheduleView = useQuery<any>({ queryKey: ["/api/cad/units/schedule-view", { workspaceId }], enabled: !!workspaceId }); // Cache invalidated by WebSocket push — no polling needed
  const departures = useQuery<any>({ queryKey: ["/api/cad/geofence-departures", { workspaceId }], enabled: !!workspaceId }); // Cache invalidated by WebSocket push — no polling needed
  const selectedCall = useQuery<any>({ queryKey: ["/api/cad/calls", selectedCallId], enabled: !!selectedCallId });

  function invalidate() {
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/cad") });
  }

  useEffect(() => {
    if (!workspaceId || !bus) return;

    const controller = new AbortController();

    bus.send({ type: 'join_dispatch_updates' });

    const unsubAll = bus.subscribeAll((data: any) => {
      const type = data.type || '';
      if (type.startsWith("cad:") || type.startsWith("trinity:")) {
        invalidate();
        if (type === "trinity:panic_emergency") {
          toast({ title: "PANIC ALERT", description: data.message, variant: "destructive" });
        } else if (type === "trinity:bolo_alert") {
          toast({ title: "BOLO MATCH", description: data.message, variant: "destructive" });
        }
      }
    });

    const unsubGps = bus.subscribe('dispatch_gps_update', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cad/units", { workspaceId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/cad/units/schedule-view", { workspaceId }] });
    });

    const unsubUnitStatus = bus.subscribe('dispatch_unit_status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cad/units", { workspaceId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/cad/calls", { workspaceId }] });
    });

    return () => { 
      controller.abort();
      unsubAll(); 
      unsubGps(); 
      unsubUnitStatus(); 
    };
  }, [workspaceId, bus]);

  const createCall = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/cad/calls", { ...data, workspaceId, createdBy: user?.id }),
    onSuccess: () => { invalidate(); setShowNewCall(false); toast({ title: "Call for service created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createUnit = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/cad/units", { ...data, workspaceId }),
    onSuccess: () => { invalidate(); setShowNewUnit(false); toast({ title: "Unit registered" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const dispatchUnit = useMutation({
    mutationFn: ({ callId, unitId }: { callId: string; unitId: string }) =>
      apiRequest("POST", `/api/cad/calls/${callId}/dispatch`, { unitId, workspaceId, dispatchedBy: user?.id, dispatchedByName: user?.firstName }),
    onSuccess: () => { invalidate(); setDispatchCallId(null); toast({ title: "Unit dispatched" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const onScene = useMutation({
    mutationFn: (callId: string) => apiRequest("POST", `/api/cad/calls/${callId}/on-scene`, { workspaceId }),
    onSuccess: () => { invalidate(); toast({ title: "Unit on scene" }); },
  });

  const resolveCall = useMutation({
    mutationFn: ({ callId, notes }: { callId: string; notes: string }) =>
      apiRequest("POST", `/api/cad/calls/${callId}/resolve`, { workspaceId, resolutionNotes: notes, closedBy: user?.firstName }),
    onSuccess: () => { invalidate(); setSelectedCallId(null); toast({ title: "Call resolved" }); },
  });

  const changeUnitStatus = useMutation({
    mutationFn: ({ unitId, status }: { unitId: string; status: string }) =>
      apiRequest("PATCH", `/api/cad/units/${unitId}/status`, { status, workspaceId }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const acknowledgeDeparture = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRequest("POST", `/api/cad/geofence-departures/${id}/acknowledge`, { acknowledgedBy: user?.firstName, note, workspaceId }),
    onSuccess: () => { invalidate(); toast({ title: "Departure acknowledged" }); },
  });

  function NewCallForm() {
    const [f, setF] = useState({ callType: "suspicious_activity", priority: 2, locationDescription: "", callerName: "", callerPhone: "", incidentDescription: "", siteName: "" });
    return (
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={f.callType} onValueChange={v => setF(p => ({ ...p, callType: v }))}>
            <SelectTrigger className="bg-ds-navy border-ds-gold/20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["patrol_check","suspicious_activity","alarm","medical","fire","fight","theft","trespass","vehicle","panic_sos","other"].map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(f.priority)} onValueChange={v => setF(p => ({ ...p, priority: Number(v) }))}>
            <SelectTrigger className="bg-ds-navy border-ds-gold/20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">P1 — Emergency</SelectItem>
              <SelectItem value="2">P2 — Urgent</SelectItem>
              <SelectItem value="3">P3 — Routine</SelectItem>
              <SelectItem value="4">P4 — Non-urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <Input placeholder="Location description *" value={f.locationDescription} onChange={e => setF(p => ({ ...p, locationDescription: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder="Caller name" value={f.callerName} onChange={e => setF(p => ({ ...p, callerName: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
          <Input placeholder="Caller phone" value={f.callerPhone} onChange={e => setF(p => ({ ...p, callerPhone: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        </div>
        <Textarea placeholder="Incident description *" value={f.incidentDescription} onChange={e => setF(p => ({ ...p, incidentDescription: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <UniversalModalFooter>
          <DsButton variant="outline" onClick={() => setShowNewCall(false)}>Cancel</DsButton>
          <DsButton variant="primary" onClick={() => createCall.mutate(f)} disabled={!f.locationDescription || !f.incidentDescription || createCall.isPending}>
            {createCall.isPending ? "Creating…" : "Create Call"}
          </DsButton>
        </UniversalModalFooter>
      </div>
    );
  }

  function NewUnitForm() {
    const [f, setF] = useState({ unitIdentifier: "", employeeName: "", radioChannel: "", vehicleId: "" });
    return (
      <div className="space-y-3 p-4">
        <Input placeholder="Unit ID (e.g. UNIT-01) *" value={f.unitIdentifier} onChange={e => setF(p => ({ ...p, unitIdentifier: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <Input placeholder="Officer name *" value={f.employeeName} onChange={e => setF(p => ({ ...p, employeeName: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <Input placeholder="Radio channel" value={f.radioChannel} onChange={e => setF(p => ({ ...p, radioChannel: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <Input placeholder="Vehicle ID" value={f.vehicleId} onChange={e => setF(p => ({ ...p, vehicleId: e.target.value }))} className="bg-ds-navy border-ds-gold/20" />
        <UniversalModalFooter>
          <DsButton variant="outline" onClick={() => setShowNewUnit(false)}>Cancel</DsButton>
          <DsButton variant="primary" onClick={() => createUnit.mutate(f)} disabled={!f.unitIdentifier || !f.employeeName || createUnit.isPending}>
            {createUnit.isPending ? "Registering…" : "Register Unit"}
          </DsButton>
        </UniversalModalFooter>
      </div>
    );
  }

  const activeCalls = calls.data?.calls?.filter((c: any) => ["pending","dispatched","on_scene"].includes(c.status)) || [];
  const allUnits = units.data?.units || [];
  const availableUnits = allUnits.filter((u: any) => u.current_status === "available");
  const dispatchedUnits = allUnits.filter((u: any) => u.current_status === "dispatched");
  const onSceneUnits = allUnits.filter((u: any) => u.current_status === "on_scene");
  const scheduledOfficers = scheduleView.data?.officers || [];
  const activeDepartures = departures.data?.departures || [];

  const officerCounts = {
    active: scheduledOfficers.filter((o: any) => o.fieldState === "active_on_site").length,
    scheduled: scheduledOfficers.filter((o: any) => o.fieldState === "scheduled_not_in").length,
    departed: scheduledOfficers.filter((o: any) => o.fieldState === "geofence_departed").length,
    availableUnits: availableUnits.length,
    dispatchedUnits: dispatchedUnits.length,
    onSceneUnits: onSceneUnits.length,
  };

  return (
    <DsPageWrapper>
      <DsPageHeader 
        title="Real-Time CAD Console"
        subtitle="Mission Control for active field operations and emergency dispatch"
        actions={
          <div className="flex gap-2">
             <DsButton variant="outline" size="sm" onClick={() => setShowNewUnit(true)} data-testid="button-new-unit">
               <Plus className="w-4 h-4 mr-2" /> Register Unit
             </DsButton>
             <DsButton variant="primary" size="sm" onClick={() => setShowNewCall(true)} data-testid="button-new-call">
               <Plus className="w-4 h-4 mr-2" /> New Call
             </DsButton>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <DsStatCard label="Active Officers" value={officerCounts.active} icon={UserCheck} color="success" />
        <DsStatCard label="Scheduled" value={officerCounts.scheduled} icon={Clock} color="info" />
        <DsStatCard label="Departed" value={officerCounts.departed} icon={AlertTriangle} color="danger" />
        <DsStatCard label="Available" value={officerCounts.availableUnits} icon={Radio} color="success" />
        <DsStatCard label="Dispatched" value={officerCounts.dispatchedUnits} icon={Activity} color="info" />
        <DsStatCard label="On Scene" value={officerCounts.onSceneUnits} icon={MapPin} color="danger" />
      </div>

      <DsTabBar 
        tabs={[
          { id: 'board', label: 'Dispatch Board' },
          { id: 'map', label: 'Live Map' },
          { id: 'officers', label: 'Field Roster' }
        ]}
        activeTab={activeView}
        onTabChange={(v) => setActiveView(v as any)}
        className="mb-6"
      />

      <div className="flex-1 overflow-hidden">
        {activeView === 'map' && (
          <div className="space-y-4 h-full">
            <GeofenceAlertStrip departures={activeDepartures} onAcknowledge={(id, note) => acknowledgeDeparture.mutate({ id, note })} />
            <CADMap units={allUnits} activeCalls={activeCalls} scheduledOfficers={scheduledOfficers} />
          </div>
        )}

        {activeView === 'board' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-auto pr-1">
            <div className="lg:col-span-2 space-y-6">
              <DsSectionCard title="Pending Calls" actions={<DsBadge color="danger">{activeCalls.filter((c:any) => c.status === 'pending').length}</DsBadge>}>
                <div className="space-y-3">
                  {activeCalls.filter((c:any) => c.status === 'pending').map((call:any) => (
                    <DsSectionCard key={call.id} className="bg-ds-navy-light/50 border-ds-danger/20" 
                      title={<span className="font-mono text-ds-gold">{call.call_number}</span>}
                      actions={<DsBadge color="danger">PRIORITY {call.priority}</DsBadge>}
                    >
                      <div className="space-y-2">
                         <p className="font-medium">{call.call_type?.replace(/_/g, ' ')}</p>
                         <p className="text-sm text-ds-text-muted">{call.location_description}</p>
                         <DsButton size="sm" variant="primary" onClick={() => setDispatchCallId(call.id)}>Dispatch Unit</DsButton>
                      </div>
                    </DsSectionCard>
                  ))}
                  {activeCalls.filter((c:any) => c.status === 'pending').length === 0 && (
                     <DsEmptyState icon={CheckCircle} title="No Pending Calls" subtitle="All current calls have been dispatched." />
                  )}
                </div>
              </DsSectionCard>
            </div>
            <div className="space-y-6">
               <DsSectionCard title="Active Units">
                 <div className="space-y-2">
                   {allUnits.map((unit:any) => (
                     <div key={unit.id} className="flex items-center justify-between p-2 rounded bg-ds-navy-light">
                        <div className="min-w-0">
                          <p className="font-mono text-ds-gold truncate">{unit.unit_identifier}</p>
                          <p className="text-xs text-ds-text-muted truncate">{unit.employee_name}</p>
                        </div>
                        <DsBadge color={UNIT_STATUS_COLORS[unit.current_status] === 'destructive' ? 'danger' : 'info'} className="shrink-0">
                          {unit.current_status.replace(/_/g, ' ')}
                        </DsBadge>
                     </div>
                   ))}
                   {allUnits.length === 0 && <p className="text-xs text-ds-text-muted text-center py-4">No units registered.</p>}
                 </div>
               </DsSectionCard>
            </div>
          </div>
        )}

        {activeView === 'officers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full overflow-auto pr-1">
             {scheduledOfficers.map((off: any) => (
              <DsSectionCard key={off.employeeId} title={off.employeeName} actions={
                <DsBadge color={off.fieldState === 'active_on_site' ? 'success' : off.fieldState === 'geofence_departed' ? 'danger' : 'info'}>
                  {off.fieldState.replace(/_/g, ' ')}
                </DsBadge>
              }>
                <div className="space-y-1">
                  <p className="text-xs text-ds-text-muted flex items-center gap-1"><MapPin size={12}/> {off.siteName || 'No site'}</p>
                  <p className="text-xs text-ds-text-muted flex items-center gap-1"><Clock size={12}/> {format(new Date(off.shiftStart), "HH:mm")} - {format(new Date(off.shiftEnd), "HH:mm")}</p>
                </div>
              </DsSectionCard>
             ))}
          </div>
        )}
      </div>

      <UniversalModal open={showNewCall} onOpenChange={setShowNewCall}>
        <UniversalModalContent>
          <UniversalModalHeader><UniversalModalTitle>New Call for Service</UniversalModalTitle></UniversalModalHeader>
          <NewCallForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showNewUnit} onOpenChange={setShowNewUnit}>
        <UniversalModalContent>
          <UniversalModalHeader><UniversalModalTitle>Register Field Unit</UniversalModalTitle></UniversalModalHeader>
          <NewUnitForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!dispatchCallId} onOpenChange={() => setDispatchCallId(null)}>
        <UniversalModalContent>
          <UniversalModalHeader><UniversalModalTitle>Dispatch Unit</UniversalModalTitle></UniversalModalHeader>
          <div className="space-y-2 p-4">
            {availableUnits.map((u: any) => (
              <DsButton key={u.id} variant="outline" className="w-full justify-between" onClick={() => dispatchUnit.mutate({ callId: dispatchCallId!, unitId: u.id })}>
                {u.unit_identifier} - {u.employee_name}
                <Send className="w-4 h-4" />
              </DsButton>
            ))}
            {availableUnits.length === 0 && <p className="text-sm text-ds-text-muted text-center py-4">No available units to dispatch.</p>}
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </DsPageWrapper>
  );
}
