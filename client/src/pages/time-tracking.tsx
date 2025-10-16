import { useState, useEffect } from "react";
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
import { Clock, Play, Square, Calendar, DollarSign, User, Building2 } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { Employee, Client, TimeEntry, Shift } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function TimeTracking() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [clockInDialogOpen, setClockInDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedShift, setSelectedShift] = useState<string>("");
  const [now, setNow] = useState(Date.now());

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

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
    enabled: isAuthenticated,
  });

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

  const activeTimeEntries = timeEntries.filter(entry => !entry.clockOut);
  const completedTimeEntries = timeEntries.filter(entry => entry.clockOut);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-timetracking-title">
                Time Tracking
              </h2>
              <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]" data-testid="text-timetracking-subtitle">
              Manage employee clock-ins and timesheet reports
            </p>
          </div>
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
        </div>

        {/* Active Time Entries */}
        {activeTimeEntries.length > 0 && (
          <Card data-testid="card-active-entries">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Active Time Tracking</CardTitle>
                  <CardDescription>{activeTimeEntries.length} employee(s) currently clocked in</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTimeEntries.map(entry => {
                const employee = employees.find(e => e.id === entry.employeeId);
                const client = clients.find(c => c.id === entry.clientId);
                return (
                  <Card key={entry.id} className="p-4 hover-elevate" data-testid={`card-active-entry-${entry.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {employee?.firstName} {employee?.lastName}
                          </span>
                          <Badge variant="outline">{employee?.role || "Staff"}</Badge>
                        </div>
                        {client && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                            <span>
                              {client.firstName} {client.lastName}
                              {client.companyName && ` - ${client.companyName}`}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span key={now}>Started {formatDistanceToNow(parseISO(typeof entry.clockIn === 'string' ? entry.clockIn : entry.clockIn.toISOString()), { addSuffix: false })} ago</span>
                        </div>
                        {entry.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{entry.notes}</p>
                        )}
                      </div>
                      <Button
                        onClick={() => clockOutMutation.mutate(entry.id)}
                        disabled={clockOutMutation.isPending}
                        variant="destructive"
                        data-testid={`button-clockout-${entry.id}`}
                      >
                        <Square className="mr-2 h-4 w-4" />
                        Clock Out
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Completed Time Entries */}
        <Card data-testid="card-timesheet">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Timesheet</CardTitle>
                <CardDescription>Completed time entries and hours worked</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {completedTimeEntries.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground" data-testid="text-no-completed-entries">
                  No completed time entries yet
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Clock in employees to start tracking their time
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedTimeEntries.map(entry => {
                  const employee = employees.find(e => e.id === entry.employeeId);
                  const client = clients.find(c => c.id === entry.clientId);
                  return (
                    <Card key={entry.id} className="p-4 hover-elevate" data-testid={`card-timesheet-entry-${entry.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {employee?.firstName} {employee?.lastName}
                            </span>
                            <Badge variant="outline">{employee?.role || "Staff"}</Badge>
                          </div>
                          {client && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="h-4 w-4" />
                              <span>
                                {client.firstName} {client.lastName}
                                {client.companyName && ` - ${client.companyName}`}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {format(parseISO(typeof entry.clockIn === 'string' ? entry.clockIn : entry.clockIn.toISOString()), "MMM d, yyyy h:mm a")} - 
                              {entry.clockOut && format(parseISO(typeof entry.clockOut === 'string' ? entry.clockOut : entry.clockOut.toISOString()), " h:mm a")}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{entry.notes}</p>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{entry.totalHours} hrs</span>
                          </div>
                          {entry.totalAmount && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold">${entry.totalAmount}</span>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            ${entry.hourlyRate}/hr
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
