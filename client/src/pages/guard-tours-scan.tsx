/**
 * Guard Tour Scan Page — Readiness Section 27 #4
 *
 * Wires the previously unmounted GuardTourScanner component (§20) to the
 * existing POST /api/guard-tours/scans endpoint. Officer opens this page,
 * scans QR (or types the checkpoint code), backend logs it, success/fail
 * is shown inline.
 *
 * Does NOT add new endpoints — pairs exclusively with:
 *   GET  /api/guard-tours/tours/:tourId/checkpoints
 *   POST /api/guard-tours/scans
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { GuardTourScanner } from "@/components/mobile/GuardTourScanner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ShieldCheck } from "lucide-react";

interface Tour {
  id: string;
  name: string;
  status: string;
  assignedEmployeeId?: string | null;
}

interface Checkpoint {
  id: string;
  tourId: string;
  name: string;
  code?: string | null;
  description?: string | null;
}

export default function GuardTourScanPage(): JSX.Element {
  const { user } = useAuth();
  const employeeId = (user as Record<string,unknown>)?.employeeId || null;

  const [lastScan, setLastScan] = useState<{ checkpointName: string; at: Date } | null>(null);

  const { data: tours = [] } = useQuery<Tour[]>({
    queryKey: ["/api/guard-tours/tours"],
  });

  // Pick the first active tour assigned to this officer; fall back to any active.
  const activeTour = useMemo(() => {
    if (!tours.length) return null;
    return tours.find((t) => t.status === "active" && t.assignedEmployeeId === employeeId)
      || tours.find((t) => t.status === "active")
      || null;
  }, [tours, employeeId]);

  const { data: checkpoints = [] } = useQuery<Checkpoint[]>({
    queryKey: ["/api/guard-tours/tours", activeTour?.id, "checkpoints"],
    enabled: !!activeTour?.id,
  });

  async function handleScan(code: string): Promise<void> {
    if (!activeTour) throw new Error("No active tour to scan against.");
    // Match the scanned code to a known checkpoint by id or code.
    const match = checkpoints.find((c) => c.id === code || c.code === code);
    if (!match) {
      throw new Error(`No checkpoint matches code "${code.slice(0, 16)}" on this tour.`);
    }
    await apiRequest("POST", "/api/guard-tours/scans", {
      tourId: activeTour.id,
      checkpointId: match.id,
      employeeId: employeeId || undefined,
      scannedAt: new Date().toISOString(),
      scanMethod: "qr",
      status: "completed",
    });
    setLastScan({ checkpointName: match.name, at: new Date() });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Guard Tour Check-in</h1>
        </div>

        {activeTour ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{activeTour.name}</span>
                <Badge variant="secondary">Active</Badge>
              </CardTitle>
              <CardDescription>
                {checkpoints.length} checkpoint{checkpoints.length === 1 ? "" : "s"} on this tour.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GuardTourScanner
                onScan={handleScan}
                instructionsLabel="Point the camera at the checkpoint QR code or NFC placard."
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No active guard tour assigned. Contact your supervisor.
            </CardContent>
          </Card>
        )}

        {lastScan && (
          <Card data-testid="last-scan-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                Last scan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="font-medium">{lastScan.checkpointName}</span>
                <span className="text-xs text-muted-foreground">
                  {lastScan.at.toLocaleTimeString()}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {checkpoints.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Checkpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {checkpoints.map((c) => (
                  <li key={c.id} className="py-2 flex justify-between">
                    <span>{c.name}</span>
                    {c.code && <span className="font-mono text-xs text-muted-foreground">{c.code}</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
