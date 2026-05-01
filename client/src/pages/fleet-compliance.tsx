/**
 * Fleet Compliance Panel — Readiness Section 14 + Section 27 #5
 * Surfaces vehicle registration + insurance expiry alerts AND lets
 * managers update those dates inline via existing PATCH /api/vehicles/:id.
 * No new endpoints.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, FileText, Loader2, ShieldAlert } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Bucket = 'expired' | 'expiring_30d' | 'expiring_90d' | 'ok' | 'unknown';

interface VehicleComplianceRow {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string;
  insurance: { expiresAt: string | null; bucket: Bucket };
  registration: { expiresAt: string | null; bucket: Bucket };
}

interface VehicleComplianceResponse {
  summary: {
    total: number;
    insuranceExpired: number;
    insuranceExpiring30d: number;
    insuranceMissing: number;
    registrationExpired: number;
    registrationExpiring30d: number;
    registrationMissing: number;
  };
  vehicles: VehicleComplianceRow[];
}

function bucketBadge(b: Bucket): JSX.Element {
  const variants: Record<Bucket, { variant: 'destructive' | 'secondary' | 'outline' | 'default'; label: string }> = {
    expired:      { variant: 'destructive', label: 'Expired' },
    expiring_30d: { variant: 'destructive', label: 'Expiring < 30d' },
    expiring_90d: { variant: 'secondary',   label: 'Expiring < 90d' },
    ok:           { variant: 'outline',     label: 'OK' },
    unknown:      { variant: 'outline',     label: 'Not set' },
  };
  const v = variants[b];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString(); } catch { return value; }
}

// ─── Update-expiry dialog — shared for insurance AND registration ───────────

function ExpiryUpdateDialog({
  open, onOpenChange, vehicle, kind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicle: VehicleComplianceRow | null;
  kind: 'insurance' | 'registration';
}): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expiry, setExpiry] = useState("");

  const kindLabel = kind === 'insurance' ? 'Insurance' : 'Registration';
  const field = kind === 'insurance' ? 'insuranceExpiry' : 'registrationExpiry';

  const mut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/vehicles/${vehicle?.id}`, {
        [field]: new Date(expiry).toISOString(),
      }),
    onSuccess: () => {
      toast({ title: `${kindLabel} renewed`, description: `New expiry: ${new Date(expiry).toLocaleDateString()}.` });
      qc.invalidateQueries({ queryKey: ["/api/vehicles/compliance"] });
      onOpenChange(false);
      setExpiry("");
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`dialog-${kind}-update`}>
        <DialogHeader>
          <DialogTitle>Update {kindLabel} Expiry</DialogTitle>
          <DialogDescription>
            {vehicle ? `${vehicle.make} ${vehicle.model} · plate ${vehicle.licensePlate || '—'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor={`expiry-${kind}`}>New expiration date</Label>
          <Input
            id={`expiry-${kind}`}
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            data-testid={`input-${kind}-expiry`}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!expiry || mut.isPending}
            data-testid={`submit-${kind}-expiry`}
          >
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FleetCompliancePage(): JSX.Element {
  const { data, isLoading } = useQuery<VehicleComplianceResponse>({
    queryKey: ['/api/vehicles/compliance'],
  });

  const [insuranceVehicle, setInsuranceVehicle] = useState<VehicleComplianceRow | null>(null);
  const [regVehicle, setRegVehicle] = useState<VehicleComplianceRow | null>(null);

  const pageConfig: CanvasPageConfig = {
    id: 'fleet-compliance',
    title: 'Fleet Compliance',
    subtitle: 'Vehicle registration + insurance expiry alerts',
    category: 'operations' as any,
    showHeader: true,
  };

  const summary = data?.summary ?? {
    total: 0,
    insuranceExpired: 0,
    insuranceExpiring30d: 0,
    insuranceMissing: 0,
    registrationExpired: 0,
    registrationExpiring30d: 0,
    registrationMissing: 0,
  };
  const rows = data?.vehicles ?? [];

  return (
    <CanvasHubPage config={pageConfig}>
      <ExpiryUpdateDialog
        open={!!insuranceVehicle}
        onOpenChange={(v) => { if (!v) setInsuranceVehicle(null); }}
        vehicle={insuranceVehicle}
        kind="insurance"
      />
      <ExpiryUpdateDialog
        open={!!regVehicle}
        onOpenChange={(v) => { if (!v) setRegVehicle(null); }}
        vehicle={regVehicle}
        kind="registration"
      />

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <Card data-testid="fleet-kpi-insurance-expired">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Insurance expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{isLoading ? '…' : summary.insuranceExpired}</div>
          </CardContent>
        </Card>

        <Card data-testid="fleet-kpi-insurance-30d">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Insurance &lt; 30d
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{isLoading ? '…' : summary.insuranceExpiring30d}</div>
          </CardContent>
        </Card>

        <Card data-testid="fleet-kpi-reg-expired">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-500" />
              Registration expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{isLoading ? '…' : summary.registrationExpired}</div>
          </CardContent>
        </Card>

        <Card data-testid="fleet-kpi-reg-30d">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Registration &lt; 30d
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{isLoading ? '…' : summary.registrationExpiring30d}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet status ({summary.total} vehicles)</CardTitle>
          <CardDescription>
            Click "Update" to record a renewal. Saves to PATCH /api/vehicles/:id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Vehicle</th>
                    <th className="py-2 pr-3">Plate</th>
                    <th className="py-2 pr-3">Insurance</th>
                    <th className="py-2 pr-3">Insurance expires</th>
                    <th className="py-2 pr-3">Registration</th>
                    <th className="py-2 pr-3">Registration expires</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="py-2 pr-3">{v.make} {v.model}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{v.licensePlate || '—'}</td>
                      <td className="py-2 pr-3">{bucketBadge(v.insurance.bucket)}</td>
                      <td className="py-2 pr-3">{formatDate(v.insurance.expiresAt)}</td>
                      <td className="py-2 pr-3">{bucketBadge(v.registration.bucket)}</td>
                      <td className="py-2 pr-3">{formatDate(v.registration.expiresAt)}</td>
                      <td className="py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setInsuranceVehicle(v)}
                            data-testid={`button-update-insurance-${v.id}`}
                          >
                            Insurance
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRegVehicle(v)}
                            data-testid={`button-update-registration-${v.id}`}
                          >
                            Registration
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </CanvasHubPage>
  );
}
