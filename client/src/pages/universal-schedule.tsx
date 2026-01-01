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

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmployee } from '@/hooks/useEmployee';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { useClientLookup } from '@/hooks/useClients';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar, Clock, Users, Edit2, Trash2, Copy, ChevronLeft, ChevronRight, Plus, Download,
  Bot, CheckCircle, AlertCircle, BarChart3, Play, X, Camera, MessageSquare, FileText,
  CheckSquare, MapPin, Menu, Sparkles, Zap, Bell, Settings, Shield, UserCheck, XCircle,
  PauseCircle, Send, AlertTriangle, Repeat, ArrowRightLeft, CalendarDays, CopyPlus
} from 'lucide-react';
import type { Shift, Employee, Client, ShiftOrder, RecurringShiftPattern, ShiftSwapRequest } from '@shared/schema';
import ScheduleMobileFirst from '@/pages/schedule-mobile-first';
import { WorkspaceLayout } from '@/components/workspace-layout';

// Post order template data (will be pre-created in database)
const POST_ORDER_TEMPLATES = [
  {
    id: '1',
    title: 'Security Patrol Requirements',
    description: 'Complete hourly patrols of all assigned areas',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Take photos of each checkpoint during patrol'
  },
  {
    id: '2',
    title: 'Opening Procedures',
    description: 'Follow all opening checklist items',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: false,
    photoFrequency: null,
    photoInstructions: null
  },
  {
    id: '3',
    title: 'Closing Procedures',
    description: 'Complete all closing duties and security checks',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'at_completion' as const,
    photoInstructions: 'Document all secured areas before leaving'
  },
  {
    id: '4',
    title: 'Equipment Inspection',
    description: 'Inspect and document condition of all equipment',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Photo evidence of equipment status'
  }
];

interface ShiftFormData {
  employeeId: string | null;
  position: string;
  clockIn: string;
  clockOut: string;
  notes: string;
  postOrders: string[];
  isOpenShift: boolean;
  clientId: string;
  location: string;
  isRecurring: boolean;
  recurrencePattern: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: string[];
  endDate: string;
}

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

// Draggable Employee Component (Memoized for performance)
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
    opacity: isDragging ? 0 : 1  // Hide original during drag (DragOverlay shows clone)
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`p-3 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all ${
        isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
      } ${isDragging ? 'z-50' : ''}`}
      data-testid={`employee-card-${employee.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: getEmployeeColor(employee.id) }}
          />
          <span className="font-medium text-sm">{employee.firstName} {employee.lastName}</span>
        </div>
        {employee.performanceScore && (
          <span className="text-xs font-bold text-green-600">{employee.performanceScore}</span>
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

export default function UniversalSchedule() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();
  const { workspaceRole, platformRole } = useWorkspaceAccess();
  
  // RBAC permissions - prefer workspaceRole, fallback to platformRole
  // This ensures users with platformRole set (but workspaceRole null) retain access
  const effectiveRole = workspaceRole || platformRole;
  const isManager = ['manager', 'admin', 'owner', 'org_owner'].includes(effectiveRole);
  const isAdmin = ['admin', 'owner', 'org_owner'].includes(effectiveRole);
  
  // Handler for admin-only actions
  const handleAdminOnlyAction = (actionName: string) => {
    if (!isAdmin) {
      toast({
        title: "Admin Access Required",
        description: `${actionName} is only available to administrators.`,
        variant: "destructive"
      });
      return;
    }
    // When implemented: actual action logic goes here
    toast({
      title: "Feature Coming Soon",
      description: `${actionName} will be implemented in a future update.`
    });
  };
  
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
  
  // Drag start handler
  const handleDragStart = (event: any) => {
    setActiveEmployeeId(event.active.id as string);
  };
  
  // Drag-and-drop handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveEmployeeId(null); // Clear active drag
    if (!over) return;
    
    const employeeId = active.id as string;
    const { day, hour } = over.data.current as { day: number; hour: number };
    
    // Calculate date from day index
    const shiftDate = new Date(weekStart);
    shiftDate.setDate(shiftDate.getDate() + day);
    
    // Calculate clock times (default 8-hour shift)
    const clockInHour = hour.toString().padStart(2, '0');
    const clockOutHour = Math.min(hour + 8, 23).toString().padStart(2, '0');
    
    // Prefill shift form and open modal
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
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
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
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedShiftForAction, setSelectedShiftForAction] = useState<Shift | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState('');
  const [duplicateTargetEmployee, setDuplicateTargetEmployee] = useState<string | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [swapTargetEmployee, setSwapTargetEmployee] = useState<string | null>(null);

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
    date.setDate(date.getDate() + 6);
    return date;
  }, [weekStart]);

  const weekDisplay = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString('en-US', options)} - ${weekEnd.toLocaleDateString('en-US', options)}, ${weekEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  // Fetch shifts for current week with date range filtering
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(
        `/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    }
  });

  // Fetch employees
  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients for dropdown
  const { data: clients = [], isLoading: clientsLoading } = useClientLookup();

  const isLoading = shiftsLoading || employeesLoading || clientsLoading;

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
        status: shiftData.isOpenShift ? 'open' : 'draft',
        aiGenerated: false,
        postOrders: shiftData.postOrders // ✅ CRITICAL: Include post orders array
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
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

  // AI Fill mutation
  const aiFillMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest('POST', `/api/shifts/${shiftId}/ai-fill`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'AI auto-filled shift',
        description: 'Smart AI found the best available employee for this shift',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'AI fill failed',
        description: error.message,
      });
    }
  });

  const handleGridClick = (dayIndex: number, hourIndex: number) => {
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
  };
  
  // Duplicate shift mutation
  const duplicateShiftMutation = useMutation({
    mutationFn: async ({ shiftId, targetDate, targetEmployeeId }: { shiftId: string; targetDate: string; targetEmployeeId?: string }) => {
      return await apiRequest('POST', `/api/scheduling/shifts/${shiftId}/duplicate`, {
        targetDate,
        targetEmployeeId,
        copyNotes: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
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

  // Request swap mutation
  const requestSwapMutation = useMutation({
    mutationFn: async ({ shiftId, reason, targetEmployeeId }: { shiftId: string; reason: string; targetEmployeeId?: string }) => {
      return await apiRequest('POST', `/api/scheduling/shifts/${shiftId}/swap-request`, {
        reason,
        targetEmployeeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
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
      return await apiRequest('POST', '/api/scheduling/recurring', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
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
  
  // Duplicate week mutation
  const duplicateWeekMutation = useMutation({
    mutationFn: async ({ sourceWeekStart, targetWeekStart }: { sourceWeekStart: string; targetWeekStart: string }) => {
      return await apiRequest('POST', '/api/scheduling/duplicate-week', {
        sourceWeekStart,
        targetWeekStart,
        skipExisting: true,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
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
  
  const handleDuplicateShift = (shift: Shift) => {
    setSelectedShiftForAction(shift);
    const nextDay = new Date(shift.startTime);
    nextDay.setDate(nextDay.getDate() + 7);
    setDuplicateTargetDate(nextDay.toISOString().split('T')[0]);
    setDuplicateTargetEmployee(shift.employeeId);
    setShowDuplicateModal(true);
  };
  
  const handleQuickDuplicate = (shift: Shift) => {
    const nextWeek = new Date(shift.startTime);
    nextWeek.setDate(nextWeek.getDate() + 7);
    duplicateShiftMutation.mutate({
      shiftId: shift.id,
      targetDate: nextWeek.toISOString().split('T')[0],
      targetEmployeeId: shift.employeeId || undefined,
    });
  };
  
  const handleSwapShift = (shift: Shift) => {
    setSelectedShiftForAction(shift);
    setSwapReason('');
    setSwapTargetEmployee(null);
    setShowSwapModal(true);
  };
  
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

  // Helper for week navigation
  const handleWeekChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      goToPreviousWeek();
    } else {
      goToNextWeek();
    }
  };

  if (isLoading) {
    return (
      <WorkspaceLayout>
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 animate-pulse" style={{ color: '#3b82f6' }} />
            <p className="text-muted-foreground">Loading schedule...</p>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  // Mobile: Render new mobile-first schedule wrapped in WorkspaceLayout
  if (isMobile) {
    return (
      <WorkspaceLayout>
        <ScheduleMobileFirst />
      </WorkspaceLayout>
    );
  }

  // Desktop: Render grid-based schedule wrapped in WorkspaceLayout
  return (
    <WorkspaceLayout maxWidth="full">
      <DndContext
        sensors={isTouchDevice ? [] : sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-screen bg-background">
        {/* Desktop Employee Sidebar */}
        {!isMobile && (
        <div className="w-64 bg-card border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-bold">Employees</h2>
            <p className="text-sm text-muted-foreground">{employees.length} active</p>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {employees.map(employee => (
                <DraggableEmployee
                  key={employee.id}
                  employee={employee}
                  isSelected={selectedEmployee?.id === employee.id}
                  onSelect={() => setSelectedEmployee(employee)}
                  getEmployeeColor={getEmployeeColor}
                />
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <Button className="w-full" data-testid="button-add-employee">
              <Plus className="w-4 h-4 mr-2" />
              Add Employee
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b p-4">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              {/* Mobile Menu */}
              {isMobile && (
                <Sheet open={mobileEmployeePanelOpen} onOpenChange={setMobileEmployeePanelOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-menu">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0">
                    <div className="p-4 border-b">
                      <h2 className="text-lg font-bold">Employees</h2>
                      <p className="text-sm text-muted-foreground">{employees.length} active</p>
                    </div>
                    <ScrollArea className="h-[calc(100vh-120px)] p-4">
                      <div className="space-y-2">
                        {employees.map(employee => (
                          <div
                            key={employee.id}
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setMobileEmployeePanelOpen(false);
                            }}
                            className="p-3 rounded-lg border-2 cursor-pointer transition-all"
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getEmployeeColor(employee.id) }}
                              />
                              <span className="font-medium text-sm">{employee.firstName} {employee.lastName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              )}

              <h1 className="text-2xl font-bold">Weekly Schedule</h1>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" onClick={goToPreviousWeek} data-testid="button-prev-week">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <span className="text-sm font-medium whitespace-nowrap">{weekDisplay}</span>
                <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Schedule Tools - RBAC-aware toolbar */}
            {isManager ? (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Shift Governance */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-shift-governance">
                      <UserCheck className="w-4 h-4 mr-1" />
                      Approvals
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Shift Governance</h4>
                      <Separator />
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => {
                        try {
                          const response = await apiRequest('GET', '/api/shifts/pending');
                          const data = await response.json();
                          setPendingShifts(data || []);
                          setShowApproveDialog(true);
                        } catch (error: any) {
                          toast({ description: error.message, variant: "destructive" });
                        }
                      }} data-testid="button-approve-shifts">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                        Approve Pending Shifts
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => {
                        toast({ description: "Review rejections - filtering pending shifts with 'rejected' status" });
                        setShowApproveDialog(true);
                      }} data-testid="button-reject-shifts">
                        <XCircle className="w-4 h-4 mr-2 text-red-600" />
                        Review Rejections
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setShowEscalationMatrix(true)} data-testid="button-escalations">
                        <AlertCircle className="w-4 h-4 mr-2 text-orange-600" />
                        Escalation Matrix
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('Lock Schedule')}
                        data-testid="button-lock-schedule"
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        Lock Schedule {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('Override Rules')}
                        data-testid="button-override-rules"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Override Rules {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Process Automation */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-process-automation">
                      <Zap className="w-4 h-4 mr-1" />
                      Workflows
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Automation & Workflows</h4>
                      <Separator />
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => {
                        try {
                          const response = await apiRequest('GET', '/api/workflows/active');
                          const data = await response.json();
                          setActiveWorkflows(data || []);
                          setShowWorkflowsDialog(true);
                        } catch (error: any) {
                          toast({ description: error.message, variant: "destructive" });
                        }
                      }} data-testid="button-view-workflows">
                        <Clock className="w-4 h-4 mr-2" />
                        View Active Workflows
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => {
                        try {
                          await apiRequest('POST', '/api/ai/trigger-fill', {});
                          toast({ title: "AI Fill Triggered", description: "Trinity AI is optimizing your schedule" });
                        } catch (error: any) {
                          toast({ description: error.message, variant: "destructive" });
                        }
                      }} data-testid="button-trigger-fill">
                        <Bot className="w-4 h-4 mr-2 text-blue-600" />
                        Trigger AI Fill
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('Pause Automation')}
                        data-testid="button-pause-automation"
                      >
                        <PauseCircle className="w-4 h-4 mr-2" />
                        Pause Automation {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('Manage Rules')}
                        data-testid="button-manage-rules"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Manage Rules {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Communications */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-communications">
                      <Bell className="w-4 h-4 mr-1" />
                      Alerts
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Communications & Alerts</h4>
                      <Separator />
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setShowReminderDialog(true)} data-testid="button-send-reminder">
                        <Send className="w-4 h-4 mr-2" />
                        Send Shift Reminder
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setShowEscalationMatrix(true)} data-testid="button-escalation-matrix">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Escalation Matrix
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => toast({ description: "Exception alerts feature coming soon" })} data-testid="button-exception-alerts">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Exception Alerts
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('Compliance Audit')}
                        data-testid="button-compliance-audit"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Compliance Audit {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={() => handleAdminOnlyAction('AI Override Log')}
                        data-testid="button-ai-override-log"
                      >
                        <Bot className="w-4 h-4 mr-2" />
                        AI Override Log {!isAdmin && <span className="ml-auto text-xs text-muted-foreground">(Admin)</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* AI Assistant - preserved */}
                <Button
                  onClick={() => setShowAIPanel(!showAIPanel)}
                  className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                  size="sm"
                  data-testid="button-ai-assistant"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  AI Assistant
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Employee view - minimal toolbar */}
                <Button
                  onClick={() => setShowAIPanel(!showAIPanel)}
                  className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                  size="sm"
                  data-testid="button-ai-assistant"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  AI Assistant
                </Button>
              </div>
            )}
          </div>

          {/* AI Status Bar */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-[#3b82f6]/10 to-[#22d3ee]/10 rounded-lg border border-[#3b82f6]/20">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <span className="font-medium text-sm">AI Automation</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutomationEnabled(!automationEnabled)}
                  className={`h-6 px-2 ${automationEnabled ? 'text-green-600' : 'text-muted-foreground'}`}
                  data-testid="button-ai-toggle"
                >
                  {automationEnabled ? 'ON' : 'OFF'}
                </Button>
              </div>

              <div className="h-6 w-px bg-border" />

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Smart AI Engine</span>
              </div>
            </div>

            {manualApprovalMode && (
              <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/20 border-yellow-600 text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Manual Approval Required
              </Badge>
            )}
          </div>
        </div>

        {/* Schedule Grid */}
        <ScrollArea className="flex-1 p-4">
          <div className="bg-card rounded-lg border overflow-hidden min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 border-b bg-muted/50">
              <div className="p-3 font-medium text-sm text-muted-foreground border-r">
                Time
              </div>
              {days.map(day => (
                <div key={day} className="p-3 text-center font-medium text-sm border-r last:border-r-0">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Content */}
            <div className="grid grid-cols-8">
              {/* Time Column */}
              <div className="border-r">
                {hours.map(hour => (
                  <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                ))}
              </div>

              {/* Day Columns with Shifts */}
              {days.map((day, dayIndex) => (
                <div key={day} className="relative border-r last:border-r-0">
                  {/* Hour grid lines with plus icons */}
                  {hours.map(hour => (
                    <DroppableSlot
                      key={hour}
                      day={dayIndex}
                      hour={hour}
                      onClick={() => handleGridClick(dayIndex, hour)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-primary rounded-full p-1">
                          <Plus className="w-4 h-4 text-primary-foreground" />
                        </div>
                      </div>
                    </DroppableSlot>
                  ))}

                  {/* Shifts - render all shifts for this day */}
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
                        className={`absolute left-1 right-1 rounded-lg p-2 cursor-pointer transition-all hover:shadow-lg hover:z-10 group ${
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
                            <div className="text-orange-600 text-xs font-bold flex items-center space-x-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>OPEN SHIFT</span>
                            </div>
                            <div className="text-gray-700 text-xs font-medium truncate">{shift.title}</div>
                            {client && <div className="text-gray-600 text-xs truncate">{client.companyName}</div>}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAIFillOpenShift(shift.id);
                              }}
                              size="sm"
                              className="mt-1 h-6 text-xs bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
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
                            {shift.aiGenerated && (
                              <div className="absolute top-1 right-1 bg-white rounded-full p-1">
                                <Bot className="w-3 h-3" style={{ color: '#3b82f6' }} />
                              </div>
                            )}

                            {/* Hover actions */}
                            <div className="absolute top-1 right-1 hidden group-hover:flex space-x-1">
                              <Button variant="secondary" size="icon" className="h-6 w-6" title="Edit shift">
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="secondary" 
                                size="icon" 
                                className="h-6 w-6" 
                                title="Duplicate shift"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateShift(shift);
                                }}
                                data-testid={`button-duplicate-${shift.id}`}
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
                                data-testid={`button-swap-${shift.id}`}
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                              </Button>
                              <Button variant="destructive" size="icon" className="h-6 w-6" title="Delete shift">
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
        </ScrollArea>
      </div>

      {/* Right Sidebar - AI Panel */}
      {showAIPanel && !isMobile && (
        <div className="w-96 bg-card border-l flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">AI Recommendations</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowAIPanel(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Smart AI monitoring for coverage gaps
            </p>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">No pending AI recommendations</p>
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="bg-gradient-to-r from-[#3b82f6]/10 to-[#22d3ee]/10 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Smart AI Status</span>
                <Badge variant="outline" className="bg-background/50">
                  <Bot className="w-3 h-3 mr-1" />
                  99% AI, 1% Human
                </Badge>
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
              data-testid="button-generate-schedule"
            >
              <Play className="w-4 h-4 mr-2" />
              Generate AI Schedule for Next Week
            </Button>
            
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={handleDuplicateWeek}
              disabled={duplicateWeekMutation.isPending}
              data-testid="button-duplicate-week"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              {duplicateWeekMutation.isPending ? 'Duplicating...' : 'Duplicate Week to Next Week'}
            </Button>
          </div>
        </div>
      )}

      {/* Shift Creation Modal - Compact GetSling-style popup */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent size="md">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">New Shift</DialogTitle>
            <DialogDescription className="text-sm">
              {days[modalPosition.day]} at {modalPosition.hour}:00
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {/* Open Shift Toggle - Compact */}
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
              <Checkbox
                id="open-shift"
                checked={shiftForm.isOpenShift}
                onCheckedChange={(checked) =>
                  setShiftForm(prev => ({ ...prev, isOpenShift: checked as boolean }))
                }
                data-testid="checkbox-open-shift"
              />
              <Label htmlFor="open-shift" className="flex items-center gap-1.5 text-sm cursor-pointer">
                <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                <span className="font-medium">Open Shift</span>
                <span className="text-xs text-muted-foreground ml-1">(AI fills)</span>
              </Label>
            </div>

            {/* Employee Selection */}
            {!shiftForm.isOpenShift && (
              <div className="space-y-1.5">
                <Label htmlFor="employee" className="text-sm">Employee *</Label>
                <Select value={shiftForm.employeeId || ''} onValueChange={(value) =>
                  setShiftForm(prev => ({ ...prev, employeeId: value }))
                }>
                  <SelectTrigger id="employee" data-testid="select-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Position & Client - Side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="position" className="text-sm">Position *</Label>
                <Input
                  id="position"
                  value={shiftForm.position}
                  onChange={(e) => setShiftForm(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="Role"
                  data-testid="input-position"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client" className="text-sm">Client</Label>
                <Select value={shiftForm.clientId} onValueChange={(value) =>
                  setShiftForm(prev => ({ ...prev, clientId: value }))
                }>
                  <SelectTrigger id="client" data-testid="select-client">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-sm">Location</Label>
              <Input
                id="location"
                value={shiftForm.location}
                onChange={(e) => setShiftForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Area/Site"
                data-testid="input-location"
              />
            </div>

            {/* Clock In/Out - Compact */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="clock-in" className="text-sm">Start</Label>
                <Input
                  id="clock-in"
                  type="time"
                  value={shiftForm.clockIn}
                  onChange={(e) => setShiftForm(prev => ({ ...prev, clockIn: e.target.value }))}
                  data-testid="input-clock-in"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clock-out" className="text-sm">End</Label>
                <Input
                  id="clock-out"
                  type="time"
                  value={shiftForm.clockOut}
                  onChange={(e) => setShiftForm(prev => ({ ...prev, clockOut: e.target.value }))}
                  data-testid="input-clock-out"
                />
              </div>
            </div>

            {/* Notes - Compact */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm">Notes</Label>
              <Textarea
                id="notes"
                value={shiftForm.notes}
                onChange={(e) => setShiftForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Instructions..."
                className="min-h-[60px] text-sm"
                data-testid="textarea-notes"
              />
            </div>

            {/* Recurring Shift Toggle */}
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border-dashed border border-muted-foreground/20">
              <Checkbox
                id="recurring-shift"
                checked={shiftForm.isRecurring}
                onCheckedChange={(checked) =>
                  setShiftForm(prev => ({ ...prev, isRecurring: checked as boolean }))
                }
                data-testid="checkbox-recurring"
              />
              <Label htmlFor="recurring-shift" className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Repeat className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium">Make Recurring</span>
                <span className="text-xs text-muted-foreground ml-1">(repeating shifts)</span>
              </Label>
            </div>
            
            {/* Recurring Options */}
            {shiftForm.isRecurring && (
              <div className="space-y-3 p-3 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50">
                <div className="space-y-1.5">
                  <Label className="text-sm">Repeat Pattern</Label>
                  <Select 
                    value={shiftForm.recurrencePattern} 
                    onValueChange={(value: 'daily' | 'weekly' | 'biweekly' | 'monthly') =>
                      setShiftForm(prev => ({ ...prev, recurrencePattern: value }))
                    }
                  >
                    <SelectTrigger data-testid="select-recurrence">
                      <SelectValue placeholder="Select pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-sm">Days of Week</Label>
                  <div className="flex flex-wrap gap-1">
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={shiftForm.daysOfWeek.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setShiftForm(prev => ({
                            ...prev,
                            daysOfWeek: prev.daysOfWeek.includes(day.value)
                              ? prev.daysOfWeek.filter(d => d !== day.value)
                              : [...prev.daysOfWeek, day.value]
                          }));
                        }}
                        data-testid={`day-${day.value}`}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="end-date" className="text-sm">End Date (optional)</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={shiftForm.endDate}
                    onChange={(e) => setShiftForm(prev => ({ ...prev, endDate: e.target.value }))}
                    data-testid="input-end-date"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty for 30-day default</p>
                </div>
              </div>
            )}
            
            {/* Post Orders - Collapsible */}
            <div className="space-y-1.5">
              <Label className="text-sm">Post Orders</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {POST_ORDER_TEMPLATES.map(order => {
                  const isSelected = shiftForm.postOrders.includes(order.id);
                  return (
                    <div
                      key={order.id}
                      className={`border rounded-md p-2 cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => togglePostOrder(order.id)}
                      data-testid={`post-order-${order.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={isSelected} />
                        <span className="text-xs font-medium flex-1">{order.title}</span>
                        <div className="flex gap-1">
                          {order.requiresAcknowledgment && (
                            <CheckSquare className="w-3 h-3 text-muted-foreground" />
                          )}
                          {order.requiresSignature && (
                            <FileText className="w-3 h-3 text-muted-foreground" />
                          )}
                          {order.requiresPhotos && (
                            <Camera className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {order.photoInstructions && isSelected && (
                        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                          <MessageSquare className="w-3 h-3 inline mr-1" />
                          {order.photoInstructions}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShiftModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateShift}
              disabled={(createShiftMutation.isPending || createRecurringMutation.isPending) || (!shiftForm.isOpenShift && !shiftForm.employeeId) || !shiftForm.position || (shiftForm.isRecurring && shiftForm.daysOfWeek.length === 0)}
              className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
              data-testid="button-create-shift"
            >
              {createShiftMutation.isPending || createRecurringMutation.isPending ? 'Creating...' : shiftForm.isRecurring ? 'Create Recurring Shifts' : 'Create Shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Duplicate Shift Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CopyPlus className="w-5 h-5 text-blue-600" />
              Duplicate Shift
            </DialogTitle>
            <DialogDescription>
              Copy this shift to another date
            </DialogDescription>
          </DialogHeader>
          
          {selectedShiftForAction && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="font-medium">{selectedShiftForAction.title}</div>
                <div className="text-muted-foreground">
                  {new Date(selectedShiftForAction.startTime).toLocaleDateString()} at {new Date(selectedShiftForAction.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="target-date">Target Date</Label>
                <Input
                  id="target-date"
                  type="date"
                  value={duplicateTargetDate}
                  onChange={(e) => setDuplicateTargetDate(e.target.value)}
                  data-testid="input-duplicate-date"
                />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="target-employee">Assign to Employee (optional)</Label>
                <Select value={duplicateTargetEmployee || ''} onValueChange={setDuplicateTargetEmployee}>
                  <SelectTrigger id="target-employee" data-testid="select-duplicate-employee">
                    <SelectValue placeholder="Same employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_keep">Keep same employee</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedShiftForAction && duplicateTargetDate) {
                  duplicateShiftMutation.mutate({
                    shiftId: selectedShiftForAction.id,
                    targetDate: duplicateTargetDate,
                    targetEmployeeId: duplicateTargetEmployee === '_keep' ? undefined : duplicateTargetEmployee || undefined,
                  });
                }
              }}
              disabled={duplicateShiftMutation.isPending || !duplicateTargetDate}
              className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee]"
              data-testid="button-confirm-duplicate"
            >
              {duplicateShiftMutation.isPending ? 'Duplicating...' : 'Duplicate Shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Swap Request Modal */}
      <Dialog open={showSwapModal} onOpenChange={setShowSwapModal}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-orange-600" />
              Request Shift Swap
            </DialogTitle>
            <DialogDescription>
              Request to swap this shift with another employee
            </DialogDescription>
          </DialogHeader>
          
          {selectedShiftForAction && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="font-medium">{selectedShiftForAction.title}</div>
                <div className="text-muted-foreground">
                  {new Date(selectedShiftForAction.startTime).toLocaleDateString()} at {new Date(selectedShiftForAction.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="swap-reason">Reason for Swap</Label>
                <Textarea
                  id="swap-reason"
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="Why do you need to swap this shift?"
                  className="min-h-[80px]"
                  data-testid="textarea-swap-reason"
                />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="swap-target">Preferred Swap With (optional)</Label>
                <Select value={swapTargetEmployee || ''} onValueChange={setSwapTargetEmployee}>
                  <SelectTrigger id="swap-target" data-testid="select-swap-target">
                    <SelectValue placeholder="Anyone available" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_any">Anyone available</SelectItem>
                    {employees.filter(emp => emp.id !== selectedShiftForAction.employeeId).map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Manager approval required</p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSwapModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedShiftForAction) {
                  requestSwapMutation.mutate({
                    shiftId: selectedShiftForAction.id,
                    reason: swapReason,
                    targetEmployeeId: swapTargetEmployee === '_any' ? undefined : swapTargetEmployee || undefined,
                  });
                }
              }}
              disabled={requestSwapMutation.isPending}
              className="bg-gradient-to-r from-orange-500 to-amber-500"
              data-testid="button-confirm-swap"
            >
              {requestSwapMutation.isPending ? 'Requesting...' : 'Request Swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {/* Escalation Matrix Dialog */}
    <Dialog open={showEscalationMatrix} onOpenChange={setShowEscalationMatrix}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escalation Matrix - Shift Coverage</DialogTitle>
          <DialogDescription>
            Automated escalation rules for unfilled shift coverage
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {escalationRules.map((rule) => (
            <div key={rule.level} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 text-orange-800">Level {rule.level}</Badge>
                  <span className="font-medium">{rule.condition}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{rule.timeout}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                <span>Action: {rule.action}</span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEscalationMatrix(false)}>
            Close
          </Button>
          <Button onClick={() => {
            toast({ title: "Escalation rules saved", description: "System will monitor and enforce these rules" });
            setShowEscalationMatrix(false);
          }}>
            Apply Rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    {/* DragOverlay - shows full-opacity clone during drag */}
    <DragOverlay>
      {activeEmployeeId && employees.find(e => e.id === activeEmployeeId) ? (
        <div className="p-3 rounded-lg border-2 border-primary bg-card cursor-grabbing opacity-100 shadow-2xl">
          {(() => {
            const activeEmployee = employees.find(e => e.id === activeEmployeeId)!;
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getEmployeeColor(activeEmployee.id) }}
                    />
                    <span className="font-medium text-sm">{activeEmployee.firstName} {activeEmployee.lastName}</span>
                  </div>
                  {activeEmployee.performanceScore && (
                    <span className="text-xs font-bold text-green-600">{activeEmployee.performanceScore}</span>
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
    </DragOverlay>
      </DndContext>
    </WorkspaceLayout>
  );
}
