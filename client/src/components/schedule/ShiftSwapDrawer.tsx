/**
 * ShiftSwapDrawer - Component for requesting, viewing, and managing shift swaps
 * Mobile-first design with professional UI
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { LogoMark } from '@/components/ui/coaileague-logo-mark';
import {
  Repeat2,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowRightLeft,
  X,
  Calendar,
} from 'lucide-react';
import type { Shift, Employee, ShiftSwapRequest } from '@shared/schema';

interface ShiftSwapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  employees: Employee[];
  currentUserId?: string;
  isManager?: boolean;
}

export function ShiftSwapDrawer({
  open,
  onOpenChange,
  shift,
  employees,
  currentUserId,
  isManager = false,
}: ShiftSwapDrawerProps) {
  const { toast } = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState('request');

  const { data: swapRequests = [], isLoading: loadingRequests } = useQuery<ShiftSwapRequest[]>({
    queryKey: ['/api/scheduling/swap-requests'],
    enabled: open,
    select: (data: any): ShiftSwapRequest[] => Array.isArray(data) ? data : (data?.requests || []),
  });

  const requestSwapMutation = useMutation({
    mutationFn: async (data: { shiftId: string; targetEmployeeId: string; notes?: string }) => {
      const response = await apiRequest('POST', `/api/scheduling/swap-requests`, {
        shiftId: data.shiftId,           // REQUIRED: tells backend which shift to swap
        targetEmployeeId: data.targetEmployeeId,
        reason: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Swap Requested',
        description: 'Your shift swap request has been submitted.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
      setSelectedEmployeeId('');
      setNotes('');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Request Failed',
        description: error.message || 'Failed to submit swap request.',
        variant: 'destructive',
      });
    },
  });

  const approveSwapMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest('POST', `/api/scheduling/swap-requests/${requestId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Swap Approved',
        description: 'The shift swap has been approved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Approval Failed',
        description: error.message || 'Failed to approve swap request.',
        variant: 'destructive',
      });
    },
  });

  const rejectSwapMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const response = await apiRequest('POST', `/api/scheduling/swap-requests/${requestId}/reject`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Swap Rejected',
        description: 'The shift swap has been rejected.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Rejection Failed',
        description: error.message || 'Failed to reject swap request.',
        variant: 'destructive',
      });
    },
  });

  const cancelSwapMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest('POST', `/api/scheduling/swap-requests/${requestId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Request Cancelled',
        description: 'Your swap request has been cancelled.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/swap-requests'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cancellation Failed',
        description: error.message || 'Failed to cancel swap request.',
        variant: 'destructive',
      });
    },
  });

  const handleRequestSwap = () => {
    if (!shift || !selectedEmployeeId) return;
    requestSwapMutation.mutate({
      shiftId: shift.id,
      targetEmployeeId: selectedEmployeeId,
      notes: notes || undefined,
    });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/15 text-red-600 border-red-500/30">Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-slate-500/15 text-slate-600 border-slate-500/30">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingRequests = swapRequests?.filter(r => r.status === 'pending') || [];
  const historyRequests = swapRequests?.filter(r => r.status !== 'pending') || [];

  const otherEmployees = employees.filter(e => e.id !== shift?.employeeId);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[100dvh] focus:outline-none">
        <div data-vaul-no-drag className="mx-auto w-full max-w-md flex flex-col max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          <DrawerHeader className="pb-2 pt-3 px-4 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <ArrowRightLeft className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <DrawerTitle className="text-base font-semibold">
                    Shift Swap
                  </DrawerTitle>
                  <p className="text-xs text-muted-foreground">
                    Request or manage shift swaps
                  </p>
                </div>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-3 h-9 sticky top-0 z-10 bg-background">
                <TabsTrigger value="request" className="text-xs" data-testid="tab-request">
                  Request
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-xs" data-testid="tab-pending">
                  Pending
                  {pendingRequests.length > 0 && (
                    <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                      {pendingRequests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs" data-testid="tab-history">
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="request" className="mt-3">
                {shift ? (
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Selected Shift</div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{shift.title || 'Shift'}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="truncate">{format(new Date(shift.startTime), 'EEE, MMM d')}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium">
                            {format(new Date(shift.startTime), 'h:mm a')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            to {format(new Date(shift.endTime), 'h:mm a')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Swap With</Label>
                      <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                        <SelectTrigger className="h-11" data-testid="select-swap-employee">
                          <SelectValue placeholder="Select employee..." />
                        </SelectTrigger>
                        <SelectContent>
                          {otherEmployees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
                                    {getInitials(`${employee.firstName} ${employee.lastName}`)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{employee.firstName} {employee.lastName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Reason (Optional)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Why do you need to swap this shift?"
                        rows={2}
                        className="text-sm resize-none"
                        data-testid="input-swap-notes"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Select a shift to request a swap</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pending" className="mt-3">
                {loadingRequests ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No pending swap requests</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((request) => (
                      <SwapRequestCard
                        key={request.id}
                        request={request}
                        employees={employees}
                        isManager={isManager}
                        currentUserId={currentUserId}
                        onApprove={() => approveSwapMutation.mutate(request.id)}
                        onReject={() => rejectSwapMutation.mutate({ requestId: request.id })}
                        onCancel={() => cancelSwapMutation.mutate(request.id)}
                        isLoading={approveSwapMutation.isPending || rejectSwapMutation.isPending || cancelSwapMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                {loadingRequests ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : historyRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Repeat2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No swap history</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyRequests.map((request) => (
                      <SwapRequestCard
                        key={request.id}
                        request={request}
                        employees={employees}
                        isManager={isManager}
                        currentUserId={currentUserId}
                        showActions={false}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {activeTab === 'request' && shift && (
            <DrawerFooter className="px-4 pt-3 pb-4 shrink-0 border-t">
              <div className="flex gap-2">
                <DrawerClose asChild>
                  <Button variant="outline" className="flex-1" data-testid="button-cancel-swap">
                    Cancel
                  </Button>
                </DrawerClose>
                <Button
                  className="flex-1"
                  onClick={handleRequestSwap}
                  disabled={!selectedEmployeeId || requestSwapMutation.isPending}
                  data-testid="button-submit-swap"
                >
                  {requestSwapMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                  )}
                  Request Swap
                </Button>
              </div>
            </DrawerFooter>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface SwapRequestCardProps {
  request: ShiftSwapRequest;
  employees: Employee[];
  isManager: boolean;
  currentUserId?: string;
  showActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

function SwapRequestCard({
  request,
  employees,
  isManager,
  currentUserId,
  showActions = true,
  onApprove,
  onReject,
  onCancel,
  isLoading,
}: SwapRequestCardProps) {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const requestingEmployee = employees.find(e => e.id === request.requestingEmployeeId);
  const targetEmployee = employees.find(e => e.id === request.targetEmployeeId);
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const isOwnRequest = request.requestingEmployeeId === currentUserId;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-slate-500/15 text-slate-600 border-slate-500/30 text-xs">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="bg-muted/30 rounded-lg p-3 border" data-testid={`swap-request-${request.id}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Repeat2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(new Date(request.requesterId), 'MMM d, h:mm a')}
          </span>
        </div>
        {getStatusBadge(request.status)}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
              {requestingEmployee ? getInitials(`${requestingEmployee.firstName} ${requestingEmployee.lastName}`) : '??'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate">
            {requestingEmployee ? `${requestingEmployee.firstName} ${requestingEmployee.lastName}` : 'Unknown'}
          </span>
        </div>

        <ArrowRightLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-sm font-medium truncate text-right">
            {targetEmployee ? `${targetEmployee.firstName} ${targetEmployee.lastName}` : 'Unknown'}
          </span>
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-muted-foreground/20">
              {targetEmployee ? getInitials(`${targetEmployee.firstName} ${targetEmployee.lastName}`) : '??'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      // @ts-ignore — TS migration: fix in refactoring sprint
      {(request as any).notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          // @ts-ignore — TS migration: fix in refactoring sprint
          "{(request as any).notes}"
        </p>
      )}

      {showActions && request.status === 'pending' && (
        <div className="flex gap-2 mt-3">
          {isManager && (
            <>
              <Button
                size="sm"
                className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                onClick={onApprove}
                disabled={isLoading}
                data-testid={`button-approve-swap-${request.id}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-8"
                onClick={onReject}
                disabled={isLoading}
                data-testid={`button-reject-swap-${request.id}`}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
            </>
          )}
          {isOwnRequest && !isManager && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8"
              onClick={onCancel}
              disabled={isLoading}
              data-testid={`button-cancel-swap-${request.id}`}
            >
              Cancel Request
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
