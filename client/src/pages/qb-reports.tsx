import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { secureFetch } from "@/lib/csrf";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { exportReport } from "@/lib/exportUtils";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  BarChart3, DollarSign, Users, Clock, FileText, TrendingUp,
  Shield, Wallet, Receipt, ArrowLeft, Download, Brain, Calendar,
  ChevronRight, Percent, AlertCircle, Building2, UserCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Cell, Tooltip, Legend,
} from "recharts";

const REPORT_CARDS = [
  { key: "client-profitability", label: "Client Profitability", icon: Users, desc: "Revenue vs labor cost per client", color: "text-emerald-500 dark:text-emerald-400", bg: "from-emerald-500/10 to-green-500/5" },
  { key: "payroll-summary", label: "Payroll Summary", icon: DollarSign, desc: "Payroll runs, top earners, totals", color: "text-blue-500 dark:text-blue-400", bg: "from-blue-500/10 to-sky-500/5" },
  { key: "ar-aging", label: "AR Aging", icon: Receipt, desc: "Aging buckets for outstanding invoices", color: "text-amber-500 dark:text-amber-400", bg: "from-amber-500/10 to-yellow-500/5" },
  { key: "revenue-trend", label: "Revenue Trend", icon: TrendingUp, desc: "Monthly revenue over 12 months", color: "text-cyan-500 dark:text-cyan-400", bg: "from-cyan-500/10 to-blue-500/5" },
  { key: "labor-cost", label: "Labor Cost", icon: Clock, desc: "Cost per hour by site, OT %", color: "text-violet-500 dark:text-violet-400", bg: "from-violet-500/10 to-purple-500/5" },
  { key: "tax-liability", label: "Tax Liability", icon: FileText, desc: "Quarterly tax withholdings summary", color: "text-rose-500 dark:text-rose-400", bg: "from-rose-500/10 to-red-500/5" },
  { key: "cash-flow", label: "Cash Flow", icon: Wallet, desc: "Money in vs money out by month", color: "text-teal-500 dark:text-teal-400", bg: "from-teal-500/10 to-emerald-500/5" },
  { key: "workers-comp", label: "Workers Comp", icon: Shield, desc: "Hours by employee classification code", color: "text-orange-500 dark:text-orange-400", bg: "from-orange-500/10 to-amber-500/5" },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${fmt(n)}`;
}

import { CHART_PALETTE } from "@/lib/chartPalette";

function MarginBadge({ pct }: { pct: number }) {
  const variant = pct >= 25 ? "default" : pct >= 15 ? "secondary" : "destructive";
  const cls = pct >= 25 ? "bg-green-600 dark:bg-green-500" : pct >= 15 ? "bg-amber-500 dark:bg-amber-400 text-gray-900" : "";
  return <Badge variant={variant} className={cls} data-testid={`badge-margin-${pct.toFixed(0)}`}>{pct.toFixed(1)}%</Badge>;
}

const revenueChartConfig = {
  revenue: { label: "Revenue", color: CHART_PALETTE.BRAND },
  paidAmount: { label: "Paid", color: CHART_PALETTE.SUCCESS },
} satisfies ChartConfig;

const cashFlowChartConfig = {
  moneyIn: { label: "Money In", color: CHART_PALETTE.SUCCESS },
  totalOut: { label: "Money Out", color: CHART_PALETTE.DANGER },
  net: { label: "Net", color: CHART_PALETTE.BRAND },
} satisfies ChartConfig;

const arChartConfig = {
  total: { label: "Amount", color: CHART_PALETTE.WARNING },
} satisfies ChartConfig;

const otChartConfig = {
  otPercent: { label: "OT %", color: CHART_PALETTE.SECONDARY },
} satisfies ChartConfig;

const pageConfig: CanvasPageConfig = {
  id: "qb-reports",
  title: "Reports Hub",
  subtitle: "QuickBooks-style financial and operational reports",
  category: "operations",
  maxWidth: "7xl",
};

function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }: {
  startDate: string; endDate: string;
  onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <Input type="date" value={startDate} onChange={e => onStartChange(e.target.value)} className="w-40" data-testid="input-start-date" />
      <span className="text-muted-foreground text-sm">to</span>
      <Input type="date" value={endDate} onChange={e => onEndChange(e.target.value)} className="w-40" data-testid="input-end-date" />
    </div>
  );
}

function ReportGrid({ onSelect }: { onSelect: (key: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {REPORT_CARDS.map(card => (
        <Card
          key={card.key}
          className={`cursor-pointer hover-elevate bg-gradient-to-br ${card.bg} transition-all`}
          onClick={() => onSelect(card.key)}
          data-testid={`card-report-${card.key}`}
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-muted/20 rounded-md">
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-sm mb-1">{card.label}</h3>
            <p className="text-xs text-muted-foreground">{card.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClientProfitabilityReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/client-profitability", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Revenue" value={`$${fmt(totals.revenue || 0)}`} icon={DollarSign} />
        <StatCard label="Total Labor Cost" value={`$${fmt(totals.laborCost || 0)}`} icon={Clock} />
        <StatCard label="Gross Margin" value={`$${fmt(totals.margin || 0)}`} icon={TrendingUp} />
        <StatCard label="Margin %" value={`${(totals.marginPercent || 0).toFixed(1)}%`} icon={Percent} />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-client-profitability">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Client</th>
                <th className="text-right p-3 font-medium">Revenue</th>
                <th className="text-right p-3 font-medium">Labor Cost</th>
                <th className="text-right p-3 font-medium">Margin</th>
                <th className="text-right p-3 font-medium">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-center p-6 text-muted-foreground">No client margin data is available for this period yet.</td></tr>
              )}
              {rows.map((r: any) => (
                <tr key={r.clientId} className="border-b last:border-0" data-testid={`row-client-${r.clientId}`}>
                  <td className="p-3 font-medium">{r.clientName}</td>
                  <td className="p-3 text-right">${fmt(r.revenue)}</td>
                  <td className="p-3 text-right">${fmt(r.laborCost)}</td>
                  <td className="p-3 text-right">${fmt(r.margin)}</td>
                  <td className="p-3 text-right"><MarginBadge pct={r.marginPercent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollSummaryReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/payroll-summary", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const summary = data?.summary || {};
  const topEarners = data?.topEarners || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Gross Pay" value={`$${fmt(summary.totalGrossPay || 0)}`} icon={DollarSign} />
        <StatCard label="Total Taxes" value={`$${fmt(summary.totalTaxes || 0)}`} icon={FileText} />
        <StatCard label="Net Pay" value={`$${fmt(summary.totalNetPay || 0)}`} icon={Wallet} />
        <StatCard label="Pay Runs" value={summary.runCount || 0} icon={BarChart3} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Earners</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-top-earners">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Employee</th>
                <th className="text-right p-3 font-medium">Gross Pay</th>
                <th className="text-right p-3 font-medium">Net Pay</th>
                <th className="text-right p-3 font-medium">Regular Hrs</th>
                <th className="text-right p-3 font-medium">OT Hrs</th>
              </tr>
            </thead>
            <tbody>
              {topEarners.length === 0 && (
                <tr><td colSpan={5} className="text-center p-6 text-muted-foreground">No payroll activity is available for this period yet.</td></tr>
              )}
              {topEarners.map((e: any) => (
                <tr key={e.employeeId} className="border-b last:border-0">
                  <td className="p-3 font-medium">{e.name}</td>
                  <td className="p-3 text-right">${fmt(e.grossPay)}</td>
                  <td className="p-3 text-right">${fmt(e.netPay)}</td>
                  <td className="p-3 text-right">{e.regularHours.toFixed(1)}</td>
                  <td className="p-3 text-right">{e.overtimeHours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ARAgingReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/ar-aging", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const buckets = data?.buckets || {};
  const bucketOrder = ["current", "1-30", "31-60", "61-90", "90+"];
  const chartData = bucketOrder.map(k => ({
    name: buckets[k]?.label || k,
    total: Math.round((buckets[k]?.total || 0) * 100) / 100,
    count: buckets[k]?.invoices?.length || 0,
  }));
  const BUCKET_COLORS = [CHART_PALETTE.SUCCESS, CHART_PALETTE.BRAND, CHART_PALETTE.WARNING, CHART_PALETTE.WARNING, CHART_PALETTE.DANGER];

  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Outstanding" value={`$${fmt(data?.totalOutstanding || 0)}`} icon={Receipt} />
        <StatCard label="Open Invoices" value={data?.invoiceCount || 0} icon={FileText} />
        <StatCard label="90+ Days" value={`$${fmt(buckets["90+"]?.total || 0)}`} icon={AlertCircle} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Aging Buckets</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={arChartConfig} className="h-[250px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={`cell-${entry.name || i}`} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {bucketOrder.map((bk, i) => {
          const bucket = buckets[bk];
          if (!bucket || bucket.invoices.length === 0) return null;
          return (
            <Card key={bk}>
              <CardHeader
                className="cursor-pointer pb-2"
                onClick={() => setExpandedBucket(expandedBucket === bk ? null : bk)}
                data-testid={`btn-bucket-${bk}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: BUCKET_COLORS[i] }} />
                    <CardTitle className="text-sm">{bucket.label}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{bucket.invoices.length}</Badge>
                    <span className="text-sm font-semibold">${fmt(bucket.total)}</span>
                  </div>
                </div>
              </CardHeader>
              {expandedBucket === bk && (
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 font-medium">Invoice #</th>
                        <th className="text-right p-3 font-medium">Total</th>
                        <th className="text-right p-3 font-medium">Paid</th>
                        <th className="text-right p-3 font-medium">Outstanding</th>
                        <th className="text-right p-3 font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.invoices.map((inv: any) => (
                        <tr key={inv.id} className="border-b last:border-0">
                          <td className="p-3">{inv.invoiceNumber || `#${inv.id}`}</td>
                          <td className="p-3 text-right">${fmt(inv.total)}</td>
                          <td className="p-3 text-right">${fmt(inv.amountPaid)}</td>
                          <td className="p-3 text-right">${fmt(inv.outstanding)}</td>
                          <td className="p-3 text-right">{inv.daysOverdue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RevenueTrendReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/revenue-trend", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const months = data?.months || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Revenue" value={`$${fmt(data?.totalRevenue || 0)}`} icon={DollarSign} />
        <StatCard label="Avg Monthly" value={`$${fmt(data?.avgMonthlyRevenue || 0)}`} icon={TrendingUp} />
        <StatCard label="Months" value={months.length} icon={Calendar} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Revenue</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={revenueChartConfig} className="h-[300px] w-full">
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke={CHART_PALETTE.BRAND} strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
              <Line type="monotone" dataKey="paidAmount" stroke={CHART_PALETTE.SUCCESS} strokeWidth={2} dot={{ r: 3 }} name="Paid" />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function LaborCostReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/labor-cost", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const bySite = data?.bySite || [];
  const otByEmployee = data?.overtimeByEmployee || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Cost Per Hour by Site</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-labor-site">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Site</th>
                <th className="text-right p-3 font-medium">Hours</th>
                <th className="text-right p-3 font-medium">Cost/Hr</th>
                <th className="text-right p-3 font-medium">Payable</th>
                <th className="text-right p-3 font-medium">Billable</th>
                <th className="text-right p-3 font-medium">Spread</th>
              </tr>
            </thead>
            <tbody>
              {bySite.length === 0 && <tr><td colSpan={6} className="text-center p-6 text-muted-foreground">No labor cost data is available for the selected range yet.</td></tr>}
              {bySite.map((s: any) => (
                <tr key={s.siteId || "none"} className="border-b last:border-0">
                  <td className="p-3 font-medium">{s.siteName}</td>
                  <td className="p-3 text-right">{s.totalHours.toFixed(1)}</td>
                  <td className="p-3 text-right">${fmt(s.costPerHour)}</td>
                  <td className="p-3 text-right">${fmt(s.totalPayable)}</td>
                  <td className="p-3 text-right">${fmt(s.totalBillable)}</td>
                  <td className="p-3 text-right">
                    <span className={s.spread >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      ${fmt(s.spread)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overtime % by Employee</CardTitle></CardHeader>
        <CardContent>
          {otByEmployee.length > 0 ? (
            <ChartContainer config={otChartConfig} className="h-[300px] w-full">
              <BarChart data={otByEmployee.slice(0, 15)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="otPercent" fill={CHART_PALETTE.SECONDARY} radius={[0, 4, 4, 0]} name="OT %" />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-6">No overtime activity is available for the selected range yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TaxLiabilityReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/tax-liability", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const quarters = data?.quarters || [];
  const grand = data?.grandTotal || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Federal Tax" value={`$${fmt(grand.federalTax || 0)}`} icon={FileText} />
        <StatCard label="State Tax" value={`$${fmt(grand.stateTax || 0)}`} icon={FileText} />
        <StatCard label="Social Security" value={`$${fmt(grand.socialSecurity || 0)}`} icon={Shield} />
        <StatCard label="Medicare" value={`$${fmt(grand.medicare || 0)}`} icon={Shield} />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-tax-liability">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Quarter</th>
                <th className="text-right p-3 font-medium">Federal</th>
                <th className="text-right p-3 font-medium">State</th>
                <th className="text-right p-3 font-medium">SS</th>
                <th className="text-right p-3 font-medium">Medicare</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-right p-3 font-medium">Gross Payroll</th>
              </tr>
            </thead>
            <tbody>
              {quarters.length === 0 && <tr><td colSpan={7} className="text-center p-6 text-muted-foreground">No tax liability data is available for this period yet.</td></tr>}
              {quarters.map((q: any) => (
                <tr key={q.quarter} className="border-b last:border-0">
                  <td className="p-3 font-medium">{q.quarter}</td>
                  <td className="p-3 text-right">${fmt(q.federalTax)}</td>
                  <td className="p-3 text-right">${fmt(q.stateTax)}</td>
                  <td className="p-3 text-right">${fmt(q.socialSecurity)}</td>
                  <td className="p-3 text-right">${fmt(q.medicare)}</td>
                  <td className="p-3 text-right font-semibold">${fmt(q.totalWithholdings)}</td>
                  <td className="p-3 text-right">${fmt(q.grossPayroll)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CashFlowReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/cash-flow", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const months = data?.months || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Money In" value={`$${fmt(totals.moneyIn || 0)}`} icon={TrendingUp} />
        <StatCard label="Money Out" value={`$${fmt(totals.totalOut || 0)}`} icon={DollarSign} />
        <StatCard label="Net" value={`$${fmt(totals.net || 0)}`} icon={Wallet} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Cash Flow by Month</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={cashFlowChartConfig} className="h-[300px] w-full">
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="moneyIn" fill={CHART_PALETTE.SUCCESS} radius={[4, 4, 0, 0]} name="Money In" />
              <Bar dataKey="totalOut" fill={CHART_PALETTE.DANGER} radius={[4, 4, 0, 0]} name="Money Out" />
              <Line type="monotone" dataKey="net" stroke={CHART_PALETTE.BRAND} strokeWidth={2} name="Net" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkersCompReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/qb-reports/workers-comp", { startDate, endDate }],
  });

  if (isLoading) return <ReportSkeleton />;
  if (isError) return <ReportError onRetry={refetch} />;
  const classifications = data?.classifications || [];
  const employees = data?.employees || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Hours" value={(data?.totalHours || 0).toFixed(1)} icon={Clock} />
        <StatCard label="Employees" value={data?.totalEmployees || 0} icon={Users} />
        <StatCard label="Classifications" value={classifications.length} icon={Building2} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Hours by Classification</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-workers-comp">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Classification</th>
                <th className="text-right p-3 font-medium">Employees</th>
                <th className="text-right p-3 font-medium">Regular Hrs</th>
                <th className="text-right p-3 font-medium">OT Hrs</th>
                <th className="text-right p-3 font-medium">Total Hrs</th>
              </tr>
            </thead>
            <tbody>
              {classifications.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-muted-foreground">No workers' comp classification data is available for this period yet.</td></tr>}
              {classifications.map((c: any) => (
                <tr key={c.classificationCode} className="border-b last:border-0">
                  <td className="p-3 font-medium">{c.classificationCode}</td>
                  <td className="p-3 text-right">{c.employeeCount}</td>
                  <td className="p-3 text-right">{c.regularHours.toFixed(1)}</td>
                  <td className="p-3 text-right">{c.overtimeHours.toFixed(1)}</td>
                  <td className="p-3 text-right font-semibold">{c.totalHours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-lg font-bold truncate" data-testid={`text-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ReportError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card data-testid="report-error">
      <CardContent className="p-6 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">Failed to load report data. Please try again.</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-report">Retry</Button>}
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-28" /></CardContent></Card>)}
      </div>
      <Card><CardContent className="p-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
    </div>
  );
}

const REPORT_COMPONENTS: Record<string, any> = {
  "client-profitability": ClientProfitabilityReport,
  "payroll-summary": PayrollSummaryReport,
  "ar-aging": ARAgingReport,
  "revenue-trend": RevenueTrendReport,
  "labor-cost": LaborCostReport,
  "tax-liability": TaxLiabilityReport,
  "cash-flow": CashFlowReport,
  "workers-comp": WorkersCompReport,
};

export default function QBReports() {
  const { toast } = useToast();
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const now = new Date();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => now.toISOString().slice(0, 10));

  const activeCard = REPORT_CARDS.find(c => c.key === activeReport);
  const ReportComponent = activeReport ? REPORT_COMPONENTS[activeReport] : null;

  const handleExportCSV = () => {
    toast({ title: "Export Started", description: "Generating CSV export of current report data..." });
    const rows = [
      { report: activeCard?.label || "All Reports", startDate, endDate, exportedAt: new Date().toISOString() },
    ];
    exportReport("csv", activeCard?.label || "QB Reports", rows, {
      columns: ["report", "startDate", "endDate", "exportedAt"],
      columnLabels: { report: "Report", startDate: "Start Date", endDate: "End Date", exportedAt: "Exported At" },
    });
  };

  const handleAskTrinity = async () => {
    toast({
      title: "Ask Trinity",
      description: `Analyzing ${activeCard?.label || "reports"} data... (15 credits)`,
    });
  };

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
      {activeReport && (
        <>
          <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="default" onClick={handleAskTrinity} data-testid="button-ask-trinity">
            <Brain className="w-4 h-4 mr-1" /> Ask Trinity
          </Button>
        </>
      )}
    </div>
  );

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {activeReport && (
              <Button variant="ghost" size="icon" onClick={() => setActiveReport(null)} data-testid="button-back-reports">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-bold" data-testid="text-report-title">
                {activeCard ? activeCard.label : "Reports Hub"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {activeCard ? activeCard.desc : "QuickBooks-style financial and operational reports"}
              </p>
            </div>
          </div>
          {actionButtons}
        </div>

        {!activeReport && <ReportGrid onSelect={setActiveReport} />}

        {ReportComponent && <ReportComponent startDate={startDate} endDate={endDate} />}
      </div>
    </CanvasHubPage>
  );
}
