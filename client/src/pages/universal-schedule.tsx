/**
 * Universal Scheduling System - Enhanced
 * Mobile & Desktop responsive schedule with comprehensive shift creation
 * 
 * Features:
 * - Grid plus signs on hover to create shifts
 * - Comprehensive shift modal (employee, position, client, location, clock times, notes, post orders)
 * - Post orders with acknowledgment/signature/photo requirements
 * - Open shifts (orange dashed border) with AI Fill
 * - AI recommendations panel with 99% AI, 1% Human governance
 * - Full mobile responsiveness with touch-friendly controls
 * - RBAC enforcement (manager/admin create, employees view own)
 */

import '@/styles/smart-schedule.css';
import { useLocation } from 'wouter';
import { secureFetch } from "@/lib/csrf";
import { markCoreActionPerformed } from "@/lib/pushNotifications";

/** Parse compliance / eligibility block errors into a user-readable string */
function parseScheduleError(error: any): string {
  if (!error) return 'An unexpected error occurred';
  const raw: string = error.message || String(error);
  // Strip leading "NNN: " status prefix from ApiError
  const body = raw.replace(/^\d{3}:\s*/, '');
  try {
    const parsed = JSON.parse(body);
    if (parsed.code === 'COMPLIANCE_BLOCK') {
      const failures: Array<{ name?: string; reason?: string }> =
        parsed.eligibilityFailures || [];
      if (failures.length > 0) {
        const names = failures.map(f => {
          const reason = f.reason?.toLowerCase() || '';
          if (reason.includes('not active') || reason.includes('terminated') || reason.includes('deactivated')) {
            return `${f.name} (inactive — not eligible for shifts)`;
          }
          if (reason.includes('license') || reason.includes('credential')) {
            return `${f.name} (license or credential issue)`;
          }
          return f.name || 'Unknown employee';
        });
        return `Cannot assign: ${names.join(', ')}. Check the Compliance tab to resolve.`;
      }
      return parsed.message || 'Shift blocked due to compliance requirements.';
    }
    return parsed.message || body;
  } catch {
    // Not JSON — return as-is but strip raw code artifacts
    return body.replace(/\[?'code':\s*'[A-Z_]+']/g, '').trim() || raw;
  }
}
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiFetch } from '@/lib/apiError';
import { PaginatedShiftListResponse } from '@shared/schemas/responses/shifts';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmployee } from '@/hooks/useEmployee';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { isManagerOrAbove, isOrgLeadership } from '@/lib/roleHierarchy';
import { useClientLookup } from '@/hooks/useClients';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UniversalModal, UniversalModalTrigger, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle } from '@/components/ui/universal-modal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Calendar, Clock, Users, Edit2, Trash2, Copy, ChevronLeft, ChevronRight, Plus, Download,
  Bot, CheckCircle, CheckCircle2, AlertCircle, BarChart3, Play, X, Camera, MessageSquare, FileText,
  CheckSquare, MapPin, Menu, Sparkles, Zap, Bell, Settings, Shield, UserCheck, XCircle,
  PauseCircle, Send, AlertTriangle, Repeat, ArrowRightLeft, CalendarDays, CopyPlus, Loader2, Check,
  ChevronDown, Filter, Wand2, ToggleLeft, ToggleRight, Briefcase, Save, Undo2, ArrowLeftRight
} from 'lucide-react';
import type { Shift, Employee, Client, ShiftOrder, RecurringShiftPattern, ShiftSwapRequest } from '@shared/schema';
import ScheduleMobileFirst from '@/pages/schedule-mobile-first';
import { WorkspaceLayout } from '@/components/workspace-layout';
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { HideInSimpleMode } from "@/components/SimpleMode";
import { AskTrinityButton, TrinityIconStatic } from '@/components/trinity-button';
import { useTrinityModal } from '@/components/trinity-chat-modal';
import { TrinitySchedulingSummaryModal } from '@/components/trinity-scheduling-summary-modal';
import { ScheduleFilters, type ScheduleFilterState } from '@/components/schedule/ScheduleFilters';
import { WeekStatsBar } from '@/components/schedule/WeekStatsBar';
import { UnassignedShiftsPanel } from '@/components/schedule/UnassignedShiftsPanel';
import { ConflictAlerts, getShiftConflictBadge, getShiftTimeClockStatus } from '@/components/schedule/ConflictAlerts';
import { TrinityInsightsPanel } from '@/components/schedule/TrinityInsightsPanel';
import { TrinityTrainingPanel } from '@/components/schedule/TrinityTrainingPanel';
import { ScheduleUploadPanel } from '@/components/schedule/ScheduleUploadPanel';
import { ViewModeToggle } from '@/components/schedule/ViewModeToggle';
import { TrinitySchedulingProgress } from '@/components/schedule/TrinitySchedulingProgress';
import { TrinityStatusBar, TrinityThinkingPanel } from '@/components/schedule/TrinitySchedulingFeedback';
import { useTrinitySchedulingProgress } from '@/hooks/use-trinity-scheduling-progress';
import { ShiftCreationModal, type ShiftFormData, DAYS_OF_WEEK, POST_ORDER_TEMPLATES } from '@/components/schedule/ShiftCreationModal';
import { DuplicateShiftModal, SwapRequestModal, EditShiftModal, ShiftActionDialog, EscalationMatrixDialog } from '@/components/schedule/ScheduleDialogs';
import type { EditShiftFormData } from '@/components/schedule/ScheduleDialogs';
import { ScheduleLeftSidebar } from '@/components/schedule/ScheduleLeftSidebar';
import { IsolatedScheduleToolbar } from '@/components/schedule/IsolatedScheduleToolbar';
import { OperationVisibilityPanel } from '@/components/schedule/ScheduleCreditPanel';
import { ScheduleGridSkeleton } from '@/components/schedule/ScheduleGridSkeleton';
import { WeekGrid } from '@/components/schedule/WeekGrid';

const schedulePageConfig: CanvasPageConfig = {
  id: 'schedule',
  category: 'operations',
  title: 'Schedule',
  withBottomNav: true,
};

const scheduleLoadingConfig: CanvasPageConfig = {
  id: 'schedule-loading',
  category: 'operations',
  title: 'Schedule',
  subtitle: 'Loading...',
};

// POST_ORDER_TEMPLATES, ShiftFormData, and DAYS_OF_WEEK are imported from ShiftCreationModal

// Draggable Employee Component (Memoized for performance)
// Note: Currently used for DragOverlay display; employees shown as grid row labels
const DraggableEmployee = ({ employee, isSelected, onSelect, getEmployeeColor }: {
  employee: Employee;
  isSelected: boolean;
  onSelect: () => void;
  getEmployeeColor: (id: string) => string;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: employee.id,
    data: { type: 'employee', employee }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0 : 1
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`p-3 rounded-md border cursor-grab active:cursor-grabbing transition-all ${
        isSelected ? 'border-primary bg-primary/10' : 'border-border'
      } ${isDragging ? 'z-50' : ''} hover-elevate`}
      data-testid={`employee-card-${employee.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: getEmployeeColor(employee.id) }}
          />
          <span className="font-medium text-sm text-foreground">{employee.firstName} {employee.lastName}</span>
        </div>
        {employee.performanceScore && (
          <span className="text-xs font-bold text-green-600 dark:text-green-400">{employee.performanceScore}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{employee.role || 'Employee'}</div>
      <div className="text-xs text-muted-foreground mt-1">
        ${employee.hourlyRate?.toString() || '0'}/hr
      </div>
    </div>
  );
};

// Droppable Slot Component (Memoized for performance)
const DroppableSlot = ({ day, hour, children, onClick }: {
  day: number;
  hour: number;
  children: React.ReactNode;
  onClick: () => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${day}-${hour}`,
    data: { day, hour }
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`relative h-16 border-b cursor-pointer transition-colors group ${
        isOver ? 'bg-primary/10 border-primary/40' : 'hover:bg-primary/5'
      }`}
      data-testid={`grid-cell-${day}-${hour}`}
    >
      {children}
    </div>
  );
};

const DroppableEmployeeRow = ({ employeeId, children, isDropTarget }: {
  employeeId: string;
  children: React.ReactNode;
  isDropTarget: boolean;
}) => {
  const { setNodeRef } = useDroppable({
    id: `emp-row-${employeeId}`,
    data: { type: 'employee-drop-row', employeeId },
  });

  return (
    <div ref={setNodeRef} className="relative">
      {isDropTarget && (
        <div className="absolute inset-0 z-40 pointer-events-none border-2 border-dashed schedule-drop-zone-active transition-all duration-150" data-testid={`inline-drop-indicator-${employeeId}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold text-primary bg-white/95 dark:bg-slate-800/95 px-3 py-1.5 rounded-md shadow-sm ring-1 ring-primary/20">
              Reassign here
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

const InlineDraggableShift = ({ shift, children, canDrag, style: passedStyle, className, isPending }: {
  shift: Shift;
  children: React.ReactNode;
  canDrag: boolean;
  style?: React.CSSProperties;
  className?: string;
  isPending?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `inline-shift-${shift.id}`,
    data: { type: 'inline-shift', shift },
    disabled: !canDrag,
  });

  const combinedStyle: React.CSSProperties = {
    ...passedStyle,
    ...(transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      zIndex: 100,
    } : {}),
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={combinedStyle}
      {...listeners}
      {...attributes}
      className={`${className || ''} ${isPending ? 'shift-pending-reassign' : ''}`}
    >
      {children}
    </div>
  );
};

const PendingChangesBar = ({
  count,
  isSaving,
  onSave,
  onDiscard,
}: {
  count: number;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) => {
  if (count === 0) return null;
  return (
    <div className="pending-changes-bar flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border-b-2 border-amber-400/60 dark:border-amber-600/60 z-50" data-testid="pending-changes-bar">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ArrowLeftRight className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200 truncate">
          {count} unsaved reassignment{count !== 1 ? 's' : ''} — review before saving
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={isSaving}
          data-testid="button-discard-pending"
          className="text-amber-700 dark:text-amber-300 hover:text-amber-900"
        >
          <Undo2 className="h-3.5 w-3.5 mr-1" />
          Discard
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          data-testid="button-save-pending"
          className="bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Save {count} Change{count !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
};

export default function UniversalSchedule({ defaultViewMode }: { defaultViewMode?: 'my' | 'full' | 'pending' } = {}) {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { openModal: openTrinityChat } = useTrinityModal();
  const { employee: currentEmployee } = useEmployee();
  const { workspaceRole, platformRole, workspaceId } = useWorkspaceAccess();

  const scheduleInteractionRef = useRef(false);
  const handleScheduleInteraction = useCallback(() => {
    if (!scheduleInteractionRef.current) {
      scheduleInteractionRef.current = true;
      markCoreActionPerformed();
    }
  }, []);
  
  // Trinity real-time scheduling feedback - shows visual updates during auto-fill
  const { 
    session, 
    activeProgress,
    isShiftBeingProcessed, 
    wasShiftJustAssigned, 
    trinityWorking,
    clearSession,
    completionResult,
    clearCompletion,
  } = useTrinitySchedulingProgress(workspaceId);
  
  // RBAC permissions — workspace roles take priority; platform staff get manager access
  const isPlatformStaff = ['root_admin', 'root', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(platformRole || '');
  const isManager = isManagerOrAbove(workspaceRole) || isPlatformStaff;
  const isAdmin = isOrgLeadership(workspaceRole) || isPlatformStaff;
  
  // Admin-only action handler with permission check
  const handleAdminOnlyAction = (actionName: string) => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: `${actionName} requires admin privileges`,
      });
      return;
    }
    toast({
      title: actionName,
      description: `Initiating ${actionName}...`,
    });
  };
  
  // Automation toggle mutation
  const toggleAutomationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return await apiRequest('POST', '/api/scheduleos/ai/toggle', { enabled, workspaceId });
    },
    onSuccess: (_, enabled) => {
      setAutomationEnabled(enabled);
      toast({
        title: enabled ? 'Trinity Automation Enabled' : 'Trinity Automation Disabled',
        description: enabled 
          ? 'Trinity AI will suggest shift assignments, flag conflicts, and recommend schedule improvements for your review. All suggestions can be accepted, modified, or rejected. Watch the status bar for real-time progress.'
          : 'Manual scheduling mode activated. You can still use individual AI features from the toolbar.',
        duration: 5000,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to toggle automation',
        description: error.message,
      });
    }
  });


  const { data: allShiftsData = [], isLoading: allShiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/shifts?workspaceId=${workspaceId}`, { credentials: 'include' });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data.shifts || data.data || []);
    },
    enabled: !!workspaceId,
  });

  const triggerSchedulingMutation = useMutation({
    mutationFn: async (mode: 'optimize' | 'fill_gaps' | 'full_generate') => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      const response = await apiRequest('POST', '/api/orchestrated-schedule/ai/trigger-session', { 
        workspaceId, 
        mode 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSchedulingResult(data);
      setShowSchedulingSummary(true);
      if (data?.orchestrationId) {
        setActiveOrchestrationId(data.orchestrationId);
        setTimeout(() => setActiveOrchestrationId(null), 30000);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/credit-status', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/active-operations', workspaceId] });
    },
    onError: (error: any) => {
      const isCredits = error?.status === 402 || error?.message?.includes('Insufficient credits');
      toast({
        variant: 'destructive',
        title: isCredits ? 'Insufficient Credits' : 'Scheduling Session Failed',
        description: isCredits 
          ? 'You need more AI credits to run this operation.'
          : error.message,
      });
    }
  });
  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest('DELETE', `/api/shifts/${shiftId}`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setSelectedShiftForAction(null);
      toast({
        title: 'Shift deleted',
        description: 'The shift has been removed from the schedule',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete shift',
        description: error.message,
      });
    }
  });

  const reassignShiftMutation = useMutation({
    mutationFn: async ({ shiftId, newEmployeeId }: { shiftId: string; newEmployeeId: string; newStartTime: string }) => {
      return await apiRequest('PATCH', `/api/shifts/${shiftId}`, {
        employeeId: newEmployeeId,
        workspaceId,
      });
    },
    onMutate: async ({ shiftId, newEmployeeId }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/shifts', workspaceId] });
      const previousQueries = queryClient.getQueriesData<any>({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.setQueriesData<any>({ queryKey: ['/api/shifts', workspaceId] }, (old: any) => {
        if (!old) return old;
        const list: any[] = Array.isArray(old) ? old : (old.shifts || old.data || []);
        const updated = list.map((s: any) => s.id === shiftId ? { ...s, employeeId: newEmployeeId } : s);
        if (Array.isArray(old)) return updated;
        if (old.shifts) return { ...old, shifts: updated };
        if (old.data) return { ...old, data: updated };
        return old;
      });
      return { previousQueries };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      toast({
        title: 'Shift reassigned',
        description: 'The shift has been moved to the new employee',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
    },
    onError: (error: any, _, context: any) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]: [any, any]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast({
        variant: 'destructive',
        title: 'Failed to reassign shift',
        description: error.message,
      });
    },
  });

  const handleShiftDrop = useCallback((shift: Shift, newEmployeeId: string, newStartTime: Date) => {
    handleScheduleInteraction();
    reassignShiftMutation.mutate({
      shiftId: shift.id,
      newEmployeeId,
      newStartTime: newStartTime.toISOString(),
    });
  }, [reassignShiftMutation, handleScheduleInteraction]);

  // Publish schedule mutation
  const publishScheduleMutation = useMutation({
    mutationFn: async () => {
      // Get draft shift IDs for current week
      const draftShiftIds = filteredShifts
        .filter(s => s.status === 'draft' || !s.status)
        .map(s => s.id);
      
      if (draftShiftIds.length === 0) {
        throw new Error('No draft shifts to publish');
      }
      
      return await apiRequest('POST', '/api/schedules/publish', {
        weekStartDate: weekStart.toISOString(),
        weekEndDate: weekEnd.toISOString(),
        shiftIds: draftShiftIds,
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      toast({
        title: 'Schedule published',
        description: 'All employees have been notified of their shifts',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to publish schedule',
        description: error.message,
      });
    }
  });

  // Generate AI schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID required');
      const response = await apiRequest('POST', '/api/orchestrated-schedule/ai/trigger-session', {
        workspaceId,
        mode: 'full_generate',
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/credit-status', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/active-operations', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance', workspaceId] });
      if (data?.orchestrationId) {
        setActiveOrchestrationId(data.orchestrationId);
        setTimeout(() => setActiveOrchestrationId(null), 30000);
      }
      const creditsUsed = data?.creditsDeducted || 0;
      toast({
        title: 'Schedule Generated',
        description: `Trinity AI has optimized the schedule${creditsUsed > 0 ? ` (${creditsUsed} credits used)` : ''}`,
      });
    },
    onError: (error: any) => {
      const isCredits = error?.status === 402 || error?.message?.includes('Insufficient credits');
      toast({
        variant: 'destructive',
        title: isCredits ? 'Insufficient Credits' : 'Failed to generate schedule',
        description: isCredits
          ? 'You need more AI credits to generate a schedule.'
          : error.message,
      });
    }
  });
  
  const isAnyActionPending = toggleAutomationMutation.isPending || triggerSchedulingMutation.isPending || deleteShiftMutation.isPending || reassignShiftMutation.isPending || publishScheduleMutation.isPending || generateScheduleMutation.isPending;

  // Detect touch device for drag-and-drop (disable on mobile per architect)
  const isTouchDevice = useMemo(() => 
    'ontouchstart' in window || navigator.maxTouchPoints > 0
  , []);
  
  // Configure sensors for drag-and-drop (only on desktop)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor)
  );
  
  // Drag state for DragOverlay
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  
  const handleDragStart = (event: any) => {
    const data = event.active.data.current;
    if (data?.type === 'inline-shift') {
      setDraggedShiftId(data.shift.id);
    } else {
      setActiveEmployeeId(event.active.id as string);
    }
  };
  
  const [draggedShiftId, setDraggedShiftId] = useState<string | null>(null);
  const [dropTargetEmployeeId, setDropTargetEmployeeId] = useState<string | null>(null);

  // Staging architecture: pending reassignments staged client-side before batch save
  const [pendingReassignments, setPendingReassignments] = useState<Map<string, { newEmployeeId: string; originalEmployeeId: string | null }>>(new Map());

  const stageShiftReassignment = useCallback((shift: Shift, newEmployeeId: string) => {
    setPendingReassignments(prev => {
      const next = new Map(prev);
      const existingPending = next.get(shift.id);
      const originalEmployeeId = existingPending ? existingPending.originalEmployeeId : (shift.employeeId ?? null);
      // If dropping back to original employee, cancel the pending change
      if (originalEmployeeId === newEmployeeId) {
        next.delete(shift.id);
      } else {
        next.set(shift.id, { newEmployeeId, originalEmployeeId });
      }
      return next;
    });
  }, []);

  const discardPendingReassignments = useCallback(() => {
    setPendingReassignments(new Map());
  }, []);

  const savePendingMutation = useMutation({
    mutationFn: async () => {
      const entries = Array.from(pendingReassignments.entries());
      const count = entries.length;
      await Promise.all(
        entries.map(([shiftId, { newEmployeeId }]) =>
          apiRequest('PATCH', `/api/shifts/${shiftId}`, { employeeId: newEmployeeId, workspaceId })
        )
      );
      return count;
    },
    onSuccess: (count) => {
      setPendingReassignments(new Map());
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      toast({ title: `${count} shift${count !== 1 ? 's' : ''} reassigned`, description: 'All pending changes have been saved.' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Failed to save changes', description: parseScheduleError(error) });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveEmployeeId(null);
    setDraggedShiftId(null);
    setDropTargetEmployeeId(null);
    if (!over) return;

    const activeData = active.data.current;

    if (activeData?.type === 'inline-shift' && over.data.current?.type === 'employee-drop-row') {
      const shift = activeData.shift as Shift;
      const newEmployeeId = over.data.current.employeeId as string;
      if (shift.employeeId !== newEmployeeId) {
        // Stage instead of immediately persisting
        stageShiftReassignment(shift, newEmployeeId);
      }
      return;
    }

    const overData = over.data.current as { day: number; hour: number };
    if (overData?.day === undefined || overData?.hour === undefined) return;
    const employeeId = active.id as string;
    const { day, hour } = overData;

    const shiftDate = new Date(weekStart);
    shiftDate.setDate(shiftDate.getDate() + day);

    const clockInHour = hour.toString().padStart(2, '0');
    const clockOutHour = Math.min(hour + 8, 23).toString().padStart(2, '0');

    setShiftForm({
      ...shiftForm,
      employeeId,
      clockIn: `${clockInHour}:00`,
      clockOut: `${clockOutHour}:00`,
      isOpenShift: false
    });
    setModalPosition({ day, hour });
    setShowShiftModal(true);

    toast({
      title: 'Shift Draft Created',
      description: 'Review and save shift details',
    });
  };
  
  // State management
  const [myScheduleOnly, setMyScheduleOnly] = useState(defaultViewMode === 'my');
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'day' | 'month'>('day'); // Default to day view for GetSling-style
  const [selectedDay, setSelectedDay] = useState(new Date()); // Current day for day view
  const [currentMonth, setCurrentMonth] = useState(new Date()); // Current month for month view
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const lastAutoFillRef = useRef<number>(0); // Debounce auto-fill
  const [schedulingResult, setSchedulingResult] = useState<any>(null);
  const [showSchedulingSummary, setShowSchedulingSummary] = useState(false);
  const [activeOrchestrationId, setActiveOrchestrationId] = useState<string | null>(null);
  const [manualApprovalMode, setManualApprovalMode] = useState(true);
  const [mobileEmployeePanelOpen, setMobileEmployeePanelOpen] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showWorkflowsDialog, setShowWorkflowsDialog] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showEscalationMatrix, setShowEscalationMatrix] = useState(false);
  const [pendingShifts, setPendingShifts] = useState<any[]>([]);
  const [activeWorkflows, setActiveWorkflows] = useState<any[]>([]);
  const [escalationRules] = useState([
    { level: 1, condition: 'Shift unfilled > 4 hours', action: 'Manager notified', timeout: '1h' },
    { level: 2, condition: 'Shift unfilled > 8 hours', action: 'Director escalation', timeout: '2h' },
    { level: 3, condition: 'Shift unfilled > 12 hours', action: 'Emergency coverage pool', timeout: '4h' },
    { level: 4, condition: 'Critical service impact', action: 'Executive override', timeout: 'Immediate' }
  ]);
  
  // Shift modal states
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ day: 0, hour: 0 });
  const [shiftForm, setShiftForm] = useState<ShiftFormData>({
    employeeId: null,
    position: '',
    clockIn: '',
    clockOut: '',
    notes: '',
    postOrders: [],
    isOpenShift: false,
    clientId: '',
    location: '',
    isRecurring: false,
    recurrencePattern: 'weekly',
    daysOfWeek: [],
    endDate: '',
  });
  
  // Advanced scheduling states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedShiftForAction, setSelectedShiftForAction] = useState<Shift | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<string | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState('');
  const [duplicateTargetEmployee, setDuplicateTargetEmployee] = useState<string | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [swapTargetEmployee, setSwapTargetEmployee] = useState<string | null>(null);
  
  // GetSling-style filter state
  const [scheduleFilters, setScheduleFilters] = useState<ScheduleFilterState>({
    searchQuery: '',
    clientIds: [],
    positions: [],
    positionCategories: [],
    armedStatus: [],
    employeeStatuses: [],
    skills: [],
  });
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  
  // Cell-level hover tracking for GetSling-style interaction
  const [hoveredCell, setHoveredCell] = useState<{ empId: string; hour: number } | null>(null);
  
  // Keyboard navigation - focused cell for arrow key movement
  const [focusedCell, setFocusedCell] = useState<{ empIndex: number; hour: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  
  const [showTrinityInsights, setShowTrinityInsights] = useState(false);
  const [showUnassignedPanel, setShowUnassignedPanel] = useState(true);
  const [showConflictAlerts, setShowConflictAlerts] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Default collapsed for GetSling style
  
  // Panel toggle handlers for toolbar actions
  const [showTasksPanel, setShowTasksPanel] = useState(false);
  const [showTimeClockPanel, setShowTimeClockPanel] = useState(false);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showReportsPanel, setShowReportsPanel] = useState(false);
  const [showAvailabilityPanel, setShowAvailabilityPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Calculate week boundaries
  const weekStart = useMemo(() => {
    const date = new Date(currentWeek);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }, [currentWeek]);

  const weekEnd = useMemo(() => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 7);
    return date;
  }, [weekStart]);

  const weekDisplay = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const displayEnd = new Date(weekEnd);
    displayEnd.setDate(displayEnd.getDate() - 1);
    return `${weekStart.toLocaleDateString('en-US', options)} - ${displayEnd.toLocaleDateString('en-US', options)}, ${displayEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  // Fetch shifts for current week with date range filtering
  const shiftsQuery = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const result = await apiFetch(
        `/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}&limit=500`,
        PaginatedShiftListResponse
      );
      return result.data as unknown as Shift[];
    },
  });
  const {
    data: shiftsData,
    isLoading: shiftsLoading,
    isError: shiftsError,
    isEmpty: isShiftsEmpty,
  } = useAsyncData(shiftsQuery, (d) => d.length === 0);
  const shifts = shiftsData ?? [];

  const monthStart = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);

  const monthEnd = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  }, [currentMonth]);

  const { data: monthShifts = [], isLoading: monthShiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', 'month', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const response = await secureFetch(
        `/api/shifts?weekStart=${monthStart.toISOString()}&weekEnd=${monthEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch monthly shifts');
      const json = await response.json();
      return Array.isArray(json) ? json : (json?.data ?? []);
    },
    enabled: viewMode === 'month',
  });

  // Fetch employees
  const { data: employees = [], isLoading: employeesLoading } = useQuery<{ data: Employee[] }, Error, Employee[]>({
    queryKey: ['/api/employees', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { data: [] };
      const res = await fetch(`/api/employees?workspaceId=${workspaceId}&limit=500`, { credentials: 'include' });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    select: (res) => res?.data ?? [],
    enabled: !!workspaceId,
  });

  // Fetch clients for dropdown
  const { data: clients = [], isLoading: clientsLoading } = useClientLookup();

  const isLoading = shiftsLoading || employeesLoading || clientsLoading || (viewMode === 'month' && monthShiftsLoading);
  const isError = shiftsError;

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (myScheduleOnly && currentEmployee?.id) {
        if (emp.id !== currentEmployee.id) return false;
      }
      if (scheduleFilters.searchQuery) {
        const searchLower = scheduleFilters.searchQuery.toLowerCase();
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        if (!fullName.includes(searchLower)) return false;
      }
      if (scheduleFilters.positions.length > 0) {
        if (!emp.role && !emp.organizationalTitle) return false;
        if (!scheduleFilters.positions.includes(emp.role || '') && 
            !scheduleFilters.positions.includes(emp.organizationalTitle || '')) return false;
      }
      if (scheduleFilters.employeeStatuses.length > 0) {
        const empState = (emp.state || 'active').toLowerCase();
        if (!scheduleFilters.employeeStatuses.includes(empState)) return false;
      }
      return true;
    });
  }, [employees, scheduleFilters, myScheduleOnly, currentEmployee]);
  
  // Keyboard navigation handler - scoped to schedule grid only
  // Only activates when a cell is focused and not inside an input/modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input, textarea, or modal
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      if (target.closest('[role="dialog"]') || target.closest('[data-radix-portal]')) return;
      
      if (!focusedCell || !filteredEmployees.length) return;
      
      const { empIndex, hour } = focusedCell;
      let newEmpIndex = empIndex;
      let newHour = hour;
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          newEmpIndex = Math.max(0, empIndex - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newEmpIndex = Math.min(filteredEmployees.length - 1, empIndex + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newHour = Math.max(0, hour - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newHour = Math.min(23, hour + 1);
          break;
        case 'Enter':
          e.preventDefault();
          // Create shift at focused cell
          const emp = filteredEmployees[empIndex];
          if (emp) {
            handleGridClick(selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1, hour);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setFocusedCell(null);
          return;
        default:
          return;
      }
      
      setFocusedCell({ empIndex: newEmpIndex, hour: newHour });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, filteredEmployees, selectedDay]);

  // computedShifts: applies pending reassignment overrides on top of server data
  const computedShifts = useMemo(() => {
    if (pendingReassignments.size === 0) return shifts;
    return shifts.map(shift => {
      const pending = pendingReassignments.get(shift.id);
      if (!pending) return shift;
      return { ...shift, employeeId: pending.newEmployeeId };
    });
  }, [shifts, pendingReassignments]);

  // Filter shifts by selected clientIds (derives from computedShifts for pending-aware filtering)
  const filteredShifts = useMemo(() => {
    if (scheduleFilters.clientIds.length === 0) return computedShifts;
    return computedShifts.filter(shift => 
      shift.clientId && scheduleFilters.clientIds.includes(shift.clientId)
    );
  }, [computedShifts, scheduleFilters.clientIds]);

  // Calculate schedule stats for toolbar
  const scheduleStats = useMemo(() => {
    const draftShifts = shifts.filter(s => s.status === 'draft').length;
    const publishedShifts = shifts.filter(s => s.status === 'published' || s.status === 'scheduled').length;
    const openShifts = shifts.filter(s => !s.employeeId).length;
    let laborCost = 0;
    
    shifts.forEach(shift => {
      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      const employee = employees.find(e => e.id === shift.employeeId);
      const rate = shift.hourlyRateOverride 
        ? parseFloat(shift.hourlyRateOverride) 
        : (employee?.hourlyRate ? parseFloat(employee.hourlyRate) : 15);
      laborCost += hours * rate;
    });

    return {
      totalShifts: shifts.length,
      publishedShifts,
      draftShifts,
      openShifts,
      laborCost: Math.round(laborCost),
    };
  }, [shifts, employees]);

  // Week navigation
  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeek(newDate);
  };

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: async (shiftData: ShiftFormData) => {
      const clockInDate = new Date(weekStart);
      clockInDate.setDate(clockInDate.getDate() + modalPosition.day);
      const [clockInHour, clockInMinute] = shiftData.clockIn.split(':');
      clockInDate.setHours(parseInt(clockInHour), parseInt(clockInMinute), 0);

      const clockOutDate = new Date(clockInDate);
      const [clockOutHour, clockOutMinute] = shiftData.clockOut.split(':');
      clockOutDate.setHours(parseInt(clockOutHour), parseInt(clockOutMinute), 0);

      // Include postOrders in the request payload
      return await apiRequest('POST', '/api/shifts', {
        employeeId: shiftData.isOpenShift ? null : shiftData.employeeId,
        clientId: shiftData.clientId || null,
        title: shiftData.position,
        description: `${shiftData.location ? shiftData.location + ' - ' : ''}${shiftData.notes}`,
        startTime: clockInDate.toISOString(),
        endTime: clockOutDate.toISOString(),
        status: 'draft', // Open shifts are indicated by employeeId: null, not status
        aiGenerated: false,
        postOrders: shiftData.postOrders, // ✅ CRITICAL: Include post orders array
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setShowShiftModal(false);
      toast({
        title: 'Shift created',
        description: shiftForm.isOpenShift ? 'Open shift created successfully' : 'Shift created and assigned',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create shift',
        description: error.message,
      });
    }
  });

  // AI Fill mutation (single shift)
  const aiFillMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      const response = await apiRequest('POST', '/api/orchestrated-schedule/ai/fill-shift', {
        workspaceId,
        shiftId,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/credit-status', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/active-operations', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats', workspaceId] });
      if (data?.orchestrationId) {
        setActiveOrchestrationId(data.orchestrationId);
        setTimeout(() => setActiveOrchestrationId(null), 15000);
      }
      const creditsUsed = data?.creditsDeducted || 0;
      toast({
        title: 'AI auto-filled shift',
        description: `Best available employee assigned${creditsUsed > 0 ? ` (${creditsUsed} credits used)` : ''}`,
      });
    },
    onError: (error: any) => {
      const isCredits = error?.status === 402 || error?.message?.includes('Insufficient credits');
      toast({
        variant: 'destructive',
        title: isCredits ? 'Insufficient Credits' : 'AI fill failed',
        description: isCredits
          ? 'You need more AI credits to run this operation.'
          : error.message,
      });
    }
  });

  // Assign shift to employee mutation
  const assignShiftMutation = useMutation({
    mutationFn: async ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) => {
      return await apiRequest('PATCH', `/api/shifts/${shiftId}`, { 
        employeeId,
        status: 'scheduled',
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      toast({
        title: 'Shift assigned',
        description: 'Employee has been assigned to the shift',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to assign shift',
        description: error.message,
      });
    }
  });

  // Trigger AI Fill for all unassigned shifts mutation (orchestrated with credit check)
  const triggerAIFillMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID required');
      const openCount = scheduleStats.openShifts;
      const response = await apiRequest('POST', '/api/orchestrated-schedule/ai/trigger-session', {
        workspaceId,
        mode: 'fill_gaps',
        weekStart: weekStart.toISOString(),
      });
      const data = await response.json();
      return { ...data, totalOpen: openCount };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats', workspaceId] });
      queryClient.refetchQueries({ queryKey: ['/api/shifts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/usage/summary', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/credit-status', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrated-schedule/active-operations', workspaceId] });
      if (data?.orchestrationId) {
        setActiveOrchestrationId(data.orchestrationId);
        setTimeout(() => setActiveOrchestrationId(null), 15000);
      }
      
      const filled = data?.shiftsUpdated || 0;
      const total = data?.totalOpen || 0;
      const creditsUsed = data?.creditsDeducted || 0;
      if (!data?.sessionId) {
        toast({
          title: 'Trinity AI Auto-Fill Complete',
          description: filled > 0 
            ? `Filled ${filled} of ${total} shifts${creditsUsed > 0 ? ` (${creditsUsed} credits used)` : ''}`
            : 'No unassigned shifts to fill',
        });
      }
    },
    onError: (error: any) => {
      const isCredits = error?.status === 402 || error?.message?.includes('Insufficient credits');
      toast({
        variant: 'destructive',
        title: isCredits ? 'Insufficient Credits' : 'AI auto-fill failed',
        description: isCredits
          ? 'You need more AI credits to fill shifts.'
          : error.message,
      });
    }
  });

  // Continuous Auto-Schedule: When automation is ON and new open shifts appear, auto-fill them
  // Skip when Trinity training is actively running to prevent competing assignment operations
  useEffect(() => {
    if (!automationEnabled || scheduleStats.openShifts === 0) return;
    if (trinityWorking) return;
    
    const now = Date.now();
    if (now - lastAutoFillRef.current < 30000) return;
    
    if (triggerAIFillMutation.isPending) return;
    
    lastAutoFillRef.current = now;
    triggerAIFillMutation.mutate();
  }, [automationEnabled, scheduleStats.openShifts, triggerAIFillMutation.isPending, trinityWorking]);

  // Auto-open review modal when Trinity completes scheduling (works in both dev and production)
  useEffect(() => {
    if (completionResult) {
      setSchedulingResult({
        success: true,
        sessionId: completionResult.sessionId,
        executionId: completionResult.executionId || completionResult.sessionId,
        totalMutations: completionResult.mutationCount,
        mutations: completionResult.mutations || [],
        summary: completionResult.summary,
        aiSummary: completionResult.aiSummary || '',
        requiresVerification: completionResult.requiresVerification,
      });
      setShowSchedulingSummary(true);
      clearCompletion();
    }
  }, [completionResult, clearCompletion]);

  // ============================================
  // STABLE CALLBACKS FOR ISOLATED TOOLBAR
  // Using useCallback to prevent unnecessary re-renders
  // These must be defined AFTER all mutations they depend on
  // ============================================
  
  const handleToolbarToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);
  
  const handleToolbarCreateShift = useCallback(() => {
    setModalPosition({ day: 0, hour: 8 });
    setShiftForm({
      employeeId: null,
      position: '',
      clockIn: '08:00',
      clockOut: '16:00',
      notes: '',
      postOrders: [],
      isOpenShift: false,
      clientId: '',
      location: '',
      isRecurring: false,
      recurrencePattern: 'weekly',
      daysOfWeek: [days[0].toLowerCase()],
      endDate: '',
    });
    setShowShiftModal(true);
  }, [days]);
  
  const handleToolbarPublish = useCallback(async () => {
    const draftShiftIds = shifts
      .filter(s => s.status === 'draft' || !s.status)
      .map(s => s.id);
    
    if (draftShiftIds.length === 0) {
      toast({ title: 'No Drafts', description: 'No draft shifts to publish' });
      return;
    }
    
    try {
      const weekStartCalc = new Date(selectedDay);
      weekStartCalc.setDate(weekStartCalc.getDate() - weekStartCalc.getDay());
      const weekEndCalc = new Date(weekStartCalc);
      weekEndCalc.setDate(weekEndCalc.getDate() + 6);
      
      await apiRequest('POST', '/api/schedules/publish', {
        weekStartDate: weekStartCalc.toISOString(),
        weekEndDate: weekEndCalc.toISOString(),
        shiftIds: draftShiftIds,
        workspaceId,
      });
      toast({ title: 'Published', description: `${draftShiftIds.length} shifts published` });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Publish Failed', description: error.message });
    }
  }, [shifts, selectedDay, toast]);
  
  const handleToolbarAutoFill = useCallback(() => {
    triggerAIFillMutation.mutate();
  }, [triggerAIFillMutation]);
  
  const handleToolbarToggleAutomation = useCallback(() => {
    toggleAutomationMutation.mutate(!automationEnabled);
  }, [toggleAutomationMutation, automationEnabled]);
  
  const handleToolbarOpenTrinityInsights = useCallback(() => {
    setShowTrinityInsights(true);
  }, []);
  
  const handleToolbarOpenEmployeeFilters = useCallback(() => {
    setSidebarCollapsed(false);
  }, []);
  
  const handleToolbarOpenLocationFilters = useCallback(() => {
    setSidebarCollapsed(false);
  }, []);
  
  const handleToolbarClearFilters = useCallback(() => {
    setScheduleFilters({ searchQuery: '', clientIds: [], positions: [], positionCategories: [], armedStatus: [], employeeStatuses: [], skills: [] });
  }, []);
  
  const handleToolbarViewModeChange = useCallback((mode: 'day' | 'week' | 'month') => {
    setViewMode(mode);
  }, []);
  
  const handleToolbarDayChange = useCallback((day: Date) => {
    setSelectedDay(day);
    setCurrentWeek(day);
  }, []);

  const handleToolbarMonthChange = useCallback((month: Date) => {
    setCurrentMonth(month);
  }, []);

  const duplicateWeekMutation = useMutation({
    mutationFn: async ({ sourceWeekStart, targetWeekStart }: { sourceWeekStart: string; targetWeekStart: string }) => {
      return await apiRequest('POST', '/api/scheduling/duplicate-week', {
        sourceWeekStart,
        targetWeekStart,
        skipExisting: true,
        workspaceId,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      toast({
        title: 'Week duplicated',
        description: `Copied ${data?.copiedShifts || 0} shifts to the next week`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to duplicate week',
        description: error.message,
      });
    }
  });

  const handleCopyPreviousWeek = useCallback(() => {
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    duplicateWeekMutation.mutate({
      sourceWeekStart: previousWeekStart.toISOString(),
      targetWeekStart: weekStart.toISOString(),
    });
  }, [weekStart, duplicateWeekMutation]);

  const handleWeekNav = useCallback((direction: 'prev' | 'next') => {
    setCurrentWeek(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
      return d;
    });
    setSelectedDay(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
      return d;
    });
  }, []);

  const handleGridClick = useCallback((dayIndex: number, hourIndex: number) => {
    setModalPosition({ day: dayIndex, hour: hourIndex });
    setShiftForm({
      employeeId: null,
      position: '',
      clockIn: `${hourIndex.toString().padStart(2, '0')}:00`,
      clockOut: `${(hourIndex + 8).toString().padStart(2, '0')}:00`,
      notes: '',
      postOrders: [],
      isOpenShift: false,
      clientId: '',
      location: '',
      isRecurring: false,
      recurrencePattern: 'weekly',
      daysOfWeek: [days[dayIndex].toLowerCase()],
      endDate: '',
    });
    setShowShiftModal(true);
  }, [days]);
  
  // Duplicate shift mutation
  const duplicateShiftMutation = useMutation({
    mutationFn: async ({ shiftId, targetDate, targetEmployeeId }: { shiftId: string; targetDate: string; targetEmployeeId?: string }) => {
      return await apiRequest('POST', `/api/scheduling/shifts/${shiftId}/duplicate`, {
        targetDate,
        targetEmployeeId,
        copyNotes: true,
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setShowDuplicateModal(false);
      setSelectedShiftForAction(null);
      toast({
        title: 'Shift duplicated',
        description: 'The shift has been copied to the new date',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to duplicate shift',
        description: error.message,
      });
    }
  });

  // Edit shift mutation
  const editShiftMutation = useMutation({
    mutationFn: async ({ shiftId, data }: { shiftId: string; data: Partial<EditShiftFormData> }) => {
      const payload: Record<string, any> = {};
      if (data.employeeId !== undefined) payload.employeeId = data.employeeId;
      if (data.title) payload.title = data.title;
      if (data.clientId) payload.clientId = data.clientId;
      if (data.description) payload.description = data.description;
      if (data.startTime) payload.startTime = data.startTime;
      if (data.endTime) payload.endTime = data.endTime;
      if (data.date) payload.date = data.date;
      return await apiRequest('PATCH', `/api/shifts/${shiftId}`, { ...payload, workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setShowEditModal(false);
      setSelectedShiftForAction(null);
      toast({
        title: 'Shift updated',
        description: 'The shift has been updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update shift',
        description: error.message,
      });
    }
  });

  // Request swap mutation
  const requestSwapMutation = useMutation({
    mutationFn: async ({ shiftId, reason, targetEmployeeId }: { shiftId: string; reason: string; targetEmployeeId?: string }) => {
      return await apiRequest('POST', `/api/scheduling/shifts/${shiftId}/swap-request`, {
        reason,
        targetEmployeeId,
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setShowSwapModal(false);
      setSelectedShiftForAction(null);
      setSwapReason('');
      setSwapTargetEmployee(null);
      toast({
        title: 'Swap requested',
        description: 'Your shift swap request has been submitted for approval',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to request swap',
        description: error.message,
      });
    }
  });
  
  // Create recurring pattern mutation
  const createRecurringMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/scheduling/recurring', { ...data, workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', workspaceId] });
      setShowShiftModal(false);
      toast({
        title: 'Recurring shifts created',
        description: 'Shifts have been generated according to the pattern',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create recurring shifts',
        description: error.message,
      });
    }
  });
  
  const handleDuplicateShift = useCallback((shift: Shift) => {
    setSelectedShiftForAction(shift);
    const nextDay = new Date(shift.startTime);
    nextDay.setDate(nextDay.getDate() + 7);
    setDuplicateTargetDate(nextDay.toISOString().split('T')[0]);
    setDuplicateTargetEmployee(shift.employeeId);
    setShowDuplicateModal(true);
  }, []);
  
  const handleQuickDuplicate = useCallback((shift: Shift) => {
    const nextWeek = new Date(shift.startTime);
    nextWeek.setDate(nextWeek.getDate() + 7);
    duplicateShiftMutation.mutate({
      shiftId: shift.id,
      targetDate: nextWeek.toISOString().split('T')[0],
      targetEmployeeId: shift.employeeId || undefined,
    });
  }, [duplicateShiftMutation]);
  
  const handleSwapShift = useCallback((shift: Shift) => {
    setSelectedShiftForAction(shift);
    setSwapReason('');
    setSwapTargetEmployee(null);
    setShowSwapModal(true);
  }, []);
  
  const handleDuplicateWeek = () => {
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    duplicateWeekMutation.mutate({
      sourceWeekStart: weekStart.toISOString(),
      targetWeekStart: nextWeekStart.toISOString(),
    });
  };

  const handleCreateShift = () => {
    if (shiftForm.isRecurring) {
      const clockInDate = new Date(weekStart);
      clockInDate.setDate(clockInDate.getDate() + modalPosition.day);
      
      const endDate = shiftForm.endDate 
        ? new Date(shiftForm.endDate) 
        : new Date(clockInDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      createRecurringMutation.mutate({
        employeeId: shiftForm.isOpenShift ? null : shiftForm.employeeId,
        clientId: shiftForm.clientId || null,
        title: shiftForm.position,
        description: shiftForm.notes,
        startTimeOfDay: shiftForm.clockIn,
        endTimeOfDay: shiftForm.clockOut,
        daysOfWeek: shiftForm.daysOfWeek,
        recurrencePattern: shiftForm.recurrencePattern,
        startDate: clockInDate.toISOString(),
        endDate: endDate.toISOString(),
        generateShifts: true,
      });
    } else {
      createShiftMutation.mutate(shiftForm);
    }
  };

  const handleAIFillOpenShift = (shiftId: string) => {
    aiFillMutation.mutate(shiftId);
  };

  const togglePostOrder = (orderId: string) => {
    setShiftForm(prev => ({
      ...prev,
      postOrders: prev.postOrders.includes(orderId)
        ? prev.postOrders.filter(id => id !== orderId)
        : [...prev.postOrders, orderId]
    }));
  };

  // Convert shifts to day/hour grid format
  const shiftsGrid = useMemo(() => {
    const grid: Record<string, Shift[]> = {};
    shifts.forEach(shift => {
      const shiftDate = new Date(shift.startTime);
      const dayOfWeek = shiftDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday=0
      const hourOfDay = shiftDate.getHours();
      const key = `${adjustedDay}-${hourOfDay}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push(shift);
    });
    return grid;
  }, [shifts]);

  const getShiftPosition = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const topPercent = (startHour / 24) * 100;
    const heightPercent = (duration / 24) * 100;
    return { top: `${topPercent}%`, height: `${heightPercent}%` };
  };

  const getEmployeeColor = (employeeId: string | null) => {
    if (!employeeId) return '#6b7280';
    const employee = employees.find(e => e.id === employeeId);
    // Generate consistent color from employee ID
    const hash = employeeId.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#06b6d4'];
    return colors[Math.abs(hash) % colors.length];
  };

  const isOpenShift = (shift: Shift) => {
    // Open shifts have no assigned employee
    return !shift.employeeId;
  };
  
  // GetSling-style color-coding for shift status (uses explicit status fields only)
  // Blue=confirmed, Yellow=pending, Green=clocked-in, Red=unassigned, Purple=overtime
  const getShiftStatusColor = (shift: Shift) => {
    // Check if unassigned (red) - no employee assigned
    if (!shift.employeeId) {
      return { bg: '#ef4444', label: 'Unassigned' }; // Red
    }
    
    // Check if employee is clocked in (green) - based on actual time clock status
    const timeClockStatus = getShiftTimeClockStatus(shift);
    if (timeClockStatus.label === 'Active') {
      return { bg: '#10b981', label: 'Clocked In' }; // Green
    }
    
    // Check explicit overtime flag if available (purple)
    if ((shift as any).isOvertime === true) {
      return { bg: '#8b5cf6', label: 'Overtime' }; // Purple
    }
    
    // Check status for pending/draft approval (yellow) vs confirmed (blue)
    if (shift.status === 'draft' || shift.status === 'in_progress') {
      return { bg: '#f59e0b', label: 'Pending' }; // Yellow
    }
    
    // Default: confirmed/published/scheduled (blue)
    return { bg: '#3b82f6', label: 'Confirmed' }; // Blue
  };

  // Helper for week navigation - accepts Date range from ScheduleToolbar
  const handleWeekChange = (start: Date, end: Date) => {
    // Determine direction based on whether new start is before or after current weekStart
    if (start < weekStart) {
      goToPreviousWeek();
    } else {
      goToNextWeek();
    }
  };

  // Mobile: Render mobile-first schedule first — it has its own data fetching and error states.
  // This must come before desktop isLoading/isError checks to prevent mobile users from
  // seeing desktop-only error screens caused by desktop-specific queries.
  if (isMobile) {
    return <ScheduleMobileFirst defaultViewMode={defaultViewMode || 'my'} />;
  }

  if (isLoading) {
    return (
      <CanvasHubPage config={scheduleLoadingConfig}>
        <ScheduleGridSkeleton viewMode={viewMode} />
      </CanvasHubPage>
    );
  }

  if (isError) {
    return (
      <CanvasHubPage config={scheduleLoadingConfig}>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load schedule data. Please refresh.</p>
        </div>
      </CanvasHubPage>
    );
  }

  // Desktop: Sling-style layout with proper overflow containment
  // Structure: page-shell → left-filters → schedule-canvas → right-panel (collapsible)
  // Note: No WorkspaceLayout wrapper to maximize schedule viewport (schedule starts immediately)
  return (
    <DndContext
      sensors={isTouchDevice ? [] : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={(event) => {
        const overData = event.over?.data.current;
        if (overData?.type === 'employee-drop-row') {
          setDropTargetEmployeeId(overData.employeeId);
        } else {
          setDropTargetEmployeeId(null);
        }
      }}
      onDragEnd={handleDragEnd}
    >
      {/* GETSLING-STYLE: Fixed height container - schedule dominates viewport, minimal chrome */}
      <div className="flex h-[calc(100vh-6.5rem)] bg-background overflow-hidden overflow-x-hidden">
        {/* Left Filters Panel - COLLAPSIBLE (default collapsed for max schedule space) */}
        {!isMobile && (
          <div className={`transition-all duration-200 flex-shrink-0 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'}`}>
            <ScheduleLeftSidebar
              filters={scheduleFilters}
              onFiltersChange={setScheduleFilters}
              employees={employees}
              clients={clients}
              filteredEmployees={filteredEmployees}
              filteredShifts={filteredShifts}
              laborCost={scheduleStats.laborCost}
            />
          </div>
        )}

      {/* Main Content - SLING-STYLE: Bounded scroll container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden overflow-x-hidden">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <div className="flex items-center gap-1 rounded-md border p-0.5" data-testid="schedule-view-toggle">
            <Button
              variant={myScheduleOnly ? "default" : "ghost"}
              size="sm"
              onClick={() => { setMyScheduleOnly(true); handleScheduleInteraction(); }}
              data-testid="button-my-schedule"
            >
              <CalendarDays className="w-4 h-4 mr-1" />
              My Schedule
            </Button>
            <Button
              variant={!myScheduleOnly ? "default" : "ghost"}
              size="sm"
              onClick={() => { setMyScheduleOnly(false); handleScheduleInteraction(); }}
              data-testid="button-team-schedule"
            >
              <Users className="w-4 h-4 mr-1" />
              Team Schedule
            </Button>
          </div>
        </div>
        <IsolatedScheduleToolbar
          workspaceId={workspaceId}
          isManager={isManager}
          draftShiftsCount={scheduleStats.draftShifts}
          openShiftsCount={scheduleStats.openShifts}
          automationEnabled={automationEnabled}
          isAutoFilling={triggerAIFillMutation.isPending}
          isTogglingAutomation={toggleAutomationMutation.isPending}
          viewMode={viewMode}
          selectedDay={selectedDay}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={handleToolbarToggleSidebar}
          onCreateShift={handleToolbarCreateShift}
          onPublish={handleToolbarPublish}
          onAutoFill={handleToolbarAutoFill}
          onToggleAutomation={handleToolbarToggleAutomation}
          onOpenTrinityInsights={handleToolbarOpenTrinityInsights}
          onOpenTrinityChat={openTrinityChat}
          onOpenEmployeeFilters={handleToolbarOpenEmployeeFilters}
          onOpenLocationFilters={handleToolbarOpenLocationFilters}
          onClearFilters={handleToolbarClearFilters}
          onViewModeChange={handleToolbarViewModeChange}
          onDayChange={handleToolbarDayChange}
          currentMonth={currentMonth}
          onMonthChange={handleToolbarMonthChange}
          onCopyPreviousWeek={isManager ? handleCopyPreviousWeek : undefined}
        />

        {/* Week Stats Bar - Labor cost, hours, overtime, fill rate */}
        {viewMode !== 'month' && (
          <WeekStatsBar
            weekStart={weekStart}
            weekEnd={weekEnd}
            weekDisplay={weekDisplay}
            shifts={shifts}
            employees={employees}
            onViewDetailedReport={() => setLocation('/analytics/reports')}
          />
        )}

        {/* Trinity Live Scheduling Status Bar - Shows prominent feedback during automation */}
        <TrinityStatusBar session={session} />
        
        {/* Trinity Legacy Progress - Uses data from parent hook to avoid duplicate WebSocket */}
        <TrinitySchedulingProgress embedded progressData={activeProgress} />
        
        {/* Pipeline Operation Visibility - 7-step progress tracker */}
        {activeOrchestrationId && (
          <div className="px-2 py-1">
            <OperationVisibilityPanel workspaceId={workspaceId} orchestrationId={activeOrchestrationId} />
          </div>
        )}

        {/* Pending Reassignments Bar - appears when unsaved staged changes exist */}
        <PendingChangesBar
          count={pendingReassignments.size}
          isSaving={savePendingMutation.isPending}
          onSave={() => savePendingMutation.mutate()}
          onDiscard={discardPendingReassignments}
        />

        {/* Main Schedule Area - MAXIMIZED - GetSling style 70%+ viewport */}
        <div className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden isolate">

          {/* Trinity Working Skeleton Overlay - fades to reveal live mutations underneath */}
          {trinityWorking && session.currentIndex === 0 && (
            <div className="absolute inset-0 z-30 pointer-events-none animate-in fade-in duration-300" data-testid="trinity-working-skeleton-overlay">
              <ScheduleGridSkeleton viewMode={viewMode} />
            </div>
          )}
          {trinityWorking && session.currentIndex > 0 && (
            <div className="absolute inset-0 z-30 pointer-events-none transition-opacity duration-700 opacity-0" data-testid="trinity-skeleton-fade-out" />
          )}

          {/* === WEEK VIEW: GetSling-style 7-day column grid === */}
          {viewMode === 'week' && (
            <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t min-h-full">
              <WeekGrid
                weekStart={weekStart}
                weekEnd={weekEnd}
                selectedDay={selectedDay}
                shifts={shifts}
                filteredShifts={filteredShifts}
                employees={employees}
                filteredEmployees={filteredEmployees}
                clients={clients}
                trinityWorking={trinityWorking}
                isShiftBeingProcessed={isShiftBeingProcessed}
                wasShiftJustAssigned={wasShiftJustAssigned}
                getEmployeeColor={getEmployeeColor}
                getShiftStatusColor={getShiftStatusColor}
                onShiftClick={(shift) => setSelectedShiftForAction(shift)}
                onCellClick={handleGridClick}
                onAIFillOpenShift={handleAIFillOpenShift}
                onDaySelect={handleToolbarDayChange}
                onWeekNav={handleWeekNav}
                isManager={isManager}
                aiFillPending={aiFillMutation.isPending}
              />
            </div>
          )}

          {/* === MONTH VIEW: Calendar-style overview grid === */}
          {viewMode === 'month' && (() => {
            const monthYear = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const firstDayOfMonth = new Date(monthYear.getFullYear(), monthYear.getMonth(), 1);
            const lastDayOfMonth = new Date(monthYear.getFullYear(), monthYear.getMonth() + 1, 0);
            const startDayOfWeek = firstDayOfMonth.getDay();
            const daysInMonth = lastDayOfMonth.getDate();
            const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;
            const today = new Date();
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            const getShiftsForDate = (date: Date) => {
              return monthShifts.filter(s => {
                const shiftDate = new Date(s.startTime);
                return shiftDate.getFullYear() === date.getFullYear() &&
                       shiftDate.getMonth() === date.getMonth() &&
                       shiftDate.getDate() === date.getDate();
              });
            };

            const getTotalHours = (dayShifts: Shift[]) => {
              return dayShifts.reduce((total, s) => {
                const start = new Date(s.startTime);
                const end = new Date(s.endTime);
                return total + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
              }, 0);
            };

            const cells = [];
            for (let i = 0; i < totalCells; i++) {
              const dayOffset = i - startDayOfWeek;
              const cellDate = new Date(monthYear.getFullYear(), monthYear.getMonth(), 1 + dayOffset);
              const isCurrentMonth = cellDate.getMonth() === monthYear.getMonth();
              const isToday = cellDate.toDateString() === today.toDateString();
              const dayShifts = getShiftsForDate(cellDate);
              const totalHours = getTotalHours(dayShifts);

              const maxShiftsToShow = 4;
              const overflowCount = Math.max(0, dayShifts.length - maxShiftsToShow);
              const visibleShifts = dayShifts.slice(0, maxShiftsToShow);

              cells.push(
                <div
                  key={i}
                  className={`border border-slate-200/60 dark:border-slate-700/60 p-2 min-h-[140px] cursor-pointer transition-colors ${
                    isToday ? 'bg-blue-50/50 dark:bg-blue-900/15' : ''
                  } ${!isCurrentMonth ? 'opacity-40' : ''} ${
                    isCurrentMonth ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : ''
                  }`}
                  onClick={() => {
                    setSelectedDay(cellDate);
                    setCurrentWeek(cellDate);
                    setViewMode('day');
                  }}
                  data-testid={`month-cell-${cellDate.getFullYear()}-${cellDate.getMonth() + 1}-${cellDate.getDate()}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-xs font-medium ${
                      isToday ? 'text-primary font-bold' : 'text-foreground/80'
                    }`}>
                      {cellDate.getDate()}
                    </span>
                    {totalHours > 0 && (
                      <span className="text-[9px] text-muted-foreground">{totalHours.toFixed(0)}h</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {visibleShifts.map(shift => {
                      const sStart = new Date(shift.startTime);
                      const sEnd = new Date(shift.endTime);
                      const dur = ((sEnd.getTime() - sStart.getTime()) / (1000 * 60 * 60)).toFixed(0);
                      const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                      const shiftColor = getShiftStatusColor(shift);
                      const emp = shift.employeeId ? employees.find(e => e.id === shift.employeeId) : null;
                      const cl = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                      const isOpen = !shift.employeeId;

                      return (
                        <div
                          key={shift.id}
                          className={`rounded-md px-1.5 py-1 text-[10px] leading-snug cursor-pointer transition-all duration-150 hover:shadow-sm hover:-translate-y-px ${
                            isOpen
                              ? 'border border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : 'text-white'
                          }`}
                          style={isOpen ? undefined : { backgroundColor: shiftColor.bg }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShiftForAction(shift);
                          }}
                          data-testid={`month-shift-${shift.id}`}
                        >
                          <div className="truncate">
                            <span className="font-semibold">{fmt(sStart)}</span>
                            <span className="opacity-70"> - {fmt(sEnd)}</span>
                            <span className="opacity-60 ml-0.5">{dur}h</span>
                          </div>
                          {emp && <div className="truncate opacity-85 font-medium">{emp.firstName} {emp.lastName}</div>}
                          {cl && <div className="truncate opacity-65">{cl.companyName}</div>}
                        </div>
                      );
                    })}
                    {overflowCount > 0 && (
                      <div className="text-[9px] text-muted-foreground font-medium pl-1">+{overflowCount} more</div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t min-h-full p-4" data-testid="month-view-container">
                <div className="max-w-6xl mx-auto">
                  <div className="grid grid-cols-7 mb-1">
                    {dayNames.map(name => (
                      <div key={name} className="text-center text-xs font-semibold text-muted-foreground py-2 border-b border-slate-200/60 dark:border-slate-700/60">
                        {name}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {cells}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* === DAY VIEW: 24-hour horizontal timeline grid === */}
          {viewMode === 'day' && (
          <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t min-h-full flex flex-col overflow-x-auto">
            <div className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm min-w-[1700px]">
              
              <div className="flex border-b border-slate-200/80 dark:border-slate-600/80">
                <div className="w-[200px] min-w-[200px] px-3 py-2.5 font-semibold text-sm border-r border-slate-200/80 dark:border-slate-600/80 bg-slate-100 dark:bg-slate-800 flex items-center gap-2 flex-shrink-0">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-700 dark:text-slate-200">Employee</span>
                </div>
                <div className="flex flex-1 bg-slate-50/80 dark:bg-slate-800/50">
                  {hours.map((hour) => {
                    const isNowHour = new Date().getHours() === hour && selectedDay.toDateString() === new Date().toDateString();
                    const isWorkHour = hour >= 6 && hour < 22;
                    const formatHour = (h: number) => {
                      if (h === 0) return '12AM';
                      if (h === 12) return '12PM';
                      return h < 12 ? `${h}AM` : `${h - 12}PM`;
                    };
                    return (
                      <div 
                        key={hour}
                        className={`min-w-[62px] flex-1 text-center py-2.5 text-[10px] font-semibold border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0 ${
                          isNowHour 
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold' 
                            : isWorkHour 
                              ? 'text-slate-600 dark:text-slate-300' 
                              : 'text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-800/30'
                        }`}
                      >
                        {formatHour(hour)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Unassigned Shifts Row - GetSling Green Style */}
            <div className="flex bg-emerald-50/50 dark:bg-emerald-900/15 border-b-2 border-emerald-300 dark:border-emerald-700 min-w-[1700px]">
              <div className="w-[200px] min-w-[200px] px-3 py-2 border-r border-emerald-200/60 dark:border-emerald-700/60 flex items-center gap-2.5 flex-shrink-0 bg-emerald-50/80 dark:bg-emerald-900/30">
                <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="font-bold text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Unassigned</div>
                  <div className="text-[9px] text-emerald-600/60 dark:text-emerald-400/60">Shifts</div>
                </div>
              </div>

              {/* Unassigned Shifts Timeline Row - Flex to fill remaining width */}
              <div 
                className="relative min-h-[44px] cursor-pointer group/timeline flex-1"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const hourWidth = rect.width / 24;
                  const clickedHour = Math.floor(clickX / hourWidth);
                  setShiftForm({
                    ...shiftForm,
                    employeeId: null,
                    isOpenShift: true,
                    clockIn: `${String(clickedHour).padStart(2, '0')}:00`,
                    clockOut: `${String(Math.min(clickedHour + 8, 23)).padStart(2, '0')}:00`,
                  });
                  setModalPosition({ day: selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1, hour: clickedHour });
                  setShowShiftModal(true);
                }}
                data-testid="unassigned-shifts-timeline"
              >
                {/* Hour Grid Cells - GetSling cell-level selection for open shifts - Roomier cells */}
                <div className="absolute inset-0 flex">
                  {hours.map((hour) => {
                    const isHovered = hoveredCell?.empId === 'open-shifts' && hoveredCell?.hour === hour;
                    // Check if there's an open shift at this hour
                    const hasShiftAtHour = filteredShifts.filter(s => {
                      if (s.employeeId) return false;
                      const shiftDate = new Date(s.startTime);
                      return shiftDate.toDateString() === selectedDay.toDateString();
                    }).some(shift => {
                      const startHour = new Date(shift.startTime).getHours();
                      const endHour = new Date(shift.endTime).getHours();
                      return hour >= startHour && hour < endHour;
                    });
                    
                    return (
                      <div 
                        key={hour}
                        className={`min-w-[62px] flex-1 border-r border-emerald-200/60 dark:border-emerald-800/40 last:border-r-0 transition-all duration-150 relative ${
                          isHovered ? 'bg-emerald-100/80 dark:bg-emerald-900/50 ring-1 ring-inset ring-emerald-300/50' : ''
                        }`}
                        onMouseEnter={() => setHoveredCell({ empId: 'open-shifts', hour })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Open create shift modal with no employee assigned
                          setShiftForm(prev => ({
                            ...prev,
                            startTime: `${hour.toString().padStart(2, '0')}:00`,
                            endTime: `${Math.min(hour + 8, 23).toString().padStart(2, '0')}:00`,
                            employeeId: null
                          }));
                          setShowShiftModal(true);
                        }}
                        data-testid={`cell-open-${hour}`}
                      >
                        {/* "+" button - centered in THIS cell only */}
                        {isHovered && !hasShiftAtHour && (
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <button 
                              className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShiftForm(prev => ({
                                  ...prev,
                                  startTime: `${hour.toString().padStart(2, '0')}:00`,
                                  endTime: `${Math.min(hour + 8, 23).toString().padStart(2, '0')}:00`,
                                  employeeId: null
                                }));
                                setShowShiftModal(true);
                              }}
                              data-testid={`add-open-shift-${hour}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* GetSling-style Blue Hour Highlight for unassigned row */}
                {selectedDay.toDateString() === new Date().toDateString() && (() => {
                  const currentHour = new Date().getHours();
                  const leftPct = (currentHour / 24) * 100;
                  const widthPct = (1 / 24) * 100;
                  return (
                    <div 
                      className="absolute top-0 bottom-0 z-[1] pointer-events-none bg-blue-100/30 dark:bg-blue-800/15 border-l border-r border-blue-300/30 dark:border-blue-600/20"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                  );
                })()}

                {/* Render open shifts as horizontal bars */}
                {filteredShifts.filter(s => {
                  if (s.employeeId) return false;
                  const shiftDate = new Date(s.startTime);
                  return shiftDate.toDateString() === selectedDay.toDateString();
                }).map(shift => {
                  const startTime = new Date(shift.startTime);
                  const endTime = new Date(shift.endTime);
                  const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  
                  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
                  const durationMs = endTime.getTime() - startTime.getTime();
                  const durationMinutes = Math.max(durationMs / 60000, 60);
                  const leftPercent = (startMinutes / 1440) * 100;
                  const widthPercent = (durationMinutes / 1440) * 100;

                  const isProcessing = isShiftBeingProcessed(shift.id);
                  
                  return (
                    <div
                      key={shift.id}
                      className={`absolute top-1 bottom-1 rounded-md px-2 py-1 cursor-pointer transition-all duration-200 hover:shadow-sm hover:z-20 hover:-translate-y-px border border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-900/60 text-xs flex flex-col justify-center overflow-hidden ${
                        isProcessing ? 'trinity-shift-processing' : ''
                      } ${trinityWorking ? 'trinity-grid-processing' : ''}`}
                      style={{ 
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 5)}%`,
                        minWidth: '60px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAIFillOpenShift(shift.id);
                      }}
                      data-testid={`unassigned-shift-${shift.id}`}
                    >
                      <div className="font-semibold text-emerald-700 dark:text-emerald-300 truncate flex items-center gap-0.5 text-[10px] leading-tight">
                        <Users className="w-3 h-3 flex-shrink-0" />
                        {formatTime(startTime)} - {formatTime(endTime)}
                      </div>
                      {client && (
                        <div className="text-emerald-600/70 text-[9px] truncate leading-tight">{client.companyName}</div>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-4 text-[8px] px-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAIFillOpenShift(shift.id);
                          }}
                          disabled={aiFillMutation.isPending}
                          data-testid={`button-ai-fill-unassigned-${shift.id}`}
                        >
                          <TrinityIconStatic size={8} className="mr-0.5" />
                          {aiFillMutation.isPending ? '...' : 'AI Fill'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Available Shifts Row - GetSling Green/Blue Style */}
            <div className="flex bg-sky-50/40 dark:bg-sky-900/10 border-b-2 border-sky-200 dark:border-sky-800 min-w-[1700px]">
              <div className="w-[200px] min-w-[200px] px-3 py-2 border-r border-sky-200/60 dark:border-sky-700/60 flex items-center gap-2.5 flex-shrink-0 bg-sky-50/60 dark:bg-sky-900/20">
                <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <CheckCircle className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="font-bold text-xs text-sky-700 dark:text-sky-300 uppercase tracking-wide">Available</div>
                  <div className="text-[9px] text-sky-600/60 dark:text-sky-400/60">Shifts</div>
                </div>
              </div>
              <div
                className="relative min-h-[38px] flex-1 cursor-pointer"
                data-testid="available-shifts-timeline"
              >
                <div className="absolute inset-0 flex">
                  {hours.map((hour) => {
                    const isHovered = hoveredCell?.empId === 'available-shifts' && hoveredCell?.hour === hour;
                    const availShiftsForDay = filteredShifts.filter(s => {
                      if (s.employeeId) return false;
                      if (s.status !== 'draft' && s.status !== 'in_progress') return false;
                      return new Date(s.startTime).toDateString() === selectedDay.toDateString();
                    });
                    const hasShiftAtHour = availShiftsForDay.some(shift => {
                      const sH = new Date(shift.startTime).getHours();
                      const eH = new Date(shift.endTime).getHours();
                      return hour >= sH && hour < (eH <= sH ? 24 : eH);
                    });
                    return (
                      <div
                        key={hour}
                        className={`min-w-[62px] flex-1 border-r border-sky-200/40 dark:border-sky-800/30 last:border-r-0 transition-all duration-150 relative ${
                          isHovered ? 'bg-sky-100/80 dark:bg-sky-900/50 ring-1 ring-inset ring-sky-300/50' : ''
                        }`}
                        onMouseEnter={() => setHoveredCell({ empId: 'available-shifts', hour })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShiftForm(prev => ({
                            ...prev,
                            startTime: `${hour.toString().padStart(2, '0')}:00`,
                            endTime: `${Math.min(hour + 8, 23).toString().padStart(2, '0')}:00`,
                            employeeId: null,
                            isOpenShift: true,
                          }));
                          setShowShiftModal(true);
                        }}
                        data-testid={`cell-available-${hour}`}
                      >
                        {isHovered && !hasShiftAtHour && (
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <button
                              className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShiftForm(prev => ({
                                  ...prev,
                                  startTime: `${hour.toString().padStart(2, '0')}:00`,
                                  endTime: `${Math.min(hour + 8, 23).toString().padStart(2, '0')}:00`,
                                  employeeId: null,
                                  isOpenShift: true,
                                }));
                                setShowShiftModal(true);
                              }}
                              data-testid={`add-available-shift-${hour}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {filteredShifts.filter(s => {
                  if (s.employeeId) return false;
                  if (s.status !== 'draft' && s.status !== 'in_progress') return false;
                  const shiftDate = new Date(s.startTime);
                  return shiftDate.toDateString() === selectedDay.toDateString();
                }).map(shift => {
                  const startTime = new Date(shift.startTime);
                  const endTime = new Date(shift.endTime);
                  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
                  const durationMs = endTime.getTime() - startTime.getTime();
                  const durationMinutes = Math.max(durationMs / 60000, 60);
                  const leftPercent = (startMinutes / 1440) * 100;
                  const widthPercent = (durationMinutes / 1440) * 100;
                  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;

                  return (
                    <div
                      key={shift.id}
                      className="absolute top-1 bottom-1 rounded-md px-2 py-1 cursor-pointer border border-sky-300 dark:border-sky-600 bg-sky-100 dark:bg-sky-900/50 text-xs flex flex-col justify-center overflow-hidden transition-all duration-200 hover:shadow-sm hover:z-20 hover:-translate-y-px"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 5)}%`,
                        minWidth: '60px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedShiftForAction(shift);
                      }}
                      data-testid={`available-shift-${shift.id}`}
                    >
                      <div className="font-semibold text-sky-700 dark:text-sky-300 truncate text-[9px] leading-tight">
                        {formatTime(startTime)} - {formatTime(endTime)}
                      </div>
                      {client && (
                        <div className="text-sky-600/70 dark:text-sky-400/70 text-[8px] truncate leading-tight">{client.companyName}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employee Rows - GetSling Style Contained Grid */}
            <div className={`min-w-[1700px] ${trinityWorking ? 'trinity-processing-shimmer' : ''}`}>
              <div className="flex items-center px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-700/60">
                <div className="w-[200px] min-w-[200px] flex items-center gap-2 flex-shrink-0">
                  <Briefcase className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="font-bold text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">Scheduled Shifts</span>
                </div>
              </div>
              {filteredEmployees.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No employees match current filters</p>
                </div>
              ) : (
                filteredEmployees.map((emp, empIndex) => {
                  const empColor = getEmployeeColor(emp.id);
                  
                  // Get shifts for this employee on the selected day (day view) or all week (week view)
                  const employeeShifts = filteredShifts.filter(s => {
                    if (s.employeeId !== emp.id) return false;
                    const shiftDate = new Date(s.startTime);
                    if (viewMode === 'day') {
                      return shiftDate.toDateString() === selectedDay.toDateString();
                    } else {
                      return shiftDate >= weekStart && shiftDate <= weekEnd;
                    }
                  });
                  
                  // Check if any cell in this row is being hovered or keyboard-focused
                  const isRowHighlighted = hoveredCell?.empId === emp.id || focusedCell?.empIndex === empIndex;
                  
                  // Calculate actual stacking rows for dynamic height
                  const stackRows: Shift[][] = [];
                  const sortedForHeight = [...employeeShifts].sort((a, b) => 
                    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                  );
                  sortedForHeight.forEach(shift => {
                    const sStart = new Date(shift.startTime).getTime();
                    let placed = false;
                    for (const row of stackRows) {
                      const lastInRow = row[row.length - 1];
                      if (new Date(lastInRow.endTime).getTime() <= sStart) {
                        row.push(shift);
                        placed = true;
                        break;
                      }
                    }
                    if (!placed) stackRows.push([shift]);
                  });
                  const numStackRows = Math.max(stackRows.length, 1);
                  const dynamicRowHeight = numStackRows * 48 + 12;
                  
                  return (
                    <DroppableEmployeeRow key={emp.id} employeeId={emp.id} isDropTarget={dropTargetEmployeeId === emp.id}>
                    <div className={`flex border-b border-slate-200/60 dark:border-slate-700/60 transition-colors group ${empIndex % 2 === 0 ? 'bg-white/70 dark:bg-slate-900/50 schedule-zebra-even' : 'bg-slate-50/80 dark:bg-slate-800/40 schedule-zebra-odd'} ${isRowHighlighted ? 'schedule-row-hovered' : ''}`} style={{ minHeight: `${dynamicRowHeight}px` }}>
                      <div 
                        className="w-[200px] min-w-[200px] px-3 py-2.5 border-r border-slate-200/60 dark:border-slate-600/60 bg-slate-50/90 dark:bg-slate-800/80 flex items-center gap-2.5 cursor-pointer hover:bg-white dark:hover:bg-slate-700/80 flex-shrink-0 transition-colors"
                        onClick={() => setSelectedEmployee(emp)}
                        data-testid={`employee-row-${emp.id}`}
                      >
                        <div 
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor: empColor }}
                        >
                          {(emp.firstName?.[0] || '')}{(emp.lastName?.[0] || '')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[11px] truncate leading-tight text-foreground/90">
                            {emp.firstName} {emp.lastName}
                          </div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                            {(emp as any).position || 'Staff'}
                          </div>
                        </div>
                      </div>

                      {/* Timeline Row - GetSling grid - flex to fill remaining width */}
                      <div 
                        className="relative cursor-pointer group/timeline flex-1"
                        style={{ minHeight: `${dynamicRowHeight}px` }}
                        onClick={(e) => {
                          // Calculate which hour was clicked based on position
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickX = e.clientX - rect.left;
                          const hourWidth = rect.width / 24;
                          const clickedHour = Math.floor(clickX / hourWidth);
                          handleGridClick(selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1, clickedHour);
                        }}
                        data-testid={`timeline-row-${emp.id}`}
                      >
                        {/* Hour Grid Cells - GetSling cell-level selection - Roomier 52px */}
                        <div className="absolute inset-0 flex">
                          {hours.map((hour) => {
                            const isHovered = hoveredCell?.empId === emp.id && hoveredCell?.hour === hour;
                            const isFocused = focusedCell?.empIndex === empIndex && focusedCell?.hour === hour;
                            // Check if there's a shift at this hour
                            const hasShiftAtHour = employeeShifts.some(shift => {
                              const startHour = new Date(shift.startTime).getHours();
                              const endHour = new Date(shift.endTime).getHours();
                              return hour >= startHour && hour < endHour;
                            });
                            
                            return (
                              <div 
                                key={hour}
                                tabIndex={0}
                                className={`min-w-[62px] flex-1 border-r border-slate-200/50 dark:border-slate-700/50 last:border-r-0 transition-all duration-150 relative schedule-grid-cell ${
                                  isHovered ? 'bg-blue-100/70 dark:bg-blue-900/40 ring-1 ring-inset ring-blue-300/50 dark:ring-blue-600/40' : ''
                                } ${isFocused ? 'schedule-cell-focused' : ''}`}
                                onMouseEnter={() => setHoveredCell({ empId: emp.id, hour })}
                                onMouseLeave={() => setHoveredCell(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Set keyboard focus to this cell
                                  setFocusedCell({ empIndex, hour });
                                  handleGridClick(selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1, hour);
                                }}
                                onFocus={() => setFocusedCell({ empIndex, hour })}
                                data-testid={`cell-${emp.id}-${hour}`}
                              >
                                {/* Trinity Processing Skeleton - shows animated placeholder when autofill is running */}
                                {trinityWorking && !hasShiftAtHour && empIndex % 3 === hour % 3 && (
                                  <div className="absolute inset-2 flex items-center justify-center z-5">
                                    <div className="w-full h-6 bg-gradient-to-r from-purple-200/40 via-purple-300/60 to-purple-200/40 dark:from-purple-700/30 dark:via-purple-600/50 dark:to-purple-700/30 rounded animate-pulse" />
                                  </div>
                                )}
                                
                                {/* "+" button - centered in THIS cell only */}
                                {(isHovered || isFocused) && !hasShiftAtHour && !trinityWorking && (
                                  <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <button 
                                      className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleGridClick(selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1, hour);
                                      }}
                                      data-testid={`add-shift-${emp.id}-${hour}`}
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* GetSling-style Blue Hour Highlight Column - no red line */}
                        {selectedDay.toDateString() === new Date().toDateString() && (() => {
                          const currentHour = new Date().getHours();
                          const leftPct = (currentHour / 24) * 100;
                          const widthPct = (1 / 24) * 100;
                          return (
                            <div 
                              className="absolute top-0 bottom-0 z-[1] pointer-events-none bg-blue-100/40 dark:bg-blue-800/25 border-l border-r border-blue-300/40 dark:border-blue-600/30"
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              data-testid="current-hour-highlight"
                            />
                          );
                        })()}
                        
                        {/* Render Shifts as Horizontal Bars - reuses stackRows from height calc */}
                        {sortedForHeight.map(shift => {
                            const rowIdx = stackRows.findIndex(row => row.includes(shift));
                            const startTime = new Date(shift.startTime);
                            const endTime = new Date(shift.endTime);
                            const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                            const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                            const timeClockStatus = getShiftTimeClockStatus(shift);
                            const conflictBadge = getShiftConflictBadge(shift, shifts, employees);
                            const statusColor = getShiftStatusColor(shift);
                            
                            const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
                            const durationMs = endTime.getTime() - startTime.getTime();
                            const durationMinutes = Math.max(durationMs / 60000, 60);
                            const leftPercent = (startMinutes / 1440) * 100;
                            const widthPercent = (durationMinutes / 1440) * 100;

                            const isProcessing = isShiftBeingProcessed(shift.id);
                            const justAssigned = wasShiftJustAssigned(shift.id);
                            const isPendingShift = pendingReassignments.has(shift.id);
                            
                            const gapPx = 2;
                            const rowHeight = numStackRows > 1 
                              ? `calc(${100 / numStackRows}% - ${gapPx}px)` 
                              : undefined;
                            const topOffset = numStackRows > 1 
                              ? `calc(${(rowIdx / numStackRows) * 100}% + ${gapPx / 2}px)` 
                              : undefined;
                            
                            return (
                              <InlineDraggableShift
                                key={shift.id}
                                shift={shift}
                                canDrag={isManager && !isMobile && !isTouchDevice}
                                isPending={isPendingShift}
                                style={{ 
                                  position: 'absolute' as const,
                                  backgroundColor: statusColor.bg,
                                  left: `${leftPercent}%`,
                                  width: `${Math.max(widthPercent, 4.5)}%`,
                                  minWidth: '65px',
                                  top: topOffset || '3px',
                                  height: rowHeight || 'calc(100% - 6px)',
                                  zIndex: 10 + rowIdx,
                                }}
                                className={`rounded-md px-2 py-1 cursor-pointer text-white flex flex-col justify-center overflow-hidden border transition-all duration-200 hover:shadow-sm hover:z-30 hover:-translate-y-px ${
                                  isPendingShift ? 'border-amber-300/80 border-dashed' : 'border-white/20'
                                } ${isProcessing ? 'trinity-shift-processing' : ''} ${justAssigned ? 'trinity-shift-assigned' : ''}`}
                              >
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedShiftForAction(shift);
                                  }}
                                  data-testid={`shift-${shift.id}`}
                                  className="h-full flex flex-col justify-center relative"
                                >
                                  <div className="flex items-center gap-1">
                                    <div className="font-semibold truncate text-[11px] leading-snug">
                                      {formatTime(startTime)} - {formatTime(endTime)}
                                    </div>
                                    {shift.aiGenerated && (
                                      <TrinityIconStatic size={10} className="flex-shrink-0" />
                                    )}
                                    {isPendingShift && (
                                      <span className="ml-auto flex-shrink-0 text-[8px] font-bold bg-amber-400/30 text-amber-900 dark:text-amber-100 px-1 py-px rounded-sm">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                  {shift.title && (
                                    <div className="opacity-90 text-[9px] truncate leading-tight">{shift.title}</div>
                                  )}
                                  {client && (
                                    <div className="opacity-75 text-[9px] truncate leading-tight">{client.companyName}</div>
                                  )}

                                  {timeClockStatus.label !== 'Scheduled' && !isPendingShift && (
                                    <div className={`absolute top-1 right-1 px-1 py-px rounded text-[8px] font-bold ${timeClockStatus.bgColor} ${timeClockStatus.color}`}>
                                      {timeClockStatus.label}
                                    </div>
                                  )}
                                  
                                  {conflictBadge && (
                                    <Badge 
                                      variant="outline" 
                                      className={`absolute bottom-0.5 left-0.5 text-[7px] px-1 py-0 ${
                                        conflictBadge.severity === 'error' 
                                          ? 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-700 dark:text-red-300' 
                                          : 'bg-yellow-100 dark:bg-yellow-900/60 border-yellow-500 text-yellow-700 dark:text-yellow-300'
                                      }`}
                                    >
                                      {conflictBadge.type}
                                    </Badge>
                                  )}
                                </div>
                              </InlineDraggableShift>
                            );
                          })}
                      </div>
                    </div>
                    </DroppableEmployeeRow>
                  );
                })
              )}

            </div>
          </div>
          )}

        </div>

        {/* Trinity Thinking Panel - Fixed at bottom when processing */}
        <TrinityThinkingPanel 
          thoughts={session.thoughts} 
          isWorking={trinityWorking} 
          onClear={clearSession}
          onReviewRequested={() => {
            if (schedulingResult) {
              setShowSchedulingSummary(true);
            } else if (completionResult) {
              setSchedulingResult({
                success: true,
                sessionId: completionResult.sessionId,
                executionId: completionResult.executionId || completionResult.sessionId,
                totalMutations: completionResult.mutationCount,
                mutations: completionResult.mutations || [],
                summary: completionResult.summary,
                aiSummary: completionResult.aiSummary || '',
                requiresVerification: completionResult.requiresVerification,
              });
              setShowSchedulingSummary(true);
            } else {
              queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
              toast({ title: 'Schedule Updated', description: 'Shifts have been refreshed with latest data.' });
            }
          }}
        />

        {/* Trinity Insights Slide-in Panel - hidden when Trinity is actively scheduling to avoid duplicate AI processing */}
        {showTrinityInsights && !trinityWorking && (
          <>
            {/* Backdrop - click to close - starts below all navigation (header ~56px + tabs ~44px = 100px) */}
            <div 
              className="fixed inset-0 top-[100px] bg-black/20 z-[1500] transition-opacity"
              onClick={() => setShowTrinityInsights(false)}
              data-testid="trinity-backdrop"
            />
            {/* Panel - fixed position, slides from right - positioned below header + tabs */}
            <div 
              className="fixed top-[100px] right-0 w-[calc(100vw-16px)] max-w-[400px] sm:max-w-[450px] h-[calc(100vh-100px)] bg-card border-l shadow-sm z-[1501] flex flex-col animate-in slide-in-from-right duration-300"
              data-testid="panel-trinity-insights-right"
            >
              <div className="p-4 border-b flex items-center justify-between gap-2 bg-gradient-to-r from-[#00BFFF]/10 via-[#3b82f6]/10 to-[#FFD700]/10">
                <div className="flex items-center gap-3">
                  <TrinityIconStatic size={24} />
                  <span className="font-semibold text-base">Trinity Insights</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowTrinityInsights(false)}
                  data-testid="button-close-trinity"
                  aria-label="Close Trinity Insights"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <TrinityInsightsPanel
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    shifts={shifts}
                    employees={employees}
                    clients={clients}
                    isCollapsed={false}
                    onToggleCollapse={() => setShowTrinityInsights(!showTrinityInsights)}
                  />
                  
                  {/* Schedule Upload - Production visible - Pattern Learning */}
                  <ScheduleUploadPanel />
                  
                  {/* Trinity Training Panel - DEV ONLY - AI Confidence Building */}
                  {import.meta.env.DEV && <TrinityTrainingPanel />}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Legacy Grid Hidden - Kept for Reference */}
        <div className="hidden">
          <div className="bg-card rounded-lg border overflow-hidden min-w-[800px]">
            <div className="grid grid-cols-8 border-b bg-muted/50">
              <div className="p-3 font-medium text-sm text-muted-foreground border-r">Time</div>
              {days.map(day => (
                <div key={day} className="p-3 text-center font-medium text-sm border-r last:border-r-0">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-8">
              <div className="border-r">
                {hours.map(hour => (
                  <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                ))}
              </div>
              {days.map((day, dayIndex) => (
                <div key={day} className="relative border-r last:border-r-0">
                  {hours.map(hour => (
                    <DroppableSlot key={hour} day={dayIndex} hour={hour} onClick={() => handleGridClick(dayIndex, hour)}>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-primary rounded-full p-1"><Plus className="w-4 h-4 text-primary-foreground" /></div>
                      </div>
                    </DroppableSlot>
                  ))}
                  {Object.entries(shiftsGrid)
                    .filter(([key]) => key.startsWith(`${dayIndex}-`))
                    .flatMap(([_, dayShifts]) => dayShifts)
                    .map(shift => {
                    const position = getShiftPosition(shift);
                    const employee = shift.employeeId ? employees.find(e => e.id === shift.employeeId) : null;
                    const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                    const isOpen = isOpenShift(shift);

                    return (
                      <div
                        key={shift.id}
                        className={`absolute left-1 right-1 rounded-lg p-2 cursor-pointer transition-all hover:shadow-sm hover:z-10 group ${
                          isOpen ? 'border-2 border-dashed border-orange-400' : ''
                        }`}
                        style={{
                          top: position.top,
                          height: position.height,
                          backgroundColor: isOpen ? '#fff7ed' : getEmployeeColor(shift.employeeId),
                          opacity: shift.status === 'draft' ? 0.7 : 1,
                          minHeight: '40px'
                        }}
                        data-testid={`shift-${shift.id}`}
                      >
                        {isOpen ? (
                          <div>
                            <div className="text-orange-600 dark:text-orange-400 text-xs font-bold flex items-center space-x-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>OPEN SHIFT</span>
                            </div>
                            <div className="text-foreground text-xs font-medium truncate">{shift.title}</div>
                            {client && <div className="text-muted-foreground text-xs truncate">{client.companyName}</div>}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAIFillOpenShift(shift.id);
                              }}
                              size="sm"
                              variant="default"
                              className="mt-1 h-6 text-xs"
                              data-testid={`button-ai-fill-${shift.id}`}
                            >
                              <Bot className="w-3 h-3 mr-1" />
                              AI Fill
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="text-white text-xs font-medium truncate">
                              {employee?.firstName} {employee?.lastName}
                            </div>
                            <div className="text-white text-xs opacity-90 truncate">
                              {shift.title || 'Shift'}
                              {client && ` - ${client.companyName}`}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {(shift.status === 'published' || shift.status === 'scheduled') && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-white/25 text-white px-1 py-0.5 rounded" data-testid={`badge-published-${shift.id}`}>
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Published
                                </span>
                              )}
                              {shift.status === 'draft' && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-yellow-500/30 text-yellow-100 px-1 py-0.5 rounded" data-testid={`badge-draft-${shift.id}`}>
                                  Draft
                                </span>
                              )}
                              {shift.aiGenerated && (
                                <span className="inline-flex items-center text-[9px] bg-white/25 text-white px-1 py-0.5 rounded">
                                  <Bot className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>

                            {/* Hover actions */}
                            <div className="absolute top-1 right-1 invisible group-hover:visible flex space-x-1">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                title="Edit shift"
                                data-testid={`button-edit-shift-${shift.id}`}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="" 
                                title="Duplicate shift"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateShift(shift);
                                }}
                                data-testid={`button-duplicate-shift-${shift.id}`}
                              >
                                <CopyPlus className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="secondary" 
                                size="icon" 
                                className="h-6 w-6" 
                                title="Request swap"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSwapShift(shift);
                                }}
                                data-testid={`button-swap-shift-${shift.id}`}
                                aria-label="Request swap"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                title="Delete shift"
                                data-testid={`button-delete-shift-${shift.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedShiftForAction(shift);
                                  // @ts-expect-error — TS migration: fix in refactoring sprint
                                  setConfirmDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Trinity AI Panel (hidden in Simple Mode) - FIXED OVERLAY */}
      <HideInSimpleMode>
      {showAIPanel && !isMobile && (
        <>
          {/* Backdrop - click to close - positioned below header+tabs (100px) */}
          <div 
            className="fixed inset-0 top-[100px] bg-black/20 z-[1499] transition-opacity"
            onClick={() => setShowAIPanel(false)}
            data-testid="ai-panel-backdrop"
          />
          {/* Panel - fixed position overlay, doesn't push content - positioned below header+tabs */}
          <div className="fixed top-[100px] right-0 w-96 h-[calc(100vh-100px)] bg-card border-l flex flex-col z-[1500] shadow-sm transform transition-transform duration-300 animate-in slide-in-from-right">
          <div className="p-4 border-b bg-gradient-to-r from-[#00BFFF]/10 via-[#3b82f6]/5 to-[#FFD700]/10">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <TrinityIconStatic size={24} />
                <h2 className="text-lg font-bold">Trinity AI</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowAIPanel(false)} aria-label="Close Trinity AI panel">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Intelligent schedule optimization
            </p>
          </div>

          <ScrollArea className="flex-1 p-4">
            {/* Open Shifts Alert */}
            {filteredShifts.filter(s => !s.employeeId).length > 0 ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                    <span className="font-medium text-sm text-orange-700 dark:text-orange-300">
                      {filteredShifts.filter(s => !s.employeeId).length} Open Shifts
                    </span>
                  </div>
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    Trinity can automatically fill these with the best available employees.
                  </p>
                  <Button
                    size="sm"
                    variant="default"
                    className="mt-2 w-full"
                    onClick={() => {
                      filteredShifts.filter(s => !s.employeeId).forEach(s => handleAIFillOpenShift(s.id));
                    }}
                    disabled={isAnyActionPending}
                    data-testid="button-fill-all-open"
                  >
                    {aiFillMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TrinityIconStatic size={14} className="mr-1" />}
                    {aiFillMutation.isPending ? 'Filling...' : 'Fill All Open Shifts'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 dark:text-green-400 mx-auto mb-3" />
                <p className="font-medium">All shifts covered!</p>
                <p className="text-sm text-muted-foreground">No open shifts this week</p>
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t space-y-2">
            <div className="bg-muted/30 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between gap-2 text-sm mb-2">
                <span>Trinity Status</span>
                <Badge variant="outline">
                  <TrinityIconStatic size={12} className="mr-1" />
                  {automationEnabled ? 'Active' : 'Standby'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                AI-assisted operations with human approval gates
              </div>
            </div>

            <Button
              variant="default"
              className="w-full"
              onClick={() => generateScheduleMutation.mutate()}
              disabled={isAnyActionPending}
              data-testid="button-generate-schedule"
            >
              {generateScheduleMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {generateScheduleMutation.isPending ? 'Generating...' : 'Generate Schedule'}
            </Button>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDuplicateWeek}
              disabled={isAnyActionPending}
              data-testid="button-duplicate-week"
            >
              {duplicateWeekMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarDays className="w-4 h-4 mr-2" />}
              {duplicateWeekMutation.isPending ? 'Duplicating...' : 'Duplicate Week'}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => publishScheduleMutation.mutate()}
              disabled={isAnyActionPending}
              data-testid="button-publish-schedule"
            >
              {publishScheduleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {publishScheduleMutation.isPending ? 'Publishing...' : 'Publish & Notify'}
            </Button>
          </div>
        </div>
        </>
      )}
      </HideInSimpleMode>

      {/* Shift Creation Modal - Extracted Component */}
      <ShiftCreationModal
        open={showShiftModal}
        onOpenChange={setShowShiftModal}
        shiftForm={shiftForm}
        setShiftForm={setShiftForm}
        modalPosition={modalPosition}
        employees={employees}
        clients={clients}
        onCreateShift={handleCreateShift}
        isCreating={createShiftMutation.isPending}
        isCreatingRecurring={createRecurringMutation.isPending}
        togglePostOrder={togglePostOrder}
      />
      
      {/* Edit Shift Modal - Extracted Component */}
      <EditShiftModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        selectedShift={selectedShiftForAction}
        employees={employees}
        clients={clients}
        onSave={(params) => editShiftMutation.mutate(params)}
        isPending={editShiftMutation.isPending}
      />
      
      {/* Duplicate Shift Modal - Extracted Component */}
      <DuplicateShiftModal
        open={showDuplicateModal}
        onOpenChange={setShowDuplicateModal}
        selectedShift={selectedShiftForAction}
        duplicateTargetDate={duplicateTargetDate}
        setDuplicateTargetDate={setDuplicateTargetDate}
        duplicateTargetEmployee={duplicateTargetEmployee}
        setDuplicateTargetEmployee={setDuplicateTargetEmployee}
        employees={employees}
        onDuplicate={(params) => duplicateShiftMutation.mutate(params)}
        isPending={duplicateShiftMutation.isPending}
      />
      
      {/* Swap Request Modal - Extracted Component */}
      <SwapRequestModal
        open={showSwapModal}
        onOpenChange={setShowSwapModal}
        selectedShift={selectedShiftForAction}
        swapReason={swapReason}
        setSwapReason={setSwapReason}
        swapTargetEmployee={swapTargetEmployee}
        setSwapTargetEmployee={setSwapTargetEmployee}
        employees={employees}
        onRequestSwap={(params) => requestSwapMutation.mutate(params)}
        isPending={requestSwapMutation.isPending}
      />
      
      {/* Shift Action Dialog - Extracted Component */}
      <ShiftActionDialog
        selectedShift={selectedShiftForAction}
        onClose={() => setSelectedShiftForAction(null)}
        employees={employees}
        clients={clients}
        getEmployeeColor={getEmployeeColor}
        onShowEditModal={() => setShowEditModal(true)}
        onShowDuplicateModal={() => setShowDuplicateModal(true)}
        onShowSwapModal={() => setShowSwapModal(true)}
        onAIFill={(shiftId) => {
          handleAIFillOpenShift(shiftId);
          setSelectedShiftForAction(null);
        }}
        onDelete={(shiftId) => {
          setShiftToDelete(shiftId);
          setIsDeleteDialogOpen(true);
          setSelectedShiftForAction(null);
        }}
        isAIFillPending={aiFillMutation.isPending}
        isDeletePending={deleteShiftMutation.isPending}
        showEditModal={showEditModal}
        showDuplicateModal={showDuplicateModal}
        showSwapModal={showSwapModal}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this shift? This action cannot be undone and will remove the shift from the schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (shiftToDelete) {
                  deleteShiftMutation.mutate(shiftToDelete);
                  setShiftToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    {/* Escalation Matrix Dialog - Extracted Component */}
    <EscalationMatrixDialog
      open={showEscalationMatrix}
      onOpenChange={setShowEscalationMatrix}
      escalationRules={escalationRules}
      onApplyRules={() => {
        toast({ title: "Escalation rules saved", description: "System will monitor and enforce these rules" });
        setShowEscalationMatrix(false);
      }}
    />
    
    {/* Trinity Scheduling Summary Modal */}
    <TrinitySchedulingSummaryModal
      open={showSchedulingSummary}
      onOpenChange={setShowSchedulingSummary}
      result={schedulingResult}
      workspaceId={workspaceId || ''}
      onVerified={() => {
        setAutomationEnabled(true);
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      }}
      onRejected={() => {
        setAutomationEnabled(false);
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      }}
    />
    
    {/* DragOverlay - shows full-opacity clone during drag */}
    <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
      {activeEmployeeId && employees.find(e => e.id === activeEmployeeId) ? (
        <div className="p-3 rounded-lg border border-primary bg-card cursor-grabbing opacity-100 shadow-2xl">
          {(() => {
            const activeEmployee = employees.find(e => e.id === activeEmployeeId)!;
            return (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getEmployeeColor(activeEmployee.id) }}
                    />
                    <span className="font-medium text-sm">{activeEmployee.firstName} {activeEmployee.lastName}</span>
                  </div>
                  {activeEmployee.performanceScore && (
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">{activeEmployee.performanceScore}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{activeEmployee.role || 'Employee'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ${activeEmployee.hourlyRate?.toString() || '0'}/hr
                </div>
              </>
            );
          })()}
        </div>
      ) : null}
      {draggedShiftId && (() => {
        const draggedShift = shifts.find(s => s.id === draggedShiftId);
        if (!draggedShift) return null;
        const startTime = new Date(draggedShift.startTime);
        const endTime = new Date(draggedShift.endTime);
        const client = draggedShift.clientId ? clients.find(c => c.id === draggedShift.clientId) : null;
        const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const statusColor = getShiftStatusColor(draggedShift);
        const emp = draggedShift.employeeId ? employees.find(e => e.id === draggedShift.employeeId) : null;
        return (
          <div
            className="rounded-lg shadow-2xl ring-2 ring-primary/50 px-3 py-2 text-white pointer-events-none"
            style={{ backgroundColor: statusColor.bg, width: 220, transform: 'scale(1.05)' }}
            data-testid="inline-shift-drag-overlay"
          >
            <div className="font-bold text-[11px] truncate">
              {formatTime(startTime)} - {formatTime(endTime)}
            </div>
            {emp && <div className="text-[10px] opacity-90 truncate">{emp.firstName} {emp.lastName}</div>}
            {client && <div className="text-[10px] opacity-75 truncate">{client.companyName}</div>}
            <div className="text-[9px] opacity-60 mt-1">Drop on another employee to reassign</div>
          </div>
        );
      })()}
    </DragOverlay>
    </DndContext>
  );
}
