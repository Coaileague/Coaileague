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
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { EnhancedEmptyState } from "@/components/enhanced-empty-state";
import type { Shift, Employee, Client } from "@shared/schema";
import moment from "moment";

// Time slots for the grid (7 AM - 11 PM in 1-hour increments)
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 7;
  return {
    label: moment().hour(hour).minute(0).format('h:mm A'),
    hour,
  };
});

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
        p-2 rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing
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

// Droppable time slot
function DroppableTimeSlot({ employeeId, hour, date, shifts, employees, clients, onShiftClick, onCreateShift }: {
  employeeId: string;
  hour: number;
  date: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
  onCreateShift?: (employeeId: string, hour: number, date: Date) => void;
}) {
  const dropId = `${employeeId}-${hour}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { employeeId, hour, date },
  });

  const shiftsInSlot = useMemo(() => {
    return shifts.filter(shift => {
      if (shift.employeeId !== employeeId) return false;
      const shiftStart = moment(shift.startTime);
      return shiftStart.isSame(date, 'day') && shiftStart.hour() === hour;
    });
  }, [shifts, employeeId, date, hour]);

  const handleCellClick = () => {
    if (shiftsInSlot.length === 0 && onCreateShift) {
      onCreateShift(employeeId, hour, date);
    }
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleCellClick}
      className={`
        min-h-[80px] border-b border-r p-2 space-y-1 relative group cursor-pointer
        ${isOver ? 'bg-primary/10 ring-2 ring-primary' : 'bg-background'}
        ${hour % 2 === 0 ? 'bg-muted/5' : ''}
        hover-elevate transition-all
      `}
      data-testid={`drop-zone-${dropId}`}
    >
      {shiftsInSlot.map(shift => (
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
      {shiftsInSlot.length === 0 && (
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

// Employee column with droppable time slots
function EmployeeColumn({ employee, shifts, date, onShiftClick, employees, clients, onCreateShift }: {
  employee: Employee;
  shifts: Shift[];
  date: Date;
  onShiftClick: (shift: Shift) => void;
  employees: Employee[];
  clients: Client[];
  onCreateShift?: (employeeId: string, hour: number, date: Date) => void;
}) {
  return (
    <div className="flex-1 min-w-[150px] sm:min-w-[180px]">
      {/* Employee header */}
      <div className="sticky top-0 z-10 bg-card border-b p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/20">
              {employee.firstName[0]}{employee.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold truncate">
              {employee.firstName} {employee.lastName}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {employee.role}
            </div>
          </div>
        </div>
      </div>

      {/* Time grid */}
      <div className="relative">
        {TIME_SLOTS.map((slot) => (
          <DroppableTimeSlot
            key={`${employee.id}-${slot.hour}`}
            employeeId={employee.id}
            hour={slot.hour}
            date={date}
            shifts={shifts}
            employees={employees}
            clients={clients}
            onShiftClick={onShiftClick}
            onCreateShift={onCreateShift}
          />
        ))}
      </div>
    </div>
  );
}

// Placeholder column when no employees exist
function PlaceholderEmployeeColumn({ onCreateShift, onAddEmployee }: {
  onCreateShift?: (employeeId: string, hour: number, date: Date) => void;
  onAddEmployee?: () => void;
}) {
  return (
    <div className="flex-1 min-w-[200px] sm:min-w-[250px]">
      {/* Enhanced empty state header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-muted/10 to-transparent border-b p-4">
        <EnhancedEmptyState 
          icon={UserPlus}
          title="Build Your Team"
          description="Start scheduling by adding your first team member"
          actionLabel="Add Employee"
          onAction={onAddEmployee}
          testId="button-add-first-employee"
          variant="emerald"
        />
      </div>

      {/* Clickable time grid with visual enhancements */}
      <div className="relative">
        {TIME_SLOTS.map((slot, index) => (
          <div
            key={`placeholder-${slot.hour}`}
            onClick={() => onCreateShift && onCreateShift('open', slot.hour, new Date())}
            className={`
              min-h-[80px] border-b border-r p-2 relative group cursor-pointer transition-all
              ${slot.hour % 2 === 0 ? 'bg-gradient-to-r from-muted/5 to-transparent' : 'bg-background'}
              hover:bg-emerald-500/5 hover:border-emerald-500/30
            `}
            data-testid={`placeholder-slot-${slot.hour}`}
          >
            {/* Animated hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="bg-gradient-to-r from-emerald-500/20 to-primary/20 backdrop-blur-sm border border-emerald-500/40 rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
                <div className="p-1 bg-emerald-500/30 rounded-lg">
                  <Plus className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
                </div>
                <span className="text-sm font-semibold text-emerald-400">Add Open Shift</span>
                <Sparkles className="h-3 w-3 text-emerald-300 animate-pulse" />
              </div>
            </div>

            {/* Decorative gradient line */}
            {index === 0 && (
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Open shifts column
function OpenShiftsColumn({ shifts, date, onShiftClick, clients }: {
  shifts: Shift[];
  date: Date;
  onShiftClick: (shift: Shift) => void;
  clients: Client[];
}) {
  const openShifts = useMemo(() => {
    return shifts.filter(s =>
      !s.employeeId &&
      moment(s.startTime).isSame(date, 'day')
    );
  }, [shifts, date]);

  return (
    <div className="flex-1 min-w-[150px] sm:min-w-[180px]">
      <div className="sticky top-0 z-10 bg-purple-500/20 border-b border-purple-500/30 p-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Users className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              Open Shifts
            </div>
            <div className="text-xs text-muted-foreground">
              {openShifts.length} unassigned
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {openShifts.map(shift => (
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
        {openShifts.length === 0 && (
          <div className="py-8 px-4">
            <div className="relative w-20 h-20 mx-auto mb-4">
              {/* Gradient circle with glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-purple-400/10 to-transparent rounded-full animate-pulse" />
              <div className="absolute inset-0 rounded-full blur-lg bg-purple-500/20 shadow-2xl" />
              
              {/* Icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-4 rounded-xl bg-purple-500/20 backdrop-blur-sm border border-white/10 shadow-lg">
                  <Users className="h-8 w-8 text-purple-400 drop-shadow-lg" strokeWidth={1.5} />
                </div>
              </div>
              
              {/* Decorative ring */}
              <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 border-dashed animate-spin" style={{ animationDuration: '20s' }} />
            </div>
            
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">All Shifts Assigned</p>
              <p className="text-xs text-muted-foreground">No unassigned shifts at the moment</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScheduleGrid() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateShiftDialogOpen, setIsCreateShiftDialogOpen] = useState(false);
  const [createShiftContext, setCreateShiftContext] = useState<{
    employeeId: string;
    hour: number;
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

    if (dropData && dropData.employeeId && dropData.hour !== undefined) {
      // CRITICAL: Preserve the original shift's date, only change hour and employee
      // This prevents data corruption when dragging shifts from different days
      const newStart = moment(shift.startTime)
        .hour(dropData.hour)
        .minute(0)
        .second(0)
        .toDate();
      
      const duration = moment(shift.endTime).diff(moment(shift.startTime), 'hours');
      const newEnd = moment(newStart).add(duration, 'hours').toDate();

      // Update shift with new employee and times (preserving original date)
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

  const handleCreateShift = (employeeId: string, hour: number, date: Date) => {
    setCreateShiftContext({ employeeId, hour, date });
    setIsCreateShiftDialogOpen(true);
  };

  const handleAddEmployee = () => {
    // Navigate to employee creation page
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

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev =>
      moment(prev).add(direction === 'next' ? 7 : -7, 'days').toDate()
    );
  };

  const weekLabel = useMemo(() => {
    const start = moment(currentDate).startOf('week');
    const end = moment(currentDate).endOf('week');
    return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
  }, [currentDate]);

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

        {/* Week navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateWeek('prev')}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs sm:text-sm font-semibold flex-1 sm:flex-none sm:min-w-[200px] text-center">
              {weekLabel}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateWeek('next')}
              data-testid="button-next-week"
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

          <div className="flex items-center gap-2 sm:gap-4">
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
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="flex min-w-fit">
            {/* Time column */}
            <div className="sticky left-0 z-20 bg-background border-r">
              <div className="h-[72px] border-b bg-muted/20"></div>
              
              {TIME_SLOTS.map((slot, idx) => (
                <div
                  key={slot.hour}
                  className={`
                    h-[80px] border-b px-3 flex items-center justify-end text-xs font-medium text-muted-foreground
                    ${idx % 2 === 0 ? 'bg-muted/5' : 'bg-background'}
                  `}
                >
                  {slot.label}
                </div>
              ))}
            </div>

            {/* Employee columns */}
            <div className="flex">
              {employees.length === 0 ? (
                <PlaceholderEmployeeColumn 
                  onCreateShift={handleCreateShift}
                  onAddEmployee={handleAddEmployee}
                />
              ) : (
                employees.map(employee => (
                  <EmployeeColumn
                    key={employee.id}
                    employee={employee}
                    shifts={shifts}
                    date={currentDate}
                    onShiftClick={handleShiftClick}
                    employees={employees}
                    clients={clients}
                    onCreateShift={handleCreateShift}
                  />
                ))
              )}

              {/* Open shifts column */}
              <OpenShiftsColumn
                shifts={shifts}
                date={currentDate}
                onShiftClick={handleShiftClick}
                clients={clients}
              />
            </div>
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
                {moment(createShiftContext.date).format('MMMM D, YYYY')} at {moment().hour(createShiftContext.hour).minute(0).format('h:mm A')}
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
