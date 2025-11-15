import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Calendar, Clock, Users, ChevronLeft, ChevronRight, User, Building2,
  MapPin, FileText, Camera, CheckSquare, ArrowLeft, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmployee } from '@/hooks/useEmployee';
import { useClientLookup } from '@/hooks/useClients';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { cn } from '@/lib/utils';
import type { Shift, Employee, Client } from '@shared/schema';

type ViewMode = 'my' | 'team';

export default function DailySchedule() {
  const [, setLocation] = useLocation();
  const { employee: currentEmployee, isLoading: isEmployeeLoading } = useEmployee();
  const [viewMode, setViewMode] = useState<ViewMode>('my');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients
  const { data: clients = [] } = useClientLookup();

  // Fetch shifts
  const { data: shifts = [], isLoading: isShiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts'],
  });

  // Check if user is manager/admin (can view team schedule) and has workspace access
  const { workspaceRole, isPlatformStaff, workspaceId, isLoading: isAccessLoading } = useWorkspaceAccess();
  const canSeeTeam = ['org_owner', 'org_admin', 'department_manager'].includes(workspaceRole ?? '') || isPlatformStaff;
  const hasWorkspaceAccess = !!workspaceId;

  // Show loading state while checking access and employee
  if (isEmployeeLoading || isAccessLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        </div>
      </div>
    );
  }

  // Redirect if no workspace access
  if (!hasWorkspaceAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h3 className="font-semibold text-lg mb-2">Access Denied</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You don't have access to this workspace's schedule.
            </p>
            <Button onClick={() => setLocation('/dashboard')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter shifts for selected date
  const dateStr = selectedDate.toISOString().split('T')[0];
  const todayShifts = useMemo(() => {
    return shifts.filter(shift => {
      const shiftDate = new Date(shift.startTime).toISOString().split('T')[0];
      return shiftDate === dateStr;
    });
  }, [shifts, dateStr]);

  // Filter my shifts vs all shifts
  const displayShifts = useMemo(() => {
    if (viewMode === 'my') {
      // Security: Only show shifts for current employee, or empty if no employee
      if (!currentEmployee) {
        return []; // No employee = no shifts visible
      }
      return todayShifts.filter(s => s.employeeId === currentEmployee.id);
    }
    // Team view: only return shifts if user can see team
    if (canSeeTeam) {
      return todayShifts;
    }
    return []; // No access to team view = no shifts
  }, [todayShifts, viewMode, currentEmployee, canSeeTeam]);

  // Group shifts by employee
  const shiftsByEmployee = useMemo(() => {
    const grouped = new Map<string, Shift[]>();
    displayShifts.forEach(shift => {
      if (shift.employeeId) {
        const existing = grouped.get(shift.employeeId) || [];
        grouped.set(shift.employeeId, [...existing, shift]);
      }
    });
    return grouped;
  }, [displayShifts]);

  // Get unique employees who have shifts today
  const activeEmployees = useMemo(() => {
    return employees.filter(emp => shiftsByEmployee.has(emp.id));
  }, [employees, shiftsByEmployee]);

  const getEmployee = (id: string) => employees.find(e => e.id === id);
  const getClient = (id: string | null) => id ? clients.find(c => c.id === id) : null;

  // Normalize client display name
  const getClientName = (client: Client | undefined | null): string => {
    if (!client) return 'Unknown Client';
    return client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Unknown Client';
  };

  // Normalize employee display name
  const getEmployeeName = (employee: Employee | undefined): string => {
    if (!employee) return 'Unknown';
    return `${employee.firstName} ${employee.lastName}`;
  };

  // Get shift location display text (using description as location info)
  const getShiftLocation = (shift: Shift): string | null => {
    return shift.description || null;
  };

  // Get shift position/title
  const getShiftTitle = (shift: Shift, employee: Employee | undefined): string => {
    return shift.title || employee?.role || 'Shift';
  };

  // Get shift notes (using description)
  const getShiftNotes = (shift: Shift): string | null => {
    return shift.description || null;
  };

  // Check if shift has requirements
  const hasRequirements = (shift: Shift): boolean => {
    return !!(shift.requiresAcknowledgment);
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const getShiftDuration = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const hours = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60) * 10) / 10;
    return `${hours}h`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-primary/10 text-primary border-primary/20';
      case 'in_progress': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'completed': return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
      case 'draft': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const totalHours = useMemo(() => {
    return displayShifts.reduce((acc, shift) => {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }, 0);
  }, [displayShifts]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg">
        <div className="p-4 pb-3">
          {/* Top Row: Back + Title */}
          <div className="flex items-center gap-3 mb-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLocation('/dashboard')}
              className="text-primary-foreground hover:bg-primary-foreground/10"
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <h1 className="text-xl font-black">Daily Schedule</h1>
              </div>
              <p className="text-xs text-primary-foreground/80 mt-0.5">
                {viewMode === 'my' ? 'Your shifts for the day' : 'All team shifts for the day'}
              </p>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex gap-2 bg-primary-foreground/10 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('my')}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all",
                viewMode === 'my' 
                  ? "bg-primary-foreground text-primary shadow-sm" 
                  : "text-primary-foreground/70 hover:text-primary-foreground/90"
              )}
              data-testid="tab-my-schedule"
            >
              <div className="flex items-center justify-center gap-2">
                <User className="h-4 w-4" />
                <span>My Schedule</span>
              </div>
            </button>
            
            {canSeeTeam && (
              <button
                onClick={() => setViewMode('team')}
                className={cn(
                  "flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all",
                  viewMode === 'team' 
                    ? "bg-primary-foreground text-primary shadow-sm" 
                    : "text-primary-foreground/70 hover:text-primary-foreground/90"
                )}
                data-testid="tab-team-schedule"
              >
                <div className="flex items-center justify-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Team Schedule</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Date Navigator */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between bg-primary-foreground/10 rounded-lg p-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => changeDate(-1)}
              className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
              data-testid="button-prev-day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="text-center">
              <div className="text-sm font-bold">{formatDate(selectedDate)}</div>
              <div className="text-xs text-primary-foreground/70">
                {displayShifts.length} {displayShifts.length === 1 ? 'shift' : 'shifts'} • {totalHours.toFixed(1)}h total
              </div>
            </div>
            
            <Button
              size="icon"
              variant="ghost"
              onClick={() => changeDate(1)}
              className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
              data-testid="button-next-day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {displayShifts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="font-semibold text-lg mb-1">No Shifts Scheduled</h3>
                <p className="text-sm text-muted-foreground">
                  {viewMode === 'my' 
                    ? "You don't have any shifts on this day."
                    : "No team members have shifts on this day."}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === 'my' ? (
            // MY SCHEDULE VIEW - List of my shifts
            displayShifts.map((shift) => {
              const client = getClient(shift.clientId);
              const employee = shift.employeeId ? getEmployee(shift.employeeId) : undefined;
              const location = getShiftLocation(shift);
              const title = getShiftTitle(shift, employee);
              const notes = getShiftNotes(shift);
              
              return (
                <Card 
                  key={shift.id} 
                  className="overflow-hidden border-l-4"
                  style={{ borderLeftColor: shift.status === 'in_progress' ? '#10b981' : '#3b82f6' }}
                  data-testid={`shift-card-${shift.id}`}
                >
                  <CardContent className="p-4">
                    {/* Status Badge */}
                    <div className="flex items-start justify-between mb-3">
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs font-semibold", getStatusColor(shift.status || 'scheduled'))}
                      >
                        {shift.status === 'in_progress' ? 'Active Now' : (shift.status || 'scheduled').replace('_', ' ')}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="font-medium">{getShiftDuration(shift)}</span>
                      </div>
                    </div>

                    {/* Client */}
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-base">{getClientName(client)}</span>
                    </div>

                    {/* Position/Title */}
                    {title && (
                      <div className="flex items-center gap-2 mb-2 text-sm">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{title}</span>
                      </div>
                    )}

                    {/* Location */}
                    {location && (
                      <div className="flex items-center gap-2 mb-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{location}</span>
                      </div>
                    )}

                    <Separator className="my-3" />

                    {/* Time */}
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>{formatTime(shift.startTime)} - {formatTime(shift.endTime)}</span>
                    </div>

                    {/* Notes */}
                    {notes && (
                      <div className="mt-3 p-2 bg-muted rounded-md">
                        <p className="text-xs text-muted-foreground">{notes}</p>
                      </div>
                    )}

                    {/* Requirements */}
                    {hasRequirements(shift) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {shift.requiresAcknowledgment && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <CheckSquare className="h-3 w-3" />
                            Acknowledgement Required
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            // TEAM SCHEDULE VIEW - Grouped by employee
            activeEmployees.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-3" />
                  <h3 className="font-semibold text-lg mb-1">No Team Shifts</h3>
                  <p className="text-sm text-muted-foreground">
                    No team members have shifts scheduled for this day.
                  </p>
                </CardContent>
              </Card>
            ) : (
              activeEmployees.map((employee) => {
                const employeeShifts = shiftsByEmployee.get(employee.id) || [];
                const totalEmployeeHours = employeeShifts.reduce((acc, shift) => {
                  const start = new Date(shift.startTime);
                  const end = new Date(shift.endTime);
                  return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                }, 0);
                const employeeName = getEmployeeName(employee);

                return (
                  <Card key={employee.id} className="overflow-hidden" data-testid={`employee-card-${employee.id}`}>
                    <div className="bg-gradient-to-r from-primary/10 to-accent/10 px-4 py-3 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          <span className="font-bold">{employeeName}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {employeeShifts.length} {employeeShifts.length === 1 ? 'shift' : 'shifts'} • {totalEmployeeHours.toFixed(1)}h
                        </Badge>
                      </div>
                      {employee.employeeNumber && (
                        <p className="text-xs text-muted-foreground mt-1">{employee.employeeNumber}</p>
                      )}
                    </div>

                    <CardContent className="p-3 space-y-2">
                      {employeeShifts
                        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                        .map((shift) => {
                          const client = getClient(shift.clientId);
                          const location = getShiftLocation(shift);
                          const title = getShiftTitle(shift, employee);
                          
                          return (
                            <div 
                              key={shift.id} 
                              className="p-3 bg-muted/30 rounded-lg border border-border/50"
                              data-testid={`shift-${shift.id}`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-xs", getStatusColor(shift.status || 'scheduled'))}
                                >
                                  {(shift.status || 'scheduled').replace('_', ' ')}
                                </Badge>
                                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {getShiftDuration(shift)}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mb-1.5">
                                <Building2 className="h-3.5 w-3.5 text-primary" />
                                <span className="text-sm font-semibold">{getClientName(client)}</span>
                              </div>

                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                                </span>
                              </div>

                              {location && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <MapPin className="h-3 w-3" />
                                  <span>{location}</span>
                                </div>
                              )}

                              {title && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <Briefcase className="h-3 w-3" />
                                  <span>{title}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                );
              })
            )
          )}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}
