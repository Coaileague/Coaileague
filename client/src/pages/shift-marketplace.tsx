import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, parseISO, differenceInHours, isPast } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { secureFetch } from '@/lib/csrf';
import { useToast } from '@/hooks/use-toast';
import { useEmployee } from '@/hooks/useEmployee';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { useAuth } from '@/hooks/useAuth';
import { isSupervisorOrAbove } from '@/lib/roleHierarchy';
import { useClientLookup } from '@/hooks/useClients';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  UniversalModal, UniversalModalHeader, UniversalModalTitle,
  UniversalModalFooter, UniversalModalDescription, UniversalModalContent
} from '@/components/ui/universal-modal';
import {
  ShoppingCart, ArrowRightLeft, ClipboardList, Clock,
  MapPin, User, Calendar, Filter, Search, CheckCircle,
  XCircle, Hand, Briefcase, ShoppingBag, Plus, DollarSign,
  CalendarDays, Zap, AlertTriangle
} from 'lucide-react';
import { UniversalEmptyState } from "@/components/universal";
import type { Shift, Employee, Client } from '@shared/schema';

const pageConfig: CanvasPageConfig = {
  id: 'shift-marketplace',
  title: 'Shift Marketplace',
  subtitle: 'Open shifts, swap requests, and coverage pool — all in one place',
  category: 'operations',
  withBottomNav: true,
};

type SwapRequest = {
  id: string;
  shiftId: string;
  requestingEmployeeId: string;
  targetEmployeeId?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  responseMessage?: string | null;
  createdAt?: string;
  shift?: Shift;
  requestingEmployee?: Employee;
  targetEmployee?: Employee;
  aiSuggestedEmployees?: any[];
};

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'approved': return 'default';
    case 'rejected': return 'destructive';
    case 'cancelled': return 'secondary';
    default: return 'outline';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'cancelled': return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
    case 'expired': return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
  }
}

function formatShiftTime(startTime: string | Date, endTime: string | Date): string {
  const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const end = typeof endTime === 'string' ? parseISO(endTime) : endTime;
  return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
}

function formatShiftDate(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  return format(date, 'EEE, MMM d');
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}

function fmtTime(t: string | null) {
  if (!t) return "—";
  return t.slice(0, 5);
}

function getUrgencyBadge(shiftDate: string | null, shiftStart: string | null) {
  if (!shiftDate || !shiftStart) return null;
  try {
    const dt = new Date(`${shiftDate}T${shiftStart}`);
    if (isPast(dt)) return null;
    const hrs = differenceInHours(dt, new Date());
    if (hrs <= 2) return { label: `Fills in ${hrs < 1 ? "<1h" : hrs + "h"}`, variant: "destructive" as const };
    if (hrs <= 8) return { label: `${hrs}h away`, variant: "default" as const };
    if (hrs <= 24) return { label: "Today", variant: "secondary" as const };
    return null;
  } catch { return null; }
}

const COVERAGE_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  claimed: "secondary",
  approved: "secondary",
  expired: "outline",
  cancelled: "destructive",
};

function ShiftCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-24 mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function OpenShiftsTab({ shifts, clients, employees, isLoading }: {
  shifts: Shift[];
  clients: Client[];
  employees: Employee[];
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');

  const openShifts = useMemo(() => shifts.filter(s => !s.employeeId), [shifts]);

  const filteredShifts = useMemo(() => {
    return openShifts.filter(shift => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const title = (shift.title || '').toLowerCase();
        const desc = (shift.description || '').toLowerCase();
        const client = clients.find(c => c.id === shift.clientId);
        const clientName = (client?.companyName || '').toLowerCase();
        if (!title.includes(query) && !desc.includes(query) && !clientName.includes(query)) return false;
      }
      if (positionFilter !== 'all') {
        if ((shift.title || '').toLowerCase() !== positionFilter.toLowerCase()) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [openShifts, searchQuery, positionFilter, clients]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    openShifts.forEach(s => { if (s.title) set.add(s.title); });
    return Array.from(set);
  }, [openShifts]);

  const pickupMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await apiRequest('POST', `/api/shifts/${shiftId}/pickup`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Shift picked up successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to pick up shift', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => <ShiftCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search shifts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-shifts"
          />
        </div>
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-position-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {positions.map(pos => (
              <SelectItem key={pos} value={pos}>{pos}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredShifts.length === 0 ? (
        <UniversalEmptyState
          icon={<ShoppingCart size={32} />}
          title="No Open Shifts"
          description="There are no open shifts available right now. Check back later for new opportunities."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredShifts.map(shift => {
            const client = clients.find(c => c.id === shift.clientId);
            return (
              <Card key={shift.id} data-testid={`card-open-shift-${shift.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                    <Badge variant="outline" className="text-xs" data-testid={`badge-shift-position-${shift.id}`}>
                      <Briefcase className="h-3 w-3 mr-1" />
                      {shift.title || 'Open Shift'}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {shift.category || 'General'}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span data-testid={`text-shift-date-${shift.id}`}>{formatShiftDate(shift.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span data-testid={`text-shift-time-${shift.id}`}>{formatShiftTime(shift.startTime, shift.endTime)}</span>
                    </div>
                    {client && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span data-testid={`text-shift-client-${shift.id}`}>{client.companyName}</span>
                      </div>
                    )}
                    {shift.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{shift.description}</p>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-end gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => pickupMutation.mutate(shift.id)}
                    disabled={pickupMutation.isPending || !currentEmployee?.id}
                    data-testid={`button-pickup-shift-${shift.id}`}
                  >
                    <Hand className="h-4 w-4 mr-1" />
                    Pick Up
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SwapBoardTab({ isLoading: shiftsLoading }: { isLoading: boolean }) {
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();
  const { workspaceRole } = useWorkspaceAccess();

  const isManager = useMemo(() => isSupervisorOrAbove(workspaceRole), [workspaceRole]);

  const { data: swapData, isLoading: swapsLoading } = useQuery({
    queryKey: ['/api/scheduling/swap-requests'],
    queryFn: async () => {
      const res = await secureFetch('/api/scheduling/swap-requests');
      if (!res.ok) throw new Error('Failed to fetch swap requests');
      return res.json();
    },
  });

  const swapRequests: SwapRequest[] = (swapData as any)?.requests || [];

  const approveMutation = useMutation({
    mutationFn: async (swapId: string) => {
      const res = await apiRequest('POST', `/api/scheduling/swap-requests/${swapId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Swap request approved' });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (swapId: string) => {
      const res = await apiRequest('POST', `/api/scheduling/swap-requests/${swapId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Swap request rejected' });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to reject', description: error.message, variant: 'destructive' });
    },
  });

  const isLoading = shiftsLoading || swapsLoading;

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => <ShiftCardSkeleton key={i} />)}
      </div>
    );
  }

  const activeSwaps = swapRequests.filter(r => r.status === 'pending');

  if (activeSwaps.length === 0) {
    return (
      <UniversalEmptyState
        icon={<ArrowRightLeft size={32} />}
        title="No Swap Requests"
        description="No active shift swap requests at the moment. Employees can request swaps from their schedule view."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {activeSwaps.map(swap => {
        const requesterName = swap.requestingEmployee
          ? `${swap.requestingEmployee.firstName} ${swap.requestingEmployee.lastName}`
          : 'Unknown Employee';

        return (
          <Card key={swap.id} data-testid={`card-swap-request-${swap.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm" data-testid={`text-swap-requester-${swap.id}`}>{requesterName}</span>
                </div>
                <Badge size="sm" className={getStatusColor(swap.status)} data-testid={`badge-swap-status-${swap.id}`}>
                  {swap.status}
                </Badge>
              </div>
              {swap.shift && (
                <div className="space-y-1.5 text-sm mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatShiftDate(swap.shift.startTime)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatShiftTime(swap.shift.startTime, swap.shift.endTime)}</span>
                  </div>
                  {swap.shift.title && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      <span>{swap.shift.title}</span>
                    </div>
                  )}
                </div>
              )}
              {swap.reason && (
                <p className="text-xs text-muted-foreground border-t pt-2 mt-2" data-testid={`text-swap-reason-${swap.id}`}>
                  {swap.reason}
                </p>
              )}
            </CardContent>
            {isManager && swap.status === 'pending' && (
              <CardFooter className="p-4 pt-0 flex justify-end gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectMutation.mutate(swap.id)}
                  disabled={rejectMutation.isPending}
                  data-testid={`button-reject-swap-${swap.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(swap.id)}
                  disabled={approveMutation.isPending}
                  data-testid={`button-approve-swap-${swap.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function MyRequestsTab() {
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();

  const { data: swapData, isLoading } = useQuery({
    queryKey: ['/api/scheduling/swap-requests', 'my'],
    queryFn: async () => {
      const res = await secureFetch('/api/scheduling/swap-requests');
      if (!res.ok) throw new Error('Failed to fetch swap requests');
      return res.json();
    },
  });

  const allRequests: SwapRequest[] = (swapData as any)?.requests || [];

  const myRequests = useMemo(() => {
    if (!currentEmployee?.id) return [];
    return allRequests.filter(r => r.requestingEmployeeId === currentEmployee.id);
  }, [allRequests, currentEmployee?.id]);

  const cancelMutation = useMutation({
    mutationFn: async (swapId: string) => {
      const res = await apiRequest('POST', `/api/scheduling/swap-requests/${swapId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Request cancelled' });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to cancel request', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => <ShiftCardSkeleton key={i} />)}
      </div>
    );
  }

  if (myRequests.length === 0) {
    return (
      <UniversalEmptyState
        icon={<ClipboardList size={32} />}
        title="No Requests"
        description="You haven't made any swap requests yet. Request a shift swap from the schedule view."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {myRequests.map(request => (
        <Card key={request.id} data-testid={`card-my-request-${request.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <span className="font-medium text-sm">Swap Request</span>
              <Badge size="sm" className={getStatusColor(request.status)} data-testid={`badge-request-status-${request.id}`}>
                {request.status}
              </Badge>
            </div>
            {request.shift && (
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatShiftDate(request.shift.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatShiftTime(request.shift.startTime, request.shift.endTime)}</span>
                </div>
                {request.shift.title && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    <span>{request.shift.title}</span>
                  </div>
                )}
              </div>
            )}
            {request.reason && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">{request.reason}</p>
            )}
            {request.responseMessage && (
              <div className="mt-2 p-2 rounded-md bg-muted text-xs">
                <span className="font-medium">Response:</span> {request.responseMessage}
              </div>
            )}
            {request.createdAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Requested {formatShiftDate(request.createdAt)}
              </p>
            )}
          </CardContent>
          {request.status === 'pending' && (
            <CardFooter className="p-4 pt-0 flex justify-end gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelMutation.mutate(request.id)}
                disabled={cancelMutation.isPending}
                data-testid={`button-cancel-request-${request.id}`}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </CardFooter>
          )}
        </Card>
      ))}
    </div>
  );
}

function CoveragePoolTab() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId;
  const { toast } = useToast();
  const [showPost, setShowPost] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [confirmClaim, setConfirmClaim] = useState<any>(null);
  const [form, setForm] = useState({
    siteName: "", shiftDate: "", shiftStart: "", shiftEnd: "", payRate: "", notes: "",
  });

  const { data: coverageData, isLoading } = useQuery<any>({
    queryKey: ["/api/coverage-marketplace", workspaceId, statusFilter],
    enabled: !!workspaceId,
    queryFn: () =>
      fetch(`/api/coverage-marketplace?workspaceId=${workspaceId}&status=${statusFilter}`, {
        credentials: 'include',
      }).then(r => r.json()),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/coverage-marketplace"] });
  }

  const postShift = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/coverage-marketplace", { ...data, workspaceId }),
    onSuccess: () => {
      invalidate();
      setShowPost(false);
      setForm({ siteName: "", shiftDate: "", shiftStart: "", shiftEnd: "", payRate: "", notes: "" });
      toast({ title: "Shift posted to coverage pool" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const claimShift = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/coverage-marketplace/${id}/claim`, {
        workspaceId,
        claimedByEmployeeId: user?.id,
        claimedByName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Shift claimed successfully" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveShift = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/coverage-marketplace/${id}/approve`, {
        workspaceId,
        approvedBy: user?.id,
      }),
    onSuccess: () => { invalidate(); toast({ title: "Claim approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const list: any[] = coverageData?.shifts || [];

  const stats = [
    { label: "Open", value: list.filter(s => s.status === "open").length, icon: ShoppingBag },
    { label: "Claimed", value: list.filter(s => s.status === "claimed").length, icon: CheckCircle },
    { label: "Approved", value: list.filter(s => s.status === "approved").length, icon: CheckCircle },
    { label: "Total", value: list.length, icon: CalendarDays },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Post ad-hoc coverage needs — officers claim, managers approve.
        </p>
        <Button data-testid="button-post-new-shift" onClick={() => setShowPost(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Post shift
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["open", "claimed", "approved", "expired"].map(s => (
          <Button
            key={s}
            data-testid={`coverage-filter-${s}`}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <ShiftCardSkeleton key={i} />)}
        </div>
      ) : list.length === 0 ? (
        <UniversalEmptyState
          icon={<ShoppingBag size={32} />}
          title={`No ${statusFilter} coverage shifts`}
          description="Post a shift to the coverage pool so officers can claim it."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((shift: any) => (
            <Card key={shift.id} data-testid={`card-coverage-${shift.id}`}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    {shift.site_name || "Unknown site"}
                    {(() => {
                      const u = getUrgencyBadge(shift.shift_date, shift.shift_start);
                      return u ? (
                        <Badge variant={u.variant} className="text-[10px] px-1.5 py-0">
                          <Zap className="w-2.5 h-2.5 mr-0.5 inline" />{u.label}
                        </Badge>
                      ) : null;
                    })()}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                    <CalendarDays className="w-3 h-3" />
                    {fmtDate(shift.shift_date)}
                    {" · "}
                    <Clock className="w-3 h-3 ml-1" />
                    {fmtTime(shift.shift_start)} – {fmtTime(shift.shift_end)}
                  </p>
                </div>
                <Badge variant={COVERAGE_STATUS_VARIANT[shift.status] || "outline"} className="shrink-0">
                  {shift.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {shift.pay_rate && (
                  <p className="text-sm flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">${Number(shift.pay_rate).toFixed(2)}/hr</span>
                  </p>
                )}
                {shift.notes && <p className="text-sm text-muted-foreground">{shift.notes}</p>}
                {shift.claimed_by_name && (
                  <p className="text-xs text-muted-foreground">
                    Claimed by: <span className="font-medium">{shift.claimed_by_name}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Expires: {fmtDate(shift.post_expires_at)}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {shift.status === "open" && (
                    <Button
                      size="sm"
                      data-testid={`button-claim-${shift.id}`}
                      disabled={claimShift.isPending}
                      onClick={() => setConfirmClaim(shift)}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Claim shift
                    </Button>
                  )}
                  {shift.status === "claimed" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`button-approve-coverage-${shift.id}`}
                      disabled={approveShift.isPending}
                      onClick={() => approveShift.mutate(shift.id)}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approve claim
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UniversalModal open={showPost} onOpenChange={setShowPost}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Post coverage shift</UniversalModalTitle>
          </UniversalModalHeader>
          <div className="space-y-3">
            <Input
              data-testid="input-site-name"
              placeholder="Site / location name"
              value={form.siteName}
              onChange={e => setForm(p => ({ ...p, siteName: e.target.value }))}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Shift date</label>
                <Input
                  type="date"
                  data-testid="input-shift-date"
                  value={form.shiftDate}
                  onChange={e => setForm(p => ({ ...p, shiftDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Start time</label>
                <Input
                  type="time"
                  data-testid="input-shift-start"
                  value={form.shiftStart}
                  onChange={e => setForm(p => ({ ...p, shiftStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End time</label>
                <Input
                  type="time"
                  data-testid="input-shift-end"
                  value={form.shiftEnd}
                  onChange={e => setForm(p => ({ ...p, shiftEnd: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pay rate ($/hr)</label>
              <Input
                type="number"
                placeholder="0.00"
                data-testid="input-pay-rate"
                value={form.payRate}
                onChange={e => setForm(p => ({ ...p, payRate: e.target.value }))}
              />
            </div>
            <Textarea
              placeholder="Notes or special requirements..."
              data-testid="input-coverage-notes"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => setShowPost(false)}>Cancel</Button>
              <Button
                data-testid="button-post-shift"
                disabled={postShift.isPending}
                onClick={() => postShift.mutate({ ...form, payRate: form.payRate ? Number(form.payRate) : null })}
              >
                {postShift.isPending ? "Posting..." : "Post shift"}
              </Button>
            </UniversalModalFooter>
          </div>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!confirmClaim} onOpenChange={v => !v && setConfirmClaim(null)}>
        <UniversalModalContent className="max-w-sm">
          <UniversalModalHeader>
            <UniversalModalTitle>Confirm shift claim</UniversalModalTitle>
            <UniversalModalDescription>
              You are claiming this shift. Once confirmed, the manager will be notified for approval.
            </UniversalModalDescription>
          </UniversalModalHeader>
          {confirmClaim && (
            <div className="space-y-2 text-sm rounded-md bg-muted/40 border p-3">
              <div className="flex items-center gap-2 font-medium">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                {confirmClaim.site_name || "Unknown site"}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
                {fmtDate(confirmClaim.shift_date)}
                <Clock className="w-3.5 h-3.5 ml-1" />
                {fmtTime(confirmClaim.shift_start)} – {fmtTime(confirmClaim.shift_end)}
              </div>
              {confirmClaim.pay_rate && (
                <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                  <DollarSign className="w-3.5 h-3.5" />
                  ${Number(confirmClaim.pay_rate).toFixed(2)}/hr
                </div>
              )}
            </div>
          )}
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setConfirmClaim(null)}>Cancel</Button>
            <Button
              data-testid="button-confirm-claim"
              disabled={claimShift.isPending}
              onClick={() => { claimShift.mutate(confirmClaim.id); setConfirmClaim(null); }}
            >
              {claimShift.isPending ? "Claiming…" : "Confirm claim"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );
}

export default function ShiftMarketplace() {
  const [activeTab, setActiveTab] = useState('open-shifts');

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<{ data: Shift[] }, Error, Shift[]>({
    queryKey: ['/api/shifts'],
    select: (res) => res?.data ?? [],
  });

  const { data: clients = [] } = useClientLookup();

  const { data: employees = [] } = useQuery<{ data: Employee[] }, Error, Employee[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
  });

  const openShiftCount = useMemo(() => shifts.filter(s => !s.employeeId).length, [shifts]);

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="page-shift-marketplace">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4" data-testid="tabs-marketplace">
            <TabsTrigger value="open-shifts" data-testid="tab-open-shifts" className="gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Open Shifts</span>
              <span className="sm:hidden">Open</span>
              {openShiftCount > 0 && (
                <Badge size="sm" variant="secondary" className="ml-1" data-testid="badge-open-count">
                  {openShiftCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="coverage-pool" data-testid="tab-coverage-pool" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Coverage Pool</span>
              <span className="sm:hidden">Coverage</span>
            </TabsTrigger>
            <TabsTrigger value="swap-board" data-testid="tab-swap-board" className="gap-1.5">
              <ArrowRightLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Swap Board</span>
              <span className="sm:hidden">Swaps</span>
            </TabsTrigger>
            <TabsTrigger value="my-requests" data-testid="tab-my-requests" className="gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">My Requests</span>
              <span className="sm:hidden">Mine</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open-shifts" className="mt-4">
            <OpenShiftsTab
              shifts={shifts}
              clients={clients}
              employees={employees}
              isLoading={shiftsLoading}
            />
          </TabsContent>

          <TabsContent value="coverage-pool" className="mt-4">
            <CoveragePoolTab />
          </TabsContent>

          <TabsContent value="swap-board" className="mt-4">
            <SwapBoardTab isLoading={shiftsLoading} />
          </TabsContent>

          <TabsContent value="my-requests" className="mt-4">
            <MyRequestsTab />
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
