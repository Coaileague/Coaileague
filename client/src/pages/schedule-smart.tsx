import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Calendar, momentLocalizer, View, Event as BigCalendarEvent } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { DndProvider } from "react-dnd";
import { MultiBackend } from "react-dnd-multi-backend";
import { HTML5toTouch } from "rdndmb-html5-to-touch";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "@/styles/smart-schedule.css";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useSwipe } from "@/hooks/use-touch-swipe";
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
import { ScheduleOSPanel } from "@/components/scheduleos-panel";
import { ScheduleProposalDrawer } from "@/components/schedule-proposal-drawer";
import { ScheduleMigrationDialog } from "@/components/schedule-migration-dialog";
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
  ChevronLeft,
  ChevronRight,
  Menu,
  Bell,
  CalendarDays,
  Bot,
  Send,
  CloudUpload,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Shift, Employee, Client } from "@shared/schema";
import { getShiftTheme } from "@/lib/shift-theme";

// Setup moment localizer for react-big-calendar
const localizer = momentLocalizer(moment);

// Create drag-and-drop enabled calendar
const DnDCalendar = withDragAndDrop(Calendar);

// Extended event type for our shifts
interface ShiftEvent extends BigCalendarEvent {
  id: string;
  employeeId: string | null;
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
  
  // Mobile view state
  const [mobileTab, setMobileTab] = useState<'my-schedule' | 'full-schedule' | 'pending'>('full-schedule');
  const [selectedMobileDate, setSelectedMobileDate] = useState(new Date());
  const mobileContentRef = useRef<HTMLDivElement>(null);
  
  // AI Controls state
  const [aiEnabled, setAiEnabled] = useState(false);
  
  // Proposal drawer state
  const [proposalDrawerOpen, setProposalDrawerOpen] = useState(false);
  const [currentProposalId, setCurrentProposalId] = useState<string | null>(null);
  
  // Swipe handlers for mobile navigation
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      // Navigate to next day
      setSelectedMobileDate(moment(selectedMobileDate).add(1, 'day').toDate());
    },
    onSwipeRight: () => {
      // Navigate to previous day
      setSelectedMobileDate(moment(selectedMobileDate).subtract(1, 'day').toDate());
    },
  }, { minSwipeDistance: 75 });
  
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

  const { data: workspace } = useQuery<any>({
    queryKey: ["/api/workspace"],
  });

  // AI Status Query
  const { data: aiStatus } = useQuery<{ enabled: boolean; workspaceId: string; workspaceName: string }>({
    queryKey: ['/api/scheduleos/ai/status', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return { enabled: false, workspaceId: '', workspaceName: '' };
      const response = await fetch(`/api/scheduleos/ai/status?workspaceId=${workspace.id}`);
      if (!response.ok) throw new Error('Failed to get AI status');
      return response.json();
    },
    enabled: !!workspace?.id,
  });

  useEffect(() => {
    if (aiStatus) {
      setAiEnabled(aiStatus.enabled);
    }
  }, [aiStatus]);

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

  // AI Toggle Mutation
  const toggleAiMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!workspace?.id) throw new Error("Workspace not loaded");
      return await apiRequest("POST", "/api/scheduleos/ai/toggle", {
        enabled,
        workspaceId: workspace.id,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduleos/ai/status', workspace?.id] });
      setAiEnabled(data.enabled);
      toast({
        title: data.enabled ? "AI Enabled" : "AI Disabled",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle AI",
        variant: "destructive",
      });
    },
  });

  const handleAiToggle = (checked: boolean) => {
    if (!workspace?.id) {
      toast({
        title: "Error",
        description: "Workspace not loaded. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }
    toggleAiMutation.mutate(checked);
  };

  // Smart AI Generate mutation (99% AI, 1% Human Governance)
  const smartGenerateMutation = useMutation({
    mutationFn: async () => {
      // Get all unassigned shifts (published or draft without employeeId)
      const openShifts = shifts.filter(s => !s.employeeId && (s.status === 'published' || s.status === 'draft'));
      if (openShifts.length === 0) {
        throw new Error("No unassigned shifts to schedule. Create shifts or publish them first.");
      }

      const res = await apiRequest("POST", "/api/scheduleos/smart-generate", {
        openShiftIds: openShifts.map(s => s.id),
        constraints: {
          balanceWorkload: true,
          preferExperience: true,
        },
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.applied) {
        // Auto-approved (confidence >= 95%)
        queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
        toast({
          title: "Schedule Auto-Approved",
          description: data.message || `AI generated schedule with ${data.confidence}% confidence`,
        });
      } else {
        // Requires approval (confidence < 95%)
        setCurrentProposalId(data.proposalId);
        setProposalDrawerOpen(true);
        toast({
          title: "Review Required",
          description: data.message || `AI schedule needs approval (${data.confidence}% confidence)`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI schedule",
        variant: "destructive",
      });
    },
  });

  const handleSmartGenerate = () => {
    if (!aiEnabled) {
      toast({
        title: "AI Disabled",
        description: "Enable SmartSchedule AI to generate schedules",
        variant: "destructive",
      });
      return;
    }
    smartGenerateMutation.mutate();
  };

  // Helper functions - hoisted above useMemo to avoid temporal dead zone
  const getEmployeeName = (employeeId: string | null) => {
    if (!employeeId) return "Unassigned";
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  const getEmployeeRole = (employeeId: string | null) => {
    if (!employeeId) return "";
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

  // Custom event style getter with vibrant theme colors
  const eventStyleGetter = (event: any) => {
    const shiftEvent = event as ShiftEvent;
    const shift = shifts.find(s => s.id === shiftEvent.id);
    const hasConflict = shiftEvent.hasConflict;
    
    if (!shift) {
      return { className: 'bg-slate-400 text-white rounded-md px-2 py-1 text-sm font-medium cursor-pointer' };
    }
    
    // Get vibrant theme from getShiftTheme helper
    const employee = employees.find(e => e.id === shift.employeeId);
    const client = clients.find(c => c.id === shift.clientId);
    const theme = getShiftTheme(shift, client, employee);
    
    return {
      style: hasConflict ? {
        backgroundColor: '#dc2626',
        borderColor: '#ef4444',
        color: '#ffffff',
      } : {
        backgroundColor: theme.backgroundColor,
        borderColor: theme.borderColor,
        color: theme.textColor,
      },
      className: `rounded-md px-2 py-1 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity ${hasConflict ? 'border-2' : ''}`,
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
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="h-screen flex flex-col bg-background" data-testid="page-smart-schedule">
      {/* Header Bar - Desktop Only */}
      <div className="hidden md:block border-b bg-card px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div className="flex-shrink-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-1.5 sm:gap-2" data-testid="text-schedule-title">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary flex-shrink-0" />
              <span className="break-words">SmartScheduleOS™</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 break-words">
              Drag-and-drop scheduling with real-time conflict detection
            </p>
          </div>

          {/* Week Stats - Mobile Responsive Grid */}
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 overflow-x-auto flex-wrap sm:flex-nowrap">
            <div className="text-center px-3 sm:px-4 py-1.5 sm:py-2 bg-muted rounded-lg flex-shrink-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">{weekStats.totalShifts}</div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">Shifts</div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1.5 sm:py-2 bg-muted rounded-lg flex-shrink-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">{weekStats.totalHours}</div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">Hours</div>
            </div>
            {weekStats.conflicts > 0 && (
              <div className="text-center px-3 sm:px-4 py-1.5 sm:py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex-shrink-0">
                <div className="text-lg sm:text-xl lg:text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">{weekStats.conflicts}</span>
                </div>
                <div className="text-xs text-red-600 whitespace-nowrap">Conflicts</div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Bar - Mobile Responsive with Touch-Friendly Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          <Button 
            onClick={() => {
              setNewShiftSlot({
                start: moment(currentDate).startOf('day').hour(9).toDate(),
                end: moment(currentDate).startOf('day').hour(17).toDate()
              });
              setIsAddShiftOpen(true);
            }}
            size="sm"
            className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9"
            data-testid="button-create-shift"
          >
            <Plus className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">New Shift</span>
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={copyWeekForward} 
            className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9"
            data-testid="button-copy-week"
          >
            <Copy className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Copy Week</span>
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9 hidden md:flex"
            data-testid="button-templates"
          >
            <FileText className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Templates</span>
          </Button>

          {aiEnabled && (
            <>
              <Button
                variant="default"
                size="sm"
                className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9 bg-primary"
                data-testid="button-generate-schedule"
                onClick={handleSmartGenerate}
                disabled={smartGenerateMutation.isPending || !aiEnabled}
              >
                {smartGenerateMutation.isPending ? (
                  <>
                    <Sparkles className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-pulse" />
                    <span className="text-xs sm:text-sm">Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm">Generate</span>
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9"
                data-testid="button-request-service"
                onClick={() => toast({ title: "Request Service", description: "Service coverage finder coming soon!" })}
              >
                <Send className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">Request Service</span>
              </Button>
            </>
          )}

          <Button
            variant="default"
            size="sm"
            className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9 bg-blue-600 hover:bg-blue-700"
            data-testid="button-publish-schedule"
            onClick={() => toast({ title: "Publish Schedule", description: "Schedule publishing coming soon!" })}
          >
            <CloudUpload className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Publish</span>
          </Button>

          <div className="flex items-center gap-2 ml-auto pl-3 border-l border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <Bot className={`h-4 w-4 ${aiEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium">SmartSchedule AI</span>
              <Switch
                checked={aiEnabled}
                onCheckedChange={handleAiToggle}
                disabled={toggleAiMutation.isPending || !workspace?.id}
                data-testid="switch-ai-toggle"
              />
            </div>
          </div>

          <Button 
            variant="outline" 
            size="sm"
            className="whitespace-nowrap flex-shrink-0 touch-manipulation min-h-9 hidden md:flex"
            data-testid="button-find-coverage"
          >
            <Users className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Find Coverage</span>
          </Button>

          <div className="ml-auto flex-shrink-0">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs whitespace-nowrap">
              <Zap className="mr-1 h-3 w-3" />
              <span className="hidden sm:inline">AI-Powered</span>
              <span className="sm:hidden">AI</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* ScheduleOS™ AI Auto-Scheduling Panel - Desktop Only */}
      <div className="hidden md:block px-3 sm:px-6 py-3 sm:py-4 border-b">
        <ScheduleOSPanel 
          weekStartDate={moment(currentDate).startOf('week').toDate()}
          onScheduleGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
            toast({
              title: "ScheduleOS™ Complete!",
              description: "AI-generated schedule is ready. Review and publish below.",
            });
          }}
        />
      </div>

      {/* Desktop Calendar View */}
      <div className="hidden md:flex flex-1 overflow-hidden p-2 sm:p-4 lg:p-6">
        <div className="h-full w-full bg-card rounded-md sm:rounded-lg border shadow-sm overflow-hidden">
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

      {/* Mobile Schedule View - Sling Style */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Tabs */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          {/* Top Bar - Date Selector and Menu */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Menu className="h-5 w-5" />
              <span className="font-semibold">{moment(selectedMobileDate).format('MMMM')}</span>
              <ChevronLeft className="h-4 w-4" onClick={() => setSelectedMobileDate(moment(selectedMobileDate).subtract(1, 'month').toDate())} />
              <ChevronRight className="h-4 w-4" onClick={() => setSelectedMobileDate(moment(selectedMobileDate).add(1, 'month').toDate())} />
            </div>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5" />
              <Bell className="h-5 w-5" />
              <Menu className="h-5 w-5" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex">
            <button
              onClick={() => setMobileTab('my-schedule')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'my-schedule' 
                  ? 'text-white border-b-2 border-white' 
                  : 'text-white/70'
              }`}
              data-testid="tab-my-schedule"
            >
              My schedule
            </button>
            <button
              onClick={() => setMobileTab('full-schedule')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'full-schedule' 
                  ? 'text-white border-b-2 border-white' 
                  : 'text-white/70'
              }`}
              data-testid="tab-full-schedule"
            >
              Full schedule
            </button>
            <button
              onClick={() => setMobileTab('pending')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'pending' 
                  ? 'text-white border-b-2 border-white' 
                  : 'text-white/70'
              }`}
              data-testid="tab-pending"
            >
              Pending
            </button>
          </div>
        </div>

        {/* Week Date Picker */}
        <div className="flex items-center justify-between bg-white px-4 py-3 border-b overflow-x-auto">
          <ChevronLeft 
            className="h-5 w-5 text-gray-600 flex-shrink-0" 
            onClick={() => setSelectedMobileDate(moment(selectedMobileDate).subtract(7, 'days').toDate())}
          />
          <div className="flex gap-4 mx-2">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const day = moment(selectedMobileDate).startOf('week').add(dayOffset, 'days');
              const isToday = day.isSame(moment(), 'day');
              const isSelected = day.isSame(moment(selectedMobileDate), 'day');
              return (
                <button
                  key={dayOffset}
                  onClick={() => setSelectedMobileDate(day.toDate())}
                  className="flex flex-col items-center min-w-[32px]"
                  data-testid={`date-${dayOffset}`}
                >
                  <span className="text-xs text-gray-500 mb-1">{day.format('D')}</span>
                  <div className={`w-2 h-2 rounded-full ${
                    isSelected ? 'bg-blue-600' : isToday ? 'bg-blue-400' : ''
                  }`} />
                </button>
              );
            })}
          </div>
          <ChevronRight 
            className="h-5 w-5 text-gray-600 flex-shrink-0" 
            onClick={() => setSelectedMobileDate(moment(selectedMobileDate).add(7, 'days').toDate())}
          />
        </div>

        {/* Week Stats Bar */}
        <div className="bg-white px-4 py-2 border-b flex items-center justify-between text-xs text-gray-500">
          <span>{moment(selectedMobileDate).startOf('week').format('D')} - {moment(selectedMobileDate).endOf('week').format('D MMM')}</span>
          <span>{weekStats.totalHours}h</span>
        </div>

        {/* Shifts List - Swipeable */}
        <div 
          ref={mobileContentRef}
          className="flex-1 overflow-y-auto bg-gray-50 mobile-scroll swipeable"
          onTouchStart={swipeHandlers.onTouchStart as any}
          onTouchMove={swipeHandlers.onTouchMove as any}
          onTouchEnd={swipeHandlers.onTouchEnd as any}
        >
          {(() => {
            // Filter shifts based on selected date and tab
            const dayShifts = shifts.filter(shift => {
              const shiftDate = moment(shift.startTime);
              const isSameDay = shiftDate.isSame(selectedMobileDate, 'day');
              
              if (!isSameDay) return false;
              
              // For "My schedule" tab, you would filter by current user
              // For now, show all shifts in "Full schedule"
              if (mobileTab === 'my-schedule') {
                // TODO: Filter by current user's shifts
                return true;
              }
              
              return true;
            }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

            if (dayShifts.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4">
                  <Clock className="h-12 w-12 mb-2" />
                  <p className="text-sm">No shifts scheduled</p>
                  <p className="text-xs mt-1">for {moment(selectedMobileDate).format('MMMM D, YYYY')}</p>
                </div>
              );
            }

            // Group by date
            const selectedDay = moment(selectedMobileDate).format('D');
            const selectedDayOfWeek = moment(selectedMobileDate).format('ddd').toUpperCase();

            return (
              <div className="p-3">
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-blue-600 text-white rounded-lg p-3 text-center min-w-[60px]">
                    <div className="text-2xl font-bold">{selectedDay}</div>
                    <div className="text-xs">{selectedDayOfWeek}</div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Shift Cards */}
                <div className="space-y-2">
                  {dayShifts.map((shift) => {
                    const employee = employees.find(e => e.id === shift.employeeId);
                    const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                    const duration = moment(shift.endTime).diff(moment(shift.startTime), 'hours', true);
                    const theme = getShiftTheme(shift, client, employee);
                    
                    return (
                      <button
                        key={shift.id}
                        onClick={() => {
                          setSelectedShift(shift);
                          setIsShiftPopoverOpen(true);
                        }}
                        style={{
                          backgroundColor: theme.backgroundColor,
                          borderColor: theme.borderColor,
                          color: theme.textColor,
                        }}
                        className="w-full text-left p-3 rounded-lg shadow-sm border-2"
                        data-testid={`shift-card-${shift.id}`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="text-sm font-semibold">
                            {moment(shift.startTime).format('h:mm A')} - {moment(shift.endTime).format('h:mm A')} • {duration.toFixed(1)}h
                          </div>
                          {detectConflict(shift, shifts) && (
                            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          )}
                        </div>
                        <div className="text-sm font-medium">
                          {employee?.firstName} {employee?.lastName}
                        </div>
                        {client && (
                          <div className="text-xs opacity-90 mt-1">
                            {client.firstName} {client.lastName} • {getEmployeeRole(shift.employeeId)}
                          </div>
                        )}
                        {shift.description && (
                          <div className="text-xs opacity-75 mt-1 line-clamp-1">
                            {shift.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Create Shift Dialog - Mobile Responsive (Full-Screen on Small Screens) */}
      <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
        <DialogContent className="w-[95vw] max-w-full sm:max-w-2xl h-[90vh] sm:h-auto overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Create New Shift</DialogTitle>
            <DialogDescription className="text-sm">
              Assign an employee and optionally link to a client job
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime" className="text-sm">Start Time *</Label>
                <Input 
                  id="startTime" 
                  type="time" 
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="text-base"
                  data-testid="input-shift-start" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime" className="text-sm">End Time *</Label>
                <Input 
                  id="endTime" 
                  type="time" 
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="text-base"
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
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setIsAddShiftOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createShiftMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-submit-shift"
            >
              {createShiftMutation.isPending ? "Creating..." : "Create Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Details Popover - Mobile Responsive (Full-Screen on Small Screens) */}
      {selectedShift && (
        <Dialog open={isShiftPopoverOpen} onOpenChange={setIsShiftPopoverOpen}>
          <DialogContent className="w-[95vw] max-w-full sm:max-w-md h-[90vh] sm:h-auto overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Avatar className="h-10 w-10" style={{ backgroundColor: getShiftTheme(selectedShift, clients.find(c => c.id === selectedShift.clientId), employees.find(e => e.id === selectedShift.employeeId)).backgroundColor }}>
                  <AvatarFallback className="text-white">
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

      {/* Schedule Proposal Review Drawer */}
      <ScheduleProposalDrawer
        open={proposalDrawerOpen}
        onClose={() => {
          setProposalDrawerOpen(false);
          setCurrentProposalId(null);
        }}
        proposalId={currentProposalId}
        onApproved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
        }}
        onRejected={() => {
          // Proposal rejected, no action needed
        }}
      />
    </DndProvider>
  );
}
