import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, DollarSign, FileText, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface AgingBucket {
  label: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    dueDate: string;
    status: string;
    daysOverdue: number;
    issueDate: string;
  }>;
  total: number;
}

interface AgingReport {
  asOf: string;
  grandTotal: number;
  buckets: {
    current: AgingBucket;
    thirtyOne: AgingBucket;
    sixtyOne: AgingBucket;
    ninetyPlus: AgingBucket;
  };
  summary: {
    current: number;
    thirtyOneSixty: number;
    sixtyOneNinety: number;
    ninetyPlus: number;
  };
}

function fmt(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function BucketCard({
  bucket,
  colorClass,
  isLoading,
}: {
  bucket: AgingBucket;
  colorClass: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{bucket.label}</CardTitle>
          <Badge variant="outline" className={colorClass}>
            {bucket.invoices.length} invoice{bucket.invoices.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className={cn("text-2xl font-bold", colorClass)}>{fmt(bucket.total)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusColor(daysOverdue: number) {
  if (daysOverdue > 90) return "text-red-700 dark:text-red-400 border-red-500";
  if (daysOverdue > 60) return "text-red-600 dark:text-red-400 border-red-400";
  if (daysOverdue > 30) return "text-orange-600 dark:text-orange-400 border-orange-400";
  return "text-yellow-600 dark:text-yellow-400 border-yellow-400";
}

function InvoiceTable({ invoices, isLoading }: { invoices: AgingBucket["invoices"]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (!invoices.length) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">No invoices in this bucket.</div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Issue Date</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Days Overdue</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map(inv => (
          <TableRow key={inv.id} data-testid={`aging-row-${inv.id}`}>
            <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
            <TableCell>{inv.clientName}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {inv.issueDate ? format(new Date(inv.issueDate), "MMM d, yyyy") : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : "—"}
            </TableCell>
            <TableCell>
              {inv.daysOverdue > 0 ? (
                <Badge variant="outline" className={cn("text-xs", getStatusColor(inv.daysOverdue))}>
                  {inv.daysOverdue}d
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Not due</Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-semibold">{fmt(inv.amount)}</TableCell>
            <TableCell>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/invoices/${inv.id}`}>View</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function InvoiceAging() {
  const { data, isLoading, error } = useQuery<AgingReport>({
    queryKey: ["/api/invoices/aging"],
  });

  const allInvoices = data ? [
    ...data.buckets.current.invoices,
    ...data.buckets.thirtyOne.invoices,
    ...data.buckets.sixtyOne.invoices,
    ...data.buckets.ninetyPlus.invoices,
  ] : [];

  const pageConfig: CanvasPageConfig = {
    id: 'invoice-aging',
    title: 'Invoice Aging Report',
    category: 'operations',
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoice Aging Report</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-1">
              As of {format(new Date(data.asOf), "MMMM d, yyyy h:mm a")} &middot;{" "}
              {allInvoices.length} open invoice{allInvoices.length !== 1 ? "s" : ""} &middot;{" "}
              <span className="font-medium">{fmt(data.grandTotal)}</span> total outstanding
            </p>
          )}
        </div>
        <Button variant="outline" size="default" asChild>
          <Link href="/cash-flow">
            <TrendingUp className="h-4 w-4 mr-2" />
            Cash Flow Dashboard
          </Link>
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Failed to load aging report. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-6 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          <>
            <BucketCard bucket={data.buckets.current} colorClass="text-foreground" />
            <BucketCard bucket={data.buckets.thirtyOne} colorClass="text-yellow-600 dark:text-yellow-400" />
            <BucketCard bucket={data.buckets.sixtyOne} colorClass="text-orange-600 dark:text-orange-400" />
            <BucketCard bucket={data.buckets.ninetyPlus} colorClass="text-red-600 dark:text-red-400" />
          </>
        ) : null}
      </div>

      {data && data.buckets.ninetyPlus.invoices.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">
                {data.buckets.ninetyPlus.invoices.length} invoice{data.buckets.ninetyPlus.invoices.length !== 1 ? "s are" : " is"} 90+ days overdue totaling{" "}
                {fmt(data.buckets.ninetyPlus.total)}. These require immediate escalation. Consider a demand letter or collections agency.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {(["current", "thirtyOne", "sixtyOne", "ninetyPlus"] as const).map(key => {
          const bucket = data?.buckets[key];
          const labels: Record<string, string> = {
            current: "Current (0–30 days)",
            thirtyOne: "31–60 days",
            sixtyOne: "61–90 days",
            ninetyPlus: "90+ days",
          };
          return (
            <Card key={key}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{labels[key]}</CardTitle>
                  {bucket && <span className="text-sm font-semibold">{fmt(bucket.total)}</span>}
                </div>
              </CardHeader>
              <CardContent>
                <InvoiceTable
                  invoices={bucket?.invoices ?? []}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </CanvasHubPage>
  );
}
