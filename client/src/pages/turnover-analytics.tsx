import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  TrendingDown,
  Clock,
  DollarSign,
  AlertTriangle,
  UserMinus,
  BarChart3,
  Calendar,
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: "turnover-analytics",
  category: "operations",
  title: "Guard Turnover Analytics",
  subtitle: "Track retention, attrition risk, and cost-to-replace estimates",
};

interface TurnoverData {
  summary: {
    activeEmployees: number;
    terminatedInPeriod: number;
    turnoverRate: number;
    avgActiveTenureDays: number;
    avgTermedTenureDays: number;
    medianTenureDays: number;
    estimatedTurnoverCost: number;
    costPerHireEstimate: number;
    periodMonths: number;
  };
  byRole: Array<{
    role: string;
    active: number;
    terminated: number;
    rate: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    terminations: number;
  }>;
  recentTerminations: Array<{
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    position: string;
    hireDate: string;
    terminationDate: string;
    reason: string;
    tenureDays: number;
  }>;
  attritionRisk: Array<{
    role: string;
    activeCount: number;
    turnoverRate: number;
    riskLevel: "high" | "medium" | "low";
  }>;
}

function formatDays(days: number): string {
  if (days <= 0) return "N/A";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const remainMonths = Math.round((days % 365) / 30);
  return remainMonths > 0 ? `${years}y ${remainMonths}mo` : `${years}y`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function TurnoverAnalytics() {
  const [periodMonths, setPeriodMonths] = useState("12");

  const { data, isLoading } = useQuery<TurnoverData>({
    queryKey: ["/api/analytics/turnover", periodMonths],
  });

  const maxTerminations = data?.monthlyTrend
    ? Math.max(...data.monthlyTrend.map((m) => m.terminations), 1)
    : 1;

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Period:</span>
            <Select value={periodMonths} onValueChange={setPeriodMonths}>
              <SelectTrigger className="w-36" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
                <SelectItem value="24">Last 24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Turnover Rate</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" data-testid="text-turnover-rate">
                      {data.summary.turnoverRate}%
                    </span>
                    <span className="text-xs text-muted-foreground">annualized</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.summary.terminatedInPeriod} departed / {data.summary.activeEmployees} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Avg Tenure (Active)</span>
                  </div>
                  <div className="text-2xl font-bold" data-testid="text-avg-tenure">
                    {formatDays(data.summary.avgActiveTenureDays)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Median: {formatDays(data.summary.medianTenureDays)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <UserMinus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Avg Tenure (Departed)</span>
                  </div>
                  <div className="text-2xl font-bold" data-testid="text-avg-departed-tenure">
                    {formatDays(data.summary.avgTermedTenureDays)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.summary.terminatedInPeriod} guards departed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Est. Turnover Cost</span>
                  </div>
                  <div className="text-2xl font-bold" data-testid="text-turnover-cost">
                    {formatCurrency(data.summary.estimatedTurnoverCost)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(data.summary.costPerHireEstimate)} per hire
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-base">Monthly Departures</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {data.monthlyTrend.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No termination data in this period
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.monthlyTrend.map((m) => (
                        <div key={m.month} className="flex items-center gap-3" data-testid={`row-month-${m.month}`}>
                          <span className="text-xs text-muted-foreground w-16 shrink-0">
                            {formatMonth(m.month)}
                          </span>
                          <div className="flex-1 h-5 bg-muted rounded-md overflow-hidden">
                            <div
                              className="h-full bg-destructive/70 rounded-md transition-all"
                              style={{ width: `${(m.terminations / maxTerminations) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-6 text-right">{m.terminations}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-base">Attrition Risk</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {data.attritionRisk.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No high-risk roles detected
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.attritionRisk.map((risk) => (
                        <div
                          key={risk.role}
                          className="flex items-center justify-between gap-2 flex-wrap"
                          data-testid={`row-risk-${risk.role}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                risk.riskLevel === "high"
                                  ? "destructive"
                                  : risk.riskLevel === "medium"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {risk.riskLevel}
                            </Badge>
                            <span className="text-sm font-medium">{risk.role}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{risk.activeCount} active</span>
                            <span>{risk.turnoverRate}% rate</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Turnover by Role</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {data.byRole.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No role data available
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Departed</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byRole.map((r) => (
                        <TableRow key={r.role} data-testid={`row-role-${r.role}`}>
                          <TableCell className="font-medium">{r.role}</TableCell>
                          <TableCell className="text-right">{r.active}</TableCell>
                          <TableCell className="text-right">{r.terminated}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                r.rate > (data.summary.turnoverRate * 1.5)
                                  ? "destructive"
                                  : r.rate > data.summary.turnoverRate
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {r.rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Recent Departures</CardTitle>
                <UserMinus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {data.recentTerminations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No departures in this period
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Hired</TableHead>
                        <TableHead>Departed</TableHead>
                        <TableHead className="text-right">Tenure</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentTerminations.map((t) => (
                        <TableRow key={t.id} data-testid={`row-termination-${t.id}`}>
                          <TableCell className="font-medium">
                            {t.firstName} {t.lastName}
                          </TableCell>
                          <TableCell>{t.role || t.position || "—"}</TableCell>
                          <TableCell>
                            {t.hireDate
                              ? new Date(t.hireDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {t.terminationDate
                              ? new Date(t.terminationDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDays(t.tenureDays)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {t.reason || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Failed to load turnover data</p>
            </CardContent>
          </Card>
        )}
      </div>
    </CanvasHubPage>
  );
}
