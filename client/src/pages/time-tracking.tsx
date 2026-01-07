import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTrinityAnnouncement } from "@/hooks/use-trinity-announcement";
import { useClientLookup } from "@/hooks/useClients";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Clock, Play, Square, Calendar, Users, Edit2, Check, X, Bell, History,
  MapPin, Camera, LogOut, LogIn, Download, Filter, ChevronDown, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, XCircle, Eye, Shield, Coffee, PlayCircle, Menu, Home, ArrowLeft,
  LayoutGrid, List, CheckSquare, AlertTriangle, Loader2, BarChart2, FileText, DollarSign,
  TrendingUp, AlertOctagon, FileSpreadsheet
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiGet } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { useIsMobile } from "@/hooks/use-mobile";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import { TimelineSkeleton, MetricsCardsSkeleton } from "@/components/loading-indicators/skeletons";

export default function TimeTracking() {
  const { toast } = useToast();
  const trinity = useTrinityAnnouncement();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState('clock');
  const [clockInDialogOpen, setClockInDialogOpen] = useState(false);
  const [clockOutDialogOpen, setClockOutDialogOpen] = useState(false);
  const [clockingOutEntryId, setClockingOutEntryId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedShift, setSelectedShift] = useState<string>("");
  const [now, setNow] = useState(Date.now());
  
  // Rejection dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  
  // GPS and Photo states
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Filtering states
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [dateRange, setDateRange] = useState<string>("week");
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  
  // GetSling-style weekly grid state
  const [timesheetViewMode, setTimesheetViewMode] = useState<'list' | 'grid'>('grid');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ employee: Employee; date: Date; entries: TimeEntry[] } | null>(null);
  const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Real-time timer update for active entries
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const { data: employees = [], isError: employeesError, error: employeesErrorObj, refetch: refetchEmployees } = useQuery<Employee[]>({
    queryKey: queryKeys.employees.all,
    queryFn: () => apiGet('employees.list'),
    enabled: isAuthenticated,
  });

  const { data: clients = [] } = useClientLookup();

  const { data: shifts = [], isError: shiftsError, error: shiftsErrorObj, refetch: refetchShifts } = useQuery<Shift[]>({
    queryKey: queryKeys.shifts.all,
    queryFn: () => apiGet('shifts.list'),
    enabled: isAuthenticated,
  });

  const { data: allTimeEntries = [], isError: entriesError, error: entriesErrorObj, refetch: refetchEntries } = useQuery<TimeEntry[]>({
    queryKey: queryKeys.timeEntries.all,
    queryFn: () => apiGet('timeEntries.list'),
    enabled: isAuthenticated,
  });

  // Show error toasts when queries fail
  useEffect(() => {
    if (employeesError && employeesErrorObj) {
      toast({
        title: "Failed to Load Employees",
        description: "Unable to fetch employee data. Please try again.",
        variant: "destructive",
        action: <Button variant="outline" size="sm" onClick={() => refetchEmployees()} data-testid="button-retry-employees">Retry</Button>,
      });
    }
    if (shiftsError && shiftsErrorObj) {
      toast({
        title: "Failed to Load Shifts",
        description: "Unable to fetch shift data. Please try again.",
        variant: "destructive",
        action: <Button variant="outline" size="sm" onClick={() => refetchShifts()} data-testid="button-retry-shifts">Retry</Button>,
      });
    }
    if (entriesError && entriesErrorObj) {
      toast({
        title: "Failed to Load Time Entries",
        description: "Unable to fetch time tracking data. Please try again.",
        variant: "destructive",
        action: <Button variant="outline" size="sm" onClick={() => refetchEntries()} data-testid="button-retry-entries">Retry</Button>,
      });
    }
  }, [employeesError, employeesErrorObj, shiftsError, shiftsErrorObj, entriesError, entriesErrorObj, toast, refetchEmployees, refetchShifts, refetchEntries]);

  // Get current user's employee record to determine role
  const currentEmployee = employees.find(emp => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'staff';

  // Auto-select current employee for staff role (RBAC enforcement)
  // Only run once when currentEmployee becomes available
  useEffect(() => {
    if (currentEmployee && workspaceRole === 'staff' && !selectedEmployee) {
      setSelectedEmployee(currentEmployee.id);
    }
  }, [currentEmployee, workspaceRole]); // Remove selectedEmployee from deps to prevent loop

  // Role-based filtering: employees see only their own entries
  const timeEntries = useMemo(() => {
    if (workspaceRole === 'staff') {
      return allTimeEntries.filter(entry => entry.employeeId === currentEmployee?.id);
    }
    return allTimeEntries;
  }, [allTimeEntries, workspaceRole, currentEmployee]);

  const clockInMutation = useMutation({
    mutationFn: (data: { 
      employeeId: string; 
      clientId?: string; 
      shiftId?: string; 
      notes?: string; 
      hourlyRate: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
      gpsAccuracy?: number;
      photoUrl?: string;
    }) => apiPost('timeEntries.clockIn', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.success("You're now on the clock! Time tracking has started with GPS verification.", "Clocked In");
      setClockInDialogOpen(false);
      // For staff, keep employee selected for next clock-in; managers/owners clear selection
      if (workspaceRole === 'staff' && currentEmployee) {
        setSelectedEmployee(currentEmployee.id);
      } else {
        setSelectedEmployee("");
      }
      setSelectedClient("");
      setSelectedShift("");
      setNotes("");
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
      stopCamera();
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to clock in. Please try again.", "Clock In Failed");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: (data: { 
      timeEntryId: string; 
      gpsLatitude?: number; 
      gpsLongitude?: number; 
      gpsAccuracy?: number;
      photoUrl?: string;
    }) => apiPost('timeEntries.clockOut', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.success("Great work! Your time entry has been recorded successfully.", "Clocked Out");
      // Close dialog and clear state AFTER mutation completes
      setClockOutDialogOpen(false);
      setClockingOutEntryId(null);
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
      stopCamera();
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to clock out. Please try again.", "Clock Out Failed");
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: (data: { breakType: 'meal' | 'rest' }) => apiPost('timeEntries.startBreak', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.info(`Enjoy your ${variables.breakType === 'meal' ? 'meal' : 'rest'} break! Take your time.`, "Break Started");
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to start break. Please try again.", "Break Start Failed");
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: () => apiPost('timeEntries.endBreak', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.info("Welcome back! You're now on the clock again.", "Break Ended");
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to end break. Please try again.", "Break End Failed");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (timeEntryId: string) => apiPost('timeEntries.approve', { timeEntryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.success("Time entry approved successfully!", "Entry Approved");
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to approve entry. Please try again.", "Approval Failed");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { timeEntryId: string; reason: string }) => apiPost('timeEntries.reject', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.warning("Time entry has been rejected.", "Entry Rejected");
      setRejectDialogOpen(false);
      setRejectingEntryId(null);
      setRejectReason("");
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to reject entry. Please try again.", "Rejection Failed");
    },
  });

  // GPS Capture Function
  const captureGPS = async (): Promise<{ latitude: number; longitude: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsError("GPS not supported on this device");
        toast({
          title: "GPS Not Available",
          description: "Your device doesn't support GPS tracking",
          variant: "destructive",
        });
        resolve(null);
        return;
      }

      setIsCapturingGPS(true);
      setGpsError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const gps = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setGpsData(gps);
          setIsCapturingGPS(false);
          
          if (gps.accuracy > 50) {
            toast({
              title: "GPS Warning",
              description: `GPS accuracy is ${Math.round(gps.accuracy)}m. For best results, ensure clear sky visibility.`,
              variant: "default",
            });
          } else {
            toast({
              title: "GPS Captured",
              description: `Location verified with ${Math.round(gps.accuracy)}m accuracy`,
            });
          }
          
          resolve(gps);
        },
        (error) => {
          setIsCapturingGPS(false);
          let errorMsg = "Failed to get GPS location";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = "GPS permission denied. Please enable location access in your browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = "GPS position unavailable. Please ensure location services are enabled.";
              break;
            case error.TIMEOUT:
              errorMsg = "GPS request timed out. Please try again.";
              break;
          }
          
          setGpsError(errorMsg);
          toast({
            title: "GPS Error",
            description: errorMsg,
            variant: "destructive",
          });
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Photo Capture Functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (error: any) {
      toast({
        title: "Camera Error",
        description: error.name === "NotAllowedError" 
          ? "Camera permission denied. Please enable camera access." 
          : "Failed to access camera",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(photoDataUrl);
        stopCamera();
        
        toast({
          title: "Photo Captured",
          description: "Verification photo saved successfully",
        });
      }
    }
  };

  // Auto-capture GPS and start camera when dialogs open
  useEffect(() => {
    if (clockInDialogOpen || clockOutDialogOpen) {
      captureGPS();
      if (!isMobile) {
        startCamera();
      }
    }
    // Don't auto-clear GPS/photo on dialog close - mutations handle cleanup
    
    return () => {
      stopCamera();
    };
  }, [clockInDialogOpen, clockOutDialogOpen]);

  const handleClockIn = () => {
    if (!selectedEmployee) {
      toast({
        title: "Error",
        description: "Please select an employee",
        variant: "destructive",
      });
      return;
    }

    if (!gpsData) {
      toast({
        title: "GPS Required",
        description: "Please wait for GPS to be captured or try again",
        variant: "destructive",
      });
      return;
    }

    if (!capturedPhoto) {
      toast({
        title: "Photo Required",
        description: "Please capture a verification photo",
        variant: "destructive",
      });
      return;
    }

    const employee = employees.find(e => e.id === selectedEmployee);
    const hourlyRate = employee?.hourlyRate || "0";

    clockInMutation.mutate({
      employeeId: selectedEmployee,
      clientId: selectedClient && selectedClient !== "none" ? selectedClient : undefined,
      shiftId: selectedShift && selectedShift !== "none" ? selectedShift : undefined,
      notes: notes || undefined,
      hourlyRate,
      gpsLatitude: gpsData.latitude,
      gpsLongitude: gpsData.longitude,
      gpsAccuracy: gpsData.accuracy,
      photoUrl: capturedPhoto,
    });
  };

  const handleClockOut = (entryId: string) => {
    setClockingOutEntryId(entryId);
    setClockOutDialogOpen(true);
  };

  const handleConfirmClockOut = () => {
    if (!clockingOutEntryId) return;

    if (!gpsData) {
      toast({
        title: "GPS Required",
        description: "Please wait for GPS to be captured or try again",
        variant: "destructive",
      });
      return;
    }

    if (!capturedPhoto) {
      toast({
        title: "Photo Required",
        description: "Please capture a verification photo",
        variant: "destructive",
      });
      return;
    }
    
    // Don't close dialog here - let mutation onSuccess handle cleanup
    clockOutMutation.mutate({
      timeEntryId: clockingOutEntryId,
      gpsLatitude: gpsData.latitude,
      gpsLongitude: gpsData.longitude,
      gpsAccuracy: gpsData.accuracy,
      photoUrl: capturedPhoto,
    });
  };

  // Find active entry for current user
  const activeEntry = timeEntries.find(entry => 
    !entry.clockOut && entry.employeeId === currentEmployee?.id
  );

  // Query breaks separately to determine break status
  // A break is indicated by status 'on_break' in the time entry
  const onBreak = activeEntry?.status === 'on_break' || activeEntry?.status === 'break';
  const clockedInTime = activeEntry?.clockIn ? new Date(activeEntry.clockIn) : null;
  const currentlyClocked = !!activeEntry;

  // Calculate today's hours
  const todayHours = timeEntries
    .filter((e: TimeEntry) => {
      const entryDate = new Date(e.clockIn).toDateString();
      const today = new Date().toDateString();
      return entryDate === today && e.employeeId === currentEmployee?.id;
    })
    .reduce((sum: number, e: TimeEntry) => {
      if (e.totalHours) return sum + parseFloat(e.totalHours.toString());
      return sum;
    }, 0);

  // Filtered and sorted entries
  const filteredTimeEntries = useMemo(() => {
    let filtered = [...timeEntries];

    // Filter by employee
    if (filterEmployee && filterEmployee !== "all") {
      filtered = filtered.filter(entry => entry.employeeId === filterEmployee);
    }

    // Filter by status
    if (filterStatus && filterStatus !== "all") {
      filtered = filtered.filter(entry => entry.status === filterStatus);
    }

    // Filter by date range
    const now = new Date();
    let startDate = startOfWeek(now);
    let endDate = endOfWeek(now);

    if (dateRange === "today") {
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
    } else if (dateRange === "week") {
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
    } else if (dateRange === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    filtered = filtered.filter(entry => {
      const entryDate = new Date(entry.clockIn);
      return entryDate >= startDate && entryDate <= endDate;
    });

    // Sort
    switch (sortBy) {
      case "date-desc":
        filtered.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
        break;
      case "date-asc":
        filtered.sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
        break;
      case "employee":
        filtered.sort((a, b) => {
          const empA = employees.find(e => e.id === a.employeeId);
          const empB = employees.find(e => e.id === b.employeeId);
          return (empA?.firstName || "").localeCompare(empB?.firstName || "");
        });
        break;
    }

    return filtered;
  }, [timeEntries, filterEmployee, filterStatus, dateRange, sortBy, employees]);

  const pendingApprovals = timeEntries.filter((e: TimeEntry) => e.status === 'pending').length;
  const canApprove = workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor';

  // GetSling-style weekly grid calculations
  const gridWeekStart = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now);
    start.setDate(start.getDate() + (weekOffset * 7));
    return start;
  }, [weekOffset]);

  const gridWeekEnd = useMemo(() => {
    const end = new Date(gridWeekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [gridWeekStart]);

  const gridDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(gridWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [gridWeekStart]);

  // RBAC-filtered employees for grid view - staff only see themselves
  const gridEmployees = useMemo(() => {
    if (workspaceRole === 'staff' && currentEmployee) {
      return employees.filter(e => e.id === currentEmployee.id);
    }
    // Managers see all employees, optionally filtered by filterEmployee
    if (filterEmployee && filterEmployee !== 'all') {
      return employees.filter(e => e.id === filterEmployee);
    }
    return employees;
  }, [employees, workspaceRole, currentEmployee, filterEmployee]);

  // Get employee hours for a specific day - uses RBAC-filtered timeEntries
  const getEmployeeDayData = (employeeId: string, date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Use timeEntries (RBAC-filtered) instead of allTimeEntries
    const dayEntries = timeEntries.filter(entry => {
      if (entry.employeeId !== employeeId) return false;
      const entryDate = new Date(entry.clockIn);
      return entryDate >= dayStart && entryDate <= dayEnd;
    });

    const totalHours = dayEntries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0);
    const hasActive = dayEntries.some(e => !e.clockOut);
    const hasPending = dayEntries.some(e => e.status === 'pending');
    const hasFlagged = dayEntries.some(e => e.status === 'flagged' || e.status === 'rejected');
    const allApproved = dayEntries.length > 0 && dayEntries.every(e => e.status === 'approved');
    const hasLateClockIn = dayEntries.some(e => {
      const shift = shifts.find(s => s.id === e.shiftId);
      if (!shift) return false;
      const shiftStart = new Date(shift.startTime);
      const clockIn = new Date(e.clockIn);
      return (clockIn.getTime() - shiftStart.getTime()) > 5 * 60 * 1000; // > 5 mins late
    });

    return { totalHours, entries: dayEntries, hasActive, hasPending, hasFlagged, allApproved, hasLateClockIn };
  };

  // Get weekly total for an employee - uses RBAC-filtered timeEntries
  const getEmployeeWeekTotal = (employeeId: string) => {
    const weekStart = new Date(gridWeekStart);
    const weekEnd = new Date(gridWeekEnd);
    weekEnd.setHours(23, 59, 59, 999);

    // Use timeEntries (RBAC-filtered) instead of allTimeEntries
    const weekEntries = timeEntries.filter(entry => {
      if (entry.employeeId !== employeeId) return false;
      const entryDate = new Date(entry.clockIn);
      return entryDate >= weekStart && entryDate <= weekEnd;
    });

    const total = weekEntries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0);
    const hasPending = weekEntries.some(e => e.status === 'pending');
    return { total, hasPending, entries: weekEntries };
  };

  // Toggle bulk selection - uses gridEmployees (RBAC-filtered)
  const toggleBulkSelect = (employeeId: string) => {
    const newSet = new Set(bulkSelectedEmployees);
    if (newSet.has(employeeId)) {
      newSet.delete(employeeId);
    } else {
      newSet.add(employeeId);
    }
    setBulkSelectedEmployees(newSet);
  };

  // Select all employees - uses gridEmployees (RBAC-filtered)
  const selectAllEmployees = () => {
    if (bulkSelectedEmployees.size === gridEmployees.length) {
      setBulkSelectedEmployees(new Set());
    } else {
      setBulkSelectedEmployees(new Set(gridEmployees.map(e => e.id)));
    }
  };

  // Bulk approve mutation - uses RBAC-filtered timeEntries
  const bulkApproveMutation = useMutation({
    mutationFn: async (employeeIds: string[]) => {
      const weekStart = new Date(gridWeekStart);
      const weekEnd = new Date(gridWeekEnd);
      weekEnd.setHours(23, 59, 59, 999);

      // Use timeEntries (RBAC-filtered) instead of allTimeEntries
      const entriesToApprove = timeEntries.filter(entry => {
        if (!employeeIds.includes(entry.employeeId)) return false;
        if (entry.status !== 'pending') return false;
        const entryDate = new Date(entry.clockIn);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });

      // Approve each entry
      for (const entry of entriesToApprove) {
        await apiPost('timeEntries.approve', { timeEntryId: entry.id });
      }
      return entriesToApprove.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.success(`Successfully approved ${count} time entries!`, "Bulk Approval Complete");
      setBulkSelectedEmployees(new Set());
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to approve entries", "Bulk Approval Failed");
    },
  });

  // Helper function to generate CSV data
  const generateReportData = (reportType: 'labor' | 'overtime' | 'exceptions') => {
    const weekStart = new Date(gridWeekStart);
    const weekEnd = new Date(gridWeekEnd);
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekEntries = timeEntries.filter(e => {
      const entryDate = new Date(e.clockIn);
      return entryDate >= weekStart && entryDate <= weekEnd;
    });

    if (reportType === 'labor') {
      const headers = ['Employee Name', 'Position', 'Total Hours', 'Regular Hours', 'Overtime Hours', 'Estimated Pay'];
      const rows = gridEmployees.map(emp => {
        const weekTotal = getEmployeeWeekTotal(emp.id);
        const regular = Math.min(weekTotal.total, 40);
        const overtime = Math.max(0, weekTotal.total - 40);
        const estPay = (regular * 18) + (overtime * 27);
        return [
          `${emp.firstName} ${emp.lastName}`,
          emp.workspaceRole || 'Employee',
          weekTotal.total.toFixed(2),
          regular.toFixed(2),
          overtime.toFixed(2),
          estPay.toFixed(2)
        ].join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    } else if (reportType === 'overtime') {
      const headers = ['Employee Name', 'Total Hours', 'Overtime Hours', 'Overtime Cost (1.5x)'];
      const rows = gridEmployees.filter(emp => getEmployeeWeekTotal(emp.id).total > 40).map(emp => {
        const weekTotal = getEmployeeWeekTotal(emp.id);
        const overtime = weekTotal.total - 40;
        return [
          `${emp.firstName} ${emp.lastName}`,
          weekTotal.total.toFixed(2),
          overtime.toFixed(2),
          (overtime * 27).toFixed(2)
        ].join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    } else {
      const headers = ['Date', 'Employee', 'Exception Type', 'Details'];
      const exceptionRows: string[] = [];
      
      // Late Clock-Ins
      weekEntries.filter(e => {
        const shift = shifts.find(s => s.id === e.shiftId);
        if (!shift) return false;
        const clockIn = new Date(e.clockIn);
        const shiftStart = new Date(shift.startTime);
        return (clockIn.getTime() - shiftStart.getTime()) > 5 * 60 * 1000;
      }).forEach(e => {
        const emp = employees.find(emp => emp.id === e.employeeId);
        exceptionRows.push([
          format(new Date(e.clockIn), 'yyyy-MM-dd'),
          `${emp?.firstName} ${emp?.lastName}`,
          'Late Clock-In',
          `Clocked in at ${format(new Date(e.clockIn), 'h:mm a')}`
        ].join(','));
      });
      
      // Flagged/Rejected Entries
      weekEntries.filter(e => e.status === 'rejected' || e.status === 'flagged').forEach(e => {
        const emp = employees.find(emp => emp.id === e.employeeId);
        exceptionRows.push([
          format(new Date(e.clockIn), 'yyyy-MM-dd'),
          `${emp?.firstName} ${emp?.lastName}`,
          'Flagged Entry',
          `Status: ${e.status}`
        ].join(','));
      });
      
      // Missing Clock-Outs (older than 12 hours)
      weekEntries.filter(e => !e.clockOut && new Date(e.clockIn) < new Date(Date.now() - 12 * 60 * 60 * 1000)).forEach(e => {
        const emp = employees.find(emp => emp.id === e.employeeId);
        exceptionRows.push([
          format(new Date(e.clockIn), 'yyyy-MM-dd'),
          `${emp?.firstName} ${emp?.lastName}`,
          'Missing Clock-Out',
          `Clocked in at ${format(new Date(e.clockIn), 'h:mm a')} - never clocked out`
        ].join(','));
      });
      
      // Pending Approvals
      weekEntries.filter(e => e.status === 'pending').forEach(e => {
        const emp = employees.find(emp => emp.id === e.employeeId);
        exceptionRows.push([
          format(new Date(e.clockIn), 'yyyy-MM-dd'),
          `${emp?.firstName} ${emp?.lastName}`,
          'Pending Approval',
          `${e.totalHours ? parseFloat(e.totalHours.toString()).toFixed(2) : 0}h awaiting approval`
        ].join(','));
      });
      
      return [headers.join(','), ...exceptionRows].join('\n');
    }
  };

  // Helper function to download CSV file
  const downloadCSV = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    const loadingSkeleton = (
      <>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-6 mb-6">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6" />
            <h1 className="text-xl font-bold">TimeTracker</h1>
          </div>
        </div>
        <MetricsCardsSkeleton count={3} columns={3} />
        <div className="mt-6">
          <TimelineSkeleton entries={5} />
        </div>
      </>
    );

    if (isMobile) {
      return (
        <WorkspaceLayout>
          {loadingSkeleton}
        </WorkspaceLayout>
      );
    }

    return (
      <WorkspaceLayout maxWidth="7xl">
        {loadingSkeleton}
      </WorkspaceLayout>
    );
  }

  const pageContent = (
    <div className="space-y-6">
        {/* Blue/Cyan Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 lg:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-6 h-6" />
                    <h1 className="text-lg lg:text-xl font-bold">TimeTracker</h1>
                  </div>
                  <p className="text-xs opacity-90 hidden lg:block">Universal Time Management</p>
                </div>
              </div>

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
              {canApprove && (
                <Button
                  variant="ghost"
                  onClick={() => setView('reports')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-white hover:bg-white hover:bg-opacity-20 ${
                    view === 'reports' ? 'bg-white bg-opacity-20' : ''
                  }`}
                  data-testid="button-nav-reports"
                >
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Reports
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6">
          {/* Clock View */}
          {view === 'clock' && (
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
                              onClick={() => startBreakMutation.mutate({ breakType: 'meal' })}
                              className="flex-1 bg-orange-600 text-white py-3 lg:py-6 rounded-lg font-bold hover:bg-orange-700"
                              data-testid="button-start-break"
                            >
                              <Coffee className="w-5 h-5 mr-2" />
                              Start Break
                            </Button>
                            <Button
                              onClick={() => activeEntry && handleClockOut(activeEntry.id)}
                              className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 text-white py-3 lg:py-6 rounded-lg font-bold hover:from-red-700 hover:to-rose-700 transition-all shadow-lg"
                              data-testid="button-clock-out"
                            >
                              <LogOut className="w-5 h-5 lg:w-6 lg:h-6 mr-2" />
                              Clock Out
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => endBreakMutation.mutate()}
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
                      <p className="text-xs text-gray-600">Today</p>
                      <p className="text-xl font-bold text-gray-900">{todayHours.toFixed(1)}h</p>
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
                          new Date(e.clockIn) >= startOfWeek(new Date())
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

              {/* Team Status (for managers) - uses gridEmployees for RBAC */}
              {(workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Team Status</h3>
                  <div className="space-y-3">
                    {gridEmployees.map((emp: Employee) => {
                      const empActiveEntry = timeEntries.find((e: TimeEntry) => 
                        e.employeeId === emp.id && !e.clockOut
                      );
                      // Break status would require a dedicated breaks table in the schema
                      // For now, using clocked_in status - breaks feature can be added as enhancement
                      const isOnBreak = false;
                      const status = empActiveEntry ? (isOnBreak ? 'on_break' : 'clocked_in') : 'clocked_out';
                      
                      const empTodayHours = timeEntries
                        .filter((e: TimeEntry) => {
                          const entryDate = new Date(e.clockIn).toDateString();
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
                              <p className="text-xs text-gray-600 capitalize">{emp.workspaceRole}</p>
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
                            <p className="text-sm text-gray-600 mt-1">{empTodayHours.toFixed(1)}h today</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timesheet View */}
          {view === 'timesheet' && (
            <div className="space-y-4">
              {/* Weekly Summary Card with Week Navigation */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setWeekOffset(weekOffset - 1)}
                      className="text-white hover:bg-white hover:bg-opacity-20"
                      data-testid="button-prev-week"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="text-center">
                      <h2 className="text-2xl font-bold mb-1">Weekly Timesheets</h2>
                      <p className="text-blue-100">
                        {format(gridWeekStart, 'MMM d')} - {format(gridWeekEnd, 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setWeekOffset(weekOffset + 1)}
                      className="text-white hover:bg-white hover:bg-opacity-20"
                      data-testid="button-next-week"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    {weekOffset !== 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setWeekOffset(0)}
                        className="text-white hover:bg-white hover:bg-opacity-20 ml-2"
                        data-testid="button-today-week"
                      >
                        Today
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-white bg-opacity-20 rounded-lg p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTimesheetViewMode('grid')}
                        className={`px-3 py-1 rounded ${timesheetViewMode === 'grid' ? 'bg-white text-blue-600' : 'text-white'}`}
                        data-testid="button-view-grid"
                      >
                        <LayoutGrid className="w-4 h-4 mr-1" />
                        Grid
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTimesheetViewMode('list')}
                        className={`px-3 py-1 rounded ${timesheetViewMode === 'list' ? 'bg-white text-blue-600' : 'text-white'}`}
                        data-testid="button-view-list"
                      >
                        <List className="w-4 h-4 mr-1" />
                        List
                      </Button>
                    </div>
                    <a
                      href={`/api/timesheets/export/csv?startDate=${gridWeekStart.toISOString()}&endDate=${gridWeekEnd.toISOString()}`}
                      className="inline-flex items-center px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors"
                      data-testid="button-export-csv"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      CSV
                    </a>
                    <a
                      href={`/api/timesheets/export/pdf?startDate=${gridWeekStart.toISOString()}&endDate=${gridWeekEnd.toISOString()}`}
                      className="inline-flex items-center px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors"
                      data-testid="button-export-pdf"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                  <div className="bg-white bg-opacity-10 rounded-lg p-4">
                    <p className="text-sm text-blue-100 mb-1">Total Hours</p>
                    <p className="text-3xl font-bold">
                      {employees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-lg p-4">
                    <p className="text-sm text-blue-100 mb-1">Regular Hours</p>
                    <p className="text-3xl font-bold">
                      {Math.min(employees.length * 40, employees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0)).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-lg p-4">
                    <p className="text-sm text-blue-100 mb-1">Overtime Hours</p>
                    <p className="text-3xl font-bold">
                      {employees.reduce((sum, emp) => sum + Math.max(0, getEmployeeWeekTotal(emp.id).total - 40), 0).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-lg p-4">
                    <p className="text-sm text-blue-100 mb-1">Employees</p>
                    <p className="text-3xl font-bold">{employees.length}</p>
                  </div>
                  <div className="bg-white bg-opacity-10 rounded-lg p-4">
                    <p className="text-sm text-blue-100 mb-1">Pending</p>
                    <p className="text-3xl font-bold">
                      {employees.reduce((sum, emp) => sum + (getEmployeeWeekTotal(emp.id).hasPending ? 1 : 0), 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* GetSling-style Weekly Grid View */}
              {timesheetViewMode === 'grid' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Bulk Actions Bar */}
                  {canApprove && bulkSelectedEmployees.size > 0 && (
                    <div className="bg-blue-50 border-b border-blue-200 p-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800">
                        {bulkSelectedEmployees.size} employee{bulkSelectedEmployees.size > 1 ? 's' : ''} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => bulkApproveMutation.mutate(Array.from(bulkSelectedEmployees))}
                          disabled={bulkApproveMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          data-testid="button-bulk-approve"
                        >
                          {bulkApproveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckSquare className="w-4 h-4 mr-2" />
                          )}
                          Approve All Selected
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setBulkSelectedEmployees(new Set())}
                          data-testid="button-clear-selection"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Grid Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {canApprove && (
                            <th className="px-3 py-3 text-left w-10">
                              <Checkbox
                                checked={bulkSelectedEmployees.size === gridEmployees.length && gridEmployees.length > 0}
                                onCheckedChange={selectAllEmployees}
                                data-testid="checkbox-select-all"
                              />
                            </th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase min-w-[180px]">Employee</th>
                          {gridDays.map((day, idx) => {
                            const isToday = day.toDateString() === new Date().toDateString();
                            const isWeekend = idx >= 5;
                            return (
                              <th 
                                key={idx} 
                                className={`px-2 py-3 text-center text-xs font-medium uppercase min-w-[80px] ${
                                  isToday ? 'bg-blue-100 text-blue-800' : 
                                  isWeekend ? 'bg-gray-100 text-gray-500' : 
                                  'text-gray-600'
                                }`}
                              >
                                <div>{format(day, 'EEE')}</div>
                                <div className="text-sm font-bold">{format(day, 'd')}</div>
                              </th>
                            );
                          })}
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase bg-gray-100 min-w-[80px]">Total</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase min-w-[100px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {gridEmployees.map((emp) => {
                          const weekData = getEmployeeWeekTotal(emp.id);
                          const isSelected = bulkSelectedEmployees.has(emp.id);
                          const isOvertime = weekData.total > 40;

                          return (
                            <tr key={emp.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`} data-testid={`timesheet-row-${emp.id}`}>
                              {canApprove && (
                                <td className="px-3 py-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleBulkSelect(emp.id)}
                                    data-testid={`checkbox-employee-${emp.id}`}
                                  />
                                </td>
                              )}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                    {emp.firstName?.[0]}{emp.lastName?.[0]}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">{emp.firstName} {emp.lastName}</p>
                                    <p className="text-xs text-gray-500 capitalize">{emp.workspaceRole || 'Employee'}</p>
                                  </div>
                                </div>
                              </td>
                              {gridDays.map((day, idx) => {
                                const dayData = getEmployeeDayData(emp.id, day);
                                const isToday = day.toDateString() === new Date().toDateString();
                                const isWeekend = idx >= 5;

                                return (
                                  <td 
                                    key={idx} 
                                    className={`px-2 py-3 text-center cursor-pointer hover-elevate transition-colors ${
                                      isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''
                                    }`}
                                    onClick={() => {
                                      if (dayData.entries.length > 0) {
                                        setSelectedDayDetail({ employee: emp, date: day, entries: dayData.entries });
                                      }
                                    }}
                                    data-testid={`cell-${emp.id}-${format(day, 'yyyy-MM-dd')}`}
                                  >
                                    {dayData.entries.length > 0 ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="font-bold text-gray-900 text-sm">{dayData.totalHours.toFixed(1)}h</span>
                                        <div className="flex items-center gap-0.5">
                                          {dayData.allApproved && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                          {dayData.hasPending && <Clock className="w-3.5 h-3.5 text-orange-500" />}
                                          {dayData.hasFlagged && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                          {dayData.hasActive && <PlayCircle className="w-3.5 h-3.5 text-blue-500 animate-pulse" />}
                                          {dayData.hasLateClockIn && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`px-4 py-3 text-center font-bold ${isOvertime ? 'text-red-600' : 'text-gray-900'}`}>
                                {weekData.total.toFixed(1)}h
                                {isOvertime && (
                                  <Badge variant="destructive" className="ml-1 text-xs">OT</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {weekData.hasPending && canApprove ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const pendingEntries = weekData.entries.filter(e => e.status === 'pending');
                                      pendingEntries.forEach(entry => approveMutation.mutate(entry.id));
                                    }}
                                    disabled={approveMutation.isPending}
                                    className="text-xs"
                                    data-testid={`button-approve-week-${emp.id}`}
                                  >
                                    Approve
                                  </Button>
                                ) : weekData.entries.length > 0 ? (
                                  <Badge variant="secondary" className="text-xs">
                                    {weekData.entries.every(e => e.status === 'approved') ? 'Approved' : 'Review'}
                                  </Badge>
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        <span>Approved</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-orange-500" />
                        <span>Pending</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <PlayCircle className="w-3.5 h-3.5 text-blue-500" />
                        <span>Active</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span>Flagged</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                        <span>Late Clock In</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* List View (Original) */}
              {timesheetViewMode === 'list' && (
                <>

              {/* Filters */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {(workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor') && (
                    <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                      <SelectTrigger data-testid="select-filter-employee">
                        <SelectValue placeholder="All Employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger data-testid="select-date-range">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="select-sort">
                      <SelectValue placeholder="Sort By" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Newest First</SelectItem>
                      <SelectItem value="date-asc">Oldest First</SelectItem>
                      <SelectItem value="employee">By Employee</SelectItem>
                    </SelectContent>
                  </Select>
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
                      {filteredTimeEntries.map((entry: TimeEntry) => {
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
                              {format(new Date(entry.clockIn), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {format(new Date(entry.clockIn), 'h:mm a')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
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
                  {filteredTimeEntries.map((entry: TimeEntry) => {
                    const employee = employees.find((e: Employee) => e.id === entry.employeeId);
                    return (
                      <div key={entry.id} className="p-4" data-testid={`entry-card-${entry.id}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-bold text-gray-900">{employee?.firstName} {employee?.lastName}</p>
                            <p className="text-sm text-gray-600">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                          </div>
                          <Badge variant={entry.status === 'approved' ? 'default' : 'secondary'}>
                            {entry.status || 'pending'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <p className="text-gray-600">Clock In</p>
                            <p className="font-medium text-gray-900">
                              {format(new Date(entry.clockIn), 'h:mm a')}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Clock Out</p>
                            <p className="font-medium text-gray-900">
                              {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
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
                </>
              )}

              {/* Day Detail Modal */}
              <Dialog open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {selectedDayDetail?.employee?.firstName?.[0]}{selectedDayDetail?.employee?.lastName?.[0]}
                      </div>
                      <div>
                        <div>{selectedDayDetail?.employee?.firstName} {selectedDayDetail?.employee?.lastName}</div>
                        <div className="text-sm font-normal text-gray-500">
                          {selectedDayDetail?.date && format(selectedDayDetail.date, 'EEEE, MMMM d, yyyy')}
                        </div>
                      </div>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Time entries for {selectedDayDetail?.employee?.firstName} {selectedDayDetail?.employee?.lastName} on {selectedDayDetail?.date && format(selectedDayDetail.date, 'MMMM d, yyyy')}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 mt-4">
                    {selectedDayDetail?.entries.map((entry, idx) => {
                      const shift = shifts.find(s => s.id === entry.shiftId);
                      const client = clients.find(c => c.id === entry.clientId);
                      const clockInTime = new Date(entry.clockIn);
                      const clockOutTime = entry.clockOut ? new Date(entry.clockOut) : null;

                      return (
                        <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                          {/* Entry Header */}
                          <div className="flex items-center justify-between">
                            <Badge 
                              variant={entry.status === 'approved' ? 'default' : entry.status === 'rejected' ? 'destructive' : 'secondary'}
                            >
                              {entry.status || 'Pending'}
                            </Badge>
                            <span className="text-lg font-bold">
                              {entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(2) : '0.00'}h
                            </span>
                          </div>

                          {/* Scheduled vs Actual */}
                          {shift && (
                            <div className="bg-gray-50 rounded-lg p-3 text-sm">
                              <p className="text-gray-600">
                                <span className="font-medium">Scheduled:</span> {format(new Date(shift.startTime), 'h:mm a')} - {format(new Date(shift.endTime), 'h:mm a')}
                              </p>
                            </div>
                          )}

                          {/* Clock In/Out Details */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-medium">Clock In</p>
                              <p className="font-bold">{format(clockInTime, 'h:mm a')}</p>
                              {entry.clockInGpsLatitude && (
                                <div className="flex items-center gap-1 text-xs text-green-600">
                                  <MapPin className="w-3 h-3" />
                                  <span>GPS Verified</span>
                                </div>
                              )}
                              {entry.clockInPhotoUrl && (
                                <div className="flex items-center gap-1 text-xs text-blue-600">
                                  <Camera className="w-3 h-3" />
                                  <span>Photo Verified</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-medium">Clock Out</p>
                              {clockOutTime ? (
                                <>
                                  <p className="font-bold">{format(clockOutTime, 'h:mm a')}</p>
                                  {entry.clockOutGpsLatitude && (
                                    <div className="flex items-center gap-1 text-xs text-green-600">
                                      <MapPin className="w-3 h-3" />
                                      <span>GPS Verified</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-orange-600 font-medium">Still Active</p>
                              )}
                            </div>
                          </div>

                          {/* Client Info */}
                          {client && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Users className="w-4 h-4" />
                              <span>{client.companyName}</span>
                            </div>
                          )}

                          {/* Notes */}
                          {entry.notes && (
                            <div className="text-sm text-gray-600 italic bg-gray-50 rounded p-2">
                              {entry.notes}
                            </div>
                          )}

                          {/* Actions */}
                          {canApprove && entry.status === 'pending' && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                size="sm"
                                onClick={() => {
                                  approveMutation.mutate(entry.id);
                                }}
                                disabled={approveMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                data-testid={`button-approve-day-${entry.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRejectingEntryId(entry.id);
                                  setRejectDialogOpen(true);
                                  setSelectedDayDetail(null);
                                }}
                                data-testid={`button-flag-day-${entry.id}`}
                              >
                                <AlertTriangle className="w-4 h-4 mr-1" />
                                Flag Issue
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedEntry(entry);
                                  setSelectedDayDetail(null);
                                }}
                                data-testid={`button-edit-day-${entry.id}`}
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Summary */}
                    {selectedDayDetail && selectedDayDetail.entries.length > 0 && (
                      <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
                        <span className="font-medium text-blue-800">Day Total</span>
                        <span className="text-2xl font-bold text-blue-900">
                          {selectedDayDetail.entries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(2)}h
                        </span>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Approvals View */}
          {view === 'approvals' && canApprove && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Pending Approvals ({timeEntries.filter((e: TimeEntry) => e.status === 'pending').length})
                </h3>

                <div className="space-y-4">
                  {timeEntries.filter((e: TimeEntry) => e.status === 'pending').map((entry: TimeEntry) => {
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
                                <p className="text-sm text-gray-600">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                              <div>
                                <p className="text-gray-600">In: {format(new Date(entry.clockIn), 'h:mm a')}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">
                                  Out: {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
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
                              onClick={() => approveMutation.mutate(entry.id)}
                              className="flex-1 lg:flex-none bg-green-600 text-white hover:bg-green-700"
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${entry.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => {
                                setRejectingEntryId(entry.id);
                                setRejectDialogOpen(true);
                              }}
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

                  {timeEntries.filter((e: TimeEntry) => e.status === 'pending').length === 0 && (
                    <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">All caught up!</p>
                      <p className="text-sm text-gray-500">No pending approvals</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Approvals View */}
          {view === 'approvals' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Pending Approvals</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {pendingApprovals} {pendingApprovals === 1 ? 'entry' : 'entries'} awaiting review
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg">
                    <CheckCircle className="w-5 h-5 inline mr-2" />
                    <span className="font-semibold">{pendingApprovals}</span>
                  </div>
                </div>

                {/* Pending Entries List */}
                <div className="space-y-3">
                  {timeEntries
                    .filter((entry: TimeEntry) => entry.status === 'pending')
                    .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())
                    .map((entry: TimeEntry) => {
                      const employee = employees.find(e => e.id === entry.employeeId);
                      const client = clients.find(c => c.id === entry.clientId);
                      const duration = entry.totalHours 
                        ? `${parseFloat(entry.totalHours.toString()).toFixed(2)}h`
                        : 'Ongoing';

                      return (
                        <div key={entry.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors" data-testid={`approval-entry-${entry.id}`}>
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                  {employee?.firstName?.[0]}{employee?.lastName?.[0]}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{employee?.firstName} {employee?.lastName}</p>
                                  <p className="text-sm text-gray-600">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mt-3">
                                <div>
                                  <p className="text-xs text-gray-500">Clock In</p>
                                  <p className="text-sm font-medium text-gray-900">{format(new Date(entry.clockIn), 'h:mm a')}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Clock Out</p>
                                  <p className="text-sm font-medium text-gray-900">
                                    {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : 'Active'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Duration</p>
                                  <p className="text-sm font-medium text-gray-900">{duration}</p>
                                </div>
                                {client && (
                                  <div>
                                    <p className="text-xs text-gray-500">Client</p>
                                    <p className="text-sm font-medium text-gray-900">{client.companyName || `${client.firstName} ${client.lastName}`}</p>
                                  </div>
                                )}
                              </div>

                              {entry.notes && (
                                <div className="mt-3 p-2 bg-gray-50 rounded-md">
                                  <p className="text-xs text-gray-500 mb-1">Notes:</p>
                                  <p className="text-sm text-gray-700 italic">{entry.notes}</p>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 lg:min-w-[120px]">
                              <Button
                                onClick={() => approveMutation.mutate(entry.id)}
                                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-${entry.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => {
                                  setRejectingEntryId(entry.id);
                                  setRejectDialogOpen(true);
                                }}
                                className="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-700 hover:to-rose-700"
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

                  {pendingApprovals === 0 && (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                      <p className="text-gray-600">No pending time entries to review</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reports View */}
          {view === 'reports' && canApprove && (
            <div className="space-y-6">
              {/* Report Header */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Time & Attendance Reports</h2>
                    <p className="text-sm text-gray-600">Generate reports for labor cost, overtime, and exceptions</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const data = generateReportData('labor');
                        downloadCSV(data, `labor-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
                        toast({ title: 'Report Downloaded', description: 'Labor cost report exported to CSV' });
                      }}
                      data-testid="button-export-labor"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Labor Report
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const data = generateReportData('overtime');
                        downloadCSV(data, `overtime-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
                        toast({ title: 'Report Downloaded', description: 'Overtime report exported to CSV' });
                      }}
                      data-testid="button-export-overtime"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Overtime
                    </Button>
                  </div>
                </div>
              </div>

              {/* Report Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Labor Cost Summary */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="font-bold text-gray-900">Labor Cost</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total Hours (Week)</span>
                      <span className="font-bold text-gray-900" data-testid="text-report-total-hours">
                        {timeEntries.filter(e => {
                          const entryDate = new Date(e.clockIn);
                          return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                        }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Regular Hours</span>
                      <span className="font-medium text-gray-900" data-testid="text-report-regular-hours">
                        {Math.min(
                          timeEntries.filter(e => {
                            const entryDate = new Date(e.clockIn);
                            return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                          }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0),
                          40 * gridEmployees.length
                        ).toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Overtime Hours</span>
                      <span className="font-medium text-orange-600" data-testid="text-report-overtime-hours">
                        {Math.max(0, 
                          timeEntries.filter(e => {
                            const entryDate = new Date(e.clockIn);
                            return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                          }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0) - (40 * gridEmployees.length)
                        ).toFixed(1)}h
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Est. Labor Cost</span>
                        <span className="text-lg font-bold text-green-600" data-testid="text-report-labor-cost">
                          ${(timeEntries.filter(e => {
                            const entryDate = new Date(e.clockIn);
                            return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                          }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0) * 18).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Based on avg $18/hr</p>
                    </div>
                  </div>
                </div>

                {/* Overtime Summary */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-orange-600" />
                    </div>
                    <h3 className="font-bold text-gray-900">Overtime Analysis</h3>
                  </div>
                  <div className="space-y-3">
                    {gridEmployees.map(emp => {
                      const weekTotal = getEmployeeWeekTotal(emp.id);
                      const isOvertime = weekTotal.total > 40;
                      if (!isOvertime) return null;
                      return (
                        <div key={emp.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg" data-testid={`overtime-employee-${emp.id}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {emp.firstName?.[0]}{emp.lastName?.[0]}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{emp.firstName} {emp.lastName}</span>
                          </div>
                          <span className="text-sm font-bold text-orange-600">
                            +{(weekTotal.total - 40).toFixed(1)}h OT
                          </span>
                        </div>
                      );
                    })}
                    {gridEmployees.every(emp => getEmployeeWeekTotal(emp.id).total <= 40) && (
                      <div className="text-center py-4 text-gray-500">
                        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No overtime this week</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exceptions Summary */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertOctagon className="w-5 h-5 text-red-600" />
                    </div>
                    <h3 className="font-bold text-gray-900">Exceptions</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm text-gray-700">Late Clock-Ins</span>
                      </div>
                      <span className="font-bold text-yellow-600" data-testid="text-exception-late-clockins">
                        {timeEntries.filter(e => {
                          const shift = shifts.find(s => s.id === e.shiftId);
                          if (!shift) return false;
                          const clockIn = new Date(e.clockIn);
                          const shiftStart = new Date(shift.startTime);
                          return (clockIn.getTime() - shiftStart.getTime()) > 5 * 60 * 1000;
                        }).length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-sm text-gray-700">Flagged Entries</span>
                      </div>
                      <span className="font-bold text-red-600" data-testid="text-exception-flagged">
                        {timeEntries.filter(e => e.status === 'rejected' || e.status === 'flagged').length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <PlayCircle className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-700">Missing Clock-Outs</span>
                      </div>
                      <span className="font-bold text-blue-600" data-testid="text-exception-missing-clockouts">
                        {timeEntries.filter(e => !e.clockOut && new Date(e.clockIn) < new Date(Date.now() - 12 * 60 * 60 * 1000)).length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-purple-500" />
                        <span className="text-sm text-gray-700">Pending Approvals</span>
                      </div>
                      <span className="font-bold text-purple-600" data-testid="text-exception-pending">
                        {pendingApprovals}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Employee Report Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-gray-900">Employee Weekly Summary</h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      Week of {format(gridWeekStart, 'MMM d')} - {format(gridWeekEnd, 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Total Hours</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Regular</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Overtime</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Est. Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {gridEmployees.map(emp => {
                        const weekTotal = getEmployeeWeekTotal(emp.id);
                        const regularHours = Math.min(weekTotal.total, 40);
                        const overtimeHours = Math.max(0, weekTotal.total - 40);
                        const estPay = (regularHours * 18) + (overtimeHours * 27);
                        
                        return (
                          <tr key={emp.id} className="hover:bg-gray-50" data-testid={`report-row-${emp.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                  {emp.firstName?.[0]}{emp.lastName?.[0]}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">{emp.firstName} {emp.lastName}</p>
                                  <p className="text-xs text-gray-500 capitalize">{emp.workspaceRole || 'Employee'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-gray-900">
                              {weekTotal.total.toFixed(1)}h
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">
                              {regularHours.toFixed(1)}h
                            </td>
                            <td className="px-4 py-3 text-center">
                              {overtimeHours > 0 ? (
                                <span className="text-orange-600 font-medium">{overtimeHours.toFixed(1)}h</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {weekTotal.hasPending ? (
                                <Badge variant="secondary">Pending</Badge>
                              ) : weekTotal.entries.some(e => e.status === 'rejected' || e.status === 'flagged') ? (
                                <Badge variant="destructive">Issue</Badge>
                              ) : weekTotal.entries.length > 0 ? (
                                <Badge variant="default">Approved</Badge>
                              ) : (
                                <Badge variant="outline">No Hours</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-green-600">
                              ${estPay.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td className="px-4 py-3 font-bold text-gray-900">Totals</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">
                          {gridEmployees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0).toFixed(1)}h
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">
                          {gridEmployees.reduce((sum, emp) => sum + Math.min(getEmployeeWeekTotal(emp.id).total, 40), 0).toFixed(1)}h
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-orange-600">
                          {gridEmployees.reduce((sum, emp) => sum + Math.max(0, getEmployeeWeekTotal(emp.id).total - 40), 0).toFixed(1)}h
                        </td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-center font-bold text-green-600">
                          ${gridEmployees.reduce((sum, emp) => {
                            const weekTotal = getEmployeeWeekTotal(emp.id);
                            const regularHours = Math.min(weekTotal.total, 40);
                            const overtimeHours = Math.max(0, weekTotal.total - 40);
                            return sum + (regularHours * 18) + (overtimeHours * 27);
                          }, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
          <div className={`grid h-16 ${canApprove ? 'grid-cols-4' : 'grid-cols-2'}`}>
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
              <>
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
                    <span className="absolute top-1 right-3 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {pendingApprovals}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView('reports')}
                  className={`flex flex-col items-center justify-center ${
                    view === 'reports' ? 'text-blue-600' : 'text-gray-600'
                  }`}
                  data-testid="button-mobile-nav-reports"
                >
                  <BarChart2 className="w-5 h-5 mb-1" />
                  <span className="text-xs">Reports</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Clock In Dialog */}
        <Dialog open={clockInDialogOpen} onOpenChange={setClockInDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              <DialogTitle>Clock In - Verification Required</DialogTitle>
              <DialogDescription className="text-white/90">
                GPS and photo verification for accurate time tracking
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {/* Employee Selection - Hide for staff role (RBAC enforcement) */}
              {workspaceRole !== 'staff' && (
                <div>
                  <Label>Employee *</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger data-testid="select-employee">
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
              {workspaceRole === 'staff' && currentEmployee && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <Label className="text-blue-900">Employee</Label>
                  <p className="font-bold text-blue-900">{currentEmployee.firstName} {currentEmployee.lastName}</p>
                </div>
              )}

              {/* GPS Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <Label>GPS Location</Label>
                  </div>
                  {isCapturingGPS && (
                    <Badge variant="secondary">Capturing...</Badge>
                  )}
                </div>
                {gpsData ? (
                  <div className="text-sm text-green-600 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Location verified ({Math.round(gpsData.accuracy)}m accuracy)</span>
                  </div>
                ) : gpsError ? (
                  <div className="text-sm text-red-600 flex items-center space-x-2">
                    <XCircle className="w-4 h-4" />
                    <span>{gpsError}</span>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Waiting for GPS...</div>
                )}
                {!gpsData && !isCapturingGPS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => captureGPS()}
                    className="mt-2"
                    data-testid="button-retry-gps"
                  >
                    Retry GPS Capture
                  </Button>
                )}
              </div>

              {/* Photo Capture */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Camera className="w-5 h-5 text-blue-600" />
                  <Label>Verification Photo</Label>
                </div>
                
                {!capturedPhoto ? (
                  <div>
                    {isCameraActive ? (
                      <div className="space-y-2">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full rounded-lg"
                        />
                        <Button
                          variant="default"
                          onClick={capturePhoto}
                          className="w-full"
                          data-testid="button-capture-photo"
                        >
                          Capture Photo
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={startCamera}
                        className="w-full"
                        data-testid="button-start-camera"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Start Camera
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <img
                      src={capturedPhoto}
                      alt="Captured"
                      className="w-full rounded-lg object-cover max-h-48"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCapturedPhoto(null);
                        startCamera();
                      }}
                      className="w-full"
                      data-testid="button-retake-photo"
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Optional Fields */}
              <div>
                <Label>Client (Optional)</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger data-testid="select-client">
                    <SelectValue placeholder="Select client (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName || `${client.firstName} ${client.lastName}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes (Optional)</Label>
                <Textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about your shift..."
                  data-testid="input-notes"
                />
              </div>

              <Button 
                onClick={handleClockIn} 
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                disabled={clockInMutation.isPending || !gpsData || !capturedPhoto || !selectedEmployee}
                data-testid="button-confirm-clock-in"
              >
                {clockInMutation.isPending ? "Clocking In..." : "Confirm Clock In"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Entry Details Dialog */}
        <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              <DialogTitle>Timesheet Entry Details</DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <div className="space-y-4 mt-4">
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">
                    {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.firstName}{' '}
                    {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.lastName}
                  </h4>
                  <p className="text-sm text-gray-600">{format(new Date(selectedEntry.clockIn), 'MMMM dd, yyyy')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Clock In</Label>
                    <p className="text-gray-900 font-medium">{format(new Date(selectedEntry.clockIn), 'h:mm a')}</p>
                  </div>
                  <div>
                    <Label>Clock Out</Label>
                    <p className="text-gray-900 font-medium">
                      {selectedEntry.clockOut ? format(new Date(selectedEntry.clockOut), 'h:mm a') : 'Active'}
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
                      <Badge variant={selectedEntry.status === 'approved' ? 'default' : selectedEntry.status === 'rejected' ? 'destructive' : 'secondary'}>
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

                {selectedEntry.clockInPhotoUrl && (
                  <div>
                    <Label>Clock In Photo</Label>
                    <img src={selectedEntry.clockInPhotoUrl} alt="Clock in verification" className="mt-2 rounded-lg max-h-64 w-full object-cover" />
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Clock Out Dialog */}
        <Dialog open={clockOutDialogOpen} onOpenChange={setClockOutDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="bg-gradient-to-r from-red-600 to-rose-600 text-white -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              <DialogTitle>Clock Out - Verification Required</DialogTitle>
              <DialogDescription className="text-white/90">
                GPS and photo verification for accurate time tracking
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {/* GPS Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-red-600" />
                    <Label>GPS Location</Label>
                  </div>
                  {isCapturingGPS && (
                    <Badge variant="secondary">Capturing...</Badge>
                  )}
                </div>
                {gpsData ? (
                  <div className="text-sm text-green-600 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Location verified ({Math.round(gpsData.accuracy)}m accuracy)</span>
                  </div>
                ) : gpsError ? (
                  <div className="text-sm text-red-600 flex items-center space-x-2">
                    <XCircle className="w-4 h-4" />
                    <span>{gpsError}</span>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Waiting for GPS...</div>
                )}
                {!gpsData && !isCapturingGPS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => captureGPS()}
                    className="mt-2"
                    data-testid="button-retry-gps-clockout"
                  >
                    Retry GPS Capture
                  </Button>
                )}
              </div>

              {/* Photo Capture */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Camera className="w-5 h-5 text-red-600" />
                  <Label>Verification Photo</Label>
                </div>
                
                {!capturedPhoto ? (
                  <div>
                    {isCameraActive ? (
                      <div className="space-y-2">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full rounded-lg"
                        />
                        <Button
                          variant="default"
                          onClick={capturePhoto}
                          className="w-full"
                          data-testid="button-capture-photo-clockout"
                        >
                          Capture Photo
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={startCamera}
                        className="w-full"
                        data-testid="button-start-camera-clockout"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Start Camera
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <img
                      src={capturedPhoto}
                      alt="Captured"
                      className="w-full rounded-lg object-cover max-h-48"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCapturedPhoto(null);
                        startCamera();
                      }}
                      className="w-full"
                      data-testid="button-retake-photo-clockout"
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <Button 
                onClick={handleConfirmClockOut} 
                className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700"
                disabled={clockOutMutation.isPending || !gpsData || !capturedPhoto}
                data-testid="button-confirm-clock-out"
              >
                {clockOutMutation.isPending ? "Clocking Out..." : "Confirm Clock Out"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog with Validation */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Time Entry</DialogTitle>
              <DialogDescription>Please provide a reason for rejection (required)</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                data-testid="input-reject-reason"
                className={rejectReason.trim() === "" && rejectReason.length > 0 ? "border-red-500" : ""}
              />
              {rejectReason.trim() === "" && rejectReason.length > 0 && (
                <p className="text-sm text-red-600">Reason cannot be empty</p>
              )}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setRejectDialogOpen(false);
                    setRejectReason("");
                  }}
                  className="flex-1"
                  data-testid="button-cancel-reject"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (rejectingEntryId && rejectReason.trim()) {
                      rejectMutation.mutate({ timeEntryId: rejectingEntryId, reason: rejectReason.trim() });
                    }
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  data-testid="button-confirm-reject"
                >
                  {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );

  if (isMobile) {
    return (
      <WorkspaceLayout>
        {pageContent}
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout maxWidth="7xl">
      {pageContent}
    </WorkspaceLayout>
  );
}
