import { parseLocalDate, formatDate } from "@/lib/dates";
import { useState, useMemo, useEffect, memo, useCallback } from "react";
import { useLocation } from "wouter";
import { secureFetch } from "@/lib/csrf";
import { useToast } from "@/hooks/use-toast";
import { useClientLookup } from "@/hooks/useClients";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useQBTerminology } from "@/hooks/useQBTerminology";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/apiError";
import { InvoiceListResponse } from "@shared/schemas/responses/invoices";
import { isUnauthorizedError } from "@/lib/authUtils";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Eye,
  Plus,
  Search,
  FileText,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  Mail,
  Send,
  DollarSign,
  MoreVertical,
  Edit,
  Download,
  XCircle,
  Calendar,
  Users,
  TrendingUp,
  BarChart3,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';;
import { SortableHeader } from "@/components/ui/sortable-header";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalTrigger,
  UniversalModalFooter,
} from "@/components/ui/universal-modal";
import { ResponsiveDialog } from "@/components/canvas-hub/ManagedDialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { insertInvoiceSchema, type Invoice, type Client, type TimeEntry } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const PAGE_SIZE = 25;

const invoicesPageConfig: CanvasPageConfig = {
  id: 'invoices',
  category: 'operations',
  title: 'Invoices',
  subtitle: 'Generate and track customer invoices',
};

  const InvoiceRow = memo(({ 
    invoice, 
    getClientName, 
    isPastDue, 
    getStatusColor, 
    getStatusIcon, 
    getStatusText, 
    handleViewDetail, 
    handlePdfPreview, 
    openSendDialog, 
    handleDownloadPdf, 
    setSelectedInvoiceId,
    markPaidMutation,
    voidInvoiceMutation,
    isAnyMutationPending
  }: {
    invoice: Invoice;
    getClientName: (id: string) => string;
    isPastDue: (i: Invoice) => boolean;
    getStatusColor: (s: string, i: Invoice) => any;
    getStatusIcon: (s: string, i: Invoice) => any;
    getStatusText: (i: Invoice) => string;
    handleViewDetail: (i: Invoice) => void;
    handlePdfPreview: (id: string) => void;
    openSendDialog: (i: Invoice) => void;
    handleDownloadPdf: (id: string, n: string) => void;
    setSelectedInvoiceId: (id: string | null) => void;
    markPaidMutation: any;
    voidInvoiceMutation: any;
    isAnyMutationPending: boolean;
  }) => {
    return (
      <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
        <TableCell className="font-medium">
          <div className="truncate max-w-[180px] min-w-0 text-foreground" data-testid={`text-invoice-number-${invoice.id}`}>
            {invoice.invoiceNumber}
          </div>
        </TableCell>
        <TableCell>
          <div className="truncate max-w-[180px] min-w-0 text-muted-foreground" data-testid={`text-invoice-client-${invoice.id}`} title={getClientName(invoice.clientId)}>
            {getClientName(invoice.clientId)}
          </div>
          {invoice.notes && (
            <div className="text-[10px] text-muted-foreground/60 line-clamp-2 mt-0.5 max-w-[180px]" title={invoice.notes}>
              {invoice.notes}
            </div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span data-testid={`text-invoice-due-${invoice.id}`}>
              {formatDate(invoice.dueDate)}
            </span>
            {isPastDue(invoice) && (
              <Badge variant="destructive" className="w-fit text-xs" data-testid={`badge-past-due-${invoice.id}`}>
                <AlertCircle className="h-3 w-3 mr-1" />
                Past Due
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="font-semibold" data-testid={`text-invoice-total-${invoice.id}`}>{formatCurrency(invoice.total || 0)}</TableCell>
        <TableCell>
          <Badge variant={getStatusColor(invoice.status || 'draft', invoice)} className="gap-1" data-testid={`badge-status-${invoice.id}`}>
            {getStatusIcon(invoice.status || 'draft', invoice)}
            {getStatusText(invoice)}
          </Badge>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-invoice-actions-${invoice.id}`} aria-label="Invoice actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleViewDetail(invoice)}
                data-testid={`button-view-invoice-${invoice.id}`}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem 
                // @ts-expect-error — TS migration: fix in refactoring sprint
                onClick={() => handleEditDetail(invoice)}
                data-testid={`button-edit-invoice-${invoice.id}`}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Invoice
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handlePdfPreview(invoice.id)}
                data-testid={`button-preview-pdf-${invoice.id}`}
              >
                <FileText className="h-4 w-4 mr-2" />
                Preview PDF
              </DropdownMenuItem>
              {invoice.status === 'draft' && (
                <DropdownMenuItem 
                  onClick={() => openSendDialog(invoice)}
                  disabled={isAnyMutationPending}
                  data-testid={`button-send-invoice-${invoice.id}`}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send with Email
                </DropdownMenuItem>
              )}
              {!['paid', 'void', 'cancelled'].includes(invoice.status || '') && (
                <DropdownMenuItem
                  disabled={isAnyMutationPending}
                  onClick={async () => {
                    try {
                      await markPaidMutation.mutateAsync(invoice.id);
                    } catch {
                      // Error is handled by mutation's onError callback
                    }
                  }}
                  data-testid={`button-mark-paid-${invoice.id}`}
                >
                  {markPaidMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                  {markPaidMutation.isPending ? "Marking..." : "Mark as Paid"}
                </DropdownMenuItem>
              )}
              {!['void', 'cancelled', 'paid'].includes(invoice.status || '') && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      disabled={isAnyMutationPending}
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                      data-testid={`button-void-invoice-${invoice.id}`}
                    >
                      {voidInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Void Invoice
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to void invoice {invoice.invoiceNumber}? This action cannot be undone and the invoice will no longer be billable.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => voidInvoiceMutation.mutate(invoice.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Void Invoice
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <DropdownMenuItem 
                onClick={() => handleDownloadPdf(invoice.id, invoice.invoiceNumber)}
                data-testid={`button-download-pdf-${invoice.id}`}
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  });

export default function Invoices() {
  const { toast } = useToast();
  const { workspaceId } = useWorkspaceAccess();
  const [location, setLocation] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [window.location.search]);
  const qb = useQBTerminology();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || "");
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || "all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [filterClientId, setFilterClientId] = useState(() => searchParams.get('clientId') || "");
  const [filterStartDate, setFilterStartDate] = useState(() => searchParams.get('startDate') || "");
  const [filterEndDate, setFilterEndDate] = useState(() => searchParams.get('endDate') || "");
  const [page, setPage] = useState(1);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState<{ id: string; number: string } | null>(null);
  const [customEmailMessage, setCustomEmailMessage] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<{
    lineItems: Array<{ description: string; hours: number; rate: number; amount: number; date: string }>;
    subtotal: number;
    taxAmount: number;
    taxRate?: number;
    platformFeePercent: number;
    platformFeeAmount: number;
    total: number;
  } | null>(null);
  const [generateFormData, setGenerateFormData] = useState<{
    clientId: string;
    dueDate: string;
    taxRate: string;
    selectedTimeEntries: string[];
  }>({ clientId: "", dueDate: "", taxRate: "0", selectedTimeEntries: [] });
  const [hoursFormData, setHoursFormData] = useState({
    clientId: "",
    startDate: "",
    endDate: "",
    taxRate: "0",
    hourlyRateOverride: "",
    notes: "",
    dueInDays: "30",
    groupByEmployee: false,
  });

  // Data queries — must be inside component so hooks are in valid scope
  const invoicesQuery = useQuery<Invoice[]>({
    queryKey: ['/api/invoices', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => apiFetch('/api/invoices', InvoiceListResponse) as unknown as Promise<Invoice[]>,
  });
  const {
    data: invoicesData,
    isLoading,
    isError,
    isEmpty: isInvoicesEmpty,
  } = useAsyncData(invoicesQuery, (d) => d.length === 0);
  const invoices = invoicesData ?? [];

  const { data: clients = [] } = useClientLookup();

  const { data: unbilledTimeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ['/api/time-entries', 'unbilled', workspaceId],
    queryFn: async () => {
      const response = await secureFetch('/api/time-entries/entries?status=approved', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch time entries');
      const json = await response.json();
      return Array.isArray(json) ? json : (json?.data ?? []);
    },
    enabled: !!workspaceId,
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (activeTab !== 'all') params.set('tab', activeTab);
    if (filterClientId && filterClientId !== "__all__") params.set('clientId', filterClientId);
    if (filterStartDate) params.set('startDate', filterStartDate);
    if (filterEndDate) params.set('endDate', filterEndDate);

    const newSearch = params.toString();
    if (newSearch !== window.location.search.replace(/^\?/, "")) {
      setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [searchQuery, activeTab, filterClientId, filterStartDate, filterEndDate, setLocation]);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(() => searchParams.get('invoice'));

  const editForm = useForm<Partial<Invoice>>({
    resolver: zodResolver(insertInvoiceSchema),
    defaultValues: {
      clientId: "",
      // @ts-expect-error — TS migration: fix in refactoring sprint
      dueDate: "",
      subtotal: "",
      taxRate: "0",
    },
  });

  const selectedInvoice = useMemo(() => {
    return invoices.find(i => i.id === selectedInvoiceId);
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    if (isEditDialogOpen && selectedInvoice) {
      editForm.reset({
        clientId: selectedInvoice.clientId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        dueDate: selectedInvoice.dueDate ? parseLocalDate(selectedInvoice.dueDate).toISOString().split('T')[0] : "",
        subtotal: selectedInvoice.subtotal,
        taxRate: selectedInvoice.taxRate || "0",
      });
    }
  }, [isEditDialogOpen, selectedInvoice, editForm]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedInvoiceId) {
      params.set('invoice', selectedInvoiceId);
      setIsDetailDialogOpen(true);
    } else {
      params.delete('invoice');
    }
    const newSearch = params.toString();
    if (newSearch !== window.location.search.replace(/^\?/, "")) {
      setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [selectedInvoiceId, setLocation]);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const createForm = useForm<Partial<Invoice>>({
    resolver: zodResolver(insertInvoiceSchema.extend({
      clientId: z.string().min(1, "Client is required"),
      dueDate: z.string().min(1, "Due date is required"),
      subtotal: z.union([z.string(), z.number()]).refine(v => Number(v) > 0, "Subtotal must be greater than 0"),
    })),
    defaultValues: {
      clientId: "",
      // @ts-expect-error — TS migration: fix in refactoring sprint
      dueDate: "",
      subtotal: "",
      taxRate: "0",
    },
  });

  const handleSubmit = (values: Partial<Invoice>) => {
    const subtotal = parseFloat(values.subtotal as string);
    const taxRate = parseFloat(values.taxRate as string) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    createInvoiceMutation.mutate({
      clientId: values.clientId!,
      invoiceNumber: `INV-${Date.now()}`, // Backend requires invoiceNumber
      dueDate: new Date(values.dueDate as unknown as string).toISOString(),
      subtotal: subtotal.toString(),
      taxAmount: tax.toString(),
      total: total.toString(), // Backend uses 'total', not 'totalAmount'
      status: "draft",
      workspaceId: workspaceId!,
    });
  };

  const handleGenerateFromTime = () => {
    if (!generateFormData.clientId || !generateFormData.dueDate) {
      toast({
        title: "Validation Error",
        description: `Please select a ${qb.entity('client').toLowerCase()} and due date`,
        variant: "destructive",
      });
      return;
    }

    if (generateFormData.selectedTimeEntries.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one time entry",
        variant: "destructive",
      });
      return;
    }

    const selectedEntries = unbilledTimeEntries.filter(entry => 
      generateFormData.selectedTimeEntries.includes(entry.id)
    );

    const lineItems = selectedEntries.map(entry => ({
      description: entry.notes || `Work on ${formatDate(entry.clockIn)}`,
      hours: parseFloat(entry.totalHours as string || "0"),
      rate: parseFloat(entry.hourlyRate as string || "0"),
      amount: parseFloat(entry.totalAmount as string || "0"),
      date: formatDate(entry.clockIn),
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = parseFloat(generateFormData.taxRate);
    const taxAmount = (subtotal * taxRate) / 100;
    const platformFeePercent = 5; 
    const platformFeeAmount = ((subtotal + taxAmount) * platformFeePercent) / 100;
    const total = subtotal + taxAmount;

    setInvoicePreview({
      lineItems,
      subtotal,
      taxAmount,
      platformFeePercent,
      platformFeeAmount,
      total,
    });

    setIsGenerateDialogOpen(false);
    setIsReviewDialogOpen(true);
  };

  const handleConfirmInvoice = () => {
    generateInvoiceMutation.mutate({
      clientId: generateFormData.clientId,
      timeEntryIds: generateFormData.selectedTimeEntries,
      dueDate: new Date(generateFormData.dueDate).toISOString(),
      taxRate: parseFloat(generateFormData.taxRate),
      workspaceId,
    });
    setIsReviewDialogOpen(false);
  };

  const toggleTimeEntry = (id: string) => {
    setGenerateFormData(prev => ({
      ...prev,
      selectedTimeEntries: prev.selectedTimeEntries.includes(id)
        ? prev.selectedTimeEntries.filter(entryId => entryId !== id)
        : [...prev.selectedTimeEntries, id],
    }));
  };

  const calculateTimeEntryTotal = () => {
    return unbilledTimeEntries
      .filter(entry => generateFormData.selectedTimeEntries.includes(entry.id))
      .reduce((sum, entry) => sum + parseFloat(entry.totalAmount as string || "0"), 0);
  };

  const isPastDue = (invoice: Invoice) => {
    if (invoice.status === 'paid' || !invoice.dueDate) return false;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return parseLocalDate(invoice.dueDate) < new Date();
  };

  const getStatusColor = (status: string, invoice?: Invoice) => {
    if (invoice && isPastDue(invoice)) {
      return 'destructive';
    }
    switch (status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'overdue': return 'destructive';
      case 'draft': return 'outline';
      case 'void':
      case 'cancelled':
        return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string, invoice?: Invoice) => {
    if (invoice && isPastDue(invoice)) {
      return <AlertCircle className="h-3 w-3 mr-1" />;
    }
    switch (status) {
      case 'paid':
        return <CheckCircle2 className="h-3 w-3 mr-1" />;
      case 'sent':
        return <Mail className="h-3 w-3 mr-1" />;
      case 'draft':
        return <Clock className="h-3 w-3 mr-1" />;
      default:
        return <FileText className="h-3 w-3 mr-1" />;
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? `${client.firstName} ${client.lastName}` : "Unknown";
  };

  const getStatusText = (invoice: Invoice) => {
    if (isPastDue(invoice)) {
      return 'past due';
    }
    return invoice.status || 'draft';
  };

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    let result = invoices;

    switch (activeTab) {
      case 'open':
        result = result.filter(i => i.status === 'sent' || i.status === 'overdue');
        break;
      case 'paid':
        result = result.filter(i => i.status === 'paid');
        break;
      case 'past_due':
        result = result.filter(i => {
          if (i.status === 'overdue') return true;
          // @ts-expect-error — TS migration: fix in refactoring sprint
          if (i.status === 'sent' && i.dueDate && parseLocalDate(i.dueDate) < now) return true;
          return false;
        });
        break;
      case 'due_soon':
        result = result.filter(i => {
          if (i.status !== 'sent' && i.status !== 'overdue') return false;
          if (!i.dueDate) return false;
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const daysUntilDue = Math.ceil((parseLocalDate(i.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntilDue <= 7 && daysUntilDue > 0;
        });
        break;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(inv => 
        inv.invoiceNumber.toLowerCase().includes(q) ||
        getClientName(inv.clientId).toLowerCase().includes(q)
      );
    }

    if (filterClientId && filterClientId !== "__all__") {
      result = result.filter(inv => inv.clientId === filterClientId);
    }

    if (filterStartDate) {
      const start = parseLocalDate(filterStartDate);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      result = result.filter(inv => inv.issueDate && parseLocalDate(inv.issueDate) >= start);
    }

    if (filterEndDate) {
      const end = parseLocalDate(filterEndDate);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      result = result.filter(inv => inv.issueDate && parseLocalDate(inv.issueDate) <= end);
    }

    return result;
  }, [invoices, activeTab, searchQuery, filterClientId, filterStartDate, filterEndDate, clients]);

  const { 
    sorted: sortedInvoices, 
    sortKey, 
    sortDir, 
    toggleSort 
  } = useTableSort<Invoice>(filteredInvoices, 'issueDate', 'desc');

  const paginatedInvoices = useMemo(() => {
    return sortedInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [sortedInvoices, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterClientId, filterStartDate, filterEndDate, activeTab]);

  const totals = useMemo(() => {
    const now = new Date();
    const invoiceList = invoices ?? [];
    const total = invoiceList.reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    const paid = invoiceList.filter(i => i.status === 'paid').reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    const outstanding = invoiceList.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    const overdue = invoiceList.filter(i => {
      if (i.status === 'overdue') return true;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (i.status === 'sent' && i.dueDate && parseLocalDate(i.dueDate) < now) return true;
      return false;
    }).reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    
    return { total, paid, outstanding, overdue };
  }, [invoices]);

  const aging = useMemo(() => {
    const now = new Date();
    const buckets = [
      { label: 'Current', min: -Infinity, max: 0, amount: 0, count: 0, color: 'bg-green-500 dark:bg-green-400' },
      { label: '1-30 Days', min: 1, max: 30, amount: 0, count: 0, color: 'bg-yellow-500 dark:bg-yellow-400' },
      { label: '31-60 Days', min: 31, max: 60, amount: 0, count: 0, color: 'bg-orange-500 dark:bg-orange-400' },
      { label: '61-90 Days', min: 61, max: 90, amount: 0, count: 0, color: 'bg-red-500 dark:bg-red-400' },
      { label: '90+ Days', min: 91, max: Infinity, amount: 0, count: 0, color: 'bg-red-700 dark:bg-red-600' },
    ];

    const outstanding = (invoices ?? []).filter(i => i.status === 'sent' || i.status === 'overdue');

    outstanding.forEach(inv => {
      if (!inv.dueDate) return;
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(String(inv.total || 0));

      if (daysOverdue <= 0) {
        buckets[0].amount += amount;
        buckets[0].count++;
      } else if (daysOverdue <= 30) {
        buckets[1].amount += amount;
        buckets[1].count++;
      } else if (daysOverdue <= 60) {
        buckets[2].amount += amount;
        buckets[2].count++;
      } else if (daysOverdue <= 90) {
        buckets[3].amount += amount;
        buckets[3].count++;
      } else {
        buckets[4].amount += amount;
        buckets[4].count++;
      }
    });

    const totalOutstanding = buckets.reduce((sum, b) => sum + b.amount, 0);
    return { buckets, totalOutstanding };
  }, [invoices]);

  const sendWithEmailMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; message?: string }) => {
      const response = await apiRequest("POST", `/api/invoices/${data.invoiceId}/send-with-pdf`, { message: data.message, workspaceId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Sent", description: "Email sent with PDF attachment" });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      setIsSendDialogOpen(false);
    },
    onError: (error: Error) => toast({ 
      title: "Send Failed", 
      description: error instanceof Error ? error.message : "Failed to send invoice email.", 
      variant: "destructive" 
    }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/invoices/${id}/mark-paid`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      toast({ title: "Invoice Paid", description: "Invoice status updated to paid" });
    },
    onError: (error: Error) => toast({ 
      title: "Update Failed", 
      description: error instanceof Error ? error.message : "Failed to update invoice status.", 
      variant: "destructive" 
    }),
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/invoices/${id}/void`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      toast({ title: "Invoice Voided", description: "Invoice has been voided" });
    },
    onError: (error: Error) => toast({ 
      title: "Action Failed", 
      description: error instanceof Error ? error.message : "Failed to void invoice.", 
      variant: "destructive" 
    }),
  });

  const isAnyMutationPending = markPaidMutation.isPending || voidInvoiceMutation.isPending || sendWithEmailMutation.isPending;

  const handleSendWithEmail = () => {
    if (!sendingInvoice) return;
    sendWithEmailMutation.mutate({ invoiceId: sendingInvoice.id, message: customEmailMessage });
  };

  const handleEditDetail = useCallback((invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setIsEditDialogOpen(true);
  }, []);

  const handleEditSubmit = (values: Partial<Invoice>) => {
    if (!selectedInvoiceId) return;
    
    const subtotal = parseFloat(values.subtotal as string);
    const taxRate = parseFloat(values.taxRate as string) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    updateInvoiceMutation.mutate({
      id: selectedInvoiceId,
      updates: {
        clientId: values.clientId!,
        dueDate: new Date(values.dueDate as unknown as string).toISOString(),
        subtotal: subtotal.toString(),
        taxAmount: tax.toString(),
        total: total.toString(),
      }
    });
  };

  const updateInvoiceMutation = useMutation({
    mutationFn: async (data: { id: string; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/invoices/${data.id}`, { ...data.updates, workspaceId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Updated", description: "Invoice details have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => toast({ title: "Update Failed", description: error.message, variant: "destructive" }),
  });

  const handleViewDetail = useCallback((invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setIsDetailDialogOpen(true);
  }, []);

  const handlePdfPreview = useCallback(async (invoiceId: string) => {
    try {
      const response = await secureFetch(`/api/invoices/${invoiceId}/pdf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setIsPdfPreviewOpen(true);
    } catch (error: any) {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [toast]);

  const closePdfPreview = () => {
    if (pdfPreviewUrl) window.URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
    setIsPdfPreviewOpen(false);
  };

  const clearFilters = () => {
    setFilterClientId("");
    setFilterStartDate("");
    setFilterEndDate("");
    setSearchQuery("");
  };

  const hasActiveFilters = filterClientId || filterStartDate || filterEndDate || searchQuery;

  const generateFromHoursMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/invoices/generate-from-hours", { ...data, workspaceId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Generated", description: "The invoice has been successfully generated from billable hours." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setIsGenerateFromHoursOpen(false);
    },
    onError: (error: Error) => toast({ title: "Generation Failed", description: error.message || "Failed to generate invoice from hours. Please check your data.", variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/invoices", { ...data, workspaceId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Created", description: "New invoice created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      setIsCreateDialogOpen(false);
    },
    onError: (error: Error) => toast({ title: "Create Failed", description: error.message || "Failed to create invoice.", variant: "destructive" }),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/invoices/generate-from-time", { ...data, workspaceId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Generated", description: "Invoice generated from time entries." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      setIsReviewDialogOpen(false);
    },
    onError: (error: Error) => toast({ title: "Generation Failed", description: error.message || "Failed to generate invoice.", variant: "destructive" }),
  });

  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices/auto-generate", { workspaceId });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Auto-Generate Complete", description: data?.message || "Invoices auto-generated from unbilled hours." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
    },
    onError: (error: Error) => toast({ title: "Auto-Generate Failed", description: error.message || "Failed to auto-generate invoices.", variant: "destructive" }),
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const bulkResendMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/invoices/bulk-resend", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      setSelectedIds([]);
      toast({ title: "✅ Invoices resent", description: "Selected invoices have been resent to clients." });
    },
    onError: (error: Error) => toast({ title: "Resend Failed", description: error.message || "Failed to resend invoices.", variant: "destructive" }),
  });

  const sendAllDraftsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/invoices/send-all-drafts", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", workspaceId] });
      toast({ title: "✅ All draft invoices sent", description: "All draft invoices have been sent to clients." });
    },
    onError: (error: Error) => toast({ title: "Send Failed", description: error.message || "Failed to send draft invoices.", variant: "destructive" }),
  });

  const handleGenerateFromHours = () => {
    generateFromHoursMutation.mutate({
      clientId: hoursFormData.clientId,
      startDate: hoursFormData.startDate,
      endDate: hoursFormData.endDate,
      taxRate: parseFloat(hoursFormData.taxRate),
      hourlyRateOverride: hoursFormData.hourlyRateOverride ? parseFloat(hoursFormData.hourlyRateOverride) : undefined,
      notes: hoursFormData.notes,
      dueInDays: parseInt(hoursFormData.dueInDays),
      groupByEmployee: hoursFormData.groupByEmployee,
    });
  };

  const openSendDialog = useCallback((invoice: Invoice) => {
    setSendingInvoice({ id: invoice.id, number: invoice.invoiceNumber });
    setCustomEmailMessage("");
    setIsSendDialogOpen(true);
  }, []);

  const handleDownloadPdf = useCallback(async (invoiceId: string, invoiceNumber: string) => {
    try {
      const response = await secureFetch(`/api/invoices/${invoiceId}/pdf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to download PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleClose = () => {
    if (editForm.formState.isDirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setIsEditDialogOpen(false);
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={invoicesPageConfig}>
        <div className="space-y-4 p-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (isError) {
    return (
      <CanvasHubPage config={invoicesPageConfig}>
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">Invoice data could not be loaded</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Billing is available, but this screen could not hydrate from the live API. Refresh and retry before making invoice decisions.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload Billing
          </Button>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={invoicesPageConfig}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoice Management</h1>
            <p className="text-muted-foreground">Manage your receivables and billing operations</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkResendMutation.mutate(selectedIds)}
              disabled={selectedIds.length === 0 || bulkResendMutation.isPending}
              data-testid="button-bulk-resend"
            >
              {bulkResendMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Resend Selected ({selectedIds.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendAllDraftsMutation.mutate()}
              disabled={sendAllDraftsMutation.isPending}
              data-testid="button-send-all-drafts"
            >
              {sendAllDraftsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Send All Drafts
            </Button>
            <Button
              variant="outline"
              onClick={() => autoGenerateMutation.mutate()}
              disabled={autoGenerateMutation.isPending}
              data-testid="button-auto-generate"
            >
              <Zap className="mr-2 h-4 w-4" />
              Auto-Generate
            </Button>
            
            <ResponsiveDialog
              open={isGenerateDialogOpen}
              onOpenChange={setIsGenerateDialogOpen}
              // @ts-expect-error — TS migration: fix in refactoring sprint
              trigger={
                <Button variant="outline" data-testid="button-open-generate">
                  <Clock className="mr-2 h-4 w-4" />
                  Generate from Time
                </Button>
              }
              title="Generate from Time"
              description="Create an invoice from unbilled time entries"
              size="lg"
              sheetSide="bottom"
              footer={
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleGenerateFromTime}
                    disabled={generateInvoiceMutation.isPending || generateFormData.selectedTimeEntries.length === 0}
                    data-testid="button-generate-invoice"
                  >
                    {generateInvoiceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Generate Invoice
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label>{qb.entity('client')} *</Label>
                    <Select value={generateFormData.clientId} onValueChange={(value) => setGenerateFormData({ ...generateFormData, clientId: value, selectedTimeEntries: [] })}>
                      <SelectTrigger data-testid="select-generate-client">
                        <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(clients ?? []).map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.firstName} {client.lastName}
                            {client.companyName && ` - ${client.companyName}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date *</Label>
                    <Input 
                      type="date" 
                      value={generateFormData.dueDate}
                      onChange={(e) => setGenerateFormData({ ...generateFormData, dueDate: e.target.value })}
                      data-testid="input-generate-duedate" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={generateFormData.taxRate}
                    onChange={(e) => setGenerateFormData({ ...generateFormData, taxRate: e.target.value })}
                    data-testid="input-generate-tax" 
                  />
                </div>

                {generateFormData.clientId && (
                  <div className="space-y-3">
                    <Label>Select Time Entries</Label>
                    {unbilledTimeEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No unbilled time entries for this {qb.entity('client').toLowerCase()}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-md p-3">
                        {(unbilledTimeEntries ?? []).map((entry) => (
                          <div key={entry.id} className="flex items-start gap-3 p-3 rounded-md hover-elevate">
                            <Checkbox
                              checked={generateFormData.selectedTimeEntries.includes(entry.id)}
                              onCheckedChange={() => toggleTimeEntry(entry.id)}
                              data-testid={`checkbox-time-entry-${entry.id}`}
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex justify-between gap-2 items-start">
                                <div>
                                  <p className="text-sm font-medium">
                                    {new Date(entry.clockIn).toLocaleDateString()} - {formatNumber(entry.totalHours)} hrs
                                  </p>
                                  {entry.notes && (
                                    <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>
                                  )}
                                </div>
                                <p className="text-sm font-semibold">{formatCurrency(entry.totalAmount)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {generateFormData.selectedTimeEntries.length > 0 && (
                      <div className="flex justify-between gap-2 items-center p-3 bg-muted rounded-md">
                        <span className="font-medium">Total Selected:</span>
                        <span className="text-lg font-semibold">{formatCurrency(calculateTimeEntryTotal())}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ResponsiveDialog>

            {/* Invoice Review Dialog */}
            <UniversalModal open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen} size="full" className="max-h-[90vh] overflow-y-auto">
                <UniversalModalHeader>
                  <UniversalModalTitle>Review Invoice</UniversalModalTitle>
                  <UniversalModalDescription>
                    Review the invoice details before creating
                  </UniversalModalDescription>
                </UniversalModalHeader>
                {invoicePreview && (
                  <div className="space-y-6 py-4">
                    {/* Client & Due Date Info */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-md mobile-cols-1 mobile-compact-p">
                      <div>
                        <p className="text-sm text-muted-foreground">Client</p>
                        <p className="font-medium">{getClientName(generateFormData.clientId)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Due Date</p>
                        <p className="font-medium">{new Date(generateFormData.dueDate).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="border rounded-md table-scroll-wrapper">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Rate</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoicePreview.lineItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-sm">
                                  <div className="whitespace-nowrap">
                                    {item.date}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <div className="truncate max-w-[300px] min-w-0">
                                    {item.description}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm">{formatNumber(item.hours)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(item.rate)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Totals Breakdown */}
                    <div className="space-y-3">
                      <div className="flex justify-between gap-2 items-center py-2 border-t">
                        <span className="text-sm">Subtotal</span>
                        <span className="font-medium">{formatCurrency(invoicePreview.subtotal)}</span>
                      </div>
                      <div className="flex justify-between gap-2 items-center py-2">
                        <span className="text-sm">Tax ({invoicePreview.taxRate ?? generateFormData.taxRate}%)</span>
                        <span className="font-medium">{formatCurrency(invoicePreview.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between gap-2 items-center py-2">
                        <span className="text-sm text-muted-foreground">Platform Fee ({invoicePreview.platformFeePercent}%)</span>
                        <span className="text-sm text-muted-foreground">-{formatCurrency(invoicePreview.platformFeeAmount)}</span>
                      </div>
                      <div className="flex justify-between gap-2 items-center py-3 border-t-2 border-primary/20">
                        <span className="text-lg font-semibold">Total</span>
                        <span className="text-lg font-bold">{formatCurrency(invoicePreview.total)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        You receive {formatCurrency(invoicePreview.total - invoicePreview.platformFeeAmount)} after platform fee
                      </p>
                    </div>
                  </div>
                )}
                <UniversalModalFooter>
                  <Button variant="outline" onClick={() => {
                    setIsReviewDialogOpen(false);
                    setIsGenerateDialogOpen(true);
                  }} data-testid="button-back-to-edit">
                    Back to Edit
                  </Button>
                  <Button 
                    onClick={handleConfirmInvoice}
                    disabled={generateInvoiceMutation.isPending}
                    data-testid="button-confirm-invoice"
                  >
                    {generateInvoiceMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : "Confirm & Create Invoice"}
                  </Button>
                </UniversalModalFooter>
            </UniversalModal>

            {/* Invoice Detail Dialog */}
            <UniversalModal open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen} size="lg">
                <UniversalModalHeader>
                  <UniversalModalTitle>Invoice Details</UniversalModalTitle>
                </UniversalModalHeader>
                {selectedInvoice && (
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Invoice Number</Label>
                        <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">
                          <Badge variant={getStatusColor(selectedInvoice.status || 'draft', selectedInvoice)}>
                            {getStatusText(selectedInvoice)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Client</Label>
                        <p className="font-medium">{getClientName(selectedInvoice.clientId)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Due Date</Label>
                        <p className="font-medium">
                          {selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <div className="flex justify-between py-1">
                        <span>Subtotal</span>
                        <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Tax Amount</span>
                        <span>{formatCurrency(selectedInvoice.taxAmount || "0")}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t mt-2 font-bold text-lg">
                        <span>Total</span>
                        <span>{formatCurrency(selectedInvoice.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
                <UniversalModalFooter>
                  <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>Close</Button>
                  {selectedInvoice && (
                    <Button onClick={() => {
                      setIsDetailDialogOpen(false);
                      handleEditDetail(selectedInvoice);
                    }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </UniversalModalFooter>
            </UniversalModal>

            {/* Invoice Edit Dialog */}
            <UniversalModal open={isEditDialogOpen} onOpenChange={(open) => { if (!open) handleClose(); else setIsEditDialogOpen(true); }} size="lg">
              <UniversalModalHeader>
                <div className="flex items-center justify-between w-full">
                  <UniversalModalTitle>Edit Invoice</UniversalModalTitle>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 -mr-2"
                    onClick={handleClose}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
                <UniversalModalDescription>Update invoice details</UniversalModalDescription>
              </UniversalModalHeader>
              <Form {...editForm}>
                <form className="space-y-4 py-4">
                  <FormField
                    control={editForm.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{qb.entity('client')} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(clients ?? []).map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.firstName} {client.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={(field.value as any) ?? ''} aria-required="true" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="subtotal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subtotal ($) *</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} aria-required="true" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Rate (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} value={(field.value as any) ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
              <UniversalModalFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => handleEditSubmit(editForm.getValues())}
                  disabled={updateInvoiceMutation.isPending}
                >
                  {updateInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </UniversalModalFooter>
            </UniversalModal>

            <ResponsiveDialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
              title="New Invoice"
              description="Create a manual invoice for a client"
              size="lg"
              sheetSide="bottom"
              footer={
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => {
                       const values = createForm.getValues();
                       handleSubmit(values);
                    }} 
                    disabled={createInvoiceMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    {createInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Invoice
                  </Button>
                </div>
              }
            >
              <Form {...createForm}>
                <form className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{qb.entity('client')} *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-create-client">
                              <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(clients ?? []).map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.firstName} {client.lastName}
                                {client.companyName && ` - ${client.companyName}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                    <FormField
                      control={createForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={(field.value as any) ?? ''} data-testid="input-create-duedate" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="subtotal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subtotal ($) *</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-create-subtotal" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Rate (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} value={(field.value as any) ?? ''} data-testid="input-create-tax" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </ResponsiveDialog>

            <Button 
              onClick={() => setIsCreateDialogOpen(true)} 
              disabled={createInvoiceMutation.isPending}
              data-testid="button-create-invoice"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="shadow-sm">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="text-base sm:text-2xl font-bold truncate" data-testid="stat-total">{formatCurrency(totals.total)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Paid</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="text-base sm:text-2xl font-bold text-green-600 dark:text-green-400 truncate" data-testid="stat-paid">{formatCurrency(totals.paid)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Outstanding</CardTitle>
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="text-base sm:text-2xl font-bold text-blue-600 dark:text-blue-400 truncate" data-testid="stat-outstanding">{formatCurrency(totals.outstanding)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Overdue</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="text-base sm:text-2xl font-bold text-red-600 dark:text-red-400 truncate" data-testid="stat-overdue">{formatCurrency(totals.overdue)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Aging Visualization */}
        {aging.totalOutstanding > 0 && (
          <Card data-testid="card-aging-chart">
            <CardHeader className="p-4 sm:px-6 sm:pt-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Accounts Receivable Aging
                </CardTitle>
                <span className="text-sm text-muted-foreground" data-testid="text-aging-total">
                  Total: {formatCurrency(aging.totalOutstanding)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
              <div className="flex w-full h-6 rounded-md overflow-hidden mb-4" data-testid="aging-stacked-bar">
                {aging.buckets.map((bucket, idx) => {
                  const pct = aging.totalOutstanding > 0 ? (bucket.amount / aging.totalOutstanding) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={idx}
                      className={`${bucket.color} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${bucket.label}: ${formatCurrency(bucket.amount)} (${pct.toFixed(1)}%)`}
                      data-testid={`aging-bar-segment-${idx}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {aging.buckets.map((bucket, idx) => (
                  <div key={idx} className="flex items-start gap-2" data-testid={`aging-bucket-${idx}`}>
                    <div className={`w-3 h-3 rounded-sm mt-0.5 shrink-0 ${bucket.color}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{bucket.label}</p>
                      <p className="text-sm font-semibold">{formatCurrency(bucket.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(bucket.count)} invoice{bucket.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filters */}
        <Card className="p-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-invoices"
                />
              </div>
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger data-testid="select-filter-client">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Clients</SelectItem>
                  {(clients ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName || `${client.firstName} ${client.lastName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="flex-1"
                  placeholder="Start Date"
                  data-testid="input-filter-start-date"
                />
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="flex-1"
                  placeholder="End Date"
                  data-testid="input-filter-end-date"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing {filteredInvoices.length} of {invoices?.length ?? 0} invoices</span>
              </div>
            )}
          </div>
        </Card>

        {/* Tabs for filtering */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap scrollbar-hide">
            <TabsTrigger value="all" data-testid="tab-all" className="text-xs sm:text-sm whitespace-nowrap">
              All ({invoices?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="open" data-testid="tab-open" className="text-xs sm:text-sm whitespace-nowrap gap-1">
              <Mail className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              Open ({(invoices ?? []).filter(i => i.status === 'sent' || i.status === 'overdue').length})
            </TabsTrigger>
            <TabsTrigger value="paid" data-testid="tab-paid" className="text-xs sm:text-sm whitespace-nowrap gap-1">
              <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              Paid ({(invoices ?? []).filter(i => i.status === 'paid').length})
            </TabsTrigger>
            <TabsTrigger value="past_due" data-testid="tab-past-due" className="text-xs sm:text-sm whitespace-nowrap gap-1">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              Past Due ({(invoices ?? []).filter(i => {
                const now = new Date();
                if (i.status === 'overdue') return true;
                if (i.status === 'sent' && i.dueDate && new Date(i.dueDate) < now) return true;
                return false;
              }).length})
            </TabsTrigger>
            <TabsTrigger value="due_soon" data-testid="tab-due-soon" className="text-xs sm:text-sm whitespace-nowrap gap-1">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              Due Soon ({(invoices ?? []).filter(i => {
                if (i.status !== 'sent' && i.status !== 'overdue') return false;
                if (!i.dueDate) return false;
                const now = new Date();
                const daysUntilDue = Math.ceil((new Date(i.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return daysUntilDue <= 7 && daysUntilDue > 0;
              }).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <Card>
                <div className="table-scroll-wrapper">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>{qb.entity('client')}</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : isInvoicesEmpty ? (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 sm:p-8">
                <div className="mx-auto flex max-w-4xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-xl text-center lg:text-left">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 lg:mx-0">
                      <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">No invoices yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Billing is wired and ready. Seed your first invoice manually, generate one from approved time, or add a client first if the account is still empty.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3 lg:justify-start">
                      <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-invoice">
                        Create Invoice
                      </Button>
                      <Button variant="outline" onClick={() => setIsGenerateDialogOpen(true)}>
                        Generate from Time
                      </Button>
                      {clients.length === 0 && (
                        <Button variant="ghost" onClick={() => setLocation("/clients")}>
                          Add Client First
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
                    <div className="rounded-lg border border-border bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Clients</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{clients.length}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Available to bill</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved hours</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{unbilledTimeEntries.length}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Eligible for generation</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Next move</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {clients.length === 0 ? "Create a client record" : unbilledTimeEntries.length > 0 ? "Generate from approved time" : "Create a manual invoice"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : filteredInvoices.length === 0 && searchQuery ? (
              <Card data-testid="card-no-results">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <Search className="h-12 w-12 text-muted-foreground opacity-40 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No matching invoices</h3>
                  <p className="text-muted-foreground max-w-sm">
                    No invoices match your current search or filter criteria.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <div className="table-scroll-wrapper">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <SortableHeader column="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                              Invoice #
                            </SortableHeader>
                          </TableHead>
                          <TableHead>
                            <SortableHeader column="clientId" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                              {qb.entity('client')}
                            </SortableHeader>
                          </TableHead>
                          <TableHead>
                            <SortableHeader column="dueDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                              Due Date
                            </SortableHeader>
                          </TableHead>
                          <TableHead>
                            <SortableHeader column="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                              Amount
                            </SortableHeader>
                          </TableHead>
                          <TableHead>
                            <SortableHeader column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                              Status
                            </SortableHeader>
                          </TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedInvoices.map((invoice) => (
                          <InvoiceRow
                            key={invoice.id}
                            invoice={invoice}
                            getClientName={getClientName}
                            isPastDue={isPastDue}
                            getStatusColor={getStatusColor}
                            getStatusIcon={getStatusIcon}
                            getStatusText={getStatusText}
                            handleViewDetail={handleViewDetail}
                            handlePdfPreview={handlePdfPreview}
                            openSendDialog={openSendDialog}
                            handleDownloadPdf={handleDownloadPdf}
                            setSelectedInvoiceId={setSelectedInvoiceId}
                            markPaidMutation={markPaidMutation}
                            voidInvoiceMutation={voidInvoiceMutation}
                            isAnyMutationPending={isAnyMutationPending}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
                <div className="flex items-center justify-between mt-4 px-2">
                  <div className="text-sm text-muted-foreground">
                    Showing {Math.min(filteredInvoices.length, (page - 1) * PAGE_SIZE + 1)}-{Math.min(filteredInvoices.length, page * PAGE_SIZE)} of {filteredInvoices.length} invoices
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      disabled={page === 1}
                      data-testid="button-pagination-prev"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => prev + 1)}
                      disabled={page * PAGE_SIZE >= filteredInvoices.length}
                      data-testid="button-pagination-next"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Invoice Detail Dialog */}
        <ResponsiveDialog 
          open={isDetailDialogOpen} 
          onOpenChange={setIsDetailDialogOpen}
          title={<span>Invoice Details</span>}
          description="Complete invoice details with line items"
          size="full"
          sheetSide="bottom"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div />
        </ResponsiveDialog>
      </div>
    </CanvasHubPage>
  );
}
