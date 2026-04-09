import { secureFetch } from "@/lib/csrf";
import { useState, useEffect, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useClientsTable, useDeleteClient } from "@/hooks/useClients";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployee";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TableSkeleton } from "@/components/loading-indicators/skeletons";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Edit2, Trash2, FileText, Mail, Phone, Building2, Calendar, DollarSign, MapPin, Shield, Users, XCircle, RefreshCw, AlertTriangle, Ban, CheckCircle2, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CLIENT_CATEGORIES, type ClientCategory } from "@shared/schema";
import type { ClientWithInvoiceCount } from "@shared/types";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const DEACTIVATION_REASONS = [
  { value: 'non_payment', label: 'Non-Payment' },
  { value: 'legal_issue', label: 'Legal Issue' },
  { value: 'contract_terminated', label: 'Contract Terminated' },
  { value: 'contract_non_renewal', label: 'Contract Non-Renewal' },
  { value: 'lawsuit', label: 'Lawsuit' },
  { value: 'unable_to_staff', label: 'Unable to Staff' },
  { value: 'does_not_meet_billing_requirements', label: 'Does Not Meet Billing Requirements' },
  { value: 'does_not_meet_hourly_requirements', label: 'Does Not Meet Hourly Requirements' },
  { value: 'other', label: 'Other' },
  { value: 'no_reason_provided', label: 'No Reason Provided' },
] as const;

interface ClientsTableToolbarProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: 'all' | 'active' | 'inactive';
  onStatusChange: (value: 'all' | 'active' | 'inactive') => void;
  sort: 'createdAt' | 'firstName' | 'lastName' | 'companyName';
  onSortChange: (value: 'createdAt' | 'firstName' | 'lastName' | 'companyName') => void;
  order: 'asc' | 'desc';
  onOrderChange: (value: 'asc' | 'desc') => void;
  tier: string;
  onTierChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  groupBy: string;
  onGroupByChange: (value: string) => void;
}

function ClientsTableToolbar({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  order,
  onOrderChange,
  tier,
  onTierChange,
  categoryFilter,
  onCategoryFilterChange,
  groupBy,
  onGroupByChange,
}: ClientsTableToolbarProps) {
  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-client-search"
            placeholder="Search by name, email, phone, or company..."
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger data-testid="select-status-filter" className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tier} onValueChange={onTierChange}>
          <SelectTrigger data-testid="select-tier-filter" className="w-full sm:w-[160px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger data-testid="select-category-filter" className="w-full sm:w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CLIENT_CATEGORIES).map(([key, cat]) => (
              <SelectItem key={key} value={key}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={onGroupByChange}>
          <SelectTrigger data-testid="select-client-group-by" className="w-full sm:w-[160px]">
            <SelectValue placeholder="Group by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="tier">Tier</SelectItem>
            <SelectItem value="state">State</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger data-testid="select-sort-column" className="w-full sm:w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Date Added</SelectItem>
            <SelectItem value="firstName">First Name</SelectItem>
            <SelectItem value="lastName">Last Name</SelectItem>
            <SelectItem value="companyName">Company</SelectItem>
          </SelectContent>
        </Select>

        <Button
          data-testid="button-toggle-sort-order"
          variant="outline"
          size="icon"
          onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}
        >
          {order === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

interface MobileClientCardProps {
  client: ClientWithInvoiceCount;
  onEdit: (client: ClientWithInvoiceCount) => void;
  onDelete: (client: ClientWithInvoiceCount) => void;
  onDeactivate: (client: ClientWithInvoiceCount) => void;
  onReactivate: (client: ClientWithInvoiceCount) => void;
  canEdit: boolean;
  canDelete: boolean;
}

function MobileClientCard({ client, onEdit, onDelete, onDeactivate, onReactivate, canEdit, canDelete }: MobileClientCardProps) {
  const c = client as any;
  return (
    <Card data-testid={`card-client-${client.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {client.firstName} {client.lastName}
            </CardTitle>
            {client.clientNumber && (
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5" data-testid={`text-client-number-${client.id}`}>
                {client.clientNumber}
              </div>
            )}
            {client.companyName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Building2 className="h-4 w-4" />
                {client.companyName}
              </div>
            )}
            {(client as any).category && (client as any).category !== 'other' && (
              <Badge variant="outline" className="mt-1 text-[10px]" data-testid={`badge-category-${client.id}`}>
                {CLIENT_CATEGORIES[(client as any).category as ClientCategory]?.label || (client as any).category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={client.isActive ? "default" : "secondary"} data-testid={`badge-status-${client.id}`}>
              {client.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {!client.isActive && c.collectionsStatus && c.collectionsStatus !== 'none' && (
              <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600 dark:text-yellow-400" data-testid={`badge-collections-${client.id}`}>
                {c.collectionsStatus === 'active' ? 'In Collections' : c.collectionsStatus === 'written_off' ? 'Written Off' : c.collectionsStatus === 'resolved' ? 'Resolved' : c.collectionsStatus}
              </Badge>
            )}
            {(canEdit || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-menu-${client.id}`}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => onEdit(client)} data-testid={`button-edit-${client.id}`}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canEdit && client.isActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeactivate(client)}
                        className="text-destructive"
                        data-testid={`button-deactivate-${client.id}`}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Deactivate Client
                      </DropdownMenuItem>
                    </>
                  )}
                  {canEdit && !client.isActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onReactivate(client)}
                        data-testid={`button-reactivate-${client.id}`}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reactivate Client
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(client)}
                        className="text-destructive"
                        data-testid={`button-delete-${client.id}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {client.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a href={`mailto:${client.email}`} className="hover:underline">
              {client.email}
            </a>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${client.phone}`} className="hover:underline">
              {client.phone}
            </a>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{client.invoiceCount} invoice{client.invoiceCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-xs">Added {new Date(client.createdAt!).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ClientsTableProps {
  workspaceId?: string;
}

export function ClientsTable({ workspaceId }: ClientsTableProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [location, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithInvoiceCount | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<ClientWithInvoiceCount | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [clientToDeactivate, setClientToDeactivate] = useState<ClientWithInvoiceCount | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('non_payment');
  const [deactivationNotes, setDeactivationNotes] = useState('');
  const [collectionsDialogOpen, setCollectionsDialogOpen] = useState(false);
  const [deactivatedClientForCollections, setDeactivatedClientForCollections] = useState<{ id: string; name: string } | null>(null);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [clientToReactivate, setClientToReactivate] = useState<ClientWithInvoiceCount | null>(null);
  const [editFormData, setEditFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', companyName: '', category: 'other',
    address: '', addressLine2: '', city: '', state: '', postalCode: '',
    billingEmail: '', paymentTermsDays: '', billingCycle: 'monthly', preferredPaymentMethod: 'check', autoSendInvoice: true,
    pocName: '', pocTitle: '', pocPhone: '', pocEmail: '',
    apContactName: '', apContactEmail: '', apContactPhone: '',
    postOrders: '', notes: '',
    // GAP 1.1 FIX: billing rate fields must survive edits — previously these were
    // not in editFormData so a client PATCH would silently null out all bill rates
    contractRate: '',      // Base $/hr contract rate
    armedBillRate: '',     // Armed officer $/hr override
    unarmedBillRate: '',   // Unarmed officer $/hr override
    overtimeBillRate: '',  // OT multiplier or flat $/hr override
  });
  const [clientTierFilter, setClientTierFilter] = useState('all');
  const [clientCategoryFilter, setClientCategoryFilter] = useState('all');
  const [clientGroupBy, setClientGroupBy] = useState('none');

  const params = {
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 50,
    search: searchParams.get('search') || '',
    status: (searchParams.get('status') as 'all' | 'active' | 'inactive') || 'all',
    sort: (searchParams.get('sort') as 'createdAt' | 'firstName' | 'lastName' | 'companyName') || 'createdAt',
    order: (searchParams.get('order') as 'asc' | 'desc') || 'desc',
  };

  const { data, isLoading } = useClientsTable({ ...params, ...(workspaceId && { workspaceId }) });
  const deleteMutation = useDeleteClient();

  const { 
    sortKey, 
    sortDir, 
    toggleSort 
  } = useTableSort<ClientWithInvoiceCount>((data?.clients || []) as ClientWithInvoiceCount[], 'companyName', 'asc');

  // SECURITY: Use server-authoritative user.workspaceRole for authorization
  const workspaceRole = user?.workspaceRole;
  const canEdit = workspaceRole === 'org_owner' || workspaceRole === 'manager' || !!workspaceId;
  const canDelete = workspaceRole === 'org_owner' || !!workspaceId;

  // Sync searchInput from URL for deep linking / browser navigation
  // Depends on location to catch all URL changes (back/forward, external links)
  useEffect(() => {
    const currentParams = new URLSearchParams(location.split('?')[1] || '');
    const urlSearch = currentParams.get('search') || '';
    if (searchInput !== urlSearch) {
      setSearchInput(urlSearch);
    }
  }, [location]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams({ search: searchInput, page: 1 });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const updateParams = (updates: Partial<typeof params>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      // Delete param if it's empty, 'all', or a default value (page=1, limit=50)
      if (!value || value === 'all' || (key === 'page' && value === 1) || (key === 'limit' && value === 50)) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });
    const newSearch = newParams.toString();
    const basePath = location.split('?')[0];
    const newURL = newSearch ? `${basePath}?${newSearch}` : basePath;
    
    // Only update location if URL actually changes
    if (newURL !== location) {
      setLocation(newURL);
    }
  };

  const handleDelete = () => {
    if (!clientToDelete) return;
    
    deleteMutation.mutate(clientToDelete.id, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Client deleted successfully",
        });
        setDeleteDialogOpen(false);
        setClientToDelete(null);
      },
      onError: (error: Error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete client",
          variant: "destructive",
        });
      },
    });
  };

  const handleEdit = (client: ClientWithInvoiceCount) => {
    setClientToEdit(client);
    const c = client as any;
    setEditFormData({
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      companyName: c.companyName || '',
      category: c.category || 'other',
      address: c.address || '',
      addressLine2: c.addressLine2 || '',
      city: c.city || '',
      state: c.state || '',
      postalCode: c.postalCode || '',
      billingEmail: c.billingEmail || '',
      paymentTermsDays: c.paymentTermsDays != null ? String(c.paymentTermsDays) : '',
      billingCycle: c.billingCycle || 'monthly',
      preferredPaymentMethod: c.preferredPaymentMethod || 'check',
      autoSendInvoice: c.autoSendInvoice !== false,
      pocName: c.pocName || '',
      pocTitle: c.pocTitle || '',
      pocPhone: c.pocPhone || '',
      pocEmail: c.pocEmail || '',
      apContactName: c.apContactName || '',
      apContactEmail: c.apContactEmail || '',
      apContactPhone: c.apContactPhone || '',
      postOrders: c.postOrders || '',
      notes: c.notes || '',
      // GAP 1.1 FIX: Populate billing rate fields from existing client so they
      // are preserved (not nulled out) when saving any other field change.
      contractRate: c.contractRate != null ? String(c.contractRate) : '',
      armedBillRate: c.armedBillRate != null ? String(c.armedBillRate) : '',
      unarmedBillRate: c.unarmedBillRate != null ? String(c.unarmedBillRate) : '',
      overtimeBillRate: c.overtimeBillRate != null ? String(c.overtimeBillRate) : '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!clientToEdit) return;
    try {
      const response = await secureFetch(`/api/clients/${clientToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });
      if (!response.ok) throw new Error('Failed to update client');
      toast({ title: "Success", description: "Client updated successfully" });
      setEditDialogOpen(false);
      // Refresh client data
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients/lookup'] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deactivateMutation = useMutation({
    mutationFn: async ({ clientId, reason, notes }: { clientId: string; reason: string; notes: string }) => {
      const res = await apiRequest('POST', `/api/clients/${clientId}/deactivate`, { reason, notes });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to deactivate client');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Client Deactivated",
        description: `${data.shiftsClosedCount || 0} future shift(s) cancelled.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients/deactivated'] });
      setDeactivateDialogOpen(false);
      const client = clientToDeactivate;
      setClientToDeactivate(null);
      setDeactivationReason('non_payment');
      setDeactivationNotes('');
      // Open collections decision dialog
      if (client) {
        setDeactivatedClientForCollections({ id: client.id, name: `${client.firstName} ${client.lastName}`.trim() || client.companyName || 'Client' });
        setCollectionsDialogOpen(true);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest('POST', `/api/clients/${clientId}/reactivate`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to reactivate client');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Client Reactivated", description: "Client has been restored to active status." });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients/deactivated'] });
      setReactivateDialogOpen(false);
      setClientToReactivate(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startCollectionsMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest('POST', `/api/clients/${clientId}/collections/start`, {});
      if (!res.ok) throw new Error('Failed to start collections');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Collections Started", description: "The collections pipeline is now active. First email will be sent today." });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      setCollectionsDialogOpen(false);
      setDeactivatedClientForCollections(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const declineCollectionsMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest('POST', `/api/clients/${clientId}/collections/decline`, { reason: 'Owner declined at deactivation' });
      if (!res.ok) throw new Error('Failed to record collections decision');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Collections Declined", description: "No collections outreach will be sent." });
      setCollectionsDialogOpen(false);
      setDeactivatedClientForCollections(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rawClients = data?.clients || [];
  const total = data?.total || 0;
  const pageCount = data?.pageCount || 0;
  const currentPage = data?.page || 1;

  const clients = useMemo(() => {
    let filtered = rawClients;
    if (clientTierFilter !== 'all') {
      filtered = filtered.filter((c: any) => (c.strategicTier || 'standard') === clientTierFilter);
    }
    if (clientCategoryFilter !== 'all') {
      filtered = filtered.filter((c: any) => (c.category || 'other') === clientCategoryFilter);
    }
    return filtered;
  }, [rawClients, clientTierFilter, clientCategoryFilter]);

  const clientGroups = useMemo(() => {
    if (clientGroupBy === 'none') return [{ label: '', items: clients }];
    const groups: Record<string, ClientWithInvoiceCount[]> = {};
    clients.forEach((c: any) => {
      let key = 'Unassigned';
      if (clientGroupBy === 'company') key = c.companyName || 'No Company';
      else if (clientGroupBy === 'category') {
        const cat = (c as any).category || 'other';
        key = CLIENT_CATEGORIES[cat as ClientCategory]?.label || cat;
      }
      else if (clientGroupBy === 'tier') key = ((c as any).strategicTier || 'standard').charAt(0).toUpperCase() + ((c as any).strategicTier || 'standard').slice(1);
      else if (clientGroupBy === 'state') key = (c as any).state || 'No State';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, items }));
  }, [clients, clientGroupBy]);

  if (!isLoading && (!data || !data.clients || data.clients.length === 0) && !params.search) {
    return (
      <Card data-testid="card-no-clients">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="bg-muted/30 p-6 rounded-full mb-6">
            <Building2 className="h-12 w-12 text-muted-foreground opacity-40" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No clients found</h3>
          <p className="text-muted-foreground mb-8 max-w-sm">
            Add your first client to start managing service locations and generating invoices.
          </p>
          <Button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-add-client-dialog'));
            }} 
            data-testid="button-add-first-client"
            size="lg"
            className="hover-elevate"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add Client
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <>
        <ClientsTableToolbar
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={params.status}
          onStatusChange={(status) => updateParams({ status, page: 1 })}
          sort={params.sort}
          onSortChange={(sort) => updateParams({ sort, page: 1 })}
          order={params.order}
          onOrderChange={(order) => updateParams({ order })}
          tier={clientTierFilter}
          onTierChange={setClientTierFilter}
          categoryFilter={clientCategoryFilter}
          onCategoryFilterChange={setClientCategoryFilter}
          groupBy={clientGroupBy}
          onGroupByChange={setClientGroupBy}
        />
        <TableSkeleton rows={6} columns={4} showAvatar={true} compact={false} />
      </>
    );
  }

  if (total === 0 && !params.search && params.status === 'all') {
    return (
      <>
        <ClientsTableToolbar
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={params.status}
          onStatusChange={(status) => updateParams({ status, page: 1 })}
          sort={params.sort}
          onSortChange={(sort) => updateParams({ sort, page: 1 })}
          order={params.order}
          onOrderChange={(order) => updateParams({ order })}
          tier={clientTierFilter}
          onTierChange={setClientTierFilter}
          categoryFilter={clientCategoryFilter}
          onCategoryFilterChange={setClientCategoryFilter}
          groupBy={clientGroupBy}
          onGroupByChange={setClientGroupBy}
        />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first client to get started with invoicing and time tracking
          </p>
        </div>
      </>
    );
  }

  if (total === 0) {
    return (
      <>
        <ClientsTableToolbar
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          status={params.status}
          onStatusChange={(status) => updateParams({ status, page: 1 })}
          sort={params.sort}
          onSortChange={(sort) => updateParams({ sort, page: 1 })}
          order={params.order}
          onOrderChange={(order) => updateParams({ order })}
          tier={clientTierFilter}
          onTierChange={setClientTierFilter}
          categoryFilter={clientCategoryFilter}
          onCategoryFilterChange={setClientCategoryFilter}
          groupBy={clientGroupBy}
          onGroupByChange={setClientGroupBy}
        />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No results found</h3>
          <p className="text-muted-foreground mb-4">
            No clients match your search criteria
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput('');
              updateParams({ search: '', status: 'all', page: 1 });
            }}
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        </div>
      </>
    );
  }

  const handleClose = () => {
    if (editFormData.firstName !== (selectedClient?.firstName || "") ||
        editFormData.lastName !== (selectedClient?.lastName || "") ||
        editFormData.companyName !== (selectedClient?.companyName || "") ||
        editFormData.category !== (selectedClient?.category || "other") ||
        editFormData.email !== (selectedClient?.email || "") ||
        editFormData.phone !== (selectedClient?.phone || "") ||
        editFormData.address !== (selectedClient?.address || "") ||
        editFormData.addressLine2 !== (selectedClient?.addressLine2 || "") ||
        editFormData.city !== (selectedClient?.city || "") ||
        editFormData.state !== (selectedClient?.state || "") ||
        editFormData.postalCode !== (selectedClient?.postalCode || "") ||
        editFormData.notes !== (selectedClient?.notes || "") ||
        editFormData.billableRate !== (selectedClient?.billableRate?.toString() || "") ||
        editFormData.billingCycle !== (selectedClient?.billingCycle || "monthly") ||
        editFormData.paymentTermsDays !== (selectedClient?.paymentTermsDays?.toString() || "") ||
        editFormData.preferredPaymentMethod !== (selectedClient?.preferredPaymentMethod || "check") ||
        editFormData.autoSendInvoice !== (selectedClient?.autoSendInvoice ?? true) ||
        editFormData.pocName !== (selectedClient?.pocName || "") ||
        editFormData.pocTitle !== (selectedClient?.pocTitle || "") ||
        editFormData.pocPhone !== (selectedClient?.pocPhone || "") ||
        editFormData.pocEmail !== (selectedClient?.pocEmail || "") ||
        editFormData.apContactName !== (selectedClient?.apContactName || "") ||
        editFormData.apContactEmail !== (selectedClient?.apContactEmail || "") ||
        editFormData.apContactPhone !== (selectedClient?.apContactPhone || "")) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setEditDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <ClientsTableToolbar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        status={params.status}
        onStatusChange={(status) => updateParams({ status, page: 1 })}
        sort={params.sort}
        onSortChange={(sort) => updateParams({ sort, page: 1 })}
        order={params.order}
        onOrderChange={(order) => updateParams({ order })}
        tier={clientTierFilter}
        onTierChange={setClientTierFilter}
        categoryFilter={clientCategoryFilter}
        onCategoryFilterChange={setClientCategoryFilter}
        groupBy={clientGroupBy}
        onGroupByChange={setClientGroupBy}
      />

      {isMobile ? (
        <div className="space-y-4">
          {clientGroups.map((group) => (
            <div key={group.label || "__all__"}>
              {group.label && (
                <div className="flex items-center gap-2 mb-2" data-testid={`client-group-${group.label}`}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</h3>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{group.items.length}</Badge>
                </div>
              )}
              <div className="grid gap-4">
                {group.items.map(client => (
                  <MobileClientCard
                    key={client.id}
                    client={client}
                    onEdit={handleEdit}
                    onDelete={(client) => {
                      setClientToDelete(client);
                      setDeleteDialogOpen(true);
                    }}
                    onDeactivate={(client) => {
                      setClientToDeactivate(client);
                      setDeactivateDialogOpen(true);
                    }}
                    onReactivate={(client) => {
                      setClientToReactivate(client);
                      setReactivateDialogOpen(true);
                    }}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={isLoading && data ? 'opacity-50' : ''}>
          <ScrollArea className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader column="firstName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                      Name
                    </SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="companyName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                      Company
                    </SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                      Category
                    </SortableHeader>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead>
                    <SortableHeader column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                      Date Added
                    </SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader column="isActive" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                      Status
                    </SortableHeader>
                  </TableHead>
                  {(canEdit || canDelete) && <TableHead className="w-[70px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientGroups.map((group) => (
                  <Fragment key={group.label || "__all__"}>
                    {group.label && (
                      <TableRow key={`group-${group.label}`} className="bg-muted/50" data-testid={`row-client-group-${group.label}`}>
                        <TableCell colSpan={(canEdit || canDelete) ? 9 : 8} className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{group.items.length}</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {group.items.map(client => (
                  <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                    <TableCell className="font-medium" data-testid={`text-client-name-${client.id}`}>
                      {client.firstName} {client.lastName}
                      {client.clientNumber && (
                        <div className="text-[10px] font-mono text-muted-foreground" data-testid={`text-client-number-${client.id}`}>
                          {client.clientNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-client-company-${client.id}`}>
                      <div className="truncate max-w-[200px]" title={client.companyName || '-'}>
                        {client.companyName || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(client as any).category && (client as any).category !== 'other' ? (
                        <Badge variant="outline" className="text-[10px]" data-testid={`badge-category-${client.id}`}>
                          {CLIENT_CATEGORIES[(client as any).category as ClientCategory]?.label || (client as any).category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="hover:underline" data-testid={`text-client-email-${client.id}`}>
                          {client.email}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} className="hover:underline" data-testid={`text-client-phone-${client.id}`}>
                          {client.phone}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" data-testid={`badge-invoice-count-${client.id}`}>
                        {client.invoiceCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm" data-testid={`text-client-created-${client.id}`}>
                      {new Date(client.createdAt!).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={client.isActive ? "default" : "secondary"} data-testid={`badge-status-${client.id}`}>
                          {client.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {!(client as any).isActive && (client as any).collectionsStatus && (client as any).collectionsStatus !== 'none' && (
                          <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600 dark:text-yellow-400" data-testid={`badge-collections-${client.id}`}>
                            {(client as any).collectionsStatus === 'active' ? 'In Collections' : (client as any).collectionsStatus === 'written_off' ? 'Written Off' : (client as any).collectionsStatus === 'resolved' ? 'Resolved' : (client as any).collectionsStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-client-menu-${client.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEdit(client)} data-testid={`button-edit-client-${client.id}`}>
                                <Edit2 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canEdit && client.isActive && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => { setClientToDeactivate(client); setDeactivateDialogOpen(true); }}
                                  className="text-destructive"
                                  data-testid={`button-deactivate-client-${client.id}`}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Deactivate Client
                                </DropdownMenuItem>
                              </>
                            )}
                            {canEdit && !client.isActive && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => { setClientToReactivate(client); setReactivateDialogOpen(true); }}
                                  data-testid={`button-reactivate-${client.id}`}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Reactivate Client
                                </DropdownMenuItem>
                              </>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setClientToDelete(client);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-destructive"
                                  data-testid={`button-delete-${client.id}`}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => currentPage > 1 && updateParams({ page: currentPage - 1 })}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                data-testid="button-pagination-prev"
              />
            </PaginationItem>
            
            {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
              let pageNum;
              if (pageCount <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= pageCount - 2) {
                pageNum = pageCount - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => updateParams({ page: pageNum })}
                    isActive={currentPage === pageNum}
                    className="cursor-pointer"
                    data-testid={`button-pagination-${pageNum}`}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            {pageCount > 5 && currentPage < pageCount - 2 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}
            
            <PaginationItem>
              <PaginationNext
                onClick={() => currentPage < pageCount && updateParams({ page: currentPage + 1 })}
                className={currentPage === pageCount ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                data-testid="button-pagination-next"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {clientToDelete?.firstName} {clientToDelete?.lastName}?
              {clientToDelete?.invoiceCount && clientToDelete.invoiceCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This client has {clientToDelete.invoiceCount} invoice{clientToDelete.invoiceCount !== 1 ? 's' : ''}. This action cannot be undone.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-sm text-muted-foreground text-center">
        Showing {((currentPage - 1) * params.limit) + 1} to {Math.min(currentPage * params.limit, total)} of {total} client{total !== 1 ? 's' : ''}
      </div>

      {/* ─── Deactivation Dialog ─────────────────────────────────────────── */}
      <UniversalModal open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <UniversalModalContent size="md" data-testid="dialog-deactivate-client">
          <UniversalModalHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-destructive/10">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <UniversalModalTitle>Deactivate Client</UniversalModalTitle>
                <UniversalModalDescription>
                  {clientToDeactivate?.companyName || `${clientToDeactivate?.firstName} ${clientToDeactivate?.lastName}`}
                </UniversalModalDescription>
              </div>
            </div>
          </UniversalModalHeader>
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/5 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                All future scheduled shifts for this client will be cancelled. Historical records, invoices, and payroll data are preserved.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deactivation-reason">Reason for Deactivation</Label>
              <Select value={deactivationReason} onValueChange={setDeactivationReason}>
                <SelectTrigger id="deactivation-reason" data-testid="select-deactivation-reason">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {DEACTIVATION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deactivation-notes">Internal Notes (optional)</Label>
              <Textarea
                id="deactivation-notes"
                data-testid="input-deactivation-notes"
                placeholder="Document the circumstances, contact attempts, or any relevant context..."
                value={deactivationNotes}
                onChange={(e) => setDeactivationNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => { setDeactivateDialogOpen(false); setDeactivationNotes(''); setDeactivationReason('non_payment'); }} data-testid="button-cancel-deactivate">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateMutation.isPending}
              onClick={() => {
                if (!clientToDeactivate) return;
                deactivateMutation.mutate({
                  clientId: clientToDeactivate.id,
                  reason: deactivationReason,
                  notes: deactivationNotes,
                });
              }}
              data-testid="button-confirm-deactivate"
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate Client'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {/* ─── Collections Decision Dialog ─────────────────────────────────── */}
      <UniversalModal open={collectionsDialogOpen} onOpenChange={(open) => { if (!open) { setCollectionsDialogOpen(false); setDeactivatedClientForCollections(null); } }}>
        <UniversalModalContent size="md" data-testid="dialog-collections-decision">
          <UniversalModalHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-yellow-500/10">
                <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <UniversalModalTitle>Collections Decision</UniversalModalTitle>
                <UniversalModalDescription>
                  {deactivatedClientForCollections?.name} has been deactivated
                </UniversalModalDescription>
              </div>
            </div>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Does this client have an outstanding balance that needs to be collected? You can start an automated collections pipeline now, or handle this manually later.
            </p>
            <div className="grid gap-3">
              <button
                className="flex items-start gap-3 p-4 rounded-md border hover-elevate text-left w-full"
                onClick={() => {
                  if (deactivatedClientForCollections) {
                    startCollectionsMutation.mutate(deactivatedClientForCollections.id);
                  }
                }}
                disabled={startCollectionsMutation.isPending}
                data-testid="button-start-collections"
              >
                <CheckCircle2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Start Collections Pipeline</p>
                  <p className="text-xs text-muted-foreground mt-1">Send up to 3 automated collection emails over the next few days. All activity is logged.</p>
                </div>
              </button>
              <button
                className="flex items-start gap-3 p-4 rounded-md border hover-elevate text-left w-full"
                onClick={() => {
                  if (deactivatedClientForCollections) {
                    declineCollectionsMutation.mutate(deactivatedClientForCollections.id);
                  }
                }}
                disabled={declineCollectionsMutation.isPending}
                data-testid="button-decline-collections"
              >
                <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">No Collections Needed</p>
                  <p className="text-xs text-muted-foreground mt-1">No balance is owed, or you will handle this manually. No automated emails will be sent.</p>
                </div>
              </button>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="ghost" onClick={() => { setCollectionsDialogOpen(false); setDeactivatedClientForCollections(null); }} data-testid="button-decide-later">
              Decide Later
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {/* ─── Reactivation Dialog ─────────────────────────────────────────── */}
      <AlertDialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <AlertDialogContent data-testid="dialog-reactivate-client">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-green-600 dark:text-green-400" />
              Reactivate Client
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Reactivate <strong>{clientToReactivate?.companyName || `${clientToReactivate?.firstName} ${clientToReactivate?.lastName}`}</strong>?
                </p>
                <p className="text-sm">
                  The client's account will be restored to active status. Any open collections pipeline will be marked as resolved. You will need to manually reschedule shifts.
                </p>
                {(clientToReactivate as any)?.deactivationReason && (
                  <div className="p-3 rounded-md bg-muted text-xs text-muted-foreground">
                    Previously deactivated for: <span className="font-medium">{(clientToReactivate as any).deactivationReason?.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (clientToReactivate) reactivateMutation.mutate(clientToReactivate.id);
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-reactivate"
            >
              {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate Client'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UniversalModal open={editDialogOpen} onOpenChange={(open) => { if (!open) handleClose(); else setEditDialogOpen(true); }}>
        <UniversalModalContent size="xl" className="max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-client">
          <UniversalModalHeader>
            <div className="flex items-center justify-between w-full">
              <UniversalModalTitle>Edit Client</UniversalModalTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -mr-2"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <UniversalModalDescription>Update client contact, address, billing, and site details</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-6 py-4">

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" />
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">First Name</Label>
                  <Input id="edit-firstName" data-testid="input-edit-firstName"
                    value={editFormData.firstName} onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Last Name</Label>
                  <Input id="edit-lastName" data-testid="input-edit-lastName"
                    value={editFormData.lastName} onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-companyName">Company Name</Label>
                  <Input id="edit-companyName" data-testid="input-edit-companyName"
                    value={editFormData.companyName} onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Site Category</Label>
                  <Select value={editFormData.category} onValueChange={(v) => setEditFormData({ ...editFormData, category: v })}>
                    <SelectTrigger id="edit-category" data-testid="select-edit-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CLIENT_CATEGORIES).map(([key, cat]) => (
                        <SelectItem key={key} value={key}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Primary Email</Label>
                  <Input id="edit-email" type="email" data-testid="input-edit-email"
                    value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" data-testid="input-edit-phone"
                    value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                Address
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Street Address</Label>
                  <Input id="edit-address" placeholder="123 Main St" data-testid="input-edit-address"
                    value={editFormData.address} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-addressLine2">Address Line 2</Label>
                  <Input id="edit-addressLine2" placeholder="Suite, Floor, etc." data-testid="input-edit-address2"
                    value={editFormData.addressLine2} onChange={(e) => setEditFormData({ ...editFormData, addressLine2: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-city">City</Label>
                    <Input id="edit-city" placeholder="New York" data-testid="input-edit-city"
                      value={editFormData.city} onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-state">State</Label>
                    <Input id="edit-state" placeholder="NY" maxLength={2} data-testid="input-edit-state"
                      value={editFormData.state} onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-zip">ZIP Code</Label>
                    <Input id="edit-zip" placeholder="10001" data-testid="input-edit-zip"
                      value={editFormData.postalCode} onChange={(e) => setEditFormData({ ...editFormData, postalCode: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Point of Contact */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Shield className="h-4 w-4 shrink-0" />
                Point of Contact (On-Site)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-pocName">POC Full Name</Label>
                  <Input id="edit-pocName" placeholder="Jane Smith" data-testid="input-edit-poc-name"
                    value={editFormData.pocName} onChange={(e) => setEditFormData({ ...editFormData, pocName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-pocTitle">POC Title</Label>
                  <Input id="edit-pocTitle" placeholder="Operations Manager" data-testid="input-edit-poc-title"
                    value={editFormData.pocTitle} onChange={(e) => setEditFormData({ ...editFormData, pocTitle: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-pocPhone">POC Phone</Label>
                  <Input id="edit-pocPhone" placeholder="(555) 000-0000" data-testid="input-edit-poc-phone"
                    value={editFormData.pocPhone} onChange={(e) => setEditFormData({ ...editFormData, pocPhone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-pocEmail">POC Email</Label>
                  <Input id="edit-pocEmail" type="email" placeholder="jane@company.com" data-testid="input-edit-poc-email"
                    value={editFormData.pocEmail} onChange={(e) => setEditFormData({ ...editFormData, pocEmail: e.target.value })} />
                </div>
              </div>
            </div>

            {/* AP Contact */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 shrink-0" />
                Accounts Payable Contact (AP)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-apName">AP Contact Name</Label>
                  <Input id="edit-apName" placeholder="Accounts Payable" data-testid="input-edit-ap-name"
                    value={editFormData.apContactName} onChange={(e) => setEditFormData({ ...editFormData, apContactName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-apPhone">AP Phone</Label>
                  <Input id="edit-apPhone" placeholder="(555) 000-0001" data-testid="input-edit-ap-phone"
                    value={editFormData.apContactPhone} onChange={(e) => setEditFormData({ ...editFormData, apContactPhone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-apEmail">AP Email (Invoice Delivery)</Label>
                <Input id="edit-apEmail" type="email" placeholder="ap@company.com" data-testid="input-edit-ap-email"
                  value={editFormData.apContactEmail} onChange={(e) => setEditFormData({ ...editFormData, apContactEmail: e.target.value })} />
              </div>
            </div>

            {/* Billing */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4 shrink-0" />
                Billing Settings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-billingEmail">Billing Email</Label>
                  <Input id="edit-billingEmail" type="email" placeholder="billing@company.com" data-testid="input-edit-billing-email"
                    value={editFormData.billingEmail} onChange={(e) => setEditFormData({ ...editFormData, billingEmail: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentTerms">Payment Terms (Days)</Label>
                  <Input id="edit-paymentTerms" type="number" min="0" placeholder="30" data-testid="input-edit-payment-terms"
                    value={editFormData.paymentTermsDays} onChange={(e) => setEditFormData({ ...editFormData, paymentTermsDays: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-billingCycle">Billing Cycle</Label>
                  <Select value={editFormData.billingCycle} onValueChange={(v) => setEditFormData({ ...editFormData, billingCycle: v })}>
                    <SelectTrigger id="edit-billingCycle" data-testid="select-edit-billing-cycle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="net30">Net 30 Days</SelectItem>
                      <SelectItem value="net60">Net 60 Days</SelectItem>
                      <SelectItem value="net90">Net 90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentMethod">Payment Method</Label>
                  <Select value={editFormData.preferredPaymentMethod} onValueChange={(v) => setEditFormData({ ...editFormData, preferredPaymentMethod: v })}>
                    <SelectTrigger id="edit-paymentMethod" data-testid="select-edit-payment-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="ach">ACH / Direct Deposit</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="wire">Wire Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Auto-Send Invoices</p>
                  <p className="text-xs text-muted-foreground">Automatically email invoices on billing cycle</p>
                </div>
                <Switch checked={editFormData.autoSendInvoice}
                  onCheckedChange={(v) => setEditFormData({ ...editFormData, autoSendInvoice: v })}
                  data-testid="switch-edit-auto-send" />
              </div>
            </div>

            {/* Billing Rates — GAP 1.1 FIX: these fields were missing from the edit dialog */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 shrink-0" />
                Billing Rates ($/hr)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-contractRate">Base Contract Rate</Label>
                  <Input id="edit-contractRate" type="number" min="0" step="0.01" placeholder="e.g. 22.50" data-testid="input-edit-contract-rate"
                    value={editFormData.contractRate} onChange={(e) => setEditFormData({ ...editFormData, contractRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-armedBillRate">Armed Officer Rate</Label>
                  <Input id="edit-armedBillRate" type="number" min="0" step="0.01" placeholder="e.g. 27.00" data-testid="input-edit-armed-bill-rate"
                    value={editFormData.armedBillRate} onChange={(e) => setEditFormData({ ...editFormData, armedBillRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unarmedBillRate">Unarmed Officer Rate</Label>
                  <Input id="edit-unarmedBillRate" type="number" min="0" step="0.01" placeholder="e.g. 18.00" data-testid="input-edit-unarmed-bill-rate"
                    value={editFormData.unarmedBillRate} onChange={(e) => setEditFormData({ ...editFormData, unarmedBillRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-overtimeBillRate">Overtime Bill Rate</Label>
                  <Input id="edit-overtimeBillRate" type="number" min="0" step="0.01" placeholder="e.g. 33.75" data-testid="input-edit-overtime-bill-rate"
                    value={editFormData.overtimeBillRate} onChange={(e) => setEditFormData({ ...editFormData, overtimeBillRate: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Post Orders & Notes */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Post Orders &amp; Notes</h3>
              <div className="space-y-2">
                <Label htmlFor="edit-postOrders">Post Orders / Standing Instructions</Label>
                <Textarea id="edit-postOrders" placeholder="Officer duties, access procedures, patrol routes..." data-testid="input-edit-post-orders"
                  value={editFormData.postOrders} onChange={(e) => setEditFormData({ ...editFormData, postOrders: e.target.value })}
                  className="min-h-[80px]" />
                <p className="text-xs text-muted-foreground">Shown to officers in the shift detail view.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Internal Notes</Label>
                <Textarea id="edit-notes" placeholder="Internal notes (not visible to officers)..." data-testid="input-edit-notes"
                  value={editFormData.notes} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} />
              </div>
            </div>

          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} data-testid="button-save-edit">
              Save Changes
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );
}
