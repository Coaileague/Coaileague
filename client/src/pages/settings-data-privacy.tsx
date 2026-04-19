/**
 * Settings → Data & Privacy — Section 27 wiring
 * ===============================================
 * Owner-facing page with two capabilities:
 *
 *   #7  POST /api/exports/tenant-takeout
 *       Downloads a full workspace data export (employees, clients,
 *       shifts, invoices, payroll, audit log, armory, NDA acceptances).
 *
 *   GDPR deletion request (existing — not in this wave, linked for clarity)
 *
 * Backend endpoints already exist. This page is the missing UI trigger.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, FileArchive, Loader2, Shield } from "lucide-react";
import { getCsrfToken } from "@/lib/csrf";

export default function SettingsDataPrivacyPage(): JSX.Element {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function runTakeout(): Promise<void> {
    setPending(true);
    try {
      // Native fetch — we need to stream the blob, not apiRequest's default
      // JSON handling.
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/exports/tenant-takeout", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-takeout-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Download started." });
      setConfirmOpen(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Data &amp; Privacy</h1>
            <p className="text-sm text-muted-foreground">Export and retention controls for your organization's data.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-4 w-4" /> Export all my organization's data
            </CardTitle>
            <CardDescription>
              Produces a single JSON archive containing every workspace-scoped
              row we hold: employees, clients, shifts, timesheets, invoices,
              payroll runs, audit log, armory (inspections / qualifications /
              ammo inventory + ledger), and any auditor NDA acceptances
              tied to audits against your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Employees</Badge>
              <Badge variant="secondary">Shifts + timesheets</Badge>
              <Badge variant="secondary">Invoices + payroll</Badge>
              <Badge variant="secondary">Audit log</Badge>
              <Badge variant="secondary">Armory</Badge>
              <Badge variant="secondary">Auditor NDAs</Badge>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              data-testid="button-open-tenant-takeout"
            >
              <Download className="h-4 w-4 mr-2" /> Start export
            </Button>
            <p className="text-xs text-muted-foreground">
              Owner/co-owner only. Every export writes an audit-log row.
              Large organizations may take several minutes; don't close this
              tab once the export starts.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="dialog-tenant-takeout-confirm">
          <DialogHeader>
            <DialogTitle>Confirm data export</DialogTitle>
            <DialogDescription>
              This will download a JSON file containing all of your
              organization's data. The export is logged in the platform
              audit trail. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={runTakeout} disabled={pending} data-testid="button-confirm-tenant-takeout">
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Export now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
