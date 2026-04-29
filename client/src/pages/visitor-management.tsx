import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  UniversalModal, UniversalModalContent, UniversalModalHeader,
  UniversalModalTitle, UniversalModalDescription, UniversalModalFooter,
} from "@/components/ui/universal-modal";
import {
  Users, UserPlus, ClipboardList, History, Clock, AlertTriangle,
  CheckCircle2, LogOut, Shield, Search, RefreshCw, Loader2, UserCheck,
  Ban, CalendarPlus,
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: 'visitor-management',
  category: 'operations',
  title: 'Visitor Management',
  subtitle: 'Corporate post visitor logging, pre-registration, and overstay monitoring',
};

const VISITOR_TYPES = [
  { value: 'guest', label: 'Guest' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'employee', label: 'Employee (External)' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'law_enforcement', label: 'Law Enforcement' },
  { value: 'other', label: 'Other' },
];

function visitorTypeBadge(type: string) {
  const map: Record<string, string> = {
    guest: 'bg-blue-500/10 text-blue-600 border-0',
    vendor: 'bg-purple-500/10 text-purple-600 border-0',
    contractor: 'bg-amber-500/10 text-amber-600 border-0',
    employee: 'bg-green-500/10 text-green-600 border-0',
    delivery: 'bg-orange-500/10 text-orange-600 border-0',
    law_enforcement: 'bg-indigo-500/10 text-indigo-600 border-0',
    other: '',
  };
  const label = VISITOR_TYPES.find(t => t.value === type)?.label || type;
  return <Badge variant="secondary" className={map[type] || ''}>{label}</Badge>;
}

function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// =============================================================================
// ACTIVE VISITORS BOARD
// =============================================================================
function ActiveVisitorsBoard({ onCheckout }: { onCheckout: (id: string) => void }) {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/visitor-management/active'],
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const activeVisitors: any[] = data?.activeVisitors || [];
  const bySite: Record<string, any[]> = data?.bySite || {};

  if (activeVisitors.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground" data-testid="empty-active-visitors">
        <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No visitors currently on-site</p>
        <p className="text-sm mt-1">Checked-in visitors will appear here with live elapsed time</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="active-visitors-board">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{activeVisitors.length} visitor{activeVisitors.length !== 1 ? 's' : ''} currently on-site</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-active">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>
      {Object.entries(bySite).map(([site, visitors]) => (
        <div key={site} className="space-y-2" data-testid={`group-site-${site.replace(/\s/g, '-')}`}>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{site}</p>
            <Badge variant="secondary" className="text-xs">{visitors.length}</Badge>
          </div>
          <div className="space-y-2">
            {visitors.map((v: any) => (
              <div
                key={v.id}
                className={['p-3 rounded-md border flex items-center justify-between gap-3 flex-wrap', v.isOverstay ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''].join(' ')}
                data-testid={`card-active-visitor-${v.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{v.visitor_name}</p>
                    {v.visitor_company && <p className="text-xs text-muted-foreground">{v.visitor_company}</p>}
                    {v.visitor_type && visitorTypeBadge(v.visitor_type)}
                    {v.is_banned && (
                      <Badge variant="destructive" className="text-xs">
                        <Ban className="h-3 w-3 mr-1" /> Flagged
                      </Badge>
                    )}
                    {v.is_fast_track && (
                      <Badge variant="outline" className="text-xs border-green-400 text-green-600">
                        <UserCheck className="h-3 w-3 mr-1" /> Pre-Reg
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {v.host_name && <span>Host: {v.host_name}</span>}
                    {v.purpose && <span>Purpose: {v.purpose}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatElapsed(Math.floor((Date.now() - new Date(v.checked_in_at).getTime()) / 60_000))}
                    </span>
                    {v.isOverstay && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> Overstay
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCheckout(v.id)}
                  data-testid={`button-checkout-${v.id}`}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" /> Check Out
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// CHECK-IN FORM
// =============================================================================
function CheckInForm({ preRegistrations, onSuccess }: { preRegistrations: any[]; onSuccess: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const emptyForm = {
    visitorName: '', visitorCompany: '', visitorType: 'guest',
    visitorIdType: '', visitorIdNumber: '', visitorBadgeNumber: '',
    visitorPhotoUrl: '', idPhotoUrl: '',
    hostName: '', hostContact: '', purpose: '',
    siteName: '', siteId: '',
    vehiclePlate: '', vehicleDescription: '',
    expectedDeparture: '', notes: '',
    preRegistrationId: '',
  };
  const [form, setForm] = useState(emptyForm);
  const set = (k: keyof typeof emptyForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/visitor-management/checkin', {
      ...form,
      expectedDeparture: form.expectedDeparture || undefined,
      preRegistrationId: form.preRegistrationId || undefined,
    }),
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      const isBanned = data?.isBanned;
      toast({
        title: isBanned ? 'WARNING: Banned Visitor Detected' : 'Visitor Checked In',
        description: isBanned
          ? `${form.visitorName} is on the trespass registry. Supervisor notified.`
          : `${form.visitorName} has been logged at ${form.siteName}.`,
        variant: isBanned ? 'destructive' : 'default',
      });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/active'] });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/logs'] });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/pre-registrations'] });
      setForm(emptyForm);
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: 'Check-in Failed', description: err.message, variant: 'destructive' });
    },
  });

  const pendingPreRegs = preRegistrations.filter(p => p.status === 'pending');

  const applyPreReg = (id: string) => {
    const p = pendingPreRegs.find(r => r.id === id);
    if (!p) return;
    setForm(prev => ({
      ...prev,
      preRegistrationId: id,
      visitorName: p.expected_visitor_name || '',
      visitorCompany: p.expected_visitor_company || '',
      visitorType: p.visitor_type || 'guest',
      hostName: p.host_name || '',
      hostContact: p.host_contact || '',
      siteName: p.site_name || '',
      siteId: p.site_id || '',
      purpose: p.reason || '',
      expectedDeparture: p.expected_departure ? new Date(p.expected_departure).toISOString().slice(0, 16) : '',
    }));
  };

  return (
    <div className="space-y-6">
      {pendingPreRegs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" /> Fast-Track from Pre-Registration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingPreRegs.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-2 rounded-md border flex-wrap" data-testid={`card-prereg-fasttrack-${p.id}`}>
                  <div className="text-sm">
                    <p className="font-medium">{p.expected_visitor_name}</p>
                    <p className="text-xs text-muted-foreground">{p.site_name} · {new Date(p.expected_arrival).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => applyPreReg(p.id)} data-testid={`button-apply-prereg-${p.id}`}>
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Use
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="visitorName">Visitor Name <span className="text-destructive">*</span></Label>
          <Input id="visitorName" value={form.visitorName} onChange={e => set('visitorName', e.target.value)} placeholder="Jane Smith" data-testid="input-visitor-name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="visitorCompany">Company</Label>
          <Input id="visitorCompany" value={form.visitorCompany} onChange={e => set('visitorCompany', e.target.value)} placeholder="Acme Corp" data-testid="input-visitor-company" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Visitor Type</Label>
          <Select value={form.visitorType} onValueChange={v => set('visitorType', v)}>
            <SelectTrigger data-testid="select-visitor-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISITOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="siteName">Post / Site Name <span className="text-destructive">*</span></Label>
          <Input id="siteName" value={form.siteName} onChange={e => set('siteName', e.target.value)} placeholder="Main Lobby" data-testid="input-site-name" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hostName">Host Name</Label>
          <Input id="hostName" value={form.hostName} onChange={e => set('hostName', e.target.value)} placeholder="John Doe" data-testid="input-host-name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hostContact">Host Contact (Phone/Email)</Label>
          <Input id="hostContact" value={form.hostContact} onChange={e => set('hostContact', e.target.value)} placeholder="555-0100 or host@company.com" data-testid="input-host-contact" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="purpose">Purpose / Reason</Label>
        <Input id="purpose" value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Meeting with IT team" data-testid="input-purpose" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="visitorPhotoUrl">Visitor Photo URL</Label>
          <Input id="visitorPhotoUrl" value={form.visitorPhotoUrl} onChange={e => set('visitorPhotoUrl', e.target.value)} placeholder="https://..." data-testid="input-visitor-photo-url" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="idPhotoUrl">ID Photo URL</Label>
          <Input id="idPhotoUrl" value={form.idPhotoUrl} onChange={e => set('idPhotoUrl', e.target.value)} placeholder="https://..." data-testid="input-id-photo-url" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="visitorIdType">ID Type</Label>
          <Input id="visitorIdType" value={form.visitorIdType} onChange={e => set('visitorIdType', e.target.value)} placeholder="Driver's License" data-testid="input-visitor-id-type" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="visitorIdNumber">ID Number</Label>
          <Input id="visitorIdNumber" value={form.visitorIdNumber} onChange={e => set('visitorIdNumber', e.target.value)} placeholder="DL-12345678" data-testid="input-visitor-id-number" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="visitorBadgeNumber">Badge Number</Label>
          <Input id="visitorBadgeNumber" value={form.visitorBadgeNumber} onChange={e => set('visitorBadgeNumber', e.target.value)} placeholder="V-001" data-testid="input-badge-number" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expectedDeparture">Expected Departure</Label>
          <Input id="expectedDeparture" type="datetime-local" value={form.expectedDeparture} onChange={e => set('expectedDeparture', e.target.value)} data-testid="input-expected-departure" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." data-testid="input-checkin-notes" />
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.visitorName || !form.siteName} data-testid="button-checkin-submit" className="w-full">
        {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
        {mutation.isPending ? 'Checking In...' : 'Check In Visitor'}
      </Button>
    </div>
  );
}

// =============================================================================
// PRE-REGISTRATION LIST
// =============================================================================
function PreRegistrationList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const emptyForm = {
    expectedVisitorName: '', expectedVisitorCompany: '', visitorType: 'guest',
    siteName: '', expectedArrival: '', expectedDeparture: '',
    hostName: '', hostContact: '', reason: '',
  };
  const [form, setForm] = useState(emptyForm);
  const set = (k: keyof typeof emptyForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/visitor-management/pre-registrations'],
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/visitor-management/pre-registrations', {
      ...form,
      expectedArrival: form.expectedArrival || undefined,
      expectedDeparture: form.expectedDeparture || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'Pre-Registration Created', description: `${form.expectedVisitorName} has been pre-registered.` });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/pre-registrations'] });
      setForm(emptyForm);
      setShowForm(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest('PATCH', `/api/visitor-management/pre-registrations/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      toast({ title: 'Pre-Registration Cancelled' });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/pre-registrations'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const preRegs: any[] = data?.preRegistrations || [];

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-blue-500/10 text-blue-600 border-0',
      checked_in: 'bg-green-500/10 text-green-600 border-0',
      completed: 'bg-muted text-muted-foreground border-0',
      cancelled: 'bg-rose-500/10 text-rose-600 border-0',
    };
    return <Badge variant="secondary" className={map[s] || ''}>{s.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{preRegs.length} pre-registration{preRegs.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-prereg">
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Pre-Register Visitor
        </Button>
      </div>

      <UniversalModal open={showForm} onOpenChange={setShowForm}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Pre-Register Expected Visitor</UniversalModalTitle>
            <UniversalModalDescription>Schedule a visitor arrival in advance for fast-track check-in</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Visitor Name <span className="text-destructive">*</span></Label>
                <Input value={form.expectedVisitorName} onChange={e => set('expectedVisitorName', e.target.value)} placeholder="Jane Smith" data-testid="input-prereg-name" />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={form.expectedVisitorCompany} onChange={e => set('expectedVisitorCompany', e.target.value)} placeholder="Acme Corp" data-testid="input-prereg-company" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Visitor Type</Label>
                <Select value={form.visitorType} onValueChange={v => set('visitorType', v)}>
                  <SelectTrigger data-testid="select-prereg-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISITOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Post / Site Name <span className="text-destructive">*</span></Label>
                <Input value={form.siteName} onChange={e => set('siteName', e.target.value)} placeholder="Main Lobby" data-testid="input-prereg-site" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expected Arrival <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={form.expectedArrival} onChange={e => set('expectedArrival', e.target.value)} data-testid="input-prereg-arrival" />
              </div>
              <div className="space-y-2">
                <Label>Expected Departure</Label>
                <Input type="datetime-local" value={form.expectedDeparture} onChange={e => set('expectedDeparture', e.target.value)} data-testid="input-prereg-departure" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host Name</Label>
                <Input value={form.hostName} onChange={e => set('hostName', e.target.value)} placeholder="John Doe" data-testid="input-prereg-host" />
              </div>
              <div className="space-y-2">
                <Label>Host Contact</Label>
                <Input value={form.hostContact} onChange={e => set('hostContact', e.target.value)} placeholder="555-0100" data-testid="input-prereg-host-contact" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Purpose of visit..." data-testid="input-prereg-reason" />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-prereg-cancel">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.expectedVisitorName || !form.siteName || !form.expectedArrival} data-testid="button-prereg-submit">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
              Pre-Register
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : preRegs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="empty-pre-registrations">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pre-registrations</p>
          <p className="text-sm mt-1">Pre-register expected visitors for fast-track check-in</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="pre-registrations-list">
          {preRegs.map(p => (
            <div key={p.id} className="p-3 rounded-md border flex items-center justify-between gap-3 flex-wrap" data-testid={`card-prereg-${p.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{p.expected_visitor_name}</p>
                  {p.expected_visitor_company && <p className="text-xs text-muted-foreground">{p.expected_visitor_company}</p>}
                  {statusBadge(p.status)}
                  {p.visitor_type && visitorTypeBadge(p.visitor_type)}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{p.site_name}</span>
                  <span>Expected: {formatDateTime(p.expected_arrival)}</span>
                  {p.host_name && <span>Host: {p.host_name}</span>}
                </div>
              </div>
              {p.status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelMutation.mutate(p.id)}
                  disabled={cancelMutation.isPending}
                  data-testid={`button-cancel-prereg-${p.id}`}
                >
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// VISITOR LOG HISTORY
// =============================================================================
function VisitorLogHistory() {
  const [search, setSearch] = useState('');
  const [visitorTypeFilter, setVisitorTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/visitor-management/logs', search, visitorTypeFilter, dateFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set('search', search);
      if (visitorTypeFilter !== 'all') params.set('visitorType', visitorTypeFilter);
      if (dateFilter) params.set('date', dateFilter);
      const res = await fetch(`/api/visitor-management/logs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch visitor logs');
      return res.json();
    },
  });

  const logs: any[] = data?.logs || [];
  const total: number = data?.total || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or company..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            data-testid="input-visitor-search"
          />
        </div>
        <Select value={visitorTypeFilter} onValueChange={v => { setVisitorTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]" data-testid="select-visitor-type-filter">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {VISITOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); setPage(0); }}
          className="w-[160px]"
          data-testid="input-visitor-date-filter"
        />
        {dateFilter && (
          <Button size="sm" variant="outline" onClick={() => { setDateFilter(''); setPage(0); }} data-testid="button-clear-date-filter">
            Clear Date
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="empty-visitor-logs">
          <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No visitor records found</p>
        </div>
      ) : (
        <>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id} data-testid={`row-visitor-log-${log.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{log.visitor_name}</p>
                        {log.visitor_company && <p className="text-xs text-muted-foreground">{log.visitor_company}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{log.visitor_type ? visitorTypeBadge(log.visitor_type) : '—'}</TableCell>
                    <TableCell className="text-sm">{log.site_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.host_name || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(log.checked_in_at)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {log.checked_out_at ? formatDateTime(log.checked_out_at) : (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-0 text-xs">On-Site</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {log.is_banned && <Badge variant="destructive" className="text-xs"><Ban className="h-3 w-3 mr-1" />Banned</Badge>}
                        {log.is_fast_track && <Badge variant="outline" className="text-xs border-green-400 text-green-600"><UserCheck className="h-3 w-3 mr-1" />Pre-Reg</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} total records</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Previous</Button>
              <span>Page {page + 1}</span>
              <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function VisitorManagement() {
  // V1.1 Feature Flag — visitor management backend not yet deployed
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <div className="text-center space-y-3 max-w-md">
        <div className="text-4xl">🚧</div>
        <h2 className="text-xl font-semibold">Visitor Management</h2>
        <p className="text-muted-foreground text-sm">
          Visitor Management is launching in V1.1 — available shortly after go-live.
          Pre-registrations and visitor logs will be fully accessible once this ships.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium border border-amber-500/20">
          Coming in V1.1
        </div>
      </div>
    </div>
  );

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('active');
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState('');

  const { data: preRegsData } = useQuery<any>({
    queryKey: ['/api/visitor-management/pre-registrations'],
  });
  const preRegistrations: any[] = preRegsData?.preRegistrations || [];

  const checkoutMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/visitor-management/checkout/${checkoutId}`, { notes: checkoutNotes }),
    onSuccess: () => {
      toast({ title: 'Visitor Checked Out', description: 'Checkout recorded successfully.' });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/active'] });
      qc.invalidateQueries({ queryKey: ['/api/visitor-management/logs'] });
      setCheckoutId(null);
      setCheckoutNotes('');
    },
    onError: (err: any) => {
      toast({ title: 'Checkout Failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">

        <UniversalModal open={!!checkoutId} onOpenChange={v => { if (!v) { setCheckoutId(null); setCheckoutNotes(''); } }}>
          <UniversalModalContent>
            <UniversalModalHeader>
              <UniversalModalTitle>Confirm Check-Out</UniversalModalTitle>
              <UniversalModalDescription>Log the visitor departure and optionally add notes</UniversalModalDescription>
            </UniversalModalHeader>
            <div className="py-4 space-y-3">
              <div className="space-y-2">
                <Label>Checkout Notes (Optional)</Label>
                <Textarea
                  value={checkoutNotes}
                  onChange={e => setCheckoutNotes(e.target.value)}
                  placeholder="Any notes on departure..."
                  data-testid="input-checkout-notes"
                />
              </div>
            </div>
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => { setCheckoutId(null); setCheckoutNotes(''); }} data-testid="button-checkout-cancel">Cancel</Button>
              <Button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending} data-testid="button-checkout-confirm">
                {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
                Confirm Checkout
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="visitor-tabs">
            <TabsTrigger value="active" data-testid="tab-active-visitors">
              <Users className="h-4 w-4 mr-2" /> Active Visitors
            </TabsTrigger>
            <TabsTrigger value="checkin" data-testid="tab-checkin">
              <UserPlus className="h-4 w-4 mr-2" /> Check In
            </TabsTrigger>
            <TabsTrigger value="pre-registrations" data-testid="tab-pre-registrations">
              <ClipboardList className="h-4 w-4 mr-2" /> Pre-Registrations
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-visitor-history">
              <History className="h-4 w-4 mr-2" /> Log History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" /> Active Visitors Board
                </CardTitle>
                <CardDescription>Currently checked-in visitors grouped by post — elapsed time updates every minute</CardDescription>
              </CardHeader>
              <CardContent>
                <ActiveVisitorsBoard onCheckout={id => setCheckoutId(id)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checkin" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-green-500" /> Visitor Check-In
                </CardTitle>
                <CardDescription>Log a new visitor arrival. Pre-registered visitors get fast-track check-in.</CardDescription>
              </CardHeader>
              <CardContent>
                <CheckInForm preRegistrations={preRegistrations} onSuccess={() => setActiveTab('active')} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pre-registrations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-purple-500" /> Pre-Registrations
                </CardTitle>
                <CardDescription>Expected visitors pre-registered by clients or staff</CardDescription>
              </CardHeader>
              <CardContent>
                <PreRegistrationList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-500" /> Visitor Log History
                </CardTitle>
                <CardDescription>Searchable record of all visitor entries at all posts</CardDescription>
              </CardHeader>
              <CardContent>
                <VisitorLogHistory />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
