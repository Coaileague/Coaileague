import { useState, useEffect, useMemo } from "react";
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
import { Clock, Play, Square, Calendar, DollarSign, User, Building2, Download, Filter, Home, ArrowLeft } from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileLoading } from "@/components/mobile-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "wouter";

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
  const workspaceRole = currentEmployee?.workspaceRole || 'employee';

  // Role-based filtering: employees see only their own entries
  const timeEntries = useMemo(() => {
    if (workspaceRole === 'employee') {
      // Employees see only their own time entries
      return allTimeEntries.filter(entry => entry.employeeId === currentEmployee?.id);
    }
    // Managers and owners see all entries
    return allTimeEntries;
  }, [allTimeEntries, workspaceRole, currentEmployee]);

  const clockInMutation = useMutation({
    mutationFn: async (data: { employeeId: string; clientId?: string; shiftId?: string; notes?: string; hourlyRate: string }) => {
      return apiRequest("POST", "/api/time-entries/clock-in", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({
        title: "Clocked In",
        description: "Time tracking started successfully",
      });
      setClockInDialogOpen(false);
      setSelectedEmployee("");
      setSelectedClient("");
      setSelectedShift("");
      setNotes("");
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
    mutationFn: async (timeEntryId: string) => {
      return apiRequest("PATCH", `/api/time-entries/${timeEntryId}/clock-out`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
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

  const handleClockIn = () => {
    if (!selectedEmployee) {
      toast({
        title: "Error",
        description: "Please select an employee",
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
    return <MobileLoading fullScreen message="Loading Time Clock..." />;
  }

  const pageContent = (
    <div className="min-h-screen w-full bg-background">
      <div className="mobile-container p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
        {/* Header with Navigation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/dashboard">
              <Button variant="outline" size="icon" className="touch-target shrink-0" data-testid="button-back-dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-0.5 sm:mb-1 break-anywhere" data-testid="text-timetracking-title">
                Time Clock
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground break-anywhere" data-testid="text-timetracking-subtitle">
                Manage employee clock-ins and timesheet reports
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/dashboard" className="flex-1 sm:flex-initial">
              <Button variant="outline" size="sm" className="w-full sm:w-auto touch-target" data-testid="button-home">
                <Home className="mr-2 h-4 w-4" />
                <span className="whitespace-nowrap">Dashboard</span>
              </Button>
            </Link>
            {(workspaceRole === 'owner' || workspaceRole === 'manager') && (
              <Dialog open={clockInDialogOpen} onOpenChange={setClockInDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-clock-in">
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

              <Button
                onClick={handleClockIn}
                disabled={clockInMutation.isPending}
                className="w-full"
                data-testid="button-submit-clockin"
              >
                {clockInMutation.isPending ? "Clocking In..." : "Start Tracking"}
              </Button>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </div>

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
              className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto touch-target"
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

      {/* Active Time Entries */}
      {activeTimeEntries.length > 0 && (
        <Card data-testid="card-active-entries">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base sm:text-lg break-anywhere">Active Time Tracking</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{activeTimeEntries.length} employee(s) currently clocked in</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
            {activeTimeEntries.map(entry => {
              const employee = employees.find(e => e.id === entry.employeeId);
              const client = clients.find(c => c.id === entry.clientId);
              const elapsed = Math.floor((now - new Date(entry.clockIn).getTime()) / 1000 / 60);
              const hours = Math.floor(elapsed / 60);
              const minutes = elapsed % 60;
              
              return (
                <Card key={entry.id} className="p-3 sm:p-4 hover-elevate touch-friendly" data-testid={`card-active-entry-${entry.id}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm sm:text-base break-anywhere">{employee?.firstName} {employee?.lastName}</span>
                        <Badge variant="outline" className="text-xs">Active</Badge>
                      </div>
                      {client && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="truncate-1">{client.companyName || `${client.firstName} ${client.lastName}`}</span>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span className="whitespace-nowrap">Started: {format(new Date(entry.clockIn), "MMM d, h:mm a")}</span>
                        </div>
                        <span className="hidden sm:inline">•</span>
                        <span className="font-mono whitespace-nowrap">{hours}h {minutes}m elapsed</span>
                      </div>
                      {entry.hourlyRate && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                          <DollarSign className="h-4 w-4 shrink-0" />
                          <span className="break-anywhere">${entry.hourlyRate}/hr • Estimated: ${(parseFloat(entry.hourlyRate) * (elapsed / 60)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full sm:w-auto touch-target shrink-0"
                      onClick={() => clockOutMutation.mutate(entry.id)}
                      disabled={clockOutMutation.isPending}
                      data-testid={`button-clock-out-${entry.id}`}
                    >
                      <Square className="mr-2 h-4 w-4" />
                      <span className="whitespace-nowrap">Clock Out</span>
                    </Button>
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
