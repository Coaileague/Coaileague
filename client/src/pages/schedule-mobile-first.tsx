/**
 * Mobile-First Schedule - Complete redesign with proper popups and role-based views
 * Features: Week stats, day tabs, employee shift cards, shift detail popup, AI FAB, manager tools
 * Enhanced with recurring shifts, shift swapping, templates, and duplication
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { startOfWeek, addDays, addWeeks, format, isToday } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { useClientLookup } from '@/hooks/useClients';
import { useEmployee } from '@/hooks/useEmployee';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, Plus, ChevronLeft, ChevronRight, 
  Calendar, Users, Clock, BarChart3, CheckCircle,
  AlertCircle, CalendarDays, ArrowRightLeft, LayoutTemplate, Download
} from 'lucide-react';
import { EmployeeShiftCard } from '@/components/schedule/EmployeeShiftCard';
import { ShiftBottomSheet } from '@/components/schedule/ShiftBottomSheet';
import { ShiftDetailSheet } from '@/components/schedule/ShiftDetailSheet';
import { ShiftSwapDrawer } from '@/components/schedule/ShiftSwapDrawer';
import { ScheduleTemplates } from '@/components/schedule/ScheduleTemplates';
import { CalendarSyncDialog } from '@/components/schedule/CalendarSyncDialog';
import { ApprovalsDrawer } from '@/components/mobile/schedule/ApprovalsDrawer';
import { ReportsSheet } from '@/components/mobile/schedule/ReportsSheet';
import { WeekStatsBar } from '@/components/schedule/WeekStatsBar';
import { ConflictAlerts } from '@/components/schedule/ConflictAlerts';
import { TrinityInsightsPanel } from '@/components/schedule/TrinityInsightsPanel';
import { AskTrinityButton } from '@/components/trinity-button';
import type { Shift, Employee, Client } from '@shared/schema';

export default function ScheduleMobileFirst() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { workspaceRole } = useWorkspaceAccess();
  const { employee: currentEmployee } = useEmployee();
  
  const isManagerOrSupervisor = useMemo(() => {
    if (!currentEmployee || !currentEmployee.workspaceRole) return false;
    return ['owner', 'admin', 'department_manager', 'supervisor', 'org_owner', 'org_admin', 'org_manager'].includes(currentEmployee.workspaceRole);
  }, [currentEmployee]);
  
  const canEdit = isManagerOrSupervisor;

  // State
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>();
  const [editingShift, setEditingShift] = useState<Shift | undefined>();
  const [viewMode, setViewMode] = useState<'my' | 'full'>('full');
  const [showApprovals, setShowApprovals] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showSwaps, setShowSwaps] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCalendarSync, setShowCalendarSync] = useState(false);
  const [swapShift, setSwapShift] = useState<Shift | null>(null);
  
  // Shift detail popup state
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  
  // GetSling-style feature panels for mobile
  const [showConflicts, setShowConflicts] = useState(true);
  const [showTrinityInsights, setShowTrinityInsights] = useState(false);

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

  // Fetch clients
  const { data: clients = [] } = useClientLookup();

  // Calculate pending shifts
  const pendingShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'draft');
  }, [shifts]);

  // Generate week days
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Filter shifts for selected day
  const dayShifts = useMemo(() => {
    const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');
    let filteredShifts = shifts.filter(shift => {
      const shiftDay = format(new Date(shift.startTime), 'yyyy-MM-dd');
      return shiftDay === selectedDayStr;
    });

    // Only filter to "my" shifts when we have a valid employee ID
    if (viewMode === 'my') {
      if (!currentEmployee?.id) {
        return []; // Return empty while loading employee data
      }
      filteredShifts = filteredShifts.filter(s => s.employeeId === currentEmployee.id);
    }

    return filteredShifts;
  }, [shifts, selectedDate, viewMode, currentEmployee]);

  // Group shifts by employee
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

  // Calculate weekly hours
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
    if (viewMode === 'my') {
      if (!currentEmployee?.id) {
        return []; // Return empty while loading employee data
      }
      return employees.filter(emp => emp.id === currentEmployee.id);
    }
    return employees;
  }, [employees, viewMode, currentEmployee]);

  // Mutations
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
  
  const handleViewShift = (shift: Shift) => {
    // Simply update the shift - the sheet will re-render with new data
    setSelectedShift(shift);
    setDetailSheetOpen(true);
  };
  
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
  
  const handleClaimShift = async (shift: Shift) => {
    if (!currentEmployee?.id) {
      toast({ 
        title: "Unable to claim shift", 
        description: "Please wait for your profile to load",
        variant: "destructive" 
      });
      return;
    }
    try {
      await apiRequest('PATCH', `/api/shifts/${shift.id}`, { 
        employeeId: currentEmployee.id 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setDetailSheetOpen(false);
      toast({ title: "Shift claimed successfully" });
    } catch (error) {
      toast({ 
        title: "Failed to claim shift", 
        variant: "destructive" 
      });
    }
  };

  const handleDuplicateShift = async (shift: Shift) => {
    try {
      const nextDay = addDays(new Date(shift.startTime), 1);
      const startTime = new Date(nextDay);
      const endTime = new Date(nextDay);
      const originalStart = new Date(shift.startTime);
      const originalEnd = new Date(shift.endTime);
      
      startTime.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      endTime.setHours(originalEnd.getHours(), originalEnd.getMinutes(), 0, 0);

      await apiRequest('POST', '/api/shifts', {
        title: shift.title,
        employeeId: shift.employeeId,
        clientId: shift.clientId,
        description: shift.description,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'scheduled',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: "Shift duplicated to next day" });
    } catch (error) {
      toast({ 
        title: "Failed to duplicate shift", 
        variant: "destructive" 
      });
    }
  };
  
  const [isQuickDuplicating, setIsQuickDuplicating] = useState(false);
  
  const handleQuickDuplicate = async (shift: Shift) => {
    setIsQuickDuplicating(true);
    try {
      const nextWeek = addDays(new Date(shift.startTime), 7);
      const startTime = new Date(nextWeek);
      const endTime = new Date(nextWeek);
      const originalStart = new Date(shift.startTime);
      const originalEnd = new Date(shift.endTime);
      
      startTime.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      endTime.setHours(originalEnd.getHours(), originalEnd.getMinutes(), 0, 0);

      await apiRequest('POST', '/api/shifts', {
        title: shift.title,
        employeeId: shift.employeeId,
        clientId: shift.clientId,
        description: shift.description,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'scheduled',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: "Shift copied to next week" });
    } catch (error) {
      toast({ 
        title: "Failed to copy shift", 
        variant: "destructive" 
      });
    } finally {
      setIsQuickDuplicating(false);
    }
  };

  const handleRequestSwap = (shift: Shift) => {
    setSwapShift(shift);
    setShowSwaps(true);
  };

  const handleApplyTemplate = async (templateShifts: Partial<Shift>[]) => {
    try {
      for (const shift of templateShifts) {
        await apiRequest('POST', '/api/shifts', {
          ...shift,
          status: 'scheduled',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ 
        title: "Template applied", 
        description: `${templateShifts.length} shifts created` 
      });
    } catch (error) {
      toast({ 
        title: "Failed to apply template", 
        variant: "destructive" 
      });
    }
  };

  // Find employee and client for selected shift
  const selectedShiftEmployee = selectedShift?.employeeId 
    ? employees.find(e => e.id === selectedShift.employeeId)
    : null;
  const selectedShiftClient = selectedShift?.clientId
    ? clients.find(c => c.id === selectedShift.clientId)
    : null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header with Week Navigation - Fortune 500 Compact Design */}
      <div className="border-b border-border/40 bg-background">
        {/* Week Navigation Row */}
        <div className="flex items-center justify-between px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousWeek}
            className="h-8 w-8"
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="text-center">
            <div className="font-semibold text-sm">
              {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextWeek}
            className="h-8 w-8"
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Stats - Compact Inline Format (GetSling style) */}
        <div className="flex items-center justify-center gap-4 px-3 py-1.5 text-xs border-t border-border/30 bg-muted/30">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary">{stats?.totalShifts || 0}</span>
            <span className="text-muted-foreground">Shifts</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-green-600">{stats?.totalHours?.toFixed(0) || 0}</span>
            <span className="text-muted-foreground">Hours</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-amber-600">{pendingShifts.length}</span>
            <span className="text-muted-foreground">Pending</span>
          </div>
        </div>
      </div>

      {/* Day Selector - Fortune 500 Compact Pills (GetSling style) */}
      <div className="border-b border-border/40 overflow-x-auto">
        <div className="flex min-w-max px-2 py-1.5">
          {weekDays.map((day) => {
            const isSelected = format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
            const dayIsToday = isToday(day);
            const dayShiftCount = shifts.filter(s => 
              format(new Date(s.startTime), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
            ).length;
            
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`flex flex-col items-center py-1 px-2 mx-0.5 rounded-md min-w-[40px] transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : dayIsToday
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-muted/60 active:bg-muted'
                }`}
                data-testid={`day-tab-${format(day, 'yyyy-MM-dd')}`}
              >
                <span className="text-[10px] font-medium uppercase opacity-80">
                  {format(day, 'EEE')}
                </span>
                <span className="text-sm font-bold leading-tight">{format(day, 'd')}</span>
                {dayShiftCount > 0 && (
                  <div className={`w-1 h-1 rounded-full mt-0.5 ${
                    isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* View Toggle - Compact Segmented Control */}
      <div className="border-b border-border/40 px-3 py-1.5">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'my' | 'full')}>
          <TabsList className="w-full grid grid-cols-2 h-8">
            <TabsTrigger value="my" className="text-xs gap-1.5 h-7" data-testid="tab-my-schedule">
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              <span>My Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="full" className="text-xs gap-1.5 h-7" data-testid="tab-full-schedule">
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Full Schedule</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Quick Actions - Compact Horizontal Scroll */}
      <div className="border-b border-border/40 px-2 py-1.5 bg-muted/20">
        <div className="flex gap-1.5 overflow-x-auto">
          {/* Manager-only actions */}
          {isManagerOrSupervisor && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowApprovals(true)}
                className="flex-shrink-0 gap-1 h-7 px-2 text-xs"
                data-testid="button-approvals"
              >
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Approvals
                {pendingShifts.length > 0 && (
                  <Badge variant="destructive" className="ml-0.5 text-[10px] px-1 h-4">
                    {pendingShifts.length}
                  </Badge>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates(true)}
                className="flex-shrink-0 gap-1 h-7 px-2 text-xs"
                data-testid="button-templates"
              >
                <LayoutTemplate className="h-3.5 w-3.5 text-purple-600" />
                Templates
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReports(true)}
                className="flex-shrink-0 gap-1 h-7 px-2 text-xs"
                data-testid="button-reports"
              >
                <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                Reports
              </Button>
            </>
          )}
          {/* Actions for all users */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSwapShift(null);
              setShowSwaps(true);
            }}
            className="flex-shrink-0 gap-1 h-7 px-2 text-xs"
            data-testid="button-swaps"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-600" />
            Swaps
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCalendarSync(true)}
            className="flex-shrink-0 gap-1 h-7 px-2 text-xs"
            data-testid="button-calendar-sync"
          >
            <Download className="h-3.5 w-3.5 text-indigo-600" />
            Export
          </Button>
          {/* Trinity for managers only */}
          {isManagerOrSupervisor && (
            <AskTrinityButton
              onClick={() => setShowTrinityInsights(!showTrinityInsights)}
              size="sm"
              data-testid="button-trinity-mobile"
            />
          )}
        </div>
      </div>
      
      {/* Mobile Conflict Alerts - Managers only */}
      {isManagerOrSupervisor && showConflicts && (
        <ConflictAlerts
          shifts={shifts}
          employees={employees}
          onResolve={(shiftId) => {
            const shift = shifts.find(s => s.id === shiftId);
            if (shift) {
              setSelectedShift(shift);
              setDetailSheetOpen(true);
            }
          }}
          onDismiss={() => setShowConflicts(false)}
          className="mx-3 mt-2"
        />
      )}
      
      {/* Mobile Trinity Insights - Managers only */}
      {isManagerOrSupervisor && showTrinityInsights && (
        <div className="mx-3 mt-2">
          <TrinityInsightsPanel
            weekStart={weekStart}
            weekEnd={addDays(weekStart, 6)}
            shifts={shifts}
            employees={employees}
            clients={clients}
            isCollapsed={false}
            onToggleCollapse={() => setShowTrinityInsights(false)}
          />
        </div>
      )}

      {/* Shift Cards - Scrollable */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-3 pb-28">
          {shiftsLoading || (viewMode === 'my' && !currentEmployee?.id) ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              <div>{shiftsLoading ? 'Loading shifts...' : 'Loading your schedule...'}</div>
            </div>
          ) : viewMode === 'my' && dayShifts.length === 0 ? (
            <Card className="p-6">
              <div className="text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <div className="font-medium mb-1">No shifts scheduled</div>
                <div className="text-sm">You have no shifts on {format(selectedDate, 'EEEE, MMM d')}</div>
                {openShifts.length > 0 && (
                  <div className="mt-4">
                    <Badge variant="outline" className="text-amber-600 border-amber-500">
                      {openShifts.length} open {openShifts.length === 1 ? 'shift' : 'shifts'} available
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="block mx-auto mt-2 text-primary"
                      onClick={() => setViewMode('full')}
                    >
                      View Full Schedule
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ) : displayEmployees.length === 0 && openShifts.length === 0 ? (
            <Card className="p-6">
              <div className="text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <div className="font-medium mb-1">No employees found</div>
                <div className="text-sm">Add employees to start scheduling</div>
              </div>
            </Card>
          ) : (
            <>
              {/* Open Shifts - Always show at top */}
              {openShifts.length > 0 && (
                <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        Open Shifts ({openShifts.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {openShifts.map(shift => {
                        const start = new Date(shift.startTime);
                        const end = new Date(shift.endTime);
                        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                        
                        return (
                          <div
                            key={shift.id}
                            onClick={() => handleViewShift(shift)}
                            className="bg-white dark:bg-card rounded-lg p-3 border border-amber-200 dark:border-amber-800 cursor-pointer active:scale-[0.98] transition-transform"
                            data-testid={`open-shift-${shift.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-bold text-base">
                                  {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {shift.title || 'Unassigned'} | {hours.toFixed(1)} hrs
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700"
                                disabled={!currentEmployee?.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaimShift(shift);
                                }}
                                data-testid={`button-claim-${shift.id}`}
                              >
                                Claim
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Employee Cards */}
              {displayEmployees.map(employee => (
                <EmployeeShiftCard
                  key={employee.id}
                  employee={employee}
                  shifts={employeeShiftsMap.get(employee.id) || []}
                  weeklyHours={weeklyHoursMap.get(employee.id) || 0}
                  onViewShift={handleViewShift}
                  onEditShift={handleEditShift}
                  onDeleteShift={handleDeleteShift}
                  onAddShift={handleAddShift}
                  onDuplicateShift={handleDuplicateShift}
                  onSwapShift={handleRequestSwap}
                  canEdit={canEdit}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* FABs */}
      {canEdit && (
        <>
          {/* AI Schedule Generation FAB */}
          <div className="fixed bottom-24 right-4 z-40">
            <Button
              size="icon"
              className="h-14 w-14 rounded-full shadow-lg bg-gradient-to-br from-purple-600 to-blue-600"
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

          {/* Add Shift FAB */}
          <div className="fixed bottom-8 right-4 z-40">
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
        </>
      )}

      {/* Shift Detail Sheet - Tap to view - keyed by shift ID for fresh render */}
      <ShiftDetailSheet
        key={selectedShift?.id || 'empty'}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        shift={selectedShift}
        employee={selectedShiftEmployee}
        client={selectedShiftClient}
        canEdit={canEdit}
        onEdit={handleEditShift}
        onDelete={handleDeleteShift}
        onClaimShift={currentEmployee?.id ? handleClaimShift : undefined}
        onDuplicate={canEdit ? handleDuplicateShift : undefined}
        onQuickDuplicate={canEdit ? handleQuickDuplicate : undefined}
        quickDuplicatePending={isQuickDuplicating}
        onRequestSwap={handleRequestSwap}
      />

      {/* Shift Creation/Edit Sheet */}
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

      {/* Approvals Drawer */}
      {isManagerOrSupervisor && (
        <ApprovalsDrawer
          open={showApprovals}
          onOpenChange={setShowApprovals}
          pendingShifts={pendingShifts}
          employees={employees}
        />
      )}

      {/* Reports Sheet */}
      {isManagerOrSupervisor && (
        <ReportsSheet
          open={showReports}
          onOpenChange={setShowReports}
          shifts={shifts}
          employees={employees}
        />
      )}

      {/* Shift Swap Drawer */}
      <ShiftSwapDrawer
        open={showSwaps}
        onOpenChange={setShowSwaps}
        shift={swapShift}
        employees={employees}
        currentUserId={currentEmployee?.id}
        isManager={isManagerOrSupervisor}
      />

      {/* Schedule Templates Drawer */}
      {isManagerOrSupervisor && (
        <ScheduleTemplates
          open={showTemplates}
          onOpenChange={setShowTemplates}
          currentShifts={dayShifts}
          selectedDate={selectedDate}
          onApplyTemplate={handleApplyTemplate}
        />
      )}

      {/* Calendar Sync Dialog */}
      <CalendarSyncDialog
        open={showCalendarSync}
        onOpenChange={setShowCalendarSync}
        employeeId={currentEmployee?.id}
      />
    </div>
  );
}
