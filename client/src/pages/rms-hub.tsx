import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Activity, AlertOctagon, AlertTriangle, Archive, ArrowRightLeft, BarChart2, Camera, Check, CheckCircle,
  ChevronsUpDown, ChevronRight, Clock, Download, Eye, FileText, List, MapPin, Plus, RefreshCw, Search, Send,
  ShieldAlert, Sparkles, TrendingUp, Upload, Users, X as XIcon,
} from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalBody, UniversalModalDescription } from "@/components/ui/universal-modal";
import { DsPageWrapper, DsPageHeader, DsStatCard, DsTabBar, DsDataRow, DsSectionCard, DsBadge, DsButton, DsInput } from "@/components/ui/ds-components";
import { ReportDisclaimer, TranslationDisclaimer } from "@/components/liability-disclaimers";

const PRIORITY_COLORS: Record<string, "gold" | "success" | "danger" | "warning" | "info" | "muted"> = {
  low: "muted", medium: "warning", high: "gold", critical: "danger",
};
const STATUS_COLORS: Record<string, "gold" | "success" | "danger" | "warning" | "info" | "muted"> = {
  open: "gold", closed: "muted", pending: "warning", resolved: "success",
  submitted: "info", approved: "success", active: "gold", found: "gold", claimed: "muted",
};

function timeAgo(ts: string) {
  if (!ts) return "—";
  try { return format(new Date(ts), "MMM d, h:mm a"); } catch { return ts; }
}

// Smart Site/Client Selector
function SiteSelector({ workspaceId, onSelect }: { workspaceId: string | undefined; onSelect: (site: any) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState("");

  const sites = useQuery<any>({
    queryKey: ["/api/rms/sites-lookup", { workspaceId }],
    enabled: !!workspaceId,
  });

  const allSites: any[] = sites.data?.sites || [];
  const filtered = search
    ? allSites.filter(s => `${s.name} ${s.client_name} ${s.city} ${s.state}`.toLowerCase().includes(search.toLowerCase()))
    : allSites;

  function handleSelect(site: any) {
    setSelected(site);
    onSelect(site);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="default"
          data-testid="button-site-selector"
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.name}{selected.client_name ? ` — ${selected.client_name}` : ""}</span>
          ) : (
            <span className="text-muted-foreground">Select client / site...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 z-[9999]" align="start">
        <Command>
          <CommandInput
            placeholder="Search sites or clients..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {sites.isLoading && <div className="p-2 text-sm text-muted-foreground text-center">Loading sites...</div>}
            <CommandEmpty>No sites found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 30).map((site: any) => (
                <CommandItem
                  key={site.id}
                  value={site.id}
                  onSelect={() => handleSelect(site)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <div className="flex items-center gap-2 w-full">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{site.name}</span>
                    {site.client_name && <span className="text-xs text-muted-foreground truncate ml-auto">{site.client_name}</span>}
                  </div>
                  {site.address_line1 && (
                    <span className="text-xs text-muted-foreground pl-5 truncate w-full">
                      {site.address_line1}, {site.city}, {site.state} {site.zip}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Address display after site selection
function SelectedSiteInfo({ site }: { site: any }) {
  if (!site) return null;
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div>
        {site.address_line1 && <div>{site.address_line1}</div>}
        {(site.city || site.state) && <div>{[site.city, site.state, site.zip].filter(Boolean).join(", ")}</div>}
        {site.client_name && <div className="font-medium text-foreground/60">Client: {site.client_name}</div>}
      </div>
    </div>
  );
}

// GPS capture hook
function useGPS() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "capturing" | "captured" | "unavailable">("idle");

  function capture() {
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("capturing");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setStatus("captured"); },
      () => setStatus("unavailable"),
      { timeout: 8000, maximumAge: 30000 }
    );
  }

  return { coords, status, capture };
}

// Emergency Quick-Submit mode component
function QuickSubmitIncident({ workspaceId, onComplete }: { workspaceId: string | undefined; onComplete: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const gps = useGPS();
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [category, setCategory] = useState("theft");

  useEffect(() => {
    gps.capture();
  }, []);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/incidents", { ...data, workspaceId }),
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rms/incidents", { workspaceId }] });
      toast({ title: "Quick-submit successful", description: d.report_number });
      onComplete();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Emergency Quick-Submit
        </h3>
        <Badge variant={gps.status === "captured" ? "default" : "secondary"}>
          {gps.status === "captured" ? "GPS Locked" : "GPS Required"}
        </Badge>
      </div>

      <SiteSelector workspaceId={workspaceId} onSelect={setSelectedSite} />
      
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {["theft","vandalism","assault","medical","fire","disturbance","other"].map(c => (
            <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea 
        placeholder="What happened? (Narrative)" 
        value={narrative} 
        onChange={e => setNarrative(e.target.value)}
        className="min-h-[80px]"
      />

      <PhotoUpload onPhotos={setPhotos} />

      <Button 
        className="w-full" 
        variant="destructive"
        disabled={!selectedSite || !narrative || mutation.isPending}
        onClick={() => mutation.mutate({
          siteId: selectedSite.id,
          siteName: selectedSite.name,
          title: `QUICK-SUBMIT: ${category.toUpperCase()}`,
          category,
          narrative,
          occurredAt: new Date().toISOString(),
          reportedByName: user?.firstName || "Field Officer",
          photos,
          latitude: gps.coords?.lat,
          longitude: gps.coords?.lng,
          priority: "high"
        })}
      >
        {mutation.isPending ? "Submitting..." : "Submit Incident Now"}
      </Button>
    </div>
  );
}

// Photo upload strip
function PhotoUpload({ onPhotos }: { onPhotos: (urls: string[]) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newPreviews: string[] = [];
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      newPreviews.push(url);
    }
    const all = [...previews, ...newPreviews];
    setPreviews(all);
    onPhotos(all);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="default" onClick={() => inputRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />Add Photo
        </Button>
        <span className="text-xs text-muted-foreground self-center">{previews.length} file{previews.length !== 1 ? "s" : ""} added</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt={`preview-${i}`} width={64} height={64} className="w-16 h-16 object-cover rounded-md border" />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center"
                onClick={() => { const u = previews.filter((_, j) => j !== i); setPreviews(u); onPhotos(u); }}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RMSHub() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("incidents");
  const [showCreateIncident, setShowCreateIncident] = useState(false);
  const [showCreateDAR, setShowCreateDAR] = useState(false);
  const [showCreateVisitor, setShowCreateVisitor] = useState(false);
  const [showPreRegisterVisitor, setShowPreRegisterVisitor] = useState(false);
  const [showVisitorDetail, setShowVisitorDetail] = useState<any>(null);
  const [visitorFilter, setVisitorFilter] = useState("all");
  const [visitorSearch, setVisitorSearch] = useState("");
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showCreateLF, setShowCreateLF] = useState(false);
  const [showCreateTrespass, setShowCreateTrespass] = useState(false);
  const [showCreateBOLO, setShowCreateBOLO] = useState(false);
  const [showCreateEvidence, setShowCreateEvidence] = useState(false);
  const [viewIncident, setViewIncident] = useState<any>(null);
  const [quickTemplate, setQuickTemplate] = useState<string | null>(null);

  const stats = useQuery<any>({ queryKey: ["/api/rms/stats", { workspaceId }], enabled: !!workspaceId });
  const visitors = useQuery<any>({ 
    queryKey: ["/api/rms/visitors", { workspaceId, status: visitorFilter, search: visitorSearch }], 
    enabled: !!workspaceId && activeTab === "visitors" 
  });
  const visitorStats = useQuery<any>({
    queryKey: ["/api/rms/visitors/stats", { workspaceId }],
    enabled: !!workspaceId && activeTab === "visitors"
  });
  const incidents = useQuery<any>({ queryKey: ["/api/rms/incidents", { workspaceId }], enabled: !!workspaceId });
  const dars = useQuery<any>({ queryKey: ["/api/rms/dars", { workspaceId }], enabled: !!workspaceId });
  const cases = useQuery<any>({ queryKey: ["/api/rms/cases", { workspaceId }], enabled: !!workspaceId });
  const keys = useQuery<any>({ queryKey: ["/api/rms/key-control", { workspaceId }], enabled: !!workspaceId });
  const lostFound = useQuery<any>({ queryKey: ["/api/rms/lost-found", { workspaceId }], enabled: !!workspaceId });
  const trespass = useQuery<any>({ queryKey: ["/api/rms/trespass", { workspaceId }], enabled: !!workspaceId });
  const bolos = useQuery<any>({ queryKey: ["/api/rms/bolo", { workspaceId }], enabled: !!workspaceId && activeTab === "bolo" });
  const evidence = useQuery<any>({ queryKey: ["/api/rms/evidence", { workspaceId }], enabled: !!workspaceId && activeTab === "evidence" });
  const heatmap = useQuery<any>({ queryKey: ["/api/rms/analytics/heatmap", { workspaceId }], enabled: !!workspaceId && activeTab === "analytics" });
  const auditSummaries = useQuery<any>({ queryKey: ["/api/rms/reports/audit-summary", { workspaceId }], enabled: !!workspaceId && activeTab === "dars" });
  const [viewAuditTrail, setViewAuditTrail] = useState<string | null>(null);
  const auditTrailDetail = useQuery<any>({ queryKey: ["/api/rms/reports", viewAuditTrail, "audit-trail"], enabled: !!viewAuditTrail });
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const custodyLog = useQuery<any>({ queryKey: ["/api/rms/evidence", selectedEvidenceId, "custody-log"], enabled: !!selectedEvidenceId });

  function invalidateAll() {
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/rms") });
  }

  const createIncident = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/incidents", { ...data, workspaceId }),
    onSuccess: (d: any) => {
      invalidateAll(); setShowCreateIncident(false);
      toast({ title: "Incident report created", description: d.report_number });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createDAR = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/dars", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateDAR(false); toast({ title: "DAR submitted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createVisitor = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/visitors", { ...data, workspaceId }),
    onSuccess: (d: any) => {
      invalidateAll(); setShowCreateVisitor(false);
      if (d.boloMatch) {
        toast({ title: "BOLO MATCH DETECTED", description: `Visitor name matches an active BOLO alert. Dispatch notified.`, variant: "destructive" });
      } else {
        toast({ title: "Visitor checked in" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkoutVisitor = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/visitors/${id}/checkout`, { checkedOutBy: user?.firstName, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "Visitor checked out" }); },
  });

  const preRegisterVisitor = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/visitors/pre-register", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowPreRegisterVisitor(false); toast({ title: "Visitor pre-registered" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteVisitor = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rms/visitors/${id}`, { workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "Visitor record deleted" }); setShowVisitorDetail(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateVisitor = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/rms/visitors/${id}`, { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "Visitor updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCase = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/cases", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateCase(false); toast({ title: "Case created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createKey = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/key-control", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateKey(false); toast({ title: "Key checked out" }); },
  });

  const returnKey = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/key-control/${id}/return`, { returnedTo: user?.firstName, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "Key returned" }); },
  });

  const createLF = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/lost-found", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateLF(false); toast({ title: "Item logged" }); },
  });

  const createTrespass = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/trespass", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateTrespass(false); toast({ title: "Trespass notice issued" }); },
  });

  const createBOLO = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/bolo", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateBOLO(false); toast({ title: "BOLO alert created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deactivateBOLO = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rms/bolo/${id}`, { isActive: false, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "BOLO deactivated" }); },
  });

  const polishNarrative = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/incidents/${id}/ai-narrative`, { workspaceId }),
    onSuccess: (d: any) => { toast({ title: "AI narrative ready" }); setViewIncident((v: any) => v ? { ...v, ai_narrative: d.aiNarrative } : v); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createEvidence = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/rms/evidence", { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); setShowCreateEvidence(false); toast({ title: "Evidence item logged" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const transferCustody = useMutation({
    mutationFn: ({ evidenceId, data }: { evidenceId: string; data: any }) => apiRequest("POST", `/api/rms/evidence/${evidenceId}/transfer`, { ...data, workspaceId }),
    onSuccess: () => { invalidateAll(); queryClient.invalidateQueries({ queryKey: ["/api/rms/evidence", selectedEvidenceId, "custody"] }); toast({ title: "Custody transferred" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitDar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/dars/${id}/submit`, { workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "DAR submitted for review" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const verifyDar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/dars/${id}/verify`, { verifierId: user?.id, verifierName: user?.firstName, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "DAR verified" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendDarToClient = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => apiRequest("POST", `/api/rms/dars/${id}/send-to-client`, { recipientEmail: email, workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "DAR sent to client" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generateDarPdf = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rms/dars/${id}/generate-pdf`, { workspaceId }),
    onSuccess: () => { invalidateAll(); toast({ title: "PDF generated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const trackReportAction = useMutation({
    mutationFn: (data: { reportId: string; action: string; reportType?: string; metadata?: any }) =>
      apiRequest("POST", `/api/rms/reports/${data.reportId}/track`, { action: data.action, reportType: data.reportType || "dar", metadata: data.metadata, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rms/reports/audit-summary", { workspaceId }] });
    },
  });

  const uploadPhoto = useMutation({
    mutationFn: (data: { base64Data: string; fileName: string; category: string }) => apiRequest("POST", "/api/rms/upload-photo", { ...data, workspaceId }),
  });

  // Incident form with site selector + GPS + quick templates
  function IncidentForm() {
    const gps = useGPS();
    const [selectedSite, setSelectedSite] = useState<any>(null);
    const [photos, setPhotos] = useState<string[]>([]);
    const [f, setF] = useState({
      category: "theft", priority: "medium", title: "", narrative: "",
      locationDescription: "", occurredAt: new Date().toISOString().slice(0, 16),
      reportedByName: user?.firstName || "", siteName: "", siteId: "",
    });

    // Auto-capture GPS on form open; apply quick template if set
    useEffect(() => {
      gps.capture();
      if (quickTemplate) applyTemplate(quickTemplate);
    }, []);

    function applySite(site: any) {
      setSelectedSite(site);
      setF(p => ({
        ...p,
        siteId: site.id,
        siteName: site.name,
        locationDescription: [site.address_line1, site.city, site.state, site.zip].filter(Boolean).join(", "),
      }));
    }

    function applyTemplate(template: string) {
      const templates: Record<string, Partial<typeof f>> = {
        theft: { category: "theft", priority: "medium", title: "Theft — Item Reported Missing" },
        "slip-fall": { category: "other", priority: "medium", title: "Slip and Fall Incident" },
        medical: { category: "medical", priority: "high", title: "Medical Emergency Response" },
        trespass: { category: "trespass", priority: "medium", title: "Trespass Warning Issued" },
      };
      if (templates[template]) setF(p => ({ ...p, ...templates[template] }));
    }

    return (
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-1.5">
          {["theft", "slip-fall", "medical", "trespass"].map(t => (
            <Button key={t} type="button" variant="outline" size="sm" onClick={() => applyTemplate(t)}>
              {t.replace("-", " & ")}
            </Button>
          ))}
        </div>

        <SiteSelector workspaceId={workspaceId} onSelect={applySite} />
        {selectedSite && <SelectedSiteInfo site={selectedSite} />}

        <Input data-testid="input-incident-title" placeholder="Title *" value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={f.category} onValueChange={v => setF(p => ({ ...p, category: v }))}>
            <SelectTrigger data-testid="select-incident-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["theft","vandalism","trespass","assault","medical","fire","suspicious_activity","disturbance","vehicle","other"].map(c => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={f.priority} onValueChange={v => setF(p => ({ ...p, priority: v }))}>
            <SelectTrigger data-testid="select-incident-priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["low","medium","high","critical"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!selectedSite && (
          <Input placeholder="Site name (or use selector above)" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />
        )}
        <Input placeholder="Location description" value={f.locationDescription} onChange={e => setF(p => ({ ...p, locationDescription: e.target.value }))} />
        <Input type="datetime-local" value={f.occurredAt} onChange={e => setF(p => ({ ...p, occurredAt: e.target.value }))} />
        <Input placeholder="Reported by" value={f.reportedByName} onChange={e => setF(p => ({ ...p, reportedByName: e.target.value }))} />
        <Textarea placeholder="Narrative" value={f.narrative} onChange={e => setF(p => ({ ...p, narrative: e.target.value }))} rows={4} />
        <PhotoUpload onPhotos={setPhotos} />

        <div className="flex items-center gap-2 text-xs">
          {gps.status === "captured" && (
            <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-900/30">
              <MapPin className="h-3 w-3 mr-1" />GPS captured
            </Badge>
          )}
          {gps.status === "capturing" && <span className="text-muted-foreground">Capturing GPS...</span>}
          {gps.status === "unavailable" && <span className="text-muted-foreground">GPS unavailable</span>}
        </div>

        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowCreateIncident(false)}>Cancel</Button>
          <Button data-testid="button-submit-incident"
            onClick={() => createIncident.mutate({
              ...f,
              photos,
              latitude: gps.coords?.lat,
              longitude: gps.coords?.lng,
            })}
            disabled={!f.title || createIncident.isPending}>
            {createIncident.isPending ? "Submitting…" : "Submit Report"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  function DARForm() {
    const [selectedSite, setSelectedSite] = useState<any>(null);
    const [photos, setPhotos] = useState<string[]>([]);
    const [f, setF] = useState({
      employeeName: user?.firstName || "", siteName: "", siteId: "",
      shiftDate: new Date().toISOString().slice(0, 10),
      activitySummary: "", patrolRoundsCompleted: 0, visitorCount: 0,
      incidentsOccurred: false, equipmentChecked: true, postOrdersFollowed: true,
    });

    return (
      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
        {selectedSite && <SelectedSiteInfo site={selectedSite} />}
        <Input placeholder="Officer name *" value={f.employeeName} onChange={e => setF(p => ({ ...p, employeeName: e.target.value }))} />
        {!selectedSite && <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
        <Input type="date" value={f.shiftDate} onChange={e => setF(p => ({ ...p, shiftDate: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Patrol rounds" value={f.patrolRoundsCompleted} onChange={e => setF(p => ({ ...p, patrolRoundsCompleted: Number(e.target.value) }))} />
          <Input type="number" placeholder="Visitor count" value={f.visitorCount} onChange={e => setF(p => ({ ...p, visitorCount: Number(e.target.value) }))} />
        </div>
        <Textarea placeholder="Activity summary *" value={f.activitySummary} onChange={e => setF(p => ({ ...p, activitySummary: e.target.value }))} rows={4} />
        <PhotoUpload onPhotos={setPhotos} />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={f.incidentsOccurred} onChange={e => setF(p => ({ ...p, incidentsOccurred: e.target.checked }))} />
            Incidents occurred
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={f.equipmentChecked} onChange={e => setF(p => ({ ...p, equipmentChecked: e.target.checked }))} />
            Equipment checked
          </label>
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowCreateDAR(false)}>Cancel</Button>
          <Button data-testid="button-submit-dar" onClick={() => createDAR.mutate({ ...f, photos })} disabled={!f.employeeName || !f.activitySummary || createDAR.isPending}>
            {createDAR.isPending ? "Submitting…" : "Submit DAR"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  function PhotoCaptureField({ label, photoUrl, onCapture, testId }: { label: string; photoUrl: string; onCapture: (url: string) => void; testId: string }) {
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
      setUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;
          const result: any = await uploadPhoto.mutateAsync({ base64Data, fileName: `${testId}-${Date.now()}.jpg`, category: 'visitor-photos' });
          if (result?.url) onCapture(result.url);
        };
        reader.readAsDataURL(file);
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {photoUrl ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Captured</Badge>
            <Button size="sm" variant="ghost" data-testid={`button-retake-${testId}`} onClick={() => fileRef.current?.click()}>
              <RefreshCw className="mr-1 h-3 w-3" />Retake
            </Button>
          </div>
        ) : (
          <Button size="default" variant="outline" className="w-full" data-testid={`button-capture-${testId}`} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            {uploading ? "Uploading…" : `Capture ${label}`}
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
    );
  }

  function PreRegisterForm() {
    const [selectedSite, setSelectedSite] = useState<any>(null);
    const [f, setF] = useState({
      siteId: "", siteName: "", visitorName: "", visitorCompany: "", hostName: "", purpose: "",
      expectedArrival: new Date().toISOString().slice(0, 16), vehiclePlate: "", notes: ""
    });

    return (
      <div className="space-y-3">
        <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
        {selectedSite && <SelectedSiteInfo site={selectedSite} />}
        {!selectedSite && <Input placeholder="Site name *" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
        <Input placeholder="Visitor name *" value={f.visitorName} onChange={e => setF(p => ({ ...p, visitorName: e.target.value }))} />
        <Input placeholder="Company" value={f.visitorCompany} onChange={e => setF(p => ({ ...p, visitorCompany: e.target.value }))} />
        <Input placeholder="Host name" value={f.hostName} onChange={e => setF(p => ({ ...p, hostName: e.target.value }))} />
        <Input placeholder="Purpose of visit" value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Expected Arrival *</label>
          <Input type="datetime-local" value={f.expectedArrival} onChange={e => setF(p => ({ ...p, expectedArrival: e.target.value }))} />
        </div>
        <Input placeholder="Vehicle plate" value={f.vehiclePlate} onChange={e => setF(p => ({ ...p, vehiclePlate: e.target.value }))} />
        <Textarea placeholder="Notes" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowPreRegisterVisitor(false)}>Cancel</Button>
          <Button onClick={() => preRegisterVisitor.mutate(f)} disabled={(!f.siteName && !selectedSite) || !f.visitorName || preRegisterVisitor.isPending}>
            {preRegisterVisitor.isPending ? "Registering…" : "Pre-Register Visitor"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  function VisitorDetailView({ visitor }: { visitor: any }) {
    if (!visitor) return null;

    const isOverdue = visitor.expected_departure && !visitor.checked_out_at && new Date(visitor.expected_departure) < new Date();
    const isActive = !visitor.checked_out_at;

    const printBadge = () => {
      const win = window.open('', '_blank');
      if (!win) return;
      const html = `
        <html>
          <head>
            <title>Visitor Badge - ${visitor.visitor_name}</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .badge { border: 2px solid #000; padding: 20px; width: 350px; border-radius: 10px; text-align: center; }
              .header { font-size: 24px; font-bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
              .field { margin: 10px 0; text-align: left; }
              .label { font-size: 10px; color: #666; text-transform: uppercase; }
              .value { font-size: 18px; font-weight: bold; }
              .footer { margin-top: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body onload="window.print()">
            <div class="badge">
              <div class="header">VISITOR PASS</div>
              <div class="field"><div class="label">Name</div><div class="value">${visitor.visitor_name}</div></div>
              ${visitor.visitor_company ? `<div class="field"><div class="label">Company</div><div class="value">${visitor.visitor_company}</div></div>` : ''}
              <div class="field"><div class="label">Host</div><div class="value">${visitor.host_name || 'N/A'}</div></div>
              <div class="field"><div class="label">Purpose</div><div class="value">${visitor.purpose || 'N/A'}</div></div>
              <div class="field"><div class="label">Site</div><div class="value">${visitor.site_name}</div></div>
              <div class="field"><div class="label">Date</div><div class="value">${format(new Date(visitor.checked_in_at || new Date()), 'MMM d, yyyy')}</div></div>
              ${visitor.visitor_badge_number ? `<div class="field"><div class="label">Badge #</div><div class="value">${visitor.visitor_badge_number}</div></div>` : ''}
              <div class="footer">Property of ${visitor.site_name}</div>
            </div>
          </body>
        </html>
      `;
      win.document.write(html);
      win.document.close();
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <DsSectionCard title="Visitor Information" className="p-4">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase">Full Name</div>
                <div className="font-medium">{visitor.visitor_name}</div>
                {visitor.visitor_company && (
                  <>
                    <div className="text-xs text-muted-foreground uppercase mt-2">Company</div>
                    <div className="font-medium">{visitor.visitor_company}</div>
                  </>
                )}
                <div className="text-xs text-muted-foreground uppercase mt-2">ID Information</div>
                <div className="text-sm">{visitor.visitor_id_type || 'N/A'}: {visitor.visitor_id_number || 'N/A'}</div>
                <div className="text-xs text-muted-foreground uppercase mt-2">Badge Number</div>
                <div className="text-sm font-mono">{visitor.visitor_badge_number || 'None'}</div>
              </div>
            </DsSectionCard>

            <DsSectionCard title="Visit Details" className="p-4">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase">Purpose</div>
                <div className="font-medium">{visitor.purpose || 'General Visit'}</div>
                <div className="text-xs text-muted-foreground uppercase mt-2">Host</div>
                <div className="font-medium">{visitor.host_name || 'Not specified'}</div>
                <div className="text-xs text-muted-foreground uppercase mt-2">Location</div>
                <div className="font-medium">{visitor.site_name}</div>
              </div>
            </DsSectionCard>

            {visitor.vehicle_plate && (
              <DsSectionCard title="Vehicle" className="p-4">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase">Plate Number</div>
                  <div className="font-mono font-bold text-lg">{visitor.vehicle_plate}</div>
                  <div className="text-xs text-muted-foreground uppercase mt-2">Description</div>
                  <div className="text-sm">{visitor.vehicle_description || 'No description'}</div>
                </div>
              </DsSectionCard>
            )}
          </div>

          <div className="space-y-4">
            <DsSectionCard title="Logistics" className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <DsBadge color={isActive ? (isOverdue ? "danger" : "success") : "muted"}>
                    {isActive ? (isOverdue ? "OVERDUE" : "ACTIVE") : "CHECKED OUT"}
                  </DsBadge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Checked In</span>
                  <span className="text-xs font-mono">{timeAgo(visitor.checked_in_at)}</span>
                </div>
                {visitor.checked_out_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Checked Out</span>
                    <span className="text-xs font-mono">{timeAgo(visitor.checked_out_at)}</span>
                  </div>
                )}
                {visitor.expected_departure && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Expected Departure</span>
                    <span className="text-xs font-mono">{timeAgo(visitor.expected_departure)}</span>
                  </div>
                )}
              </div>
            </DsSectionCard>

            {(visitor.visitor_photo_url || visitor.id_photo_url) && (
              <DsSectionCard title="Media" className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {visitor.visitor_photo_url && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Visitor</p>
                      <img src={visitor.visitor_photo_url} className="w-full h-24 object-cover rounded border" alt="Visitor" />
                    </div>
                  )}
                  {visitor.id_photo_url && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">ID/Badge</p>
                      <img src={visitor.id_photo_url} className="w-full h-24 object-cover rounded border" alt="ID" />
                    </div>
                  )}
                </div>
              </DsSectionCard>
            )}

            <DsSectionCard title="Notes" className="p-4">
              <p className="text-sm italic text-muted-foreground">
                {visitor.notes || "No special instructions or notes logged for this visitor."}
              </p>
            </DsSectionCard>
          </div>
        </div>

        <UniversalModalFooter className="gap-2">
          <DsButton variant="ghost" onClick={printBadge}>
            <Download className="mr-2 h-4 w-4" /> Print Badge
          </DsButton>
          <div className="flex-1" />
          {isActive && (
            <DsButton variant="primary" onClick={() => checkoutVisitor.mutate(visitor.id)}>
              Check Out Now
            </DsButton>
          )}
          <DsButton variant="ghost" className="text-destructive hover:text-destructive" onClick={() => {
            if(confirm("Are you sure you want to delete this visitor record?")) {
              deleteVisitor.mutate(visitor.id);
            }
          }}>
            Delete Record
          </DsButton>
        </UniversalModalFooter>
      </div>
    );
  }

  function VisitorForm() {
    const [selectedSite, setSelectedSite] = useState<any>(null);
    const [f, setF] = useState({
      siteId: "", siteName: "", visitorName: "", visitorCompany: "", purpose: "",
      hostName: "", vehiclePlate: "", checkedInBy: user?.firstName || "",
      idPhotoUrl: "", vehicleFrontPhotoUrl: "", vehicleRearPhotoUrl: "", visitorPhotoUrl: "",
      expectedDeparture: "",
    });
    return (
      <div className="space-y-3">
        <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
        {selectedSite && <SelectedSiteInfo site={selectedSite} />}
        {!selectedSite && <Input placeholder="Site name *" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
        <Input data-testid="input-visitor-name" placeholder="Visitor name *" value={f.visitorName} onChange={e => setF(p => ({ ...p, visitorName: e.target.value }))} />
        <Input data-testid="input-visitor-company" placeholder="Company" value={f.visitorCompany} onChange={e => setF(p => ({ ...p, visitorCompany: e.target.value }))} />
        <Input data-testid="input-visitor-purpose" placeholder="Purpose of visit" value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} />
        <Input data-testid="input-visitor-host" placeholder="Host name" value={f.hostName} onChange={e => setF(p => ({ ...p, hostName: e.target.value }))} />
        <Input data-testid="input-visitor-vehicle" placeholder="Vehicle plate" value={f.vehiclePlate} onChange={e => setF(p => ({ ...p, vehiclePlate: e.target.value }))} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Expected Departure (optional)</label>
          <Input data-testid="input-expected-departure" type="datetime-local" value={f.expectedDeparture} onChange={e => setF(p => ({ ...p, expectedDeparture: e.target.value }))} />
        </div>
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Photo Capture</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PhotoCaptureField label="Visitor ID" photoUrl={f.idPhotoUrl} onCapture={url => setF(p => ({ ...p, idPhotoUrl: url }))} testId="id-photo" />
            <PhotoCaptureField label="Visitor Photo" photoUrl={f.visitorPhotoUrl} onCapture={url => setF(p => ({ ...p, visitorPhotoUrl: url }))} testId="visitor-photo" />
            <PhotoCaptureField label="Vehicle Front" photoUrl={f.vehicleFrontPhotoUrl} onCapture={url => setF(p => ({ ...p, vehicleFrontPhotoUrl: url }))} testId="vehicle-front" />
            <PhotoCaptureField label="Vehicle Rear" photoUrl={f.vehicleRearPhotoUrl} onCapture={url => setF(p => ({ ...p, vehicleRearPhotoUrl: url }))} testId="vehicle-rear" />
          </div>
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowCreateVisitor(false)}>Cancel</Button>
          <Button data-testid="button-submit-visitor" onClick={() => createVisitor.mutate(f)} disabled={(!f.siteName && !selectedSite) || !f.visitorName || createVisitor.isPending}>
            {createVisitor.isPending ? "Checking in…" : "Check In Visitor"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  function BOLOForm() {
    const [f, setF] = useState({ subjectName: "", subjectDob: "", subjectDescription: "", reason: "", expiresAt: "", createdByName: user?.firstName || "" });
    return (
      <div className="space-y-3">
        <Input placeholder="Subject full name *" value={f.subjectName} onChange={e => setF(p => ({ ...p, subjectName: e.target.value }))} />
        <Input type="date" placeholder="Date of birth" value={f.subjectDob} onChange={e => setF(p => ({ ...p, subjectDob: e.target.value }))} />
        <Textarea placeholder="Physical description" value={f.subjectDescription} onChange={e => setF(p => ({ ...p, subjectDescription: e.target.value }))} rows={2} />
        <Textarea placeholder="Reason for BOLO *" value={f.reason} onChange={e => setF(p => ({ ...p, reason: e.target.value }))} rows={2} />
        <Input type="date" placeholder="Expires on (leave blank = no expiry)" value={f.expiresAt} onChange={e => setF(p => ({ ...p, expiresAt: e.target.value }))} />
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowCreateBOLO(false)}>Cancel</Button>
          <Button onClick={() => createBOLO.mutate(f)} disabled={!f.subjectName || !f.reason || createBOLO.isPending}>
            {createBOLO.isPending ? "Creating…" : "Create BOLO Alert"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  function EvidenceCreateForm() {
    const [f, setF] = useState({ description: "", category: "", storageLocation: "", itemNumber: "", currentCustodianName: user?.firstName || "", caseId: "", status: "secured" });
    return (
      <div className="space-y-3">
        <Input placeholder="Item description *" value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Item number (e.g. E-001)" value={f.itemNumber} onChange={e => setF(p => ({ ...p, itemNumber: e.target.value }))} />
          <Select value={f.category} onValueChange={v => setF(p => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {["weapon","narcotics","document","electronic","clothing","cash","biological","other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Storage location" value={f.storageLocation} onChange={e => setF(p => ({ ...p, storageLocation: e.target.value }))} />
        <Input placeholder="Current custodian *" value={f.currentCustodianName} onChange={e => setF(p => ({ ...p, currentCustodianName: e.target.value }))} />
        <Input placeholder="Associated case ID (optional)" value={f.caseId} onChange={e => setF(p => ({ ...p, caseId: e.target.value }))} />
        <Select value={f.status} onValueChange={v => setF(p => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["secured","pending","transferred","released","destroyed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setShowCreateEvidence(false)}>Cancel</Button>
          <Button onClick={() => createEvidence.mutate(f)} disabled={!f.description || !f.currentCustodianName || createEvidence.isPending}>
            {createEvidence.isPending ? "Logging…" : "Log Evidence Item"}
          </Button>
        </UniversalModalFooter>
      </div>
    );
  }

  const statData = stats.data?.summary;

  const tabs = [
    { id: "incidents", label: "INCIDENTS", count: incidents.data?.incidents?.length },
    { id: "dars", label: "REPORTS", count: dars.data?.dars?.length },
    { id: "visitors", label: "VISITORS", count: visitors.data?.visitors?.length },
    { id: "cases", label: "CASES", count: cases.data?.cases?.length },
    { id: "keys", label: "KEYS", count: keys.data?.keys?.length },
    { id: "lostfound", label: "LOST & FOUND", count: lostFound.data?.items?.length },
    { id: "trespass", label: "TRESPASS", count: trespass.data?.notices?.length },
    { id: "bolo", label: "BOLO", count: bolos.data?.bolos?.length },
    { id: "evidence", label: "EVIDENCE", count: evidence.data?.evidence?.length },
    { id: "analytics", label: "ANALYTICS" },
  ];

  return (
    <DsPageWrapper className="flex gap-0 p-0" padding={false}>
      {/* Sidebar */}
      <div className="w-64 border-r border-[var(--ds-border)] bg-[var(--ds-navy)] sticky top-0 z-20 h-screen overflow-y-auto hidden md:block flex-shrink-0">
        <div className="p-6 space-y-8">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--ds-text-muted)] mb-4 uppercase" style={{ fontFamily: 'var(--ds-font-display)' }}>
              Operations
            </div>
            <div className="space-y-1">
              {tabs.slice(0, 3).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
                    activeTab === tab.id ? "bg-[var(--ds-navy-light)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-navy-mid)]"
                  )}
                  style={{ fontFamily: 'var(--ds-font-body)' }}
                >
                  <span className="font-medium">{tab.label}</span>
                  {tab.count !== undefined && <span className="text-[10px] opacity-60 font-mono">{tab.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--ds-text-muted)] mb-4 uppercase" style={{ fontFamily: 'var(--ds-font-display)' }}>
              Intelligence
            </div>
            <div className="space-y-1">
              {tabs.slice(3, 9).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
                    activeTab === tab.id ? "bg-[var(--ds-navy-light)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-navy-mid)]"
                  )}
                  style={{ fontFamily: 'var(--ds-font-body)' }}
                >
                  <span className="font-medium">{tab.label}</span>
                  {tab.count !== undefined && <span className="text-[10px] opacity-60 font-mono">{tab.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <DsSectionCard title="Emergency Action" className="mt-8 bg-[var(--ds-navy-mid)]/50 border-red-900/30">
            <p className="text-[11px] text-[var(--ds-text-muted)] mb-3 leading-relaxed">
              Immediate reporting for critical incidents. Auto-captures GPS and notifies command.
            </p>
            <DsButton 
              variant="danger" 
              className="w-full text-xs py-2"
              onClick={() => { setQuickTemplate("medical"); setShowCreateIncident(true); }}
            >
              Emergency Report
            </DsButton>
          </DsSectionCard>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 min-h-screen overflow-y-auto">
        <div className="p-4 sm:p-8">
          <DsPageHeader 
            title="RMS Intelligence Hub" 
            subtitle="Centralized Incident & Records Management"
            actions={
              <div className="flex items-center gap-2">
                <DsButton variant="primary" onClick={() => setShowCreateIncident(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Report
                </DsButton>
              </div>
            }
          />

          <ReportDisclaimer className="mb-6" />

          <div className="md:hidden mb-6 overflow-x-auto">
            <DsTabBar 
              tabs={tabs} 
              activeTab={activeTab} 
              onTabChange={setActiveTab} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <DsStatCard 
              label="Active Incidents" 
              value={statData?.openIncidents || 0} 
              icon={AlertTriangle} 
              color="danger" 
            />
            <DsStatCard 
              label="Reports Today" 
              value={statData?.darsToday || 0} 
              icon={FileText} 
              color="gold" 
            />
            <DsStatCard 
              label="Visitors Logged" 
              value={statData?.visitorsToday || 0} 
              icon={Users} 
              color="info" 
            />
            <DsStatCard 
              label="Active BOLOs" 
              value={statData?.activeBolos || 0} 
              icon={ShieldAlert} 
              color="warning" 
            />
          </div>

          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="hidden"> {/* Managed by Sidebar/DsTabBar */}
                <TabsList>
                  {tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
                </TabsList>
              </div>

              {activeTab === "visitors" && (
                <TabsContent value="visitors" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DsStatCard 
                      label="Active Now" 
                      value={visitorStats.data?.activeCount || 0} 
                      icon={Users} 
                      color="success" 
                    />
                    <DsStatCard 
                      label="Today Total" 
                      value={visitorStats.data?.todayCount || 0} 
                      icon={CheckCircle} 
                      color="info" 
                    />
                    <DsStatCard 
                      label="Overdue" 
                      value={visitorStats.data?.overdueCount || 0} 
                      icon={AlertOctagon} 
                      color={visitorStats.data?.overdueCount > 0 ? "danger" : "muted"} 
                    />
                  </div>

                  <DsSectionCard 
                    title="Visitor Management"
                    actions={
                      <div className="flex gap-2">
                        <DsButton variant="ghost" size="sm" onClick={() => setShowPreRegisterVisitor(true)}>
                          Pre-Register
                        </DsButton>
                        <DsButton variant="primary" size="sm" onClick={() => setShowCreateVisitor(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Check In
                        </DsButton>
                      </div>
                    }
                  >
                    <div className="mb-6 flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search visitor, company, or host..." 
                          className="pl-9"
                          value={visitorSearch}
                          onChange={(e) => setVisitorSearch(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1 bg-muted/30 p-1 rounded-md">
                        {["all", "active", "checked_out"].map((f) => (
                          <Button
                            key={f}
                            variant={visitorFilter === f ? "secondary" : "ghost"}
                            size="sm"
                            className="text-[10px] h-7 px-3 uppercase tracking-wider font-bold"
                            onClick={() => setVisitorFilter(f)}
                          >
                            {f.replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--ds-border)] -mx-5 -mb-5">
                      {visitors.data?.visitors?.map((vis: any) => {
                        const isOverdue = vis.expected_departure && !vis.checked_out_at && new Date(vis.expected_departure) < new Date();
                        const isActive = !vis.checked_out_at;
                        
                        return (
                          <DsDataRow 
                            key={vis.id} 
                            data-testid={`card-visitor-${vis.id}`}
                            className="flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                isActive ? (isOverdue ? "bg-amber-500 animate-pulse" : "bg-emerald-500") : "bg-zinc-600"
                              )} />
                              <div className="min-w-0">
                                <div className="font-bold text-[var(--ds-text-primary)] truncate">
                                  {vis.visitor_name}
                                </div>
                                <div className="text-xs text-[var(--ds-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                  {vis.visitor_company && <span className="font-medium text-[var(--ds-text-secondary)]">{vis.visitor_company}</span>}
                                  {vis.visitor_company && <span>•</span>}
                                  <span>Host: {vis.host_name || "N/A"}</span>
                                  <span>•</span>
                                  <span className="truncate">{vis.site_name}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
                              <div className="text-right hidden sm:block mr-2">
                                <div className="text-[10px] text-[var(--ds-text-muted)] font-medium uppercase">Checked In</div>
                                <div className="text-xs font-mono">{timeAgo(vis.checked_in_at)}</div>
                              </div>
                              
                              <DsBadge color={isActive ? (isOverdue ? "warning" : "success") : "muted"}>
                                {isActive ? (isOverdue ? "Overdue" : "Active") : "Checked Out"}
                              </DsBadge>

                              <div className="flex gap-2">
                                <DsButton variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowVisitorDetail(vis)}>
                                  <Eye className="h-4 w-4 mr-1" /> Details
                                </DsButton>
                                {isActive && (
                                  <DsButton variant="outline" size="sm" className="h-8 px-2 border-emerald-900/30 hover:bg-emerald-900/10" onClick={() => checkoutVisitor.mutate(vis.id)}>
                                    <Check className="h-4 w-4 mr-1" /> Out
                                  </DsButton>
                                )}
                              </div>
                            </div>
                          </DsDataRow>
                        );
                      })}
                      
                      {(!visitors.data?.visitors || visitors.data.visitors.length === 0) && (
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        <DsEmptyState 
                          icon={Users} 
                          title="No Visitors Found" 
                          subtitle="No visitor records matching your current filter."
                        />
                      )}
                    </div>
                  </DsSectionCard>
                </TabsContent>
              )}

              {activeTab === "visitors" && (
                <TabsContent value="visitors" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DsStatCard 
                      label="Active Now" 
                      value={visitorStats.data?.activeCount || 0} 
                      icon={Users} 
                      color="success" 
                    />
                    <DsStatCard 
                      label="Today Total" 
                      value={visitorStats.data?.todayCount || 0} 
                      icon={CheckCircle} 
                      color="info" 
                    />
                    <DsStatCard 
                      label="Overdue" 
                      value={visitorStats.data?.overdueCount || 0} 
                      icon={AlertOctagon} 
                      color={visitorStats.data?.overdueCount > 0 ? "danger" : "muted"} 
                    />
                  </div>

                  <DsSectionCard 
                    title="Visitor Management"
                    actions={
                      <div className="flex gap-2">
                        <DsButton variant="ghost" size="sm" onClick={() => setShowPreRegisterVisitor(true)}>
                          Pre-Register
                        </DsButton>
                        <DsButton variant="primary" size="sm" onClick={() => setShowCreateVisitor(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Check In
                        </DsButton>
                      </div>
                    }
                  >
                    <div className="mb-6 flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search visitor, company, or host..." 
                          className="pl-9"
                          value={visitorSearch}
                          onChange={(e) => setVisitorSearch(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1 bg-muted/30 p-1 rounded-md">
                        {["all", "active", "checked_out"].map((f) => (
                          <Button
                            key={f}
                            variant={visitorFilter === f ? "secondary" : "ghost"}
                            size="sm"
                            className="text-[10px] h-7 px-3 uppercase tracking-wider font-bold"
                            onClick={() => setVisitorFilter(f)}
                          >
                            {f.replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--ds-border)] -mx-5 -mb-5">
                      {visitors.data?.visitors?.map((vis: any) => {
                        const isOverdue = vis.expected_departure && !vis.checked_out_at && new Date(vis.expected_departure) < new Date();
                        const isActive = !vis.checked_out_at;
                        
                        return (
                          <DsDataRow 
                            key={vis.id} 
                            data-testid={`card-visitor-${vis.id}`}
                            className="flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                isActive ? (isOverdue ? "bg-amber-500 animate-pulse" : "bg-emerald-500") : "bg-zinc-600"
                              )} />
                              <div className="min-w-0">
                                <div className="font-bold text-[var(--ds-text-primary)] truncate">
                                  {vis.visitor_name}
                                </div>
                                <div className="text-xs text-[var(--ds-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                  {vis.visitor_company && <span className="font-medium text-[var(--ds-text-secondary)]">{vis.visitor_company}</span>}
                                  {vis.visitor_company && <span>•</span>}
                                  <span>Host: {vis.host_name || "N/A"}</span>
                                  <span>•</span>
                                  <span className="truncate">{vis.site_name}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
                              <div className="text-right hidden sm:block mr-2">
                                <div className="text-[10px] text-[var(--ds-text-muted)] font-medium uppercase">Checked In</div>
                                <div className="text-xs font-mono">{timeAgo(vis.checked_in_at)}</div>
                              </div>
                              
                              <DsBadge color={isActive ? (isOverdue ? "warning" : "success") : "muted"}>
                                {isActive ? (isOverdue ? "Overdue" : "Active") : "Checked Out"}
                              </DsBadge>

                              <div className="flex gap-2">
                                <DsButton variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowVisitorDetail(vis)}>
                                  <Eye className="h-4 w-4 mr-1" /> Details
                                </DsButton>
                                {isActive && (
                                  <DsButton variant="outline" size="sm" className="h-8 px-2 border-emerald-900/30 hover:bg-emerald-900/10" onClick={() => checkoutVisitor.mutate(vis.id)}>
                                    <Check className="h-4 w-4 mr-1" /> Out
                                  </DsButton>
                                )}
                              </div>
                            </div>
                          </DsDataRow>
                        );
                      })}
                      
                      {(!visitors.data?.visitors || visitors.data.visitors.length === 0) && (
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        <DsEmptyState 
                          icon={Users} 
                          title="No Visitors Found" 
                          subtitle="No visitor records matching your current filter."
                        />
                      )}
                    </div>
                  </DsSectionCard>
                </TabsContent>
              )}

              {activeTab === "incidents" && (
                <TabsContent value="incidents" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <DsSectionCard 
                        title="Live Incident Feed"
                        actions={
                          <div className="flex gap-1">
                            {["slip-fall", "theft", "medical", "trespass"].map(t => (
                              <DsButton key={t} variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => { setQuickTemplate(t); setShowCreateIncident(true); }}>
                                {t.replace("-", " ")}
                              </DsButton>
                            ))}
                          </div>
                        }
                      >
                        <div className="divide-y divide-[var(--ds-border)] -mx-5 -mb-5">
                          {incidents.data?.incidents?.map((inc: any) => (
                            <DsDataRow 
                              key={inc.id} 
                              interactive 
                              onClick={() => setViewIncident(inc)}
                              className="flex-col sm:flex-row sm:items-center justify-between gap-4"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-2 h-2 rounded-full",
                                  inc.priority === "critical" ? "bg-red-500 animate-pulse" : "bg-blue-500"
                                )} />
                                <div>
                                  <div className="font-bold text-[var(--ds-text-primary)]" style={{ fontFamily: 'var(--ds-font-display)' }}>
                                    {inc.report_number}
                                  </div>
                                  <div className="text-xs text-[var(--ds-text-muted)] flex items-center gap-2 mt-0.5">
                                    <span className="font-mono uppercase text-[10px]">{inc.category?.replace(/_/g, " ")}</span>
                                    <span>•</span>
                                    <span className="truncate max-w-[150px]">{inc.site_name}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 self-end sm:self-center">
                                <DsBadge color={PRIORITY_COLORS[inc.priority] || "muted"}>
                                  {inc.priority}
                                </DsBadge>
                                <DsBadge color={STATUS_COLORS[inc.status] || "muted"}>
                                  {inc.status}
                                </DsBadge>
                                <div className="text-[10px] text-[var(--ds-text-muted)] font-medium">
                                  {timeAgo(inc.occurred_at)}
                                </div>
                              </div>
                            </DsDataRow>
                          ))}
                          {(!incidents.data?.incidents || incidents.data.incidents.length === 0) && (
                            // @ts-expect-error — TS migration: fix in refactoring sprint
                            <DsEmptyState 
                              icon={AlertTriangle} 
                              title="No Active Incidents" 
                              subtitle="Everything is calm. All reported incidents have been resolved."
                            />
                          )}
                        </div>
                      </DsSectionCard>
                    </div>
                    <div className="lg:col-span-1">
                      <QuickSubmitIncident workspaceId={workspaceId} onComplete={() => invalidateAll()} />
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* Simplified other tabs for visual consistency */}
      {activeTab !== "incidents" && activeTab !== "visitors" && (
                <TabsContent value={activeTab} className="m-0">
                  <DsSectionCard title={tabs.find(t => t.id === activeTab)?.label}>
                    // @ts-ignore — TS migration: fix in refactoring sprint
                    <DsEmptyState 
                      icon={FileText} 
                      title={`${tabs.find(t => t.id === activeTab)?.label} Module`}
                      subtitle="Module visualization updated to dark theme."
                    />
                  </DsSectionCard>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>
      {/* ── DIALOGS ── */}
      <UniversalModal open={showCreateIncident} onOpenChange={setShowCreateIncident}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>New Incident Report</UniversalModalTitle></UniversalModalHeader>
          <IncidentForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateDAR} onOpenChange={setShowCreateDAR}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Submit Daily Activity Report</UniversalModalTitle></UniversalModalHeader>
          <DARForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateVisitor} onOpenChange={setShowCreateVisitor}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Check In Visitor</UniversalModalTitle></UniversalModalHeader>
          <VisitorForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showPreRegisterVisitor} onOpenChange={setShowPreRegisterVisitor}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Pre-Register Visitor</UniversalModalTitle></UniversalModalHeader>
          <PreRegisterForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!showVisitorDetail} onOpenChange={v => { if(!v) setShowVisitorDetail(null); }}>
        <UniversalModalContent className="max-w-4xl">
          <UniversalModalHeader><UniversalModalTitle>Visitor Details</UniversalModalTitle></UniversalModalHeader>
          <VisitorDetailView visitor={showVisitorDetail} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateCase} onOpenChange={setShowCreateCase}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Create Case</UniversalModalTitle></UniversalModalHeader>
          <div className="space-y-3">
            <CaseForm onSubmit={(d) => createCase.mutate(d)} onCancel={() => setShowCreateCase(false)} isPending={createCase.isPending} workspaceId={workspaceId} />
          </div>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateKey} onOpenChange={setShowCreateKey}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Check Out Key</UniversalModalTitle></UniversalModalHeader>
          <KeyForm onSubmit={(d) => createKey.mutate(d)} onCancel={() => setShowCreateKey(false)} isPending={createKey.isPending} workspaceId={workspaceId} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateLF} onOpenChange={setShowCreateLF}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Log Lost & Found Item</UniversalModalTitle></UniversalModalHeader>
          <LFForm onSubmit={(d) => createLF.mutate(d)} onCancel={() => setShowCreateLF(false)} isPending={createLF.isPending} workspaceId={workspaceId} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateTrespass} onOpenChange={setShowCreateTrespass}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Issue Trespass Notice</UniversalModalTitle></UniversalModalHeader>
          <TrespassForm onSubmit={(d) => createTrespass.mutate(d)} onCancel={() => setShowCreateTrespass(false)} isPending={createTrespass.isPending} workspaceId={workspaceId} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateBOLO} onOpenChange={setShowCreateBOLO}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Create BOLO Alert</UniversalModalTitle></UniversalModalHeader>
          <BOLOForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCreateEvidence} onOpenChange={setShowCreateEvidence}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Log Evidence Item</UniversalModalTitle></UniversalModalHeader>
          <EvidenceCreateForm />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!viewAuditTrail} onOpenChange={v => { if (!v) setViewAuditTrail(null); }}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader><UniversalModalTitle>Report Audit Trail</UniversalModalTitle></UniversalModalHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {auditTrailDetail.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading audit trail...</p>
            ) : !auditTrailDetail.data?.trail?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No audit events recorded yet.</p>
                <p className="text-xs mt-1">Opens, downloads, prints, and shares will appear here.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 p-3 bg-muted/50 rounded-md">
                  <div className="text-center">
                    <p className="text-lg font-semibold" data-testid="text-audit-open-count">{auditTrailDetail.data.summary.openCount}</p>
                    <p className="text-xs text-muted-foreground">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold" data-testid="text-audit-download-count">{auditTrailDetail.data.summary.downloadCount}</p>
                    <p className="text-xs text-muted-foreground">Downloads</p>
                  </div>
                  {auditTrailDetail.data.summary.lastOpened && (
                    <div className="text-center">
                      <p className="text-xs font-medium">{timeAgo(auditTrailDetail.data.summary.lastOpened)}</p>
                      <p className="text-xs text-muted-foreground">Last Viewed</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {auditTrailDetail.data.trail.map((entry: any, i: number) => (
                    <div key={entry.id || i} data-testid={`row-audit-${entry.id}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {entry.action === 'opened' && <Eye className="h-3 w-3 text-primary" />}
                          {entry.action === 'downloaded' && <Download className="h-3 w-3 text-primary" />}
                          {entry.action === 'printed' && <FileText className="h-3 w-3 text-primary" />}
                          {entry.action === 'shared' && <ArrowRightLeft className="h-3 w-3 text-primary" />}
                          {entry.action === 'exported' && <FileText className="h-3 w-3 text-primary" />}
                        </div>
                        {i < auditTrailDetail.data.trail.length - 1 && <div className="w-0.5 bg-border flex-1 mt-1 mb-1" />}
                      </div>
                      <div className="pb-3 min-w-0">
                        <p className="text-xs font-medium capitalize">{entry.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.actor_name || entry.actorName || "Unknown"} · {timeAgo(entry.created_at || entry.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => setViewAuditTrail(null)}>Close</Button>
            </UniversalModalFooter>
          </div>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!viewIncident} onOpenChange={v => !v && setViewIncident(null)}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader><UniversalModalTitle>Incident Report — {viewIncident?.report_number}</UniversalModalTitle></UniversalModalHeader>
          {viewIncident && (
            <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={(PRIORITY_COLORS[viewIncident.priority] || "outline") as any}>{viewIncident.priority}</Badge>
                <Badge variant={(STATUS_COLORS[viewIncident.status] || "outline") as any}>{viewIncident.status}</Badge>
                <span className="text-muted-foreground">{viewIncident.category?.replace(/_/g, " ")}</span>
              </div>
              <p className="font-semibold text-base">{viewIncident.title}</p>
              <p className="text-muted-foreground text-xs">{timeAgo(viewIncident.occurred_at)} · {viewIncident.location_description || viewIncident.site_name || "On premises"}</p>
              {viewIncident.narrative && (
                <div>
                  <p className="font-medium mb-1">Original Narrative</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{viewIncident.narrative}</p>
                </div>
              )}
              {viewIncident.ai_narrative && (
                <div>
                  <p className="font-medium mb-1 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />AI-Polished Narrative</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{viewIncident.ai_narrative}</p>
                  <TranslationDisclaimer compact className="mt-2" />
                </div>
              )}
              <UniversalModalFooter>
                <Button variant="outline" onClick={() => polishNarrative.mutate(viewIncident.id)} disabled={polishNarrative.isPending}>
                  <Sparkles className="mr-2 h-4 w-4" />{polishNarrative.isPending ? "Polishing…" : "Polish with AI"}
                </Button>
                <Button
                  variant="outline"
                  data-testid={`button-download-incident-narrative-${viewIncident.id}`}
                  onClick={() => window.open(`/api/rms/incidents/${viewIncident.id}/narrative-download`, '_blank')}
                >
                  <Download className="mr-2 h-4 w-4" />Download Narrative
                </Button>
                <Button onClick={() => setViewIncident(null)}>Close</Button>
              </UniversalModalFooter>
            </div>
          )}
        </UniversalModalContent>
      </UniversalModal>

      // @ts-ignore — TS migration: fix in refactoring sprint
      <QuickIncidentReportFAB workspaceId={workspaceId} />
    </DsPageWrapper>
  );
}

function CaseForm({ onSubmit, onCancel, isPending, workspaceId }: { onSubmit: (d: any) => void; onCancel: () => void; isPending: boolean; workspaceId: string | undefined }) {
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [f, setF] = useState({ title: "", category: "investigation", priority: "medium", description: "", siteName: "", siteId: "", assignedToName: "" });
  return (
    <div className="space-y-3">
      <Input placeholder="Case title *" value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <Select value={f.category} onValueChange={v => setF(p => ({ ...p, category: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["investigation","theft","fraud","assault","vandalism","other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.priority} onValueChange={v => setF(p => ({ ...p, priority: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["low","medium","high","critical"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
      {selectedSite && <SelectedSiteInfo site={selectedSite} />}
      {!selectedSite && <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
      <Input placeholder="Assigned investigator" value={f.assignedToName} onChange={e => setF(p => ({ ...p, assignedToName: e.target.value }))} />
      <Textarea placeholder="Description" value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
      <UniversalModalFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.title || isPending}>{isPending ? "Creating…" : "Create Case"}</Button>
      </UniversalModalFooter>
    </div>
  );
}

function KeyForm({ onSubmit, onCancel, isPending, workspaceId }: { onSubmit: (d: any) => void; onCancel: () => void; isPending: boolean; workspaceId: string | undefined }) {
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [f, setF] = useState({ keyIdentifier: "", keyDescription: "", checkedOutByName: "", purpose: "", siteName: "", siteId: "" });
  return (
    <div className="space-y-3">
      <Input placeholder="Key ID / label *" value={f.keyIdentifier} onChange={e => setF(p => ({ ...p, keyIdentifier: e.target.value }))} />
      <Input placeholder="Key description" value={f.keyDescription} onChange={e => setF(p => ({ ...p, keyDescription: e.target.value }))} />
      <Input placeholder="Checked out by *" value={f.checkedOutByName} onChange={e => setF(p => ({ ...p, checkedOutByName: e.target.value }))} />
      <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
      {selectedSite && <SelectedSiteInfo site={selectedSite} />}
      {!selectedSite && <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
      <Input placeholder="Purpose" value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} />
      <UniversalModalFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.keyIdentifier || !f.checkedOutByName || isPending}>{isPending ? "Logging…" : "Check Out Key"}</Button>
      </UniversalModalFooter>
    </div>
  );
}

function LFForm({ onSubmit, onCancel, isPending, workspaceId }: { onSubmit: (d: any) => void; onCancel: () => void; isPending: boolean; workspaceId: string | undefined }) {
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [f, setF] = useState({ description: "", category: "", foundLocation: "", foundByName: "", siteName: "", siteId: "", storageLocation: "" });
  return (
    <div className="space-y-3">
      <Input placeholder="Item description *" value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
      <Input placeholder="Category (e.g. electronics, clothing)" value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} />
      <Input placeholder="Found at location" value={f.foundLocation} onChange={e => setF(p => ({ ...p, foundLocation: e.target.value }))} />
      <Input placeholder="Found by (officer name)" value={f.foundByName} onChange={e => setF(p => ({ ...p, foundByName: e.target.value }))} />
      <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
      {selectedSite && <SelectedSiteInfo site={selectedSite} />}
      {!selectedSite && <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
      <Input placeholder="Storage location" value={f.storageLocation} onChange={e => setF(p => ({ ...p, storageLocation: e.target.value }))} />
      <UniversalModalFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.description || isPending}>{isPending ? "Logging…" : "Log Item"}</Button>
      </UniversalModalFooter>
    </div>
  );
}

function TrespassForm({ onSubmit, onCancel, isPending, workspaceId }: { onSubmit: (d: any) => void; onCancel: () => void; isPending: boolean; workspaceId: string | undefined }) {
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [f, setF] = useState({ subjectName: "", reason: "", siteName: "", siteId: "", issuedByName: "", isPermanent: false, policeNotified: false });
  return (
    <div className="space-y-3">
      <Input placeholder="Subject full name *" value={f.subjectName} onChange={e => setF(p => ({ ...p, subjectName: e.target.value }))} />
      <SiteSelector workspaceId={workspaceId} onSelect={s => { setSelectedSite(s); setF(p => ({ ...p, siteId: s.id, siteName: s.name })); }} />
      {selectedSite && <SelectedSiteInfo site={selectedSite} />}
      {!selectedSite && <Input placeholder="Site name" value={f.siteName} onChange={e => setF(p => ({ ...p, siteName: e.target.value }))} />}
      <Input placeholder="Issued by (officer)" value={f.issuedByName} onChange={e => setF(p => ({ ...p, issuedByName: e.target.value }))} />
      <Textarea placeholder="Reason for trespass notice *" value={f.reason} onChange={e => setF(p => ({ ...p, reason: e.target.value }))} />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.isPermanent} onChange={e => setF(p => ({ ...p, isPermanent: e.target.checked }))} /> Permanent</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.policeNotified} onChange={e => setF(p => ({ ...p, policeNotified: e.target.checked }))} /> Police notified</label>
      </div>
      <UniversalModalFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.subjectName || !f.reason || isPending}>{isPending ? "Issuing…" : "Issue Notice"}</Button>
      </UniversalModalFooter>
    </div>
  );
}

function EvidenceTransferForm({ evidenceId, onTransfer, isPending }: {
  evidenceId: string;
  onTransfer: (data: any) => void;
  isPending: boolean;
}) {
  const [f, setF] = useState({ transferredFromName: "", transferredToName: "", method: "handoff", notes: "", policeCaseNumber: "" });
  const canSubmit = f.transferredFromName && f.transferredToName;
  return (
    <div className="space-y-2 p-3 rounded-md bg-muted/30 border">
      <p className="text-xs font-medium text-muted-foreground">Transfer Custody</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-8 text-xs" placeholder="From (current custodian) *" value={f.transferredFromName} onChange={e => setF(p => ({ ...p, transferredFromName: e.target.value }))} />
        <Input className="h-8 text-xs" placeholder="To (new custodian) *" value={f.transferredToName} onChange={e => setF(p => ({ ...p, transferredToName: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={f.method} onValueChange={v => setF(p => ({ ...p, method: v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["handoff","mail","police_transfer","court_submission","destruction","other"].map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-8 text-xs" placeholder="Police case # (if applicable)" value={f.policeCaseNumber} onChange={e => setF(p => ({ ...p, policeCaseNumber: e.target.value }))} />
      </div>
      <Input className="h-8 text-xs" placeholder="Transfer notes" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
      <Button size="sm" className="w-full" onClick={() => { onTransfer(f); setF({ transferredFromName: "", transferredToName: "", method: "handoff", notes: "", policeCaseNumber: "" }); }} disabled={!canSubmit || isPending}>
        {isPending ? "Transferring…" : "Record Transfer"}
      </Button>
    </div>
  );
}
