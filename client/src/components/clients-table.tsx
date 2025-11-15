import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useClientsTable, useDeleteClient } from "@/hooks/useClients";
import { useToast } from "@/hooks/use-toast";
import { useEmployee } from "@/hooks/useEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Edit2, Trash2, FileText, Mail, Phone, Building2, Calendar, DollarSign } from "lucide-react";
import type { ClientWithInvoiceCount } from "@shared/types";

interface ClientsTableToolbarProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  status: 'all' | 'active' | 'inactive';
  onStatusChange: (value: 'all' | 'active' | 'inactive') => void;
  sort: 'createdAt' | 'firstName' | 'lastName' | 'companyName';
  onSortChange: (value: 'createdAt' | 'firstName' | 'lastName' | 'companyName') => void;
  order: 'asc' | 'desc';
  onOrderChange: (value: 'asc' | 'desc') => void;
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
}: ClientsTableToolbarProps) {
  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
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
          <SelectTrigger data-testid="select-status-filter" className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger data-testid="select-sort-column" className="w-full sm:w-[180px]">
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
  canEdit: boolean;
  canDelete: boolean;
}

function MobileClientCard({ client, onEdit, onDelete, canEdit, canDelete }: MobileClientCardProps) {
  return (
    <Card data-testid={`card-client-${client.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {client.firstName} {client.lastName}
            </CardTitle>
            {client.companyName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Building2 className="h-4 w-4" />
                {client.companyName}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={client.isActive ? "default" : "secondary"}>
              {client.isActive ? 'Active' : 'Inactive'}
            </Badge>
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
                  {canDelete && (
                    <DropdownMenuItem
                      onClick={() => onDelete(client)}
                      className="text-destructive"
                      data-testid={`button-delete-${client.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
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
        <div className="flex items-center justify-between pt-2 border-t">
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

export function ClientsTable() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { employee } = useEmployee();
  const [location, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithInvoiceCount | null>(null);

  const params = {
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 50,
    search: searchParams.get('search') || '',
    status: (searchParams.get('status') as 'all' | 'active' | 'inactive') || 'all',
    sort: (searchParams.get('sort') as 'createdAt' | 'firstName' | 'lastName' | 'companyName') || 'createdAt',
    order: (searchParams.get('order') as 'asc' | 'desc') || 'desc',
  };

  const { data, isLoading } = useClientsTable(params);
  const deleteMutation = useDeleteClient();

  const canEdit = employee?.role === 'owner' || employee?.role === 'manager';
  const canDelete = employee?.role === 'owner';

  // Sync searchInput from URL for deep linking / browser navigation
  // Only update if different to avoid triggering unnecessary debounce
  useEffect(() => {
    const urlSearch = params.search;
    if (searchInput !== urlSearch) {
      setSearchInput(urlSearch);
    }
  }, [params.search]);

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
    // TODO: Implement edit dialog
    toast({
      title: "Coming soon",
      description: "Edit functionality will be implemented",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const clients = data?.data || [];
  const total = data?.total || 0;
  const pageCount = data?.pageCount || 0;
  const currentPage = data?.page || 1;

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
      />

      {isMobile ? (
        <div className="grid gap-4">
          {clients.map(client => (
            <MobileClientCard
              key={client.id}
              client={client}
              onEdit={handleEdit}
              onDelete={(client) => {
                setClientToDelete(client);
                setDeleteDialogOpen(true);
              }}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      ) : (
        <div className={isLoading && data ? 'opacity-50' : ''}>
          <ScrollArea className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead>Status</TableHead>
                  {(canEdit || canDelete) && <TableHead className="w-[70px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map(client => (
                  <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                    <TableCell className="font-medium">
                      {client.firstName} {client.lastName}
                    </TableCell>
                    <TableCell>{client.companyName || '-'}</TableCell>
                    <TableCell>
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="hover:underline">
                          {client.email}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} className="hover:underline">
                          {client.phone}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" data-testid={`badge-invoice-count-${client.id}`}>
                        {client.invoiceCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(client.createdAt!).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? "default" : "secondary"}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-menu-${client.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEdit(client)} data-testid={`button-edit-${client.id}`}>
                                <Edit2 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
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
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
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
    </div>
  );
}
