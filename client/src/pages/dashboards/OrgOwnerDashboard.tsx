import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DollarSign, Users, Building2, FileText, AlertCircle, Receipt, Activity, ShieldCheck, Copy, KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatters";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { ComplianceScoreWidget } from "@/components/dashboard/ComplianceScoreWidget";

const pageConfig: CanvasPageConfig = {
  id: "org-owner-dashboard",
  title: "Owner Dashboard",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

export default function OrgOwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: workspace } = useQuery<{ id: string; name?: string; orgId?: string; organizationId?: string }>({
    queryKey: ["/api/workspace/current"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: pinStatus } = useQuery<{ hasPin: boolean }>({
    queryKey: ["/api/identity/pin/owner/status"],
    staleTime: 30_000,
  });

  const [pinInput, setPinInput] = useState("");
  const [pinCopied, setPinCopied] = useState(false);

  const setPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest("POST", "/api/identity/pin/owner/set", { pin });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Owner PIN saved", description: "Trinity and support agents can now verify you with this PIN." });
      setPinInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/identity/pin/owner/status"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save PIN",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const clearPinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/identity/pin/owner");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Owner PIN cleared" });
      queryClient.invalidateQueries({ queryKey: ["/api/identity/pin/owner/status"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not clear PIN",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const orgCode = workspace?.orgId || workspace?.organizationId || null;
  const copyOrgCode = () => {
    if (!orgCode) return;
    navigator.clipboard.writeText(orgCode);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 1500);
  };

  const { data: clients } = useQuery<{ data: any[] } | any[]>({
    queryKey: ["/api/clients"],
    staleTime: 60000,
  });

  const { data: employeesRes } = useQuery<{ data: any[] }>({
    queryKey: ["/api/employees"],
    staleTime: 60000,
  });

  const { data: invoices } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
    staleTime: 60000,
  });

  const clientList = Array.isArray(clients) ? clients : (clients as any)?.data ?? [];
  const activeClients = clientList.filter((c: any) => c.status === "active" || !c.status).length;
  const totalEmployees = employeesRes?.data?.length ?? 0;

  const invoiceList: any[] = Array.isArray(invoices) ? invoices : [];
  const outstandingInvoices = invoiceList.filter((inv: any) => inv.status === "sent" || inv.status === "overdue");
  const outstandingTotal = outstandingInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);

  const orgName = workspace?.name ?? "Your Organization";

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{orgName} — Owner Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {user?.firstName || user?.email?.split("@")[0] || "Owner"}
          </p>
        </div>

        {/* Identity & PIN — tenant universal code + secondary factor */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-muted rounded-lg">
              <ShieldCheck className="w-5 h-5 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Tenant Identity &amp; Owner PIN</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your organization code is how Trinity, HelpAI, and human support agents identify
                your tenant across voice, SMS, email, and dockchat. Set an owner PIN so nobody
                can impersonate you even if they know your code.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Organization Code
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="font-mono text-sm text-foreground break-all"
                  data-testid="owner-dashboard-org-code"
                >
                  {orgCode || "Not assigned — contact support"}
                </code>
                {orgCode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyOrgCode}
                    className="h-7 px-2"
                    data-testid="copy-org-code-button"
                  >
                    {pinCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Share this with support so they can find your tenant instantly.
              </p>
            </div>

            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner Verification PIN
                </p>
                {pinStatus?.hasPin ? (
                  <Badge variant="secondary" className="text-xs">PIN set</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Not set</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="4–8 digits"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  className="h-8 text-sm font-mono"
                  data-testid="owner-pin-input"
                />
                <Button
                  size="sm"
                  onClick={() => setPinMutation.mutate(pinInput)}
                  disabled={pinInput.length < 4 || setPinMutation.isPending}
                  data-testid="set-owner-pin-button"
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1" />
                  {pinStatus?.hasPin ? "Update" : "Set PIN"}
                </Button>
                {pinStatus?.hasPin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearPinMutation.mutate()}
                    disabled={clearPinMutation.isPending}
                    data-testid="clear-owner-pin-button"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Never share your PIN. Support will only ask for it to verify your identity,
                never to perform an action for you.
              </p>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding AR</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {outstandingTotal > 0 ? formatCurrency(outstandingTotal) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{outstandingInvoices.length} invoice(s) unpaid</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Clients</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{activeClients || "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Employees</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalEmployees || "—"}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Invoices</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{invoiceList.length || "—"}</p>
          </div>
        </div>

        {/* Readiness Section 27 #9 — compliance score widget */}
        <ComplianceScoreWidget />

        {/* Data cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Invoice pipeline */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Receipt className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Invoice Pipeline</p>
                  <p className="text-xs text-muted-foreground">Draft / Sent / Overdue</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/invoices")} className="text-xs">
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {(["draft", "sent", "overdue"] as const).map((status) => {
                const count = invoiceList.filter((inv: any) => inv.status === status).length;
                return (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{status}</span>
                    <Badge variant={status === "overdue" ? "destructive" : "secondary"} className="text-xs">
                      {count}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Client list */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Building2 className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Clients</p>
                  <p className="text-xs text-muted-foreground">{activeClients} active</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/clients")} className="text-xs">
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {clientList.slice(0, 4).map((client: any) => (
                <div key={client.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate max-w-[160px]">{client.name || client.companyName}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{client.status ?? "active"}</Badge>
                </div>
              ))}
              {clientList.length === 0 && (
                <p className="text-xs text-muted-foreground">No clients yet</p>
              )}
            </div>
          </div>

          {/* Trinity activity */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Activity className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Trinity AI Activity</p>
                  <p className="text-xs text-muted-foreground">Recent autonomous decisions</p>
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/trinity/transparency")} className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              View AI Decisions
            </Button>
          </div>

          {/* Quick links */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <FileText className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Owner Actions</p>
                <p className="text-xs text-muted-foreground">Management shortcuts</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/payroll")} className="text-xs justify-start">
                <DollarSign className="w-3 h-3 mr-2" />
                Payroll
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/employees")} className="text-xs justify-start">
                <Users className="w-3 h-3 mr-2" />
                Manage Employees
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/compliance")} className="text-xs justify-start">
                <AlertCircle className="w-3 h-3 mr-2" />
                Compliance Status
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
