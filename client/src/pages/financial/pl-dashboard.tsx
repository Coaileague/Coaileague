import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────

interface RecognitionSummary {
  workspaceId: string;
  pendingAmount: number;
  recognizedAmount: number;
  deferredAmount: number;
  inProgressAmount: number;
  totalSchedules: number;
  pendingSchedules: number;
  recognizedSchedules: number;
}

interface ForecastMonth {
  month: string;
  projectedRevenue: number;
  knownContractRevenue: number;
  historicalTrendRevenue: number;
  confidenceLevel: "high" | "medium" | "low";
  confidenceScore: number;
  assumptions: string[];
}

interface ForecastResult {
  workspaceId: string;
  generatedAt: string;
  basePeriodMonths: number;
  averageMonthlyRevenue: number;
  growthRatePercent: number;
  forecasts: ForecastMonth[];
  keyAssumptions: string[];
}

interface HistoryPeriod {
  month: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
  recognized: number;
  deferred: number;
}

interface PLDetailSummary {
  totalRevenue: number;
  totalRecognized: number;
  totalDeferred: number;
  totalExpenses: number;
  netProfit: number;
  grossMarginPercent: number;
}

interface Asc606Report {
  workspaceId: string;
  generatedAt: string;
  complianceStatus: "compliant" | "partial" | "attention_required";
  totalContracts: number;
  satisfiedObligations: number;
  pendingObligations: number;
  totalContractValue: number;
  totalRecognized: number;
  totalDeferred: number;
  checklist: Array<{ step: number; description: string; status: "complete" | "partial" | "incomplete" }>;
  recognitionScheduleSummary: {
    accrualSchedules: number;
    cashSchedules: number;
    pendingCount: number;
    recognizedCount: number;
    totalPendingAmount: number;
    totalRecognizedAmount: number;
  };
  deferredRevenueSummary: {
    totalDeferred: number;
    expectedRecognitionThisMonth: number;
    entries: Array<{ invoiceId: string; amount: number; startDate: string; endDate: string; status: string }>;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const confidenceColors: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  low: "bg-red-500/10 text-red-500 border-red-500/30",
};

const complianceColors: Record<string, string> = {
  compliant: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  attention_required: "bg-red-500/10 text-red-500 border-red-500/30",
};

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({
  recognition,
  detail,
}: {
  recognition: RecognitionSummary | undefined;
  detail: { summary: PLDetailSummary } | undefined;
}) {
  const summary = detail?.summary;
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Revenue (MTD)</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatCurrency(summary?.totalRevenue ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">Total invoiced this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Recognized</span>
              <CheckCircle className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatCurrency(recognition?.recognizedAmount ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">{recognition?.recognizedSchedules ?? 0} schedules completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Deferred</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatCurrency(recognition?.deferredAmount ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">Earned in future periods</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Net Profit</span>
              {(summary?.netProfit ?? 0) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div
              className={cn(
                "mt-2 text-2xl font-bold",
                (summary?.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-red-500",
              )}
            >
              {formatCurrency(summary?.netProfit ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Margin: {summary?.grossMarginPercent ?? 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs Expenses breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
          <CardDescription>Current period financial breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="font-medium text-emerald-500">{formatCurrency(summary?.totalRevenue ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recognized Revenue</span>
              <span className="font-medium">{formatCurrency(summary?.totalRecognized ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Deferred Revenue</span>
              <span className="font-medium text-amber-500">{formatCurrency(summary?.totalDeferred ?? 0)}</span>
            </div>
            <div className="border-t pt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Expenses</span>
              <span className="font-medium text-red-500">–{formatCurrency(summary?.totalExpenses ?? 0)}</span>
            </div>
            <div className="border-t pt-3 flex items-center justify-between font-semibold">
              <span>Net Profit</span>
              <span className={cn((summary?.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                {formatCurrency(summary?.netProfit ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gross Margin</span>
              <span className="font-medium">{summary?.grossMarginPercent ?? 0}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recognition status cards */}
      {recognition && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(recognition.pendingAmount)}</div>
              <div className="text-xs text-muted-foreground mt-1">{recognition.pendingSchedules} schedules</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">In Progress</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(recognition.inProgressAmount)}</div>
              <div className="text-xs text-muted-foreground mt-1">Accrual underway</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Recognized</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(recognition.recognizedAmount)}</div>
              <div className="text-xs text-muted-foreground mt-1">{recognition.recognizedSchedules} complete</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ data }: { data: HistoryPeriod[] | undefined }) {
  if (!data?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No historical data available yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: formatMonth(d.month),
    Revenue: d.revenue,
    Expenses: d.expenses,
    "Net Profit": d.netProfit,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">12-Month Revenue History</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="Revenue" fill="#0D9488" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#e11d48" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Net Profit" fill="#0891B2" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Detail</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border">
                <th className="pb-2 pr-4">Month</th>
                <th className="pb-2 pr-4 text-right">Revenue</th>
                <th className="pb-2 pr-4 text-right">Expenses</th>
                <th className="pb-2 pr-4 text-right">Net Profit</th>
                <th className="pb-2 pr-4 text-right">Margin</th>
                <th className="pb-2 text-right">Recognized</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{formatMonth(d.month)}</td>
                  <td className="py-2 pr-4 text-right text-emerald-500">{formatCurrency(d.revenue)}</td>
                  <td className="py-2 pr-4 text-right text-red-500">–{formatCurrency(d.expenses)}</td>
                  <td className={cn("py-2 pr-4 text-right font-medium", d.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {formatCurrency(d.netProfit)}
                  </td>
                  <td className="py-2 pr-4 text-right">{d.marginPercent}%</td>
                  <td className="py-2 text-right">{formatCurrency(d.recognized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Forecast Tab ────────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: ForecastResult | undefined }) {
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Forecast data unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.forecasts.map((f) => ({
    name: formatMonth(f.month),
    "Projected": f.projectedRevenue,
    "Known Contracts": f.knownContractRevenue,
    "Historical Trend": f.historicalTrendRevenue,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Avg Monthly Revenue</div>
            <div className="text-xl font-bold mt-1">{formatCurrency(data.averageMonthlyRevenue)}</div>
            <div className="text-xs text-muted-foreground mt-1">Last {data.basePeriodMonths} months</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Growth Rate</div>
            <div className={cn("text-xl font-bold mt-1", data.growthRatePercent >= 0 ? "text-emerald-500" : "text-red-500")}>
              {data.growthRatePercent >= 0 ? "+" : ""}{data.growthRatePercent.toFixed(1)}%/mo
            </div>
            <div className="text-xs text-muted-foreground mt-1">Historical trend</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">3-Month Outlook</div>
            <div className="text-xl font-bold mt-1">
              {formatCurrency(data.forecasts.reduce((s, f) => s + f.projectedRevenue, 0))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Combined projection</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="Projected" stroke="#0D9488" strokeWidth={2} dot={true} />
              <Line type="monotone" dataKey="Known Contracts" stroke="#0891B2" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="Historical Trend" stroke="#6366f1" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.forecasts.map((f) => (
          <Card key={f.month}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{formatMonth(f.month)}</CardTitle>
                <Badge variant="outline" className={cn("text-xs", confidenceColors[f.confidenceLevel])}>
                  {f.confidenceLevel} confidence
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(f.projectedRevenue)}</div>
              <div className="mt-2 space-y-1">
                {f.assumptions.map((a, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {a}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.keyAssumptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Key Assumptions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.keyAssumptions.map((a, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1 shrink-0">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── ASC 606 Tab ─────────────────────────────────────────────────────────────

function Asc606Tab({ data }: { data: Asc606Report | undefined }) {
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">ASC 606 report unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const checklistIcons = {
    complete: <CheckCircle className="h-4 w-4 text-emerald-500" />,
    partial: <AlertCircle className="h-4 w-4 text-amber-500" />,
    incomplete: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div className="space-y-6">
      {/* Status header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">ASC 606 Compliance Status</div>
              <Badge variant="outline" className={cn("text-sm font-semibold px-3 py-1", complianceColors[data.complianceStatus])}>
                {data.complianceStatus.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Contracts</div>
                <div className="font-semibold">{data.totalContracts}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Contract Value</div>
                <div className="font-semibold">{formatCurrency(data.totalContractValue)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Recognized</div>
                <div className="font-semibold text-emerald-500">{formatCurrency(data.totalRecognized)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Deferred</div>
                <div className="font-semibold text-amber-500">{formatCurrency(data.totalDeferred)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5-step checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5-Step Recognition Model</CardTitle>
          <CardDescription>ASC 606 compliance checklist</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.checklist.map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                {checklistIcons[item.status]}
                <div className="flex-1">
                  <span className="text-sm font-medium mr-2">Step {item.step}:</span>
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs shrink-0",
                    item.status === "complete"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                      : item.status === "partial"
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      : "bg-red-500/10 text-red-500 border-red-500/30",
                  )}
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Schedule summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recognition Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Accrual schedules</span>
                <span>{data.recognitionScheduleSummary.accrualSchedules}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash schedules</span>
                <span>{data.recognitionScheduleSummary.cashSchedules}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending/In-progress</span>
                <span className="text-amber-500">{data.recognitionScheduleSummary.pendingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span className="text-emerald-500">{data.recognitionScheduleSummary.recognizedCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Deferred Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total deferred</span>
                <span className="text-amber-500">{formatCurrency(data.deferredRevenueSummary.totalDeferred)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected this month</span>
                <span className="text-emerald-500">{formatCurrency(data.deferredRevenueSummary.expectedRecognitionThisMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deferred entries</span>
                <span>{data.deferredRevenueSummary.entries.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PLDashboard() {
  const [activeTab, setActiveTab] = useState("summary");
  const { toast } = useToast();

  const { data: recognitionRes, isLoading: recogLoading } = useQuery({
    queryKey: ["/api/finance/recognition/summary"],
    queryFn: () => apiRequest("GET", "/api/finance/recognition/summary"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: forecastRes, isLoading: forecastLoading } = useQuery({
    queryKey: ["/api/finance/forecast"],
    queryFn: () => apiRequest("GET", "/api/finance/forecast"),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "forecast",
  });

  const { data: historyRes, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/finance/pl/history"],
    queryFn: () => apiRequest("GET", "/api/finance/pl/history"),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "history",
  });

  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/finance/pl/detail"],
    queryFn: () => apiRequest("GET", "/api/finance/pl/detail"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: asc606Res, isLoading: asc606Loading } = useQuery({
    queryKey: ["/api/finance/asc-606/report"],
    queryFn: () => apiRequest("GET", "/api/finance/asc-606/report"),
    staleTime: 15 * 60 * 1000,
    enabled: activeTab === "asc606",
  });

  const recognitionSummary: RecognitionSummary | undefined = (recognitionRes as any)?.data;
  const forecastData: ForecastResult | undefined = (forecastRes as any)?.data;
  const historyData: HistoryPeriod[] | undefined = (historyRes as any)?.data?.history;
  const detailData: { summary: PLDetailSummary } | undefined = (detailRes as any)?.data;
  const asc606Data: Asc606Report | undefined = (asc606Res as any)?.data;

  const isInitialLoading = recogLoading || detailLoading;

  const pageConfig: CanvasPageConfig = {
    id: "pl-dashboard",
    title: "P&L Revenue Recognition",
    subtitle: "ASC 606 revenue scheduling, deferred revenue, and financial forecasting",
    // @ts-expect-error — TS migration: fix in refactoring sprint
    category: "workspace",
    headerActions: (
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {isInitialLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start" data-testid="tabs-pl-dashboard">
            <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">12-Month History</TabsTrigger>
            <TabsTrigger value="forecast" data-testid="tab-forecast">Forecast</TabsTrigger>
            <TabsTrigger value="asc606" data-testid="tab-asc606">ASC 606</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-6">
            <SummaryTab recognition={recognitionSummary} detail={detailData} />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {historyLoading ? (
              <Skeleton className="h-[400px]" />
            ) : (
              <HistoryTab data={historyData} />
            )}
          </TabsContent>

          <TabsContent value="forecast" className="mt-6">
            {forecastLoading ? (
              <Skeleton className="h-[400px]" />
            ) : (
              <ForecastTab data={forecastData} />
            )}
          </TabsContent>

          <TabsContent value="asc606" className="mt-6">
            {asc606Loading ? (
              <Skeleton className="h-[400px]" />
            ) : (
              <Asc606Tab data={asc606Data} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </CanvasHubPage>
  );
}
