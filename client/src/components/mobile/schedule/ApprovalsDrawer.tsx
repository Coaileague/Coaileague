import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Clock3, CheckCircle, XCircle, CheckCheck, Ban, Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Shift, Employee } from '@shared/schema';

interface ApprovalsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingShifts: Shift[];
  employees: Employee[];
}

export function ApprovalsDrawer({ open, onOpenChange, pendingShifts, employees }: ApprovalsDrawerProps) {
  const { toast } = useToast();
  const [showApproveAllDialog, setShowApproveAllDialog] = useState(false);
  const [showDenyAllDialog, setShowDenyAllDialog] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  const getEmployee = (id: string) => employees.find(e => e.id === id);

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const hour = d.getHours();
    if (hour === 0) return '12a';
    if (hour < 12) return `${hour}a`;
    if (hour === 12) return '12p';
    return `${hour - 12}p`;
  };

  const approveMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await apiRequest('PATCH', `/api/shifts/${shiftId}`, { status: 'scheduled' });
    },
    onMutate: async (shiftId) => {
      await queryClient.cancelQueries({ queryKey: ['/api/shifts'] });
      const prev = queryClient.getQueryData(['/api/shifts']);
      queryClient.setQueryData(['/api/shifts'], (old: any) => {
        if (!old) return old;
        return old.map((shift: any) => 
          shift.id === shiftId 
            ? { ...shift, status: 'scheduled' }
            : shift
        );
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: 'Shift approved' });
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(['/api/shifts'], context.prev);
      toast({ 
        title: 'Failed to approve shift',
        variant: 'destructive'
      });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await apiRequest('DELETE', `/api/shifts/${shiftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: 'Shift denied' });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (shiftIds: string[]) => {
      const total = shiftIds.length;
      let completed = 0;
      
      for (const shiftId of shiftIds) {
        await apiRequest('PATCH', `/api/shifts/${shiftId}`, { status: 'scheduled' });
        completed++;
        setBulkProgress({ current: completed, total });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ 
        title: 'All shifts approved',
        description: `${pendingShifts.length} shifts have been approved`
      });
      setBulkProgress(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Some shifts failed to approve',
        description: error.message,
        variant: 'destructive'
      });
      setBulkProgress(null);
    },
  });

  const bulkDenyMutation = useMutation({
    mutationFn: async (shiftIds: string[]) => {
      const total = shiftIds.length;
      let completed = 0;
      
      for (const shiftId of shiftIds) {
        await apiRequest('DELETE', `/api/shifts/${shiftId}`);
        completed++;
        setBulkProgress({ current: completed, total });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ 
        title: 'All shifts denied',
        description: `${pendingShifts.length} shifts have been removed`
      });
      setBulkProgress(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Some shifts failed to deny',
        description: error.message,
        variant: 'destructive'
      });
      setBulkProgress(null);
    },
  });

  const handleApproveAll = () => {
    const shiftIds = pendingShifts.map(s => s.id);
    bulkApproveMutation.mutate(shiftIds);
    setShowApproveAllDialog(false);
  };

  const handleDenyAll = () => {
    const shiftIds = pendingShifts.map(s => s.id);
    bulkDenyMutation.mutate(shiftIds);
    setShowDenyAllDialog(false);
  };

  const isBulkProcessing = bulkApproveMutation.isPending || bulkDenyMutation.isPending;

  return (
    <>
      <UniversalModal open={open} onOpenChange={onOpenChange}>
        <UniversalModalContent side="bottom" className="h-[90vh] flex flex-col p-0 sm:max-w-3xl" showHomeButton={false}>
          <UniversalModalHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <UniversalModalTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-orange-600" />
              Pending Approvals ({pendingShifts.length})
            </UniversalModalTitle>
          </UniversalModalHeader>

          {/* Bulk Action Bar - Sticky at top */}
          {pendingShifts.length > 1 && (
            <div className="px-4 py-3 bg-muted/50 border-b flex gap-2 shrink-0">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowApproveAllDialog(true)}
                disabled={isBulkProcessing}
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-approve-all"
              >
                {bulkApproveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    {bulkProgress ? `${bulkProgress.current}/${bulkProgress.total}` : 'Processing...'}
                  </>
                ) : (
                  <>
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Approve All ({pendingShifts.length})
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDenyAllDialog(true)}
                disabled={isBulkProcessing}
                className="flex-1"
                data-testid="button-deny-all"
              >
                {bulkDenyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    {bulkProgress ? `${bulkProgress.current}/${bulkProgress.total}` : 'Processing...'}
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-1" />
                    Deny All
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Scrollable List */}
          <ScrollArea className="flex-1 px-4">
            <div className="py-4 space-y-3">
              {pendingShifts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-600" />
                  <p>All caught up! No pending approvals.</p>
                </div>
              ) : (
                pendingShifts.map(shift => {
                  const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
                  return (
                    <div
                      key={shift.id}
                      className="border rounded-lg p-4 bg-card"
                      data-testid={`approval-shift-${shift.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1">
                          <div className="font-semibold text-base mb-1">
                            {emp ? `${emp.firstName} ${emp.lastName}` : 'Open Shift'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {shift.title || emp?.role || 'Unassigned'}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {new Date(shift.startTime).toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => approveMutation.mutate(shift.id)}
                          disabled={approveMutation.isPending || isBulkProcessing}
                          className="flex-1"
                          data-testid={`button-approve-${shift.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => denyMutation.mutate(shift.id)}
                          disabled={denyMutation.isPending || isBulkProcessing}
                          className="flex-1"
                          data-testid={`button-deny-${shift.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </UniversalModalContent>
      </UniversalModal>

      {/* Approve All Confirmation Dialog */}
      <AlertDialog open={showApproveAllDialog} onOpenChange={setShowApproveAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCheck className="h-5 w-5 text-green-600" />
              Approve All Shifts?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will approve <strong>{pendingShifts.length} pending shifts</strong> and add them to the schedule. 
              All employees will be notified of their assigned shifts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleApproveAll}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve All ({pendingShifts.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deny All Confirmation Dialog */}
      <AlertDialog open={showDenyAllDialog} onOpenChange={setShowDenyAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Deny All Shifts?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently remove {pendingShifts.length} pending shifts</strong> from the schedule. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDenyAll}
              className="bg-destructive hover:bg-destructive/90"
            >
              Deny All ({pendingShifts.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
