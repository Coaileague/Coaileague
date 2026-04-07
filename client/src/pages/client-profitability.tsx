import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Search,
  ArrowUpDown,
  Building2,
  Clock,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientProfitData {
  clientId: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  contractRate: number;
  isActive: boolean;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  revenue: number;
  laborCost: number;
  grossMargin: number;
  marginPercent: number;
  uniqueGuards: number;
  totalEntries: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

interface ProfitabilitySummary {
  totalRevenue: number;
  totalLaborCost: number;
  totalGrossMargin: number;
  avgMarginPercent: number;
  totalCollected: number;
  totalOutstanding: number;
  activeClients: number;
  totalClients: number;
}

interface ProfitabilityResponse {
  clients: ClientProfitData[];
  summary: ProfitabilitySummary;
}

type SortField = "revenue" | "laborCost" | "grossMargin" | "marginPercent" | "totalHours" | "name";
type SortDir = "asc" | "desc";

const pageConfig: CanvasPageConfig = {
  id: "client-profitability",
  category: "operations",
  title: "Client Profitability",
  subtitle: "Per-client profit analysis with bill rate vs pay rate breakdown",
  maxWidth: "7xl",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDetailed(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getMarginBadge(percent: number) {
  if (percent >= 30) return { variant: "default" as const, label: "High" };
  if (percent >= 15) return { variant: "secondary" as const, label: "Medium" };
  if (percent > 0) return { variant: "outline" as const, label: "Low" };
  return { variant: "destructive" as const, label: "Loss" };
}

function getMarginBarColor(percent: number): string {
  if (percent >= 30) return "bg-green-500 dark:bg-green-400";
  if (percent >= 15) return "bg-amber-500 dark:bg-amber-400";
  if (percent > 0) return "bg-orange-500 dark:bg-orange-400";
  return "bg-red-500 dark:bg-red-400";
}

export default function ClientProfitability() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showInactive, setShowInactive] = useState(false);

  const dateParams = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "month": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
      }
      case "quarter": {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        return { dateFrom: qStart.toISOString(), dateTo: now.toISOString() };
      }
      case "year": {
        const yStart = new Date(now.getFullYear(), 0, 1);
        return { dateFrom: yStart.toISOString(), dateTo: now.toISOString() };
      }
      default:
        return {};
    }
  }, [dateRange]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (dateParams.dateFrom) p.set("dateFrom", dateParams.dateFrom);
    if (dateParams.dateTo) p.set("dateTo", dateParams.dateTo);
    return p.toString() ? `?${p.toString()}` : "";
  }, [dateParams]);

  const { data, isLoading } = useQuery<ProfitabilityResponse>({
    queryKey: ["/api/analytics/client-profitability", dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/client-profitability${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const filteredClients = useMemo(() => {
    if (!data?.clients) return [];
    let list = data.clients;

    if (!showInactive) {
      list = list.filter((c) => c.isActive);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          (c.companyName && c.companyName.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case "name":
          aVal = (a.companyName || `${a.firstName} ${a.lastName}`).toLowerCase();
          bVal = (b.companyName || `${b.firstName} ${b.lastName}`).toLowerCase();
          break;
        case "revenue":
          aVal = a.revenue;
          bVal = b.revenue;
          break;
        case "laborCost":
          aVal = a.laborCost;
          bVal = b.laborCost;
          break;
        case "grossMargin":
          aVal = a.grossMargin;
          bVal = b.grossMargin;
          break;
        case "marginPercent":
          aVal = a.marginPercent;
          bVal = b.marginPercent;
          break;
        case "totalHours":
          aVal = a.totalHours;
          bVal = b.totalHours;
          break;
        default:
          aVal = a.revenue;
          bVal = b.revenue;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return list;
  }, [data, searchQuery, sortField, sortDir, showInactive]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const summary = data?.summary;

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="text-xl font-bold" data-testid="text-total-revenue">
                        {formatCurrency(summary?.totalRevenue ?? 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Labor Cost</p>
                      <p className="text-xl font-bold" data-testid="text-total-labor-cost">
                        {formatCurrency(summary?.totalLaborCost ?? 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      {(summary?.totalGrossMargin ?? 0) >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Margin</p>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          (summary?.totalGrossMargin ?? 0) >= 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-red-700 dark:text-red-400"
                        )}
                        data-testid="text-total-gross-margin"
                      >
                        {formatCurrency(summary?.totalGrossMargin ?? 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Margin %</p>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          (summary?.avgMarginPercent ?? 0) >= 15
                            ? "text-green-700 dark:text-green-400"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                        data-testid="text-avg-margin"
                      >
                        {summary?.avgMarginPercent ?? 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-lg">Client Profitability Breakdown</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-48"
                    data-testid="input-search-clients"
                  />
                </div>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-36" data-testid="select-date-range">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={showInactive ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowInactive(!showInactive)}
                  data-testid="button-toggle-inactive"
                >
                  {showInactive ? "Hide Inactive" : "Show Inactive"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No client profitability data found</p>
                <p className="text-sm mt-1">
                  Profitability data is calculated from approved time entries with bill and pay rates
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("name")}
                          className="gap-1 -ml-2"
                          data-testid="button-sort-name"
                        >
                          Client
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("totalHours")}
                          className="gap-1"
                          data-testid="button-sort-hours"
                        >
                          Hours
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("revenue")}
                          className="gap-1"
                          data-testid="button-sort-revenue"
                        >
                          Revenue
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("laborCost")}
                          className="gap-1"
                          data-testid="button-sort-labor"
                        >
                          Labor Cost
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("grossMargin")}
                          className="gap-1"
                          data-testid="button-sort-margin"
                        >
                          Net Profit
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSort("marginPercent")}
                          className="gap-1"
                          data-testid="button-sort-margin-pct"
                        >
                          Margin %
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-center">Guards</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => {
                      const badge = getMarginBadge(client.marginPercent);
                      const clientName =
                        client.companyName || `${client.firstName} ${client.lastName}`;
                      const barWidth = Math.min(Math.max(client.marginPercent, 0), 100);

                      return (
                        <TableRow key={client.clientId} data-testid={`row-client-${client.clientId}`}>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="min-w-0">
                                <p
                                  className="font-medium truncate"
                                  data-testid={`text-client-name-${client.clientId}`}
                                >
                                  {clientName}
                                </p>
                                {client.companyName && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {client.firstName} {client.lastName}
                                  </p>
                                )}
                              </div>
                              {!client.isActive && (
                                <Badge variant="outline" className="shrink-0">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div>
                              <span data-testid={`text-hours-${client.clientId}`}>
                                {client.totalHours.toFixed(1)}
                              </span>
                              {client.overtimeHours > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3 inline mr-0.5" />
                                  {client.overtimeHours.toFixed(1)} OT
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums font-medium"
                            data-testid={`text-revenue-${client.clientId}`}
                          >
                            {formatCurrencyDetailed(client.revenue)}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums"
                            data-testid={`text-labor-${client.clientId}`}
                          >
                            {formatCurrencyDetailed(client.laborCost)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              client.grossMargin >= 0
                                ? "text-green-700 dark:text-green-400"
                                : "text-red-700 dark:text-red-400"
                            )}
                            data-testid={`text-profit-${client.clientId}`}
                          >
                            {formatCurrencyDetailed(client.grossMargin)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    getMarginBarColor(client.marginPercent)
                                  )}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <Badge
                                variant={badge.variant}
                                data-testid={`badge-margin-${client.clientId}`}
                              >
                                {client.marginPercent}%
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell
                            className="text-center tabular-nums"
                            data-testid={`text-guards-${client.clientId}`}
                          >
                            {client.uniqueGuards}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums"
                            data-testid={`text-collected-${client.clientId}`}
                          >
                            {formatCurrency(client.collected)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {!isLoading && summary && (summary.totalCollected > 0 || summary.totalOutstanding > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Collected</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-total-collected">
                      {formatCurrency(summary.totalCollected)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-total-outstanding">
                      {formatCurrency(summary.totalOutstanding)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </CanvasHubPage>
  );
}
