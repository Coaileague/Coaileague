import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Play, Square, Calendar, Users, Edit2, Check, X, Bell, History,
  MapPin, Camera, LogOut, LogIn, Download, Filter, ChevronDown,
  AlertCircle, CheckCircle, XCircle, Eye, Shield, Coffee, PlayCircle, Menu
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ResponsiveLoading } from "@/components/responsive-loading";
import { useIsMobile } from "@/hooks/use-mobile";

// ============================================================================
// SHARED HOOKS & UTILITIES - Preserve all existing backend logic
// ============================================================================

function useTimeTrackingData() {
  const { isAuthenticated, user } = useAuth();
  
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: isAuthenticated,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: isAuthenticated,
  });

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
    enabled: isAuthenticated,
  });

  const { data: allTimeEntries = [], isLoading: timeEntriesLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
    enabled: isAuthenticated,
  });

  // Get current user's employee record to determine role
  const currentEmployee = employees.find(emp => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'staff';

  // Role-based filtering: staff see only their own entries
  const timeEntries = useMemo(() => {
    if (workspaceRole === 'staff') {
      return allTimeEntries.filter(entry => entry.employeeId === currentEmployee?.id);
    }
    return allTimeEntries;
  }, [allTimeEntries, workspaceRole, currentEmployee]);

  // Find active entry for current user
  const activeEntry = timeEntries.find(entry => 
    !entry.clockOutTime && entry.employeeId === currentEmployee?.id
  );

  // Check if on break
  const onBreak = activeEntry?.currentBreakType !== null && activeEntry?.currentBreakType !== undefined;

  return {
    employees,
    clients,
    shifts,
    timeEntries,
    timeEntriesLoading,
    currentEmployee,
    workspaceRole,
    activeEntry,
    onBreak,
    user
  };
}

function useClockActions() {
  const { toast } = useToast();

  const clockInMutation = useMutation({
    mutationFn: async (data: { 
      employeeId: string; 
      clientId?: string; 
      shiftId?: string; 
      notes?: string; 
      hourlyRate: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
      gpsAccuracy?: number;
      photoUrl?: string;
    }) => {
      return apiRequest("POST", "/api/time-entries/clock-in", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Clocked In",
        description: "Time tracking started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clock in",
        variant: "destructive",
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (data: { 
      timeEntryId: string; 
      gpsLatitude?: number; 
      gpsLongitude?: number; 
      gpsAccuracy?: number;
      photoUrl?: string;
    }) => {
      return apiRequest("PATCH", `/api/time-entries/${data.timeEntryId}/clock-out`, {
        gpsLatitude: data.gpsLatitude,
        gpsLongitude: data.gpsLongitude,
        gpsAccuracy: data.gpsAccuracy,
        photoUrl: data.photoUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Clocked Out",
        description: "Time entry completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clock out",
        variant: "destructive",
      });
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: async (data: { breakType: 'meal' | 'rest' }) => {
      return apiRequest("POST", "/api/time-entries/break/start", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Break Started",
        description: `${variables.breakType === 'meal' ? 'Meal' : 'Rest'} break has been started`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start break",
        variant: "destructive",
      });
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/time-entries/break/end", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Break Ended",
        description: "You're back on the clock",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to end break",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (timeEntryId: string) => {
      return apiRequest("PATCH", `/api/time-entries/${timeEntryId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({
        title: "Approved",
        description: "Time entry has been approved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve entry",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (data: { timeEntryId: string; reason: string }) => {
      return apiRequest("PATCH", `/api/time-entries/${data.timeEntryId}/reject`, { reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({
        title: "Rejected",
        description: "Time entry has been rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject entry",
        variant: "destructive",
      });
    },
  });

  return {
    clockInMutation,
    clockOutMutation,
    startBreakMutation,
    endBreakMutation,
    approveMutation,
    rejectMutation,
  };
}

// ============================================================================
// VIEW COMPONENTS - New blue/cyan gradient design
// ============================================================================

function ClockView({ 
  currentEmployee, 
  activeEntry, 
  onBreak,
  clockInMutation,
  clockOutMutation,
  startBreakMutation,
  endBreakMutation,
  timeEntries,
  workspaceRole,
  employees
}: any) {
  const [now, setNow] = useState(Date.now());
  const [clockInDialogOpen, setClockInDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleClockIn = () => {
    if (!currentEmployee) return;
    
    clockInMutation.mutate({
      employeeId: currentEmployee.id,
      clientId: selectedClient || undefined,
      notes: notes || undefined,
      hourlyRate: "25.00", // Default rate
    });
    setClockInDialogOpen(false);
    setSelectedClient("");
    setNotes("");
  };

  const handleClockOut = () => {
    if (!activeEntry) return;
    clockOutMutation.mutate({ timeEntryId: activeEntry.id });
  };

  const handleStartBreak = () => {
    startBreakMutation.mutate({ breakType: 'meal' });
  };

  const handleEndBreak = () => {
    endBreakMutation.mutate();
  };

  const clockedInTime = activeEntry?.clockInTime ? new Date(activeEntry.clockInTime) : null;
  const currentlyClocked = !!activeEntry;

  // Calculate today's hours
  const todayHours = timeEntries
    .filter((e: TimeEntry) => {
      const entryDate = new Date(e.clockInTime).toDateString();
      const today = new Date().toDateString();
      return entryDate === today && e.employeeId === currentEmployee?.id;
    })
    .reduce((sum: number, e: TimeEntry) => {
      if (e.totalHours) return sum + parseFloat(e.totalHours.toString());
      return sum;
    }, 0);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Current Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 mb-4">
            {currentlyClocked ? (
              onBreak ? (
                <Coffee className="w-10 h-10 lg:w-12 lg:h-12 text-white" />
              ) : (
                <PlayCircle className="w-10 h-10 lg:w-12 lg:h-12 text-white" />
              )
            ) : (
              <Clock className="w-10 h-10 lg:w-12 lg:h-12 text-white" />
            )}
          </div>

          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">
            {currentlyClocked ? (onBreak ? 'On Break' : 'Currently Working') : 'Ready to Clock In'}
          </h2>
          
          {currentlyClocked && clockedInTime && (
            <div className="text-gray-600 mb-4">
              <p className="text-sm">Clocked in at {clockedInTime.toLocaleTimeString()}</p>
              <p className="text-2xl lg:text-3xl font-bold text-blue-600 mt-2">
                {Math.floor((now - clockedInTime.getTime()) / (1000 * 60 * 60))}h{' '}
                {Math.floor(((now - clockedInTime.getTime()) / (1000 * 60)) % 60)}m
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mt-6">
            {!currentlyClocked ? (
              <Button
                onClick={() => setClockInDialogOpen(true)}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 lg:py-6 rounded-lg font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg"
                data-testid="button-clock-in"
              >
                <LogIn className="w-5 h-5 lg:w-6 lg:h-6 mr-2" />
                Clock In
              </Button>
            ) : (
              <>
                {!onBreak ? (
                  <>
                    <Button
                      onClick={handleStartBreak}
                      className="flex-1 bg-orange-600 text-white py-3 lg:py-6 rounded-lg font-bold hover:bg-orange-700"
                      data-testid="button-start-break"
                    >
                      <Coffee className="w-5 h-5 mr-2" />
                      Start Break
                    </Button>
                    <Button
                      onClick={handleClockOut}
                      className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 text-white py-3 lg:py-6 rounded-lg font-bold hover:from-red-700 hover:to-rose-700 transition-all shadow-lg"
                      data-testid="button-clock-out"
                    >
                      <LogOut className="w-5 h-5 lg:w-6 lg:h-6 mr-2" />
                      Clock Out
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleEndBreak}
                    className="flex-1 bg-blue-600 text-white py-3 lg:py-6 rounded-lg font-bold hover:bg-blue-700"
                    data-testid="button-end-break"
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    End Break
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Location Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center space-x-2 text-gray-600">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">GPS verification enabled</span>
            </div>
            <div className="flex items-center justify-center space-x-2 text-gray-600 mt-2">
              <Camera className="w-4 h-4" />
              <span className="text-sm">Photo verification enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Today's Hours</p>
              <p className="text-xl font-bold text-gray-900">{todayHours.toFixed(1)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">This Week</p>
              <p className="text-xl font-bold text-gray-900">
                {timeEntries.filter((e: TimeEntry) => 
                  e.employeeId === currentEmployee?.id && 
                  new Date(e.clockInTime) >= startOfWeek(new Date())
                ).reduce((sum: number, e: TimeEntry) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(1)}h
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Pending</p>
              <p className="text-xl font-bold text-gray-900">
                {timeEntries.filter((e: TimeEntry) => e.status === 'pending').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Approved</p>
              <p className="text-xl font-bold text-gray-900">
                {timeEntries.filter((e: TimeEntry) => e.status === 'approved').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Status (for managers) */}
      {(workspaceRole === 'manager' || workspaceRole === 'owner') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Team Status</h3>
          <div className="space-y-3">
            {employees.map((emp: Employee) => {
              const empActiveEntry = timeEntries.find((e: TimeEntry) => 
                e.employeeId === emp.id && !e.clockOutTime
              );
              const isOnBreak = empActiveEntry?.currentBreakType !== null;
              const status = empActiveEntry ? (isOnBreak ? 'on_break' : 'clocked_in') : 'clocked_out';
              
              const todayHours = timeEntries
                .filter((e: TimeEntry) => {
                  const entryDate = new Date(e.clockInTime).toDateString();
                  const today = new Date().toDateString();
                  return entryDate === today && e.employeeId === emp.id;
                })
                .reduce((sum: number, e: TimeEntry) => {
                  if (e.totalHours) return sum + parseFloat(e.totalHours.toString());
                  return sum;
                }, 0);

              return (
                <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-testid={`team-member-${emp.id}`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-gray-600">{emp.workspaceRole}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                      status === 'clocked_in' ? 'bg-green-100 text-green-700' :
                      status === 'on_break' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'clocked_in' ? 'bg-green-500' :
                        status === 'on_break' ? 'bg-orange-500' :
                        'bg-gray-400'
                      }`}></div>
                      <span className="capitalize">{status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{todayHours.toFixed(1)}h today</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Clock In Dialog */}
      <Dialog open={clockInDialogOpen} onOpenChange={setClockInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock In</DialogTitle>
            <DialogDescription>Start tracking your time</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Notes (optional)</Label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about your shift..."
                data-testid="input-notes"
              />
            </div>
            <Button 
              onClick={handleClockIn} 
              className="w-full" 
              disabled={clockInMutation.isPending}
              data-testid="button-confirm-clock-in"
            >
              {clockInMutation.isPending ? "Clocking In..." : "Confirm Clock In"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimesheetView({ timeEntries, employees, workspaceRole, currentEmployee }: any) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by date or employee..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              data-testid="input-search"
            />
          </div>
          <Button className="bg-blue-600 text-white hover:bg-blue-700" data-testid="button-filter">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button className="bg-green-600 text-white hover:bg-green-700" data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Timesheet Entries */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Clock In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Clock Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {timeEntries.map((entry: TimeEntry) => {
                const employee = employees.find((e: Employee) => e.id === entry.employeeId);
                return (
                  <tr key={entry.id} className="hover:bg-gray-50" data-testid={`entry-row-${entry.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {employee?.firstName} {employee?.lastName}
                      </div>
                      {entry.clockInPhotoUrl && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500 mt-1">
                          <Camera className="w-3 h-3" />
                          <span>Photo verified</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(entry.clockInTime), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(entry.clockInTime), 'h:mm a')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {entry.clockOutTime ? format(new Date(entry.clockOutTime), 'h:mm a') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-gray-900">
                        {entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(1) : '0.0'}h
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.status === 'approved' ? 'default' : entry.status === 'rejected' ? 'destructive' : 'secondary'}>
                        {entry.status || 'pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setSelectedEntry(entry)}
                        data-testid={`button-view-${entry.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-gray-200">
          {timeEntries.map((entry: TimeEntry) => {
            const employee = employees.find((e: Employee) => e.id === entry.employeeId);
            return (
              <div key={entry.id} className="p-4" data-testid={`entry-card-${entry.id}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900">{employee?.firstName} {employee?.lastName}</p>
                    <p className="text-sm text-gray-600">{format(new Date(entry.clockInTime), 'MMM dd, yyyy')}</p>
                  </div>
                  <Badge variant={entry.status === 'approved' ? 'default' : 'secondary'}>
                    {entry.status || 'pending'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-gray-600">Clock In</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(entry.clockInTime), 'h:mm a')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Clock Out</p>
                    <p className="font-medium text-gray-900">
                      {entry.clockOutTime ? format(new Date(entry.clockOutTime), 'h:mm a') : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Hours</p>
                    <p className="font-bold text-gray-900">
                      {entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(1) : '0.0'}h
                    </p>
                  </div>
                </div>

                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => setSelectedEntry(entry)}
                  data-testid={`button-view-mobile-${entry.id}`}
                >
                  View Details
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Entry Details Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
            <DialogTitle>Timesheet Entry Details</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-gray-900 mb-2">
                  {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.firstName}{' '}
                  {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.lastName}
                </h4>
                <p className="text-sm text-gray-600">{format(new Date(selectedEntry.clockInTime), 'MMMM dd, yyyy')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Clock In</Label>
                  <p className="text-gray-900 font-medium">{format(new Date(selectedEntry.clockInTime), 'h:mm a')}</p>
                </div>
                <div>
                  <Label>Clock Out</Label>
                  <p className="text-gray-900 font-medium">
                    {selectedEntry.clockOutTime ? format(new Date(selectedEntry.clockOutTime), 'h:mm a') : '-'}
                  </p>
                </div>
                <div>
                  <Label>Total Hours</Label>
                  <p className="text-gray-900 font-bold">
                    {selectedEntry.totalHours ? parseFloat(selectedEntry.totalHours.toString()).toFixed(2) : '0.00'}h
                  </p>
                </div>
                <div>
                  <Label>Status</Label>
                  <p>
                    <Badge variant={selectedEntry.status === 'approved' ? 'default' : 'secondary'}>
                      {selectedEntry.status || 'pending'}
                    </Badge>
                  </p>
                </div>
              </div>

              {selectedEntry.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm text-gray-600 mt-1">{selectedEntry.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalsView({ timeEntries, employees, approveMutation, rejectMutation }: any) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingEntries = timeEntries.filter((e: TimeEntry) => e.status === 'pending');

  const handleApprove = (entryId: string) => {
    approveMutation.mutate(entryId);
  };

  const handleRejectClick = (entryId: string) => {
    setRejectingEntryId(entryId);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (rejectingEntryId && rejectReason) {
      rejectMutation.mutate({ timeEntryId: rejectingEntryId, reason: rejectReason });
      setRejectDialogOpen(false);
      setRejectingEntryId(null);
      setRejectReason("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Pending Approvals ({pendingEntries.length})
        </h3>

        <div className="space-y-4">
          {pendingEntries.map((entry: TimeEntry) => {
            const employee = employees.find((e: Employee) => e.id === entry.employeeId);
            return (
              <div key={entry.id} className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50" data-testid={`approval-entry-${entry.id}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {employee?.firstName?.[0]}{employee?.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{employee?.firstName} {employee?.lastName}</p>
                        <p className="text-sm text-gray-600">{format(new Date(entry.clockInTime), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-gray-600">In: {format(new Date(entry.clockInTime), 'h:mm a')}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">
                          Out: {entry.clockOutTime ? format(new Date(entry.clockOutTime), 'h:mm a') : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">
                          Total: {entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(1) : '0.0'}h
                        </p>
                      </div>
                    </div>

                    {entry.notes && (
                      <p className="text-sm text-gray-600 mt-2 italic">{entry.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(entry.id)}
                      className="flex-1 lg:flex-none bg-green-600 text-white hover:bg-green-700"
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${entry.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleRejectClick(entry.id)}
                      className="flex-1 lg:flex-none bg-red-600 text-white hover:bg-red-700"
                      disabled={rejectMutation.isPending}
                      data-testid={`button-reject-${entry.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {pendingEntries.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">All caught up!</p>
              <p className="text-sm text-gray-500">No pending approvals</p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Time Entry</DialogTitle>
            <DialogDescription>Please provide a reason for rejection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              data-testid="input-reject-reason"
            />
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setRejectDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={!rejectReason || rejectMutation.isPending}
                data-testid="button-confirm-reject"
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// MAIN TIME TRACKING PAGE
// ============================================================================

export default function TimeTracking() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [view, setView] = useState('clock');

  // Use shared hooks
  const {
    employees,
    timeEntries,
    timeEntriesLoading,
    currentEmployee,
    workspaceRole,
    activeEntry,
    onBreak,
  } = useTimeTrackingData();

  const {
    clockInMutation,
    clockOutMutation,
    startBreakMutation,
    endBreakMutation,
    approveMutation,
    rejectMutation,
  } = useClockActions();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || timeEntriesLoading) {
    return <ResponsiveLoading />;
  }

  if (!isAuthenticated) {
    return null;
  }

  const pendingApprovals = timeEntries.filter((e: TimeEntry) => e.status === 'pending').length;
  const canApprove = workspaceRole === 'manager' || workspaceRole === 'owner';

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* Blue/Cyan Gradient Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 lg:py-4">
          <div className="flex items-center justify-between">
            {/* Left: Title */}
            <div className="flex items-center space-x-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-6 h-6" />
                  <h1 className="text-lg lg:text-xl font-bold">TimeTracker</h1>
                </div>
                <p className="text-xs opacity-90 hidden lg:block">Universal Time Management</p>
              </div>
            </div>

            {/* Right: User Info */}
            <div className="flex items-center space-x-2 lg:space-x-4">
              {activeEntry && (
                <div className="hidden lg:flex items-center space-x-2 bg-white bg-opacity-20 px-3 py-1.5 rounded-lg">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Clocked In</span>
                </div>
              )}

              <div className="flex items-center space-x-2 bg-white bg-opacity-20 px-2 lg:px-3 py-1.5 rounded-lg">
                <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
                <div className="hidden lg:block">
                  <div className="text-sm font-medium">{currentEmployee?.firstName} {currentEmployee?.lastName}</div>
                  <div className="text-xs opacity-90 capitalize">{workspaceRole}</div>
                </div>
                <div className="lg:hidden">
                  <div className="text-xs font-medium">{currentEmployee?.firstName}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-2 mt-4">
            <Button
              variant="ghost"
              onClick={() => setView('clock')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-white hover:bg-white hover:bg-opacity-20 ${
                view === 'clock' ? 'bg-white bg-opacity-20' : ''
              }`}
              data-testid="button-nav-clock"
            >
              <Clock className="w-4 h-4 mr-2" />
              Clock In/Out
            </Button>
            <Button
              variant="ghost"
              onClick={() => setView('timesheet')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-white hover:bg-white hover:bg-opacity-20 ${
                view === 'timesheet' ? 'bg-white bg-opacity-20' : ''
              }`}
              data-testid="button-nav-timesheet"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Timesheets
            </Button>
            {canApprove && (
              <Button
                variant="ghost"
                onClick={() => setView('approvals')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-white hover:bg-white hover:bg-opacity-20 relative ${
                  view === 'approvals' ? 'bg-white bg-opacity-20' : ''
                }`}
                data-testid="button-nav-approvals"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approvals
                {pendingApprovals > 0 && (
                  <span className="ml-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {pendingApprovals}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6">
        {view === 'clock' && (
          <ClockView
            currentEmployee={currentEmployee}
            activeEntry={activeEntry}
            onBreak={onBreak}
            clockInMutation={clockInMutation}
            clockOutMutation={clockOutMutation}
            startBreakMutation={startBreakMutation}
            endBreakMutation={endBreakMutation}
            timeEntries={timeEntries}
            workspaceRole={workspaceRole}
            employees={employees}
          />
        )}

        {view === 'timesheet' && (
          <TimesheetView
            timeEntries={timeEntries}
            employees={employees}
            workspaceRole={workspaceRole}
            currentEmployee={currentEmployee}
          />
        )}

        {view === 'approvals' && canApprove && (
          <ApprovalsView
            timeEntries={timeEntries}
            employees={employees}
            approveMutation={approveMutation}
            rejectMutation={rejectMutation}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
        <div className="grid grid-cols-3 h-16">
          <button
            onClick={() => setView('clock')}
            className={`flex flex-col items-center justify-center ${
              view === 'clock' ? 'text-blue-600' : 'text-gray-600'
            }`}
            data-testid="button-mobile-nav-clock"
          >
            <Clock className="w-5 h-5 mb-1" />
            <span className="text-xs">Clock</span>
          </button>
          <button
            onClick={() => setView('timesheet')}
            className={`flex flex-col items-center justify-center ${
              view === 'timesheet' ? 'text-blue-600' : 'text-gray-600'
            }`}
            data-testid="button-mobile-nav-timesheet"
          >
            <Calendar className="w-5 h-5 mb-1" />
            <span className="text-xs">Timesheet</span>
          </button>
          {canApprove && (
            <button
              onClick={() => setView('approvals')}
              className={`flex flex-col items-center justify-center relative ${
                view === 'approvals' ? 'text-blue-600' : 'text-gray-600'
              }`}
              data-testid="button-mobile-nav-approvals"
            >
              <CheckCircle className="w-5 h-5 mb-1" />
              <span className="text-xs">Approve</span>
              {pendingApprovals > 0 && (
                <span className="absolute top-1 right-6 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {pendingApprovals}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
