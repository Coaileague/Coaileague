import { useMutation } from '@tanstack/react-query';
import { Clock3, CheckCircle, XCircle, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Shift, Employee } from '@shared/schema';

interface ApprovalsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingShifts: Shift[];
  employees: Employee[];
}

export function ApprovalsDrawer({ open, onOpenChange, pendingShifts, employees }: ApprovalsDrawerProps) {
  const { toast } = useToast();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: 'Shift approved' });
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-orange-600" />
            Pending Approvals ({pendingShifts.length})
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-3">
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
                  <div className="flex items-start justify-between mb-3">
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
                      disabled={approveMutation.isPending}
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
                      disabled={denyMutation.isPending}
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
      </SheetContent>
    </Sheet>
  );
}
