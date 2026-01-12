/**
 * Unassigned Shifts Panel - Shows open shifts with assign/auto-fill actions
 * Integrates with Trinity AI for intelligent employee matching
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInHours, isBefore, addHours } from 'date-fns';
import { AlertTriangle, ChevronDown, UserPlus, Bot, Clock, MapPin, Loader2 } from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import type { Shift, Employee, Client } from '@shared/schema';
import { formatRoleDisplay } from '@/lib/utils';

interface UnassignedShiftsPanelProps {
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function UnassignedShiftsPanel({
  shifts,
  employees,
  clients,
  isCollapsed = false,
  onToggleCollapse,
}: UnassignedShiftsPanelProps) {
  const { toast } = useToast();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const unassignedShifts = shifts.filter(s => !s.employeeId);

  const assignMutation = useMutation({
    mutationFn: async ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) => {
      return await apiRequest('PATCH', `/api/shifts/${shiftId}`, { employeeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      setAssignDialogOpen(false);
      setSelectedShift(null);
      setSelectedEmployeeId('');
      toast({ title: 'Shift assigned successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Assignment failed', description: error.message });
    },
  });

  const autoFillMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest('POST', `/api/shifts/${shiftId}/ai-fill`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: 'Trinity AI assigned best match', description: 'Shift filled successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Auto-fill failed', description: error.message });
    },
  });

  const getClient = (clientId: string | null) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId);
  };

  const isUrgent = (shift: Shift) => {
    const startTime = new Date(shift.startTime);
    const hoursUntilStart = differenceInHours(startTime, new Date());
    return hoursUntilStart <= 48 && hoursUntilStart > 0;
  };

  const handleAssign = (shift: Shift) => {
    setSelectedShift(shift);
    setAssignDialogOpen(true);
  };

  const handleAutoFill = (shift: Shift) => {
    autoFillMutation.mutate(shift.id);
  };

  const handleConfirmAssign = () => {
    if (selectedShift && selectedEmployeeId) {
      assignMutation.mutate({ shiftId: selectedShift.id, employeeId: selectedEmployeeId });
    }
  };

  if (unassignedShifts.length === 0) {
    return null;
  }

  return (
    <>
      <Collapsible open={!isCollapsed} onOpenChange={onToggleCollapse}>
        <Card className="border-dashed border-amber-500/50" data-testid="unassigned-shifts-panel">
          <CardHeader className="py-3">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Unassigned Shifts
                <Badge variant="outline" className="ml-1 text-amber-500 border-amber-500">
                  {unassignedShifts.length}
                </Badge>
              </CardTitle>
              <ChevronDown className={`w-4 h-4 transition-transform ${!isCollapsed ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
          </CardHeader>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-60">
                <div className="space-y-2">
                  {unassignedShifts.map(shift => {
                    const client = getClient(shift.clientId);
                    const urgent = isUrgent(shift);
                    
                    return (
                      <div 
                        key={shift.id}
                        className={`p-3 rounded-lg border ${urgent ? 'border-amber-500 bg-amber-500/5' : 'border-border'}`}
                        data-testid={`unassigned-shift-${shift.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {client?.companyName || shift.title || 'Untitled Shift'}
                              </span>
                              {urgent && (
                                <Badge variant="destructive" className="text-xs">
                                  Urgent
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(shift.startTime), 'EEE h:mma')} - 
                                {format(new Date(shift.endTime), 'h:mma')}
                              </span>
                              {client?.address && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3" />
                                  {client.address}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAssign(shift)}
                              data-testid={`button-assign-${shift.id}`}
                            >
                              <UserPlus className="w-3 h-3 mr-1" />
                              Assign
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAutoFill(shift)}
                              disabled={autoFillMutation.isPending}
                              data-testid={`button-autofill-${shift.id}`}
                            >
                              {autoFillMutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <TrinityIconStatic className="w-3 h-3 mr-1" />
                              )}
                              Auto-Fill
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Assign Shift</DialogTitle>
          </DialogHeader>
          
          {selectedShift && (
            <div className="py-4 space-y-4">
              <div className="text-sm">
                <p><strong>Shift:</strong> {getClient(selectedShift.clientId)?.companyName || selectedShift.title}</p>
                <p><strong>Time:</strong> {format(new Date(selectedShift.startTime), 'EEE, MMM d')} {format(new Date(selectedShift.startTime), 'h:mma')} - {format(new Date(selectedShift.endTime), 'h:mma')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Employee</label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} - {formatRoleDisplay(emp.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAssign}
              disabled={!selectedEmployeeId || assignMutation.isPending}
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
