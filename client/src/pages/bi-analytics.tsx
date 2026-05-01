import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DollarSign, Users, TrendingUp, TrendingDown, AlertTriangle, Activity,
  Shield, Clock, BarChart3, Download, Settings, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, Target, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend
} from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Color palette — dark navy + gold design system ────────────────────────────
const GOLD = "#d4aa3b";
const NAVY = "#1a3a6b";
const NAVY_LIGHT = "#2a4f8e";
const ACCENT_RED = "#e05252";
const ACCENT_GREEN = "#4caf7d";

const CHART_COLORS = [GOLD, NAVY_LIGHT, ACCENT_GREEN, "#7c6fd0", "#e08c52", "#4cbbcc"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, subtitle, icon: Icon, trend, loading, color = "default"
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof DollarSign;
  trend?: number;
  loading?: boolean;
  color?: "default" | "warning" | "danger" | "success";
}) {
  const colorClass = {
    default: "text-foreground",
    warning: "text-yellow-600 dark:text-yellow-400",
    danger: "text-red-600 dark:text-red-400",
    success: "text-green-600 dark:text-green-400",
  }[color];

  return (
    <Card data-testid={`kpi-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${colorClass}`} data-testid={`kpi-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </div>
            {(subtitle || trend !== undefined) && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                {trend !== undefined && (
                  trend > 0 ? <ArrowUpRight className="h-3 w-3 text-green-500" /> :
                  trend < 0 ? <ArrowDownRight className="h-3 w-3 text-red-500" /> :
                  <Minus className="h-3 w-3" />
                )}
                {subtitle}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChurnRiskBadge({ risk }: { risk: string }) {
  const variant = risk === "high" ? "destructive" : risk === "medium" ? "secondary" : "outline";
  return <Badge variant={variant} data-testid={`churn-risk-${risk}`}>{risk.toUpperCase()}</Badge>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BIAnalytics() {
  const [days, setDays] = useState("30");
  const { toast } = useToast();

  // ── Data queries ─────────────────────────────────────────────────────────────

  const financialQuery = useQuery({
    queryKey: ["/api/analytics/bi/financial-summary", days],
    queryFn: () => fetch(`/api/analytics/bi/financial-summary?days=${days}`).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  const calloffQuery = useQuery({
    queryKey: ["/api/analytics/bi/calloff-rates", days],
    queryFn: () => fetch(`/api/analytics/bi/calloff-rates?days=${days}`).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  const retentionQuery = useQuery({
    queryKey: ["/api/analytics/bi/retention"],
    queryFn: () => fetch("/api/analytics/bi/retention").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const licenseExpiryQuery = useQuery({
    queryKey: ["/api/analytics/bi/license-expiry"],
    queryFn: () => fetch("/api/analytics/bi/license-expiry").then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const clientHealthQuery = useQuery({
    queryKey: ["/api/analytics/bi/client-health"],
    queryFn: () => fetch("/api/analytics/bi/client-health").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const realtimeQuery = useQuery({
    queryKey: ["/api/analytics/bi/realtime"],
    queryFn: () => fetch("/api/analytics/bi/realtime").then(r => r.json()),
    refetchInterval: 30 * 1000,
  });

  const scheduledReportQuery = useQuery({
    queryKey: ["/api/analytics/bi/scheduled-report"],
    queryFn: () => fetch("/api/analytics/bi/scheduled-report").then(r => r.json()),
  });

  const snapshotQuery = useQuery({
    queryKey: ["/api/analytics/bi/snapshots", days],
    queryFn: () => fetch(`/api/analytics/bi/snapshots?days=${days}&metrics=revenue.paid,payroll.total_hours,shift.completed,calloff.count`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const scheduledReportMutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/analytics/bi/scheduled-report", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/bi/scheduled-report"] });
      toast({ title: "Report schedule saved." });
    },
    onError: () => toast({ title: "Failed to save report schedule.", variant: "destructive" }),
  });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const financial = financialQuery.data?.data;
  const calloff = calloffQuery.data?.data;
  const retention = retentionQuery.data?.data;
  const licenseExpiry = licenseExpiryQuery.data?.data;
  const clientHealth = clientHealthQuery.data?.data;
  const realtime = realtimeQuery.data?.data;
  const scheduledReport = scheduledReportQuery.data?.data;
  const snapshots = snapshotQuery.data?.data || [];

  // Group snapshots by date for trend chart
  const trendData = snapshots.reduce((acc: any, row: any) => {
    const existing = acc.find((d) => d.date === row.snapshot_date);
    if (existing) {
      existing[row.metric_name] = parseFloat(row.value);
    } else {
      acc.push({ date: row.snapshot_date.slice(5), [row.metric_name]: parseFloat(row.value) });
    }
    return acc;
  }, []);

  // ── Export handler ───────────────────────────────────────────────────────────

  const handleExport = (reportType: string) => {
    window.open(`/api/analytics/bi/export?format=csv&report=${reportType}&days=${days}`, '_blank');
    toast({ title: `Exporting ${reportType} as CSV…` });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="bi-analytics-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Business Intelligence</h1>
          <p className="text-sm text-muted-foreground">Workforce, financial, and operational analytics</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36" data-testid="date-range-selector">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="default" onClick={() => handleExport("snapshots")} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* 4-Tab Navigation */}
      <Tabs defaultValue="financial" className="w-full">
        <TabsList className="grid w-full grid-cols-4" data-testid="bi-tabs">
          <TabsTrigger value="financial" data-testid="tab-financial">
            <DollarSign className="h-4 w-4 mr-1" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="workforce" data-testid="tab-workforce">
            <Users className="h-4 w-4 mr-1" />
            Workforce
          </TabsTrigger>
          <TabsTrigger value="clients" data-testid="tab-clients">
            <Target className="h-4 w-4 mr-1" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">
            <Activity className="h-4 w-4 mr-1" />
            Operations
          </TabsTrigger>
        </TabsList>

        {/* ── FINANCIAL TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="financial" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              title="Paid Revenue"
              value={financial?.summary?.["revenue.paid"] !== undefined ? formatCurrency(financial.summary["revenue.paid"]) : "—"}
              icon={DollarSign}
              loading={financialQuery.isLoading}
              color="success"
              subtitle={`Last ${days} days (precomputed)`}
            />
            <KpiCard
              title="Outstanding Revenue"
              value={financial?.summary?.["revenue.outstanding"] !== undefined ? formatCurrency(financial.summary["revenue.outstanding"]) : "—"}
              icon={TrendingDown}
              loading={financialQuery.isLoading}
              color="warning"
              subtitle="Unpaid invoices"
            />
            <KpiCard
              title="Overdue Invoices"
              value={financial?.summary?.["invoice.overdue_count"] ?? "—"}
              icon={AlertTriangle}
              loading={financialQuery.isLoading}
              color={financial?.summary?.["invoice.overdue_count"] > 5 ? "danger" : "default"}
              subtitle="Past due"
            />
            <KpiCard
              title="Avg Payment Days"
              value={financial?.summary?.["invoice.avg_payment_days"] !== undefined
                ? `${Math.round(financial.summary["invoice.avg_payment_days"])}d` : "—"}
              icon={Clock}
              loading={financialQuery.isLoading}
              subtitle="From sent to paid"
            />
          </div>

          {/* Revenue Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Daily paid revenue from precomputed snapshots</CardDescription>
              </div>
              <Button variant="outline" size="default" onClick={() => handleExport("financial")} data-testid="button-export-financial">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </CardHeader>
            <CardContent>
              {financialQuery.isLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData} data-testid="chart-revenue-trend">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="revenue.paid" stroke={GOLD} strokeWidth={2} name="Revenue" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue by Client + Overdue Aging */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Client</CardTitle>
                <CardDescription>Top 10 by paid invoices this period</CardDescription>
              </CardHeader>
              <CardContent>
                {financialQuery.isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-2" data-testid="revenue-by-client-list">
                    {(financial?.revenueByClient ?? []).slice(0, 8).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm" data-testid={`revenue-client-${i}`}>
                        <span className="truncate text-muted-foreground">{c.client_name}</span>
                        <span className="font-medium shrink-0">{formatCurrency(c.revenue)}</span>
                      </div>
                    ))}
                    {!financial?.revenueByClient?.length && (
                      <p className="text-sm text-muted-foreground">No revenue data for this period.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Overdue Aging</CardTitle>
                <CardDescription>Outstanding invoice buckets by age</CardDescription>
              </CardHeader>
              <CardContent>
                {financialQuery.isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-3" data-testid="overdue-aging-list">
                    {(financial?.overdueAging ?? []).map((bucket: any, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{bucket.age_bucket}</span>
                          <span className="font-medium">{formatCurrency(bucket.outstanding_amount)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{bucket.invoice_count} invoice(s)</div>
                      </div>
                    ))}
                    {!financial?.overdueAging?.length && (
                      <p className="text-sm text-muted-foreground">No overdue invoices.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scheduled Report Config */}
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Analytics Report</CardTitle>
              <CardDescription>Deliver an analytics summary email on a recurring schedule</CardDescription>
            </CardHeader>
            <CardContent>
              {scheduledReportQuery.isLoading ? <Skeleton className="h-16 w-full" /> : (
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="report-enabled"
                      checked={scheduledReport?.enabled ?? false}
                      onCheckedChange={(enabled) =>
                        scheduledReportMutation.mutate({ ...scheduledReport, enabled })
                      }
                      data-testid="switch-scheduled-report"
                    />
                    <Label htmlFor="report-enabled">Enable scheduled report</Label>
                  </div>
                  <Select
                    value={scheduledReport?.frequency ?? "weekly"}
                    onValueChange={(frequency) =>
                      scheduledReportMutation.mutate({ ...scheduledReport, frequency })
                    }
                  >
                    <SelectTrigger className="w-36" data-testid="select-report-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  {scheduledReport?.lastSentAt && (
                    <span className="text-xs text-muted-foreground">
                      Last sent: {new Date(scheduledReport.lastSentAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WORKFORCE TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="workforce" className="space-y-6 mt-6">
          {/* Retention KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              title="Active Officers"
              value={retention?.summary?.active ?? "—"}
              icon={Users}
              loading={retentionQuery.isLoading}
              color="success"
            />
            <KpiCard
              title="Annualized Turnover"
              value={retention?.summary?.annualizedTurnoverRate !== undefined ? `${retention.summary.annualizedTurnoverRate}%` : "—"}
              icon={TrendingDown}
              loading={retentionQuery.isLoading}
              color={retention?.summary?.annualizedTurnoverRate > 40 ? "danger" : "default"}
              subtitle="Last 90d annualized"
            />
            <KpiCard
              title="Avg Tenure"
              value={retention?.summary?.avg_tenure_years !== undefined ? `${retention.summary.avg_tenure_years}yr` : "—"}
              icon={Clock}
              loading={retentionQuery.isLoading}
            />
            <KpiCard
              title="New Hires (30d)"
              value={retention?.summary?.new_hires_30d ?? "—"}
              icon={ArrowUpRight}
              loading={retentionQuery.isLoading}
              color="success"
            />
          </div>

          {/* Calloff Rate + Tenure Distribution */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Calloff Rate by Officer</CardTitle>
                  <CardDescription>Top callers ranked by frequency</CardDescription>
                </div>
                <Button variant="outline" size="default" onClick={() => handleExport("calloff-rates")} data-testid="button-export-calloff">
                  <Download className="h-4 w-4 mr-2" />Export
                </Button>
              </CardHeader>
              <CardContent>
                {calloffQuery.isLoading ? <Skeleton className="h-48 w-full" /> : (
                  <div className="space-y-2 max-h-64 overflow-y-auto" data-testid="calloff-by-officer-list">
                    {(calloff?.byOfficer ?? []).slice(0, 10).map((o: any, i: number) => (
                      <div key={i} className="flex items-center gap-2" data-testid={`calloff-officer-${i}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm">
                            <span className="truncate text-muted-foreground">{o.officer_name}</span>
                            <span className="font-medium shrink-0">{o.calloff_rate ?? 0}%</span>
                          </div>
                          <Progress value={parseFloat(o.calloff_rate ?? 0)} className="h-1.5 mt-1" />
                        </div>
                      </div>
                    ))}
                    {!calloff?.byOfficer?.length && (
                      <p className="text-sm text-muted-foreground">No calloff data for this period.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Officer Tenure Distribution</CardTitle>
                <CardDescription>How long officers stay on average</CardDescription>
              </CardHeader>
              <CardContent>
                {retentionQuery.isLoading ? <Skeleton className="h-48 w-full" /> : (
                  <ResponsiveContainer width="100%" height={200} data-testid="chart-tenure-distribution">
                    <BarChart data={retention?.tenureDistribution ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="tenure_bucket" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={GOLD} name="Officers" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Calloff pattern by day */}
          <Card>
            <CardHeader>
              <CardTitle>Calloff Pattern by Day of Week</CardTitle>
              <CardDescription>Which days have the most calloffs</CardDescription>
            </CardHeader>
            <CardContent>
              {calloffQuery.isLoading ? <Skeleton className="h-40 w-full" /> : (
                <ResponsiveContainer width="100%" height={160} data-testid="chart-calloff-by-day">
                  <BarChart data={calloff?.byDayOfWeek ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day_name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="calloff_count" fill={NAVY_LIGHT} name="Calloffs" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* License Expiry Pipeline */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>License Expiry Pipeline</CardTitle>
                <CardDescription>Officers with licenses expiring within 90 days</CardDescription>
              </div>
              {licenseExpiry?.counts && (
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="destructive" data-testid="expiry-count-30d">{licenseExpiry.counts.days30} expiring in 30d</Badge>
                  <Badge variant="secondary" data-testid="expiry-count-60d">{licenseExpiry.counts.days60} in 60d</Badge>
                  <Badge variant="outline" data-testid="expiry-count-90d">{licenseExpiry.counts.days90} in 90d</Badge>
                  {licenseExpiry.counts.expired > 0 && (
                    <Badge variant="destructive" data-testid="expiry-count-expired">{licenseExpiry.counts.expired} EXPIRED</Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {licenseExpiryQuery.isLoading ? <Skeleton className="h-32 w-full" /> : (
                <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="license-expiry-list">
                  {[...(licenseExpiry?.expired ?? []).map((e) => ({ ...e, urgency: "expired" })),
                    ...(licenseExpiry?.expiring30d ?? []).map((e) => ({ ...e, urgency: "30d" })),
                    ...(licenseExpiry?.expiring60d ?? []).map((e) => ({ ...e, urgency: "60d" })),
                    ...(licenseExpiry?.expiring90d ?? []).map((e) => ({ ...e, urgency: "90d" })),
                  ].slice(0, 15).map((e: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm gap-2" data-testid={`license-expiry-row-${i}`}>
                      <span className="truncate text-muted-foreground">{e.officer_name}</span>
                      <span className="truncate text-muted-foreground">{e.license_type}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span>{new Date(e.expiry_date).toLocaleDateString()}</span>
                        <Badge variant={e.urgency === "expired" || e.urgency === "30d" ? "destructive" : "secondary"}>
                          {e.urgency === "expired" ? "EXPIRED" : `exp ${e.urgency}`}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {!licenseExpiry?.expiring30d?.length && !licenseExpiry?.expired?.length && (
                    <p className="text-sm text-muted-foreground">No licenses expiring within 90 days.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CLIENTS TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="clients" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              title="Total Clients Scored"
              value={clientHealth?.summary?.total ?? "—"}
              icon={Target}
              loading={clientHealthQuery.isLoading}
            />
            <KpiCard
              title="High Churn Risk"
              value={clientHealth?.summary?.highRisk ?? "—"}
              icon={AlertTriangle}
              loading={clientHealthQuery.isLoading}
              color={clientHealth?.summary?.highRisk > 0 ? "danger" : "default"}
              subtitle="Immediate attention needed"
            />
            <KpiCard
              title="Medium Churn Risk"
              value={clientHealth?.summary?.mediumRisk ?? "—"}
              icon={TrendingDown}
              loading={clientHealthQuery.isLoading}
              color={clientHealth?.summary?.mediumRisk > 2 ? "warning" : "default"}
            />
            <KpiCard
              title="Last Scored"
              value={clientHealth?.lastUpdated ? new Date(clientHealth.lastUpdated).toLocaleDateString() : "Never"}
              icon={Clock}
              loading={clientHealthQuery.isLoading}
              subtitle="Precomputed daily at 2 AM"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Client Health Scores</CardTitle>
                <CardDescription>
                  Composite score: payment velocity (30%) + disputes (20%) + post coverage (30%) + ticket volume (20%)
                </CardDescription>
              </div>
              <Button variant="outline" size="default" onClick={() => handleExport("client-health")} data-testid="button-export-clients">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </CardHeader>
            <CardContent>
              {clientHealthQuery.isLoading ? <Skeleton className="h-64 w-full" /> : (
                <div className="space-y-3" data-testid="client-health-list">
                  {(clientHealth?.clients ?? []).map((c: any, i: number) => (
                    <div key={i} className="space-y-1.5" data-testid={`client-health-row-${i}`}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium truncate">{c.client_name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{Math.round(c.composite_score)}%</span>
                          <ChurnRiskBadge risk={c.churn_risk} />
                        </div>
                      </div>
                      <Progress value={parseFloat(c.composite_score)} className="h-2" />
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Pay: {Math.round(c.payment_velocity_score)}%</span>
                        <span>Coverage: {Math.round(c.post_coverage_score)}%</span>
                        <span>Disputes: {Math.round(c.dispute_rate_score)}%</span>
                        <span>Tickets: {Math.round(c.ticket_volume_score)}%</span>
                      </div>
                    </div>
                  ))}
                  {!clientHealth?.clients?.length && (
                    <p className="text-sm text-muted-foreground">
                      No client health scores yet. Scores are computed nightly at 2 AM UTC.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client health chart */}
          {clientHealth?.clients?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Health Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180} data-testid="chart-client-health-distribution">
                  <BarChart data={clientHealth.clients.slice(0, 12)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="client_name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${Math.round(v)}%`} />
                    <Bar dataKey="composite_score" name="Health Score" radius={[3, 3, 0, 0]}>
                      {clientHealth.clients.slice(0, 12).map((c: any, i: number) => (
                        <Cell key={i} fill={c.churn_risk === "high" ? ACCENT_RED : c.churn_risk === "medium" ? GOLD : ACCENT_GREEN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── OPERATIONS TAB ────────────────────────────────────────────────── */}
        <TabsContent value="operations" className="space-y-6 mt-6">
          {/* Real-time KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard
              title="Officers Clocked In"
              value={realtime?.clocked_in ?? "—"}
              icon={Users}
              loading={realtimeQuery.isLoading}
              color="success"
              subtitle="Currently on duty"
            />
            <KpiCard
              title="Open Shifts Today"
              value={realtime?.open_shifts ?? "—"}
              icon={AlertTriangle}
              loading={realtimeQuery.isLoading}
              color={realtime?.open_shifts > 0 ? "warning" : "default"}
              subtitle="Awaiting coverage"
            />
            <KpiCard
              title="Active Incidents"
              value={realtime?.active_incidents ?? "—"}
              icon={Shield}
              loading={realtimeQuery.isLoading}
              color={realtime?.active_incidents > 0 ? "danger" : "default"}
              subtitle="Under investigation"
            />
            <KpiCard
              title="Completed Shifts Today"
              value={realtime?.completed_today ?? "—"}
              icon={Activity}
              loading={realtimeQuery.isLoading}
              color="success"
            />
            <KpiCard
              title="Total Shifts Today"
              value={realtime?.total_today ?? "—"}
              icon={BarChart3}
              loading={realtimeQuery.isLoading}
            />
            <KpiCard
              title="Late to Start"
              value={realtime?.late_to_start ?? "—"}
              icon={Clock}
              loading={realtimeQuery.isLoading}
              color={realtime?.late_to_start > 0 ? "warning" : "default"}
              subtitle="Shift started, no clock-in"
            />
          </div>

          {/* Historical trend */}
          <Card>
            <CardHeader>
              <CardTitle>Shift Completion Trend</CardTitle>
              <CardDescription>Daily completed vs cancelled shifts from precomputed snapshots</CardDescription>
            </CardHeader>
            <CardContent>
              {snapshotQuery.isLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200} data-testid="chart-shift-completion-trend">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="shift.completed" fill={ACCENT_GREEN} name="Completed" radius={[3, 3, 0, 0]} stackId="a" />
                    <Bar dataKey="shift.cancelled" fill={ACCENT_RED} name="Cancelled" radius={[3, 3, 0, 0]} stackId="a" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Refresh note */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Real-time data refreshes every 30 seconds. Trend data from precomputed daily snapshots.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
