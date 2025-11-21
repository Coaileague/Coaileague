/**
 * Mobile-First Schedule - Merged best features from both mobile schedules
 * Features: Week stats, day tabs, employee shift cards, AI generation FAB, manager tools, approvals, reports, view toggle
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { startOfWeek, addDays, addWeeks, format } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { useClientLookup } from '@/hooks/useClients';
import { useEmployee } from '@/hooks/useEmployee';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus } from 'lucide-react';
import { WeekHeader } from '@/components/schedule/WeekHeader';
import { DayTabs } from '@/components/schedule/DayTabs';
import { EmployeeShiftCard } from '@/components/schedule/EmployeeShiftCard';
import { ShiftBottomSheet } from '@/components/schedule/ShiftBottomSheet';
import { ApprovalsDrawer } from '@/components/mobile/schedule/ApprovalsDrawer';
import { ReportsSheet } from '@/components/mobile/schedule/ReportsSheet';
import { ManagerToolbar } from '@/components/mobile/schedule/ManagerToolbar';
import { ViewToggle } from '@/components/mobile/schedule/ViewToggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Shift, Employee } from '@shared/schema';

export default function ScheduleMobileFirst() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { workspaceRole } = useWorkspaceAccess();
  const { employee: currentEmployee } = useEmployee();
  
  // RBAC check - managers and admins can edit
  const canEdit = ['org_owner', 'org_admin', 'org_manager', 'admin', 'owner', 'manager'].includes(workspaceRole);
  
  // Check if user is manager/supervisor for advanced features
  const isManagerOrSupervisor = useMemo(() => {
    if (!currentEmployee || !currentEmployee.workspaceRole) return false;
    return ['owner', 'admin', 'department_manager', 'supervisor', 'org_owner', 'org_admin', 'org_manager'].includes(currentEmployee.workspaceRole);
  }, [currentEmployee]);

  // State
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>();
  const [editingShift, setEditingShift] = useState<Shift | undefined>();
  const [viewMode, setViewMode] = useState<'my' | 'full'>('full');
  const [showApprovals, setShowApprovals] = useState(false);
  const [showReports, setShowReports] = useState(false);

  // Fetch weekly stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/schedules/week/stats', weekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/week/stats?weekStart=${weekStart.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  // Fetch shifts for the week
  const weekEnd = addDays(weekStart, 7);
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch shifts');
      return res.json();
    },
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients using authenticated lookup hook
  const { data: clients = [] } = useClientLookup();

  // Calculate pending shifts for approvals
  const pendingShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'draft');
  }, [shifts]);

  // Filter shifts for selected day
  const dayShifts = useMemo(() => {
    const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');
    let filteredShifts = shifts.filter(shift => {
      const shiftDay = format(new Date(shift.startTime), 'yyyy-MM-dd');
      return shiftDay === selectedDayStr;
    });

    // Filter by view mode for managers/supervisors
    if (isManagerOrSupervisor && viewMode === 'my') {
      filteredShifts = filteredShifts.filter(s => s.employeeId === currentEmployee?.id);
    }

    return filteredShifts;
  }, [shifts, selectedDate, viewMode, isManagerOrSupervisor, currentEmployee]);

  // Group shifts by employee (including open shifts)
  const { employeeShiftsMap, openShifts } = useMemo(() => {
    const map = new Map<string, Shift[]>();
    const open: Shift[] = [];
    
    dayShifts.forEach(shift => {
      if (shift.employeeId) {
        const empShifts = map.get(shift.employeeId) || [];
        empShifts.push(shift);
        map.set(shift.employeeId, empShifts);
      } else {
        open.push(shift);
      }
    });
    return { employeeShiftsMap: map, openShifts: open };
  }, [dayShifts]);

  // Calculate weekly hours per employee
  const weeklyHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    shifts.forEach(shift => {
      if (shift.employeeId) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        map.set(shift.employeeId, (map.get(shift.employeeId) || 0) + hours);
      }
    });
    return map;
  }, [shifts]);

  // Filter employees based on view mode
  const displayEmployees = useMemo(() => {
    if (isManagerOrSupervisor && viewMode === 'my' && currentEmployee) {
      return employees.filter(emp => emp.id === currentEmployee.id);
    }
    return employees;
  }, [employees, viewMode, isManagerOrSupervisor, currentEmployee]);

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/shifts', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shift created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      setSheetOpen(false);
      setSelectedEmployee(undefined);
      setEditingShift(undefined);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create shift",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await apiRequest('DELETE', `/api/shifts/${shiftId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shift deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete shift",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handlePreviousWeek = () => setWeekStart(prev => addWeeks(prev, -1));
  const handleNextWeek = () => setWeekStart(prev => addWeeks(prev, 1));
  
  const handleAddShift = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditingShift(undefined);
    setSheetOpen(true);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setSelectedEmployee(undefined);
    setSheetOpen(true);
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (confirm('Delete this shift?')) {
      await deleteShiftMutation.mutateAsync(shift.id);
    }
  };

  const handleSubmitShift = async (data: any) => {
    await createShiftMutation.mutateAsync(data);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header with Week Navigation and Stats */}
      <WeekHeader
        weekStart={weekStart}
        onPreviousWeek={handlePreviousWeek}
        onNextWeek={handleNextWeek}
        stats={stats}
        isLoadingStats={statsLoading}
      />

      {/* Day Selector Tabs */}
      <DayTabs
        weekStart={weekStart}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {/* View Toggle - Manager/Supervisor only */}
      {isManagerOrSupervisor && (
        <ViewToggle
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {/* Manager Toolbar - Quick actions for managers */}
      {isManagerOrSupervisor && (
        <ManagerToolbar
          pendingCount={pendingShifts.length}
          onShowApprovals={() => setShowApprovals(true)}
          onShowReports={() => setShowReports(true)}
          onShowEmployees={() => setLocation('/employees')}
        />
      )}

      {/* Employee Shift Cards - Scrollable */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-3 pb-24">
          {shiftsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading shifts...</div>
          ) : displayEmployees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-4xl mb-3">👥</div>
              <div>No employees found. Add employees to start scheduling.</div>
            </div>
          ) : (
            <>
              {/* Open Shifts Section - Only show in full view */}
              {viewMode === 'full' && openShifts.length > 0 && (
                <EmployeeShiftCard
                  key="open-shifts"
                  employee={{
                    id: 'open',
                    workspaceId: employees[0]?.workspaceId || '',
                    userId: null,
                    employeeNumber: null,
                    firstName: 'Open',
                    lastName: 'Shifts',
                    email: null,
                    phone: null,
                    address: null,
                    city: null,
                    state: null,
                    zipCode: null,
                    emergencyContactName: null,
                    emergencyContactPhone: null,
                    emergencyContactRelation: null,
                    role: 'Unassigned',
                    workspaceRole: 'staff',
                    hourlyRate: null,
                    color: '#f97316',
                    onboardingStatus: 'not_started',
                    isActive: true,
                    availabilityNotes: null,
                    performanceScore: null,
                    rating: null,
                    availabilityPercentage: null,
                    overtimeHoursThisWeek: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  } as Employee}
                  shifts={openShifts}
                  weeklyHours={0}
                  onEditShift={handleEditShift}
                  onDeleteShift={handleDeleteShift}
                  onAddShift={() => {
                    setSelectedEmployee(undefined);
                    setEditingShift(undefined);
                    setSheetOpen(true);
                  }}
                  canEdit={canEdit}
                />
              )}
              
              {/* Regular Employee Cards - Filtered by view mode */}
              {displayEmployees.map(employee => (
                <EmployeeShiftCard
                  key={employee.id}
                  employee={employee}
                  shifts={employeeShiftsMap.get(employee.id) || []}
                  weeklyHours={weeklyHoursMap.get(employee.id) || 0}
                  onEditShift={handleEditShift}
                  onDeleteShift={handleDeleteShift}
                  onAddShift={handleAddShift}
                  canEdit={canEdit}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* FAB - AI Schedule Generation */}
      {canEdit && (
        <div className="fixed bottom-24 right-6 z-40">
          <Button
            size="icon"
            className="h-16 w-16 rounded-full shadow-lg bg-gradient-to-br from-primary to-blue-600"
            onClick={() => {
              toast({
                title: "AI Generation",
                description: "AI schedule generation will be integrated here",
              });
            }}
            data-testid="fab-ai-generate"
          >
            <Sparkles className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* FAB - Manual Add Shift */}
      {canEdit && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg"
            onClick={() => {
              setSelectedEmployee(undefined);
              setEditingShift(undefined);
              setSheetOpen(true);
            }}
            data-testid="fab-add-shift"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Shift Creation/Edit Bottom Sheet */}
      <ShiftBottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        employees={employees}
        clients={clients}
        selectedDate={selectedDate}
        selectedEmployee={selectedEmployee}
        editingShift={editingShift}
        onSubmit={handleSubmitShift}
        isSubmitting={createShiftMutation.isPending}
      />

      {/* Approvals Drawer - Manager/Supervisor only */}
      {isManagerOrSupervisor && (
        <ApprovalsDrawer
          open={showApprovals}
          onOpenChange={setShowApprovals}
          pendingShifts={pendingShifts}
          employees={employees}
        />
      )}

      {/* Reports Sheet - Manager/Supervisor only */}
      {isManagerOrSupervisor && (
        <ReportsSheet
          open={showReports}
          onOpenChange={setShowReports}
          shifts={shifts}
          employees={employees}
        />
      )}
    </div>
  );
}
