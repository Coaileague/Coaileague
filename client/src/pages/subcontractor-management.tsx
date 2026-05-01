import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, formatCurrency, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleDetailShell, ModuleSkeletonList,
  ModuleEmptyState, ModuleToolbar, ModuleAlertBanner,
} from "@/components/modules/ModulePageShell";
import { Building2, Plus, Mail, Phone, Shield, ChevronRight, ArrowLeft } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

interface Subcontractor {
  id: string;
  company_name: string;
  dba_name?: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company_license_number?: string;
  company_license_state?: string;
  company_license_expiration?: string;
  insurance_expiration?: string;
  insurance_coverage_amount?: number | string;
  hourly_rate?: number | string;
  status: "active" | "inactive" | "suspended";
  notes?: string;
  created_at: string;
}

const EMPTY_FORM = {
  company_name: "", dba_name: "", contact_name: "", contact_email: "", contact_phone: "",
  company_license_number: "", company_license_state: "TX", company_license_expiration: "",
  insurance_expiration: "", insurance_coverage_amount: "", hourly_rate: "", notes: "",
};

function getCoiStatus(expDate?: string | null): { label: string; color: string } {
  if (!expDate) return { label: "No COI", color: BADGE_COLORS.slate };
  try {
    const days = differenceInDays(parseISO(expDate), new Date());
    if (days < 0)  return { label: "COI Expired",       color: BADGE_COLORS.red };
    if (days <= 30) return { label: `COI Exp. ${days}d`, color: BADGE_COLORS.red };
    if (days <= 60) return { label: `COI Exp. ${days}d`, color: BADGE_COLORS.amber };
    return { label: "COI Current", color: BADGE_COLORS.green };
  } catch {
    return { label: "No COI", color: BADGE_COLORS.slate };
  }
}

export default function SubcontractorManagementPage() {
  const { toast } = useAppToast();
  const [selected, setSelected] = useState<Subcontractor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: subcontractors = [], isLoading } = useQuery<Subcontractor[]>({
    queryKey: ["/api/subcontractors", statusFilter],
    queryFn: () =>
      fetch(`/api/subcontractors${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`, { credentials: "include" }).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiRequest("POST", "/api/subcontractors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast({ title: "Subcontractor added" });
    },
    onError: (err) => toast({ title: "Failed to add", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/subcontractors/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      toast({ title: "Status updated" });
    },
  });

  const coiAlerts = subcontractors.filter((s) => {
    if (!s.insurance_expiration) return false;
    try { return differenceInDays(parseISO(s.insurance_expiration), new Date()) <= 45; } catch { return false; }
  });

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const coi = getCoiStatus(selected.insurance_expiration);
    return (
      <ModuleDetailShell
        backButton={
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-back-subcontractors" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to subcontractors
          </Button>
        }
        title={selected.company_name}
        subtitle={selected.dba_name ? `DBA: ${selected.dba_name}` : undefined}
        badges={
          <>
            <Badge className={coi.color}>{coi.label}</Badge>
            <Badge className={selected.status === "active" ? BADGE_COLORS.green : BADGE_COLORS.slate}>
              {selected.status}
            </Badge>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</p>
              <p className="text-sm font-medium text-foreground">{selected.contact_name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{selected.contact_email}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{selected.contact_phone}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Licensing</p>
              <p className="text-sm text-foreground">{selected.company_license_number || "—"} ({selected.company_license_state})</p>
              <p className="text-sm text-muted-foreground">Expires: {formatDate(selected.company_license_expiration)}</p>
              <p className="text-sm text-muted-foreground">Rate: {selected.hourly_rate ? `$${selected.hourly_rate}/hr` : "—"}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">COI Expiration</p>
              <p className="text-sm font-medium text-foreground mt-1">{formatDate(selected.insurance_expiration)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coverage Amount</p>
              <p className="text-sm font-medium text-foreground mt-1">{formatCurrency(selected.insurance_coverage_amount)}</p>
            </div>
          </CardContent>
        </Card>

        {selected.notes && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-2">Notes</p>
              <p className="text-sm text-foreground">{selected.notes}</p>
            </CardContent>
          </Card>
        )}
      </ModuleDetailShell>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <ModulePageShell
      title="Subcontractor Management"
      description="Manage overflow subcontractors, COI tracking, and compliance"
      action={
        <Button onClick={() => setShowForm(true)} data-testid="button-add-subcontractor" className="gap-2">
          <Plus className="w-4 h-4" /> Add Subcontractor
        </Button>
      }
    >
      {coiAlerts.length > 0 && (
        <ModuleAlertBanner
          variant="warning"
          message={`${coiAlerts.length} subcontractor${coiAlerts.length !== 1 ? "s" : ""} have COI expiring within 45 days: ${coiAlerts.map((s) => s.company_name).join(", ")}`}
        />
      )}

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-4">
            <p className="text-base font-semibold text-foreground">Add Subcontractor</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Company Name</Label><Input data-testid="input-company-name" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} /></div>
              <div><Label>DBA Name</Label><Input data-testid="input-dba-name" value={form.dba_name} onChange={(e) => setForm((f) => ({ ...f, dba_name: e.target.value }))} /></div>
              <div><Label>Contact Name</Label><Input data-testid="input-contact-name" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input type="email" data-testid="input-contact-email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} /></div>
              <div><Label>Contact Phone</Label><Input data-testid="input-contact-phone" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} /></div>
              <div><Label>Hourly Rate</Label><Input type="number" data-testid="input-hourly-rate" value={form.hourly_rate} onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))} /></div>
              <div><Label>License Number</Label><Input data-testid="input-license-number" value={form.company_license_number} onChange={(e) => setForm((f) => ({ ...f, company_license_number: e.target.value }))} /></div>
              <div><Label>License Expiration</Label><Input type="date" data-testid="input-license-expiration" value={form.company_license_expiration} onChange={(e) => setForm((f) => ({ ...f, company_license_expiration: e.target.value }))} /></div>
              <div><Label>COI Expiration</Label><Input type="date" data-testid="input-coi-expiration" value={form.insurance_expiration} onChange={(e) => setForm((f) => ({ ...f, insurance_expiration: e.target.value }))} /></div>
              <div><Label>Coverage Amount</Label><Input type="number" data-testid="input-coverage-amount" value={form.insurance_coverage_amount} onChange={(e) => setForm((f) => ({ ...f, insurance_coverage_amount: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea data-testid="textarea-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-form">Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.company_name || !form.contact_name}
                data-testid="button-save-subcontractor"
              >
                {createMutation.isPending ? "Saving..." : "Add Subcontractor"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ModuleToolbar>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {subcontractors.length} subcontractor{subcontractors.length !== 1 ? "s" : ""}
        </p>
      </ModuleToolbar>

      {isLoading ? (
        <ModuleSkeletonList count={3} height="h-20" />
      ) : subcontractors.length === 0 ? (
        <ModuleEmptyState icon={Building2} title="No subcontractors added yet" />
      ) : (
        <div className="space-y-2">
          {subcontractors.map((s) => {
            const coi = getCoiStatus(s.insurance_expiration);
            return (
              <Card key={s.id} className="hover-elevate cursor-pointer" onClick={() => setSelected(s)} data-testid={`card-subcontractor-${s.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-md bg-muted shrink-0">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground" data-testid={`text-company-${s.id}`}>{s.company_name}</p>
                        <p className="text-xs text-muted-foreground">{s.contact_name} · {s.contact_phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={coi.color} data-testid={`badge-coi-${s.id}`}>{coi.label}</Badge>
                      {s.hourly_rate && <p className="text-sm text-muted-foreground">${s.hourly_rate}/hr</p>}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ModulePageShell>
  );
}
