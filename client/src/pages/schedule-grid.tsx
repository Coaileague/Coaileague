import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import { EnhancedEmptyState } from "@/components/enhanced-empty-state";
import type { Shift, Employee, Client } from "@shared/schema";
import moment from "moment";

// Draggable shift card
function DraggableShiftCard({ shift, employee, client }: {
  shift: Shift;
  employee?: Employee;
  client?: Client;
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`
        p-2 rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing mb-1
        ${isDraft ? 'border-amber-500/50 bg-amber-500/10 shadow-amber-500/20 shadow-lg animate-pulse' : ''}
        ${isPublished ? 'border-blue-500 bg-blue-500/20' : ''}
        ${isOpen ? 'border-purple-500/50 bg-purple-500/10 border-dashed' : ''}
        ${isDragging ? 'opacity-30' : 'hover-elevate'}
      `}
      data-testid={`shift-card-${shift.id}`}
      {...listeners}
      {...attributes}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">
              {moment(shift.startTime).format('h:mm A')} - {moment(shift.endTime).format('h:mm A')}
            </span>
          </div>
          {isDraft && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              Draft
            </Badge>
          )}
          {isOpen && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-purple-500/20">
              Open
            </Badge>
          )}
        </div>

        {!isOpen && employee && (
          <div className="text-xs font-semibold truncate">
            {employee.firstName} {employee.lastName}
          </div>
        )}

        {isOpen && (
          <div className="text-xs font-semibold text-purple-400">
            <Users className="h-3 w-3 inline mr-1" />
            Unassigned
          </div>
        )}

        {client && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin className="h-3 w-3" />
            {client.firstName} {client.lastName}
          </div>
        )}

        {shift.description && (
          <div className="text-xs text-muted-foreground truncate">
            {shift.description}
          </div>
        )}
      </div>
    </Card>
  );
}

// Droppable day cell for an employee
function DroppableDayCell({ employeeId, date, shifts, employees, clients, onShiftClick, onCreateShift }: {
  employeeId: string;
  date: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
  onCreateShift?: (employeeId: string, date: Date) => void;
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
        min-h-[60px] border-r border-b p-1.5 relative group cursor-pointer transition-all
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
        >
          <DraggableShiftCard
            shift={shift}
            employee={employees.find(e => e.id === shift.employeeId)}
            client={clients.find(c => c.id === shift.clientId)}
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
function EmployeeRow({ employee, weekDays, shifts, employees, clients, onShiftClick, onCreateShift }: {
  employee: Employee;
  weekDays: Date[];
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
  onCreateShift?: (employeeId: string, date: Date) => void;
}) {
  return (
    <div className="flex">
      {/* Employee name cell */}
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r border-b bg-card p-2 flex items-center gap-2 min-h-[60px]">
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
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r border-b bg-gradient-to-b from-background via-muted/10 to-transparent p-2 min-h-[60px] flex items-center justify-center">
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
          className="min-h-[60px] border-r border-b p-1.5 relative group cursor-pointer transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30"
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
function OpenShiftsSection({ shifts, weekDays, onShiftClick, clients }: {
  shifts: Shift[];
  weekDays: Date[];
  onShiftClick: (shift: Shift) => void;
  clients: Client[];
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
      <div className="sticky left-0 z-10 w-[140px] sm:w-[160px] border-r bg-purple-500/20 p-2 min-h-[60px] flex items-center">
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
            className="min-h-[60px] border-r border-b bg-purple-500/5 p-1.5"
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'bi-week'>('week');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateShiftDialogOpen, setIsCreateShiftDialogOpen] = useState(false);
  const [createShiftContext, setCreateShiftContext] = useState<{
    employeeId: string;
    date: Date;
  } | null>(null);

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
  const weekDays = useMemo(() => {
    const start = moment(currentDate).startOf('week');
    const daysToShow = viewMode === 'week' ? 7 : 14;
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
    const daysToMove = viewMode === 'week' ? 7 : 14;
    setCurrentDate(prev =>
      moment(prev).add(direction === 'next' ? daysToMove : -daysToMove, 'days').toDate()
    );
  };

  const periodLabel = useMemo(() => {
    const start = moment(currentDate).startOf('week');
    const daysToShow = viewMode === 'week' ? 7 : 14;
    const end = start.clone().add(daysToShow - 1, 'days');
    return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
  }, [currentDate, viewMode]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b p-2 sm:p-4 space-y-2 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              ScheduleOS™
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Drag-and-drop shift scheduling
            </p>
          </div>
        </div>

        {/* Period navigation & view selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigatePeriod('prev')}
              data-testid="button-prev-period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs sm:text-sm font-semibold flex-1 sm:flex-none sm:min-w-[200px] text-center">
              {periodLabel}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigatePeriod('next')}
              data-testid="button-next-period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              data-testid="button-today"
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* View mode selector */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('week')}
                data-testid="button-view-week"
                className="h-7 px-2 text-xs"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Week
              </Button>
              <Button
                variant={viewMode === 'bi-week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('bi-week')}
                data-testid="button-view-bi-week"
                className="h-7 px-2 text-xs"
              >
                <Calendar className="h-3 w-3 mr-1" />
                2 Weeks
              </Button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-amber-500 rounded animate-pulse"></div>
                <span className="whitespace-nowrap">Draft</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-blue-500 rounded"></div>
                <span className="whitespace-nowrap">Published</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-purple-500 border-dashed rounded"></div>
                <span className="whitespace-nowrap">Open</span>
              </div>
            </div>
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
                      min-w-[100px] sm:min-w-[120px] border-r p-2 text-center flex flex-col justify-center h-[60px]
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
            />
          </div>
        </div>

        <DragOverlay>
          {activeShift && (
            <DraggableShiftCard
              shift={activeShift}
              employee={employees.find(e => e.id === activeShift.employeeId)}
              client={clients.find(c => c.id === activeShift.clientId)}
            />
          )}
        </DragOverlay>
      </DndContext>

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
    </div>
  );
}
