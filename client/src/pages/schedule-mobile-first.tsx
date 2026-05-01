/**
 * Mobile-First Schedule - Complete redesign with proper popups and role-based views
 * Features: Week stats, day tabs, employee shift cards, shift detail popup, AI FAB, manager tools
 * Enhanced with recurring shifts, shift swapping, templates, and duplication
 */

import { secureFetch } from "@/lib/csrf";
import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { startOfWeek, addDays, addWeeks, format, isToday } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { useClientLookup } from '@/hooks/useClients';
import { useEmployee } from '@/hooks/useEmployee';
import { isSupervisorOrAbove } from '@/lib/roleHierarchy';
import { useTrinitySchedulingProgress } from '@/hooks/use-trinity-scheduling-progress';
import { TrinitySchedulingSummaryModal } from '@/components/trinity-scheduling-summary-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Plus, ChevronLeft, ChevronRight, Menu,
  Users, Clock, BarChart3, CheckCircle,
  ArrowRightLeft, LayoutTemplate, Download,
  Check, X
} from 'lucide-react';
import { UniversalModal, UniversalModalHeader, UniversalModalBody, UniversalModalTitle } from '@/components/ui/universal-modal';
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
import { TrinityStatusBar, TrinityThinkingPanel } from '@/components/schedule/TrinitySchedulingFeedback';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import { TrinityLoadingSpinner } from '@/components/trinity-loading-overlay';
import { useSimpleMode } from '@/contexts/SimpleModeContext';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { ShiftCardSkeleton } from '@/components/ui/skeleton-loaders';
import type { Shift, Employee, Client } from '@shared/schema';
import { getShiftStatus, SHIFT_STATUS, type ShiftStatusConfig } from '@/constants/scheduling';
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Get shift status styling using centralized constants from /constants/scheduling.ts
 * Returns border classes, background, and badge info for at-a-glance status
 * 
 * UNIFIED STATUS SYSTEM:
 * - DRAFT: Dashed amber border (new shifts)
 * - ASSIGNED: Dashed blue border (officer added)
 * - PUBLISHED: Solid green border (live shift)
 * - UNFILLED: Solid red border (urgent - no officer)
 * - ACTIVE: Solid purple with pulse (in progress)
 * - COMPLETED: Solid gray border (finished)
 */
function getShiftStatusStyling(shift: Shift): {
  borderClass: string;
  bgClass: string;
  badgeText: string;
  badgeClass: string;
  isActive: boolean;
} {
  // Use centralized status logic from constants
  const status = getShiftStatus({
    startTime: shift.startTime,
    endTime: shift.endTime,
    officerId: shift.employeeId,
    isPublished: shift.status === 'published' || shift.status === 'scheduled',
    clockedIn: (shift as any).clockedIn || false,
    status: shift.status || undefined,
  });
  
  // Map centralized config to component styling
  // Convert tailwindBorder to left-border style for mobile cards
  const borderClass = status.key === 'active' 
    ? 'border-l-4 border-violet-500 shift-card-active'
    : `border-l-4 ${status.tailwindBorder.replace('border-2 border-solid ', '').replace('border-2 border-dashed ', 'border-dashed ')}`;
  
  // Use tailwindBg from config with enhanced opacity for dark mode
  const bgClass = `${status.tailwindBg} dark:${status.tailwindBg.replace('/5', '/15')}`;
  
  // Badge styling based on status color
  const badgeColorMap: Record<string, string> = {
    draft: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-400',
    assigned: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-400',
    published: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-400',
    unfilled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-400',
    active: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-400',
    completed: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-400',
  };
  
  return {
    borderClass,
    bgClass,
    badgeText: status.label.toUpperCase(),
    badgeClass: badgeColorMap[status.key] || badgeColorMap.draft,
    isActive: status.key === 'active',
  };
}

/**
 * Get position color for shift card color strip
 * Position colors: Armed (red), Unarmed (slate), Supervisor (amber), Manager (indigo), Owner (violet)
 */
function getPositionColor(title: string | null | undefined): string {
  if (!title) return 'bg-slate-400'; // Default for no position
  
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('armed') && !titleLower.includes('unarmed')) {
    return 'bg-red-600'; // Armed: #DC2626
  }
  if (titleLower.includes('unarmed')) {
    return 'bg-slate-600'; // Unarmed: #475569
  }
  if (titleLower.includes('supervisor') || titleLower.includes('sup')) {
    return 'bg-amber-600'; // Supervisor: #D97706
  }
  if (titleLower.includes('manager') || titleLower.includes('mgr')) {
    return 'bg-indigo-600'; // Manager: #4F46E5
  }
  if (titleLower.includes('owner') || titleLower.includes('admin')) {
    return 'bg-violet-600'; // Owner: #7C3AED
  }
  
  return 'bg-slate-400'; // Default
}

function ScheduleMobileFirstInner({ defaultViewMode }: { defaultViewMode?: 'my' | 'full' | 'pending' }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { workspaceRole, workspaceId } = useWorkspaceAccess();
  const { employee: currentEmployee } = useEmployee();
  const { isSimpleMode } = useSimpleMode();
  
  // Trinity scheduling visual feedback
  const { 
    session: trinitySession, 
    trinityWorking,
    completionResult: trinityCompletionResult,
    isShiftBeingProcessed,
    wasShiftJustAssigned,
    clearSession: clearTrinitySession,
  } = useTrinitySchedulingProgress(workspaceId);
  const [showTrinitySummary, setShowTrinitySummary] = useState(false);
  
  const isManagerOrSupervisor = useMemo(() => {
    if (!currentEmployee || !currentEmployee.workspaceRole) return false;
    return isSupervisorOrAbove(currentEmployee.workspaceRole);
  }, [currentEmployee]);
  
  const canEdit = isManagerOrSupervisor;

  // State
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>();
  const [editingShift, setEditingShift] = useState<Shift | undefined>();
  const [viewMode, setViewMode] = useState<'my' | 'full' | 'pending'>(defaultViewMode || 'my');
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

  // ── Phase 26H — supervisor one-click "mark as calloff" deep-link handler ──
  // missedClockInWorkflow supervisor escalation notifications (Phase 26G) link
  // to /schedule?shiftId=X&action=calloff. We read the params, confirm with
  // the supervisor, and POST /api/shifts/:id/mark-calloff which fires the
  // full calloff coverage flow (Phase 26H mark-calloff endpoint).
  const [calloffPromptShiftId, setCalloffPromptShiftId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const shiftId = params.get('shiftId');
    if (action === 'calloff' && shiftId) {
      setCalloffPromptShiftId(shiftId);
      // Scrub the URL so a refresh doesn't re-open the prompt.
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);
  const markCalloffMutation = useMutation({
    mutationFn: async (shiftId: string) =>
      apiRequest('POST', `/api/shifts/${shiftId}/mark-calloff`, {
        reason: 'supervisor_confirmed_no_show',
      }),
    onSuccess: () => {
      toast({
        title: 'Shift marked as calloff',
        description: 'Replacement broadcast has been sent to available officers.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      setCalloffPromptShiftId(null);
    },
    onError: (err) => {
      toast({
        title: 'Could not mark shift as calloff',
        description: err?.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Fetch shifts for the week
  const weekEnd = addDays(weekStart, 7);
  const { data: shifts = [], isLoading: shiftsLoading, isError: shiftsError, refetch: refetchShifts } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const res = await secureFetch(`/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch shifts');
      const json = await res.json();
      return Array.isArray(json) ? json : (json?.data ?? []);
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    staleTime: 30_000,
  });

  // Worker pay period earnings — shown in stats bar on My Schedule view
  const { data: earningsData } = useQuery<{
    hoursWorked: number;
    earnings: number;
    projectedEarnings: number;
    hourlyRate: number;
    payPeriodStart: string | null;
    payPeriodEnd: string | null;
  }>({
    queryKey: ['/api/dashboard/worker-earnings'],
    enabled: viewMode === 'my' && !!currentEmployee?.id,
    staleTime: 60_000,
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<{ data: Employee[] }, Error, Employee[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
  });

  // Fetch clients
  const { data: clients = [] } = useClientLookup();

  // Show Trinity summary modal when auto-fill completes (biological feedback loop)
  useEffect(() => {
    if (trinityCompletionResult && trinityCompletionResult.summary?.openShiftsFilled > 0) {
      setShowTrinitySummary(true);
    }
  }, [trinityCompletionResult]);

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

  // Calculate weekly hours per employee
  const activeStatusSet = useMemo(() => new Set(['published', 'scheduled', 'in_progress', 'completed', 'confirmed', 'approved', 'auto_approved']), []);

  const activeShifts = useMemo(() => {
    return shifts.filter(s => s.status && activeStatusSet.has(s.status));
  }, [shifts, activeStatusSet]);

  const weeklyHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    activeShifts.forEach(shift => {
      if (shift.employeeId) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        map.set(shift.employeeId, (map.get(shift.employeeId) || 0) + hours);
      }
    });
    return map;
  }, [activeShifts]);

  const weeklyHoursDisplay = useMemo(() => {
    if (viewMode === 'my' && currentEmployee?.id) {
      const hours = weeklyHoursMap.get(currentEmployee.id) || 0;
      return `${Math.round(hours)}h this week`;
    }
    const employeeCount = weeklyHoursMap.size;
    if (employeeCount === 0) return '0h this week';
    let total = 0;
    weeklyHoursMap.forEach(h => { total += h; });
    const avg = total / employeeCount;
    return `${employeeCount} staff · avg ${Math.round(avg)}h/wk`;
  }, [viewMode, currentEmployee, weeklyHoursMap]);

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
    mutationFn: async (data) => {
      const res = await apiRequest('POST', '/api/shifts', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shift created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });

      setSheetOpen(false);
      setSelectedEmployee(undefined);
      setEditingShift(undefined);
    },
    onError: (error) => {
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
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });

    },
    onError: (error) => {
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
      try {
        await deleteShiftMutation.mutateAsync(shift.id);
      } catch {
        // Error is handled by mutation's onError callback
      }
    }
  };

  const handleSubmitShift = async (data) => {
    try {
      await createShiftMutation.mutateAsync(data);
    } catch {
      // Error is already handled by the mutation's onError callback
    }
  };
  
  const [claimingShiftId, setClaimingShiftId] = React.useState<string | null>(null);
  const handleClaimShift = async (shift: Shift) => {
    if (!currentEmployee?.id) {
      toast({ title: "Unable to claim shift", description: "Please wait for your profile to load", variant: "destructive" });
      return;
    }
    if (claimingShiftId === shift.id) return; // debounce — prevent triple-fire on double-tap
    setClaimingShiftId(shift.id);
    try {
      await apiRequest('POST', `/api/shifts/${shift.id}/pickup`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      setDetailSheetOpen(false);
      toast({ title: "Shift claimed", description: "This shift is now yours." });
    } catch (error: any) {
      toast({ title: "Failed to claim shift", description: error?.message || "Please try again", variant: "destructive" });
    } finally {
      setClaimingShiftId(null);
    }
  };

  const handleAcceptShift = async (shift: Shift) => {
    try {
      // Route based on ownership:
      // - Assigned to me (draft) → /acknowledge (confirm my shift)
      // - Unassigned / open → /pickup (claim the open shift)
      const isMyShift = shift.employeeId && shift.employeeId === currentEmployee?.id;
      const endpoint = isMyShift ? 'acknowledge' : 'pickup';
      await apiRequest('POST', `/api/shifts/${shift.id}/${endpoint}`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      const msg = isMyShift ? 'You are confirmed for this shift.' : 'Shift claimed successfully.';
      toast({ title: 'Shift accepted', description: msg });
    } catch (error: any) {
      toast({
        title: 'Failed to accept shift',
        description: error?.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleDeclineShift = async (shift: Shift) => {
    try {
      // POST /deny is the dedicated officer decline endpoint
      await apiRequest('POST', `/api/shifts/${shift.id}/deny`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      toast({ title: 'Shift declined', description: 'Your supervisor has been notified.' });
    } catch (error: any) {
      toast({
        title: 'Failed to decline shift',
        description: error?.message || 'Please try again',
        variant: 'destructive',
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
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });

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
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });

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
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'], exact: false });

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

  const pageConfig: CanvasPageConfig = {
    id: 'schedule-mobile-first',
    title: 'Schedule',
    category: 'operations',
    withBottomNav: true,
    showHeader: false, // Custom header with calendar navigation below
  };

  return (
    <CanvasHubPage config={pageConfig}>
    <div className="flex flex-col bg-background pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Sticky header block — pins at top within MobilePageWrapper scroll container */}
      <div className="sticky top-0 z-10">
      {/* Trinity Scheduling Status Bar - Shows when Trinity is auto-scheduling */}
      <TrinityStatusBar 
        session={trinitySession}
        onAbort={() => {
          toast({ 
            title: 'Trinity scheduling stopped', 
            description: 'You can restart auto-scheduling anytime.',
          });
          clearTrinitySession();
        }}
      />
      
      {/* Unified Schedule Header - Ultra Compact Mobile */}
      <div className="bg-primary text-primary-foreground shrink-0">
        {/* Row 1: Nav + Month + Tabs + Tools - single tight row */}
        <div className="flex items-center gap-0.5 px-1 py-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousWeek}
            className="h-11 w-11 md:h-9 md:w-9 text-primary-foreground hover:bg-primary-foreground/20"
            data-testid="button-prev-week"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-xs whitespace-nowrap">{format(weekStart, 'MMM yyyy')}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextWeek}
            className="h-11 w-11 md:h-9 md:w-9 text-primary-foreground hover:bg-primary-foreground/20"
            data-testid="button-next-week"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="flex-1" />

          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedEmployee(undefined);
                setEditingShift(undefined);
                setSheetOpen(true);
              }}
              className="h-11 w-11 md:h-9 md:w-9 text-primary-foreground hover:bg-primary-foreground/20"
              data-testid="btn-add-shift-header"
              aria-label="Add shift"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          {isManagerOrSupervisor && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowManagerTools(true)}
              className="h-11 w-11 md:h-9 md:w-9 text-primary-foreground hover:bg-primary-foreground/20 relative"
              data-testid="btn-manager-tools-header"
              aria-label="Manager tools"
            >
              <Menu className="h-4 w-4" />
              {pendingShifts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full h-3 min-w-3 flex items-center justify-center">
                  {pendingShifts.length}
                </span>
              )}
            </Button>
          )}
        </div>

        {/* Row 2: View Mode Tabs */}
        <div className="px-1 pb-0">
          <div className="flex bg-primary-foreground/15 rounded p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('my')}
              className={['flex-1 py-0.5 text-[10px] font-semibold rounded transition-all', viewMode === 'my' 
                  ? 'bg-primary-foreground text-primary shadow-sm' 
                  : 'text-primary-foreground/90 hover:bg-primary-foreground/10'].join(' ')}
              data-testid="tab-my-schedule"
            >
              My Schedule
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={['flex-1 py-0.5 text-[10px] font-semibold rounded transition-all', viewMode === 'full' 
                  ? 'bg-primary-foreground text-primary shadow-sm' 
                  : 'text-primary-foreground/90 hover:bg-primary-foreground/10'].join(' ')}
              data-testid="tab-full-schedule"
            >
              Full Team
            </button>
            <button
              onClick={() => setViewMode('pending')}
              className={['flex-1 py-0.5 text-[10px] font-semibold rounded transition-all relative', viewMode === 'pending' 
                  ? 'bg-primary-foreground text-primary shadow-sm' 
                  : 'text-primary-foreground/90 hover:bg-primary-foreground/10'].join(' ')}
              data-testid="tab-pending"
            >
              Pending
              {pendingShifts.length > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-3.5 min-w-3.5 text-[8px] px-0.5">
                  {pendingShifts.length}
                </Badge>
              )}
            </button>
          </div>
        </div>

        {/* Row 3: Day Picker + Info merged — minimal height */}
        <div className="grid grid-cols-7 gap-px px-1 pb-0.5 pt-0.5">
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
                className={['flex flex-col items-center justify-center min-h-[28px] py-0 rounded transition-all', isSelected 
                    ? 'bg-primary-foreground text-primary shadow-sm' 
                    : 'text-primary-foreground/90 hover:bg-primary-foreground/10'].join(' ')}
                data-testid={`day-tab-${format(day, 'yyyy-MM-dd')}`}
              >
                <span className={['text-[7px] uppercase font-medium leading-none', isSelected ? 'text-primary/70' : 'opacity-70'].join(' ')}>
                  {format(day, 'EEE').slice(0, 2)}
                </span>
                <span className={`text-[11px] font-bold leading-none ${dayIsToday && !isSelected ? 'text-yellow-300' : ''}`}>
                  {format(day, 'd')}
                </span>
                {dayShiftCount > 0 && (
                  <div className={['w-1 h-1 rounded-full', isSelected ? 'bg-primary' : 'bg-primary-foreground/50'].join(' ')} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Info Bar — thin single-line strip */}
      <div className="bg-muted/50 border-b border-border px-3 py-0 flex items-center justify-between gap-2 shrink-0" style={{ height: '20px' }}>
        <span className="font-semibold text-[10px] text-foreground">
          {format(selectedDate, 'EEE, MMM d')}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {viewMode === 'my' && earningsData?.earnings != null
            ? `${weeklyHoursDisplay} · $${earningsData.earnings.toFixed(0)} earned`
            : weeklyHoursDisplay}
        </span>
      </div>
      </div>{/* end sticky header block */}

      {/* Content area — MobilePageWrapper owns the scroll */}
      <div>
        {/* Trinity Thinking Panel - Shows real-time thought process at top */}
        <TrinityThinkingPanel
          thoughts={trinitySession.thoughts}
          isWorking={trinityWorking}
          onClear={clearTrinitySession}
        />
        
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
        
        {/* Mobile Trinity Insights - Managers only - hidden when Trinity is actively scheduling */}
        {isManagerOrSupervisor && showTrinityInsights && !trinityWorking && trinitySession.thoughts.length === 0 && (
          <div className="mx-3 mt-2 mb-16 space-y-3">
            <TrinityInsightsPanel
              weekStart={weekStart}
              weekEnd={addDays(weekStart, 6)}
              shifts={shifts}
              employees={employees}
              clients={clients}
              isCollapsed={false}
              onToggleCollapse={() => setShowTrinityInsights(false)}
            />
            <TrinityTrainingPanel workspaceId={workspaceId} />
          </div>
        )}

        <div className="pb-24">
          {shiftsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <span className="text-destructive text-lg">!</span>
              </div>
              <p className="text-sm font-medium text-foreground">Failed to load schedule</p>
              <p className="text-xs text-muted-foreground mt-1">Check your connection and try again</p>
            </div>
          ) : shiftsLoading || (viewMode === 'my' && !currentEmployee?.id) ? (
            <div className="px-3 py-4 space-y-3">
              {[1, 2, 3].map(i => (
                <ShiftCardSkeleton key={i} />
              ))}
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
                  // Use enriched clientName from API response, fallback to client lookup for backwards compatibility
                  const clientName = (shift as any).clientName || clients.find(c => c.id === shift.clientId)?.companyName;
                  
                  const pendingStatusStyle = getShiftStatusStyling(shift);
                  const positionColor = getPositionColor(shift.title);
                  const isPendingBeingProcessed = isShiftBeingProcessed(shift.id);
                  const wasPendingJustAssigned = wasShiftJustAssigned(shift.id);
                  
                  return (
                    <div
                      key={shift.id}
                      onClick={() => handleViewShift(shift)}
                      className={`relative flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50 overflow-hidden ${pendingStatusStyle.borderClass} ${pendingStatusStyle.bgClass} my-0.5 rounded-r ${isPendingBeingProcessed ? 'trinity-shift-processing' : ''} ${wasPendingJustAssigned ? 'trinity-shift-assigned' : ''}`}
                      data-testid={`pending-shift-${shift.id}`}
                    >
                      <div className="w-12 py-1.5 flex flex-col items-center justify-center text-primary flex-shrink-0">
                        <span className="text-base font-bold leading-none">{format(start, 'd')}</span>
                        <span className="text-[9px] uppercase leading-none mt-0.5">{format(start, 'EEE')}</span>
                      </div>
                      <div className="flex-1 min-w-0 py-1.5 pr-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-bold text-xs whitespace-nowrap">
                            {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                          </div>
                          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${pendingStatusStyle.badgeClass}`}>
                            {pendingStatusStyle.badgeText}
                          </span>
                        </div>
                        <div className="text-xs font-medium truncate">
                          {emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned'}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {clientName || 'No client'} · {shift.title || 'No position'}
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
                      {/* Position color strip */}
                      <div className={`w-1.5 ${positionColor} rounded-r flex-shrink-0`} title={shift.title || 'No position'} />
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
                        const clientName = (shift as any).clientName || clients.find(c => c.id === shift.clientId)?.companyName;
                        const statusStyle = getShiftStatusStyling(shift);
                        const positionColor = getPositionColor(shift.title);
                        
                        const isMyBeingProcessed = isShiftBeingProcessed(shift.id);
                        const wasMyJustAssigned = wasShiftJustAssigned(shift.id);
                        
                        return (
                          <div
                            key={shift.id}
                            onClick={() => handleViewShift(shift)}
                            className={`relative flex items-stretch min-h-[44px] cursor-pointer active:bg-muted/50 overflow-hidden ${statusStyle.borderClass} ${statusStyle.bgClass} my-0.5 rounded-r ${isMyBeingProcessed ? 'trinity-shift-processing' : ''} ${wasMyJustAssigned ? 'trinity-shift-assigned' : ''}`}
                            data-testid={`my-shift-${shift.id}`}
                          >
                            <div className={`w-12 py-1.5 flex flex-col items-center justify-center flex-shrink-0 ${dayIsToday ? 'text-primary' : ''}`}>
                              {idx === 0 && (
                                <>
                                  <span className="text-base font-bold leading-none">{format(day, 'd')}</span>
                                  <span className="text-[9px] uppercase leading-none mt-0.5">{format(day, 'EEE')}</span>
                                </>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 py-1.5 pr-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-bold text-xs whitespace-nowrap">
                                  {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                                </div>
                                <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${statusStyle.badgeClass}`}>
                                  {statusStyle.badgeText}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {clientName || 'No client'} · {shift.title || 'No position'}
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
                            {/* Position color strip */}
                            <div className={`w-1.5 ${positionColor} rounded-r flex-shrink-0`} title={shift.title || 'No position'} />
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center py-3 px-3 gap-3">
                        <div className={['w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0', dayIsToday ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground'].join(' ')}>
                          <div className="text-sm font-bold leading-none">{format(day, 'd')}</div>
                          <div className="text-[9px] uppercase leading-none mt-0.5 opacity-70">{format(day, 'EEE')}</div>
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                          <span className={['text-sm font-medium', dayIsToday ? 'text-foreground' : 'text-muted-foreground/70'].join(' ')}>
                            {dayIsToday ? 'No shift today' : 'Day off'}
                          </span>
                          {!dayIsToday && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/60 uppercase tracking-wide">
                              Free
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Full Schedule View - GetSling-style with clear day headers */
            <div className="space-y-0">
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
                
                return (
                  <div key={dayStr} className="border-b border-border last:border-b-0">
                    {/* Day Header - Blue theme matching brand colors */}
                    <div className={['flex items-center gap-3 px-3 py-2.5 overflow-hidden', dayIsToday 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'].join(' ')}>
                      <div className="text-center min-w-[48px] shrink-0">
                        <div className="text-lg font-bold leading-none">{format(day, 'd')}</div>
                        <div className="text-[10px] uppercase font-semibold opacity-80 leading-none mt-0.5">{format(day, 'EEE')}</div>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">
                          {format(day, 'MMMM')}
                        </span>
                        <span className={`text-xs font-medium whitespace-nowrap shrink-0 ${dayIsToday ? 'opacity-80' : 'text-blue-700 dark:text-blue-300'}`}>
                          {allDayShifts.length} {allDayShifts.length === 1 ? 'shift' : 'shifts'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Shifts for this day */}
                    {allDayShifts.length === 0 ? (
                      <div className="py-3 px-3 text-center">
                        <span className="text-muted-foreground text-xs">No shifts scheduled</span>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {/* Open Shifts for this day - UNFILLED status styling */}
                        {dayOpenShifts.map((shift) => {
                          const start = new Date(shift.startTime);
                          const end = new Date(shift.endTime);
                          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                          const clientName = (shift as any).clientName || clients.find(c => c.id === shift.clientId)?.companyName;
                          
                          const isOpenBeingProcessed = isShiftBeingProcessed(shift.id);
                          const wasOpenJustAssigned = wasShiftJustAssigned(shift.id);
                          
                          return (
                            <div
                              key={shift.id}
                              onClick={() => handleViewShift(shift)}
                              className={`relative flex items-center gap-2 px-3 py-2 cursor-pointer active:bg-muted/50 overflow-hidden border-l-4 border-red-500 bg-red-50/50 dark:bg-red-900/10 ${isOpenBeingProcessed ? 'trinity-shift-processing' : ''} ${wasOpenJustAssigned ? 'trinity-shift-assigned' : ''}`}
                              data-testid={`shift-row-${shift.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-bold text-xs whitespace-nowrap">
                                    {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                                  </div>
                                  <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                                    UNFILLED
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {clientName || 'No client'} · {shift.title || 'Position needed'}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="shrink-0 text-xs bg-red-600 hover:bg-red-700"
                                disabled={!currentEmployee?.id || claimingShiftId === shift.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaimShift(shift);
                                }}
                              >
                                {claimingShiftId === shift.id ? (
                                  <><span className="animate-spin mr-1">⟳</span> Claiming…</>
                                ) : 'Claim'}
                              </Button>
                            </div>
                          );
                        })}
                        
                        {/* Assigned Shifts for this day - Fortune 500 status styling */}
                        {dayAssignedShifts.map((shift) => {
                          const start = new Date(shift.startTime);
                          const end = new Date(shift.endTime);
                          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                          const emp = employees.find(e => e.id === shift.employeeId);
                          const clientName = (shift as any).clientName || clients.find(c => c.id === shift.clientId)?.companyName;
                          const statusStyle = getShiftStatusStyling(shift);
                          const positionColor = getPositionColor(shift.title);
                          const isBeingProcessed = isShiftBeingProcessed(shift.id);
                          const wasJustAssigned = wasShiftJustAssigned(shift.id);
                          
                          return (
                            <div
                              key={shift.id}
                              onClick={() => handleViewShift(shift)}
                              className={`relative flex items-stretch gap-2 px-3 py-2 cursor-pointer active:bg-muted/50 overflow-hidden ${statusStyle.borderClass} ${statusStyle.bgClass} ${isBeingProcessed ? 'trinity-shift-processing' : ''} ${wasJustAssigned ? 'trinity-shift-assigned' : ''}`}
                              data-testid={`shift-row-${shift.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-bold text-xs whitespace-nowrap">
                                    {format(start, 'h:mma')}-{format(end, 'h:mma')} · {hours.toFixed(0)}h
                                  </div>
                                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${statusStyle.badgeClass}`}>
                                    {statusStyle.badgeText}
                                  </span>
                                </div>
                                <div className="text-xs font-medium truncate">
                                  {emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned'}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {clientName || 'No client'} · {shift.title || 'No position'}
                                </div>
                                {shift.status === 'draft' && shift.employeeId === currentEmployee?.id && (
                                  <div className="flex gap-2 mt-2">
                                    <Button
                                      size="sm"
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
                              <div className="flex items-center gap-2">
                                <ArrowRightLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                                {/* Position color strip */}
                                <div className={`w-1.5 h-full min-h-[40px] ${positionColor} rounded flex-shrink-0`} title={shift.title || 'No position'} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* Manager Tools Drawer */}
      <UniversalModal open={showManagerTools} onOpenChange={setShowManagerTools} side="bottom" className="h-auto max-max-h-[calc(65dvh-56px)] sm:max-h-[65dvh] overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle>Schedule Tools</UniversalModalTitle>
        </UniversalModalHeader>
        <UniversalModalBody>
          <div className="grid grid-cols-2 gap-3 pb-2">
            <Button
              variant="outline"
              className="flex-col gap-1.5 py-4"
              onClick={() => {
                setShowManagerTools(false);
                setShowApprovals(true);
              }}
              data-testid="tool-approvals"
            >
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="text-sm font-medium">Approvals</span>
              {pendingShifts.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5">
                  {pendingShifts.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-col gap-1.5 py-4"
              onClick={() => {
                setShowManagerTools(false);
                setSwapShift(null);
                setShowSwaps(true);
              }}
              data-testid="tool-swaps"
            >
              <ArrowRightLeft className="h-5 w-5 text-cyan-600 shrink-0" />
              <span className="text-sm font-medium">Swaps</span>
            </Button>
            {!isSimpleMode && (
              <>
                <Button
                  variant="outline"
                  className="flex-col gap-1.5 py-4"
                  onClick={() => {
                    setShowManagerTools(false);
                    setShowTemplates(true);
                  }}
                  data-testid="tool-templates"
                >
                  <LayoutTemplate className="h-5 w-5 text-purple-600 shrink-0" />
                  <span className="text-sm font-medium">Templates</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col gap-1.5 py-4"
                  onClick={() => {
                    setShowManagerTools(false);
                    setShowReports(true);
                  }}
                  data-testid="tool-reports"
                >
                  <BarChart3 className="h-5 w-5 text-blue-600 shrink-0" />
                  <span className="text-sm font-medium">Reports</span>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              className="flex-col gap-1.5 py-4"
              onClick={() => {
                setShowManagerTools(false);
                setShowCalendarSync(true);
              }}
              data-testid="tool-export"
            >
              <Download className="h-5 w-5 text-indigo-600 shrink-0" />
              <span className="text-sm font-medium">Export</span>
            </Button>
            <Button
              variant="outline"
              className="flex-col gap-1.5 py-4"
              onClick={() => {
                setShowManagerTools(false);
                setShowTrinityInsights(!showTrinityInsights);
              }}
              data-testid="tool-trinity"
            >
              <TrinityAnimatedLogo size={20} />
              <span className="text-sm font-medium">Trinity AI</span>
            </Button>
          </div>
        </UniversalModalBody>
      </UniversalModal>

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

      {/* Trinity Biological Feedback Loop — runs after every auto-fill */}
      <TrinitySchedulingSummaryModal
        open={showTrinitySummary}
        onOpenChange={setShowTrinitySummary}
        result={trinityCompletionResult ? {
          success: true,
          sessionId: trinityCompletionResult.sessionId,
          executionId: trinityCompletionResult.executionId || '',
          totalMutations: trinityCompletionResult.mutationCount || 0,
          mutations: (trinityCompletionResult.mutations || []).map((m) => ({
            id: m.id,
            type: m.type || 'fill_open_shift',
            description: m.description,
            employeeName: m.employeeName,
            clientName: m.clientName,
            startTime: m.startTime,
            endTime: m.endTime,
          })),
          summary: {
            shiftsCreated: trinityCompletionResult.summary?.shiftsCreated || 0,
            shiftsEdited: trinityCompletionResult.summary?.shiftsEdited || 0,
            shiftsDeleted: trinityCompletionResult.summary?.shiftsDeleted || 0,
            employeesSwapped: trinityCompletionResult.summary?.employeesSwapped || 0,
            openShiftsFilled: trinityCompletionResult.summary?.openShiftsFilled || 0,
            totalHoursScheduled: trinityCompletionResult.summary?.totalHoursScheduled || 0,
            estimatedLaborCost: trinityCompletionResult.summary?.estimatedLaborCost || 0,
          },
          aiSummary: (trinityCompletionResult as any).aiSummary || `Trinity filled ${trinityCompletionResult.summary?.openShiftsFilled || 0} shifts.`,
          requiresVerification: false,
        } : null}
        workspaceId={workspaceId || ''}
        onVerified={() => { setShowTrinitySummary(false); clearTrinitySession(); }}
        onRejected={() => setShowTrinitySummary(false)}
      />

      {/* Phase 26H — Supervisor calloff confirm (deep-link from Phase 26G) */}
      <UniversalModal
        open={!!calloffPromptShiftId}
        onOpenChange={(open) => { if (!open) setCalloffPromptShiftId(null); }}
      >
        <UniversalModalHeader>
          <UniversalModalTitle>Mark shift as calloff?</UniversalModalTitle>
        </UniversalModalHeader>
        <UniversalModalBody>
          <p className="text-sm text-muted-foreground">
            Trinity detected the assigned officer did not clock in and is
            unresponsive. Confirming will cancel their assignment and
            immediately broadcast the shift to available replacements.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Shift ID: <code className="font-mono">{calloffPromptShiftId}</code>
          </p>
          <div className="flex items-center gap-2 mt-5 justify-end">
            <Button
              variant="outline"
              onClick={() => setCalloffPromptShiftId(null)}
              disabled={markCalloffMutation.isPending}
              data-testid="button-calloff-cancel"
            >
              Not yet
            </Button>
            <Button
              onClick={() => calloffPromptShiftId && markCalloffMutation.mutate(calloffPromptShiftId)}
              disabled={markCalloffMutation.isPending}
              data-testid="button-calloff-confirm"
            >
              {markCalloffMutation.isPending ? 'Firing…' : 'Confirm & find replacement'}
            </Button>
          </div>
        </UniversalModalBody>
      </UniversalModal>

    </div>
    </CanvasHubPage>
  );
}

export default function ScheduleMobileFirst() {
  return (
    <ErrorBoundary componentName="ScheduleMobileFirst">
      <ScheduleMobileFirstInner />
    </ErrorBoundary>
  );
}
