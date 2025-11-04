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
} from "lucide-react";
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
function DroppableTimeSlot({ employeeId, hour, date, shifts, employees, clients, onShiftClick }: {
  employeeId: string;
  hour: number;
  date: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  onShiftClick: (shift: Shift) => void;
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

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[80px] border-b border-r p-2 space-y-1
        ${isOver ? 'bg-primary/10 ring-2 ring-primary' : 'bg-background'}
        ${hour % 2 === 0 ? 'bg-muted/5' : ''}
      `}
      data-testid={`drop-zone-${dropId}`}
    >
      {shiftsInSlot.map(shift => (
        <div
          key={shift.id}
          onClick={() => onShiftClick(shift)}
        >
          <DraggableShiftCard
            shift={shift}
            employee={employees.find(e => e.id === shift.employeeId)}
            client={clients.find(c => c.id === shift.clientId)}
          />
        </div>
      ))}
    </div>
  );
}

// Employee column with droppable time slots
function EmployeeColumn({ employee, shifts, date, onShiftClick, employees, clients }: {
  employee: Employee;
  shifts: Shift[];
  date: Date;
  onShiftClick: (shift: Shift) => void;
  employees: Employee[];
  clients: Client[];
}) {
  return (
    <div className="flex-1 min-w-[180px]">
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
          />
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
    <div className="flex-1 min-w-[180px]">
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
          <div className="text-center text-sm text-muted-foreground py-8">
            No open shifts
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
      <div className="border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              ScheduleOS™
            </h1>
            <p className="text-sm text-muted-foreground">
              Drag-and-drop shift scheduling
            </p>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateWeek('prev')}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold min-w-[200px] text-center">
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
              onClick={() => setCurrentDate(new Date())}
              data-testid="button-today"
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border-2 border-amber-500 rounded animate-pulse"></div>
                <span>Draft</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border-2 border-blue-500 rounded"></div>
                <span>Published</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border-2 border-purple-500 border-dashed rounded"></div>
                <span>Open</span>
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
        <ScrollArea className="flex-1">
          <div className="flex">
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
              {employees.map(employee => (
                <EmployeeColumn
                  key={employee.id}
                  employee={employee}
                  shifts={shifts}
                  date={currentDate}
                  onShiftClick={handleShiftClick}
                  employees={employees}
                  clients={clients}
                />
              ))}

              {/* Open shifts column */}
              <OpenShiftsColumn
                shifts={shifts}
                date={currentDate}
                onShiftClick={handleShiftClick}
                clients={clients}
              />
            </div>
          </div>
        </ScrollArea>

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
