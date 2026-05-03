import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Wallet, Receipt, TrendingUp, FileSpreadsheet, Building2,
  Calendar, Download, Printer, ChevronRight,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

interface ClientLite {
  id: string;
  companyName: string | null;
  firstName: string;
  lastName: string;
}

const REPORT_DEFS = [
  {
    id: "profit-loss",
    name: "Profit & Loss",
    desc: "Revenue, direct labor, expenses, net income, and margin.",
    icon: TrendingUp,
    color: "text-emerald-500",
    kind: "period" as const,
    endpoint: (q: string) => `/api/financial-reports/profit-loss?${q}`,
  },
  {
    id: "balance-sheet",
    name: "Balance Sheet",
    desc: "Assets, liabilities, and equity at a point in time.",
    icon: Building2,
    color: "text-blue-500",
    kind: "point" as const,
    endpoint: (q: string) => `/api/financial-reports/balance-sheet?${q}`,
  },
  {
    id: "cash-flow",
    name: "Cash Flow",
    desc: "Cash in vs payroll & expenses out, by month.",
    icon: Wallet,
    color: "text-teal-500",
    kind: "period" as const,
    endpoint: (q: string) => `/api/financial-reports/cash-flow?${q}`,
  },
  {
    id: "ar-aging",
    name: "AR Aging",
    desc: "Unpaid invoices bucketed by days overdue.",
    icon: Receipt,
    color: "text-amber-500",
    kind: "point" as const,
    endpoint: (q: string) => `/api/financial-reports/ar-aging?${q}`,
  },
  {
    id: "ap-aging",
    name: "AP Aging",
    desc: "Unpaid expenses bucketed by age.",
    icon: FileSpreadsheet,
    color: "text-rose-500",
    kind: "point" as const,
    endpoint: (q: string) => `/api/financial-reports/ap-aging?${q}`,
  },
  {
    id: "expense-report",
    name: "Expense Report",
    desc: "All expenses in the period with vendor and status.",
    icon: FileText,
    color: "text-violet-500",
    kind: "period" as const,
    endpoint: (q: string) => `/api/financial-reports/expense-report?${q}`,
  },
  {
    id: "account-statement",
    name: "Client Statement",
    desc: "Per-client statement: opening, charges, payments, closing.",
    icon: FileText,
    color: "text-cyan-500",
    kind: "period+client" as const,
    endpoint: (q: string, clientId?: string) =>
      `/api/financial-reports/account-statement/${clientId ?? ""}?${q}`,
  },
];

type ReportDef = typeof REPORT_DEFS[number];

// ── PDF download / print actions ───────────────────────────────────────────

async function fetchPdf(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Report failed (${res.status}): ${msg.slice(0, 200)}`);
  }
  return res.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPrintWindow(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url);
  if (w) {
    w.onload = () => {
      try {
        w.focus();
        w.print();
      } catch {
        // Browser will surface its own dialog
      }
    };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function FinancialReportsPage() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(firstOfMonthISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [asOf, setAsOf] = useState(todayISO());
  const [clientId, setClientId] = useState<string>("");
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const { data: clientsData } = useQuery<ClientLite[]>({
    queryKey: ["/api/clients"],
    enabled: REPORT_DEFS.find(r => r.id === selected)?.kind === "period+client",
  });
  const clients: ClientLite[] = Array.isArray(clientsData) ? clientsData : [];

  const def: ReportDef | undefined = selected
    ? REPORT_DEFS.find(r => r.id === selected)
    : undefined;

  function buildUrl(d: ReportDef): string {
    const params = new URLSearchParams();
    if (d.kind === "period" || d.kind === "period+client") {
      params.set("startDate", new Date(startDate).toISOString());
      params.set("endDate", new Date(endDate + "T23:59:59").toISOString());
    }
    if (d.kind === "point") {
      params.set("asOf", new Date(asOf + "T23:59:59").toISOString());
    }
    return d.endpoint(params.toString(), clientId || undefined);
  }

  async function action(kind: "download" | "print") {
    if (!def) return;
    if (def.kind === "period+client" && !clientId) {
      toast({ title: "Pick a client", description: "Client statements require a client.", variant: "destructive" });
      return;
    }
    setBusy(kind);
    try {
      const blob = await fetchPdf(buildUrl(def));
      const fname = `${def.id}-${(def.kind === "point" ? asOf : endDate)}.pdf`;
      if (kind === "download") downloadBlob(blob, fname);
      else openPrintWindow(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Report generation failed";
      toast({ title: "Could not generate report", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Branded PDFs generated from scratch by Trinity. Pick a report, set the
          range, then download or print.
        </p>
      </header>

      {!def && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_DEFS.map(r => (
            <Card
              key={r.id}
              className="cursor-pointer hover-elevate transition-all"
              onClick={() => setSelected(r.id)}
              data-testid={`card-financial-report-${r.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md">
                    <r.icon className={`w-5 h-5 ${r.color}`} />
                  </div>
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{r.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {def && (
        <Card data-testid={`panel-report-${def.id}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md">
                <def.icon className={`w-5 h-5 ${def.color}`} />
              </div>
              <div className="flex-1">
                <CardTitle>{def.name}</CardTitle>
                <CardDescription>{def.desc}</CardDescription>
              </div>
              <Button
                variant="ghost"
                onClick={() => setSelected(null)}
                data-testid="button-back-to-reports"
              >
                ← Back
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {(def.kind === "period" || def.kind === "period+client") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start date</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Input
                      id="start-date" type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="end-date">End date</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Input
                      id="end-date" type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </div>
            )}

            {def.kind === "point" && (
              <div>
                <Label htmlFor="as-of">As of</Label>
                <div className="flex items-center gap-2 mt-1 max-w-xs">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Input
                    id="as-of" type="date"
                    value={asOf}
                    onChange={e => setAsOf(e.target.value)}
                    data-testid="input-as-of"
                  />
                </div>
              </div>
            )}

            {def.kind === "period+client" && (
              <div>
                <Label htmlFor="client">Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id="client" className="max-w-md mt-1" data-testid="select-client">
                    <SelectValue placeholder="Pick a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName || `${c.firstName} ${c.lastName}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => action("download")}
                disabled={busy !== null}
                data-testid="button-download-report"
              >
                <Download className="w-4 h-4 mr-2" />
                {busy === "download" ? "Generating…" : "Download PDF"}
              </Button>
              <Button
                variant="outline"
                onClick={() => action("print")}
                disabled={busy !== null}
                data-testid="button-print-report"
              >
                <Printer className="w-4 h-4 mr-2" />
                {busy === "print" ? "Opening…" : "Print"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
