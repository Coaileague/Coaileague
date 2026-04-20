/**
 * Phase 41 — Subscription Dashboard
 *
 * Full subscription lifecycle view:
 *   - FSM state indicator (trial / active / past_due / suspended / cancelled / pending_cancel)
 *   - Trial countdown banner
 *   - Dunning warning for past_due
 *   - Read-only suspension banner
 *   - Plan summary and usage limits
 *   - Recent invoices
 *   - Cancel subscription with optional churn-reason capture
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "pending_cancel"
  | "suspended"
  | "cancelled"
  | "inactive"
  | string;

interface SubscriptionData {
  tier: string;
  status: SubscriptionStatus;
  billingCycle: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  credits: { total: number; used: number; remaining: number };
  limits: { maxEmployees: number; currentEmployees: number; employeesRemaining: number };
}

interface Invoice {
  id: string;
  number: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  created: number;
  hostedInvoiceUrl: string | null;
}

interface AccountStatus {
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  dunningAttempts?: number;
  nextPaymentAttempt?: string | null;
  cancellationReason?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Status config ────────────────────────────────────────────────────────────

function statusConfig(status: SubscriptionStatus): {
  label: string;
  color: "default" | "destructive" | "secondary" | "outline";
  icon: React.ComponentType<{ className?: string }>;
  description: string;
} {
  switch (status) {
    case "trial":
      return {
        label: "Trial",
        color: "secondary",
        icon: Clock,
        description: "Free trial period",
      };
    case "active":
      return {
        label: "Active",
        color: "default",
        icon: BadgeCheck,
        description: "Subscription in good standing",
      };
    case "pending_cancel":
      return {
        label: "Cancelling",
        color: "secondary",
        icon: CalendarClock,
        description: "Will cancel at end of billing period",
      };
    case "past_due":
      return {
        label: "Past Due",
        color: "destructive",
        icon: AlertTriangle,
        description: "Payment failed — retrying automatically",
      };
    case "suspended":
      return {
        label: "Suspended",
        color: "destructive",
        icon: PauseCircle,
        description: "Account in read-only mode",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        color: "outline",
        icon: XCircle,
        description: "Subscription ended",
      };
    default:
      return {
        label: status || "Unknown",
        color: "secondary",
        icon: Info,
        description: "",
      };
  }
}

// ─── Cancel form schema ───────────────────────────────────────────────────────

const cancelSchema = z.object({
  reason: z
    .string()
    .max(500, "Keep it under 500 characters")
    .optional(),
});

type CancelFormValues = z.infer<typeof cancelSchema>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function SubscriptionDashboard() {
  const { toast } = useToast();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: sub, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/billing/subscription"],
  });

  const { data: accountStatus, isLoading: accountLoading } = useQuery<AccountStatus>({
    queryKey: ["/api/billing/account/status"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  // ── Cancel mutation ───────────────────────────────────────────────────────
  const cancelForm = useForm<CancelFormValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: "" },
  });

  const cancelMutation = useMutation({
    mutationFn: (values: CancelFormValues) =>
      apiRequest("POST", "/api/billing/subscription/cancel", {
        immediate: false,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/account/status"] });
      setCancelDialogOpen(false);
      toast({
        title: "Cancellation scheduled",
        description:
          "Your subscription will cancel at the end of the current billing period. You retain full access until then.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation failed",
        description: error?.message || "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const onCancelSubmit = (values: CancelFormValues) => cancelMutation.mutate(values);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (subLoading || accountLoading) {
    return (
      <div
        className="flex items-center justify-center h-64"
        data-testid="subscription-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = (sub?.status || "inactive") as SubscriptionStatus;
  const cfg = statusConfig(status);
  const StatusIcon = cfg.icon;
  const trialDays = daysUntil(accountStatus?.trialEndsAt);
  const periodEndDays = daysUntil(sub?.currentPeriodEnd);
  const employeePct =
    sub && sub.limits.maxEmployees > 0
      ? Math.round((sub.limits.currentEmployees / sub.limits.maxEmployees) * 100)
      : 0;

  const isTrialing = status === "trial";
  const isPastDue = status === "past_due";
  const isSuspended = status === "suspended";
  const isCancelled = status === "cancelled";
  const isPendingCancel = status === "pending_cancel";
  const canCancel = ["trial", "active"].includes(status);

  return (
    <div className="container max-w-3xl mx-auto p-6 space-y-6" data-testid="subscription-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Subscription
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your plan, billing, and account status
          </p>
        </div>
        <Link href="/settings?tab=billing">
          <Button variant="outline" size="sm" data-testid="button-billing-settings">
            <CreditCard className="mr-2 h-4 w-4" />
            Billing settings
          </Button>
        </Link>
      </div>

      {/* ── Lifecycle status banners ── */}

      {isTrialing && trialDays !== null && (
        <Card
          className={`border ${trialDays <= 2 ? "border-destructive/60" : "border-yellow-500/40"}`}
          data-testid="banner-trial"
        >
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Clock
              className={`h-5 w-5 shrink-0 ${trialDays <= 2 ? "text-destructive" : "text-yellow-500"}`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" data-testid="text-trial-days">
                {trialDays === 0
                  ? "Your trial expires today"
                  : `Trial ends in ${trialDays} day${trialDays !== 1 ? "s" : ""}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Add a payment method to keep full access after{" "}
                {formatDate(accountStatus?.trialEndsAt)}.
              </p>
            </div>
            <Link href="/settings?tab=billing">
              <Button size="sm" data-testid="button-trial-add-payment">
                <CreditCard className="mr-2 h-3 w-3" />
                Add payment method
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isPastDue && (
        <Card className="border border-destructive/60" data-testid="banner-past-due">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Payment past due</p>
              <p className="text-xs text-muted-foreground">
                We&apos;re retrying your payment automatically
                {accountStatus?.nextPaymentAttempt
                  ? ` — next attempt on ${formatDate(accountStatus.nextPaymentAttempt)}`
                  : ""}
                . Update your card to avoid suspension.
              </p>
            </div>
            <Link href="/settings?tab=billing">
              <Button size="sm" variant="destructive" data-testid="button-past-due-update">
                <CreditCard className="mr-2 h-3 w-3" />
                Update payment
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isSuspended && (
        <Card className="border border-destructive/80" data-testid="banner-suspended">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Account suspended — read-only mode</p>
              <p className="text-xs text-muted-foreground">
                All data is preserved. Resolve your payment to restore full access.
              </p>
            </div>
            <Link href="/settings?tab=billing">
              <Button size="sm" variant="destructive" data-testid="button-suspended-resolve">
                <RefreshCw className="mr-2 h-3 w-3" />
                Resolve payment
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isPendingCancel && (
        <Card className="border border-muted-foreground/30" data-testid="banner-pending-cancel">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Cancellation scheduled</p>
              <p className="text-xs text-muted-foreground">
                Your subscription ends on{" "}
                {formatDate(sub?.currentPeriodEnd)}.{" "}
                {periodEndDays !== null && `${periodEndDays} day${periodEndDays !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isCancelled && accountStatus?.cancellationReason && (
        <Card className="border border-muted-foreground/20" data-testid="banner-cancelled">
          <CardContent className="flex gap-3 pt-4 pb-4">
            <XCircle className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">Subscription cancelled</p>
              <p className="text-xs text-muted-foreground" data-testid="text-cancellation-reason">
                Reason: {accountStatus.cancellationReason}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Plan summary card ── */}
      <Card data-testid="card-plan-summary">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Current plan
            </CardTitle>
            <Badge variant={cfg.color} data-testid="badge-subscription-status">
              <StatusIcon className="mr-1 h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>
          <CardDescription>{cfg.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Plan"
              value={sub?.tier ? capitalize(sub.tier) : "Free"}
              testId="stat-plan-tier"
            />
            <Stat
              label="Billing"
              value={sub?.billingCycle ? capitalize(sub.billingCycle) : "—"}
              testId="stat-billing-cycle"
            />
            <Stat
              label="Period ends"
              value={formatDate(sub?.currentPeriodEnd)}
              testId="stat-period-end"
            />
            <Stat
              label="Tokens remaining this month"
              value={String(sub?.credits.remaining ?? 0)}
              testId="stat-tokens-remaining"
            />
          </div>

          <Separator />

          {/* Employee usage */}
          <div className="space-y-1" data-testid="section-employee-usage">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-sm flex items-center gap-1">
                <Users className="h-4 w-4" />
                Employee seats
              </span>
              <span className="text-sm text-muted-foreground" data-testid="text-employee-count">
                {sub?.limits.currentEmployees ?? 0} / {sub?.limits.maxEmployees ?? "∞"}
              </span>
            </div>
            {sub && sub.limits.maxEmployees > 0 && (
              <Progress
                value={employeePct}
                className="h-2"
                data-testid="progress-employee-usage"
              />
            )}
          </div>

          {/* Credit usage */}
          {sub && sub.credits.total > 0 && (
            <div className="space-y-1" data-testid="section-credit-usage">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm">AI tokens</span>
                <span className="text-sm text-muted-foreground" data-testid="text-credit-count">
                  {sub.credits.remaining} / {sub.credits.total} remaining
                </span>
              </div>
              <Progress
                value={Math.round((sub.credits.used / sub.credits.total) * 100)}
                className="h-2"
                data-testid="progress-credit-usage"
              />
            </div>
          )}
        </CardContent>

        {canCancel && (
          <CardFooter className="pt-0 justify-end gap-3">
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  data-testid="button-open-cancel-dialog"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel subscription
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-cancel-subscription">
                <DialogHeader>
                  <DialogTitle>Cancel subscription</DialogTitle>
                  <DialogDescription>
                    Your subscription will remain active until{" "}
                    <strong>{formatDate(sub?.currentPeriodEnd)}</strong>. After that,
                    your account reverts to the free tier.
                  </DialogDescription>
                </DialogHeader>

                <Form {...cancelForm}>
                  <form
                    onSubmit={cancelForm.handleSubmit(onCancelSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={cancelForm.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Reason for cancelling{" "}
                            <span className="text-muted-foreground font-normal">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Let us know what we could improve…"
                              className="resize-none"
                              rows={3}
                              data-testid="textarea-cancel-reason"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter className="flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCancelDialogOpen(false)}
                        data-testid="button-cancel-dialog-close"
                      >
                        Keep subscription
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={cancelMutation.isPending}
                        data-testid="button-confirm-cancel"
                      >
                        {cancelMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Cancel at period end
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardFooter>
        )}
      </Card>

      {/* ── Subscription FSM reference ── */}
      <Card data-testid="card-fsm-reference">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Subscription states</CardTitle>
          <CardDescription>
            How your account moves through billing lifecycle stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FSM_STATES.map((s) => (
              <div
                key={s.status}
                className={`flex items-start gap-2 rounded-md p-2 ${
                  status === s.status ? "bg-muted" : ""
                }`}
                data-testid={`fsm-state-${s.status}`}
              >
                <s.icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    status === s.status ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <div>
                  <p
                    className={`text-xs font-medium ${
                      status === s.status ? "" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                    {status === s.status && (
                      <span className="ml-1.5 text-primary text-[10px] font-normal">
                        ← current
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Recent invoices ── */}
      <Card data-testid="card-invoices">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <p
              className="text-sm text-muted-foreground text-center py-6"
              data-testid="text-no-invoices"
            >
              No invoices yet
            </p>
          ) : (
            <div className="space-y-2">
              {invoices.slice(0, 8).map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2 hover-elevate"
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <div className="flex items-center gap-2">
                    {inv.status === "paid" ? (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                    ) : inv.status === "open" ? (
                      <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div>
                      <p
                        className="text-sm font-medium"
                        data-testid={`text-invoice-number-${inv.id}`}
                      >
                        {inv.number || inv.id.slice(0, 12)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(inv.created * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-medium"
                      data-testid={`text-invoice-amount-${inv.id}`}
                    >
                      {formatCents(inv.amountDue)}
                    </span>
                    <Badge
                      variant={inv.status === "paid" ? "default" : "destructive"}
                      data-testid={`badge-invoice-status-${inv.id}`}
                    >
                      {capitalize(inv.status)}
                    </Badge>
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`link-invoice-view-${inv.id}`}
                      >
                        <Button variant="ghost" size="icon">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

// ─── FSM reference data ───────────────────────────────────────────────────────

const FSM_STATES = [
  {
    status: "trial",
    label: "Trial",
    icon: Clock,
    description: "14-day free evaluation. No card required.",
  },
  {
    status: "active",
    label: "Active",
    icon: CheckCircle,
    description: "Paid subscription in good standing.",
  },
  {
    status: "past_due",
    label: "Past Due",
    icon: AlertTriangle,
    description: "Payment failed. Auto-retried at 3 / 5 / 7 days.",
  },
  {
    status: "pending_cancel",
    label: "Cancelling",
    icon: CalendarClock,
    description: "Scheduled to cancel at period end.",
  },
  {
    status: "suspended",
    label: "Suspended",
    icon: PauseCircle,
    description: "Writes blocked. Payment needed to restore access.",
  },
  {
    status: "cancelled",
    label: "Cancelled",
    icon: XCircle,
    description: "Subscription ended. Free tier remains.",
  },
] as const;
