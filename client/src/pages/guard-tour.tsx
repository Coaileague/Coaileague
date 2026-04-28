import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {Eye, MapPin, Plus, Route, CheckCircle, Pause, Archive, Clock, Navigation,
  Pencil, QrCode, ScanLine, Trash2, ArrowLeft, Eye, ListChecks,
  BarChart3, AlertTriangle, CircleDot, FileText, ChevronRight,
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  title: "Guard Tours",
  subtitle: "Patrol routes, QR checkpoint scanning, and completion tracking",
  // @ts-expect-error — TS migration: fix in refactoring sprint
  icon: Route,
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  active: { label: "Active", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800", icon: CheckCircle },
  paused: { label: "Paused", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800", icon: Pause },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground border-border", icon: Archive },
};

const SCAN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed: { label: "Scanned", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  missed: { label: "Missed", className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  late: { label: "Late", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VALUES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function generateQrCode(): string {
  return `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function TourForm({ tour, onClose }: { tour?: any; onClose: () => void }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: tour?.name ?? "",
    description: tour?.description ?? "",
    siteAddress: tour?.siteAddress ?? "",
    intervalMinutes: tour?.intervalMinutes ?? 60,
    status: tour?.status ?? "active",
    startTime: tour?.startTime ?? "",
    endTime: tour?.endTime ?? "",
    daysOfWeek: tour?.daysOfWeek ?? [],
  });

  const toggleDay = (day: string) => {
    setForm(p => ({
      ...p,
      daysOfWeek: p.daysOfWeek.includes(day)
        ? p.daysOfWeek.filter((d: string) => d !== day)
        : [...p.daysOfWeek, day],
    }));
  };

  const mutation = useMutation({
    mutationFn: (data: any) =>
      tour
        ? apiRequest("PATCH", `/api/guard-tours/tours/${tour.id}`, data)
        : apiRequest("POST", "/api/guard-tours/tours", { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours", workspaceId] });
      toast({ title: tour ? "Tour updated" : "Tour created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save tour", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label htmlFor="tour-name">Tour Name *</Label>
          <Input id="tour-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Building Perimeter" data-testid="input-tour-name" />
        </div>
        <div>
          <Label htmlFor="tour-site">Site Address</Label>
          <Input id="tour-site" value={form.siteAddress} onChange={e => setForm(p => ({ ...p, siteAddress: e.target.value }))} placeholder="e.g. 123 Main St, Dallas TX" data-testid="input-tour-site" />
        </div>
        <div>
          <Label htmlFor="tour-desc">Description</Label>
          <Textarea id="tour-desc" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tour-interval">Interval (minutes)</Label>
            <Input id="tour-interval" type="number" min={5} value={form.intervalMinutes} onChange={e => setForm(p => ({ ...p, intervalMinutes: parseInt(e.target.value) || 60 }))} data-testid="input-tour-interval" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger data-testid="select-tour-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tour-start">Start Time</Label>
            <Input id="tour-start" type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="tour-end">End Time</Label>
            <Input id="tour-end" type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Days of Week</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(DAY_VALUES[i])}
                className={`w-10 h-10 rounded-full text-xs font-medium border transition-colors ${
                  form.daysOfWeek.includes(DAY_VALUES[i])
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover-elevate"
                }`}
                data-testid={`day-toggle-${day}`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate(form)} disabled={!form.name || mutation.isPending} data-testid="button-save-tour">
          {mutation.isPending ? "Saving..." : tour ? "Update Tour" : "Create Tour"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function CheckpointForm({ tourId, checkpoint, onClose }: { tourId: string; checkpoint?: any; onClose: () => void }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: checkpoint?.name ?? "",
    description: checkpoint?.description ?? "",
    qrCode: checkpoint?.qrCode ?? generateQrCode(),
    latitude: checkpoint?.latitude ?? "",
    longitude: checkpoint?.longitude ?? "",
    sortOrder: checkpoint?.sortOrder ?? 0,
    isRequired: checkpoint?.isRequired ?? true,
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      checkpoint
        ? apiRequest("PATCH", `/api/guard-tours/checkpoints/${checkpoint.id}`, data)
        : apiRequest("POST", `/api/guard-tours/tours/${tourId}/checkpoints`, { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours/tours", tourId, "checkpoints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours", workspaceId] });
      toast({ title: checkpoint ? "Checkpoint updated" : "Checkpoint added" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save checkpoint", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label htmlFor="cp-name">Checkpoint Name *</Label>
          <Input id="cp-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. North Gate Entrance" data-testid="input-checkpoint-name" />
        </div>
        <div>
          <Label htmlFor="cp-desc">Description</Label>
          <Textarea id="cp-desc" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Instructions for this checkpoint..." />
        </div>
        <div>
          <Label htmlFor="cp-qr">QR Code</Label>
          <div className="flex gap-2">
            <Input id="cp-qr" value={form.qrCode} onChange={e => setForm(p => ({ ...p, qrCode: e.target.value }))} className="flex-1 font-mono text-xs" data-testid="input-checkpoint-qr" readOnly />
            <Button variant="outline" size="icon" onClick={() => setForm(p => ({ ...p, qrCode: generateQrCode() }))} data-testid="button-regenerate-qr">
              <QrCode className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Print this code and place at the checkpoint location</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cp-lat">Latitude</Label>
            <Input id="cp-lat" type="number" step="any" value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="cp-lng">Longitude</Label>
            <Input id="cp-lng" type="number" step="any" value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cp-order">Sort Order</Label>
            <Input id="cp-order" type="number" min={0} value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))} data-testid="input-checkpoint-order" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isRequired} onChange={e => setForm(p => ({ ...p, isRequired: e.target.checked }))} className="rounded" />
              <span className="text-sm">Required checkpoint</span>
            </label>
          </div>
        </div>
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate(form)} disabled={!form.name || mutation.isPending} data-testid="button-save-checkpoint">
          {mutation.isPending ? "Saving..." : checkpoint ? "Update" : "Add Checkpoint"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function ScanSimulator({ tourId, checkpoints }: { tourId: string; checkpoints: any[] }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [scanInput, setScanInput] = useState("");

  const scanMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/guard-tours/scans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours/tours", tourId, "scans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours", workspaceId] });
      toast({ title: "Checkpoint scanned successfully" });
      setScanInput("");
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const handleScan = (qrCode?: string) => {
    const code = qrCode || scanInput.trim();
    if (!code) return;
    const match = checkpoints.find((cp: any) => cp.qrCode === code);
    if (!match) {
      toast({ title: "Unknown QR code", description: "No matching checkpoint found for this code.", variant: "destructive" });
      return;
    }
    scanMutation.mutate({
      tourId,
      checkpointId: match.id,
      workspaceId,
      employeeId: (user as any)?.employeeId || (user as any)?.id,
      scannedAt: new Date().toISOString(),
      status: "completed",
      notes: "",
    });
  };

  if (checkpoints.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <QrCode className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Add checkpoints first to enable scanning</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ScanLine className="w-5 h-5 text-primary" />
            <h3 className="font-medium text-sm">Scan Checkpoint</h3>
          </div>
          <div className="flex gap-2">
            <Input
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              placeholder="Enter or scan QR code..."
              className="flex-1 font-mono text-sm"
              onKeyDown={e => { if (e.key === "Enter") handleScan(); }}
              data-testid="input-scan-qr"
            />
            <Button onClick={() => handleScan()} disabled={!scanInput.trim() || scanMutation.isPending} data-testid="button-submit-scan">
              <ScanLine className="w-4 h-4 mr-2" />
              Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Quick Scan Buttons</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {checkpoints.map((cp: any) => (
            <Button
              key={cp.id}
              variant="outline"
              className="justify-start"
              onClick={() => handleScan(cp.qrCode)}
              disabled={scanMutation.isPending}
              data-testid={`button-quick-scan-${cp.id}`}
            >
              <CircleDot className="w-4 h-4 mr-2 shrink-0" />
              <span className="truncate">{cp.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs shrink-0">{cp.sortOrder + 1}</Badge>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckpointList({ tourId }: { tourId: string }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [showCpForm, setShowCpForm] = useState(false);
  const [editCp, setEditCp] = useState<any>(null);

  const { data: checkpoints = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tourId, "checkpoints"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tourId}/checkpoints`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tourId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/guard-tours/checkpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guard-tours/tours", tourId, "checkpoints"] });
      toast({ title: "Checkpoint deleted" });
    },
    onError: () => toast({ title: "Failed to delete checkpoint", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Checkpoints ({checkpoints.length})
        </h3>
        <Button size="sm" onClick={() => { setEditCp(null); setShowCpForm(true); }} data-testid="button-add-checkpoint">
          <Plus className="w-4 h-4 mr-1" />
          Add Checkpoint
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : checkpoints.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MapPin className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No checkpoints yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add QR checkpoints guards must scan during their patrol</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {checkpoints.map((cp: any, idx: number) => (
            <Card key={cp.id} data-testid={`card-checkpoint-${cp.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{cp.name}</p>
                      {cp.isRequired && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{cp.qrCode}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => { setEditCp(cp); setShowCpForm(true); }} data-testid={`button-edit-cp-${cp.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(cp.id)} data-testid={`button-delete-cp-${cp.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UniversalModal open={showCpForm} onOpenChange={open => { if (!open) { setShowCpForm(false); setEditCp(null); } }} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle>{editCp ? "Edit Checkpoint" : "Add Checkpoint"}</UniversalModalTitle>
        </UniversalModalHeader>
        <CheckpointForm tourId={tourId} checkpoint={editCp} onClose={() => { setShowCpForm(false); setEditCp(null); }} />
      </UniversalModal>
    </div>
  );
}

function ScanHistory({ tourId }: { tourId: string }) {
  const { data: scans = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tourId, "scans"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tourId}/scans`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tourId,
  });

  const { data: checkpoints = [] } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tourId, "checkpoints"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tourId}/checkpoints`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tourId,
  });

  const cpMap = useMemo(() => {
    const m: Record<string, string> = {};
    checkpoints.forEach((cp: any) => { m[cp.id] = cp.name; });
    return m;
  }, [checkpoints]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>;

  if (scans.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ScanLine className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">No scans recorded</p>
          <p className="text-xs text-muted-foreground mt-1">Scans will appear here as guards complete their rounds</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {scans.map((scan: any) => {
        const cfg = SCAN_STATUS_CONFIG[scan.status] || SCAN_STATUS_CONFIG.completed;
        return (
          <Card key={scan.id} data-testid={`card-scan-${scan.id}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cpMap[scan.checkpointId] || "Unknown Checkpoint"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(scan.scannedAt).toLocaleString()}
                  </p>
                </div>
                <Badge className={`text-xs border shrink-0 ${cfg.className}`}>{cfg.label}</Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PatrolReport({ tourId }: { tourId: string }) {
  const { data: scans = [] } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tourId, "scans"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tourId}/scans`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tourId,
  });

  const { data: checkpoints = [] } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tourId, "checkpoints"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tourId}/checkpoints`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tourId,
  });

  const report = useMemo(() => {
    const totalCheckpoints = checkpoints.length;
    const requiredCheckpoints = checkpoints.filter((cp: any) => cp.isRequired).length;
    const totalScans = scans.length;
    const completedScans = scans.filter((s: any) => s.status === "completed").length;
    const lateScans = scans.filter((s: any) => s.status === "late").length;
    const missedScans = scans.filter((s: any) => s.status === "missed").length;

    const uniqueCheckpointsScanned = new Set(scans.map((s: any) => s.checkpointId)).size;
    const completionRate = totalCheckpoints > 0 ? Math.round((uniqueCheckpointsScanned / totalCheckpoints) * 100) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayScans = scans.filter((s: any) => new Date(s.scannedAt) >= today);

    const cpScanCounts: Record<string, number> = {};
    scans.forEach((s: any) => { cpScanCounts[s.checkpointId] = (cpScanCounts[s.checkpointId] || 0) + 1; });

    const checkpointDetails = checkpoints.map((cp: any) => ({
      ...cp,
      scanCount: cpScanCounts[cp.id] || 0,
      lastScan: scans.filter((s: any) => s.checkpointId === cp.id).sort((a: any, b: any) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())[0],
    }));

    return {
      totalCheckpoints,
      requiredCheckpoints,
      totalScans,
      completedScans,
      lateScans,
      missedScans,
      uniqueCheckpointsScanned,
      completionRate,
      todayScansCount: todayScans.length,
      checkpointDetails,
    };
  }, [scans, checkpoints]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Checkpoints", value: report.totalCheckpoints, icon: MapPin, color: "text-foreground" },
          { label: "Total Scans", value: report.totalScans, icon: ScanLine, color: "text-foreground" },
          { label: "Today", value: report.todayScansCount, icon: Clock, color: "text-blue-600 dark:text-blue-400" },
          { label: "Completion", value: `${report.completionRate}%`, icon: BarChart3, color: "text-green-600 dark:text-green-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {report.totalCheckpoints > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-medium">Route Completion</h3>
              <span className="text-xs text-muted-foreground">{report.uniqueCheckpointsScanned} / {report.totalCheckpoints} checkpoints covered</span>
            </div>
            <Progress value={report.completionRate} className="h-2" />
          </CardContent>
        </Card>
      )}

      {report.lateScans > 0 || report.missedScans > 0 ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <h3 className="text-sm font-medium">Issues</h3>
            </div>
            <div className="flex gap-4 flex-wrap">
              {report.lateScans > 0 && (
                <div className="flex items-center gap-2">
                  <Badge className="text-xs border bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">{report.lateScans} Late</Badge>
                </div>
              )}
              {report.missedScans > 0 && (
                <div className="flex items-center gap-2">
                  <Badge className="text-xs border bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">{report.missedScans} Missed</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h3 className="text-sm font-medium mb-2">Checkpoint Status</h3>
        <div className="space-y-2">
          {report.checkpointDetails.map((cp: any) => (
            <Card key={cp.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cp.scanCount > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cp.scanCount > 0
                        ? `${cp.scanCount} scan${cp.scanCount !== 1 ? "s" : ""} - Last: ${new Date(cp.lastScan.scannedAt).toLocaleString()}`
                        : "Not yet scanned"}
                    </p>
                  </div>
                  {cp.isRequired && <Badge variant="secondary" className="text-xs shrink-0">Required</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function TourDetail({ tour, onBack }: { tour: any; onBack: () => void }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [activeTab, setActiveTab] = useState("checkpoints");

  const { data: checkpoints = [] } = useQuery<any[]>({
    queryKey: ["/api/guard-tours/tours", tour.id, "checkpoints"],
    queryFn: () =>
      fetch(`/api/guard-tours/tours/${tour.id}/checkpoints`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!tour.id,
  });

  const cfg = STATUS_CONFIG[tour.status] || STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-tours">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{tour.name}</h2>
          {tour.siteAddress && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground truncate">{tour.siteAddress}</p>
            </div>
          )}
        </div>
        <Badge className={`text-xs border shrink-0 ${cfg.className}`}>
          <StatusIcon className="w-3 h-3 mr-1 inline" />
          {cfg.label}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Every {tour.intervalMinutes} min</span>
        {tour.startTime && tour.endTime && <span>{tour.startTime} - {tour.endTime}</span>}
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{checkpoints.length} checkpoints</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="checkpoints" data-testid="tab-checkpoints">
            <ListChecks className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Checkpoints</span>
          </TabsTrigger>
          <TabsTrigger value="scan" data-testid="tab-scan">
            <QrCode className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Scan</span>
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">
            <FileText className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Report</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="checkpoints" className="mt-4">
          <CheckpointList tourId={tour.id} />
        </TabsContent>
        <TabsContent value="scan" className="mt-4">
          <ScanSimulator tourId={tour.id} checkpoints={checkpoints} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ScanHistory tourId={tour.id} />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <PatrolReport tourId={tour.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TourCard({ tour, onEdit, onView }: { tour: any; onEdit: (t: any) => void; onView: (t: any) => void }) {
  const cfg = STATUS_CONFIG[tour.status] || STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;
  return (
    <Card className="hover-elevate cursor-pointer" onClick={() => onView(tour)} data-testid={`card-tour-${tour.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Route className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{tour.name}</p>
              <Badge className={`text-xs shrink-0 border ${cfg.className}`}>
                <StatusIcon className="w-3 h-3 mr-1 inline" />
                {cfg.label}
              </Badge>
            </div>
            {tour.siteAddress && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{tour.siteAddress}</p>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Every {tour.intervalMinutes} min
              </span>
              {tour.startTime && tour.endTime && (
                <span className="text-xs text-muted-foreground">{tour.startTime} - {tour.endTime}</span>
              )}
            </div>
            {tour.daysOfWeek?.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {tour.daysOfWeek.map((d: string) => (
                  <span key={d} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {d.slice(0, 3).charAt(0).toUpperCase() + d.slice(1, 3)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={e => { e.stopPropagation(); onEdit(tour); }}
              data-testid={`button-edit-tour-${tour.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={e => { e.stopPropagation(); onView(tour); }}
              data-testid={`button-view-tour-${tour.id}`}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GuardTourPage() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [showForm, setShowForm] = useState(false);
  const [editTour, setEditTour] = useState<any>(null);
  const [selectedTour, setSelectedTour] = useState<any>(null);

  const { data: tours = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/guard-tours", workspaceId],
    queryFn: () =>
      fetch(`/api/guard-tours/tours`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  const stats = {
    total: tours.length,
    active: tours.filter((t: any) => t.status === "active").length,
    paused: tours.filter((t: any) => t.status === "paused").length,
  };

  if (selectedTour) {
    return (
      <CanvasHubPage config={pageConfig}>
        <TourDetail tour={selectedTour} onBack={() => setSelectedTour(null)} />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Tours", value: stats.total, icon: Route, color: "text-foreground" },
            { label: "Active", value: stats.active, icon: CheckCircle, color: "text-green-600 dark:text-green-400" },
            { label: "Paused", value: stats.paused, icon: Pause, color: "text-yellow-600 dark:text-yellow-400" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-muted-foreground truncate">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold">Patrol Routes</h2>
          <Button onClick={() => { setEditTour(null); setShowForm(true); }} data-testid="button-create-tour">
            <Plus className="w-4 h-4 mr-2" />
            New Tour
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>
        ) : tours.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Navigation className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No guard tours configured</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first patrol route to assign checkpoints and track officer compliance.</p>
              <Button className="mt-4" onClick={() => setShowForm(true)} data-testid="button-create-first-tour">
                <Plus className="w-4 h-4 mr-2" />
                Create Tour
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tours.map((tour: any) => (
              <TourCard
                key={tour.id}
                tour={tour}
                onEdit={t => { setEditTour(t); setShowForm(true); }}
                onView={t => setSelectedTour(t)}
              />
            ))}
          </div>
        )}
      </div>

      <UniversalModal open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditTour(null); } }} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle>{editTour ? "Edit Tour" : "New Guard Tour"}</UniversalModalTitle>
        </UniversalModalHeader>
        <TourForm tour={editTour} onClose={() => { setShowForm(false); setEditTour(null); }} />
      </UniversalModal>
    </CanvasHubPage>
  );
}
