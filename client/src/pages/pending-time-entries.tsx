import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useClientLookup } from "@/hooks/useClients";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock, MapPin, Camera, DollarSign, Calendar, Filter, User, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface TimeEntry {
  id: string;
  workspaceId: string;
  employeeId: string;
  clientId: string | null;
  clockIn: string;
  clockOut: string | null;
  totalHours: string | null;
  hourlyRate: string | null;
  totalAmount: string | null;
  clockInLatitude: string | null;
  clockInLongitude: string | null;
  clockInAccuracy: string | null;
  clockInPhotoUrl: string | null;
  clockOutLatitude: string | null;
  clockOutLongitude: string | null;
  clockOutPhotoUrl: string | null;
  billableToClient: boolean;
  status: string;
  notes: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface PendingEntry {
  timeEntry: TimeEntry;
  employee: Employee | null;
  client: Client | null;
}

export default function PendingTimeEntries() {
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [hasGpsFilter, setHasGpsFilter] = useState<boolean | null>(null);
  const [hasPhotoFilter, setHasPhotoFilter] = useState<boolean | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<PendingEntry | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();

  // Fetch all employees for filter dropdown
  const { data: allEmployees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch all clients for filter dropdown
  const { data: allClients = [] } = useClientLookup();

  // Build query params for filters
  const queryParams = new URLSearchParams();
  if (employeeFilter) queryParams.append('employeeId', employeeFilter);
  if (clientFilter) queryParams.append('clientId', clientFilter);
  if (startDateFilter) queryParams.append('startDate', startDateFilter);
  if (endDateFilter) queryParams.append('endDate', endDateFilter);
  if (hasGpsFilter !== null) queryParams.append('hasGps', hasGpsFilter.toString());
  if (hasPhotoFilter !== null) queryParams.append('hasPhoto', hasPhotoFilter.toString());

  // Fetch pending entries with filters
  const { data: entries = [], isLoading } = useQuery<PendingEntry[]>({
    queryKey: ['/api/time-entries/pending', queryParams.toString()],
    queryFn: async () => {
      const url = `/api/time-entries/pending${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch pending entries');
      return response.json();
    },
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (timeEntryIds: string[]) => {
      return await apiRequest('/api/time-entries/bulk-approve', 'POST', { timeEntryIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/pending'] });
      toast({
        title: "Entries Approved",
        description: `Successfully approved ${data.approved || 0} time ${data.approved === 1 ? 'entry' : 'entries'}`,
      });
      setSelectedEntries(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve time entries",
        variant: "destructive",
      });
    },
  });

  // Single approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/time-entries/${id}/approve`, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/pending'] });
      toast({
        title: "Entry Approved",
        description: "Time entry has been approved successfully",
      });
      setSelectedEntry(null);
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve time entry",
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest(`/api/time-entries/${id}/reject`, 'PATCH', { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/pending'] });
      toast({
        title: "Entry Rejected",
        description: "Time entry has been rejected",
      });
      setSelectedEntry(null);
      setRejectReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject time entry",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEntries(new Set(entries.map(e => e.timeEntry.id)));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handleSelectEntry = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedEntries);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedEntries(newSelected);
  };

  const handleBulkApprove = () => {
    if (selectedEntries.size === 0) {
      toast({
        title: "No Entries Selected",
        description: "Please select at least one entry to approve",
        variant: "destructive",
      });
      return;
    }
    bulkApproveMutation.mutate(Array.from(selectedEntries));
  };

  const handleReject = () => {
    if (!selectedEntry || !rejectReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate({ id: selectedEntry.timeEntry.id, reason: rejectReason.trim() });
  };

  const calculateHours = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return 0;
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  };

  const hasGpsVerification = (entry: TimeEntry) => {
    return entry.clockInLatitude !== null && entry.clockInLongitude !== null;
  };

  const hasPhotoVerification = (entry: TimeEntry) => {
    return entry.clockInPhotoUrl !== null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allSelected = entries.length > 0 && selectedEntries.size === entries.length;
  const someSelected = selectedEntries.size > 0 && selectedEntries.size < entries.length;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
          Time Entry Approvals
        </h1>
        <p className="text-muted-foreground">
          Review and approve pending time entries before automated invoicing and payroll
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-employee">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger id="filter-employee" data-testid="select-filter-employee">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All employees</SelectItem>
                  {allEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-client">Client</Label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger id="filter-client" data-testid="select-filter-client">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All clients</SelectItem>
                  {allClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                data-testid="input-filter-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                data-testid="input-filter-end-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-verification">Verification</Label>
              <Select 
                value={hasGpsFilter === true ? 'gps' : hasPhotoFilter === true ? 'photo' : ''} 
                onValueChange={(val) => {
                  if (val === 'gps') {
                    setHasGpsFilter(true);
                    setHasPhotoFilter(null);
                  } else if (val === 'photo') {
                    setHasGpsFilter(null);
                    setHasPhotoFilter(true);
                  } else {
                    setHasGpsFilter(null);
                    setHasPhotoFilter(null);
                  }
                }}
              >
                <SelectTrigger id="filter-verification" data-testid="select-filter-verification">
                  <SelectValue placeholder="All entries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All entries</SelectItem>
                  <SelectItem value="gps">GPS verified only</SelectItem>
                  <SelectItem value="photo">Photo verified only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats & Actions Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold" data-testid="text-pending-count">
                  {entries.length}
                </span>
                <span className="text-muted-foreground">
                  pending {entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              {selectedEntries.size > 0 && (
                <Badge variant="secondary">
                  {selectedEntries.size} selected
                </Badge>
              )}
            </div>
            <Button
              onClick={handleBulkApprove}
              disabled={selectedEntries.size === 0 || bulkApproveMutation.isPending}
              data-testid="button-bulk-approve"
            >
              {bulkApproveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve Selected ({selectedEntries.size})
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground">
              There are no pending time entries to review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="bg-muted/50">
                        <th className="p-4 text-left">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleSelectAll}
                            data-testid="checkbox-select-all"
                            aria-label="Select all entries"
                          />
                        </th>
                        <th className="p-4 text-left font-semibold">Employee</th>
                        <th className="p-4 text-left font-semibold">Client</th>
                        <th className="p-4 text-left font-semibold">Clock In</th>
                        <th className="p-4 text-left font-semibold">Clock Out</th>
                        <th className="p-4 text-left font-semibold">Hours</th>
                        <th className="p-4 text-left font-semibold">Verification</th>
                        <th className="p-4 text-left font-semibold">Billable</th>
                        <th className="p-4 text-left font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const hours = entry.timeEntry.totalHours 
                          ? parseFloat(entry.timeEntry.totalHours)
                          : entry.timeEntry.clockOut 
                            ? calculateHours(entry.timeEntry.clockIn, entry.timeEntry.clockOut)
                            : 0;
                        
                        return (
                          <tr 
                            key={entry.timeEntry.id} 
                            className="border-b hover-elevate cursor-pointer"
                            onClick={() => setSelectedEntry(entry)}
                            data-testid={`row-entry-${entry.timeEntry.id}`}
                          >
                            <td className="p-4" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedEntries.has(entry.timeEntry.id)}
                                onCheckedChange={(checked) => 
                                  handleSelectEntry(entry.timeEntry.id, checked as boolean)
                                }
                                data-testid={`checkbox-entry-${entry.timeEntry.id}`}
                                aria-label={`Select entry for ${entry.employee?.firstName} ${entry.employee?.lastName}`}
                              />
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">
                                  {entry.employee?.firstName} {entry.employee?.lastName}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              {entry.client ? (
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span>{entry.client.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-4 text-sm">
                              {format(new Date(entry.timeEntry.clockIn), 'MMM d, h:mm a')}
                            </td>
                            <td className="p-4 text-sm">
                              {entry.timeEntry.clockOut 
                                ? format(new Date(entry.timeEntry.clockOut), 'MMM d, h:mm a')
                                : <Badge variant="secondary">In Progress</Badge>
                              }
                            </td>
                            <td className="p-4">
                              <span className="font-semibold">
                                {hours.toFixed(2)}h
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                {hasGpsVerification(entry.timeEntry) && (
                                  <Badge variant="secondary" className="gap-1">
                                    <MapPin className="h-3 w-3" />
                                    GPS
                                  </Badge>
                                )}
                                {hasPhotoVerification(entry.timeEntry) && (
                                  <Badge variant="secondary" className="gap-1">
                                    <Camera className="h-3 w-3" />
                                    Photo
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              {entry.timeEntry.billableToClient ? (
                                <Badge variant="default" className="gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  Billable
                                </Badge>
                              ) : (
                                <Badge variant="outline">Non-billable</Badge>
                              )}
                            </td>
                            <td className="p-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => approveMutation.mutate(entry.timeEntry.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-${entry.timeEntry.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setSelectedEntry(entry)}
                                  data-testid={`button-reject-${entry.timeEntry.id}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {entries.map((entry) => {
              const hours = entry.timeEntry.totalHours 
                ? parseFloat(entry.timeEntry.totalHours)
                : entry.timeEntry.clockOut 
                  ? calculateHours(entry.timeEntry.clockIn, entry.timeEntry.clockOut)
                  : 0;
              
              return (
                <Card key={entry.timeEntry.id} className="hover-elevate">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1">
                        <Checkbox
                          checked={selectedEntries.has(entry.timeEntry.id)}
                          onCheckedChange={(checked) => 
                            handleSelectEntry(entry.timeEntry.id, checked as boolean)
                          }
                          data-testid={`checkbox-entry-mobile-${entry.timeEntry.id}`}
                          aria-label={`Select entry for ${entry.employee?.firstName} ${entry.employee?.lastName}`}
                        />
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base">
                            {entry.employee?.firstName} {entry.employee?.lastName}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {entry.client?.name || 'No client'}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {hours.toFixed(1)}h
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Clock In</p>
                        <p className="font-medium">
                          {format(new Date(entry.timeEntry.clockIn), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Clock Out</p>
                        <p className="font-medium">
                          {entry.timeEntry.clockOut 
                            ? format(new Date(entry.timeEntry.clockOut), 'h:mm a')
                            : '—'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hasGpsVerification(entry.timeEntry) && (
                        <Badge variant="secondary" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          GPS
                        </Badge>
                      )}
                      {hasPhotoVerification(entry.timeEntry) && (
                        <Badge variant="secondary" className="gap-1">
                          <Camera className="h-3 w-3" />
                          Photo
                        </Badge>
                      )}
                      {entry.timeEntry.billableToClient && (
                        <Badge variant="default" className="gap-1">
                          <DollarSign className="h-3 w-3" />
                          Billable
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() => approveMutation.mutate(entry.timeEntry.id)}
                        disabled={approveMutation.isPending}
                        data-testid={`button-approve-mobile-${entry.timeEntry.id}`}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setSelectedEntry(entry)}
                        data-testid={`button-reject-mobile-${entry.timeEntry.id}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Reject Drawer */}
      <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Reject Time Entry</SheetTitle>
            <SheetDescription>
              Provide a reason for rejecting this time entry
            </SheetDescription>
          </SheetHeader>
          {selectedEntry && (
            <div className="space-y-4 mt-6">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p className="font-semibold">
                  {selectedEntry.employee?.firstName} {selectedEntry.employee?.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedEntry.timeEntry.clockIn), 'MMMM d, yyyy \'at\' h:mm a')}
                </p>
                {selectedEntry.client && (
                  <p className="text-sm">
                    Client: {selectedEntry.client.name}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Rejection Reason</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Explain why this time entry is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  data-testid="input-reject-reason"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  data-testid="button-confirm-reject"
                  className="flex-1"
                >
                  {rejectMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Confirm Rejection
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedEntry(null);
                    setRejectReason("");
                  }}
                  disabled={rejectMutation.isPending}
                  data-testid="button-cancel-reject"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
