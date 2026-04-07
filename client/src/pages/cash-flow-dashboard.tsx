import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  Clock,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface CashFlowSummary {
  asOf: string;
  period: { start: string; end: string };
  moneyIn: number;
  moneyExpected: number;
  moneyOverdue: number;
  moneyOut: number;
  netPosition: number;
  overdueCount: number;
  expectedCount: number;
  topOverdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
    status: string;
  }>;
}

function fmt(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function MetricCard({
  title,
  amount,
  icon: Icon,
  color,
  subtext,
  isLoading,
}: {
  title: string;
  amount: number;
  icon: any;
  color: string;
  subtext?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className={cn("text-2xl font-bold", color)}>{fmt(amount)}</p>
            )}
            {subtext && !isLoading && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
          <div className={cn("p-2 rounded-md", `bg-${color.split("-")[1]}-100 dark:bg-${color.split("-")[1]}-900/20`)}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CashFlowDashboard() {
  const { data, isLoading, error } = useQuery<CashFlowSummary>({
    queryKey: ["/api/invoices/cash-flow-summary"],
  });

  const netPositionColor =
    !data ? "text-foreground" :
    data.netPosition > 0 ? "text-green-600 dark:text-green-400" :
    data.netPosition < 0 ? "text-red-600 dark:text-red-400" :
    "text-muted-foreground";

  const pageConfig: CanvasPageConfig = {
    id: 'cash-flow',
    title: 'Cash Flow Dashboard',
    category: 'operations',
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Dashboard</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(data.period.start), "MMMM d")} –{" "}
              {format(new Date(data.period.end), "MMMM d, yyyy")} &middot; As of{" "}
              {format(new Date(data.asOf), "h:mm a")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="default" asChild>
            <Link href="/invoice-aging">
              <FileText className="h-4 w-4 mr-2" />
              Aging Report
            </Link>
          </Button>
          <Button variant="outline" size="default" asChild>
            <Link href="/invoices">
              View All Invoices
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Failed to load cash flow data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Money In (paid this month)"
          amount={data?.moneyIn ?? 0}
          icon={TrendingUp}
          color="text-green-600 dark:text-green-400"
          isLoading={isLoading}
        />
        <MetricCard
          title="Money Expected"
          amount={data?.moneyExpected ?? 0}
          icon={Clock}
          color="text-blue-600 dark:text-blue-400"
          subtext={data ? `${data.expectedCount} outstanding invoice${data.expectedCount !== 1 ? "s" : ""}` : undefined}
          isLoading={isLoading}
        />
        <MetricCard
          title="Money Overdue"
          amount={data?.moneyOverdue ?? 0}
          icon={AlertCircle}
          color={data && data.moneyOverdue > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}
          subtext={data ? `${data.overdueCount} overdue invoice${data.overdueCount !== 1 ? "s" : ""}` : undefined}
          isLoading={isLoading}
        />
        <MetricCard
          title="Payroll Obligation"
          amount={data?.moneyOut ?? 0}
          icon={Users}
          color="text-orange-600 dark:text-orange-400"
          subtext="Current period pending payroll"
          isLoading={isLoading}
        />
        <Card className="sm:col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground mb-1">Net Cash Position</p>
                {isLoading ? (
                  <Skeleton className="h-10 w-40" />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className={cn("text-3xl font-bold", netPositionColor)}>
                      {fmt(data?.netPosition ?? 0)}
                    </p>
                    {data && data.netPosition > 0 && <ArrowUpRight className="h-6 w-6 text-green-600" />}
                    {data && data.netPosition < 0 && <ArrowDownRight className="h-6 w-6 text-red-600" />}
                    {data && data.netPosition === 0 && <Minus className="h-6 w-6 text-muted-foreground" />}
                  </div>
                )}
                {data && !isLoading && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Money coming in ({fmt(data.moneyIn + data.moneyExpected)}) minus payroll ({fmt(data.moneyOut)})
                  </p>
                )}
              </div>
              <div className="p-2 rounded-md bg-muted">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            {data && data.netPosition < data.moneyOut && data.moneyOut > 0 && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive font-medium">
                    Cash gap alert: Incoming funds may not cover payroll this period. Chase overdue invoices or arrange a credit line before payroll runs.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Top Overdue Invoices</CardTitle>
            {data && data.overdueCount > 3 && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/invoice-aging">View All ({data.overdueCount})</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data?.topOverdueInvoices?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No overdue invoices. Great job staying on top of collections.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.topOverdueInvoices.map(inv => (
                <div
                  key={inv.id}
                  data-testid={`overdue-invoice-${inv.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          inv.daysOverdue > 60 ? "border-red-500 text-red-600 dark:text-red-400" :
                          inv.daysOverdue > 30 ? "border-orange-500 text-orange-600 dark:text-orange-400" :
                          "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                        )}
                      >
                        {inv.daysOverdue}d overdue
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{inv.clientName}</p>
                      <p className="text-xs text-muted-foreground">Invoice {inv.invoiceNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{fmt(inv.amount)}</p>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/invoices/${inv.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Paid this month: <span className="text-foreground font-medium">{fmt(data?.moneyIn ?? 0)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Expected: <span className="text-foreground font-medium">{fmt(data?.moneyExpected ?? 0)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Overdue: <span className="text-foreground font-medium">{fmt(data?.moneyOverdue ?? 0)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">Payroll out: <span className="text-foreground font-medium">{fmt(data?.moneyOut ?? 0)}</span></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </CanvasHubPage>
  );
}
