import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Send,
  Trash2,
  Users,
  Sparkles,
  GripVertical,
  UserPlus,
  Calendar,
  Printer,
  Bug,
  HelpCircle,
  LayoutGrid,
  User,
  ListChecks,
  Home,
  ArrowLeft,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EnhancedEmptyState } from "@/components/enhanced-empty-state";
import { SlingMobileSchedule } from "@/components/schedule-mobile-sling";
import type { Shift, Employee, Client } from "@shared/schema";
import moment from "moment";

// Draggable shift card
function DraggableShiftCard({ shift, employee, client, onAddAcknowledgment }: {
  shift: Shift;
  employee?: Employee;
  client?: Client;
  onAddAcknowledgment?: (shift: Shift) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: shift.id,
    data: { shift },
  });

  const isOpen = !shift.employeeId;
  const isDraft = shift.status === 'draft';
  const isPublished = shift.status === 'published';

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const duration = moment.duration(moment(shift.endTime).diff(moment(shift.startTime)));
  const hours = duration.asHours().toFixed(1);

  // Sling-style: Large colored block filling the cell
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        w-full rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing relative group
        transition-all
        ${isDraft ? 'bg-gradient-to-br from-amber-500 to-amber-600 border-2 border-amber-400 animate-pulse' : ''}
        ${isPublished && !isOpen ? 'bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400' : ''}
        ${isOpen ? 'bg-gradient-to-br from-purple-500 to-purple-600 border-2 border-dashed border-purple-400' : ''}
        ${isDragging ? 'opacity-50' : 'hover-elevate active-elevate-2'}
      `}
      data-testid={`shift-card-${shift.id}`}
      {...listeners}
      {...attributes}
    >
      {/* Time - Very prominent like Sling */}
      <div className="text-white font-bold text-base mb-1">
        {moment(shift.startTime).format('h:mm A')} - {moment(shift.endTime).format('h:mm A')}
      </div>
      
      {/* Duration */}
      <div className="text-white/90 text-sm mb-2">
        {hours} hours
      </div>

      {/* Location/Client - Prominent like Sling */}
      {client && (
        <div className="text-white/95 font-semibold text-sm mb-1">
          {client.firstName} {client.lastName}
        </div>
      )}

      {/* Employee name (not shown if open shift) */}
      {!isOpen && employee && (
        <div className="text-white/80 text-xs">
          {employee.firstName} {employee.lastName}
        </div>
      )}

      {/* Open shift indicator */}
      {isOpen && (
        <div className="text-white/95 font-semibold text-sm flex items-center gap-1">
          <Users className="h-4 w-4" />
          Unassigned
        </div>
      )}

      {/* Add acknowledgment button - top right corner */}
      {onAddAcknowledgment && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onAddAcknowledgment(shift);
          }}
          data-testid={`button-add-acknowledgment-${shift.id}`}
        >
          <Plus className="h-4 w-4 text-white" />
        </Button>
      )}

      {/* Status badge - bottom right */}
      {isDraft && (
        <div className="absolute bottom-2 right-2 bg-white/20 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-md font-semibold">
          DRAFT
        </div>
      )}
    </div>
  );
}

// Droppable day cell for an employee
function DroppableDayCell({ employeeId, date, shifts, employees, clients, onShiftClick, onCreateShift, onAddAcknowledgment }: {
  employeeId: string;
  date: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
  onCreateShift?: (employeeId: string, date: Date) => void;
  onAddAcknowledgment?: (shift: Shift) => void;
}) {
  const dropId = `${employeeId}-${moment(date).format('YYYY-MM-DD')}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { employeeId, date },
  });

  const shiftsInDay = useMemo(() => {
    return shifts.filter(shift => {
      if (shift.employeeId !== employeeId) return false;
      return moment(shift.startTime).isSame(date, 'day');
    }).sort((a, b) => moment(a.startTime).diff(moment(b.startTime)));
  }, [shifts, employeeId, date]);

  const handleCellClick = () => {
    if (shiftsInDay.length === 0 && onCreateShift) {
      onCreateShift(employeeId, date);
    }
  };

  const isToday = moment(date).isSame(moment(), 'day');

  return (
    <div
      ref={setNodeRef}
      onClick={handleCellClick}
      className={`
        min-h-[120px] flex-1 min-w-[140px] border-r border-b p-2 relative group cursor-pointer transition-all
        ${isOver ? 'bg-primary/10 ring-2 ring-primary' : 'bg-background'}
        ${isToday ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}
        hover-elevate
      `}
      data-testid={`drop-zone-${dropId}`}
    >
      {shiftsInDay.map(shift => (
        <div
          key={shift.id}
          onClick={(e) => {
            e.stopPropagation();
            onShiftClick(shift);
          }}
          className="mb-2 last:mb-0"
        >
          <DraggableShiftCard
            shift={shift}
            employee={employees.find(e => e.id === shift.employeeId)}
            client={clients.find(c => c.id === shift.clientId)}
            onAddAcknowledgment={onAddAcknowledgment}
          />
        </div>
      ))}
      
      {/* Add Shift Hint - shows on hover for empty cells */}
      {shiftsInDay.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-primary/20 backdrop-blur-sm border border-primary/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">Add Shift</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Employee row with day columns
function EmployeeRow({ employee, weekDays, shifts, employees, clients, onShiftClick, onCreateShift, onAddAcknowledgment }: {
  employee: Employee;
  weekDays: Date[];
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
  onCreateShift?: (employeeId: string, date: Date) => void;
  onAddAcknowledgment?: (shift: Shift) => void;
}) {
  return (
    <div className="flex">
      {/* Employee name cell */}
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r border-b bg-card p-2 flex items-center gap-2 min-h-[120px]">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-primary/20">
            {employee.firstName[0]}{employee.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">
            {employee.firstName} {employee.lastName}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {employee.role}
          </div>
        </div>
      </div>

      {/* Day columns */}
      {weekDays.map((day) => (
        <DroppableDayCell
          key={`${employee.id}-${moment(day).format('YYYY-MM-DD')}`}
          employeeId={employee.id}
          date={day}
          shifts={shifts}
          employees={employees}
          clients={clients}
          onShiftClick={onShiftClick}
          onCreateShift={onCreateShift}
          onAddAcknowledgment={onAddAcknowledgment}
        />
      ))}
    </div>
  );
}

// Placeholder row when no employees exist
function PlaceholderEmployeeRow({ weekDays, onCreateShift, onAddEmployee }: {
  weekDays: Date[];
  onCreateShift?: (employeeId: string, date: Date) => void;
  onAddEmployee?: () => void;
}) {
  return (
    <div className="flex">
      {/* Empty state cell */}
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r border-b bg-gradient-to-b from-background via-muted/10 to-transparent p-2 min-h-[120px] flex items-center justify-center">
        <Button
          onClick={onAddEmployee}
          size="sm"
          variant="outline"
          className="w-full"
          data-testid="button-add-first-employee"
        >
          <UserPlus className="h-3 w-3 mr-1" />
          Add Employee
        </Button>
      </div>

      {/* Day columns with click hints */}
      {weekDays.map((day) => (
        <div
          key={moment(day).format('YYYY-MM-DD')}
          onClick={() => onCreateShift && onCreateShift('open', day)}
          className="min-h-[120px] flex-1 min-w-[140px] border-r border-b p-2 relative group cursor-pointer transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30"
          data-testid={`placeholder-slot-${moment(day).format('YYYY-MM-DD')}`}
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="bg-gradient-to-r from-emerald-500/20 to-primary/20 backdrop-blur-sm border border-emerald-500/40 rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
              <div className="p-1 bg-emerald-500/30 rounded-lg">
                <Plus className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-semibold text-emerald-400">Add Open Shift</span>
              <Sparkles className="h-3 w-3 text-emerald-300 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Open shifts section
function OpenShiftsSection({ shifts, weekDays, onShiftClick, clients, onAddAcknowledgment }: {
  shifts: Shift[];
  weekDays: Date[];
  onShiftClick: (shift: Shift) => void;
  clients: Client[];
  onAddAcknowledgment?: (shift: Shift) => void;
}) {
  const openShiftsByDay = useMemo(() => {
    const byDay: Record<string, Shift[]> = {};
    weekDays.forEach(day => {
      const dayKey = moment(day).format('YYYY-MM-DD');
      byDay[dayKey] = shifts.filter(s =>
        !s.employeeId &&
        moment(s.startTime).isSame(day, 'day')
      ).sort((a, b) => moment(a.startTime).diff(moment(b.startTime)));
    });
    return byDay;
  }, [shifts, weekDays]);

  const totalOpenShifts = Object.values(openShiftsByDay).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="flex border-t-2 border-purple-500/30">
      {/* Open shifts label */}
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r bg-purple-500/20 p-2 min-h-[120px] flex items-center">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20">
            <Users className="h-3 w-3 text-purple-400" />
          </div>
          <div>
            <div className="text-xs font-semibold">
              Open Shifts
            </div>
            <div className="text-[10px] text-muted-foreground">
              {totalOpenShifts} unassigned
            </div>
          </div>
        </div>
      </div>

      {/* Day columns */}
      {weekDays.map((day) => {
        const dayKey = moment(day).format('YYYY-MM-DD');
        const dayOpenShifts = openShiftsByDay[dayKey] || [];

        return (
          <div
            key={dayKey}
            className="min-h-[120px] flex-1 min-w-[140px] border-r border-b bg-purple-500/5 p-2"
          >
            {dayOpenShifts.map(shift => (
              <div
                key={shift.id}
                onClick={() => onShiftClick(shift)}
                data-testid={`open-shift-${shift.id}`}
              >
                <DraggableShiftCard
                  shift={shift}
                  client={clients.find(c => c.id === shift.clientId)}
                  onAddAcknowledgment={onAddAcknowledgment}
                />
              </div>
            ))}
            {dayOpenShifts.length === 0 && (
              <div className="h-full flex items-center justify-center opacity-30">
                <Users className="h-6 w-6 text-purple-300" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ScheduleGrid() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'bi-week' | 'semi-monthly' | 'monthly'>('week');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateShiftDialogOpen, setIsCreateShiftDialogOpen] = useState(false);
  const [createShiftContext, setCreateShiftContext] = useState<{
    employeeId: string;
    date: Date;
  } | null>(null);
  const [isAcknowledgmentDialogOpen, setIsAcknowledgmentDialogOpen] = useState(false);
  const [selectedShiftForAck, setSelectedShiftForAck] = useState<Shift | null>(null);
  
  // Acknowledgment form state
  const [ackType, setAckType] = useState('post_order');
  const [ackTitle, setAckTitle] = useState('');
  const [ackContent, setAckContent] = useState('');
  const [ackPriority, setAckPriority] = useState('normal');
  const [ackRequired, setAckRequired] = useState(true);

  // Fetch data
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Calculate days to display based on view mode
  const getDaysToShow = (): number => {
    switch (viewMode) {
      case 'week': return 7;
      case 'bi-week': return 14;
      case 'semi-monthly': return 15;
      case 'monthly': return 30;
      default: return 7;
    }
  };

  // Calculate days to display based on view mode
  const weekDays = useMemo(() => {
    // For week and bi-week, start from beginning of week
    // For semi-monthly and monthly, use currentDate as anchor
    let start: moment.Moment;
    if (viewMode === 'week' || viewMode === 'bi-week') {
      start = moment(currentDate).startOf('week');
    } else {
      start = moment(currentDate);
    }
    const daysToShow = getDaysToShow();
    return Array.from({ length: daysToShow }, (_, i) => start.clone().add(i, 'days').toDate());
  }, [currentDate, viewMode]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeShift, setActiveShift] = useState<Shift | null>(null);

  // Update shift mutation (for drag-drop reassignment)
  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/shifts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Shift Updated",
        description: "Shift has been reassigned",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update shift",
        variant: "destructive",
      });
    },
  });

  // Publish shift mutation
  const publishShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest("PATCH", `/api/shifts/${shiftId}`, {
        status: 'published',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Shift Published",
        description: "Shift is now visible to employees",
      });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish shift",
        variant: "destructive",
      });
    },
  });

  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest("DELETE", `/api/shifts/${shiftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Shift Deleted",
        description: "Shift has been removed",
      });
      setIsEditDialogOpen(false);
      setSelectedShift(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete shift",
        variant: "destructive",
      });
    },
  });

  // Create acknowledgment mutation
  const createAcknowledgmentMutation = useMutation({
    mutationFn: async (data: {
      shiftId: string;
      acknowledgmentType: string;
      title: string;
      content: string;
      priority: string;
      requiresAcknowledgment: boolean;
      employeeId?: string;
    }) => {
      return await apiRequest("POST", `/api/shifts/${data.shiftId}/acknowledgments`, {
        acknowledgmentType: data.acknowledgmentType,
        title: data.title,
        content: data.content,
        priority: data.priority,
        requiresAcknowledgment: data.requiresAcknowledgment,
        employeeId: data.employeeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Acknowledgment Created",
        description: "The employee will need to acknowledge this before clocking in",
      });
      setIsAcknowledgmentDialogOpen(false);
      // Reset form
      setAckType('post_order');
      setAckTitle('');
      setAckContent('');
      setAckPriority('normal');
      setAckRequired(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create acknowledgment",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const shift = shifts.find(s => s.id === event.active.id);
    setActiveShift(shift || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveShift(null);

    if (!over) return;

    const shiftId = active.id as string;
    const dropData = over.data.current;
    const shift = shifts.find(s => s.id === shiftId);
    
    if (!shift) return;

    if (dropData && dropData.employeeId && dropData.date) {
      // Preserve the shift's time, but update to the new date and employee
      const originalStart = moment(shift.startTime);
      const newStart = moment(dropData.date)
        .hour(originalStart.hour())
        .minute(originalStart.minute())
        .second(0)
        .toDate();
      
      const duration = moment(shift.endTime).diff(moment(shift.startTime), 'hours');
      const newEnd = moment(newStart).add(duration, 'hours').toDate();

      // Update shift with new employee and date
      updateShiftMutation.mutate({
        id: shiftId,
        data: {
          employeeId: dropData.employeeId,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        },
      });
    }
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setIsEditDialogOpen(true);
  };

  const handleCreateShift = (employeeId: string, date: Date) => {
    setCreateShiftContext({ employeeId, date });
    setIsCreateShiftDialogOpen(true);
  };

  const handleAddEmployee = () => {
    window.location.href = '/employees';
  };

  const handleAddAcknowledgment = (shift: Shift) => {
    setSelectedShiftForAck(shift);
    setIsAcknowledgmentDialogOpen(true);
  };

  const handlePublishShift = () => {
    if (selectedShift) {
      publishShiftMutation.mutate(selectedShift.id);
    }
  };

  const handleDeleteShift = () => {
    if (selectedShift) {
      deleteShiftMutation.mutate(selectedShift.id);
    }
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const daysToMove = getDaysToShow();
    setCurrentDate(prev =>
      moment(prev).add(direction === 'next' ? daysToMove : -daysToMove, 'days').toDate()
    );
  };

  const periodLabel = useMemo(() => {
    // Use proper start date based on view mode
    let start: moment.Moment;
    if (viewMode === 'week' || viewMode === 'bi-week') {
      start = moment(currentDate).startOf('week');
    } else {
      start = moment(currentDate);
    }
    const daysToShow = getDaysToShow();
    const end = start.clone().add(daysToShow - 1, 'days');
    return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
  }, [currentDate, viewMode]);

  // Export schedule to CSV
  const handleExportSchedule = () => {
    const csvRows = [];
    
    // Header row
    const headers = ['Employee', ...weekDays.map(d => moment(d).format('ddd MMM D'))];
    csvRows.push(headers.join(','));
    
    // Employee rows
    employees.forEach(emp => {
      const row = [`"${emp.firstName} ${emp.lastName}"`];
      
      weekDays.forEach(day => {
        const dayShifts = shifts.filter(s => 
          s.employeeId === emp.id && moment(s.startTime).isSame(day, 'day')
        );
        
        const shiftText = dayShifts.map(s => 
          `${moment(s.startTime).format('h:mm A')}-${moment(s.endTime).format('h:mm A')}`
        ).join('; ');
        
        row.push(`"${shiftText || '-'}"`);
      });
      
      csvRows.push(row.join(','));
    });
    
    // Download CSV
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${moment(currentDate).format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Schedule Exported",
      description: "Schedule has been exported to CSV",
    });
  };

  // Print schedule
  const handlePrintSchedule = () => {
    window.print();
    toast({
      title: "Print Dialog Opened",
      description: "Use your browser's print dialog to customize and print",
    });
  };

  // Reset to current week
  const handleTodayClick = () => {
    setCurrentDate(new Date());
    // If in week/bi-week mode, this will snap to current week's start
    // For semi-monthly/monthly, it uses today as anchor
    toast({
      title: "View Reset",
      description: "Schedule reset to current period",
    });
  };

  return (
    <>
      {/* Mobile View - Sling Style (shown on screens < md) */}
      <div className="md:hidden h-screen">
        <SlingMobileSchedule
          shifts={shifts}
          employees={employees}
          clients={clients}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          onShiftClick={handleShiftClick}
        />
      </div>

      {/* Desktop View - Grid Style (shown on screens >= md) */}
      <div className="hidden md:flex flex-col h-screen bg-background">
        {/* Sling-style: Separate horizontal bars */}
        
        {/* Bar 1: Top Navigation Tabs */}
        <div className="border-b bg-muted/30">
        <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 mobile-scroll gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[10px] sm:text-xs whitespace-nowrap bg-muted min-h-[44px] min-w-[44px] px-2 sm:px-3" 
                  data-testid="tab-all-schedule"
                  aria-label="All Schedule"
                >
                  <LayoutGrid className="h-3 w-3 sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">ALL SCHEDULE</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View all employee schedules</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[10px] sm:text-xs whitespace-nowrap min-h-[44px] min-w-[44px] px-2 sm:px-3" 
                  onClick={() => toast({ title: "Coming Soon", description: "My Schedule view is under development" })}
                  data-testid="tab-my-schedule"
                  aria-label="My Schedule"
                >
                  <User className="h-3 w-3 sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">MY SCHEDULE</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View only your shifts</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[10px] sm:text-xs whitespace-nowrap min-h-[44px] min-w-[44px] px-2 sm:px-3" 
                  onClick={() => setLocation("/schedule")}
                  data-testid="tab-grid-view"
                  aria-label="Grid View"
                >
                  <ListChecks className="h-3 w-3 sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">GRID VIEW</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Switch to grid view</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[10px] sm:text-xs whitespace-nowrap min-h-[44px] min-w-[44px] px-2 sm:px-3" 
                  onClick={() => setLocation("/time-tracking")}
                  data-testid="tab-time-clock"
                  aria-label="Time Clock"
                >
                  <Clock className="h-3 w-3 sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">TIME CLOCK</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Track employee time & generate payroll reports</TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation & Help */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/dashboard">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="min-h-[44px] min-w-[44px] text-[10px] sm:text-xs px-2 sm:px-3"
                    data-testid="button-back-dashboard"
                    aria-label="Dashboard"
                  >
                    <Home className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1 shrink-0" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Return to dashboard</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7" 
                  onClick={() => setLocation("/support")}
                  data-testid="button-help"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Get help with ScheduleOS™</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-amber-500" 
                  onClick={() => {
                    toast({
                      title: "Report a Bug",
                      description: "Redirecting to support portal...",
                    });
                    setTimeout(() => setLocation("/support"), 500);
                  }}
                  data-testid="button-report-bug"
                >
                  <Bug className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Report a broken link or bug</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Bar 2: Control Bar - Filters, Date Navigation, Actions */}
      <div className="border-b bg-background px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: Filters & Date Navigation */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Filter by dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Filter by:</span>
              <Select defaultValue="employees">
                <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-filter-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employees">Employees</SelectItem>
                  <SelectItem value="locations">Locations</SelectItem>
                  <SelectItem value="positions">Positions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Frame selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Time Frame:</span>
              <Select 
                value={viewMode} 
                onValueChange={(value) => setViewMode(value as 'week' | 'bi-week' | 'semi-monthly' | 'monthly')}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-time-frame">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="bi-week">2 Weeks</SelectItem>
                  <SelectItem value="semi-monthly">Semi-Monthly (15d)</SelectItem>
                  <SelectItem value="monthly">Monthly (30d)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range with arrows */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigatePeriod('prev')}
                data-testid="button-prev-period"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs font-semibold min-w-[140px] text-center px-2">
                {periodLabel}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigatePeriod('next')}
                data-testid="button-next-period"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Today button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleTodayClick}
                  data-testid="button-today"
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  Today
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to current week</TooltipContent>
            </Tooltip>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Stats - Using lucide icons instead of emoji */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span data-testid="stat-total-employees">{employees.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                <span data-testid="stat-open-shifts">{shifts.filter(s => !s.employeeId).length}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                <span data-testid="stat-draft-shifts">{shifts.filter(s => s.status === 'draft').length}</span>
              </div>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs" 
                  onClick={handleExportSchedule}
                  data-testid="button-export"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export schedule to CSV file</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs" 
                  onClick={handlePrintSchedule}
                  data-testid="button-print"
                >
                  <Printer className="h-3 w-3 mr-1" />
                  Print
                </Button>
              </TooltipTrigger>
              <TooltipContent>Print schedule for posting</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  size="sm" 
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" 
                  onClick={() => handleCreateShift('open', new Date())}
                  data-testid="button-add-shift"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add shift
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new shift</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Bar 3: Legend */}
      <div className="border-b bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-gradient-to-br from-blue-500 to-blue-600"></div>
            <span className="text-muted-foreground">Published</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-gradient-to-br from-amber-500 to-amber-600"></div>
            <span className="text-muted-foreground">Draft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded border-2 border-dashed border-purple-500 bg-gradient-to-br from-purple-500/50 to-purple-600/50"></div>
            <span className="text-muted-foreground">Open/Unassigned</span>
          </div>
        </div>
      </div>


      {/* Schedule grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-auto">
          <div className="min-w-fit">
            {/* Day headers */}
            <div className="flex sticky top-0 z-20 bg-background border-b-2">
              {/* Empty corner cell */}
              <div className="sticky left-0 z-30 w-[140px] sm:w-[160px] border-r bg-muted/20 h-[60px]"></div>
              
              {/* Day column headers */}
              {weekDays.map((day) => {
                const isToday = moment(day).isSame(moment(), 'day');
                return (
                  <div
                    key={moment(day).format('YYYY-MM-DD')}
                    className={`
                      flex-1 min-w-[140px] border-r p-3 text-center flex flex-col justify-center h-[60px]
                      ${isToday ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : 'bg-muted/10'}
                    `}
                  >
                    <div className={`text-[10px] font-semibold uppercase ${isToday ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {moment(day).format('ddd')}
                    </div>
                    <div className={`text-base font-bold ${isToday ? 'text-emerald-400' : ''}`}>
                      {moment(day).format('D')}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {moment(day).format('MMM')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Employee rows */}
            {employees.length === 0 ? (
              <PlaceholderEmployeeRow 
                weekDays={weekDays}
                onCreateShift={handleCreateShift}
                onAddEmployee={handleAddEmployee}
              />
            ) : (
              <>
                {employees.map(employee => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    weekDays={weekDays}
                    shifts={shifts}
                    employees={employees}
                    clients={clients}
                    onShiftClick={handleShiftClick}
                    onCreateShift={handleCreateShift}
                    onAddAcknowledgment={handleAddAcknowledgment}
                  />
                ))}
              </>
            )}

            {/* Open shifts section */}
            <OpenShiftsSection
              shifts={shifts}
              weekDays={weekDays}
              onShiftClick={handleShiftClick}
              clients={clients}
              onAddAcknowledgment={handleAddAcknowledgment}
            />
          </div>
        </div>

        <DragOverlay>
          {activeShift && (
            <DraggableShiftCard
              shift={activeShift}
              employee={employees.find(e => e.id === activeShift.employeeId)}
              client={clients.find(c => c.id === activeShift.clientId)}
              onAddAcknowledgment={handleAddAcknowledgment}
            />
          )}
        </DragOverlay>
      </DndContext>
      </div>

      {/* Shared Dialogs - Available to both mobile and desktop views */}
      {/* Create Shift Dialog */}
      {createShiftContext && (
        <Dialog open={isCreateShiftDialogOpen} onOpenChange={setIsCreateShiftDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Shift</DialogTitle>
              <DialogDescription>
                {moment(createShiftContext.date).format('dddd, MMMM D, YYYY')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-3 rounded-lg">
                  <Clock className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="text-sm font-semibold">
                      {createShiftContext.employeeId === 'open' ? 'Open Shift' : 'Employee Shift'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Use the shift builder below to configure this shift
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                <p>Quick shift creation coming soon!</p>
                <p className="mt-2">For now, use the "Create Shift" button in the header to add detailed shifts.</p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateShiftDialogOpen(false)}
                data-testid="button-cancel-create-shift"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  toast({
                    title: "Coming Soon",
                    description: "Quick shift creation is in development. Please use the main shift builder.",
                  });
                  setIsCreateShiftDialogOpen(false);
                }}
                data-testid="button-confirm-create-shift"
              >
                Continue to Shift Builder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Shift Dialog */}
      {selectedShift && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Shift Details</DialogTitle>
              <DialogDescription>
                {moment(selectedShift.startTime).format('MMMM D, YYYY')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Employee</Label>
                <div className="text-sm font-medium">
                  {selectedShift.employeeId
                    ? employees.find(e => e.id === selectedShift.employeeId)
                      ? `${employees.find(e => e.id === selectedShift.employeeId)!.firstName} ${employees.find(e => e.id === selectedShift.employeeId)!.lastName}`
                      : 'Unknown'
                    : 'Open Shift (Unassigned)'
                  }
                </div>
              </div>

              <div>
                <Label>Time</Label>
                <div className="text-sm">
                  {moment(selectedShift.startTime).format('h:mm A')} - {moment(selectedShift.endTime).format('h:mm A')}
                </div>
              </div>

              {selectedShift.clientId && (
                <div>
                  <Label>Client</Label>
                  <div className="text-sm">
                    {clients.find(c => c.id === selectedShift.clientId)
                      ? `${clients.find(c => c.id === selectedShift.clientId)!.firstName} ${clients.find(c => c.id === selectedShift.clientId)!.lastName}`
                      : 'Unknown'
                    }
                  </div>
                </div>
              )}

              {selectedShift.description && (
                <div>
                  <Label>Description</Label>
                  <div className="text-sm text-muted-foreground">
                    {selectedShift.description}
                  </div>
                </div>
              )}

              <div>
                <Label>Status</Label>
                <Badge variant={selectedShift.status === 'draft' ? 'secondary' : 'default'}>
                  {selectedShift.status}
                </Badge>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={handleDeleteShift}
                disabled={deleteShiftMutation.isPending}
                data-testid="button-delete-shift"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              {selectedShift.status === 'draft' && (
                <Button
                  onClick={handlePublishShift}
                  disabled={publishShiftMutation.isPending}
                  data-testid="button-publish-shift"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Publish
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Acknowledgment Dialog (Post Order / Special Order) */}
      {selectedShiftForAck && (
        <Dialog open={isAcknowledgmentDialogOpen} onOpenChange={setIsAcknowledgmentDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Post Order / Special Order</DialogTitle>
              <DialogDescription>
                Create a post order or special instruction that the employee must acknowledge before clocking in
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="ack-type">Type</Label>
                  <select
                    id="ack-type"
                    value={ackType}
                    onChange={(e) => setAckType(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background"
                    data-testid="select-acknowledgment-type"
                  >
                    <option value="post_order">Post Order</option>
                    <option value="special_order">Special Order</option>
                    <option value="safety_notice">Safety Notice</option>
                    <option value="site_instruction">Site Instruction</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ack-title">Title</Label>
                  <input
                    id="ack-title"
                    type="text"
                    value={ackTitle}
                    onChange={(e) => setAckTitle(e.target.value)}
                    placeholder="e.g., Special patrol instructions"
                    className="w-full p-2 border rounded-md bg-background"
                    data-testid="input-acknowledgment-title"
                  />
                </div>

                <div>
                  <Label htmlFor="ack-content">Instructions / Details</Label>
                  <textarea
                    id="ack-content"
                    rows={6}
                    value={ackContent}
                    onChange={(e) => setAckContent(e.target.value)}
                    placeholder="Enter detailed instructions that the employee must read and acknowledge..."
                    className="w-full p-2 border rounded-md bg-background resize-none"
                    data-testid="input-acknowledgment-content"
                  />
                </div>

                <div>
                  <Label htmlFor="ack-priority">Priority</Label>
                  <select
                    id="ack-priority"
                    value={ackPriority}
                    onChange={(e) => setAckPriority(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background"
                    data-testid="select-acknowledgment-priority"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ack-required"
                    checked={ackRequired}
                    onChange={(e) => setAckRequired(e.target.checked)}
                    className="h-4 w-4"
                    data-testid="checkbox-acknowledgment-required"
                  />
                  <Label htmlFor="ack-required" className="text-sm cursor-pointer">
                    Require acknowledgment before clock-in
                  </Label>
                </div>
              </div>

              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Clock className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Shift Details</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {moment(selectedShiftForAck.startTime).format('ddd, MMM D, YYYY • h:mm A')} - {moment(selectedShiftForAck.endTime).format('h:mm A')}
                    </div>
                    {employees.find(e => e.id === selectedShiftForAck.employeeId) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Employee: {employees.find(e => e.id === selectedShiftForAck.employeeId)!.firstName} {employees.find(e => e.id === selectedShiftForAck.employeeId)!.lastName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAcknowledgmentDialogOpen(false)}
                data-testid="button-cancel-acknowledgment"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedShiftForAck) return;
                  
                  // Validate required fields
                  if (!ackTitle.trim()) {
                    toast({
                      variant: "destructive",
                      title: "Validation Error",
                      description: "Title is required",
                    });
                    return;
                  }
                  if (!ackContent.trim()) {
                    toast({
                      variant: "destructive",
                      title: "Validation Error",
                      description: "Instructions/Details are required",
                    });
                    return;
                  }

                  createAcknowledgmentMutation.mutate({
                    shiftId: selectedShiftForAck.id,
                    acknowledgmentType: ackType,
                    title: ackTitle,
                    content: ackContent,
                    priority: ackPriority,
                    requiresAcknowledgment: ackRequired,
                    employeeId: selectedShiftForAck.employeeId || undefined,
                  });
                }}
                disabled={createAcknowledgmentMutation.isPending}
                data-testid="button-create-acknowledgment"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createAcknowledgmentMutation.isPending ? 'Creating...' : 'Create Acknowledgment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
