import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, MapPin, Shield, Plus, Clock, FileWarning } from "lucide-react";
import { format } from "date-fns";
import { EmergencyDisclaimer } from "@/components/liability-disclaimers";
import {
  DsPageWrapper,
  DsPageHeader,
  DsStatCard,
  DsTabBar,
  DsSectionCard,
  DsDataRow,
  DsBadge,
  DsButton,
  DsEmptyState
} from "@/components/ui/ds-components";

function timeAgo(ts: string) {
  if (!ts) return "—";
  try { return format(new Date(ts), "MMM d, HH:mm"); } catch { return ts; }
}

export default function SafetyHub() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("panic");
  const [showNewZone, setShowNewZone] = useState(false);
  const [showNewSLA, setShowNewSLA] = useState(false);

  const stats = useQuery<any>({ queryKey: ["/api/safety/stats", { workspaceId }], enabled: !!workspaceId });
  const panics = useQuery<any>({ queryKey: ["/api/safety/panic", { workspaceId }], enabled: !!workspaceId, refetchInterval: 10000 });
  const geofences = useQuery<any>({ queryKey: ["/api/safety/geofences", { workspaceId }], enabled: !!workspaceId });
  const slaContracts = useQuery<any>({ queryKey: ["/api/safety/sla", { workspaceId }], enabled: !!workspaceId });
  const slaBreaches = useQuery<any>({ queryKey: ["/api/safety/sla-breaches", { workspaceId }], enabled: !!workspaceId });

  function invalidate() {
    queryClient.invalidateQueries({
      predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/safety"),
    });
  }

  const acknowledgePanic = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/safety/panic/${id}/acknowledge`, { acknowledgedBy: user?.firstName, workspaceId }),
    onSuccess: () => { invalidate(); toast({ title: "Alert acknowledged" }); },
  });

  const resolvePanic = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/safety/panic/${id}/resolve`, { resolvedBy: user?.firstName, workspaceId }),
    onSuccess: () => { invalidate(); toast({ title: "Alert resolved" }); },
  });

  const createGeofence = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety/geofences", { ...data, workspaceId }),
    onSuccess: () => { invalidate(); setShowNewZone(false); toast({ title: "Geofence zone created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteGeofence = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/safety/geofences/${id}`, { workspaceId }),
    onSuccess: () => { invalidate(); toast({ title: "Zone deleted" }); },
  });

  const toggleGeofence = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/safety/geofences/${id}`, { isActive, workspaceId }),
    onSuccess: () => invalidate(),
  });

  const createSLA = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety/sla", { ...data, workspaceId }),
    onSuccess: () => { invalidate(); setShowNewSLA(false); toast({ title: "SLA contract created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activePanics = panics.data?.alerts?.filter((a: any) => a.status === "active") || [];

  const tabs = [
    { id: "panic", label: "SOS / Panic" },
    { id: "geofences", label: "Geofences" },
    { id: "sla", label: "SLA Contracts" },
    { id: "breaches", label: "Breach Log" }
  ];

  function GeofenceForm() {
    const [f, setF] = useState({ siteName: "", zoneName: "", zoneType: "restricted", centerLat: "", centerLng: "", radiusMeters: 100, alertOnExit: true, alertOnEntry: false });
    return (
      <div className="space-y-4">
        <Input placeholder="Zone name *" value={f.zoneName} onChange={e => setF(p => ({ ...p, zoneName: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        <Input placeholder="Site name *" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        <Select value={f.zoneType} onValueChange={v => setF(p => ({ ...p, zoneType: v }))}>
          <SelectTrigger className="bg-transparent border-[var(--ds-border)]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
            {["restricted","patrol","site_boundary","exclusion"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Center latitude *" value={f.centerLat} onChange={e => setF(p => ({ ...p, centerLat: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
          <Input placeholder="Center longitude *" value={f.centerLng} onChange={e => setF(p => ({ ...p, centerLng: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        </div>
        <Input type="number" placeholder="Radius (meters)" value={f.radiusMeters} onChange={e => setF(p => ({ ...p, radiusMeters: Number(e.target.value) }))} className="bg-transparent border-[var(--ds-border)]" />
        <div className="flex gap-4 text-xs opacity-70">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.alertOnExit} onChange={e => setF(p => ({ ...p, alertOnExit: e.target.checked }))} /> Alert on exit</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.alertOnEntry} onChange={e => setF(p => ({ ...p, alertOnEntry: e.target.checked }))} /> Alert on entry</label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <DsButton variant="ghost" onClick={() => setShowNewZone(false)}>Cancel</DsButton>
          <DsButton onClick={() => createGeofence.mutate({ ...f, centerLat: parseFloat(f.centerLat), centerLng: parseFloat(f.centerLng) })}
            disabled={!f.zoneName || !f.siteName || !f.centerLat || !f.centerLng || createGeofence.isPending}>
            {createGeofence.isPending ? "Creating…" : "Create Zone"}
          </DsButton>
        </div>
      </div>
    );
  }

  function SLAForm() {
    const [f, setF] = useState({ clientName: "", contractName: "", siteName: "", responseTimeMinutes: 30, minCoverageHoursDaily: 8, minOfficersPerShift: 1, incidentReportHours: 4, darSubmissionHours: 24 });
    return (
      <div className="space-y-4">
        <Input placeholder="Client name *" value={f.clientName} onChange={e => setF(p => ({ ...p, clientName: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        <Input placeholder="Contract name *" value={f.contractName} onChange={e => setF(p => ({ ...p, contractName: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} className="bg-transparent border-[var(--ds-border)]" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 font-bold tracking-widest">Response time (min)</label>
            <Input type="number" value={f.responseTimeMinutes} onChange={e => setF(p => ({ ...p, responseTimeMinutes: Number(e.target.value) }))} className="bg-transparent border-[var(--ds-border)]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 font-bold tracking-widest">Daily coverage hrs</label>
            <Input type="number" value={f.minCoverageHoursDaily} onChange={e => setF(p => ({ ...p, minCoverageHoursDaily: Number(e.target.value) }))} className="bg-transparent border-[var(--ds-border)]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 font-bold tracking-widest">Officers/shift</label>
            <Input type="number" value={f.minOfficersPerShift} onChange={e => setF(p => ({ ...p, minOfficersPerShift: Number(e.target.value) }))} className="bg-transparent border-[var(--ds-border)]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 font-bold tracking-widest">IR due hrs</label>
            <Input type="number" value={f.incidentReportHours} onChange={e => setF(p => ({ ...p, incidentReportHours: Number(e.target.value) }))} className="bg-transparent border-[var(--ds-border)]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <DsButton variant="ghost" onClick={() => setShowNewSLA(false)}>Cancel</DsButton>
          <DsButton onClick={() => createSLA.mutate(f)} disabled={!f.clientName || !f.contractName || createSLA.isPending}>
            {createSLA.isPending ? "Creating…" : "Create Contract"}
          </DsButton>
        </div>
      </div>
    );
  }

  return (
    <DsPageWrapper className="max-w-5xl mx-auto">
      <DsPageHeader 
        title="Safety & Compliance" 
        subtitle="Panic alerts, geofencing, SLA contracts"
        data-testid="text-safety-title"
      />

      <EmergencyDisclaimer className="mb-6" data-testid="disclaimer-emergency-safety-hub" />

      {activePanics.length > 0 && (
        <div className="mb-6 animate-pulse">
          <DsSectionCard className="border-[var(--ds-danger)] bg-[rgba(239,68,68,0.05)]">
            <div className="flex items-center gap-2 text-[var(--ds-danger)] font-bold mb-4 uppercase tracking-widest text-sm">
              <AlertTriangle className="h-4 w-4" />
              {activePanics.length} Active SOS Alert{activePanics.length > 1 ? "s" : ""}
            </div>
            <div className="space-y-2">
              {activePanics.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-black/20 border border-[var(--ds-danger)]/30">
                  <div>
                    <p className="font-bold text-[var(--ds-text-primary)]">{a.employee_name}</p>
                    <p className="text-xs opacity-60">{a.site_name || "Location unknown"} · {timeAgo(a.triggered_at)}</p>
                    {a.latitude && <p className="text-[10px] font-mono opacity-50 mt-1">GPS: {a.latitude}, {a.longitude}</p>}
                  </div>
                  <div className="flex gap-2">
                    <DsButton size="sm" variant="outline" onClick={() => acknowledgePanic.mutate(a.id)}>Acknowledge</DsButton>
                    <DsButton size="sm" onClick={() => resolvePanic.mutate(a.id)}>Resolve</DsButton>
                  </div>
                </div>
              ))}
            </div>
          </DsSectionCard>
        </div>
      )}

      {stats.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <DsStatCard label="Active Panics" value={stats.data.activePanics} color="danger" />
          <DsStatCard label="Active Zones" value={stats.data.activeGeofences} color="info" />
          <DsStatCard label="SLA Contracts" value={stats.data.activeSLAContracts} color="gold" />
          <DsStatCard label="Breaches (30d)" value={stats.data.breachesLast30Days} color="warning" />
        </div>
      )}

      <DsTabBar 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        className="mb-6"
      />

      <div className="space-y-6">
        {activeTab === "panic" && (
          <DsSectionCard title="Panic / SOS Timeline">
            {panics.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : panics.data?.alerts?.length === 0 ? (
              <DsEmptyState icon={AlertTriangle} title="No Alerts" subtitle="No panic alerts on record." />
            ) : (
              <div className="space-y-1">
                {panics.data?.alerts?.map((a: any) => (
                  <DsDataRow key={a.id} data-testid={`row-panic-${a.id}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      a.status === "active" ? "bg-[var(--ds-danger)]/20 text-[var(--ds-danger)] animate-pulse" : 
                      a.status === "acknowledged" ? "bg-[var(--ds-warning)]/20 text-[var(--ds-warning)]" : 
                      "bg-[var(--ds-navy-light)] text-[var(--ds-text-muted)]"
                    }`}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] opacity-70">#{a.alert_number}</span>
                        <DsBadge color={a.status === "active" ? "danger" : a.status === "acknowledged" ? "warning" : "muted"}>
                          {a.status}
                        </DsBadge>
                        <span className="text-[10px] opacity-50 ml-auto">{timeAgo(a.triggered_at)}</span>
                      </div>
                      <p className="text-sm font-bold">{a.employee_name}</p>
                      <p className="text-xs opacity-60 flex items-center gap-1">
                        <MapPin size={10} /> {a.site_name || "Unknown site"}
                      </p>
                      {a.response_notes && <p className="text-[11px] opacity-50 mt-1 italic">Note: {a.response_notes}</p>}
                    </div>
                    <div className="flex gap-1">
                      {a.status === "active" && (
                        <>
                          <DsButton size="sm" variant="outline" onClick={() => acknowledgePanic.mutate(a.id)}>Ack</DsButton>
                          <DsButton size="sm" onClick={() => resolvePanic.mutate(a.id)}>Resolve</DsButton>
                        </>
                      )}
                      {a.status === "acknowledged" && (
                        <DsButton size="sm" onClick={() => resolvePanic.mutate(a.id)}>Resolve</DsButton>
                      )}
                    </div>
                  </DsDataRow>
                ))}
              </div>
            )}
          </DsSectionCard>
        )}

        {activeTab === "geofences" && (
          <DsSectionCard 
            title="Geofence Zones" 
            actions={<DsButton size="sm" onClick={() => setShowNewZone(true)}><Plus size={14} className="mr-1" />New Zone</DsButton>}
          >
            {geofences.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : geofences.data?.zones?.length === 0 ? (
              <DsEmptyState icon={MapPin} title="No Zones" subtitle="No geofence zones configured." action={<DsButton onClick={() => setShowNewZone(true)}>Create One</DsButton>} />
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {geofences.data?.zones?.map((z: any) => (
                  <DsSectionCard key={z.id} className="border-[var(--ds-border)] bg-[rgba(0,0,0,0.1)]">
                    <div className="flex gap-4">
                      <div className="w-20 h-20 rounded-lg bg-[var(--ds-navy-light)] flex items-center justify-center shrink-0 border border-[var(--ds-border)] relative overflow-hidden">
                        <div className="w-10 h-10 rounded-full border border-[var(--ds-gold)]/30 bg-[var(--ds-gold)]/5 animate-pulse" />
                        <MapPin size={24} className="text-[var(--ds-gold)] absolute" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-sm truncate">{z.zone_name}</h3>
                          <DsBadge color={z.is_active ? "success" : "muted"}>{z.is_active ? "Active" : "OFF"}</DsBadge>
                        </div>
                        <p className="text-xs opacity-60 flex items-center gap-1 mb-2">
                          <MapPin size={10} /> {z.site_name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <DsBadge color="gold" className="text-[9px]">{z.radius_meters}m</DsBadge>
                          <DsBadge color="muted" className="text-[9px]">{z.zone_type?.replace(/_/g, " ")}</DsBadge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2 justify-end pt-3 border-t border-[var(--ds-border)]">
                      <DsButton size="sm" variant="destructive" onClick={() => deleteGeofence.mutate(z.id)}>Delete</DsButton>
                      <DsButton size="sm" variant="outline" onClick={() => toggleGeofence.mutate({ id: z.id, isActive: !z.is_active })}>
                        {z.is_active ? "Disable" : "Enable"}
                      </DsButton>
                    </div>
                  </DsSectionCard>
                ))}
              </div>
            )}
          </DsSectionCard>
        )}

        {activeTab === "sla" && ( activeTab === "sla" && (
          <DsSectionCard 
            title="SLA Contracts" 
            actions={<DsButton size="sm" onClick={() => setShowNewSLA(true)}><Plus size={14} className="mr-1" />New SLA</DsButton>}
          >
            {slaContracts.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : slaContracts.data?.contracts?.length === 0 ? (
              <DsEmptyState icon={Shield} title="No Contracts" subtitle="No SLA contracts configured." />
            ) : (
              <div className="space-y-1">
                {slaContracts.data?.contracts?.map((c: any) => (
                  <DsDataRow key={c.id} data-testid={`row-sla-${c.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm">{c.contract_name}</span>
                        <DsBadge color={c.is_active ? "success" : "muted"}>{c.is_active ? "Active" : "Inactive"}</DsBadge>
                        {c.breach_count > 0 && <DsBadge color="danger">{c.breach_count} breaches</DsBadge>}
                      </div>
                      <p className="text-xs opacity-60">{c.client_name}{c.site_name && ` · ${c.site_name}`}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        <span className="text-[10px] opacity-50 flex items-center gap-1"><Clock size={10} /> {c.response_time_minutes}min response</span>
                        <span className="text-[10px] opacity-50 flex items-center gap-1"><Shield size={10} /> {c.min_coverage_hours_daily}h daily</span>
                        <span className="text-[10px] opacity-50 flex items-center gap-1"><FileWarning size={10} /> IR {c.incident_report_hours}h due</span>
                      </div>
                    </div>
                    <DsButton size="sm" variant="ghost">Edit</DsButton>
                  </DsDataRow>
                ))}
              </div>
            )}
          </DsSectionCard>
        ))}

        {activeTab === "breaches" && (
          <DsSectionCard title="SLA Breach Log">
            {slaBreaches.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : slaBreaches.data?.breaches?.length === 0 ? (
              <DsEmptyState icon={FileWarning} title="Clean Slate" subtitle="No breaches logged." />
            ) : (
              <div className="space-y-1">
                {slaBreaches.data?.breaches?.map((b: any) => (
                  <DsDataRow key={b.id} data-testid={`row-breach-${b.id}`}>
                    <div className="w-8 h-8 rounded-full bg-[var(--ds-danger)]/10 text-[var(--ds-danger)] flex items-center justify-center shrink-0">
                      <FileWarning size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <DsBadge color={b.severity === "critical" ? "danger" : b.severity === "high" ? "warning" : "info"}>{b.severity}</DsBadge>
                        <span className="font-bold text-sm">{b.breach_type?.replace(/_/g, " ")}</span>
                        <span className="text-[10px] opacity-50 ml-auto">{timeAgo(b.detected_at)}</span>
                      </div>
                      <p className="text-xs opacity-60">{b.client_name}</p>
                      {b.description && <p className="text-xs opacity-70 mt-1">{b.description}</p>}
                    </div>
                  </DsDataRow>
                ))}
              </div>
            )}
          </DsSectionCard>
        )}
      </div>

      <UniversalModal open={showNewZone} onOpenChange={setShowNewZone}>
        <UniversalModalContent className="max-w-md bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
          <UniversalModalHeader><UniversalModalTitle style={{ fontFamily: 'var(--ds-font-display)' }}>Create Geofence Zone</UniversalModalTitle></UniversalModalHeader>
          <div className="pt-4">
            <GeofenceForm />
          </div>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showNewSLA} onOpenChange={setShowNewSLA}>
        <UniversalModalContent className="max-w-md bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
          <UniversalModalHeader><UniversalModalTitle style={{ fontFamily: 'var(--ds-font-display)' }}>Create SLA Contract</UniversalModalTitle></UniversalModalHeader>
          <div className="pt-4">
            <SLAForm />
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </DsPageWrapper>
  );
}
