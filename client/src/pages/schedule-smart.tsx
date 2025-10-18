import { useState, useMemo, useCallback, useEffect } from "react";
import { Calendar, momentLocalizer, View, Event as BigCalendarEvent } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "@/styles/smart-schedule.css";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Plus,
  Copy,
  FileText,
  Users,
  Clock,
  MapPin,
  AlertTriangle,
  Zap,
  Sparkles,
} from "lucide-react";
import type { Shift, Employee, Client } from "@shared/schema";

// Setup moment localizer for react-big-calendar
const localizer = momentLocalizer(moment);

// Create drag-and-drop enabled calendar
const DnDCalendar = withDragAndDrop(Calendar);

// Extended event type for our shifts
interface ShiftEvent extends BigCalendarEvent {
  id: string;
  employeeId: string;
  clientId: string | null;
  description: string | null;
  status: string | null;
  hasConflict?: boolean;
}

export default function SmartScheduleOS() {
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<View>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [isShiftPopoverOpen, setIsShiftPopoverOpen] = useState(false);
  const [newShiftSlot, setNewShiftSlot] = useState<{start: Date, end: Date, employeeId?: string} | null>(null);
  
  // Form state for shift creation
  const [formData, setFormData] = useState({
    employeeId: "",
    clientId: "",
    startTime: "",
    endTime: "",
    description: "",
  });

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

  // Mutations
  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/shifts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Shift Created",
        description: "Shift has been successfully created",
      });
      setIsAddShiftOpen(false);
      setNewShiftSlot(null);
      setFormData({
        employeeId: "",
        clientId: "",
        startTime: "",
        endTime: "",
        description: "",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create shift",
        variant: "destructive",
      });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/shifts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Shift Updated",
        description: "Shift has been successfully updated",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update shift",
        variant: "destructive",
      });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/shifts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setSelectedShift(null);
      setIsShiftPopoverOpen(false);
      toast({
        title: "Shift Deleted",
        description: "Shift has been successfully deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete shift",
        variant: "destructive",
      });
    },
  });

  // Conflict detection (overlapping shifts + short turnaround)
  const detectConflict = useCallback((shift: Shift, allShifts: Shift[]) => {
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const MIN_REST_HOURS = 8; // Minimum rest between shifts
    
    return allShifts.some(other => {
      if (other.id === shift.id) return false;
      if (other.employeeId !== shift.employeeId) return false;
      
      const otherStart = new Date(other.startTime);
      const otherEnd = new Date(other.endTime);
      
      // Check for direct overlap
      const hasOverlap = (
        (shiftStart >= otherStart && shiftStart < otherEnd) ||
        (shiftEnd > otherStart && shiftEnd <= otherEnd) ||
        (shiftStart <= otherStart && shiftEnd >= otherEnd)
      );
      
      // Check for short turnaround (less than MIN_REST_HOURS between shifts)
      const hoursBetween = Math.abs(
        shiftStart < otherStart 
          ? (otherStart.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60)
          : (shiftStart.getTime() - otherEnd.getTime()) / (1000 * 60 * 60)
      );
      const hasShortTurnaround = hoursBetween > 0 && hoursBetween < MIN_REST_HOURS;
      
      return hasOverlap || hasShortTurnaround;
    });
  }, []);

  // Convert shifts to calendar events
  const calendarEvents: ShiftEvent[] = useMemo(() => {
    return shifts.map(shift => ({
      id: shift.id,
      title: getEmployeeName(shift.employeeId),
      start: new Date(shift.startTime),
      end: new Date(shift.endTime),
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      description: shift.description,
      status: shift.status,
      hasConflict: detectConflict(shift, shifts),
    }));
  }, [shifts, employees, detectConflict]);

  // Helper functions
  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  const getEmployeeRole = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee?.role || "Employee";
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client ? `${client.firstName} ${client.lastName}` : null;
  };

  const getClientAddress = (clientId: string | null) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client?.address || null;
  };

  // Color coding by role
  const getRoleColor = (employeeId: string) => {
    const role = getEmployeeRole(employeeId);
    const roleColors: Record<string, string> = {
      'Rigger': 'bg-blue-600',
      'SysOp': 'bg-emerald-600',
      'Manager': 'bg-purple-600',
      'Technician': 'bg-amber-600',
      'Operator': 'bg-cyan-600',
    };
    return roleColors[role] || 'bg-slate-600';
  };

  // Custom event style getter
  const eventStyleGetter = (event: any) => {
    const shiftEvent = event as ShiftEvent;
    const baseColor = getRoleColor(shiftEvent.employeeId);
    const hasConflict = shiftEvent.hasConflict;
    
    return {
      className: `${hasConflict ? 'bg-red-600 border-2 border-red-400' : baseColor} text-white rounded-md px-2 py-1 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity`,
    };
  };

  // Handle event selection
  const handleSelectEvent = (event: any) => {
    const shiftEvent = event as ShiftEvent;
    const shift = shifts.find(s => s.id === shiftEvent.id);
    if (shift) {
      setSelectedShift(shift);
      setIsShiftPopoverOpen(true);
    }
  };

  // Handle drag and drop
  const handleEventDrop = ({ event, start, end }: any) => {
    const shiftEvent = event as ShiftEvent;
    // Update shift with new times
    updateShiftMutation.mutate({
      id: shiftEvent.id,
      data: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
  };

  // Handle event resize
  const handleEventResize = ({ event, start, end }: any) => {
    const shiftEvent = event as ShiftEvent;
    updateShiftMutation.mutate({
      id: shiftEvent.id,
      data: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
  };

  // Handle slot selection (create new shift by drawing)
  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setNewShiftSlot({ start, end });
    setFormData({
      ...formData,
      startTime: moment(start).format('HH:mm'),
      endTime: moment(end).format('HH:mm'),
    });
    setIsAddShiftOpen(true);
  };

  // Submit new shift
  const handleSubmit = () => {
    if (!formData.employeeId || !newShiftSlot) {
      toast({
        title: "Validation Error",
        description: "Please select an employee",
        variant: "destructive",
      });
      return;
    }

    const startDateTime = new Date(newShiftSlot.start);
    const endDateTime = new Date(newShiftSlot.end);

    // Apply time from form if changed
    if (formData.startTime) {
      const [hours, minutes] = formData.startTime.split(':');
      startDateTime.setHours(parseInt(hours), parseInt(minutes));
    }
    if (formData.endTime) {
      const [hours, minutes] = formData.endTime.split(':');
      endDateTime.setHours(parseInt(hours), parseInt(minutes));
    }

    createShiftMutation.mutate({
      employeeId: formData.employeeId,
      clientId: formData.clientId || null,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      description: formData.description,
    });
  };

  // Copy week forward
  const copyWeekForward = async () => {
    const weekStart = moment(currentDate).startOf('week').toDate();
    const weekEnd = moment(currentDate).endOf('week').toDate();
    
    const weekShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.startTime);
      return shiftDate >= weekStart && shiftDate <= weekEnd;
    });

    if (weekShifts.length === 0) {
      toast({
        title: "No Shifts",
        description: "No shifts to copy this week",
        variant: "destructive",
      });
      return;
    }

    const promises = weekShifts.map(shift => {
      const startTime = moment(shift.startTime).add(7, 'days').toDate();
      const endTime = moment(shift.endTime).add(7, 'days').toDate();

      return apiRequest("POST", "/api/shifts", {
        employeeId: shift.employeeId,
        clientId: shift.clientId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        description: shift.description,
      });
    });

    try {
      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Week Copied",
        description: `${weekShifts.length} shifts copied to next week`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to copy week",
        variant: "destructive",
      });
    }
  };

  // Calculate week statistics
  const weekStats = useMemo(() => {
    const weekStart = moment(currentDate).startOf('week').toDate();
    const weekEnd = moment(currentDate).endOf('week').toDate();
    
    const weekShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.startTime);
      return shiftDate >= weekStart && shiftDate <= weekEnd;
    });

    const totalHours = weekShifts.reduce((sum, shift) => {
      const duration = moment(shift.endTime).diff(moment(shift.startTime), 'hours', true);
      return sum + duration;
    }, 0);

    const conflicts = weekShifts.filter(shift => detectConflict(shift, shifts)).length;

    return {
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      conflicts,
    };
  }, [shifts, currentDate, detectConflict]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-background" data-testid="page-smart-schedule">
      {/* Header Bar */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-schedule-title">
              <Sparkles className="h-7 w-7 text-primary" />
              SmartScheduleOS™
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Drag-and-drop scheduling with real-time conflict detection
            </p>
          </div>

          {/* Week Stats */}
          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-2 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-foreground">{weekStats.totalShifts}</div>
              <div className="text-xs text-muted-foreground">Shifts</div>
            </div>
            <div className="text-center px-4 py-2 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-foreground">{weekStats.totalHours}</div>
              <div className="text-xs text-muted-foreground">Hours</div>
            </div>
            {weekStats.conflicts > 0 && (
              <div className="text-center px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="text-2xl font-bold text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-5 w-5" />
                  {weekStats.conflicts}
                </div>
                <div className="text-xs text-red-600">Conflicts</div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => {
              setNewShiftSlot({
                start: moment(currentDate).startOf('day').hour(9).toDate(),
                end: moment(currentDate).startOf('day').hour(17).toDate()
              });
              setIsAddShiftOpen(true);
            }}
            data-testid="button-create-shift"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Shift
          </Button>
          
          <Button variant="outline" onClick={copyWeekForward} data-testid="button-copy-week">
            <Copy className="mr-2 h-4 w-4" />
            Copy Week
          </Button>

          <Button variant="outline" data-testid="button-templates">
            <FileText className="mr-2 h-4 w-4" />
            Templates
          </Button>

          <Button variant="outline" data-testid="button-find-coverage">
            <Users className="mr-2 h-4 w-4" />
            Find Coverage
          </Button>

          <div className="ml-auto">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Zap className="mr-1 h-3 w-3" />
              AI-Powered
            </Badge>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full bg-card rounded-lg border shadow-sm overflow-hidden">
          <DnDCalendar
            localizer={localizer}
            events={calendarEvents}
            view={currentView}
            onView={setCurrentView}
            date={currentDate}
            onNavigate={setCurrentDate}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            selectable
            resizable
            draggableAccessor={() => true}
            eventPropGetter={eventStyleGetter}
            step={30}
            timeslots={2}
            defaultView="week"
            views={['week', 'day']}
            min={moment().startOf('day').hour(6).toDate()}
            max={moment().startOf('day').hour(22).toDate()}
            style={{ height: '100%' }}
            className="smart-schedule-calendar"
            data-testid="calendar-view"
          />
        </div>
      </div>

      {/* Create Shift Dialog */}
      <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Shift</DialogTitle>
            <DialogDescription>
              Assign an employee and optionally link to a client job
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee">Employee *</Label>
                <Select 
                  value={formData.employeeId} 
                  onValueChange={(value) => setFormData({ ...formData, employeeId: value })}
                >
                  <SelectTrigger id="employee" data-testid="select-shift-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} - {emp.role || "Employee"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">Client (Optional)</Label>
                <Select 
                  value={formData.clientId || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, clientId: value === "none" ? "" : value })}
                >
                  <SelectTrigger id="client" data-testid="select-shift-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.firstName} {client.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time *</Label>
                <Input 
                  id="startTime" 
                  type="time" 
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  data-testid="input-shift-start" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time *</Label>
                <Input 
                  id="endTime" 
                  type="time" 
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  data-testid="input-shift-end" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Notes (Optional)</Label>
              <Textarea 
                id="description" 
                placeholder="Special instructions, location details, etc..." 
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-shift-description" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddShiftOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createShiftMutation.isPending}
              data-testid="button-submit-shift"
            >
              {createShiftMutation.isPending ? "Creating..." : "Create Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Details Popover */}
      {selectedShift && (
        <Dialog open={isShiftPopoverOpen} onOpenChange={setIsShiftPopoverOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className={`${getRoleColor(selectedShift.employeeId)} text-white`}>
                    {getEmployeeName(selectedShift.employeeId).substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{getEmployeeName(selectedShift.employeeId)}</div>
                  <div className="text-xs text-muted-foreground">{getEmployeeRole(selectedShift.employeeId)}</div>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Time</div>
                  <div className="text-sm text-muted-foreground">
                    {moment(selectedShift.startTime).format('MMM D, YYYY - h:mm A')} - 
                    {moment(selectedShift.endTime).format('h:mm A')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {moment(selectedShift.endTime).diff(moment(selectedShift.startTime), 'hours', true).toFixed(1)} hours
                  </div>
                </div>
              </div>

              {selectedShift.clientId && (
                <>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Client</div>
                      <div className="text-sm text-muted-foreground">
                        {getClientName(selectedShift.clientId)}
                      </div>
                    </div>
                  </div>

                  {getClientAddress(selectedShift.clientId) && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">Location</div>
                        <div className="text-sm text-muted-foreground">
                          {getClientAddress(selectedShift.clientId)}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedShift.description && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Notes</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedShift.description}
                    </div>
                  </div>
                </div>
              )}

              {detectConflict(selectedShift, shifts) && (
                <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-red-600">Scheduling Conflict</div>
                    <div className="text-sm text-red-600/80">
                      This shift overlaps with another shift for this employee
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => deleteShiftMutation.mutate(selectedShift.id)}
                disabled={deleteShiftMutation.isPending}
                data-testid="button-delete-shift"
              >
                {deleteShiftMutation.isPending ? "Deleting..." : "Delete Shift"}
              </Button>
              <Button variant="outline" onClick={() => setIsShiftPopoverOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </DndProvider>
  );
}
