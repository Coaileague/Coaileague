import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
import { Clock, Play, Square, Calendar, DollarSign, User, Building2, Download, Filter, Home, ArrowLeft, Camera, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ResponsiveLoading } from "@/components/responsive-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";

export default function TimeTracking() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isMobile = useIsMobile();
  const [clockInDialogOpen, setClockInDialogOpen] = useState(false);
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
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [dateRange, setDateRange] = useState<string>("week");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  // Real-time timer update for active entries
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

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

  const { data: allTimeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
    enabled: isAuthenticated,
  });

  // Get current user's employee record to determine role
  const currentEmployee = employees.find(emp => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'staff';

  // Role-based filtering: employees see only their own entries
  const timeEntries = useMemo(() => {
    if (workspaceRole === 'staff') {
      // Employees see only their own time entries
      return allTimeEntries.filter(entry => entry.employeeId === currentEmployee?.id);
    }
    // Managers and owners see all entries
    return allTimeEntries;
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
      return apiRequest("POST", "/api/time-entries/clock-in", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Clocked In",
        description: "Time tracking started successfully with GPS verification",
      });
      setClockInDialogOpen(false);
      // Clear all form state
      setSelectedEmployee("");
      setSelectedClient("");
      setSelectedShift("");
      setNotes("");
      // Clear GPS and photo state to force fresh captures
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
      stopCamera();
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

  // Break Management Mutations
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
        description: "You have resumed work",
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

  // Approval Workflow Mutations
  const approveMutation = useMutation({
    mutationFn: async (timeEntryId: string) => {
      return apiRequest("POST", `/api/time-entries/${timeEntryId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Entry Approved",
        description: "Time entry has been approved successfully",
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
      return apiRequest("POST", `/api/time-entries/${data.timeEntryId}/reject`, { reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/active"] });
      toast({
        title: "Entry Rejected",
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

  // Active Employee Monitoring (Manager-only)
  const { data: activeEmployees = [] } = useQuery<any[]>({
    queryKey: ["/api/time-entries/active"],
    enabled: isAuthenticated && workspaceRole !== 'staff',
    refetchInterval: 30000, // Refresh every 30 seconds for live monitoring
  });

  // Current User Status (for My Status card with break controls)
  const { data: myStatus = null } = useQuery<any>({
    queryKey: ["/api/time-entries/status"],
    enabled: isAuthenticated,
    refetchInterval: 10000, // Refresh every 10 seconds for live timer
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

  // Photo Capture Function
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

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Auto-capture GPS when dialog opens, cleanup on close
  useEffect(() => {
    if (clockInDialogOpen) {
      // Reset states to force fresh captures
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
      setIsCameraActive(false);
      // Auto-capture GPS
      captureGPS();
    } else {
      // Cleanup when dialog closes
      stopCamera();
      // Clear states to prevent stale data
      setGpsData(null);
      setCapturedPhoto(null);
      setGpsError(null);
    }
    
    return () => {
      // Cleanup on unmount
      stopCamera();
    };
  }, [clockInDialogOpen]);

  const handleClockIn = () => {
    if (!selectedEmployee) {
      toast({
        title: "Error",
        description: "Please select an employee",
        variant: "destructive",
      });
      return;
    }

    // Validate GPS data
    if (!gpsData) {
      toast({
        title: "GPS Required",
        description: "Please wait for GPS to be captured or try again",
        variant: "destructive",
      });
      return;
    }

    // Validate photo
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

  // Calculate date range
  const getDateRangeFilter = () => {
    const today = new Date();
    switch (dateRange) {
      case "today":
        return { start: startOfWeek(today), end: endOfWeek(today) };
      case "week":
        return { start: startOfWeek(today), end: endOfWeek(today) };
      case "2weeks":
        return { start: subDays(today, 14), end: today };
      case "month":
        return { start: subDays(today, 30), end: today };
      default:
        return null;
    }
  };

  // Filter and sort time entries
  const filteredTimeEntries = useMemo(() => {
    let filtered = [...timeEntries];

    // Filter by employee
    if (filterEmployee !== "all") {
      filtered = filtered.filter(entry => entry.employeeId === filterEmployee);
    }

    // Filter by group/client
    if (filterGroup !== "all") {
      filtered = filtered.filter(entry => entry.clientId === filterGroup);
    }

    // Filter by status
    if (filterStatus !== "all") {
      if (filterStatus === "active") {
        filtered = filtered.filter(entry => !entry.clockOut);
      } else if (filterStatus === "completed") {
        filtered = filtered.filter(entry => entry.clockOut);
      } else if (filterStatus === "unbilled") {
        filtered = filtered.filter(entry => entry.invoiceId === null);
      } else if (filterStatus === "billed") {
        filtered = filtered.filter(entry => entry.invoiceId !== null);
      }
    }

    // Filter by date range
    const range = getDateRangeFilter();
    if (range) {
      filtered = filtered.filter(entry => {
        const entryDate = new Date(entry.clockIn);
        return entryDate >= range.start && entryDate <= range.end;
      });
    }

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
      case "hours":
        filtered.sort((a, b) => {
          const hoursA = a.clockOut ? (new Date(a.clockOut).getTime() - new Date(a.clockIn).getTime()) / (1000 * 60 * 60) : 0;
          const hoursB = b.clockOut ? (new Date(b.clockOut).getTime() - new Date(b.clockIn).getTime()) / (1000 * 60 * 60) : 0;
          return hoursB - hoursA;
        });
        break;
    }

    return filtered;
  }, [timeEntries, filterEmployee, filterGroup, filterStatus, dateRange, sortBy, employees]);

  // Export to CSV
  const handleExportTimesheet = () => {
    const csvHeaders = "Employee,Client,Clock In,Clock Out,Hours,Rate,Total,Location,Status\n";
    const csvRows = filteredTimeEntries.map(entry => {
      const employee = employees.find(e => e.id === entry.employeeId);
      const client = clients.find(c => c.id === entry.clientId);
      const hours = entry.clockOut 
        ? ((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)).toFixed(2)
        : "Active";
      const rate = entry.hourlyRate || "0";
      const total = typeof hours === "string" ? "N/A" : (parseFloat(hours) * parseFloat(rate)).toFixed(2);
      
      return [
        `"${employee?.firstName || ""} ${employee?.lastName || ""}"`,
        `"${client?.companyName || client?.firstName || "N/A"}"`,
        `"${format(new Date(entry.clockIn), "yyyy-MM-dd HH:mm")}"`,
        entry.clockOut ? `"${format(new Date(entry.clockOut), "yyyy-MM-dd HH:mm")}"` : "Active",
        hours,
        rate,
        `$${total}`,
        `"${entry.jobSiteAddress || "N/A"}"`,
        entry.invoiceId ? "billed" : "unbilled"
      ].join(",");
    }).join("\n");

    const csv = csvHeaders + csvRows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timesheet-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Timesheet Exported",
      description: "Timesheet has been exported to CSV",
    });
  };

  const activeTimeEntries = filteredTimeEntries.filter(entry => !entry.clockOut);
  const completedTimeEntries = filteredTimeEntries.filter(entry => entry.clockOut);

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] }),
    ]);
  };

  if (isLoading || !isAuthenticated) {
    return <ResponsiveLoading fullScreen message="Loading Time Clock..." />;
  }

  const pageContent = (
    <div className="min-h-screen w-full bg-background">
      <PageHeader
        title="Time Clock"
        description="Manage employee clock-ins and timesheet reports"
        align="center"
      >
        {(workspaceRole === 'org_owner' || workspaceRole === 'department_manager') && (
              <Dialog open={clockInDialogOpen} onOpenChange={setClockInDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="min-h-[44px]" data-testid="button-clock-in">
                    <Play className="mr-2 h-4 w-4" />
                    Clock In
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-clock-in">
            <DialogHeader>
              <DialogTitle>Clock In Employee</DialogTitle>
              <DialogDescription>
                Start tracking time for an employee
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Employee *</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger data-testid="select-clockin-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(employee => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName} - {employee.role || "Staff"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Shift (Optional)</Label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger data-testid="select-clockin-shift">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {shifts
                      .filter(shift => !selectedEmployee || shift.employeeId === selectedEmployee)
                      .map(shift => {
                        const shiftEmployee = employees.find(e => e.id === shift.employeeId);
                        const shiftClient = clients.find(c => c.id === shift.clientId);
                        const startTime = typeof shift.startTime === 'string' ? shift.startTime : shift.startTime.toISOString();
                        return (
                          <SelectItem key={shift.id} value={shift.id}>
                            {shiftEmployee?.firstName} - {format(parseISO(startTime), "MMM d, h:mm a")}
                            {shiftClient && ` (${shiftClient.firstName} ${shiftClient.lastName})`}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Client (Optional)</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger data-testid="select-clockin-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.firstName} {client.lastName}
                        {client.companyName && ` - ${client.companyName}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes about this time entry"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="textarea-clockin-notes"
                />
              </div>

              {/* GPS Verification */}
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <Label className="text-base font-semibold">GPS Verification</Label>
                  </div>
                  {gpsData && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  )}
                </div>

                {isCapturingGPS && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    Capturing location...
                  </div>
                )}

                {gpsError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {gpsError}
                    <Button size="sm" variant="outline" onClick={captureGPS} className="ml-auto">
                      Retry
                    </Button>
                  </div>
                )}

                {gpsData && !isCapturingGPS && (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latitude:</span>
                      <span className="font-mono">{gpsData.latitude.toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Longitude:</span>
                      <span className="font-mono">{gpsData.longitude.toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accuracy:</span>
                      <span className={gpsData.accuracy > 50 ? "text-destructive font-semibold" : "text-primary font-semibold"}>
                        ±{Math.round(gpsData.accuracy)}m
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Photo Verification */}
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    <Label className="text-base font-semibold">Photo Verification</Label>
                  </div>
                  {capturedPhoto && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Captured
                    </Badge>
                  )}
                </div>

                {!capturedPhoto && !isCameraActive && (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={startCamera}
                    data-testid="button-start-camera"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Take Verification Photo
                  </Button>
                )}

                {isCameraActive && (
                  <div className="space-y-3">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-lg bg-black"
                    />
                    <div className="flex gap-2">
                      <Button 
                        variant="default" 
                        className="flex-1" 
                        onClick={capturePhoto}
                        data-testid="button-capture-photo"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Capture Photo
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={stopCamera}
                        data-testid="button-cancel-camera"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {capturedPhoto && (
                  <div className="space-y-3">
                    <img 
                      src={capturedPhoto} 
                      alt="Verification photo" 
                      className="w-full rounded-lg"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={retakePhoto}
                      className="w-full"
                      data-testid="button-retake-photo"
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}
                
                {/* Hidden canvas for photo capture */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              <Button
                onClick={handleClockIn}
                disabled={clockInMutation.isPending || !gpsData || !capturedPhoto}
                className="w-full"
                data-testid="button-submit-clockin"
              >
                {clockInMutation.isPending ? "Clocking In..." : "Start Tracking"}
              </Button>

              {(!gpsData || !capturedPhoto) && (
                <p className="text-xs text-muted-foreground text-center">
                  GPS location and photo verification are required to clock in
                </p>
              )}
                </div>
              </DialogContent>
            </Dialog>
        )}
      </PageHeader>

      <div className="mobile-container p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
        {/* My Status Card - Active Session with Break Controls */}
        {myStatus && myStatus.entry && (
          <Card data-testid="card-my-status">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base sm:text-lg">My Active Session</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    You are currently clocked in
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3 sm:p-6">
              {/* Session Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Started: {format(new Date(myStatus.entry.clockIn), "MMM d, h:mm a")}</span>
                </div>
                {myStatus.entry.client && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{myStatus.entry.client}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-2xl font-bold">
                    {Math.floor((now - new Date(myStatus.entry.clockIn).getTime()) / 3600000)}h {Math.floor(((now - new Date(myStatus.entry.clockIn).getTime()) % 3600000) / 60000)}m
                  </span>
                  <span className="text-muted-foreground">elapsed</span>
                </div>
                
                {/* Verification Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {myStatus.entry.gpsLatitude && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <MapPin className="h-3 w-3" />
                      GPS Verified
                    </Badge>
                  )}
                  {myStatus.entry.clockInPhotoUrl && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Camera className="h-3 w-3" />
                      Photo Captured
                    </Badge>
                  )}
                </div>
              </div>

              {/* Break Controls */}
              <div className="border-t pt-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Break Management</h4>
                  
                  {myStatus.activeBreak ? (
                    // Active break - show timer and resume button
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {myStatus.activeBreak.breakType === 'meal' ? 'Meal Break' : 'Rest Break'} - In Progress
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono">
                          {Math.floor((now - new Date(myStatus.activeBreak.startTime).getTime()) / 60000)}m break time
                        </span>
                      </div>
                      <Button
                        onClick={() => endBreakMutation.mutate()}
                        disabled={endBreakMutation.isPending}
                        className="w-full"
                        variant="default"
                        data-testid="button-end-break"
                      >
                        {endBreakMutation.isPending ? "Resuming..." : "Resume Work"}
                      </Button>
                    </div>
                  ) : (
                    // No active break - show start break buttons
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => startBreakMutation.mutate({ breakType: 'meal' })}
                        disabled={startBreakMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-start-meal-break"
                      >
                        {startBreakMutation.isPending ? "Starting..." : "Meal Break"}
                      </Button>
                      <Button
                        onClick={() => startBreakMutation.mutate({ breakType: 'rest' })}
                        disabled={startBreakMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-start-rest-break"
                      >
                        {startBreakMutation.isPending ? "Starting..." : "Rest Break"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Clock Out Button */}
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => clockOutMutation.mutate({ timeEntryId: myStatus.entry.id })}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out-my-status"
                >
                  <Square className="mr-2 h-4 w-4" />
                  {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sling-style Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mobile-stack sm:flex-row flex-wrap">
            {/* Date Range */}
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[150px] touch-target" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="2weeks">Last 2 Weeks</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Employee */}
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-full sm:w-[180px] touch-target" data-testid="select-filter-employee">
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
            </div>

            {/* Filter by Group/Client */}
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-full sm:w-[180px] touch-target" data-testid="select-filter-group">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName || `${client.firstName} ${client.lastName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-2 flex-1 min-w-[130px]">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[150px] touch-target" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="unbilled">Unbilled</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:ml-auto min-w-[130px]">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Sort by:</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[150px] touch-target" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Date (Newest)</SelectItem>
                  <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                  <SelectItem value="employee">Employee Name</SelectItem>
                  <SelectItem value="hours">Hours Worked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Button */}
            <Button 
              variant="default" 
              className="bg-primary hover:bg-primary w-full sm:w-auto min-h-[44px]"
              onClick={handleExportTimesheet}
              data-testid="button-export-timesheet"
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="whitespace-nowrap">EXPORT TIMESHEET</span>
            </Button>
          </div>

          {/* Results summary */}
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs sm:text-sm text-muted-foreground break-anywhere">
              Showing <strong>{filteredTimeEntries.length}</strong> time {filteredTimeEntries.length === 1 ? "entry" : "entries"}
              {filterEmployee !== "all" && ` for ${employees.find(e => e.id === filterEmployee)?.firstName || "selected employee"}`}
              {filterGroup !== "all" && ` at ${clients.find(c => c.id === filterGroup)?.companyName || "selected location"}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pending Approvals - Manager Only */}
      {workspaceRole !== 'staff' && timeEntries.filter(e => e.approvalStatus === 'pending').length > 0 && (
        <Card data-testid="card-pending-approvals">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base sm:text-lg">Pending Approvals</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {timeEntries.filter(e => e.approvalStatus === 'pending').length} time {timeEntries.filter(e => e.approvalStatus === 'pending').length === 1 ? 'entry' : 'entries'} waiting for approval
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-6">
            {timeEntries.filter(e => e.approvalStatus === 'pending').map(entry => {
              const employee = employees.find(e => e.id === entry.employeeId);
              const client = clients.find(c => c.id === entry.clientId);
              const hoursWorked = entry.clockOut 
                ? ((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3600000).toFixed(2)
                : '0.00';
              
              return (
                <Card key={entry.id} className="p-3 sm:p-4" data-testid={`card-pending-entry-${entry.id}`}>
                  <div className="space-y-3">
                    {/* Employee Info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm">{employee?.firstName} {employee?.lastName}</span>
                          <Badge variant="secondary" className="text-xs">Pending Review</Badge>
                        </div>
                        {client && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Building2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{client.companyName || `${client.firstName} ${client.lastName}`}</span>
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                          <span>{format(new Date(entry.clockIn), "MMM d, h:mm a")}</span>
                          <span className="hidden sm:inline">→</span>
                          <span>{entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : 'In Progress'}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="font-semibold">{hoursWorked}h</span>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                        )}
                        
                        {/* Verification Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.gpsLatitude && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <MapPin className="h-3 w-3" />
                              GPS
                            </Badge>
                          )}
                          {entry.clockInPhotoUrl && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Camera className="h-3 w-3" />
                              Photo
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Approval Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        onClick={() => approveMutation.mutate(entry.id)}
                        disabled={approveMutation.isPending}
                        variant="default"
                        size="sm"
                        className="flex-1"
                        data-testid={`button-approve-${entry.id}`}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {approveMutation.isPending ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        onClick={() => {
                          setRejectingEntryId(entry.id);
                          setRejectDialogOpen(true);
                        }}
                        disabled={rejectMutation.isPending}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        data-testid={`button-reject-${entry.id}`}
                      >
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Active Team Monitoring - Manager Only */}
      {workspaceRole !== 'staff' && activeEmployees.length > 0 && (
        <Card data-testid="card-active-team">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base sm:text-lg">Active Team</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {activeEmployees.length} {activeEmployees.length === 1 ? 'employee' : 'employees'} currently clocked in
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-6">
            {activeEmployees.map((entry: any) => {
              const hoursElapsed = entry.hoursSoFar ? parseFloat(entry.hoursSoFar).toFixed(2) : '0.00';
              
              return (
                <Card key={entry.entryId} className="p-3 sm:p-4" data-testid={`card-active-team-${entry.entryId}`}>
                  <div className="space-y-3">
                    {/* Employee Info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm">{entry.employeeName}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.isOnBreak ? 'On Break' : 'Working'}
                          </Badge>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span>Started: {format(new Date(entry.clockIn), "h:mm a")}</span>
                          </div>
                          <span className="hidden sm:inline">•</span>
                          <span className="font-mono font-semibold">{hoursElapsed}h elapsed</span>
                        </div>
                        
                        {/* Verification Status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs gap-1">
                            <MapPin className="h-3 w-3" />
                            GPS Verified
                          </Badge>
                          <Badge variant="outline" className="text-xs gap-1">
                            <Camera className="h-3 w-3" />
                            Photo Captured
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Manager Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      {entry.isOnBreak && (
                        <Button
                          onClick={() => endBreakMutation.mutate()}
                          disabled={endBreakMutation.isPending}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          data-testid={`button-end-break-${entry.entryId}`}
                        >
                          End Break
                        </Button>
                      )}
                      <Button
                        onClick={() => clockOutMutation.mutate({ timeEntryId: entry.entryId })}
                        disabled={clockOutMutation.isPending}
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        data-testid={`button-force-clock-out-${entry.entryId}`}
                      >
                        <Square className="mr-2 h-4 w-4" />
                        Clock Out
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Completed Time Entries Table */}
      {completedTimeEntries.length > 0 && (
        <Card data-testid="card-completed-entries">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Completed Time Entries</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{completedTimeEntries.length} completed time {completedTimeEntries.length === 1 ? "entry" : "entry"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <div className="mobile-table-wrapper mobile-table-stack">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Employee</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Client</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Clock In</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Clock Out</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Hours</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Total</th>
                    <th className="text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {completedTimeEntries.map(entry => {
                    const employee = employees.find(e => e.id === entry.employeeId);
                    const client = clients.find(c => c.id === entry.clientId);
                    const hours = entry.clockOut 
                      ? ((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)).toFixed(2)
                      : "0";
                    const total = parseFloat(hours) * parseFloat(entry.hourlyRate || "0");

                    return (
                      <tr key={entry.id} className="border-b hover:bg-muted/50" data-testid={`row-entry-${entry.id}`}>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm" data-label="Employee">{employee?.firstName} {employee?.lastName}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm truncate-1" data-label="Client">{client?.companyName || client?.firstName || "N/A"}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm whitespace-nowrap" data-label="Clock In">{format(new Date(entry.clockIn), "MMM d, h:mm a")}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm whitespace-nowrap" data-label="Clock Out">{entry.clockOut && format(new Date(entry.clockOut), "MMM d, h:mm a")}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm" data-label="Hours">{hours}h</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm font-semibold" data-label="Total">${total.toFixed(2)}</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm" data-label="Status">
                          <Badge variant={entry.invoiceId ? "default" : "secondary"} className="text-xs">
                            {entry.invoiceId ? "billed" : "unbilled"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {filteredTimeEntries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Time Entries Found</h3>
            <p className="text-muted-foreground mb-6">
              {dateRange !== "all" ? "Try adjusting your filters to see more results." : "Start tracking time by clocking in an employee."}
            </p>
            <Button onClick={() => setClockInDialogOpen(true)}>
              <Play className="mr-2 h-4 w-4" />
              Clock In Employee
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Time Entry</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this time entry. The employee will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Enter reason for rejection (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                data-testid="input-reject-reason"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
                setRejectingEntryId(null);
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectingEntryId && rejectReason.trim()) {
                  rejectMutation.mutate({ 
                    timeEntryId: rejectingEntryId, 
                    reason: rejectReason 
                  });
                  setRejectDialogOpen(false);
                  setRejectReason("");
                  setRejectingEntryId(null);
                }
              }}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Entry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );

  return isMobile ? (
    <MobilePageWrapper onRefresh={handleRefresh} enablePullToRefresh>
      {pageContent}
    </MobilePageWrapper>
  ) : (
    pageContent
  );
}
