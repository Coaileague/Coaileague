import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useClientLookup } from "@/hooks/useClients";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  TrendingUp,
  Building2,
  CreditCard,
  Download,
} from "lucide-react";
import type { Invoice, Client } from "@shared/schema";
import { DashboardShell, ResponsiveSection } from "@/components/dashboard-shell";

export default function ClientPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch data
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: clients = [] } = useClientLookup();

  // Find current client based on user email
  const currentClient = clients.find(client => client.email === user?.email);

  // Filter invoices for this client
  const clientInvoices = currentClient
    ? invoices.filter(inv => inv.clientId === currentClient.id)
    : [];

  // Calculate financial metrics
  const totalBilled = clientInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const totalPaid = clientInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const outstandingBalance = clientInvoices
    .filter(inv => inv.status === 'sent')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const draftAmount = clientInvoices
    .filter(inv => inv.status === 'draft')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  // Get invoices due this week
  const today = new Date();
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const dueThisWeek = clientInvoices.filter(inv => {
    if (!inv.dueDate || inv.status === 'paid') return false;
    const dueDate = new Date(inv.dueDate);
    return dueDate >= today && dueDate <= weekFromNow;
  });

  const dueThisWeekAmount = dueThisWeek.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  // Filter invoices by status
  const filteredInvoices = statusFilter === 'all' 
    ? clientInvoices
    : clientInvoices.filter(inv => inv.status === statusFilter);

  // Sort by date (newest first)
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const dateA = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const dateB = b.issueDate ? new Date(b.issueDate).getTime() : 0;
    return dateB - dateA;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-muted/10 text-primary border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Paid
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-0">
            <Clock className="h-3 w-3 mr-1" />
            Outstanding
          </Badge>
        );
      case 'draft':
        return (
          <Badge variant="secondary">
            <FileText className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilDue = (dueDate: string | Date | null) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (!currentClient) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
        <div className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Client Account Not Found</h2>
          <p className="text-muted-foreground">
            You need to be registered as a client to access this portal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="w-full overflow-x-hidden">
      <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">Client Dashboard</h1>
              <p className="text-muted-foreground">
                {currentClient.companyName || `${currentClient.firstName} ${currentClient.lastName}`}
              </p>
            </div>
          </div>

          {/* Financial Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-indigo-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  <Badge variant="secondary">All Time</Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-billed">
                  ${totalBilled.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Total Billed</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <Badge className="bg-muted/10 text-primary border-0">
                    {clientInvoices.filter(i => i.status === 'paid').length}
                  </Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-paid">
                  ${totalPaid.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <AlertCircle className="h-5 w-5 text-blue-500" />
                  <Badge className="bg-blue-500/10 text-blue-600 border-0">
                    {clientInvoices.filter(i => i.status === 'sent').length}
                  </Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-outstanding">
                  ${outstandingBalance.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="h-5 w-5 text-rose-500" />
                  <Badge className="bg-rose-500/10 text-rose-600 border-0">
                    {dueThisWeek.length}
                  </Badge>
                </div>
                <div className="text-2xl font-bold" data-testid="text-due-this-week">
                  ${dueThisWeekAmount.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Due This Week</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">Payment History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-500" />
                    Upcoming Payments
                  </CardTitle>
                  <CardDescription>Invoices due in the next 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {dueThisWeek.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
                      <p className="text-muted-foreground">No payments due this week</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dueThisWeek.map(invoice => {
                        const daysUntil = getDaysUntilDue(invoice.dueDate);
                        return (
                          <div
                            key={invoice.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-border"
                          >
                            <div className="flex-1">
                              <p className="font-semibold">{invoice.invoiceNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                Due {formatDate(invoice.dueDate)}
                                {daysUntil !== null && (
                                  <span className="ml-2 text-blue-600">
                                    ({daysUntil} {daysUntil === 1 ? 'day' : 'days'})
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">${Number(invoice.total || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Account Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Invoices</span>
                    <Badge variant="secondary">{clientInvoices.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Paid Invoices</span>
                    <Badge className="bg-muted/10 text-primary border-0">
                      {clientInvoices.filter(i => i.status === 'paid').length}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Outstanding</span>
                    <Badge className="bg-blue-500/10 text-blue-600 border-0">
                      {clientInvoices.filter(i => i.status === 'sent').length}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Payment Rate</span>
                    <Badge className="bg-indigo-500/10 text-indigo-600 border-0">
                      {clientInvoices.length > 0
                        ? ((clientInvoices.filter(i => i.status === 'paid').length / clientInvoices.length) * 100).toFixed(0)
                        : 0}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Invoices</CardTitle>
                    <CardDescription>View and download your invoices</CardDescription>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Invoices</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="sent">Outstanding</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No invoices found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedInvoices.map(invoice => {
                          const daysUntil = getDaysUntilDue(invoice.dueDate);
                          const isOverdue = daysUntil !== null && daysUntil < 0 && invoice.status === 'sent';

                          return (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                              <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                              <TableCell>
                                {formatDate(invoice.dueDate)}
                                {isOverdue && (
                                  <Badge className="ml-2 bg-rose-500/10 text-rose-600 border-0" variant="outline">
                                    Overdue
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                ${Number(invoice.total || 0).toFixed(2)}
                              </TableCell>
                              <TableCell>{getStatusBadge(invoice.status || '')}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" data-testid={`button-download-${invoice.id}`}>
                                  <Download className="h-4 w-4 mr-2" />
                                  PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Payment History
                </CardTitle>
                <CardDescription>All paid invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {clientInvoices.filter(i => i.status === 'paid').length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No payment history yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clientInvoices
                        .filter(i => i.status === 'paid')
                        .sort((a, b) => {
                          const dateA = a.issueDate ? new Date(a.issueDate).getTime() : 0;
                          const dateB = b.issueDate ? new Date(b.issueDate).getTime() : 0;
                          return dateB - dateA;
                        })
                        .map(invoice => (
                          <div
                            key={invoice.id}
                            className="flex items-center justify-between p-4 rounded-lg border border-border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-muted/10 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold">{invoice.invoiceNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  Paid on {formatDate(invoice.issueDate)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">
                                ${Number(invoice.total || 0).toFixed(2)}
                              </p>
                              <Button size="sm" variant="ghost" className="mt-1">
                                <Download className="h-3 w-3 mr-1" />
                                Receipt
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </div>
  );
}
