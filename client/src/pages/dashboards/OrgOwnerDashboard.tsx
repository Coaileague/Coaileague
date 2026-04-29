import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  DollarSign,
  Users,
  Building2,
  FileText,
  AlertCircle,
  Receipt,
  Activity,
  ShieldCheck,
  Copy,
  KeyRound,
  Check,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { PageSkeleton } from "@/components/ui/skeleton-loaders";
import { StatusBadge, MetricCard, MetricGrid, ActionResult } from "@/components/ui/metric-card";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatters";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { ComplianceScoreWidget } from "@/components/dashboard/ComplianceScoreWidget";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { TrinityApprovalQueue } from "@/components/trinity/TrinityApprovalQueue";

const pageConfig: CanvasPageConfig = {
  id: "org-owner-dashboard",
  title: "Owner Dashboard",
  category: "dashboard",
  variant: "standard",
  showHeader: false,
};

type WorkspaceSummary = {
  id: string;
  name?: string;
  orgId?: string;
  organizationId?: string;
};

type SetupAction = {
  label: string;
  description: string;
  href: string | null;
  action: (() => void) | null;
};

export default function OrgOwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const {
    data: workspace,
    isLoading: workspaceLoading,
    isError: workspaceIsError,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useQuery<WorkspaceSummary>({
    queryKey: ["/api/workspace/current"],
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: pinStatus,
    isError: pinStatusIsError,
    error: pinStatusError,
    refetch: refetchPinStatus,
  } = useQuery<{ hasPin: boolean }>({
    queryKey: ["/api/identity/pin/owner/status"],
    staleTime: 30_000,
  });

  const [pinInput, setPinInput] = useState("");
  const [modalPinInput, setModalPinInput] = useState("");
  const [pinCopied, setPinCopied] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);

  useEffect(() => {
    if (!pinStatus) return;
    const dismissed =
      typeof window !== "undefined" &&
      window.localStorage.getItem("pin-setup-dismissed") === "1";
    if (pinStatus.hasPin === false && !dismissed) {
      setShowPinSetupModal(true);
    }
  }, [pinStatus?.hasPin]);

  const setPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest("POST", "/api/identity/pin/owner/set", { pin });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Owner PIN saved",
        description: "Trinity and support agents can now verify you with this PIN.",
      });
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

  const {
    data: clients,
    isLoading: clientsLoading,
    isError: clientsIsError,
    error: clientsError,
    refetch: refetchClients,
  } = useQuery<{ data: any[] } | any[]>({
    queryKey: ["/api/clients"],
    staleTime: 60_000,
  });

  const {
    data: employeesRes,
    isLoading: employeesLoading,
    isError: employeesIsError,
    error: employeesError,
    refetch: refetchEmployees,
  } = useQuery<{ data: any[] }>({
    queryKey: ["/api/employees"],
    staleTime: 60_000,
  });

  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesIsError,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
    staleTime: 60_000,
  });

  const isDashboardLoading =
    workspaceLoading || clientsLoading || employeesLoading || invoicesLoading;
  const isDashboardError =
    workspaceIsError ||
    pinStatusIsError ||
    clientsIsError ||
    employeesIsError ||
    invoicesIsError;
  const dashboardError =
    workspaceError ||
    pinStatusError ||
    clientsError ||
    employeesError ||
    invoicesError;

  const orgCode = workspace?.orgId || workspace?.organizationId || null;
  const clientList = Array.isArray(clients) ? clients : (clients as any)?.data ?? [];
  const activeClients = clientList.filter(
    (client: any) => client.status === "active" || !client.status,
  ).length;
  const totalEmployees = employeesRes?.data?.length ?? 0;
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const outstandingInvoices = invoiceList.filter(
    (invoice: any) => invoice.status === "sent" || invoice.status === "overdue",
  );
  const outstandingTotal = outstandingInvoices.reduce(
    (sum: number, invoice: any) => sum + (Number(invoice.totalAmount) || Number(invoice.subtotal) || Number(invoice.amount) || 0),
    0,
  );
  const draftInvoices = invoiceList.filter((invoice: any) => invoice.status === "draft").length;
  const orgName = workspace?.name ?? "Your Organization";
  const needsAttentionCount = [
    !pinStatus?.hasPin,
    !orgCode,
    activeClients === 0,
    totalEmployees <= 1,
    invoiceList.length === 0,
  ].filter(Boolean).length;
  const setupActions: SetupAction[] = [
    !pinStatus?.hasPin
      ? {
          label: "Set owner PIN",
          description: "Enable caller verification for support and Trinity.",
          href: null,
          action: () => setShowPinSetupModal(true),
        }
      : null,
    !orgCode
      ? {
          label: "Resolve organization code",
          description: "Contact support so your tenant can be identified correctly.",
          href: "/support",
          action: null,
        }
      : null,
    activeClients === 0
      ? {
          label: "Add your first client",
          description: "Unlock billing, scheduling, and service activity.",
          href: "/clients",
          action: null,
        }
      : null,
    totalEmployees <= 1
      ? {
          label: "Invite employees",
          description: "Seed real staffing data beyond the owner account.",
          href: "/employees",
          action: null,
        }
      : null,
    invoiceList.length === 0
      ? {
          label: "Create first invoice",
          description: "Turn billing on and start tracking receivables.",
          href: "/invoices",
          action: null,
        }
      : null,
  ].filter(Boolean) as SetupAction[];

  const copyOrgCode = async () => {
    if (!orgCode) return;
    await navigator.clipboard.writeText(orgCode);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 1500);
  };

  if (isDashboardLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <PageSkeleton />
      </CanvasHubPage>
    );
  }

  if (isDashboardError) {
    return (
      <CanvasHubPage config={pageConfig}>
        <DashboardLoadError
          message={
            dashboardError instanceof Error
              ? dashboardError.message
              : "An unexpected error occurred"
          }
          onRetry={() => {
            void Promise.allSettled([
              refetchWorkspace(),
              refetchPinStatus(),
              refetchClients(),
              refetchEmployees(),
              refetchInvoices(),
            ]);
          }}
        />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{orgName} - Owner Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {user?.firstName || user?.email?.split("@")[0] || "Owner"}
          </p>
        </div>

        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/15 p-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary"
                >
                  {needsAttentionCount > 0
                    ? `${needsAttentionCount} setup item${
                        needsAttentionCount === 1 ? "" : "s"
                      } to review`
                    : "Operationally ready"}
                </Badge>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Keep the workspace moving forward
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This page now surfaces the next real actions for a new or lightly
                  seeded tenant, so an empty workspace feels intentional instead of
                  abandoned.
                </p>
              </div>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/80 bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Draft invoices
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">{draftInvoices}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ready to review or send
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Unpaid invoices
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {outstandingInvoices.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Need collection follow-up
                </p>
              </div>
            </div>
          </div>

          {setupActions.length > 0 && (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {setupActions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.action) {
                      item.action();
                      return;
                    }
                    if (item.href) setLocation(item.href);
                  }}
                  className="rounded-lg border border-border bg-background/80 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2">
              <ShieldCheck className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Tenant Identity and Owner PIN</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your organization code is how Trinity, HelpAI, and support identify
                your tenant across voice, SMS, email, and dock chat. Set an owner PIN
                so nobody can impersonate you even if they know your code.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Organization Code
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="break-all font-mono text-sm text-foreground"
                  data-testid="owner-dashboard-org-code"
                >
                  {orgCode || "Not assigned - contact support"}
                </code>
                {orgCode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyOrgCode}
                    className="h-7 px-2"
                    data-testid="copy-org-code-button"
                  >
                    {pinCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Share this with support so they can find your tenant instantly.
              </p>
            </div>

            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner Verification PIN
                </p>
                {pinStatus?.hasPin ? (
                  <Badge variant="secondary" className="text-xs">
                    PIN set
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    Not set
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="4-8 digits"
                  value={pinInput}
                  onChange={(event) =>
                    setPinInput(event.target.value.replace(/\D/g, ""))
                  }
                  className="h-8 font-mono text-sm"
                  data-testid="owner-pin-input"
                />
                <Button
                  size="sm"
                  onClick={() => setPinMutation.mutate(pinInput)}
                  disabled={pinInput.length < 4 || setPinMutation.isPending}
                  data-testid="set-owner-pin-button"
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
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
              <p className="mt-2 text-xs text-muted-foreground">
                Never share your PIN. Support will only ask for it to verify your
                identity, never to perform an action for you.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Outstanding AR
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(outstandingTotal)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {outstandingInvoices.length} invoice(s) unpaid
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active Clients
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">{activeClients}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeClients === 0
                ? "Add a client to unlock billing and scheduling"
                : "Accounts currently live"}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Employees
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalEmployees}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalEmployees <= 1
                ? "Invite your first team members to expand operations"
                : "People currently active in the workspace"}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Invoices
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">{invoiceList.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {invoiceList.length === 0
                ? "Create an invoice to start revenue tracking"
                : "Documents generated so far"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <TrinityApprovalQueue />
        </div>

        <ComplianceScoreWidget />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <Receipt className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Invoice Pipeline</p>
                  <p className="text-xs text-muted-foreground">Draft / Sent / Overdue</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/invoices")}
                className="text-xs"
              >
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {invoiceList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm">
                  <p className="font-medium text-foreground">Billing has not started yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Create or auto-generate your first invoice to light up draft, sent,
                    and overdue tracking here.
                  </p>
                  <Button size="sm" className="mt-3" onClick={() => setLocation("/invoices")}>
                    Open Billing
                  </Button>
                </div>
              ) : (
                (["draft", "sent", "overdue"] as const).map((status) => {
                  const count = invoiceList.filter((invoice: any) => invoice.status === status).length;
                  return (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{status}</span>
                      <Badge
                        variant={status === "overdue" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {count}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <Building2 className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Clients</p>
                  <p className="text-xs text-muted-foreground">{activeClients} active</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/clients")}
                className="text-xs"
              >
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {clientList.slice(0, 4).map((client: any) => (
                <div key={client.id} className="flex items-center justify-between text-sm">
                  <span className="max-w-[160px] truncate text-foreground">
                    {client.name || client.companyName}
                  </span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {client.status ?? "active"}
                  </Badge>
                </div>
              ))}
              {clientList.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm">
                  <p className="font-medium text-foreground">No clients are onboarded yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Add a client record first so schedules, invoices, and service
                    requests have somewhere real to land.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setLocation("/clients")}
                  >
                    Add Client
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <Activity className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Trinity Activity</p>
                  <p className="text-xs text-muted-foreground">
                    Recent autonomous decisions and cost visibility
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="font-medium text-foreground">Transparency is live</p>
              <p className="mt-1 text-muted-foreground">
                Review autonomous actions, costs, and decision history to confirm
                Trinity is acting within your operational expectations.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/trinity/transparency")}
                className="mt-3 text-xs"
              >
                <Activity className="mr-1 h-3 w-3" />
                View AI Decisions
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Owner Actions</p>
                <p className="text-xs text-muted-foreground">
                  Management shortcuts for the next operating move
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/payroll")}
                className="justify-between text-xs"
              >
                <span className="flex items-center">
                  <DollarSign className="mr-2 h-3 w-3" />
                  Payroll
                </span>
                <ArrowRight className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/employees")}
                className="justify-between text-xs"
              >
                <span className="flex items-center">
                  <Users className="mr-2 h-3 w-3" />
                  Manage Employees
                </span>
                <ArrowRight className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/compliance")}
                className="justify-between text-xs"
              >
                <span className="flex items-center">
                  <AlertCircle className="mr-2 h-3 w-3" />
                  Compliance Status
                </span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showPinSetupModal} onOpenChange={setShowPinSetupModal}>
        <DialogContent data-testid="owner-pin-setup-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-600" />
              Set Your Owner PIN
            </DialogTitle>
            <DialogDescription>
              Your Owner PIN lets Trinity verify your identity when you call
              (866) 464-4151 for account management. Takes 30 seconds to set up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="4-8 digits"
              value={modalPinInput}
              onChange={(event) =>
                setModalPinInput(event.target.value.replace(/\D/g, ""))
              }
              data-testid="owner-pin-modal-input"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Keep your PIN private. Support will only ask for it to verify you.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowPinSetupModal(false);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("pin-setup-dismissed", "1");
                }
              }}
              data-testid="owner-pin-modal-dismiss"
            >
              Remind me later
            </Button>
            <Button
              disabled={modalPinInput.length < 4 || setPinMutation.isPending}
              onClick={() =>
                setPinMutation.mutate(modalPinInput, {
                  onSuccess: () => {
                    setShowPinSetupModal(false);
                    setModalPinInput("");
                  },
                })
              }
              data-testid="owner-pin-modal-save"
            >
              {setPinMutation.isPending ? "Saving..." : "Save PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasHubPage>
  );
}
