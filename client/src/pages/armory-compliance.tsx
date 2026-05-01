/**
 * Armory Compliance Panel — Readiness Section 2 + Section 27 wiring
 *
 * Surfaces weapon inspection, qualification, and ammo data. Wires three
 * action forms (Log Inspection, Record Qualification, Receive Ammo) to
 * the existing /api/armory/* endpoints so managers can take action from
 * the same page that surfaces the gaps.
 *
 * Pairs with the /api/armory/* routes added in armoryRoutes.ts.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Award, Crosshair, Loader2, Package, Plus } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ArmorySummary {
  expiringQualifications: Array<{
    id: string;
    employeeId: string;
    weaponType: string;
    expiresAt: string;
    qualificationLevel?: string | null;
  }>;
  inspectionsOverdue: Array<{
    id: string;
    weaponId: string;
    nextInspectionDue: string | null;
    inspectionType: string;
  }>;
  lowAmmo: Array<{
    id: string;
    caliber: string;
    quantity_on_hand: number;
    reorder_threshold: number;
  }>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

// ─── Log Inspection dialog ───────────────────────────────────────────────────

function LogInspectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [weaponId, setWeaponId] = useState("");
  const [inspectionType, setInspectionType] = useState("routine");
  const [condition, setCondition] = useState("good");
  const [findings, setFindings] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/armory/inspections", {
        weaponId,
        inspectionType,
        condition,
        findings: findings || undefined,
        inspectedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      toast({ title: "Inspection logged", description: `Weapon ${weaponId} inspection recorded.` });
      qc.invalidateQueries({ queryKey: ["/api/armory/summary"] });
      onOpenChange(false);
      setWeaponId(""); setFindings(""); setInspectionType("routine"); setCondition("good");
    },
    onError: (err) => {
      toast({ title: "Failed to log inspection", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-log-inspection">
        <DialogHeader>
          <DialogTitle>Log Weapon Inspection</DialogTitle>
          <DialogDescription>Records an inspection event in the armory audit trail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="inspection-weapon-id">Weapon ID</Label>
            <Input
              id="inspection-weapon-id"
              value={weaponId}
              onChange={(e) => setWeaponId(e.target.value)}
              placeholder="Weapon UUID or serial"
              data-testid="input-inspection-weapon-id"
            />
          </div>
          <div>
            <Label>Inspection type</Label>
            <Select value={inspectionType} onValueChange={setInspectionType}>
              <SelectTrigger data-testid="select-inspection-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="pre_shift">Pre-shift</SelectItem>
                <SelectItem value="post_shift">Post-shift</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger data-testid="select-inspection-condition"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excellent">Excellent</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="fair">Fair</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
                <SelectItem value="unserviceable">Unserviceable — remove from service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="inspection-findings">Findings / notes</Label>
            <Textarea
              id="inspection-findings"
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Observations, repairs needed, etc."
              rows={3}
              data-testid="input-inspection-findings"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !weaponId} data-testid="submit-inspection">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log Inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Qualification dialog ─────────────────────────────────────────────

function RecordQualificationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [weaponType, setWeaponType] = useState("handgun");
  const [caliber, setCaliber] = useState("");
  const [qualifiedAt, setQualifiedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState("");
  const [score, setScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [instructorName, setInstructorName] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/armory/qualifications", {
        employeeId,
        weaponType,
        caliber: caliber || undefined,
        qualifiedAt: new Date(qualifiedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        score: score ? Number(score) : undefined,
        maxScore: maxScore ? Number(maxScore) : undefined,
        instructorName: instructorName || undefined,
        status: "active",
      }),
    onSuccess: () => {
      toast({ title: "Qualification recorded" });
      qc.invalidateQueries({ queryKey: ["/api/armory/summary"] });
      onOpenChange(false);
      setEmployeeId(""); setCaliber(""); setScore(""); setMaxScore(""); setInstructorName("");
    },
    onError: (err) => {
      toast({ title: "Failed to record qualification", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-record-qualification">
        <DialogHeader>
          <DialogTitle>Record Officer Qualification</DialogTitle>
          <DialogDescription>Logs a firearms qualification with expiry for Texas PSB compliance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="qual-employee-id">Officer (employee ID)</Label>
            <Input
              id="qual-employee-id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Employee UUID"
              data-testid="input-qual-employee-id"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Weapon type</Label>
              <Select value={weaponType} onValueChange={setWeaponType}>
                <SelectTrigger data-testid="select-qual-weapon-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handgun">Handgun</SelectItem>
                  <SelectItem value="rifle">Rifle</SelectItem>
                  <SelectItem value="shotgun">Shotgun</SelectItem>
                  <SelectItem value="taser">Taser</SelectItem>
                  <SelectItem value="baton">Baton</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qual-caliber">Caliber</Label>
              <Input
                id="qual-caliber"
                value={caliber}
                onChange={(e) => setCaliber(e.target.value)}
                placeholder="e.g. 9mm"
                data-testid="input-qual-caliber"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="qual-date">Qualified on</Label>
              <Input id="qual-date" type="date" value={qualifiedAt} onChange={(e) => setQualifiedAt(e.target.value)} data-testid="input-qual-date" />
            </div>
            <div>
              <Label htmlFor="qual-expires">Expires</Label>
              <Input id="qual-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid="input-qual-expires" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="qual-score">Score</Label>
              <Input id="qual-score" type="number" value={score} onChange={(e) => setScore(e.target.value)} data-testid="input-qual-score" />
            </div>
            <div>
              <Label htmlFor="qual-max">Out of</Label>
              <Input id="qual-max" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} data-testid="input-qual-max" />
            </div>
            <div>
              <Label htmlFor="qual-instructor">Instructor</Label>
              <Input id="qual-instructor" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} data-testid="input-qual-instructor" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !employeeId || !expiresAt} data-testid="submit-qualification">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Qualification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Receive Ammo dialog — uses the existing ammo transaction endpoint ────────

function ReceiveAmmoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ammoInventoryId, setAmmoInventoryId] = useState("");
  const [caliber, setCaliber] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [manufacturer, setManufacturer] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState<string>("");

  const createInventoryMut = useMutation({
    mutationFn: async () => {
      const inv = (await apiRequest("POST", "/api/armory/ammo", {
        caliber, manufacturer: manufacturer || undefined,
        quantityOnHand: 0,
        reorderThreshold: reorderThreshold ? Number(reorderThreshold) : 0,
      })) as unknown as { id: string };
      return inv.id;
    },
  });

  const transactionMut = useMutation({
    mutationFn: async () => {
      let id = ammoInventoryId;
      if (mode === "new") {
        id = await createInventoryMut.mutateAsync();
      }
      return apiRequest("POST", `/api/armory/ammo/${id}/transaction`, {
        transactionType: "receive",
        quantity: Number(quantity),
        reason: reason || "Received new stock",
      });
    },
    onSuccess: () => {
      toast({ title: "Ammo received", description: `${quantity} rounds logged.` });
      qc.invalidateQueries({ queryKey: ["/api/armory/summary"] });
      onOpenChange(false);
      setAmmoInventoryId(""); setCaliber(""); setQuantity(""); setReason(""); setManufacturer(""); setReorderThreshold("");
    },
    onError: (err) => {
      toast({ title: "Failed to receive ammo", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-receive-ammo">
        <DialogHeader>
          <DialogTitle>Receive Ammo</DialogTitle>
          <DialogDescription>Adds received stock and writes the ledger transaction.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")} data-testid="mode-existing">Existing inventory</Button>
            <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")} data-testid="mode-new">New caliber</Button>
          </div>

          {mode === "existing" ? (
            <div>
              <Label htmlFor="ammo-inv-id">Ammo inventory ID</Label>
              <Input
                id="ammo-inv-id"
                value={ammoInventoryId}
                onChange={(e) => setAmmoInventoryId(e.target.value)}
                placeholder="ammo_inventory UUID"
                data-testid="input-ammo-inv-id"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <Label htmlFor="ammo-caliber">Caliber</Label>
                <Input id="ammo-caliber" value={caliber} onChange={(e) => setCaliber(e.target.value)} placeholder="9mm" data-testid="input-ammo-caliber" />
              </div>
              <div>
                <Label htmlFor="ammo-manufacturer">Manufacturer</Label>
                <Input id="ammo-manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Federal" data-testid="input-ammo-manufacturer" />
              </div>
              <div>
                <Label htmlFor="ammo-threshold">Reorder threshold</Label>
                <Input id="ammo-threshold" type="number" value={reorderThreshold} onChange={(e) => setReorderThreshold(e.target.value)} data-testid="input-ammo-threshold" />
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="ammo-qty">Quantity received (rounds)</Label>
            <Input id="ammo-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-ammo-qty" />
          </div>
          <div>
            <Label htmlFor="ammo-reason">Notes</Label>
            <Textarea id="ammo-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="PO number, vendor, etc." data-testid="input-ammo-reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => transactionMut.mutate()}
            disabled={transactionMut.isPending || createInventoryMut.isPending || !quantity || (mode === "existing" ? !ammoInventoryId : !caliber)}
            data-testid="submit-ammo-receive"
          >
            {(transactionMut.isPending || createInventoryMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Receive Ammo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit Trail tab (#8) ────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  success: boolean;
  changes_after: Record<string, any> | null;
}

function ArmoryAuditTrail(): JSX.Element {
  const { data, isLoading } = useQuery<{ rows: AuditRow[] }>({
    queryKey: ["/api/armory/audit-trail"],
  });
  const rows = data?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <CardDescription>
          Every armory mutation (inspections, qualifications, ammo transactions)
          from the canonical audit_logs sink. Required for Texas PSB reviews.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No armory activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Timestamp</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Entity</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2">Success</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.entity_type} · {r.entity_id?.slice(0, 8) || '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.user_id?.slice(0, 8) || 'system'}</td>
                    <td className="py-2">{r.success ? <Badge variant="secondary">OK</Badge> : <Badge variant="destructive">FAIL</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ArmoryCompliancePage(): JSX.Element {
  const { data, isLoading } = useQuery<ArmorySummary>({
    queryKey: ["/api/armory/summary"],
  });
  const [showInspection, setShowInspection] = useState(false);
  const [showQual, setShowQual] = useState(false);
  const [showAmmo, setShowAmmo] = useState(false);

  const pageConfig: CanvasPageConfig = {
    id: "armory-compliance",
    title: "Armory Compliance",
    subtitle:
      "Weapon qualifications, inspections overdue, and ammo reorder alerts",
    category: "operations" as any,
    showHeader: true,
  };

  const summary = data ?? {
    expiringQualifications: [],
    inspectionsOverdue: [],
    lowAmmo: [],
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <LogInspectionDialog open={showInspection} onOpenChange={setShowInspection} />
      <RecordQualificationDialog open={showQual} onOpenChange={setShowQual} />
      <ReceiveAmmoDialog open={showAmmo} onOpenChange={setShowAmmo} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setShowInspection(true)} data-testid="button-open-log-inspection" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Log Inspection
        </Button>
        <Button onClick={() => setShowQual(true)} data-testid="button-open-record-qual" size="sm" variant="secondary">
          <Plus className="h-4 w-4 mr-1" /> Record Qualification
        </Button>
        <Button onClick={() => setShowAmmo(true)} data-testid="button-open-receive-ammo" size="sm" variant="secondary">
          <Plus className="h-4 w-4 mr-1" /> Receive Ammo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card data-testid="card-armory-quals">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Expiring Qualifications (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.expiringQualifications.length}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-armory-inspections">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Inspections Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.inspectionsOverdue.length}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-armory-ammo">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Ammo Below Threshold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.lowAmmo.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="qualifications">
        <TabsList>
          <TabsTrigger value="qualifications" data-testid="tab-armory-qualifications">
            <Award className="h-4 w-4 mr-1" /> Qualifications
          </TabsTrigger>
          <TabsTrigger value="inspections" data-testid="tab-armory-inspections">
            <Crosshair className="h-4 w-4 mr-1" /> Inspections
          </TabsTrigger>
          <TabsTrigger value="ammo" data-testid="tab-armory-ammo">
            <Package className="h-4 w-4 mr-1" /> Ammo
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-armory-audit">
            Audit Trail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualifications">
          <Card>
            <CardHeader>
              <CardTitle>Qualifications expiring in 30 days</CardTitle>
              <CardDescription>
                Officers whose firearms qualification expires soon. Schedule a
                re-qualification before the expires_at date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.expiringQualifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.expiringQualifications.map((q) => (
                    <li key={q.id} className="py-2 flex justify-between text-sm">
                      <span>
                        {q.employeeId} · {q.weaponType}
                        {q.qualificationLevel ? ` (${q.qualificationLevel})` : ""}
                      </span>
                      <Badge variant="secondary">{formatDate(q.expiresAt)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspections">
          <Card>
            <CardHeader>
              <CardTitle>Overdue inspections</CardTitle>
              <CardDescription>
                Weapons whose next_inspection_due has passed. Use the "Log
                Inspection" button above to record a new inspection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.inspectionsOverdue.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.inspectionsOverdue.map((i) => (
                    <li key={i.id} className="py-2 flex justify-between text-sm">
                      <span>
                        Weapon {i.weaponId} · {i.inspectionType}
                      </span>
                      <Badge variant="destructive">
                        {formatDate(i.nextInspectionDue)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ammo">
          <Card>
            <CardHeader>
              <CardTitle>Ammo at or below reorder threshold</CardTitle>
              <CardDescription>
                Replenish inventory. Every transaction is ledgered in
                ammo_transactions for audit replay.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.lowAmmo.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.lowAmmo.map((a) => (
                    <li key={a.id} className="py-2 flex justify-between text-sm">
                      <span>{a.caliber}</span>
                      <span>
                        <Badge variant="secondary" className="mr-2">
                          on hand: {a.quantity_on_hand}
                        </Badge>
                        <Badge variant="outline">
                          threshold: {a.reorder_threshold}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <ArmoryAuditTrail />
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
