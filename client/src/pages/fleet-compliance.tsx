/**
 * Fleet Compliance Panel — Readiness Section 14
 * Surfaces vehicle registration + insurance expiry alerts. Pairs with
 * GET /api/vehicles/compliance. Mirrors the armory-compliance pattern.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, ShieldAlert } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

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
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function FleetCompliancePage(): JSX.Element {
  const { data, isLoading } = useQuery<VehicleComplianceResponse>({
    queryKey: ['/api/vehicles/compliance'],
  });

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
            One row per vehicle. Red buckets need immediate attention — an
            expired registration or insurance pulls the vehicle off the
            compliance roster and blocks scheduling it to a billable shift.
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
                    <th className="py-2">Registration expires</th>
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
                      <td className="py-2">{formatDate(v.registration.expiresAt)}</td>
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
