import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useClientLookup } from "@/hooks/useClients";
import { useQBTerminology } from "@/hooks/useQBTerminology";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
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
  Eye,
  Download,
  XCircle,
  Calendar,
  Users,
  TrendingUp,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Invoice, Client, TimeEntry } from "@shared/schema";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { CoAIleagueLogo } from "@/components/coailleague-logo";

export default function Invoices() {
  const { toast } = useToast();
  const qb = useQBTerminology();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clientId: "",
    dueDate: "",
    subtotal: "",
    taxRate: "0",
  });
  const [generateFormData, setGenerateFormData] = useState({
    clientId: "",
    dueDate: "",
    taxRate: "8.5",
    selectedTimeEntries: [] as string[],
  });
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{
    lineItems: Array<{
      description: string;
      hours: number;
      rate: number;
      amount: number;
      date: string;
    }>;
    subtotal: number;
    taxAmount: number;
    platformFeePercent: number;
    platformFeeAmount: number;
    total: number;
  } | null>(null);
  
  const [isGenerateFromHoursOpen, setIsGenerateFromHoursOpen] = useState(false);
  const [hoursFormData, setHoursFormData] = useState({
    clientId: "",
    startDate: "",
    endDate: "",
    taxRate: "8.875",
    hourlyRateOverride: "",
    notes: "",
    dueInDays: "30",
    groupByEmployee: false,
  });
  const [hoursPreview, setHoursPreview] = useState<{
    entries: Array<{
      id: string;
      employeeName: string;
      date: string;
      hours: number;
      rate: number;
      amount: number;
    }>;
    summary: {
      totalHours: number;
      totalAmount: number;
      byClient: Record<string, { name: string; hours: number; amount: number; count: number }>;
    };
  } | null>(null);
  
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState<{ id: string; number: string } | null>(null);
  const [customEmailMessage, setCustomEmailMessage] = useState("");

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: invoiceDetail, isLoading: isLoadingDetail } = useQuery<{
    success: boolean;
    data: {
      id: string;
      invoiceNumber: string;
      issueDate: string;
      dueDate: string;
      subtotal: string;
      taxRate: string;
      taxAmount: string;
      total: string;
      status: string;
      paidAt?: string;
      amountPaid?: string;
      sentAt?: string;
      notes?: string;
      client: {
        id: string;
        firstName: string;
        lastName: string;
        companyName?: string;
        email?: string;
        phone?: string;
        address?: string;
      } | null;
      workspace: {
        id: string;
        name: string;
        companyName?: string;
        address?: string;
        phone?: string;
      } | null;
      lineItems: Array<{
        id: string;
        description: string;
        quantity: string;
        unitPrice: string;
        amount: string;
        timeEntryId?: string;
      }>;
    };
  }>({
    queryKey: ["/api/timesheet-invoices", selectedInvoiceId],
    enabled: !!selectedInvoiceId && isDetailDialogOpen,
  });

  const [autoGenerateDialogOpen, setAutoGenerateDialogOpen] = useState(false);
  const [autoGenerateResults, setAutoGenerateResults] = useState<{
    generated: number;
    invoices: any[];
    errors: any[];
  } | null>(null);

  const autoGenerateMutation = useMutation({
    mutationFn: async (): Promise<{ generated: number; invoices: any[]; errors: any[] }> => {
      const response = await apiRequest("POST", "/api/invoices/auto-generate");
      return response as unknown as { generated: number; invoices: any[]; errors: any[] };
    },
    onSuccess: (data) => {
      setAutoGenerateResults(data);
      setAutoGenerateDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (data.generated > 0) {
        toast({
          title: "Invoices Auto-Generated",
          description: `Successfully generated ${data.generated} draft invoice(s)`,
        });
      } else {
        toast({
          title: "No Invoices Generated",
          description: "No clients are currently due for billing",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Auto-Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: clients = [] } = useClientLookup();

  const { data: unbilledTimeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/unbilled", generateFormData.clientId],
    enabled: !!generateFormData.clientId && isGenerateDialogOpen,
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/invoices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      setIsCreateDialogOpen(false);
      setFormData({
        clientId: "",
        dueDate: "",
        subtotal: "",
        taxRate: "0",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/invoices/generate-from-time", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/unbilled", generateFormData.clientId] });
      toast({
        title: "Success",
        description: "Invoice generated from time entries successfully",
      });
      setIsGenerateDialogOpen(false);
      setGenerateFormData({
        clientId: "",
        dueDate: "",
        taxRate: "8.5",
        selectedTimeEntries: [],
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to generate invoice",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!formData.clientId || !formData.dueDate || !formData.subtotal) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const subtotal = parseFloat(formData.subtotal);
    const taxRate = parseFloat(formData.taxRate) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    createInvoiceMutation.mutate({
      clientId: formData.clientId,
      dueDate: new Date(formData.dueDate).toISOString(),
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      total: total.toString(),
      status: "draft",
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

    // Calculate invoice preview
    const selectedEntries = unbilledTimeEntries.filter(entry => 
      generateFormData.selectedTimeEntries.includes(entry.id)
    );

    const lineItems = selectedEntries.map(entry => ({
      description: entry.notes || `Work on ${new Date(entry.clockIn).toLocaleDateString()}`,
      hours: parseFloat(entry.totalHours as string || "0"),
      rate: parseFloat(entry.hourlyRate as string || "0"),
      amount: parseFloat(entry.totalAmount as string || "0"),
      date: new Date(entry.clockIn).toLocaleDateString(),
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = parseFloat(generateFormData.taxRate);
    const taxAmount = (subtotal * taxRate) / 100;
    // Note: Platform fee is calculated on backend, using 5% as display estimate
    // Actual fee will be applied based on workspace settings
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

    // Close generate dialog and open review dialog
    setIsGenerateDialogOpen(false);
    setIsReviewDialogOpen(true);
  };

  const handleConfirmInvoice = () => {
    generateInvoiceMutation.mutate({
      clientId: generateFormData.clientId,
      timeEntryIds: generateFormData.selectedTimeEntries,
      dueDate: new Date(generateFormData.dueDate).toISOString(), // Convert to ISO format
      taxRate: parseFloat(generateFormData.taxRate),
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
    return new Date(invoice.dueDate) < new Date();
  };

  const getStatusColor = (status: string, invoice?: Invoice) => {
    // Check if invoice is overdue first
    if (invoice && isPastDue(invoice)) {
      return 'destructive';
    }
    switch (status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string, invoice?: Invoice) => {
    // Show alert icon for past due invoices
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

  const getStatusText = (invoice: Invoice) => {
    if (isPastDue(invoice)) {
      return 'past due';
    }
    return invoice.status || 'draft';
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? `${client.firstName} ${client.lastName}` : "Unknown";
  };

  // Filter by tab
  const filterByTab = (invoices: Invoice[]) => {
    const now = new Date();
    switch (activeTab) {
      case 'open':
        // Open = sent OR overdue (all unpaid receivables, excludes drafts)
        return invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
      case 'paid':
        return invoices.filter(i => i.status === 'paid');
      case 'past_due':
        // Past due = explicitly overdue OR sent but past due date
        return invoices.filter(i => {
          if (i.status === 'overdue') return true;
          if (i.status === 'sent' && i.dueDate && new Date(i.dueDate) < now) return true;
          return false;
        });
      case 'due_soon':
        // Due soon = (sent OR overdue) and due within 7 days
        return invoices.filter(i => {
          if (i.status !== 'sent' && i.status !== 'overdue') return false;
          if (!i.dueDate) return false;
          const daysUntilDue = Math.ceil((new Date(i.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntilDue <= 7 && daysUntilDue > 0;
        });
      default:
        return invoices;
    }
  };

  const filteredInvoices = filterByTab(invoices).filter(inv => {
    if (searchQuery && 
        !inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !getClientName(inv.clientId).toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterClientId && inv.clientId !== filterClientId) {
      return false;
    }
    if (filterStartDate && inv.issueDate && new Date(inv.issueDate) < new Date(filterStartDate)) {
      return false;
    }
    if (filterEndDate && inv.issueDate && new Date(inv.issueDate) > new Date(filterEndDate)) {
      return false;
    }
    return true;
  });

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setIsDetailDialogOpen(true);
  };

  const handlePdfPreview = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/timesheet-invoices/${invoiceId}/pdf`, {
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
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
    }
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

  // Calculate totals for stat cards
  const calculateTotals = (invoices: Invoice[]) => {
    const now = new Date();
    const total = invoices.reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    const paid = invoices.filter(i => i.status === 'paid').reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    // Outstanding = sent OR overdue (not paid, excludes drafts)
    const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    // Overdue = explicitly overdue status OR sent but past due date
    const overdue = invoices.filter(i => {
      if (i.status === 'overdue') return true;
      if (i.status === 'sent' && i.dueDate && new Date(i.dueDate) < now) return true;
      return false;
    }).reduce((sum, inv) => sum + (parseFloat(String(inv.total || 0))), 0);
    
    return { total, paid, outstanding, overdue };
  };

  // Calculate totals from ALL invoices, not just filtered ones
  const totals = calculateTotals(invoices);

  const draftInvoices = invoices.filter(inv => inv.status === "draft");

  const sendEmailMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiRequest("POST", `/api/invoices/${invoiceId}/send-email`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Invoice Sent",
        description: "Invoice email sent successfully to client",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Send Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: uninvoicedHours, isLoading: loadingUninvoiced, refetch: refetchUninvoiced } = useQuery<{
    entries: Array<{
      id: string;
      employeeName: string;
      date: string;
      hours: number;
      rate: number;
      amount: number;
      clientName: string;
    }>;
    summary: {
      totalHours: number;
      totalAmount: number;
      byClient: Record<string, { name: string; hours: number; amount: number; count: number }>;
    };
  }>({
    queryKey: ["/api/timesheet-invoice/uninvoiced", hoursFormData.clientId],
    enabled: isGenerateFromHoursOpen,
  });

  const generateFromHoursMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/timesheet-invoice/generate-from-hours", data);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-invoice/uninvoiced"] });
      toast({
        title: "Invoice Generated",
        description: `Invoice ${result.invoice?.invoiceNumber || ''} created successfully from ${result.summary?.entriesCount || 0} time entries`,
      });
      setIsGenerateFromHoursOpen(false);
      setHoursFormData({
        clientId: "",
        startDate: "",
        endDate: "",
        taxRate: "8.875",
        hourlyRateOverride: "",
        notes: "",
        dueInDays: "30",
        groupByEmployee: false,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to generate invoice from hours",
        variant: "destructive",
      });
    },
  });

  const sendWithEmailMutation = useMutation({
    mutationFn: async ({ invoiceId, customMessage }: { invoiceId: string; customMessage?: string }) => {
      return await apiRequest("POST", `/api/timesheet-invoice/${invoiceId}/send-email`, { customMessage });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Invoice Sent",
        description: result.message || "Invoice sent successfully with PDF attachment",
      });
      setIsSendDialogOpen(false);
      setSendingInvoice(null);
      setCustomEmailMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Send Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateFromHours = () => {
    if (!hoursFormData.clientId || !hoursFormData.startDate || !hoursFormData.endDate) {
      toast({
        title: "Validation Error",
        description: "Please select a client and date range",
        variant: "destructive",
      });
      return;
    }

    generateFromHoursMutation.mutate({
      clientId: hoursFormData.clientId,
      startDate: new Date(hoursFormData.startDate).toISOString(),
      endDate: new Date(hoursFormData.endDate).toISOString(),
      taxRate: parseFloat(hoursFormData.taxRate) || 0,
      hourlyRateOverride: hoursFormData.hourlyRateOverride ? parseFloat(hoursFormData.hourlyRateOverride) : undefined,
      notes: hoursFormData.notes || undefined,
      dueInDays: parseInt(hoursFormData.dueInDays) || 30,
      groupByEmployee: hoursFormData.groupByEmployee,
    });
  };

  const handleSendWithEmail = () => {
    if (!sendingInvoice) return;
    sendWithEmailMutation.mutate({
      invoiceId: sendingInvoice.id,
      customMessage: customEmailMessage || undefined,
    });
  };

  const handleDownloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const response = await fetch(`/api/timesheet-invoice/${invoiceId}/pdf`, {
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
  };

  const openSendDialog = (invoice: Invoice) => {
    setSendingInvoice({ id: invoice.id, number: invoice.invoiceNumber });
    setCustomEmailMessage("");
    setIsSendDialogOpen(true);
  };

  return (
    <WorkspaceLayout maxWidth="7xl">
      <div className="w-full">
        <div className="text-center space-y-4 mb-8 p-6 border-b">
          <CoAIleagueLogo 
            width={200} 
            height={50} 
            showTagline={true}
            showWordmark={true}
          />
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mobile-flex-col">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-invoices-title">
                Invoices
              </h2>
              <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]" data-testid="text-invoices-subtitle">
                Generate and track customer invoices
              </p>
            </div>
          
          <div className="flex flex-wrap gap-3 mobile-flex-col">
            <Button 
              variant="outline" 
              onClick={() => autoGenerateMutation.mutate()}
              disabled={autoGenerateMutation.isPending}
              data-testid="button-auto-generate"
            >
              <Zap className="mr-2 h-4 w-4" />
              {autoGenerateMutation.isPending ? "Auto-Generating..." : "Auto-Generate Invoices"}
            </Button>
            
            {draftInvoices.length > 0 && (
              <Badge variant="secondary" className="py-1 px-3">
                {draftInvoices.length} Draft{draftInvoices.length !== 1 ? 's' : ''} Pending Review
              </Badge>
            )}

            <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-generate-from-time">
                  <Clock className="mr-2 h-4 w-4" />
                  Generate from Time
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate Invoice from Time Entries</DialogTitle>
                  <DialogDescription>
                    Select unbilled time entries to create an invoice
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                    <div className="space-y-2">
                      <Label>{qb.entity('client')} *</Label>
                      <Select value={generateFormData.clientId} onValueChange={(value) => setGenerateFormData({ ...generateFormData, clientId: value, selectedTimeEntries: [] })}>
                        <SelectTrigger data-testid="select-generate-client">
                          <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
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
                          {unbilledTimeEntries.map((entry) => (
                            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-md hover-elevate">
                              <Checkbox
                                checked={generateFormData.selectedTimeEntries.includes(entry.id)}
                                onCheckedChange={() => toggleTimeEntry(entry.id)}
                                data-testid={`checkbox-time-entry-${entry.id}`}
                              />
                              <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-sm font-medium">
                                      {new Date(entry.clockIn).toLocaleDateString()} - {entry.totalHours} hrs
                                    </p>
                                    {entry.notes && (
                                      <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold">${entry.totalAmount}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {generateFormData.selectedTimeEntries.length > 0 && (
                        <div className="flex justify-between items-center p-3 bg-muted rounded-md">
                          <span className="font-medium">Total Selected:</span>
                          <span className="text-lg font-semibold">${calculateTimeEntryTotal().toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleGenerateFromTime}
                    disabled={generateInvoiceMutation.isPending || generateFormData.selectedTimeEntries.length === 0}
                    data-testid="button-generate-invoice"
                  >
                    {generateInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Invoice Review Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Review Invoice</DialogTitle>
                  <DialogDescription>
                    Review the invoice details before creating
                  </DialogDescription>
                </DialogHeader>
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
                              <TableCell className="text-sm">{item.date}</TableCell>
                              <TableCell className="text-sm">{item.description}</TableCell>
                              <TableCell className="text-right text-sm">{item.hours.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm">${item.rate.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-medium">${item.amount.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Totals Breakdown */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-t">
                        <span className="text-sm">Subtotal</span>
                        <span className="font-medium">${invoicePreview.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm">Tax ({generateFormData.taxRate}%)</span>
                        <span className="font-medium">${invoicePreview.taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-muted-foreground">Platform Fee ({invoicePreview.platformFeePercent}%)</span>
                        <span className="text-sm text-muted-foreground">-${invoicePreview.platformFeeAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-t-2 border-primary/20">
                        <span className="text-lg font-semibold">Total</span>
                        <span className="text-lg font-bold">${invoicePreview.total.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        You receive ${(invoicePreview.total - invoicePreview.platformFeeAmount).toFixed(2)} after platform fee
                      </p>
                    </div>
                  </div>
                )}
                <DialogFooter>
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
                    {generateInvoiceMutation.isPending ? "Creating..." : "Confirm & Create Invoice"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Generate from Hours Dialog */}
            <Dialog open={isGenerateFromHoursOpen} onOpenChange={setIsGenerateFromHoursOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-generate-from-hours">
                  <Calendar className="mr-2 h-4 w-4" />
                  Generate from Hours
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Generate Invoice from Tracked Hours
                  </DialogTitle>
                  <DialogDescription>
                    Create an invoice from approved time entries within a date range
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                    <div className="space-y-2">
                      <Label>{qb.entity('client')} *</Label>
                      <Select 
                        value={hoursFormData.clientId} 
                        onValueChange={(value) => setHoursFormData({ ...hoursFormData, clientId: value })}
                      >
                        <SelectTrigger data-testid="select-hours-client">
                          <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.companyName || `${client.firstName} ${client.lastName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due in Days</Label>
                      <Select 
                        value={hoursFormData.dueInDays} 
                        onValueChange={(value) => setHoursFormData({ ...hoursFormData, dueInDays: value })}
                      >
                        <SelectTrigger data-testid="select-hours-due">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="30">30 days (Net 30)</SelectItem>
                          <SelectItem value="45">45 days</SelectItem>
                          <SelectItem value="60">60 days (Net 60)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                    <div className="space-y-2">
                      <Label>Start Date *</Label>
                      <Input
                        type="date"
                        value={hoursFormData.startDate}
                        onChange={(e) => setHoursFormData({ ...hoursFormData, startDate: e.target.value })}
                        data-testid="input-hours-start"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date *</Label>
                      <Input
                        type="date"
                        value={hoursFormData.endDate}
                        onChange={(e) => setHoursFormData({ ...hoursFormData, endDate: e.target.value })}
                        data-testid="input-hours-end"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                    <div className="space-y-2">
                      <Label>Tax Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={hoursFormData.taxRate}
                        onChange={(e) => setHoursFormData({ ...hoursFormData, taxRate: e.target.value })}
                        placeholder="8.875"
                        data-testid="input-hours-tax"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hourly Rate Override (optional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={hoursFormData.hourlyRateOverride}
                        onChange={(e) => setHoursFormData({ ...hoursFormData, hourlyRateOverride: e.target.value })}
                        placeholder="Use entry rates"
                        data-testid="input-hours-rate"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
                    <Switch
                      checked={hoursFormData.groupByEmployee}
                      onCheckedChange={(checked) => setHoursFormData({ ...hoursFormData, groupByEmployee: checked })}
                      data-testid="switch-group-employee"
                    />
                    <div>
                      <Label className="font-medium">Group by Employee</Label>
                      <p className="text-xs text-muted-foreground">Consolidate time entries by employee instead of individual entries</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      value={hoursFormData.notes}
                      onChange={(e) => setHoursFormData({ ...hoursFormData, notes: e.target.value })}
                      placeholder="Add notes to appear on the invoice..."
                      className="min-h-[80px]"
                      data-testid="input-hours-notes"
                    />
                  </div>

                  {hoursFormData.clientId && uninvoicedHours && (
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Unbilled Hours Preview
                        </h4>
                        <Badge variant="secondary">
                          {uninvoicedHours.entries?.length || 0} entries
                        </Badge>
                      </div>
                      
                      {loadingUninvoiced ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                      ) : uninvoicedHours.entries?.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No unbilled time entries found for this client
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                          <Card className="bg-background">
                            <CardContent className="p-4">
                              <div className="text-2xl font-bold">{uninvoicedHours.summary?.totalHours?.toFixed(2) || 0}</div>
                              <p className="text-sm text-muted-foreground">Total Hours</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-background">
                            <CardContent className="p-4">
                              <div className="text-2xl font-bold">${uninvoicedHours.summary?.totalAmount?.toFixed(2) || 0}</div>
                              <p className="text-sm text-muted-foreground">Estimated Total</p>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenerateFromHoursOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenerateFromHours}
                    disabled={generateFromHoursMutation.isPending || !hoursFormData.clientId || !hoursFormData.startDate || !hoursFormData.endDate}
                    data-testid="button-generate-hours-submit"
                  >
                    {generateFromHoursMutation.isPending ? "Generating..." : "Generate Invoice"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Send Invoice with Email Dialog */}
            <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Invoice {sendingInvoice?.number}
                  </DialogTitle>
                  <DialogDescription>
                    Send the invoice to the client via email with PDF attachment
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Custom Message (optional)</Label>
                    <Textarea
                      value={customEmailMessage}
                      onChange={(e) => setCustomEmailMessage(e.target.value)}
                      placeholder="Add a personal message to the client..."
                      className="min-h-[100px]"
                      data-testid="input-send-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      The invoice PDF will be attached automatically
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSendDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendWithEmail}
                    disabled={sendWithEmailMutation.isPending}
                    data-testid="button-send-email-submit"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {sendWithEmailMutation.isPending ? "Sending..." : "Send with PDF"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Auto-Generation Results Dialog */}
            <Dialog open={autoGenerateDialogOpen} onOpenChange={setAutoGenerateDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Auto-Generation Results</DialogTitle>
                  <DialogDescription>
                    Summary of automated invoice generation
                  </DialogDescription>
                </DialogHeader>
                {autoGenerateResults && (
                  <div className="space-y-6 py-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <Card className="mobile-card-tight">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted/10 rounded-lg">
                              <CheckCircle2 className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-2xl font-bold">{autoGenerateResults.generated}</p>
                              <p className="text-sm text-muted-foreground">Invoices Generated</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {autoGenerateResults.errors && autoGenerateResults.errors.length > 0 && (
                        <Card className="mobile-card-tight">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-red-500/10 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-red-500" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{autoGenerateResults.errors?.length || 0}</p>
                                <p className="text-sm text-muted-foreground">Errors</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Generated Invoices List */}
                    {autoGenerateResults.invoices && autoGenerateResults.invoices.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold">Generated Draft Invoices</h4>
                        <div className="space-y-2">
                          {autoGenerateResults.invoices?.map((item: any, index: number) => (
                            <Card key={index}>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium">
                                      {item.client.firstName} {item.client.lastName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {item.unbilledHours.toFixed(2)} hours
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold">${parseFloat(item.invoice.total).toFixed(2)}</p>
                                    <Badge variant="secondary" className="mt-1">Draft</Badge>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Errors List */}
                    {autoGenerateResults.errors && autoGenerateResults.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-red-500">Errors</h4>
                        <div className="space-y-2">
                          {autoGenerateResults.errors?.map((error: any, index: number) => (
                            <Card key={index} className="border-red-500/20">
                              <CardContent className="p-3">
                                <p className="font-medium text-sm">{error.clientName}</p>
                                <p className="text-xs text-muted-foreground">{error.error}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {autoGenerateResults.generated === 0 && (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">
                          No clients are currently due for billing.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Invoices are generated based on billing cycles (weekly, bi-weekly, monthly).
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button onClick={() => setAutoGenerateDialogOpen(false)} data-testid="button-close-results">
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-invoice">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create Invoice</DialogTitle>
                <DialogDescription>
                  Generate a new invoice for a {qb.entity('client').toLowerCase()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="client">{qb.entity('client')} *</Label>
                    <Select value={formData.clientId} onValueChange={(value) => setFormData({ ...formData, clientId: value })}>
                      <SelectTrigger id="client" data-testid="select-invoice-client">
                        <SelectValue placeholder={`Select ${qb.entity('client').toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.length === 0 ? (
                          <SelectItem value="none">No {qb.entity('clients').toLowerCase()} available</SelectItem>
                        ) : (
                          clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.firstName} {client.lastName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date *</Label>
                    <Input 
                      id="dueDate" 
                      type="date" 
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      data-testid="input-invoice-duedate" 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="subtotal">Subtotal *</Label>
                    <Input 
                      id="subtotal" 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00"
                      value={formData.subtotal}
                      onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                      data-testid="input-invoice-subtotal" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input 
                      id="taxRate" 
                      type="number" 
                      step="0.01" 
                      placeholder="0"
                      value={formData.taxRate}
                      onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
                      data-testid="input-invoice-tax" 
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createInvoiceMutation.isPending || clients.length === 0}
                  data-testid="button-save-invoice"
                >
                  {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mobile-cols-1">
          <Card className="mobile-card-tight">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">${totals.total.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="mobile-card-tight">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Paid</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-paid">${totals.paid.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="mobile-card-tight">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Outstanding</CardTitle>
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-outstanding">${totals.outstanding.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="mobile-card-tight">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Overdue</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600" data-testid="stat-overdue">${totals.overdue.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

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
                  <SelectItem value="">All Clients</SelectItem>
                  {clients.map((client) => (
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
                <span>Showing {filteredInvoices.length} of {invoices.length} invoices</span>
              </div>
            )}
          </div>
        </Card>

        {/* Tabs for filtering */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({invoices.length})
            </TabsTrigger>
            <TabsTrigger value="open" data-testid="tab-open">
              <Mail className="h-4 w-4 mr-1" />
              Open ({invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length})
            </TabsTrigger>
            <TabsTrigger value="paid" data-testid="tab-paid">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Paid ({invoices.filter(i => i.status === 'paid').length})
            </TabsTrigger>
            <TabsTrigger value="past_due" data-testid="tab-past-due">
              <AlertCircle className="h-4 w-4 mr-1" />
              Past Due ({invoices.filter(i => {
                const now = new Date();
                if (i.status === 'overdue') return true;
                if (i.status === 'sent' && i.dueDate && new Date(i.dueDate) < now) return true;
                return false;
              }).length})
            </TabsTrigger>
            <TabsTrigger value="due_soon" data-testid="tab-due-soon">
              <Clock className="h-4 w-4 mr-1" />
              Due Soon ({invoices.filter(i => {
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
        ) : filteredInvoices.length === 0 && !searchQuery ? (
          <Card data-testid="card-no-invoices">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
              <h3 className="text-lg font-medium mb-2">No invoices yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Create your first invoice to start billing {qb.entity('clients').toLowerCase()}
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-invoice">
                <Plus className="mr-2 h-4 w-4" />
                Create First Invoice
              </Button>
            </CardContent>
          </Card>
        ) : (
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
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{getClientName(invoice.clientId)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</span>
                        {isPastDue(invoice) && (
                          <Badge variant="destructive" className="w-fit text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Past Due
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">${parseFloat(String(invoice.total || 0)).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(invoice.status || 'draft', invoice)} className="gap-1">
                        {getStatusIcon(invoice.status || 'draft', invoice)}
                        {getStatusText(invoice)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${invoice.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleViewDetail(invoice)}
                            data-testid={`menu-view-${invoice.id}`}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handlePdfPreview(invoice.id)}
                            data-testid={`menu-preview-${invoice.id}`}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Preview PDF
                          </DropdownMenuItem>
                          {invoice.status === 'draft' && (
                            <DropdownMenuItem 
                              onClick={() => openSendDialog(invoice)}
                              data-testid={`menu-send-${invoice.id}`}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Send with Email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDownloadPdf(invoice.id, invoice.invoiceNumber)}
                            data-testid={`menu-download-${invoice.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        )}
          </TabsContent>
        </Tabs>

        {/* Invoice Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice {invoiceDetail?.data?.invoiceNumber || ''}
              </DialogTitle>
              <DialogDescription>
                Complete invoice details with line items
              </DialogDescription>
            </DialogHeader>
            {isLoadingDetail ? (
              <div className="space-y-4 py-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : invoiceDetail?.data ? (
              <div className="space-y-6 py-4">
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">From</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold">{invoiceDetail.data.workspace?.companyName || invoiceDetail.data.workspace?.name || 'Your Business'}</p>
                      {invoiceDetail.data.workspace?.address && (
                        <p className="text-sm text-muted-foreground">{invoiceDetail.data.workspace.address}</p>
                      )}
                      {invoiceDetail.data.workspace?.phone && (
                        <p className="text-sm text-muted-foreground">{invoiceDetail.data.workspace.phone}</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Bill To</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold">
                        {invoiceDetail.data.client?.companyName || 
                         `${invoiceDetail.data.client?.firstName || ''} ${invoiceDetail.data.client?.lastName || ''}`.trim() || 
                         'Client'}
                      </p>
                      {invoiceDetail.data.client?.email && (
                        <p className="text-sm text-muted-foreground">{invoiceDetail.data.client.email}</p>
                      )}
                      {invoiceDetail.data.client?.address && (
                        <p className="text-sm text-muted-foreground">{invoiceDetail.data.client.address}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Invoice Meta */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg mobile-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    <p className="font-medium">
                      {invoiceDetail.data.issueDate ? new Date(invoiceDetail.data.issueDate).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-medium">
                      {invoiceDetail.data.dueDate ? new Date(invoiceDetail.data.dueDate).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={getStatusColor(invoiceDetail.data.status)} className="mt-1">
                      {invoiceDetail.data.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold text-lg">${parseFloat(invoiceDetail.data.total).toFixed(2)}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Line Items</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%]">Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceDetail.data.lineItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.description}</TableCell>
                            <TableCell className="text-right">{parseFloat(item.quantity).toFixed(2)}</TableCell>
                            <TableCell className="text-right">${parseFloat(item.unitPrice).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">${parseFloat(item.amount).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${parseFloat(invoiceDetail.data.subtotal).toFixed(2)}</span>
                    </div>
                    {parseFloat(invoiceDetail.data.taxRate || '0') > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax ({invoiceDetail.data.taxRate}%)</span>
                        <span>${parseFloat(invoiceDetail.data.taxAmount || '0').toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span>${parseFloat(invoiceDetail.data.total).toFixed(2)}</span>
                    </div>
                    {invoiceDetail.data.status === 'paid' && invoiceDetail.data.paidAt && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Paid on</span>
                        <span>{new Date(invoiceDetail.data.paidAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {invoiceDetail.data.notes && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{invoiceDetail.data.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Invoice details not available
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                Close
              </Button>
              {invoiceDetail?.data && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => handlePdfPreview(invoiceDetail.data.id)}
                    data-testid="button-preview-pdf"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview PDF
                  </Button>
                  <Button 
                    onClick={() => handleDownloadPdf(invoiceDetail.data.id, invoiceDetail.data.invoiceNumber)}
                    data-testid="button-download-pdf-detail"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PDF Preview Dialog */}
        <Dialog open={isPdfPreviewOpen} onOpenChange={(open) => !open && closePdfPreview()}>
          <DialogContent className="max-w-5xl h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice PDF Preview
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 h-full">
              {pdfPreviewUrl ? (
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-[calc(90vh-120px)] border rounded-lg"
                  title="Invoice PDF Preview"
                  data-testid="iframe-pdf-preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="w-full h-full" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closePdfPreview}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        </div>
      </div>
    </WorkspaceLayout>
  );
}
