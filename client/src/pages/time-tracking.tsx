import { useState, useEffect, useMemo, useRef } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTrinityAnnouncement } from "@/hooks/use-trinity-announcement";
import { DsPageWrapper, DsPageHeader, DsStatCard, DsTabBar, DsDataRow, DsSectionCard, DsBadge, DsButton, DsInput } from "@/components/ui/ds-components";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalBody, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { DialogStyledHeader } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {Eye, Clock, Play, Square, Calendar, Users, Edit2, Check, X, Bell, History,
  MapPin, Camera, LogOut, LogIn, Download, Filter, ChevronDown, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, XCircle, Eye, Shield, Coffee, PlayCircle, Menu, Home, ArrowLeft,
  LayoutGrid, List, CheckSquare, AlertTriangle, Loader2, BarChart2, FileText, DollarSign,
  TrendingUp, AlertOctagon, FileSpreadsheet, Search, Upload
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { apiPost, apiGet } from "@/lib/apiClient";
import { fetchWithOfflineFallback } from "@/lib/offlineQueue";
import { markCoreActionPerformed } from "@/lib/pushNotifications";
import { queryKeys } from "@/config/queryKeys";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useLocation } from "wouter";
import { TimelineSkeleton, MetricsCardsSkeleton } from "@/components/loading-indicators/skeletons";
import { useSimpleMode } from "@/contexts/SimpleModeContext";
import { useClientLookup } from "@/hooks/useClients";
import { ToastAction } from "@/components/ui/toast";


export default function TimeTracking() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const trinity = useTrinityAnnouncement();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isMobile = useIsMobile();
  const { isSimpleMode } = useSimpleMode();
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
  const [teamStatusSearch, setTeamStatusSearch] = useState("");
  const [teamStatusFilter, setTeamStatusFilter] = useState("all");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/login");
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

  // Auto-redirect from reports view when Simple Mode is active
  useEffect(() => {
    if (isSimpleMode && view === 'reports') {
      setView('clock');
    }
  }, [isSimpleMode, view]);

  const { data: _empResp, isError: employeesError, error: employeesErrorObj, refetch: refetchEmployees } = useQuery<{ data: Employee[] }>({
    queryKey: queryKeys.employees.all,
    queryFn: () => apiGet('employees.list'),
    enabled: isAuthenticated,
  });
  const employees = _empResp?.data ?? [];

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
        action: <ToastAction altText="Retry" onClick={() => refetchEmployees()} data-testid="button-retry-employees">Retry</ToastAction>,
      });
    }
    if (shiftsError && shiftsErrorObj) {
      toast({
        title: "Failed to Load Shifts",
        description: "Unable to fetch shift data. Please try again.",
        variant: "destructive",
        action: <ToastAction altText="Retry" onClick={() => refetchShifts()} data-testid="button-retry-shifts">Retry</ToastAction>,
      });
    }
    if (entriesError && entriesErrorObj) {
      toast({
        title: "Failed to Load Time Entries",
        description: "Unable to fetch time tracking data. Please try again.",
        variant: "destructive",
        action: <ToastAction altText="Retry" onClick={() => refetchEntries()} data-testid="button-retry-entries">Retry</ToastAction>,
      });
    }
  }, [employeesError, employeesErrorObj, shiftsError, shiftsErrorObj, entriesError, entriesErrorObj, toast, refetchEmployees, refetchShifts, refetchEntries]);

  // Get current user's employee record to determine role
  const currentEmployee = employees.find(emp => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'staff';

  // Roles that can clock in OTHER employees (proxy clock-in)
  const canClockInOthers = ['org_owner', 'co_owner', 'department_manager', 'supervisor', 'field_supervisor', 'manager'].includes(workspaceRole);

  // Auto-select current employee for non-manager roles (RBAC enforcement)
  // Only run once when currentEmployee becomes available
  useEffect(() => {
    if (currentEmployee && !canClockInOthers && !selectedEmployee) {
      setSelectedEmployee(currentEmployee.id);
    }
  }, [currentEmployee, canClockInOthers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Role-based filtering: employees see only their own entries
  // Add null safety in case API returns error instead of array
  const timeEntries = useMemo(() => {
    const entries = Array.isArray(allTimeEntries) ? allTimeEntries : [];
    if (workspaceRole === 'staff') {
      return entries.filter(entry => entry.employeeId === currentEmployee?.id);
    }
    return entries;
  }, [allTimeEntries, workspaceRole, currentEmployee]);

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
      const result = await fetchWithOfflineFallback(
        '/api/time-entries/clock-in',
        'POST',
        { ...data, timestamp: new Date().toISOString() },
        'clock-in'
      );
      if (result.queued) return { queued: true };
      if (result.response && !result.response.ok) {
        const text = await result.response.text();
        throw new Error(text || 'Failed to clock in');
      }
      return result.response ? await result.response.json() : {};
    },
    onSuccess: (result: any) => {
      markCoreActionPerformed();
      if (result?.queued) {
        trinity.info("You're offline. Your clock-in has been saved and will sync when connected.", "Queued Offline");
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
        trinity.success("You're now on the clock! Time tracking has started with GPS verification.", "Clocked In");
      }
      setClockInDialogOpen(false);
      if (!canClockInOthers && currentEmployee) {
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
      setCameraPermissionDenied(false);
      setCameraSupported(true);
      stopCamera();
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to clock in. Please try again.", "Clock In Failed");
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
      const result = await fetchWithOfflineFallback(
        `/api/time-entries/${data.timeEntryId}/clock-out`,
        'PATCH',
        { ...data, timestamp: new Date().toISOString() },
        'clock-out'
      );
      if (result.queued) return { queued: true };
      if (result.response && !result.response.ok) {
        const text = await result.response.text();
        throw new Error(text || 'Failed to clock out');
      }
      return result.response ? await result.response.json() : {};
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        trinity.info("You're offline. Your clock-out has been saved and will sync when connected.", "Queued Offline");
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
        trinity.success("Great work! Your time entry has been recorded successfully.", "Clocked Out");
      }
      setClockOutDialogOpen(false);
      setClockingOutEntryId(null);
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
      setCameraPermissionDenied(false);
      setCameraSupported(true);
      stopCamera();
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to clock out. Please try again.", "Clock Out Failed");
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: (data: { entryId: string; breakType: 'meal' | 'rest' }) => {
      return apiRequest('POST', `/api/time-entries/${data.entryId}/start-break`, { breakType: data.breakType })
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.message); }); return r.json(); });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      trinity.info(`Enjoy your ${variables.breakType === 'meal' ? 'meal' : 'rest'} break! Take your time.`, "Break Started");
    },
    onError: (error: any) => {
      trinity.error(error.message || "Failed to start break. Please try again.", "Break Start Failed");
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: (entryId: string) => {
      return apiRequest('POST', `/api/time-entries/${entryId}/end-break`)
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.message); }); return r.json(); });
    },
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

  // GPS Capture Function — required for clock-in/out
  const captureGPS = async (): Promise<{ latitude: number; longitude: number; accuracy: number } | null> => {
    if (!navigator.geolocation) {
      setGpsError("GPS is not supported on this device. Please use a mobile device with location services enabled.");
      return null;
    }

    setIsCapturingGPS(true);
    setGpsError(null);

    // Do NOT pre-check permission state — always call getCurrentPosition directly.
    // This ensures the native browser permission prompt is triggered on first use.
    // PERMISSION_DENIED errors are handled in the error callback below.

    return new Promise((resolve) => {
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
              title: "GPS Signal Weak",
              description: `Location captured with ${Math.round(gps.accuracy)}m accuracy. Move outdoors for better signal.`,
            });
          }

          resolve(gps);
        },
        (error) => {
          setIsCapturingGPS(false);
          switch (error.code) {
            case error.PERMISSION_DENIED:
              // User denied the native prompt — set sentinel so UI shows settings guidance, no toast
              setGpsError("denied");
              break;
            case error.POSITION_UNAVAILABLE:
              setGpsError("unavailable");
              toast({ title: "No GPS Signal", description: "Location signal unavailable. Ensure Location Services are on, then tap Retry GPS.", variant: "destructive" });
              break;
            case error.TIMEOUT:
              setGpsError("timeout");
              toast({ title: "GPS Timeout", description: "GPS timed out. Move to an area with better signal and tap Retry GPS.", variant: "destructive" });
              break;
            default:
              setGpsError("error");
              toast({ title: "GPS Error", description: "Unable to get your location. Tap Retry GPS.", variant: "destructive" });
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);

  const checkCameraSupport = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraSupported(false);
      return false;
    }
    return true;
  };

  const startCamera = async () => {
    if (!checkCameraSupport()) return;

    setCameraPermissionDenied(false);

    // Do NOT pre-check permission state — always call getUserMedia directly.
    // This ensures the native browser permission prompt fires on first use.
    // NotAllowedError is caught below and sets the denied guidance UI.

    try {
      setIsCameraLoading(true);
      // Try rear-facing camera first (preferred for field officers)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setIsCameraLoading(false);
        setIsCameraActive(true);
      }
    } catch (error: any) {
      setIsCameraLoading(false);

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        // User denied the native browser prompt — show settings guide, no toast
        setCameraPermissionDenied(true);
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setCameraSupported(false);
        toast({ title: "No Camera Found", description: "No camera detected. Use 'Upload Photo' to select or capture an image.", variant: "destructive" });
      } else if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
        // Rear camera constraint failed — fall back to any camera
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => setIsCameraLoading(false);
            setIsCameraActive(true);
          }
        } catch (fallbackErr: any) {
          if (fallbackErr.name === "NotAllowedError" || fallbackErr.name === "PermissionDeniedError") {
            setCameraPermissionDenied(true);
          } else {
            setCameraSupported(false);
            toast({ title: "Camera Unavailable", description: "Camera could not be started. Use 'Upload Photo' to capture an image.", variant: "destructive" });
          }
        }
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        toast({ title: "Camera In Use", description: "Camera is being used by another app. Close other apps and tap 'Start Camera' again, or use 'Upload Photo'.", variant: "destructive" });
      } else {
        toast({ title: "Camera Error", description: "Camera could not be started. Use 'Upload Photo' to capture an image.", variant: "destructive" });
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid File",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image under 10MB.",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedPhoto(e.target?.result as string);
        toast({
          title: "Photo Selected",
          description: "Verification photo loaded successfully",
        });
      };
      reader.onerror = () => {
        toast({
          title: "Upload Error",
          description: "Failed to read the selected image. Please try again.",
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  useEffect(() => {
    if (clockInDialogOpen || clockOutDialogOpen) {
      // GPS is auto-started because it takes time to acquire.
      // Camera is NOT auto-started — the user taps "Start Camera" so the
      // native browser permission prompt is clearly associated with that action.
      captureGPS();
    }
    return () => {
      stopCamera();
    };
  }, [clockInDialogOpen, clockOutDialogOpen]);

  useEffect(() => {
    checkCameraSupport();
  }, []);

  const handleClockIn = () => {
    if (!selectedEmployee) {
      toast({
        title: "Employee Required",
        description: "Please select an employee to clock in",
        variant: "destructive",
      });
      return;
    }

    if (!gpsData) {
      toast({
        title: "GPS Required",
        description: "Location must be captured before clocking in. Check GPS status above.",
        variant: "destructive",
      });
      return;
    }

    if (!capturedPhoto) {
      toast({
        title: "Photo Required",
        description: "A verification photo must be taken before clocking in.",
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
        description: "Location must be captured before clocking out. Check GPS status above.",
        variant: "destructive",
      });
      return;
    }

    if (!capturedPhoto) {
      toast({
        title: "Photo Required",
        description: "A verification photo must be taken before clocking out.",
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
  const canApprove = workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor';

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
        <div className="hidden lg:flex rounded-lg p-5 mb-6 items-center gap-3" style={{ background: 'var(--ds-navy-mid)', border: '1px solid var(--ds-border)' }}>
          <Clock className="w-6 h-6" style={{ color: 'var(--ds-gold)' }} />
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--ds-text-primary)' }}>TimeTracker</h1>
        </div>
        <MetricsCardsSkeleton count={3} columns={3} />
        <div className="mt-6">
          <TimelineSkeleton entries={5} />
        </div>
      </>
    );

    return (
      <DsPageWrapper>
        {loadingSkeleton}
      </DsPageWrapper>
    );
  }

  const pageContent = (
    <div className="space-y-0 pb-20 lg:pb-6">
        {/* Page Header — desktop */}
        <div className="hidden lg:block px-4 pt-4">
          <DsPageHeader
            title="TimeTracker"
            subtitle="Universal Time Management"
            actions={
              <div className="flex items-center gap-2">
                {activeEntry && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--ds-success)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Clocked In
                  </span>
                )}
                <span className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg" style={{ background: 'var(--ds-navy-mid)', color: 'var(--ds-text-secondary)', border: '1px solid var(--ds-border)' }}>
                  <Shield className="w-4 h-4" />
                  <span>{currentEmployee?.firstName} {currentEmployee?.lastName}</span>
                  <span className="capitalize text-xs opacity-70">{workspaceRole}</span>
                </span>
              </div>
            }
          />
          {/* Desktop Navigation Tabs */}
          <div className="mb-4">
            <DsTabBar
              tabs={[
                { id: 'clock', label: 'Clock In/Out' },
                { id: 'timesheet', label: 'Timesheets' },
                ...(canApprove ? [{ id: 'approvals', label: 'Approvals', count: pendingApprovals > 0 ? pendingApprovals : undefined }] : []),
                ...(canApprove && !isSimpleMode ? [{ id: 'reports', label: 'Reports' }] : []),
              ]}
              activeTab={view}
              onTabChange={(id) => setView(id as any)}
            />
          </div>
        </div>

        {/* Mobile sticky tab bar — sits in normal flow, no z-conflict with global nav */}
        <div className="lg:hidden sticky top-0 z-20 bg-background/98 backdrop-blur-xl border-b border-border">
          <div className="flex items-center h-12 px-2 gap-1">
            <button
              onClick={() => setView('clock')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-medium transition-colors ${view === 'clock' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
              data-testid="button-mobile-nav-clock"
            >
              <Clock className="w-4 h-4 shrink-0" />
              Clock
            </button>
            <button
              onClick={() => setView('timesheet')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-medium transition-colors ${view === 'timesheet' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
              data-testid="button-mobile-nav-timesheet"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              Timesheets
            </button>
            {canApprove && (
              <>
                <button
                  onClick={() => setView('approvals')}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-medium transition-colors relative ${view === 'approvals' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                  data-testid="button-mobile-nav-approvals"
                >
                  <div className="relative">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {pendingApprovals > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] bg-orange-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold px-0.5">
                        {pendingApprovals > 99 ? '99+' : pendingApprovals}
                      </span>
                    )}
                  </div>
                  Approve
                </button>
                {!isSimpleMode && (
                  <button
                    onClick={() => setView('reports')}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-medium transition-colors ${view === 'reports' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                    data-testid="button-mobile-nav-reports"
                  >
                    <BarChart2 className="w-4 h-4 shrink-0" />
                    Reports
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className={isMobile ? "px-4 py-4 space-y-3" : "max-w-7xl mx-auto px-4 py-4 lg:py-6"}>
          {/* Clock View */}
          {view === 'clock' && (
            <div className={isMobile ? "space-y-3" : "space-y-4 lg:space-y-6"}>

              {/* ── MOBILE Clock Widget ─────────────────────────────────────── */}
              {isMobile ? (
                <div className="space-y-3">
                  {/* Status Hero Widget */}
                  <div className={`rounded-2xl overflow-hidden shadow-sm border ${
                    currentlyClocked
                      ? onBreak
                        ? 'border-orange-200 dark:border-orange-800/50'
                        : 'border-emerald-200 dark:border-emerald-800/50'
                      : 'border-border'
                  }`}>
                    {/* Status top strip */}
                    <div
                      className="h-1.5 w-full"
                      style={{
                        background: currentlyClocked
                          ? onBreak ? 'var(--ds-warning)' : 'var(--ds-success)'
                          : 'var(--ds-gold)',
                      }}
                    />

                    <div className="bg-card p-4">
                      {/* Header row: status badge + elapsed time */}
                      <div className="flex items-center justify-between mb-3">
                        <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                          currentlyClocked
                            ? onBreak
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                              : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            currentlyClocked
                              ? onBreak ? 'bg-orange-500' : 'bg-emerald-500 animate-pulse'
                              : 'bg-muted-foreground/50'
                          }`} />
                          {currentlyClocked ? (onBreak ? 'On Break' : 'On Shift') : 'Off Shift'}
                        </div>

                        {currentlyClocked && clockedInTime && (
                          <div className="text-right">
                            <span className="text-2xl font-black tabular-nums text-foreground">
                              {Math.floor((now - clockedInTime.getTime()) / (1000 * 60 * 60))}
                              <span className="text-lg font-bold text-muted-foreground">h</span>
                              {String(Math.floor(((now - clockedInTime.getTime()) / (1000 * 60)) % 60)).padStart(2, '0')}
                              <span className="text-lg font-bold text-muted-foreground">m</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Context info row */}
                      {currentlyClocked && clockedInTime ? (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>In at {clockedInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>GPS verified</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>GPS required</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Camera className="w-3 h-3" />
                            <span>Photo required</span>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons — full width */}
                      {!currentlyClocked ? (
                        <button
                          onClick={() => setClockInDialogOpen(true)}
                          className="w-full flex items-center justify-center gap-2 font-bold text-base rounded-xl h-12 transition-all ds-pulse-gold"
                          style={{ background: 'var(--ds-gold)', color: '#000', fontFamily: 'var(--ds-font-display)', letterSpacing: '0.02em' }}
                          data-testid="button-clock-in"
                        >
                          <LogIn className="w-5 h-5" />
                          Clock In
                        </button>
                      ) : !onBreak ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => activeEntry && startBreakMutation.mutate({ entryId: activeEntry.id, breakType: 'meal' })}
                            className="flex items-center justify-center gap-1.5 font-semibold rounded-xl h-11 transition-all"
                            style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--ds-warning)', border: '1px solid rgba(245,158,11,0.35)' }}
                            data-testid="button-start-break"
                          >
                            <Coffee className="w-4 h-4" />
                            Break
                          </button>
                          <button
                            onClick={() => activeEntry && handleClockOut(activeEntry.id)}
                            className="flex items-center justify-center gap-1.5 font-semibold rounded-xl h-11 transition-all"
                            style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--ds-danger)', border: '1px solid rgba(239,68,68,0.35)' }}
                            data-testid="button-clock-out"
                          >
                            <LogOut className="w-4 h-4" />
                            Clock Out
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => activeEntry && endBreakMutation.mutate(activeEntry.id)}
                          className="w-full flex items-center justify-center gap-2 font-semibold rounded-xl h-12 transition-all"
                          style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--ds-info)', border: '1px solid rgba(59,130,246,0.35)' }}
                          data-testid="button-end-break"
                        >
                          <PlayCircle className="w-5 h-5" />
                          End Break & Return to Shift
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="mobile-stat-cards">
                    {[
                      { label: 'Today', value: `${todayHours.toFixed(1)}h`, testId: 'text-today-hours', color: 'text-blue-600 dark:text-blue-400' },
                      { label: 'This Week', value: `${timeEntries.filter((e: TimeEntry) => e.employeeId === currentEmployee?.id && new Date(e.clockIn) >= startOfWeek(new Date())).reduce((s: number, e: TimeEntry) => s + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(1)}h`, testId: 'text-week-hours', color: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Pending', value: String(timeEntries.filter((e: TimeEntry) => e.status === 'pending').length), testId: 'text-pending-count', color: 'text-amber-600 dark:text-amber-400' },
                      { label: 'Approved', value: String(timeEntries.filter((e: TimeEntry) => e.status === 'approved').length), testId: 'text-approved-count', color: 'text-muted-foreground' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-card rounded-xl border border-border p-3 text-center">
                        <p className={`text-xl font-black leading-none ${stat.color}`} data-testid={stat.testId}>{stat.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-1.5 font-semibold">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
              /* ── DESKTOP Clock Card ──────────── */
              <div className="rounded-xl p-4 lg:p-8" style={{ background: 'var(--ds-navy-mid)', border: '1px solid var(--ds-border)' }}>
                <div className="text-center">
                  <div
                    className="inline-flex items-center justify-center w-20 h-20 lg:w-24 lg:h-24 rounded-full mb-4"
                    style={{
                      background: currentlyClocked
                        ? onBreak ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'
                        : 'var(--ds-gold-glow)',
                      border: `2px solid ${currentlyClocked ? (onBreak ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)') : 'var(--ds-gold-border)'}`,
                    }}
                  >
                    {currentlyClocked ? (
                      onBreak ? (
                        <Coffee className="w-10 h-10 lg:w-12 lg:h-12" style={{ color: 'var(--ds-warning)' }} />
                      ) : (
                        <PlayCircle className="w-10 h-10 lg:w-12 lg:h-12" style={{ color: 'var(--ds-success)' }} />
                      )
                    ) : (
                      <Clock className="w-10 h-10 lg:w-12 lg:h-12" style={{ color: 'var(--ds-gold)' }} />
                    )}
                  </div>

                  <h2 className="text-xl lg:text-2xl font-bold mb-2" style={{ fontFamily: 'var(--ds-font-display)', color: 'var(--ds-text-primary)' }}>
                    {currentlyClocked ? (onBreak ? 'On Break' : 'Currently Working') : 'Ready to Clock In'}
                  </h2>
                  
                  {currentlyClocked && clockedInTime && (
                    <div className="mb-4">
                      <p className="text-sm" style={{ color: 'var(--ds-text-muted)' }}>Clocked in at {clockedInTime.toLocaleTimeString()}</p>
                      <p className="text-3xl lg:text-4xl font-bold mt-2" style={{ fontFamily: 'var(--ds-font-display)', color: 'var(--ds-gold)' }}>
                        {Math.floor((now - clockedInTime.getTime()) / (1000 * 60 * 60))}h{' '}
                        {Math.floor(((now - clockedInTime.getTime()) / (1000 * 60)) % 60)}m
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mt-6">
                    {!currentlyClocked ? (
                      <button
                        onClick={() => setClockInDialogOpen(true)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-lg py-4 transition-all ds-pulse-gold"
                        style={{ background: 'var(--ds-gold)', color: '#000', fontFamily: 'var(--ds-font-display)', letterSpacing: '0.02em' }}
                        data-testid="button-clock-in"
                      >
                        <LogIn className="w-6 h-6" />
                        Clock In
                      </button>
                    ) : (
                      <>
                        {!onBreak ? (
                          <>
                            <button
                              onClick={() => activeEntry && startBreakMutation.mutate({ entryId: activeEntry.id, breakType: 'meal' })}
                              className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-4 transition-all"
                              style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--ds-warning)', border: '1px solid rgba(245,158,11,0.35)' }}
                              data-testid="button-start-break"
                            >
                              <Coffee className="w-5 h-5" />
                              Start Break
                            </button>
                            <button
                              onClick={() => activeEntry && handleClockOut(activeEntry.id)}
                              className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-4 transition-all"
                              style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--ds-danger)', border: '1px solid rgba(239,68,68,0.35)' }}
                              data-testid="button-clock-out"
                            >
                              <LogOut className="w-6 h-6" />
                              Clock Out
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => activeEntry && endBreakMutation.mutate(activeEntry.id)}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold py-4 transition-all"
                            style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--ds-info)', border: '1px solid rgba(59,130,246,0.35)' }}
                            data-testid="button-end-break"
                          >
                            <PlayCircle className="w-5 h-5" />
                            End Break
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Location Info */}
                  <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--ds-border)' }}>
                    <div className="flex items-center justify-center space-x-2" style={{ color: 'var(--ds-text-muted)' }}>
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">GPS verification enabled</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 mt-2" style={{ color: 'var(--ds-text-muted)' }}>
                      <Camera className="w-4 h-4" />
                      <span className="text-sm">Photo verification enabled</span>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Today's Summary — desktop only */}
              {!isMobile && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <DsStatCard
                    label="Today"
                    value={`${todayHours.toFixed(1)}h`}
                    icon={Clock}
                    color="gold"
                  />
                  <DsStatCard
                    label="This Week"
                    value={`${timeEntries.filter((e: TimeEntry) => e.employeeId === currentEmployee?.id && new Date(e.clockIn) >= startOfWeek(new Date())).reduce((sum: number, e: TimeEntry) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(1)}h`}
                    icon={Calendar}
                    color="success"
                  />
                  <DsStatCard
                    label="Pending"
                    value={timeEntries.filter((e: TimeEntry) => e.status === 'pending').length}
                    icon={AlertCircle}
                    color="warning"
                  />
                  <DsStatCard
                    label="Approved"
                    value={timeEntries.filter((e: TimeEntry) => e.status === 'approved').length}
                    icon={CheckCircle}
                    color="success"
                  />
                </div>
              )}

              {/* Team Status (for managers) - uses gridEmployees for RBAC */}
              {(workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor') && (
                <div className="bg-card rounded-xl border border-border p-4 lg:p-6">
                  <h3 className="text-lg font-bold text-foreground mb-4">Team Status</h3>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="relative flex-1 min-w-[140px] max-w-[280px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Filter team..."
                        value={teamStatusSearch}
                        onChange={(e) => setTeamStatusSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        data-testid="input-team-search"
                      />
                    </div>
                    <Select value={teamStatusFilter} onValueChange={setTeamStatusFilter}>
                      <SelectTrigger className="w-auto min-w-[120px] h-8 text-sm" data-testid="select-team-status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="clocked_in">Clocked In</SelectItem>
                        <SelectItem value="clocked_out">Clocked Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const filteredTeam = gridEmployees.filter((emp: Employee) => {
                        const matchesSearch = !teamStatusSearch || `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(teamStatusSearch.toLowerCase());
                        if (!matchesSearch) return false;
                        if (teamStatusFilter === 'all') return true;
                        const hasActiveEntry = timeEntries.some((e: TimeEntry) => e.employeeId === emp.id && !e.clockOut);
                        return teamStatusFilter === 'clocked_in' ? hasActiveEntry : !hasActiveEntry;
                      });
                      if (filteredTeam.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-team-results">
                            No team members match the current filters.
                          </p>
                        );
                      }
                      return filteredTeam.map((emp: Employee) => {
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
                        <div key={emp.id} className="flex items-center gap-3 p-3 bg-muted/30 dark:bg-muted/50 rounded-lg w-full" data-testid={`team-member-${emp.id}`}>
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {emp.firstName?.[0]}{emp.lastName?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground truncate">{emp.firstName} {emp.lastName}</p>
                              <p className="text-sm font-medium text-muted-foreground tabular-nums shrink-0">{empTodayHours.toFixed(1)}h</p>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground capitalize truncate">{emp.workspaceRole?.replace(/_/g, ' ')}</p>
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 ${
                                status === 'clocked_in' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                status === 'on_break' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                                'bg-muted dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  status === 'clocked_in' ? 'bg-green-500' :
                                  status === 'on_break' ? 'bg-orange-500' :
                                  'bg-gray-400'
                                }`}></div>
                                <span>{status === 'clocked_in' ? 'In' : status === 'on_break' ? 'Break' : 'Out'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                    })()}
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
                      className="text-white hover:bg-card hover:bg-opacity-20"
                      data-testid="button-prev-week"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="text-center">
                      <h2 className="text-xl sm:text-2xl font-bold mb-1">Weekly Timesheets</h2>
                      <p className="text-blue-100">
                        {format(gridWeekStart, 'MMM d')} - {format(gridWeekEnd, 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setWeekOffset(weekOffset + 1)}
                      className="text-white hover:bg-card hover:bg-opacity-20"
                      data-testid="button-next-week"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    {weekOffset !== 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setWeekOffset(0)}
                        className="text-white hover:bg-card hover:bg-opacity-20 ml-2"
                        data-testid="button-today-week"
                      >
                        Today
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-card bg-opacity-20 rounded-lg p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTimesheetViewMode('grid')}
                        className={`px-3 py-1 rounded ${timesheetViewMode === 'grid' ? 'bg-card dark:bg-gray-800 text-blue-600 dark:text-blue-400' : 'text-white'}`}
                        data-testid="button-view-grid"
                      >
                        <LayoutGrid className="w-4 h-4 mr-1" />
                        Grid
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTimesheetViewMode('list')}
                        className={`px-3 py-1 rounded ${timesheetViewMode === 'list' ? 'bg-card dark:bg-gray-800 text-blue-600 dark:text-blue-400' : 'text-white'}`}
                        data-testid="button-view-list"
                      >
                        <List className="w-4 h-4 mr-1" />
                        List
                      </Button>
                    </div>
                    <a
                      href={`/api/timesheets/export/csv?startDate=${gridWeekStart.toISOString()}&endDate=${gridWeekEnd.toISOString()}`}
                      className="inline-flex items-center px-4 py-2 bg-card bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors"
                      data-testid="button-export-csv"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      CSV
                    </a>
                    <a
                      href={`/api/timesheets/export/pdf?startDate=${gridWeekStart.toISOString()}&endDate=${gridWeekEnd.toISOString()}`}
                      className="inline-flex items-center px-4 py-2 bg-card bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors"
                      data-testid="button-export-pdf"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 mt-4 sm:mt-6">
                  <div className="bg-card bg-opacity-10 rounded-lg p-2.5 sm:p-4">
                    <p className="text-[10px] sm:text-sm text-blue-100 mb-0.5 sm:mb-1 truncate">Total</p>
                    <p className="text-lg sm:text-3xl font-bold truncate">
                      {employees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-card bg-opacity-10 rounded-lg p-2.5 sm:p-4">
                    <p className="text-[10px] sm:text-sm text-blue-100 mb-0.5 sm:mb-1 truncate">Regular</p>
                    <p className="text-lg sm:text-3xl font-bold truncate">
                      {Math.min(employees.length * 40, employees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0)).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-card bg-opacity-10 rounded-lg p-2.5 sm:p-4">
                    <p className="text-[10px] sm:text-sm text-blue-100 mb-0.5 sm:mb-1 truncate">Overtime</p>
                    <p className="text-lg sm:text-3xl font-bold truncate">
                      {employees.reduce((sum, emp) => sum + Math.max(0, getEmployeeWeekTotal(emp.id).total - 40), 0).toFixed(1)}h
                    </p>
                  </div>
                  <div className="bg-card bg-opacity-10 rounded-lg p-2.5 sm:p-4">
                    <p className="text-[10px] sm:text-sm text-blue-100 mb-0.5 sm:mb-1 truncate">Team</p>
                    <p className="text-lg sm:text-3xl font-bold">{employees.length}</p>
                  </div>
                  <div className="bg-card bg-opacity-10 rounded-lg p-2.5 sm:p-4">
                    <p className="text-[10px] sm:text-sm text-blue-100 mb-0.5 sm:mb-1 truncate">Pending</p>
                    <p className="text-lg sm:text-3xl font-bold">
                      {employees.reduce((sum, emp) => sum + (getEmployeeWeekTotal(emp.id).hasPending ? 1 : 0), 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* GetSling-style Weekly Grid View */}
              {timesheetViewMode === 'grid' && (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  {/* Bulk Actions Bar - Pro View only */}
                  {canApprove && bulkSelectedEmployees.size > 0 && !isSimpleMode && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {bulkSelectedEmployees.size} employee{bulkSelectedEmployees.size > 1 ? 's' : ''} selected
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => bulkApproveMutation.mutate(Array.from(bulkSelectedEmployees))}
                          disabled={bulkApproveMutation.isPending}
                          className="bg-green-600 text-white"
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
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full min-w-[600px] sm:min-w-[800px]">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          {canApprove && !isSimpleMode && (
                            <th className="px-2 sm:px-3 py-2 sm:py-3 text-left w-8 sm:w-10">
                              <Checkbox
                                checked={bulkSelectedEmployees.size === gridEmployees.length && gridEmployees.length > 0}
                                onCheckedChange={selectAllEmployees}
                                data-testid="checkbox-select-all"
                              />
                            </th>
                          )}
                          <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-muted-foreground uppercase min-w-[120px] sm:min-w-[180px]">Employee</th>
                          {gridDays.map((day, idx) => {
                            const isToday = day.toDateString() === new Date().toDateString();
                            const isWeekend = idx >= 5;
                            return (
                              <th 
                                key={idx} 
                                className={`px-1 sm:px-2 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-medium uppercase min-w-[48px] sm:min-w-[80px] ${
                                  isToday ? 'bg-primary/10 text-foreground' : 
                                  isWeekend ? 'bg-muted/30 text-muted-foreground' : 
                                  'text-muted-foreground'
                                }`}
                              >
                                <div>{format(day, isMobile ? 'EEEEE' : 'EEE')}</div>
                                <div className="text-xs sm:text-sm font-bold">{format(day, 'd')}</div>
                              </th>
                            );
                          })}
                          <th className="px-1 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-medium text-muted-foreground uppercase bg-muted/30 min-w-[44px] sm:min-w-[80px]">Total</th>
                          <th className="px-1 sm:px-4 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-medium text-muted-foreground uppercase min-w-[60px] sm:min-w-[100px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {gridEmployees.map((emp) => {
                          const weekData = getEmployeeWeekTotal(emp.id);
                          const isSelected = bulkSelectedEmployees.has(emp.id);
                          const isOvertime = weekData.total > 40;

                          return (
                            <tr key={emp.id} className={`hover:bg-muted/30 dark:hover:bg-gray-800/50 ${isSelected ? 'bg-blue-50' : ''}`} data-testid={`timesheet-row-${emp.id}`}>
                              {/* Bulk select checkbox - Pro View only */}
                              {canApprove && !isSimpleMode && (
                                <td className="px-3 py-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleBulkSelect(emp.id)}
                                    data-testid={`checkbox-employee-${emp.id}`}
                                  />
                                </td>
                              )}
                              <td className="px-2 sm:px-4 py-2 sm:py-3">
                                <div className="flex items-center gap-1.5 sm:gap-3">
                                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0">
                                    {emp.firstName?.[0]}{emp.lastName?.[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground text-xs sm:text-sm truncate">{emp.firstName} {emp.lastName}</p>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground capitalize truncate hidden sm:block">{emp.workspaceRole || 'Employee'}</p>
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
                                      isToday ? 'bg-blue-50' : isWeekend ? 'bg-muted/30 dark:bg-gray-800/50' : ''
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
                                        <span className="font-bold text-foreground text-sm">{dayData.totalHours.toFixed(1)}h</span>
                                        <div className="flex items-center gap-0.5">
                                          {dayData.allApproved && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                          {dayData.hasPending && <Clock className="w-3.5 h-3.5 text-orange-500" />}
                                          {dayData.hasFlagged && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                          {dayData.hasActive && <PlayCircle className="w-3.5 h-3.5 text-primary animate-pulse" />}
                                          {dayData.hasLateClockIn && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`px-4 py-3 text-center font-bold ${isOvertime ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
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
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="bg-muted/30 border-t border-border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        <span>Approved</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-orange-500" />
                        <span>Pending</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <PlayCircle className="w-3.5 h-3.5 text-primary" />
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
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {(workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor') && (
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
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/30 dark:bg-gray-800/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Employee</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Clock In</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Clock Out</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredTimeEntries.map((entry: TimeEntry) => {
                        const employee = employees.find((e: Employee) => e.id === entry.employeeId);
                        return (
                          <tr key={entry.id} className="hover:bg-muted/30 dark:hover:bg-gray-800/50" data-testid={`entry-row-${entry.id}`}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">
                                {employee?.firstName} {employee?.lastName}
                              </div>
                              {entry.clockInPhotoUrl && (
                                <div className="flex items-center space-x-1 text-xs text-muted-foreground mt-1">
                                  <Camera className="w-3 h-3" />
                                  <span>Photo verified</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {format(new Date(entry.clockIn), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {format(new Date(entry.clockIn), 'h:mm a')}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-foreground">
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
                <div className="lg:hidden divide-y divide-border">
                  {filteredTimeEntries.map((entry: TimeEntry) => {
                    const employee = employees.find((e: Employee) => e.id === entry.employeeId);
                    return (
                      <div key={entry.id} className="p-4" data-testid={`entry-card-${entry.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="font-bold text-foreground truncate">{employee?.firstName} {employee?.lastName}</p>
                            <p className="text-sm text-muted-foreground">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                          </div>
                          <Badge variant={entry.status === 'approved' ? 'default' : 'secondary'}>
                            {entry.status || 'pending'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <p className="text-muted-foreground">Clock In</p>
                            <p className="font-medium text-foreground">
                              {format(new Date(entry.clockIn), 'h:mm a')}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Clock Out</p>
                            <p className="font-medium text-foreground">
                              {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Hours</p>
                            <p className="font-bold text-foreground">
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
              <UniversalModal open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
                <UniversalModalContent size="xl">
                  <UniversalModalHeader>
                    <UniversalModalTitle className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {selectedDayDetail?.employee?.firstName?.[0]}{selectedDayDetail?.employee?.lastName?.[0]}
                      </div>
                      <div>
                        <div>{selectedDayDetail?.employee?.firstName} {selectedDayDetail?.employee?.lastName}</div>
                        <div className="text-sm font-normal text-muted-foreground">
                          {selectedDayDetail?.date && format(selectedDayDetail.date, 'EEEE, MMMM d, yyyy')}
                        </div>
                      </div>
                    </UniversalModalTitle>
                    <UniversalModalDescription className="sr-only">
                      Time entries for {selectedDayDetail?.employee?.firstName} {selectedDayDetail?.employee?.lastName} on {selectedDayDetail?.date && format(selectedDayDetail.date, 'MMMM d, yyyy')}
                    </UniversalModalDescription>
                  </UniversalModalHeader>

                  <div className="space-y-4 mt-4">
                    {selectedDayDetail?.entries.map((entry, idx) => {
                      const shift = shifts.find(s => s.id === entry.shiftId);
                      const client = clients.find(c => c.id === entry.clientId);
                      const clockInTime = new Date(entry.clockIn);
                      const clockOutTime = entry.clockOut ? new Date(entry.clockOut) : null;

                      return (
                        <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                          {/* Entry Header */}
                          <div className="flex items-center justify-between gap-2">
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
                            <div className="bg-muted/30 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                              <p className="text-muted-foreground">
                                <span className="font-medium">Scheduled:</span> {format(new Date(shift.startTime), 'h:mm a')} - {format(new Date(shift.endTime), 'h:mm a')}
                              </p>
                            </div>
                          )}

                          {/* Clock In/Out Details */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase font-medium">Clock In</p>
                              <p className="font-bold">{format(clockInTime, 'h:mm a')}</p>
                              {(entry as any).clockInGpsLatitude && (
                                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                  <MapPin className="w-3 h-3" />
                                  <span>GPS Verified</span>
                                </div>
                              )}
                              {entry.clockInPhotoUrl && (
                                <div className="flex items-center gap-1 text-xs text-primary">
                                  <Camera className="w-3 h-3" />
                                  <span>Photo Verified</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase font-medium">Clock Out</p>
                              {clockOutTime ? (
                                <>
                                  <p className="font-bold">{format(clockOutTime, 'h:mm a')}</p>
                                  {(entry as any).clockOutGpsLatitude && (
                                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                      <MapPin className="w-3 h-3" />
                                      <span>GPS Verified</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-orange-600 dark:text-orange-400 font-medium">Still Active</p>
                              )}
                            </div>
                          </div>

                          {/* Client Info */}
                          {client && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Users className="w-4 h-4" />
                              <span>{client.companyName}</span>
                            </div>
                          )}

                          {/* Notes */}
                          {entry.notes && (
                            <div className="text-sm text-muted-foreground italic bg-muted/30 dark:bg-gray-800/50 rounded p-2">
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
                                className="bg-green-600 text-white"
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
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">Day Total</span>
                        <span className="text-xl sm:text-2xl font-bold text-foreground">
                          {selectedDayDetail.entries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(2)}h
                        </span>
                      </div>
                    )}
                  </div>
                </UniversalModalContent>
              </UniversalModal>
            </div>
          )}

          {/* Approvals View */}
          {view === 'approvals' && canApprove && (
            <div className="space-y-4">
              <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">
                  Pending Approvals ({timeEntries.filter((e: TimeEntry) => e.status === 'pending').length})
                </h3>

                <div className="space-y-4">
                  {timeEntries.filter((e: TimeEntry) => e.status === 'pending').map((entry: TimeEntry) => {
                    const employee = employees.find((e: Employee) => e.id === entry.employeeId);
                    return (
                      <div key={entry.id} className="border border-orange-200 dark:border-orange-800/50 rounded-lg p-4 bg-orange-50 dark:bg-orange-950/20" data-testid={`approval-entry-${entry.id}`}>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {employee?.firstName?.[0]}{employee?.lastName?.[0]}
                              </div>
                              <div>
                                <p className="font-bold text-foreground">{employee?.firstName} {employee?.lastName}</p>
                                <p className="text-sm text-muted-foreground">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                              <div>
                                <p className="text-muted-foreground">In: {format(new Date(entry.clockIn), 'h:mm a')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  Out: {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : '-'}
                                </p>
                              </div>
                              <div>
                                <p className="font-bold text-foreground">
                                  Total: {entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(1) : '0.0'}h
                                </p>
                              </div>
                            </div>

                            {entry.notes && (
                              <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={() => approveMutation.mutate(entry.id)}
                              className="flex-1 lg:flex-none bg-green-600 text-white"
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
                              className="flex-1 lg:flex-none bg-red-600 text-white"
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
                      <p className="text-muted-foreground font-medium">All caught up!</p>
                      <p className="text-sm text-muted-foreground">No pending approvals</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Approvals View */}
          {view === 'approvals' && (
            <div className="space-y-4">
              <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">Pending Approvals</h2>
                    <p className="text-sm text-muted-foreground mt-1">
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
                        <div key={entry.id} className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors" data-testid={`approval-entry-${entry.id}`}>
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                  {employee?.firstName?.[0]}{employee?.lastName?.[0]}
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground">{employee?.firstName} {employee?.lastName}</p>
                                  <p className="text-sm text-muted-foreground">{format(new Date(entry.clockIn), 'MMM dd, yyyy')}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mt-3">
                                <div>
                                  <p className="text-xs text-muted-foreground">Clock In</p>
                                  <p className="text-sm font-medium text-foreground">{format(new Date(entry.clockIn), 'h:mm a')}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Clock Out</p>
                                  <p className="text-sm font-medium text-foreground">
                                    {entry.clockOut ? format(new Date(entry.clockOut), 'h:mm a') : 'Active'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Duration</p>
                                  <p className="text-sm font-medium text-foreground">{duration}</p>
                                </div>
                                {client && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Client</p>
                                    <p className="text-sm font-medium text-foreground">{client.companyName || `${client.firstName} ${client.lastName}`}</p>
                                  </div>
                                )}
                              </div>

                              {entry.notes && (
                                <div className="mt-3 p-2 bg-muted/30 dark:bg-gray-800/50 rounded-md">
                                  <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                                  <p className="text-sm text-foreground italic">{entry.notes}</p>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 lg:min-w-[120px]">
                              <Button
                                onClick={() => approveMutation.mutate(entry.id)}
                                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white"
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
                                className="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white"
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
                        <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">All Caught Up!</h3>
                      <p className="text-muted-foreground">No pending time entries to review</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reports View - Pro View only */}
          {view === 'reports' && canApprove && !isSimpleMode && (
            <div className="space-y-6">
              {/* Report Header */}
              <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Time & Attendance Reports</h2>
                    <p className="text-sm text-muted-foreground">Generate reports for labor cost, overtime, and exceptions</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = generateReportData('labor');
                        downloadCSV(data, `labor-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
                        toast({ title: 'Report Downloaded', description: 'Labor cost report exported to CSV' });
                      }}
                      data-testid="button-export-labor"
                    >
                      <Download className="w-4 h-4 mr-1.5 shrink-0" />
                      <span className="truncate">Labor Report</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = generateReportData('overtime');
                        downloadCSV(data, `overtime-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
                        toast({ title: 'Report Downloaded', description: 'Overtime report exported to CSV' });
                      }}
                      data-testid="button-export-overtime"
                    >
                      <Download className="w-4 h-4 mr-1.5 shrink-0" />
                      <span className="truncate">Overtime</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = generateReportData('exceptions');
                        downloadCSV(data, `exceptions-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
                        toast({ title: 'Report Downloaded', description: 'Exceptions report exported to CSV' });
                      }}
                      data-testid="button-export-exceptions"
                    >
                      <Download className="w-4 h-4 mr-1.5 shrink-0" />
                      <span className="truncate">Exceptions</span>
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-green-600 to-emerald-600 text-white col-span-2 sm:col-span-1"
                      onClick={async () => {
                        try {
                          const response = await secureFetch(`/api/payroll/export/csv?startDate=${format(gridWeekStart, 'yyyy-MM-dd')}&endDate=${format(gridWeekEnd, 'yyyy-MM-dd')}`);
                          if (!response.ok) throw new Error('Export failed');
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `quickbooks-payroll-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          toast({ title: 'QuickBooks Export Ready', description: 'Payroll data exported for QuickBooks import' });
                          trinity.success('Payroll data exported successfully! You can now import this into QuickBooks.', 'QuickBooks Export');
                        } catch (error) {
                          toast({ title: 'Export Failed', description: 'Failed to export payroll data', variant: 'destructive' });
                        }
                      }}
                      data-testid="button-export-quickbooks"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1.5 shrink-0" />
                      <span className="truncate">QuickBooks Export</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Report Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Labor Cost Summary */}
                <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="font-bold text-foreground">Labor Cost</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total Hours (Week)</span>
                      <span className="font-bold text-foreground" data-testid="text-report-total-hours">
                        {timeEntries.filter(e => {
                          const entryDate = new Date(e.clockIn);
                          return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                        }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0).toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Regular Hours</span>
                      <span className="font-medium text-foreground" data-testid="text-report-regular-hours">
                        {Math.min(
                          timeEntries.filter(e => {
                            const entryDate = new Date(e.clockIn);
                            return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                          }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0),
                          40 * gridEmployees.length
                        ).toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Overtime Hours</span>
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
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Est. Labor Cost</span>
                        <span className="text-lg font-bold text-green-600" data-testid="text-report-labor-cost">
                          ${(timeEntries.filter(e => {
                            const entryDate = new Date(e.clockIn);
                            return entryDate >= gridWeekStart && entryDate <= gridWeekEnd;
                          }).reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours.toString()) : 0), 0) * 18).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Based on avg $18/hr</p>
                    </div>
                  </div>
                </div>

                {/* Overtime Summary */}
                <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-orange-600" />
                    </div>
                    <h3 className="font-bold text-foreground">Overtime Analysis</h3>
                  </div>
                  <div className="space-y-3">
                    {gridEmployees.map(emp => {
                      const weekTotal = getEmployeeWeekTotal(emp.id);
                      const isOvertime = weekTotal.total > 40;
                      if (!isOvertime) return null;
                      return (
                        <div key={emp.id} className="flex items-center justify-between gap-2 p-2 bg-orange-50 rounded-lg" data-testid={`overtime-employee-${emp.id}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {emp.firstName?.[0]}{emp.lastName?.[0]}
                            </div>
                            <span className="text-sm font-medium text-foreground truncate">{emp.firstName} {emp.lastName}</span>
                          </div>
                          <span className="text-sm font-bold text-orange-600">
                            +{(weekTotal.total - 40).toFixed(1)}h OT
                          </span>
                        </div>
                      );
                    })}
                    {gridEmployees.every(emp => getEmployeeWeekTotal(emp.id).total <= 40) && (
                      <div className="text-center py-4 text-muted-foreground">
                        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No overtime this week</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exceptions Summary */}
                <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertOctagon className="w-5 h-5 text-red-600" />
                    </div>
                    <h3 className="font-bold text-foreground">Exceptions</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2 p-2 bg-muted/30 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                        <span className="text-sm text-foreground">Late Clock-Ins</span>
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
                    <div className="flex justify-between items-center gap-2 p-2 bg-muted/30 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        <span className="text-sm text-foreground">Flagged Entries</span>
                      </div>
                      <span className="font-bold text-red-600" data-testid="text-exception-flagged">
                        {timeEntries.filter(e => e.status === 'rejected' || e.status === 'flagged').length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2 p-2 bg-muted/30 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <PlayCircle className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground">Missing Clock-Outs</span>
                      </div>
                      <span className="font-bold text-primary" data-testid="text-exception-missing-clockouts">
                        {timeEntries.filter(e => !e.clockOut && new Date(e.clockIn) < new Date(Date.now() - 12 * 60 * 60 * 1000)).length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2 p-2 bg-muted/30 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-purple-500 shrink-0" />
                        <span className="text-sm text-foreground">Pending Approvals</span>
                      </div>
                      <span className="font-bold text-purple-600" data-testid="text-exception-pending">
                        {pendingApprovals}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Employee Report Table */}
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
                      <h3 className="font-bold text-foreground truncate">Employee Weekly Summary</h3>
                    </div>
                    <div className="text-sm text-muted-foreground shrink-0">
                      Week of {format(gridWeekStart, 'MMM d')} - {format(gridWeekEnd, 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/30 dark:bg-gray-800/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Employee</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Total Hours</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Regular</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Overtime</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Est. Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {gridEmployees.map(emp => {
                        const weekTotal = getEmployeeWeekTotal(emp.id);
                        const regularHours = Math.min(weekTotal.total, 40);
                        const overtimeHours = Math.max(0, weekTotal.total - 40);
                        const estPay = (regularHours * 18) + (overtimeHours * 27);
                        
                        return (
                          <tr key={emp.id} className="hover:bg-muted/30 dark:hover:bg-gray-800/50" data-testid={`report-row-${emp.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                  {emp.firstName?.[0]}{emp.lastName?.[0]}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground text-sm">{emp.firstName} {emp.lastName}</p>
                                  <p className="text-xs text-muted-foreground capitalize">{emp.workspaceRole || 'Employee'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-foreground">
                              {weekTotal.total.toFixed(1)}h
                            </td>
                            <td className="px-4 py-3 text-center text-foreground">
                              {regularHours.toFixed(1)}h
                            </td>
                            <td className="px-4 py-3 text-center">
                              {overtimeHours > 0 ? (
                                <span className="text-orange-600 font-medium">{overtimeHours.toFixed(1)}h</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
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
                    <tfoot className="bg-muted dark:bg-gray-800">
                      <tr>
                        <td className="px-4 py-3 font-bold text-foreground">Totals</td>
                        <td className="px-4 py-3 text-center font-bold text-foreground">
                          {gridEmployees.reduce((sum, emp) => sum + getEmployeeWeekTotal(emp.id).total, 0).toFixed(1)}h
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-foreground">
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

        {/* Clock In Dialog */}
        <UniversalModal open={clockInDialogOpen} onOpenChange={setClockInDialogOpen}>
          <UniversalModalContent size="xl" hideBuiltInClose className="max-h-[90vh] p-0">
            <DialogStyledHeader variant="info">
              <UniversalModalTitle className="text-inherit">Clock In</UniversalModalTitle>
              <UniversalModalDescription className="text-white/80">
                GPS and photo verification required
              </UniversalModalDescription>
            </DialogStyledHeader>
            
            <UniversalModalBody className="space-y-4">
              {/* Employee Selection - Only managers/supervisors/owners can clock in others */}
              {canClockInOthers && (
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
              {!canClockInOthers && currentEmployee && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <Label className="text-foreground">Employee</Label>
                  <p className="font-bold text-foreground">{currentEmployee.firstName} {currentEmployee.lastName}</p>
                </div>
              )}

              {/* GPS Status */}
              <div className="bg-muted/30 dark:bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-primary shrink-0" />
                    <Label>GPS Location</Label>
                  </div>
                  {isCapturingGPS && (
                    <Badge variant="secondary">Capturing...</Badge>
                  )}
                </div>
                {gpsData ? (
                  <div className="text-sm text-green-600 dark:text-green-400 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Location verified ({Math.round(gpsData.accuracy)}m accuracy)</span>
                  </div>
                ) : gpsError === "denied" ? (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Location permission required</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">Tap the lock icon in your browser's address bar, then set Location to Allow. Then tap Retry GPS below.</p>
                  </div>
                ) : gpsError === "unavailable" ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>No GPS signal. Move outdoors and tap Retry GPS.</span>
                  </div>
                ) : gpsError === "timeout" ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>GPS timed out. Move outdoors and tap Retry GPS.</span>
                  </div>
                ) : gpsError ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>Unable to get location. Tap Retry GPS.</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Capturing location...</div>
                )}
                {!gpsData && !isCapturingGPS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => captureGPS()}
                    className="mt-2"
                    data-testid="button-retry-gps"
                  >
                    Retry GPS
                  </Button>
                )}
              </div>

              {/* Photo Capture */}
              <div className="bg-muted/30 dark:bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Camera className="w-5 h-5 text-primary" />
                  <Label>Verification Photo</Label>
                </div>
                
                {!capturedPhoto ? (
                  <div className="space-y-2">
                    {cameraPermissionDenied && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Camera permission required</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Tap the lock icon in your browser's address bar, then set Camera to Allow. Tap "Start Camera" again after enabling it, or use "Upload Photo" below to open your device camera directly.</p>
                      </div>
                    )}
                    {isCameraActive ? (
                      <div className="space-y-2">
                        <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                          {isCameraLoading && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                              <div className="text-center text-white">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-1" />
                                <p className="text-xs">Starting camera...</p>
                              </div>
                            </div>
                          )}
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          variant="default"
                          onClick={capturePhoto}
                          className="w-full"
                          data-testid="button-capture-photo"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Capture Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cameraSupported && (
                          <Button
                            variant="outline"
                            onClick={startCamera}
                            className="w-full"
                            data-testid="button-start-camera"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {cameraPermissionDenied ? "Try Camera Again" : "Start Camera"}
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant={cameraSupported ? "outline" : "default"}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1"
                            data-testid="button-browse-gallery"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Browse Gallery
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1"
                            data-testid="button-take-photo-direct"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Take Photo
                          </Button>
                        </div>
                      </div>
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
                        setCameraPermissionDenied(false);
                        if (cameraSupported) startCamera();
                      }}
                      className="w-full"
                      data-testid="button-retake-photo"
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-photo-upload"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-camera-capture"
                />
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
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
                disabled={clockInMutation.isPending || !selectedEmployee || !gpsData || !capturedPhoto}
                data-testid="button-confirm-clock-in"
              >
                {clockInMutation.isPending ? "Clocking In..." : "Confirm Clock In"}
              </Button>
            </UniversalModalBody>
          </UniversalModalContent>
        </UniversalModal>

        {/* Entry Details Dialog */}
        <UniversalModal open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
          <UniversalModalContent size="xl" hideBuiltInClose className="p-0">
            <DialogStyledHeader variant="info">
              <UniversalModalTitle className="text-inherit">Timesheet Entry Details</UniversalModalTitle>
            </DialogStyledHeader>
            {selectedEntry && (
              <UniversalModalBody className="space-y-4">
                <div>
                  <h4 className="font-bold text-foreground dark:text-gray-100 mb-2">
                    {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.firstName}{' '}
                    {employees.find((e: Employee) => e.id === selectedEntry.employeeId)?.lastName}
                  </h4>
                  <p className="text-sm text-muted-foreground">{format(new Date(selectedEntry.clockIn), 'MMMM dd, yyyy')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Clock In</Label>
                    <p className="text-foreground font-medium">{format(new Date(selectedEntry.clockIn), 'h:mm a')}</p>
                  </div>
                  <div>
                    <Label>Clock Out</Label>
                    <p className="text-foreground font-medium">
                      {selectedEntry.clockOut ? format(new Date(selectedEntry.clockOut), 'h:mm a') : 'Active'}
                    </p>
                  </div>
                  <div>
                    <Label>Total Hours</Label>
                    <p className="text-foreground font-bold">
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
                    <p className="text-sm text-muted-foreground mt-1">{selectedEntry.notes}</p>
                  </div>
                )}

                {selectedEntry.clockInPhotoUrl && (
                  <div>
                    <Label>Clock In Photo</Label>
                    <img src={selectedEntry.clockInPhotoUrl} alt="Clock in verification" width={600} height={256} className="mt-2 rounded-lg max-h-64 w-full object-cover" />
                  </div>
                )}
              </UniversalModalBody>
            )}
          </UniversalModalContent>
        </UniversalModal>

        {/* Clock Out Dialog */}
        <UniversalModal open={clockOutDialogOpen} onOpenChange={setClockOutDialogOpen}>
          <UniversalModalContent size="xl" hideBuiltInClose className="max-h-[90vh] p-0">
            <DialogStyledHeader variant="danger">
              <UniversalModalTitle className="text-inherit">Clock Out</UniversalModalTitle>
              <UniversalModalDescription className="text-white/80">
                GPS and photo verification required
              </UniversalModalDescription>
            </DialogStyledHeader>
            
            <UniversalModalBody className="space-y-4 overflow-y-auto">
              {/* GPS Status */}
              <div className="bg-muted/30 dark:bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-primary shrink-0" />
                    <Label>GPS Location</Label>
                  </div>
                  {isCapturingGPS && (
                    <Badge variant="secondary">Capturing...</Badge>
                  )}
                </div>
                {gpsData ? (
                  <div className="text-sm text-green-600 dark:text-green-400 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Location verified ({Math.round(gpsData.accuracy)}m accuracy)</span>
                  </div>
                ) : gpsError === "denied" ? (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Location permission required</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">Tap the lock icon in your browser's address bar, then set Location to Allow. Then tap Retry GPS below.</p>
                  </div>
                ) : gpsError === "unavailable" ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>No GPS signal. Move outdoors and tap Retry GPS.</span>
                  </div>
                ) : gpsError === "timeout" ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>GPS timed out. Move outdoors and tap Retry GPS.</span>
                  </div>
                ) : gpsError ? (
                  <div className="text-sm text-destructive flex items-center space-x-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>Unable to get location. Tap Retry GPS.</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Capturing location...</div>
                )}
                {!gpsData && !isCapturingGPS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => captureGPS()}
                    className="mt-2"
                    data-testid="button-retry-gps-clockout"
                  >
                    Retry GPS
                  </Button>
                )}
              </div>

              {/* Photo Capture */}
              <div className="bg-muted/30 dark:bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Camera className="w-5 h-5 text-primary" />
                  <Label>Verification Photo</Label>
                </div>
                
                {!capturedPhoto ? (
                  <div className="space-y-2">
                    {cameraPermissionDenied && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Camera permission required</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Tap the lock icon in your browser's address bar, then set Camera to Allow. Tap "Start Camera" again after enabling it, or use "Upload Photo" below to open your device camera directly.</p>
                      </div>
                    )}
                    {isCameraActive ? (
                      <div className="space-y-2">
                        <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                          {isCameraLoading && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                              <div className="text-center text-white">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-1" />
                                <p className="text-xs">Starting camera...</p>
                              </div>
                            </div>
                          )}
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          variant="default"
                          onClick={capturePhoto}
                          className="w-full"
                          data-testid="button-capture-photo-clockout"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Capture Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cameraSupported && (
                          <Button
                            variant="outline"
                            onClick={startCamera}
                            className="w-full"
                            data-testid="button-start-camera-clockout"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {cameraPermissionDenied ? "Try Camera Again" : "Start Camera"}
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant={cameraSupported ? "outline" : "default"}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1"
                            data-testid="button-browse-gallery-clockout"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Browse Gallery
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1"
                            data-testid="button-take-photo-direct-clockout"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Take Photo
                          </Button>
                        </div>
                      </div>
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
                        setCameraPermissionDenied(false);
                        if (cameraSupported) startCamera();
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
                className="w-full bg-gradient-to-r from-red-600 to-rose-600"
                disabled={clockOutMutation.isPending || !gpsData || !capturedPhoto}
                data-testid="button-confirm-clock-out"
              >
                {clockOutMutation.isPending ? "Clocking Out..." : "Confirm Clock Out"}
              </Button>
            </UniversalModalBody>
          </UniversalModalContent>
        </UniversalModal>

        {/* Reject Dialog with Validation */}
        <UniversalModal open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <UniversalModalContent>
            <UniversalModalHeader>
              <UniversalModalTitle>Reject Time Entry</UniversalModalTitle>
              <UniversalModalDescription>Please provide a reason for rejection (required)</UniversalModalDescription>
            </UniversalModalHeader>
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
                  className="flex-1 bg-red-600"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  data-testid="button-confirm-reject"
                >
                  {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                </Button>
              </div>
            </div>
          </UniversalModalContent>
        </UniversalModal>
      </div>
  );

  return (
    <DsPageWrapper padding={false}>
      {pageContent}
    </DsPageWrapper>
  );
}
