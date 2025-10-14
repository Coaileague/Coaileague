import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Plus,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Clock,
  DollarSign,
  Zap,
  MoreVertical,
  Trash2,
  Files,
  AlertTriangle,
} from "lucide-react";
import ModernLayout from "@/components/ModernLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { Shift, Employee, Client } from "@shared/schema";

export default function Schedule() {
  const { toast } = useToast();
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState({
    employeeId: "",
    clientId: "",
    startDate: "",
    startTime: "",
    endTime: "",
    description: "",
  });

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/shifts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({
        title: "Success",
        description: "Shift created successfully",
      });
      setIsAddShiftOpen(false);
      setFormData({
        employeeId: "",
        clientId: "",
        startDate: "",
        startTime: "",
        endTime: "",
        description: "",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
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
        title: "Success",
        description: "Shift updated successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
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
      toast({
        title: "Success",
        description: "Shift deleted successfully",
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

  const generateInvoicesMutation = useMutation({
    mutationFn: async ({ weekStart, weekEnd }: { weekStart: Date; weekEnd: Date }) => {
      // Filter unbilled shifts in current week
      const weekShifts = shifts.filter(shift => {
        const shiftDate = new Date(shift.startTime);
        return shiftDate >= weekStart && shiftDate <= weekEnd && shift.clientId;
      });

      if (weekShifts.length === 0) {
        throw new Error("No client shifts found this week");
      }

      return await apiRequest("POST", "/api/invoices/generate-from-shifts", {
        shiftIds: weekShifts.map(s => s.id)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Invoices Generated",
        description: "Client invoices created from this week's shifts",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate invoices",
        variant: "destructive",
      });
    },
  });

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, shift: Shift) => {
    e.dataTransfer.setData("shiftId", shift.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetEmployeeId: string, targetDate: Date) => {
    e.preventDefault();
    const shiftId = e.dataTransfer.getData("shiftId");
    const shift = shifts.find(s => s.id === shiftId);
    
    if (!shift) return;

    const oldStartTime = new Date(shift.startTime);
    const oldEndTime = new Date(shift.endTime);
    const duration = oldEndTime.getTime() - oldStartTime.getTime();

    // Calculate new start and end times on the target date
    const newStartTime = new Date(targetDate);
    newStartTime.setHours(oldStartTime.getHours(), oldStartTime.getMinutes());
    
    const newEndTime = new Date(newStartTime.getTime() + duration);

    updateShiftMutation.mutate({
      id: shiftId,
      data: {
        employeeId: targetEmployeeId,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      },
    });
  };

  const getWeekDates = () => {
    const curr = new Date(currentDate);
    const first = curr.getDate() - curr.getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(curr);
      date.setDate(first + i);
      return startOfDay(date); // Normalize to midnight
    });
  };

  const weekDates = getWeekDates();
  const weekStart = weekDates[0]; // Sunday at 00:00:00
  const weekEnd = new Date(weekDates[6]);
  weekEnd.setHours(23, 59, 59, 999); // Saturday at 23:59:59

  const previousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleSubmit = () => {
    if (!formData.employeeId || !formData.startDate || !formData.startTime || !formData.endTime) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
    const endDateTime = new Date(`${formData.startDate}T${formData.endTime}`);

    createShiftMutation.mutate({
      employeeId: formData.employeeId,
      clientId: formData.clientId || null,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      description: formData.description,
    });
  };

  const getShiftsForEmployeeAndDay = (employeeId: string, date: Date) => {
    return shifts.filter(shift => {
      const shiftDate = new Date(shift.startTime);
      return shift.employeeId === employeeId && shiftDate.toDateString() === date.toDateString();
    });
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client ? `${client.firstName} ${client.lastName}` : null;
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  // Duplicate shift to same employee, next day
  const duplicateShift = (shift: Shift) => {
    const startTime = new Date(shift.startTime);
    const endTime = new Date(shift.endTime);
    
    // Move to next day
    startTime.setDate(startTime.getDate() + 1);
    endTime.setDate(endTime.getDate() + 1);

    createShiftMutation.mutate({
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      description: shift.description,
    });
  };

  // Copy entire week to next week
  const copyWeekForward = async () => {
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

    // Copy shifts without showing individual toasts
    const promises = weekShifts.map(shift => {
      const startTime = new Date(shift.startTime);
      const endTime = new Date(shift.endTime);
      
      // Move to next week (7 days forward)
      startTime.setDate(startTime.getDate() + 7);
      endTime.setDate(endTime.getDate() + 7);

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

  // Detect scheduling conflicts
  const hasConflict = (shift: Shift, allShifts: Shift[]) => {
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    
    return allShifts.some(other => {
      if (other.id === shift.id) return false;
      if (other.employeeId !== shift.employeeId) return false;
      
      const otherStart = new Date(other.startTime);
      const otherEnd = new Date(other.endTime);
      
      return (
        (shiftStart >= otherStart && shiftStart < otherEnd) ||
        (shiftEnd > otherStart && shiftEnd <= otherEnd) ||
        (shiftStart <= otherStart && shiftEnd >= otherEnd)
      );
    });
  };

  // Calculate week statistics
  const weekStats = useMemo(() => {
    const weekShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.startTime);
      return shiftDate >= weekStart && shiftDate <= weekEnd;
    });

    const totalHours = weekShifts.reduce((sum, shift) => {
      const duration = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
      return sum + (duration / (1000 * 60 * 60));
    }, 0);

    const estimatedCost = weekShifts.reduce((sum, shift) => {
      const employee = employees.find(e => e.id === shift.employeeId);
      const hourlyRate = Number(employee?.hourlyRate) || 15;
      const duration = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
      const hours = duration / (1000 * 60 * 60);
      return sum + (hours * hourlyRate);
    }, 0);

    return {
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      estimatedCost: estimatedCost.toFixed(2),
      clientShifts: weekShifts.filter(s => s.clientId).length,
    };
  }, [shifts, weekStart, weekEnd, employees]);

  // Color palette for shifts (matching Sling style)
  const shiftColors = [
    'bg-rose-500/90',
    'bg-amber-500/90',
    'bg-blue-500/90',
    'bg-purple-500/90',
    'bg-emerald-500/90',
    'bg-pink-500/90',
  ];

  const getShiftColor = (clientId: string | null) => {
    if (!clientId) return shiftColors[0];
    const hash = clientId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return shiftColors[hash % shiftColors.length];
  };

  const formatDateHeader = (date: Date) => {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return {
      day: dayNames[date.getDay()],
      date: date.getDate()
    };
  };

  const formatWeekRange = () => {
    const startDate = weekDates[0].getDate();
    const endDate = weekDates[6].getDate();
    const month = weekDates[0].toLocaleDateString('en-US', { month: 'short' });
    return `${startDate} - ${endDate} ${month}`;
  };

  return (
    <ModernLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-4 sm:space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-schedule-title">
                Schedule Management
              </h2>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]" data-testid="text-schedule-subtitle">
                Drag and drop shifts to assign employees · Week {formatWeekRange()}
              </p>
            </div>
          
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={previousWeek} data-testid="button-prev-week">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={nextWeek} data-testid="button-next-week">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="button-bulk-actions">
                    <Zap className="mr-2 h-4 w-4" />
                    Bulk Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={copyWeekForward}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Week Forward
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => generateInvoicesMutation.mutate({ weekStart, weekEnd })}
                    disabled={generateInvoicesMutation.isPending || weekStats.clientShifts === 0}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {generateInvoicesMutation.isPending ? "Generating..." : "Generate Invoices"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-shift">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Shift
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Shift</DialogTitle>
                    <DialogDescription>
                      Schedule a shift and assign an employee
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="employee">Employee *</Label>
                        <Select value={formData.employeeId} onValueChange={(value) => setFormData({ ...formData, employeeId: value })}>
                          <SelectTrigger id="employee" data-testid="select-shift-employee">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.length === 0 ? (
                              <SelectItem value="none">No employees available</SelectItem>
                            ) : (
                              employees.map((emp) => (
                                <SelectItem key={emp.id} value={emp.id}>
                                  {emp.firstName} {emp.lastName} - {emp.role || "Employee"}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client">Client (Optional)</Label>
                        <Select value={formData.clientId || "none"} onValueChange={(value) => setFormData({ ...formData, clientId: value === "none" ? "" : value })}>
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
                    <div className="space-y-2">
                      <Label htmlFor="date">Date *</Label>
                      <Input 
                        id="date" 
                        type="date" 
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        data-testid="input-shift-date" 
                      />
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
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Textarea 
                        id="description" 
                        placeholder="Shift notes or special instructions..." 
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        data-testid="textarea-shift-description" 
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddShiftOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSubmit}
                      disabled={createShiftMutation.isPending || employees.length === 0}
                      data-testid="button-save-shift"
                    >
                      {createShiftMutation.isPending ? "Creating..." : "Create Shift"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Modern Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 hover-elevate transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-500/10 to-indigo-600/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-indigo-500" />
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-0">
                  +8%
                </Badge>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">{weekStats.totalHours}</div>
              <div className="text-sm text-muted-foreground">Hours Scheduled</div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 hover-elevate transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-emerald-500" />
                </div>
                <Badge variant="secondary" className="bg-rose-500/10 text-rose-600 border-0">
                  +5%
                </Badge>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">${weekStats.estimatedCost}</div>
              <div className="text-sm text-muted-foreground">Labor Cost</div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 hover-elevate transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-amber-500/10 to-amber-600/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-amber-500" />
                </div>
                <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 border-0">
                  Active
                </Badge>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">{weekStats.clientShifts}</div>
              <div className="text-sm text-muted-foreground">Billable Shifts</div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 hover-elevate transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-violet-500/10 to-violet-600/10 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-violet-500" />
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-0">
                  98.2%
                </Badge>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">{weekStats.totalShifts}</div>
              <div className="text-sm text-muted-foreground">Total Shifts</div>
            </div>
          </div>

          {/* Sling-style Schedule Grid */}
          <div className="border border-[hsl(var(--cad-border))] rounded-lg overflow-hidden">
            {/* Header Row */}
            <div className="grid grid-cols-8 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border))]">
              {/* Empty corner cell */}
              <div className="border-r border-[hsl(var(--cad-border))] p-3" />
              
              {/* Date headers */}
              {weekDates.map((date, index) => {
                const { day, date: dayNum } = formatDateHeader(date);
                const isToday = date.toDateString() === new Date().toDateString();
                
                return (
                  <div
                    key={index}
                    className={`p-3 text-center border-r border-[hsl(var(--cad-border))] last:border-r-0 ${
                      isToday ? 'bg-[hsl(var(--cad-blue))]/10' : ''
                    }`}
                  >
                    <div className="text-xs text-[hsl(var(--cad-text-secondary))] font-medium">
                      {day}
                    </div>
                    <div className={`text-lg font-semibold ${
                      isToday ? 'text-[hsl(var(--cad-blue))]' : 'text-[hsl(var(--cad-text-primary))]'
                    }`}>
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Employee Rows */}
            {shiftsLoading || employeesLoading ? (
              <div className="p-8">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-[hsl(var(--cad-text-secondary))]">
                  No employees found. Add employees to start scheduling.
                </p>
              </div>
            ) : (
              employees.map((employee, empIndex) => (
                <div
                  key={employee.id}
                  className={`grid grid-cols-8 border-b border-[hsl(var(--cad-border))] last:border-b-0 ${
                    empIndex % 2 === 0 ? 'bg-[hsl(var(--cad-chrome))]/30' : ''
                  }`}
                >
                  {/* Employee name cell */}
                  <div className="border-r border-[hsl(var(--cad-border))] p-3 flex items-center">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-[hsl(var(--cad-text-primary))] truncate">
                        {employee.firstName} {employee.lastName}
                      </div>
                      {employee.role && (
                        <div className="text-xs text-[hsl(var(--cad-text-secondary))] truncate">
                          {employee.role}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Shift cells for each day */}
                  {weekDates.map((date, dateIndex) => {
                    const dayShifts = getShiftsForEmployeeAndDay(employee.id, date);
                    
                    return (
                      <div
                        key={dateIndex}
                        className="border-r border-[hsl(var(--cad-border))] last:border-r-0 p-2 min-h-[80px] relative group/cell"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, employee.id, date)}
                        data-testid={`cell-${employee.id}-${dateIndex}`}
                      >
                        {/* GetSling-style: Click + to create shift for this date/employee */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/cell:opacity-100 transition-opacity bg-[hsl(var(--cad-chrome))] hover:bg-[hsl(var(--cad-blue))]/20 hover:text-[hsl(var(--cad-blue))] z-10"
                          onClick={() => {
                            const dateStr = date.toISOString().split('T')[0];
                            setFormData({
                              employeeId: employee.id,
                              clientId: "",
                              startDate: dateStr,
                              startTime: "09:00",
                              endTime: "17:00",
                              description: ""
                            });
                            setIsAddShiftOpen(true);
                          }}
                          data-testid={`button-quick-add-${employee.id}-${dateIndex}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        
                        <div className="space-y-1">
                          {dayShifts.map((shift) => {
                            const startTime = new Date(shift.startTime);
                            const endTime = new Date(shift.endTime);
                            const clientName = getClientName(shift.clientId);
                            const colorClass = getShiftColor(shift.clientId);
                            const hasShiftConflict = hasConflict(shift, shifts);
                            
                            return (
                              <div key={shift.id} className="relative group">
                                <div
                                  className={`${colorClass} text-white rounded px-2 py-1.5 cursor-move hover:opacity-90 transition-opacity ${
                                    hasShiftConflict ? 'ring-2 ring-red-500' : ''
                                  }`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, shift)}
                                  data-testid={`shift-${shift.id}`}
                                >
                                  {hasShiftConflict && (
                                    <AlertTriangle className="h-3 w-3 absolute -top-1 -right-1 text-red-500 bg-white rounded-full" />
                                  )}
                                  <div className="text-xs font-medium leading-tight">
                                    {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </div>
                                  {clientName && (
                                    <div className="text-xs opacity-90 truncate">
                                      {clientName}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Quick actions menu */}
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 bg-white/90 hover:bg-white"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => duplicateShift(shift)}>
                                        <Files className="mr-2 h-4 w-4" />
                                        Duplicate to Next Day
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        onClick={() => deleteShiftMutation.mutate(shift.id)}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Shift
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ModernLayout>
  );
}
