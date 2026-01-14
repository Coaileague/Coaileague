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
import { 
  Plus, ChevronLeft, ChevronRight, Menu,
  Users, Clock, BarChart3, CheckCircle,
  ArrowRightLeft, LayoutTemplate, Download,
  Check, X
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { TrinityTrainingPanel } from '@/components/schedule/TrinityTrainingPanel';
import { TrinityMascotIcon } from '@/components/ui/trinity-mascot';
import { TrinityLoadingSpinner } from '@/components/trinity-loading-overlay';
import { useSimpleMode } from '@/contexts/SimpleModeContext';
import type { Shift, Employee, Client } from '@shared/schema';

export default function ScheduleMobileFirst() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { workspaceRole } = useWorkspaceAccess();
  const { employee: currentEmployee } = useEmployee();
  const { isSimpleMode } = useSimpleMode();
  
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
  const [viewMode, setViewMode] = useState<'my' | 'full' | 'pending'>('full');
  const [showApprovals, setShowApprovals] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showSwaps, setShowSwaps] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCalendarSync, setShowCalendarSync] = useState(false);
  const [swapShift, setSwapShift] = useState<Shift | null>(null);
  const [showManagerTools, setShowManagerTools] = useState(false);
  
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
    
    // Pending view shows all pending shifts for the week
    if (viewMode === 'pending') {
      return pendingShifts;
    }
    
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
  }, [shifts, selectedDate, viewMode, currentEmployee, pendingShifts]);

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

  // Handlers - sync selectedDate with week changes
  const handlePreviousWeek = () => {
    setWeekStart(prev => addWeeks(prev, -1));
    setSelectedDate(prev => addWeeks(prev, -1));
  };
  const handleNextWeek = () => {
    setWeekStart(prev => addWeeks(prev, 1));
    setSelectedDate(prev => addWeeks(prev, 1));
  };
  
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

  const handleAcceptShift = async (shift: Shift) => {
    try {
      await apiRequest('PATCH', `/api/shifts/${shift.id}`, { 
        status: 'confirmed' 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: "Shift accepted" });
    } catch (error) {
      toast({ 
        title: "Failed to accept shift", 
        variant: "destructive" 
      });
    }
  };

  const handleDeclineShift = async (shift: Shift) => {
    try {
      await apiRequest('PATCH', `/api/shifts/${shift.id}`, { 
        status: 'cancelled',
        employeeId: null
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: "Shift declined" });
    } catch (error) {
      toast({ 
        title: "Failed to decline shift", 
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
      {/* GetSling-style Header - Mobile Optimized */}
      <div className="bg-primary text-primary-foreground">
        {/* Month Header with Navigation - Compact visuals, accessible touch */}
        <div className="flex items-center justify-between px-1 py-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousWeek}
            className="min-h-[44px] min-w-[44px] text-primary-foreground hover:bg-primary-foreground/20"
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <div className="text-center">
            <div className="font-bold text-base flex items-center gap-0.5">
              {format(weekStart, 'MMMM')}
              <ChevronRight className="h-3 w-3 rotate-90 opacity-70" />
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextWeek}
            className="min-h-[44px] min-w-[44px] text-primary-foreground hover:bg-primary-foreground/20"
            data-testid="button-next-week"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* GetSling-style 3-Tab Switcher - Compact visuals, accessible touch */}
        <div className="flex border-b border-primary-foreground/20">
          <button
            onClick={() => setViewMode('my')}
            className={`flex-1 min-h-[44px] text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === 'my' 
                ? 'border-b-2 border-primary-foreground text-primary-foreground' 
                : 'text-primary-foreground/70 hover:text-primary-foreground'
            }`}
            data-testid="tab-my-schedule"
          >
            My
          </button>
          <button
            onClick={() => setViewMode('full')}
            className={`flex-1 min-h-[44px] text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === 'full' 
                ? 'border-b-2 border-primary-foreground text-primary-foreground' 
                : 'text-primary-foreground/70 hover:text-primary-foreground'
            }`}
            data-testid="tab-full-schedule"
          >
            Full
          </button>
          <button
            onClick={() => setViewMode('pending')}
            className={`flex-1 min-h-[44px] text-xs font-medium transition-colors whitespace-nowrap relative ${
              viewMode === 'pending' 
                ? 'border-b-2 border-primary-foreground text-primary-foreground' 
                : 'text-primary-foreground/70 hover:text-primary-foreground'
            }`}
            data-testid="tab-pending"
          >
            Pending
            {pendingShifts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                {pendingShifts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* GetSling-style Day Picker - Compact Mobile */}
      <div className="border-b border-border bg-muted/30">
        {/* Horizontal Day Scroller - Compact visuals, accessible touch (min 44px height) */}
        <div className="flex justify-around py-0.5 px-0.5">
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
                className={`flex flex-col items-center justify-center min-w-[40px] min-h-[44px] py-1 rounded transition-colors ${
                  isSelected ? 'bg-primary/10' : ''
                }`}
                data-testid={`day-tab-${format(day, 'yyyy-MM-dd')}`}
              >
                <span className={`text-sm font-bold ${
                  isSelected ? 'text-primary' : dayIsToday ? 'text-primary' : 'text-foreground'
                }`}>
                  {format(day, 'd')}
                </span>
                {/* Shift indicator dots */}
                <div className="flex gap-0.5 h-1.5">
                  {dayShiftCount > 0 && (
                    <div className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-primary' : dayIsToday ? 'bg-primary/70' : 'bg-muted-foreground/50'
                    }`} />
                  )}
                  {dayShiftCount > 1 && (
                    <div className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-primary' : dayIsToday ? 'bg-primary/70' : 'bg-muted-foreground/50'
                    }`} />
                  )}
                  {dayShiftCount > 2 && (
                    <div className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-primary' : dayIsToday ? 'bg-primary/70' : 'bg-muted-foreground/50'
                    }`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        
        {/* Week Range + Hours Summary - Compact */}
        <div className="flex items-center justify-between px-2 py-1 text-[10px] border-t border-border/50">
          <span className="text-muted-foreground">
            {format(weekStart, 'd')} - {format(addDays(weekStart, 6), 'd MMM')}
          </span>
          <span className="font-semibold text-foreground">
            {stats?.totalHours?.toFixed(0) || 0}h
          </span>
        </div>
      </div>

      {/* Selected Day Header - Compact */}
      <div className="bg-primary text-primary-foreground px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold">{format(selectedDate, 'd')}</div>
          <div className="text-sm font-medium uppercase">{format(selectedDate, 'EEE')}</div>
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
      
      {/* Mobile Trinity Insights - Managers only, Pro View only */}
      {isManagerOrSupervisor && showTrinityInsights && !isSimpleMode && (
        <div className="mx-3 mt-2 space-y-3">
          <TrinityInsightsPanel
            weekStart={weekStart}
            weekEnd={addDays(weekStart, 6)}
            shifts={shifts}
            employees={employees}
            clients={clients}
            isCollapsed={false}
            onToggleCollapse={() => setShowTrinityInsights(false)}
          />
          <TrinityTrainingPanel />
        </div>
      )}

      {/* Shift Cards - Scrollable - Compact Mobile */}
      <ScrollArea className="flex-1">
        <div className="pb-24">
          {shiftsLoading || (viewMode === 'my' && !currentEmployee?.id) ? (
            <div className="text-center py-6 text-muted-foreground">
              <TrinityLoadingSpinner size={36} className="mx-auto mb-2" />
              <div className="text-xs font-medium bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent">
                {shiftsLoading ? 'Loading shifts...' : 'Loading your schedule...'}
              </div>
            </div>
          ) : viewMode === 'pending' ? (
            /* Pending View - Compact list */
            <div className="divide-y divide-border">
              {pendingShifts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500 opacity-50" />
                  <div className="font-medium text-sm">All caught up!</div>
                  <div className="text-xs">No pending shifts</div>
                </div>
              ) : (
                pendingShifts.map(shift => {
                  const start = new Date(shift.startTime);
                  const end = new Date(shift.endTime);
                  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                  const emp = employees.find(e => e.id === shift.employeeId);
                  const client = clients.find(c => c.id === shift.clientId);
                  
                  return (
                    <div
                      key={shift.id}
                      onClick={() => handleViewShift(shift)}
                      className="flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50"
                      data-testid={`pending-shift-${shift.id}`}
                    >
                      <div className="w-10 py-1.5 flex flex-col items-center justify-center text-primary flex-shrink-0">
                        <span className="text-base font-bold">{format(start, 'd')}</span>
                        <span className="text-[9px] uppercase">{format(start, 'EEE')}</span>
                      </div>
                      <div className="flex-1 py-1.5 pr-2 bg-amber-100 dark:bg-amber-900/30 rounded-r my-0.5">
                        <div className="font-bold text-xs">
                          {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                        </div>
                        <div className="text-xs font-medium line-clamp-1">
                          {emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned'}
                        </div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2">
                          {client?.companyName || 'No client'} · {shift.title || 'No position'}
                        </div>
                        {/* Workflow actions for draft/pending shifts */}
                        {shift.status === 'draft' && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Button
                              size="default"
                              variant="default"
                              className="flex-1 min-w-[80px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptShift(shift);
                              }}
                              data-testid={`btn-accept-${shift.id}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="default"
                              variant="outline"
                              className="flex-1 min-w-[80px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeclineShift(shift);
                              }}
                              data-testid={`btn-decline-${shift.id}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : displayEmployees.length === 0 && openShifts.length === 0 && viewMode === 'full' ? (
            <Card className="p-4 mx-2 mt-2">
              <div className="text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <div className="font-medium text-sm mb-0.5">No employees found</div>
                <div className="text-xs">Add employees to start scheduling</div>
              </div>
            </Card>
          ) : viewMode === 'my' ? (
            /* My Schedule View - Compact */
            <div className="divide-y divide-border">
              {weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const myDayShifts = shifts.filter(s => 
                  format(new Date(s.startTime), 'yyyy-MM-dd') === dayStr && 
                  s.employeeId === currentEmployee?.id
                );
                const dayIsToday = isToday(day);
                
                return (
                  <div key={dayStr}>
                    {myDayShifts.length > 0 ? (
                      myDayShifts.map((shift, idx) => {
                        const start = new Date(shift.startTime);
                        const end = new Date(shift.endTime);
                        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                        const client = clients.find(c => c.id === shift.clientId);
                        const bgColor = shift.status === 'confirmed' 
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : shift.status === 'completed'
                          ? 'bg-gray-100 dark:bg-gray-800/30'
                          : 'bg-blue-100 dark:bg-blue-900/30';
                        
                        return (
                          <div
                            key={shift.id}
                            onClick={() => handleViewShift(shift)}
                            className="flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50"
                            data-testid={`my-shift-${shift.id}`}
                          >
                            <div className={`w-10 py-1.5 flex flex-col items-center justify-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                              {idx === 0 && (
                                <>
                                  <span className="text-base font-bold">{format(day, 'd')}</span>
                                  <span className="text-[9px] uppercase">{format(day, 'EEE')}</span>
                                </>
                              )}
                            </div>
                            <div className={`flex-1 py-1.5 pr-2 ${bgColor} rounded-r my-0.5`}>
                              <div className="font-bold text-xs">
                                {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                              </div>
                              <div className="text-[10px] text-muted-foreground line-clamp-2">
                                {client?.companyName || 'No client'} · {shift.title || 'No position'}
                              </div>
                              {/* Workflow actions for My Schedule draft shifts */}
                              {shift.status === 'draft' && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Button
                                    size="default"
                                    variant="default"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcceptShift(shift);
                                    }}
                                    data-testid={`btn-confirm-${shift.id}`}
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Confirm
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center py-2 px-2">
                        <div className={`w-10 text-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                          <div className="text-base font-bold">{format(day, 'd')}</div>
                          <div className="text-[9px] uppercase">{format(day, 'EEE')}</div>
                        </div>
                        <div className="flex-1 ml-2">
                          <span className="text-muted-foreground text-xs">
                            {dayIsToday ? 'No shift today' : 'Day off'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Full Schedule View - Compact */
            <div className="divide-y divide-border">
              {weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayIsToday = isToday(day);
                const dayOpenShifts = shifts.filter(s => 
                  format(new Date(s.startTime), 'yyyy-MM-dd') === dayStr && !s.employeeId
                );
                const dayAssignedShifts = shifts.filter(s => 
                  format(new Date(s.startTime), 'yyyy-MM-dd') === dayStr && s.employeeId
                );
                const allDayShifts = [...dayOpenShifts, ...dayAssignedShifts];
                
                if (allDayShifts.length === 0) {
                  return (
                    <div key={dayStr} className="flex items-center py-2 px-2">
                      <div className={`w-10 text-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                        <div className="text-base font-bold">{format(day, 'd')}</div>
                        <div className="text-[9px] uppercase">{format(day, 'EEE')}</div>
                      </div>
                      <div className="flex-1 ml-2">
                        <span className="text-muted-foreground text-xs">No shifts scheduled</span>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={dayStr}>
                    {/* Open Shifts for this day - Compact */}
                    {dayOpenShifts.map((shift, idx) => {
                      const start = new Date(shift.startTime);
                      const end = new Date(shift.endTime);
                      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                      const client = clients.find(c => c.id === shift.clientId);
                      
                      return (
                        <div
                          key={shift.id}
                          onClick={() => handleViewShift(shift)}
                          className="flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50"
                          data-testid={`shift-row-${shift.id}`}
                        >
                          <div className={`w-10 py-1.5 flex flex-col items-center justify-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                            {idx === 0 && dayAssignedShifts.length === 0 && (
                              <>
                                <span className="text-base font-bold">{format(day, 'd')}</span>
                                <span className="text-[9px] uppercase">{format(day, 'EEE')}</span>
                              </>
                            )}
                          </div>
                          <div className="flex-1 py-1.5 pr-1 bg-amber-100 dark:bg-amber-900/30 rounded-r my-0.5">
                            <div className="font-bold text-xs text-amber-800 dark:text-amber-200">
                              {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                            </div>
                            <div className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              OPEN SHIFT
                            </div>
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 line-clamp-2">
                              {client?.companyName || 'No client'} · {shift.title || 'Position needed'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="self-center mr-1 min-h-[44px] text-xs bg-amber-600 hover:bg-amber-700"
                            disabled={!currentEmployee?.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClaimShift(shift);
                            }}
                          >
                            Claim
                          </Button>
                        </div>
                      );
                    })}
                    
                    {/* Assigned Shifts for this day */}
                    {dayAssignedShifts.map((shift, idx) => {
                      const start = new Date(shift.startTime);
                      const end = new Date(shift.endTime);
                      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                      const emp = employees.find(e => e.id === shift.employeeId);
                      const client = clients.find(c => c.id === shift.clientId);
                      const bgColor = shift.status === 'confirmed' 
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : shift.status === 'completed'
                        ? 'bg-gray-100 dark:bg-gray-800/30'
                        : 'bg-blue-100 dark:bg-blue-900/30';
                      
                      return (
                        <div
                          key={shift.id}
                          onClick={() => handleViewShift(shift)}
                          className="flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50"
                          data-testid={`shift-row-${shift.id}`}
                        >
                          <div className={`w-10 py-1.5 flex flex-col items-center justify-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                            {idx === 0 && (
                              <>
                                <span className="text-base font-bold">{format(day, 'd')}</span>
                                <span className="text-[9px] uppercase">{format(day, 'EEE')}</span>
                              </>
                            )}
                          </div>
                          <div className={`flex-1 py-1.5 pr-2 ${bgColor} rounded-r my-0.5`}>
                            <div className="font-bold text-xs">
                              {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                            </div>
                            <div className="text-xs font-medium line-clamp-1">
                              {emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned'}
                            </div>
                            <div className="text-[10px] text-muted-foreground line-clamp-2">
                              {client?.companyName || 'No client'} · {shift.title || 'No position'}
                            </div>
                            {/* Workflow actions for assigned draft shifts */}
                            {shift.status === 'draft' && shift.employeeId === currentEmployee?.id && (
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="lg"
                                  variant="default"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptShift(shift);
                                  }}
                                  data-testid={`btn-confirm-full-${shift.id}`}
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Confirm
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="self-center pr-1">
                            <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Floating Action Buttons - Accessible touch targets */}
      <div className="fixed bottom-16 left-2 right-2 z-40 flex justify-between pointer-events-none">
        {/* Add Shift FAB - Left side */}
        {canEdit && (
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-lg pointer-events-auto"
            onClick={() => {
              setSelectedEmployee(undefined);
              setEditingShift(undefined);
              setSheetOpen(true);
            }}
            data-testid="fab-add-shift"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
        
        {/* Manager Tools FAB - Right side - Accessible touch */}
        {isManagerOrSupervisor && (
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-lg pointer-events-auto bg-secondary text-secondary-foreground hover:bg-secondary/90"
            onClick={() => setShowManagerTools(true)}
            data-testid="fab-manager-tools"
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Manager Tools Drawer - Compact */}
      <Sheet open={showManagerTools} onOpenChange={setShowManagerTools}>
        <SheetContent side="bottom" className="h-auto max-h-[45vh]">
          <SheetHeader>
            <SheetTitle className="text-sm">Schedule Tools</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            <Button
              variant="outline"
              className="h-14 flex-col gap-1"
              onClick={() => {
                setShowManagerTools(false);
                setShowApprovals(true);
              }}
              data-testid="tool-approvals"
            >
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xs">Approvals</span>
              {pendingShifts.length > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1 h-3.5">
                  {pendingShifts.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-14 flex-col gap-1"
              onClick={() => {
                setShowManagerTools(false);
                setSwapShift(null);
                setShowSwaps(true);
              }}
              data-testid="tool-swaps"
            >
              <ArrowRightLeft className="h-4 w-4 text-cyan-600" />
              <span className="text-xs">Swaps</span>
            </Button>
            {!isSimpleMode && (
              <>
                <Button
                  variant="outline"
                  className="h-14 flex-col gap-1"
                  onClick={() => {
                    setShowManagerTools(false);
                    setShowTemplates(true);
                  }}
                  data-testid="tool-templates"
                >
                  <LayoutTemplate className="h-4 w-4 text-purple-600" />
                  <span className="text-xs">Templates</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-14 flex-col gap-1"
                  onClick={() => {
                    setShowManagerTools(false);
                    setShowReports(true);
                  }}
                  data-testid="tool-reports"
                >
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span className="text-xs">Reports</span>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              className="h-14 flex-col gap-1"
              onClick={() => {
                setShowManagerTools(false);
                setShowCalendarSync(true);
              }}
              data-testid="tool-export"
            >
              <Download className="h-4 w-4 text-indigo-600" />
              <span className="text-xs">Export</span>
            </Button>
            <Button
              variant="outline"
              className="h-14 flex-col gap-1"
              onClick={() => {
                setShowManagerTools(false);
                setShowTrinityInsights(!showTrinityInsights);
              }}
              data-testid="tool-trinity"
            >
              <TrinityMascotIcon size={16} />
              <span className="text-xs">Trinity AI</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
