import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCreateClient } from "@/hooks/useClients";
import { useQBTerminology } from "@/hooks/useQBTerminology";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiFetch } from "@/lib/apiError";
import { ClientOrgListResponse } from "@shared/schemas/responses/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientsTable } from "@/components/clients-table";
import { Plus, Building2, FileText, Shield, Star, MapPin, Clock, Ban, RefreshCw, AlertTriangle, DollarSign, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { CLIENT_CATEGORIES, type ClientCategory } from "@shared/schema";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Skeleton } from "@/components/ui/skeleton";
const clientsPageConfig: CanvasPageConfig = {
  id: 'clients',
  category: 'operations',
  title: 'Clients',
  subtitle: 'Manage your clients and their service locations',
};

function DeactivatedClientsView({ workspaceId }: { workspaceId?: string }) {
  const { toast } = useToast();
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const { data: deactivated = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/clients/deactivated', workspaceId],
    queryFn: async () => {
      const url = workspaceId ? `/api/clients/deactivated?workspaceId=${workspaceId}` : '/api/clients/deactivated';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deactivated clients');
      return res.json();
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest('POST', `/api/clients/${clientId}/reactivate`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to reactivate');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Client Reactivated", description: "Client has been restored to active status." });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients/deactivated'] });
      setReactivatingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setReactivatingId(null);
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async ({ clientId, reason, notes }: { clientId: string, reason: string, notes: string }) => {
      const res = await apiRequest('DELETE', `/api/clients/${clientId}`, { reason, notes, workspaceId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to deactivate client');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Client Deactivated", description: "Client has been moved to inactive status." });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients/lookup', workspaceId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isAnyClientMutationPending = createMutation.isPending || reactivateMutation.isPending || deleteClientMutation.isPending;

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading deactivated clients...</div>;
  }

  if (deactivated.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground" data-testid="empty-deactivated">
        <Ban className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No deactivated clients</p>
        <p className="text-sm mt-1">When you deactivate a client, they will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="deactivated-clients-list">
      {deactivated.map((client: any) => (
        <Card key={client.id} data-testid={`card-deactivated-${client.id}`} className="opacity-90 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1">
                <CardTitle className="text-base">
                  {client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Unknown Client'}
                </CardTitle>
                {client.deactivatedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Deactivated {new Date(client.deactivatedAt).toLocaleDateString()}
                    {client.deactivationReason && ` — ${client.deactivationReason.replace(/_/g, ' ')}`}
                  </p>
                )}
                {client.deactivationNotes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{client.deactivationNotes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" data-testid={`badge-deactivated-${client.id}`}>Inactive</Badge>
                {client.collectionsStatus && client.collectionsStatus !== 'none' && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${client.collectionsStatus === 'active' ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400' : client.collectionsStatus === 'written_off' ? 'border-red-500 text-red-600' : 'border-green-500 text-green-600'}`}
                    data-testid={`badge-collections-status-${client.id}`}
                  >
                    {client.collectionsStatus === 'active' ? 'In Collections' : client.collectionsStatus === 'written_off' ? 'Written Off' : client.collectionsStatus === 'resolved' ? 'Resolved' : client.collectionsStatus}
                  </Badge>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isAnyClientMutationPending}
                      data-testid={`button-reactivate-${client.id}`}
                    >
                      {reactivateMutation.isPending && reactivatingId === client.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      {reactivateMutation.isPending && reactivatingId === client.id ? 'Reactivating...' : 'Reactivate'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reactivate Client?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to reactivate {client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim()}? They will be restored to active status.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => {
                        setReactivatingId(client.id);
                        reactivateMutation.mutate(client.id);
                      }}>
                        Reactivate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          {(client.collectionsStatus === 'active' || (client.collectionAttemptCount > 0)) && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                <span>{client.collectionAttemptCount || 0} collection attempt{client.collectionAttemptCount !== 1 ? 's' : ''} sent</span>
                {client.lastCollectionEmailAt && (
                  <span>— Last: {new Date(client.lastCollectionEmailAt).toLocaleDateString()}</span>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function Clients() {
  const { toast } = useToast();
  const { workspaceId } = useWorkspaceAccess();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [window.location.search]);
  const qb = useQBTerminology();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'deactivated'>(() => {
    return (searchParams.get('tab') as 'active' | 'deactivated') || 'active';
  });
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'active') {
      params.delete('tab');
    } else {
      params.set('tab', activeTab);
    }
    const newSearch = params.toString();
    if (newSearch !== window.location.search.replace(/^\?/, "")) {
      setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [activeTab, setLocation]);
  const emptyForm = {
    firstName: "",
    lastName: "",
    companyName: "",
    category: "other" as ClientCategory,
    email: "",
    phone: "",
    // Structured address
    address: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    // Billing
    billingEmail: "",
    notes: "",
    billableRate: "",
    serviceType: "",
    billingCycle: "monthly",
    paymentTermsDays: "",
    preferredPaymentMethod: "check",
    autoSendInvoice: true,
    // Point of Contact (on-site)
    pocName: "",
    pocTitle: "",
    pocPhone: "",
    pocEmail: "",
    // Accounts Payable Contact (for invoices)
    apContactName: "",
    apContactEmail: "",
    apContactPhone: "",
    // Post orders / standing instructions
    postOrders: "",
    // Officer requirements
    requiresArmed: false,
    armedBillRate: "",
    unarmedBillRate: "",
    minOfficerSchedulingScore: "",
    // Coverage schedule (used by Trinity autonomous scheduling)
    coverageType: "custom" as "24_7" | "business_hours" | "custom",
    coverageDays: [] as string[],
    coverageStartTime: "",
    coverageEndTime: "",
  };
  const [formData, setFormData] = useState(emptyForm);

  const orgsQuery = useQuery({
    queryKey: ['/api/organizations/managed'],
    enabled: isAuthenticated,
    queryFn: () => apiFetch('/api/organizations/managed', ClientOrgListResponse),
  });
  const {
    data: orgs,
    isError: orgsError,
    isLoading: orgsLoading,
    isEmpty: isOrgsEmpty,
  } = useAsyncData(orgsQuery, (d: any) => !d?.length);

  useEffect(() => {
    if (orgs?.length && orgs.length > 0) {
      const currentWs = user?.currentWorkspaceId;
      const matchingOrg = currentWs && (orgs ?? []).find((o: any) => o.id === currentWs);
      if (!selectedWorkspaceId || (currentWs && matchingOrg && selectedWorkspaceId !== currentWs)) {
        setSelectedWorkspaceId(matchingOrg ? matchingOrg.id : (orgs ?? [])[0].id);
      }
    }
  }, [orgs, user?.currentWorkspaceId]);

  const createMutation = useCreateClient();
  const isAnyClientMutationPending = createMutation.isPending;

  const queryKey = ['/api/clients', workspaceId];
  const { data: clients = [], isLoading: clientsLoading } = useQuery<any[]>({
    queryKey,
    enabled: isAuthenticated,
    queryFn: async () => {
      const url = workspaceId ? `/api/clients?workspaceId=${workspaceId}` : '/api/clients';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch clients');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
  });

  const filteredClients = useMemo(() => {
    return clients.filter((client: any) => {
      const name = `${client.firstName} ${client.lastName} ${client.companyName || ''}`.toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });
  }, [clients, searchQuery]);

  useEffect(() => {
    const handleOpenAddClient = () => setIsAddDialogOpen(true);
    window.addEventListener('open-add-client-dialog', handleOpenAddClient);
    return () => window.removeEventListener('open-add-client-dialog', handleOpenAddClient);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (searchQuery) {
        params.set('search', searchQuery);
      } else {
        params.delete('search');
      }
      const newSearch = params.toString();
      const current = window.location.search.replace(/^\?/, '');
      if (newSearch !== current) {
        setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  if (orgsLoading || authLoading) {
    return (
      <CanvasHubPage config={clientsPageConfig}>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (orgsError) return (
    <CanvasHubPage config={clientsPageConfig}>
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load data. Please refresh.</p>
      </div>
    </CanvasHubPage>
  );

  const isPlatformStaff = Array.isArray(orgs) && orgs.length > 0;

  const handleSubmit = () => {
    // Validate required fields
    if (!formData.firstName || !formData.lastName) {
      toast({
        title: "Validation Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email) {
      toast({
        title: "Validation Error",
        description: "Email is required for client communication",
        variant: "destructive",
      });
      return;
    }

    if (!formData.billableRate || parseFloat(formData.billableRate) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid hourly rate greater than $0",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...formData,
      billableRate: formData.billableRate ? formData.billableRate.toString() : undefined,
      workspaceId,
      isActive: true, // NEW: explicitly set to active for backend
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: `${qb.entity('client')} added successfully`,
        });
        setIsAddDialogOpen(false);
        setFormData(emptyForm);
        queryClient.invalidateQueries({ queryKey: ['/api/clients', workspaceId] });
        queryClient.invalidateQueries({ queryKey: ['/api/clients/lookup', workspaceId] });
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
          description: error.message || `Failed to create ${qb.entity('client').toLowerCase()}`,
          variant: "destructive",
        });
      },
    });
  };

  const addClientButton = (
    <UniversalModal open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <UniversalModalTrigger asChild>
        <Button data-testid="button-add-client">
          <Plus className="mr-2 h-4 w-4" />
          Add {qb.entity('client')}
        </Button>
      </UniversalModalTrigger>
    </UniversalModal>
  );

  return (
    <CanvasHubPage config={clientsPageConfig}>
      <UniversalModal open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <UniversalModalTrigger asChild>
          <span className="hidden" />
        </UniversalModalTrigger>
            <UniversalModalContent size="xl" className="max-h-[90vh] overflow-y-auto">
              <UniversalModalHeader>
                <UniversalModalTitle>Add New {qb.entity('client')}</UniversalModalTitle>
                <UniversalModalDescription>
                  Enter {qb.entity('client').toLowerCase()} contact and billing details
                </UniversalModalDescription>
              </UniversalModalHeader>
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <Input 
                      id="firstName" 
                      placeholder="Jane" 
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      data-testid="input-client-firstname" 
                      required
                      aria-required="true"
                      aria-describedby="firstName-error"
                    />
                    {(!formData.firstName && createMutation.isError) && (
                      <p id="firstName-error" className="text-xs text-destructive mt-1" role="alert">First name is required</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <Input 
                      id="lastName" 
                      placeholder="Smith" 
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      data-testid="input-client-lastname" 
                      required
                      aria-required="true"
                      aria-describedby="lastName-error"
                    />
                    {(!formData.lastName && createMutation.isError) && (
                      <p id="lastName-error" className="text-xs text-destructive mt-1" role="alert">Last name is required</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name (Optional)</Label>
                    <Input 
                      id="companyName" 
                      placeholder="Acme Inc." 
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      data-testid="input-client-company" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Site Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value as ClientCategory })}
                    >
                      <SelectTrigger id="category" data-testid="select-client-category" aria-describedby="category-error">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CLIENT_CATEGORIES).map(([key, cat]) => (
                          <SelectItem key={key} value={key}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="Enter email address" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="input-client-email" 
                      required
                      aria-required="true"
                      aria-describedby="email-error"
                    />
                    {(!formData.email && createMutation.isError) && (
                      <p id="email-error" className="text-xs text-destructive mt-1" role="alert">Email is required</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input 
                      id="phone" 
                      placeholder="Enter phone number" 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="input-client-phone" 
                    />
                  </div>
                </div>
                {/* Address */}
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address (Optional)</Label>
                  <Input
                    id="address"
                    placeholder="123 Main St"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-client-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    placeholder="Suite 400, Floor 3, etc."
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    data-testid="input-client-address2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="New York"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      data-testid="input-client-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="NY"
                      maxLength={2}
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      data-testid="input-client-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">ZIP Code</Label>
                    <Input
                      id="postalCode"
                      placeholder="10001"
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      data-testid="input-client-zip"
                    />
                  </div>
                </div>

                {/* Point of Contact Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0" />
                    Point of Contact (On-Site)
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    The person on-site who officers report to and who manages day-to-day security operations.
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="pocName">POC Full Name</Label>
                        <Input
                          id="pocName"
                          placeholder="Jane Smith"
                          value={formData.pocName}
                          onChange={(e) => setFormData({ ...formData, pocName: e.target.value })}
                          data-testid="input-client-poc-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pocTitle">POC Title / Role</Label>
                        <Input
                          id="pocTitle"
                          placeholder="Operations Manager"
                          value={formData.pocTitle}
                          onChange={(e) => setFormData({ ...formData, pocTitle: e.target.value })}
                          data-testid="input-client-poc-title"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="pocPhone">POC Phone</Label>
                        <Input
                          id="pocPhone"
                          placeholder="(555) 000-0000"
                          value={formData.pocPhone}
                          onChange={(e) => setFormData({ ...formData, pocPhone: e.target.value })}
                          data-testid="input-client-poc-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pocEmail">POC Email</Label>
                        <Input
                          id="pocEmail"
                          type="email"
                          placeholder="jane@company.com"
                          value={formData.pocEmail}
                          onChange={(e) => setFormData({ ...formData, pocEmail: e.target.value })}
                          data-testid="input-client-poc-email"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Accounts Payable Contact Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 shrink-0" />
                    Accounts Payable Contact (AP)
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    The person or department who receives and processes invoices. May differ from the primary contact.
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="apContactName">AP Contact Name</Label>
                        <Input
                          id="apContactName"
                          placeholder="Accounts Payable Dept"
                          value={formData.apContactName}
                          onChange={(e) => setFormData({ ...formData, apContactName: e.target.value })}
                          data-testid="input-client-ap-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apContactPhone">AP Phone</Label>
                        <Input
                          id="apContactPhone"
                          placeholder="(555) 000-0001"
                          value={formData.apContactPhone}
                          onChange={(e) => setFormData({ ...formData, apContactPhone: e.target.value })}
                          data-testid="input-client-ap-phone"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apContactEmail">AP Email (Invoice Delivery)</Label>
                      <Input
                        id="apContactEmail"
                        type="email"
                        placeholder="ap@company.com"
                        value={formData.apContactEmail}
                        onChange={(e) => setFormData({ ...formData, apContactEmail: e.target.value })}
                        data-testid="input-client-ap-email"
                      />
                      <p className="text-xs text-muted-foreground">Invoices will be delivered here if provided, otherwise to the primary email.</p>
                    </div>
                  </div>
                </div>

                {/* Post Orders / Standing Instructions */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 shrink-0" />
                    Post Orders &amp; Standing Instructions
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="postOrders">Post Orders</Label>
                    <Textarea
                      id="postOrders"
                      placeholder="Describe officer duties, access procedures, escalation contacts, patrol routes, and any site-specific instructions..."
                      value={formData.postOrders}
                      onChange={(e) => setFormData({ ...formData, postOrders: e.target.value })}
                      data-testid="input-client-post-orders"
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      These instructions are shown to officers in the shift detail view.
                    </p>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="notes">Internal Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Internal notes about this client (not visible to officers)..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      data-testid="input-client-notes"
                    />
                  </div>
                </div>

                {/* Billing Information Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4">
                    Billing Information
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="billableRate">Hourly Rate ($) *</Label>
                        <Input 
                          id="billableRate" 
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="75.00" 
                          value={formData.billableRate}
                          onChange={(e) => setFormData({ ...formData, billableRate: e.target.value })}
                          data-testid="input-client-rate" 
                          required
                          aria-required="true"
                          aria-describedby="billableRate-error"
                        />
                        {(parseFloat(formData.billableRate) <= 0 && createMutation.isError) && (
                          <p id="billableRate-error" className="text-xs text-destructive mt-1" role="alert">A valid hourly rate is required</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="billingCycle">Billing Cycle</Label>
                        <Select 
                          value={formData.billingCycle}
                          onValueChange={(value) => setFormData({ ...formData, billingCycle: value })}
                        >
                          <SelectTrigger id="billingCycle" data-testid="select-billing-cycle">
                            <SelectValue placeholder="Select cycle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-Weekly (Every 2 Weeks)</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="serviceType">Service Type</Label>
                      <Input 
                        id="serviceType" 
                        placeholder="e.g., Consulting, IT Support, Maintenance" 
                        value={formData.serviceType}
                        onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                        data-testid="input-client-service" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="billingEmail">Billing Email</Label>
                      <Input 
                        id="billingEmail" 
                        type="email" 
                        placeholder="Enter billing email (defaults to contact email)" 
                        value={formData.billingEmail}
                        onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
                        data-testid="input-client-billing-email" 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="paymentTermsDays">Payment Terms (Days)</Label>
                        <Input 
                          id="paymentTermsDays" 
                          type="number"
                          min="0"
                          placeholder="30" 
                          value={formData.paymentTermsDays}
                          onChange={(e) => setFormData({ ...formData, paymentTermsDays: e.target.value })}
                          data-testid="input-client-payment-terms"
                        />
                        <p className="text-xs text-muted-foreground">Days until invoice is due (overrides org default)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="preferredPaymentMethod">Preferred Payment Method</Label>
                        <Select 
                          value={formData.preferredPaymentMethod}
                          onValueChange={(value) => setFormData({ ...formData, preferredPaymentMethod: value })}
                        >
                          <SelectTrigger id="preferredPaymentMethod" data-testid="select-client-payment-method">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
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
                        <p className="text-xs text-muted-foreground">Automatically email invoices to this client on billing cycle</p>
                      </div>
                      <Switch
                        checked={formData.autoSendInvoice}
                        onCheckedChange={(v) => setFormData({ ...formData, autoSendInvoice: v })}
                        data-testid="switch-client-auto-send-invoice"
                      />
                    </div>
                  </div>
                </div>

                {/* Officer Requirements Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 shrink-0" />
                    Officer Requirements
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-md border px-3 py-3">
                      <div>
                        <p className="text-sm font-medium">Requires Armed Officers</p>
                        <p className="text-xs text-muted-foreground">This site mandates armed, licensed officers</p>
                      </div>
                      <Switch
                        checked={formData.requiresArmed}
                        onCheckedChange={(v) => setFormData({ ...formData, requiresArmed: v })}
                        data-testid="switch-client-requires-armed"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="armedBillRate" className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 shrink-0" /> Armed Bill Rate ($/hr)
                        </Label>
                        <Input
                          id="armedBillRate"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="85.00"
                          value={formData.armedBillRate}
                          onChange={(e) => setFormData({ ...formData, armedBillRate: e.target.value })}
                          data-testid="input-client-armed-rate"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unarmedBillRate" className="flex items-center gap-1">
                          <Shield className="h-3.5 w-3.5 shrink-0" /> Unarmed Bill Rate ($/hr)
                        </Label>
                        <Input
                          id="unarmedBillRate"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="65.00"
                          value={formData.unarmedBillRate}
                          onChange={(e) => setFormData({ ...formData, unarmedBillRate: e.target.value })}
                          data-testid="input-client-unarmed-rate"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="minOfficerScore" className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> Min Officer Scheduling Score (0–100)
                      </Label>
                      <Input
                        id="minOfficerScore"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="0 — accept any officer"
                        value={formData.minOfficerSchedulingScore}
                        onChange={(e) => setFormData({ ...formData, minOfficerSchedulingScore: e.target.value })}
                        data-testid="input-client-min-score"
                      />
                      <p className="text-xs text-muted-foreground">
                        Trinity will only suggest officers with a composite score above this threshold.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Coverage Schedule Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 shrink-0" />
                    Coverage Schedule
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Trinity uses this to autonomously fill open shifts for this site.
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="coverageType">Coverage Type</Label>
                      <Select
                        value={formData.coverageType}
                        onValueChange={(value) => setFormData({ ...formData, coverageType: value as "24_7" | "business_hours" | "custom" })}
                      >
                        <SelectTrigger id="coverageType" data-testid="select-client-coverage-type">
                          <SelectValue placeholder="Select coverage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24_7">24/7 (All days, all hours)</SelectItem>
                          <SelectItem value="business_hours">Business Hours (Mon–Fri, 8am–6pm)</SelectItem>
                          <SelectItem value="custom">Custom Schedule</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.coverageType === "custom" && (
                      <>
                        <div className="space-y-2">
                          <Label>Coverage Days</Label>
                          <div className="flex flex-wrap gap-2">
                            {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((day) => {
                              const isSelected = formData.coverageDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const days = isSelected
                                      ? formData.coverageDays.filter(d => d !== day)
                                      : [...formData.coverageDays, day];
                                    setFormData({ ...formData, coverageDays: days });
                                  }}
                                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover-elevate"}`}
                                  data-testid={`toggle-coverage-day-${day}`}
                                >
                                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                          <div className="space-y-2">
                            <Label htmlFor="coverageStartTime">Start Time</Label>
                            <Input
                              id="coverageStartTime"
                              type="time"
                              value={formData.coverageStartTime}
                              onChange={(e) => setFormData({ ...formData, coverageStartTime: e.target.value })}
                              data-testid="input-client-coverage-start"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="coverageEndTime">End Time</Label>
                            <Input
                              id="coverageEndTime"
                              type="time"
                              value={formData.coverageEndTime}
                              onChange={(e) => setFormData({ ...formData, coverageEndTime: e.target.value })}
                              data-testid="input-client-coverage-end"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
              <UniversalModalFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={isAnyClientMutationPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={isAnyClientMutationPending}
                  data-testid="button-save-client"
                >
                  {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {createMutation.isPending ? "Saving..." : `Save ${qb.entity('client')}`}
                </Button>
              </UniversalModalFooter>
            </UniversalModalContent>
      </UniversalModal>

      {isPlatformStaff && (
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
            <SelectTrigger className="w-full md:w-[280px]" data-testid="select-org-workspace">
              <SelectValue placeholder="Select organization..." />
            </SelectTrigger>
            <SelectContent>
              {(orgs ?? []).map((org: any) => (
                <SelectItem key={org.id} value={org.id} data-testid={`select-org-${org.id}`}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'deactivated')} className="w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <TabsList data-testid="tabs-clients">
            <TabsTrigger value="active" data-testid="tab-active-clients">Active Clients</TabsTrigger>
            <TabsTrigger value="deactivated" data-testid="tab-deactivated-clients">
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Deactivated
            </TabsTrigger>
          </TabsList>
          {activeTab === 'active' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button asChild variant="outline" data-testid="button-new-shift-proposal">
                <Link href="/proposals">
                  <FileText className="h-4 w-4 mr-2" />
                  New Shift Proposal
                </Link>
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-client-toolbar">
                <Plus className="h-4 w-4 mr-2" />
                Add {qb.entity('client')}
              </Button>
            </div>
          )}
        </div>

        {activeTab === 'active' && (
          <div className="mb-4">
            <Input
              placeholder={`Search ${qb.entity('client').toLowerCase()}s...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-client-search-page"
              className="max-w-sm"
            />
          </div>
        )}

        <TabsContent value="active">
          <ClientsTable workspaceId={isPlatformStaff ? selectedWorkspaceId : undefined} />
        </TabsContent>

        <TabsContent value="deactivated">
          <DeactivatedClientsView workspaceId={isPlatformStaff ? selectedWorkspaceId : undefined} />
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
