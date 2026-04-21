import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Plus,
  Phone,
  Key,
  FileText,
  Hospital,
  MapPin,
  AlertTriangle,
  Car,
  Shirt,
  KeyRound,
  Pencil,
  Trash2,
  Building2,
  Siren,
  Flame,
  X,
} from "lucide-react";
import type { SiteBriefing } from "@shared/schema";

const pageConfig: CanvasPageConfig = {
  title: "Site Briefing Hub",
  subtitle: "Emergency contacts, access codes, and site instructions for every location",
  // @ts-expect-error — TS migration: fix in refactoring sprint
  icon: Shield,
};

type EmergencyContact = { name: string; role: string; phone: string; priority: number };
type AccessCode = { label: string; code: string; notes?: string };
type FacilityInfo = { name: string; address: string; phone?: string; distanceMiles?: number };

const EMPTY_BRIEFING = {
  siteName: "",
  siteAddress: "",
  emergencyContacts: [] as EmergencyContact[],
  accessCodes: [] as AccessCode[],
  specialInstructions: "",
  postOrders: "",
  nearestHospital: null as FacilityInfo | null,
  nearestPoliceStation: null as FacilityInfo | null,
  nearestFireStation: null as FacilityInfo | null,
  hazards: "",
  parkingInstructions: "",
  uniformRequirements: "",
  keyInfo: "",
};

function ContactEditor({ contacts, onChange }: { contacts: EmergencyContact[]; onChange: (c: EmergencyContact[]) => void }) {
  const add = () => onChange([...contacts, { name: "", role: "", phone: "", priority: contacts.length + 1 }]);
  const remove = (i: number) => onChange(contacts.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof EmergencyContact, val: string | number) => {
    const copy = [...contacts];
    (copy[i] as any)[field] = val;
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="flex items-center gap-1"><Phone className="w-4 h-4" /> Emergency Contacts</Label>
        <Button size="sm" variant="outline" onClick={add} data-testid="button-add-contact"><Plus className="w-3 h-3 mr-1" />Add</Button>
      </div>
      {contacts.map((c, i) => (
        <div key={i} className="flex items-start gap-2 flex-wrap">
          <Input className="flex-1 min-w-[120px]" placeholder="Name" value={c.name} onChange={e => update(i, "name", e.target.value)} data-testid={`input-contact-name-${i}`} />
          <Input className="flex-1 min-w-[100px]" placeholder="Role" value={c.role} onChange={e => update(i, "role", e.target.value)} data-testid={`input-contact-role-${i}`} />
          <Input className="flex-1 min-w-[120px]" placeholder="Phone" value={c.phone} onChange={e => update(i, "phone", e.target.value)} data-testid={`input-contact-phone-${i}`} />
          <Button size="icon" variant="ghost" onClick={() => remove(i)} data-testid={`button-remove-contact-${i}`} aria-label="Remove contact"><X className="w-4 h-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function CodeEditor({ codes, onChange }: { codes: AccessCode[]; onChange: (c: AccessCode[]) => void }) {
  const add = () => onChange([...codes, { label: "", code: "", notes: "" }]);
  const remove = (i: number) => onChange(codes.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof AccessCode, val: string) => {
    const copy = [...codes];
    (copy[i] as any)[field] = val;
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="flex items-center gap-1"><Key className="w-4 h-4" /> Access Codes</Label>
        <Button size="sm" variant="outline" onClick={add} data-testid="button-add-code"><Plus className="w-3 h-3 mr-1" />Add</Button>
      </div>
      {codes.map((c, i) => (
        <div key={i} className="flex items-start gap-2 flex-wrap">
          <Input className="flex-1 min-w-[100px]" placeholder="Label (e.g. Front Gate)" value={c.label} onChange={e => update(i, "label", e.target.value)} data-testid={`input-code-label-${i}`} />
          <Input className="flex-1 min-w-[80px]" placeholder="Code" value={c.code} onChange={e => update(i, "code", e.target.value)} data-testid={`input-code-value-${i}`} />
          <Input className="flex-1 min-w-[100px]" placeholder="Notes" value={c.notes ?? ""} onChange={e => update(i, "notes", e.target.value)} data-testid={`input-code-notes-${i}`} />
          <Button size="icon" variant="ghost" onClick={() => remove(i)} data-testid={`button-remove-code-${i}`} aria-label="Remove access code"><X className="w-4 h-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function FacilityEditor({ label, icon: Icon, value, onChange }: { label: string; icon: any; value: FacilityInfo | null; onChange: (f: FacilityInfo | null) => void }) {
  const v = value ?? { name: "", address: "", phone: "" };
  const set = (field: keyof FacilityInfo, val: string) => onChange({ ...v, [field]: val });
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1"><Icon className="w-4 h-4" /> {label}</Label>
      <div className="flex items-start gap-2 flex-wrap">
        <Input className="flex-1 min-w-[120px]" placeholder="Name" value={v.name} onChange={e => set("name", e.target.value)} data-testid={`input-${label.toLowerCase().replace(/\s+/g, "-")}-name`} />
        <Input className="flex-1 min-w-[140px]" placeholder="Address" value={v.address} onChange={e => set("address", e.target.value)} data-testid={`input-${label.toLowerCase().replace(/\s+/g, "-")}-address`} />
        <Input className="flex-1 min-w-[100px]" placeholder="Phone" value={v.phone ?? ""} onChange={e => set("phone", e.target.value)} data-testid={`input-${label.toLowerCase().replace(/\s+/g, "-")}-phone`} />
      </div>
    </div>
  );
}

function BriefingForm({ briefing, onClose }: { briefing?: SiteBriefing; onClose: () => void }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [form, setForm] = useState(() => {
    if (briefing) {
      return {
        siteName: briefing.siteName ?? "",
        siteAddress: briefing.siteAddress ?? "",
        emergencyContacts: (briefing.emergencyContacts as EmergencyContact[]) ?? [],
        accessCodes: (briefing.accessCodes as AccessCode[]) ?? [],
        specialInstructions: briefing.specialInstructions ?? "",
        postOrders: briefing.postOrders ?? "",
        nearestHospital: briefing.nearestHospital as FacilityInfo | null,
        nearestPoliceStation: briefing.nearestPoliceStation as FacilityInfo | null,
        nearestFireStation: briefing.nearestFireStation as FacilityInfo | null,
        hazards: briefing.hazards ?? "",
        parkingInstructions: briefing.parkingInstructions ?? "",
        uniformRequirements: briefing.uniformRequirements ?? "",
        keyInfo: briefing.keyInfo ?? "",
      };
    }
    return { ...EMPTY_BRIEFING };
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      briefing
        ? apiRequest("PATCH", `/api/site-briefings/${briefing.id}`, data)
        : apiRequest("POST", "/api/site-briefings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-briefings"] });
      toast({ title: briefing ? "Briefing updated" : "Briefing created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save briefing", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.siteName.trim()) {
      toast({ title: "Site name is required", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bf-site-name">Site Name *</Label>
          <Input id="bf-site-name" value={form.siteName} onChange={e => setForm(p => ({ ...p, siteName: e.target.value }))} placeholder="Main Office Building" data-testid="input-site-name" />
        </div>
        <div>
          <Label htmlFor="bf-site-address">Site Address</Label>
          <Input id="bf-site-address" value={form.siteAddress} onChange={e => setForm(p => ({ ...p, siteAddress: e.target.value }))} placeholder="123 Main St, City, ST 12345" data-testid="input-site-address" />
        </div>
      </div>

      <ContactEditor contacts={form.emergencyContacts} onChange={c => setForm(p => ({ ...p, emergencyContacts: c }))} />
      <CodeEditor codes={form.accessCodes} onChange={c => setForm(p => ({ ...p, accessCodes: c }))} />

      <div>
        <Label htmlFor="bf-instructions" className="flex items-center gap-1"><FileText className="w-4 h-4" /> Special Instructions</Label>
        <Textarea id="bf-instructions" value={form.specialInstructions} onChange={e => setForm(p => ({ ...p, specialInstructions: e.target.value }))} placeholder="Guard must check in at front desk before patrolling..." data-testid="input-special-instructions" />
      </div>

      <div>
        <Label htmlFor="bf-post-orders" className="flex items-center gap-1"><FileText className="w-4 h-4" /> Post Orders</Label>
        <Textarea id="bf-post-orders" value={form.postOrders} onChange={e => setForm(p => ({ ...p, postOrders: e.target.value }))} placeholder="Standing orders for this site..." data-testid="input-post-orders" />
      </div>

      <FacilityEditor label="Nearest Hospital" icon={Hospital} value={form.nearestHospital} onChange={v => setForm(p => ({ ...p, nearestHospital: v }))} />
      <FacilityEditor label="Nearest Police Station" icon={Siren} value={form.nearestPoliceStation} onChange={v => setForm(p => ({ ...p, nearestPoliceStation: v }))} />
      <FacilityEditor label="Nearest Fire Station" icon={Flame} value={form.nearestFireStation} onChange={v => setForm(p => ({ ...p, nearestFireStation: v }))} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bf-hazards" className="flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Known Hazards</Label>
          <Textarea id="bf-hazards" value={form.hazards} onChange={e => setForm(p => ({ ...p, hazards: e.target.value }))} placeholder="Construction area on west side..." data-testid="input-hazards" />
        </div>
        <div>
          <Label htmlFor="bf-parking" className="flex items-center gap-1"><Car className="w-4 h-4" /> Parking Instructions</Label>
          <Textarea id="bf-parking" value={form.parkingInstructions} onChange={e => setForm(p => ({ ...p, parkingInstructions: e.target.value }))} placeholder="Park in Lot B, space marked Security..." data-testid="input-parking" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bf-uniform" className="flex items-center gap-1"><Shirt className="w-4 h-4" /> Uniform Requirements</Label>
          <Textarea id="bf-uniform" value={form.uniformRequirements} onChange={e => setForm(p => ({ ...p, uniformRequirements: e.target.value }))} placeholder="Full uniform, high-vis vest required..." data-testid="input-uniform" />
        </div>
        <div>
          <Label htmlFor="bf-keys" className="flex items-center gap-1"><KeyRound className="w-4 h-4" /> Key / Access Card Info</Label>
          <Textarea id="bf-keys" value={form.keyInfo} onChange={e => setForm(p => ({ ...p, keyInfo: e.target.value }))} placeholder="Master key kept in lock box at front..." data-testid="input-key-info" />
        </div>
      </div>

      <UniversalModalFooter>
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-briefing">Cancel</Button>
        <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-save-briefing">
          {mutation.isPending ? "Saving..." : briefing ? "Update Briefing" : "Create Briefing"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function FacilityDisplay({ label, icon: Icon, value }: { label: string; icon: any; value: FacilityInfo | null | undefined }) {
  if (!value || !value.name) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <span className="text-sm font-medium">{label}: </span>
        <span className="text-sm">{value.name}</span>
        {value.address && <span className="text-sm text-muted-foreground"> — {value.address}</span>}
        {value.phone && <span className="text-sm text-muted-foreground"> ({value.phone})</span>}
      </div>
    </div>
  );
}

function BriefingCard({ briefing, onEdit, onDelete }: { briefing: SiteBriefing; onEdit: () => void; onDelete: () => void }) {
  const contacts = (briefing.emergencyContacts as EmergencyContact[]) ?? [];
  const codes = (briefing.accessCodes as AccessCode[]) ?? [];

  return (
    <Card data-testid={`card-briefing-${briefing.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 flex-wrap" data-testid={`text-briefing-name-${briefing.id}`}>
            <Building2 className="w-5 h-5 shrink-0" />
            {briefing.siteName}
          </CardTitle>
          {briefing.siteAddress && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1" data-testid={`text-briefing-address-${briefing.id}`}>
              <MapPin className="w-3 h-3 shrink-0" /> {briefing.siteAddress}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-briefing-${briefing.id}`} aria-label="Edit briefing"><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="destructive" onClick={onDelete} data-testid={`button-delete-briefing-${briefing.id}`} aria-label="Delete briefing"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {contacts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Emergency Contacts</p>
            <div className="space-y-1">
              {contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap text-sm" data-testid={`text-contact-${briefing.id}-${i}`}>
                  <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{c.name}</span>
                  {c.role && <Badge variant="secondary">{c.role}</Badge>}
                  <span className="text-muted-foreground">{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {codes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Access Codes</p>
            <div className="flex flex-wrap gap-2">
              {codes.map((c, i) => (
                <Badge key={i} variant="outline" data-testid={`text-code-${briefing.id}-${i}`}>
                  <Key className="w-3 h-3 mr-1" /> {c.label}: {c.code}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {briefing.specialInstructions && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Special Instructions</p>
            <p className="text-sm whitespace-pre-wrap" data-testid={`text-instructions-${briefing.id}`}>{briefing.specialInstructions}</p>
          </div>
        )}

        <div className="space-y-1">
          <FacilityDisplay label="Hospital" icon={Hospital} value={briefing.nearestHospital as FacilityInfo} />
          <FacilityDisplay label="Police" icon={Siren} value={briefing.nearestPoliceStation as FacilityInfo} />
          <FacilityDisplay label="Fire Dept" icon={Flame} value={briefing.nearestFireStation as FacilityInfo} />
        </div>

        {briefing.hazards && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" />
            <p className="text-sm" data-testid={`text-hazards-${briefing.id}`}>{briefing.hazards}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SiteBriefingPage() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState<SiteBriefing | undefined>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: briefings = [], isLoading } = useQuery<SiteBriefing[]>({
    queryKey: ["/api/site-briefings"],
    enabled: !!workspaceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/site-briefings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-briefings"] });
      toast({ title: "Briefing deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleEdit = (b: SiteBriefing) => {
    setEditingBriefing(b);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingBriefing(undefined);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingBriefing(undefined);
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">
              {briefings.length} site{briefings.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Button onClick={handleNew} data-testid="button-new-briefing">
            <Plus className="w-4 h-4 mr-1" /> New Site Briefing
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : briefings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">No site briefings yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create briefings with emergency contacts, codes, and instructions for your sites</p>
              <Button onClick={handleNew} data-testid="button-empty-new-briefing">
                <Plus className="w-4 h-4 mr-1" /> Create First Briefing
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {briefings.map(b => (
              <BriefingCard
                key={b.id}
                briefing={b}
                onEdit={() => handleEdit(b)}
                onDelete={() => setDeleteConfirmId(b.id)}
              />
            ))}
          </div>
        )}
      </div>

      <UniversalModal open={dialogOpen} onOpenChange={setDialogOpen}>
        <UniversalModalContent className="max-w-2xl">
          <UniversalModalHeader>
            <UniversalModalTitle>{editingBriefing ? "Edit Site Briefing" : "New Site Briefing"}</UniversalModalTitle>
          </UniversalModalHeader>
          <BriefingForm briefing={editingBriefing} onClose={handleClose} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!deleteConfirmId} onOpenChange={v => !v && setDeleteConfirmId(null)}>
        <UniversalModalContent className="max-w-sm">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Site Briefing?
            </UniversalModalTitle>
          </UniversalModalHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this site briefing. This action cannot be undone.</p>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); } }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-briefing"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Briefing"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
