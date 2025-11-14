import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Shift, Employee as EmployeeType, Client } from '@shared/schema';
import { 
  Calendar, Clock, Users, Edit2, Trash2, Plus, Download, Bot, 
  CheckCircle, AlertCircle, BarChart3, X, MessageSquare, ChevronLeft,
  ChevronRight, Menu, Settings, Bell, Shield, DollarSign, 
  User, Building, UserCheck, UserX, UserPlus, Clock3, Move,
  XCircle, RefreshCw, Eye, Target, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEmployee } from '@/hooks/useEmployee';
import { useToast } from '@/hooks/use-toast';
import MobileLoading from '@/components/mobile-loading';

const MobileManagerSchedule = () => {
  const { employee: currentUser } = useEmployee();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showShiftDetails, setShowShiftDetails] = useState(false);

  // Calculate week boundaries for data fetching
  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Fetch shifts for current week
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(
        `/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    },
  });

  // Fetch employees
  const { data: employees = [], isLoading: employeesLoading } = useQuery<EmployeeType[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  const [pendingApprovals] = useState([
    { id: 1, type: 'time_off', employeeName: 'Sarah Johnson', reason: 'Vacation Request', dates: 'Nov 20-22', status: 'pending' },
    { id: 2, type: 'shift_swap', employeeName: 'Mike Chen', reason: 'Swap with Lisa', date: 'Nov 15', status: 'pending' },
  ]);

  // Approve shift mutation
  const approveShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest(`/api/shifts/${shiftId}`, 'PATCH', { 
        approvalStatus: 'approved'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: 'Shift approved successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to approve shift', variant: 'destructive' });
    }
  });

  // Deny shift mutation
  const denyShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest(`/api/shifts/${shiftId}`, 'PATCH', { 
        approvalStatus: 'denied'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: 'Shift denied' });
    },
    onError: () => {
      toast({ title: 'Failed to deny shift', variant: 'destructive' });
    }
  });

  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest(`/api/shifts/${shiftId}`, 'DELETE', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setShowShiftDetails(false);
      toast({ title: 'Shift deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete shift', variant: 'destructive' });
    }
  });

  const handleApproveShift = (shiftId: string) => {
    approveShiftMutation.mutate(shiftId);
  };

  const handleDenyShift = (shiftId: string) => {
    denyShiftMutation.mutate(shiftId);
  };

  const handleDeleteShift = (shiftId: string) => {
    deleteShiftMutation.mutate(shiftId);
  };

  // Helper: Format hour to 12-hour time
  const formatTime = (hour: number) => {
    return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
  };

  // Helper: Compare dates (ignoring time)
  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Helper: Get employee by UUID
  const getEmployee = (employeeId: string | null): EmployeeType | undefined => 
    employeeId ? employees.find(e => e.id === employeeId) : undefined;

  // Helper: Get client by UUID  
  const getClient = (clientId: string | null): Client | undefined =>
    clientId ? clients.find(c => c.id === clientId) : undefined;

  // Helper: Get employee display name
  const getEmployeeDisplayName = (employee: EmployeeType): string =>
    `${employee.firstName} ${employee.lastName}`;

  // Helper: Generate deterministic color from employee ID
  const getEmployeeColor = (employeeId: string): string => {
    const colors = [
      'hsl(160 84% 39%)', // Emerald
      'hsl(188 96% 57%)', // Cyan
      'hsl(160 92% 32%)', // Dark emerald
      'hsl(215 20% 47%)', // Slate
      'hsl(213 94% 68%)', // Blue
      'hsl(280 89% 66%)', // Purple
    ];
    const hash = employeeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Helper: Get shift duration in hours
  const getShiftDuration = (shift: Shift): number => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  };

  // Filter shifts for current date (using startTime instead of mock date field)
  const getShiftsForDay = (date: Date) => {
    return shifts.filter(s => {
      const shiftDate = new Date(s.startTime);
      return isSameDay(shiftDate, date);
    }).sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  };

  const todayShifts = getShiftsForDay(currentDate);
  const pendingShifts = todayShifts.filter(s => s.approvalStatus === 'pending');

  // Calculate dynamic stats (using real payRate and computed duration)
  const totalLaborCost = todayShifts.reduce((total, shift) => {
    const employee = shift.employeeId ? getEmployee(shift.employeeId) : null;
    if (!employee || !employee.payRate) return total;
    const duration = getShiftDuration(shift);
    return total + (parseFloat(employee.payRate) * duration);
  }, 0);

  // Format current date
  const formattedDate = currentDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });

  // Combined loading state
  const isLoading = shiftsLoading || employeesLoading || clientsLoading;

  // Check if user is manager/admin
  const isManager = currentUser?.role === 'Manager' || currentUser?.role === 'Admin';

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isManager) {
    // Staff read-only view placeholder
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="gradient-mobile-header text-white sticky top-0 z-40 shadow-lg">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">My Schedule</h1>
              <User className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="text-center text-muted-foreground py-8">
            Staff view under construction
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mobile Header - AutoForce Emerald/Cyan Gradient */}
      <div className="gradient-mobile-header text-white sticky top-0 z-40 shadow-lg">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="p-2 hover:bg-white/20 rounded-lg active:scale-95 transition-transform"
              data-testid="button-open-menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <h1 className="text-lg font-bold">Manager</h1>
            </div>
            <button 
              onClick={() => setShowNotifications(!showNotifications)} 
              className="p-2 hover:bg-white/20 rounded-lg relative active:scale-95 transition-transform"
              data-testid="button-notifications"
            >
              <Bell className="w-6 h-6" />
              {pendingApprovals.filter(a => a.status === 'pending').length > 0 && (
                <span 
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold"
                  data-testid="badge-notification-count"
                >
                  {pendingApprovals.filter(a => a.status === 'pending').length}
                </span>
              )}
            </button>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                const newDate = new Date(currentDate.getTime()); // Clone date properly
                newDate.setDate(newDate.getDate() - 1);
                setCurrentDate(newDate);
              }}
              className="p-2 hover:bg-white/20 rounded-lg active:scale-95 transition-transform"
              data-testid="button-prev-day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center" data-testid="text-current-date">
              <div className="text-sm opacity-90">
                {isSameDay(currentDate, new Date()) ? 'Today' : formattedDate.split(',')[0]}
              </div>
              <div className="font-bold">{formattedDate}</div>
            </div>
            <button 
              onClick={() => {
                const newDate = new Date(currentDate.getTime()); // Clone date properly
                newDate.setDate(newDate.getDate() + 1);
                setCurrentDate(newDate);
              }}
              className="p-2 hover:bg-white/20 rounded-lg active:scale-95 transition-transform"
              data-testid="button-next-day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white/10 backdrop-blur px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1" data-testid="stat-shifts-count">
            <Users className="w-3 h-3" />
            <span>{todayShifts.length} Shifts</span>
          </div>
          <div className="flex items-center space-x-1" data-testid="stat-pending-count">
            <Clock3 className="w-3 h-3" />
            <span>{pendingShifts.length} Pending</span>
          </div>
          <div className="flex items-center space-x-1" data-testid="stat-labor-cost">
            <DollarSign className="w-3 h-3" />
            <span>${totalLaborCost.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-4">
        {/* Quick Action Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => setShowApprovals(true)}
            className="bg-card rounded-lg p-4 shadow-sm border-2 border-orange-200 active:scale-95 transition-transform"
            data-testid="button-approvals"
          >
            <div className="flex items-center justify-between mb-2">
              <Clock3 className="w-6 h-6 text-orange-600" />
              {pendingShifts.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {pendingShifts.length}
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-foreground">Approvals</div>
            <div className="text-xs text-muted-foreground">Review shifts</div>
          </button>

          <button
            onClick={() => setShowReports(true)}
            className="bg-card rounded-lg p-4 shadow-sm border-2 border-blue-200 active:scale-95 transition-transform"
            data-testid="button-reports"
          >
            <BarChart3 className="w-6 h-6 text-blue-600 mb-2" />
            <div className="text-sm font-bold text-foreground">Reports</div>
            <div className="text-xs text-muted-foreground">View analytics</div>
          </button>

          <button
            onClick={() => setShowEmployeeList(true)}
            className="bg-card rounded-lg p-4 shadow-sm border-2 border-green-200 active:scale-95 transition-transform"
            data-testid="button-team"
          >
            <Users className="w-6 h-6 text-green-600 mb-2" />
            <div className="text-sm font-bold text-foreground">Team</div>
            <div className="text-xs text-muted-foreground">Manage staff</div>
          </button>

          <button
            onClick={() => setShowAIPanel(true)}
            className="bg-card rounded-lg p-4 shadow-sm border-2 border-purple-200 active:scale-95 transition-transform"
            data-testid="button-ai-tools"
          >
            <Bot className="w-6 h-6 text-purple-600 mb-2" />
            <div className="text-sm font-bold text-foreground">AI Tools</div>
            <div className="text-xs text-muted-foreground">Automation</div>
          </button>
        </div>

        {/* Today's Schedule */}
        <div className="bg-card rounded-lg shadow-sm overflow-hidden border border-border">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-foreground">Today's Schedule</h3>
            <Button
              onClick={() => setShowShiftModal(true)}
              size="sm"
              className="gradient-mobile-cta text-white"
              data-testid="button-add-shift"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          <div className="divide-y divide-border">
            {todayShifts.length === 0 ? (
              <div className="p-8 text-center" data-testid="empty-schedule">
                <Calendar className="w-16 h-16 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-foreground font-medium mb-1">No shifts scheduled</p>
                <p className="text-sm text-muted-foreground">
                  No shifts found for {formattedDate}
                </p>
                <Button
                  onClick={() => setShowShiftModal(true)}
                  size="sm"
                  className="gradient-mobile-cta text-white mt-4"
                  data-testid="button-add-first-shift"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Shift
                </Button>
              </div>
            ) : (
              todayShifts.map(shift => {
                const employee = shift.employeeId ? getEmployee(shift.employeeId) : null;
                const isPending = shift.approvalStatus === 'pending';
                
                return (
                  <div
                    key={shift.id}
                    onClick={() => {
                      setSelectedShift(shift);
                      setShowShiftDetails(true);
                    }}
                    className="p-4 active:bg-muted cursor-pointer"
                    data-testid={`shift-${shift.id}`}
                  >
                  <div className="flex items-start space-x-3">
                    <div className="text-center min-w-[60px]" data-testid={`shift-time-${shift.id}`}>
                      <div className="text-sm font-bold text-foreground" data-testid={`shift-start-time-${shift.id}`}>
                        {formatTime(shift.startHour)}
                      </div>
                      <div className="text-xs text-muted-foreground">to</div>
                      <div className="text-sm font-bold text-foreground" data-testid={`shift-end-time-${shift.id}`}>
                        {formatTime(shift.startHour + shift.duration)}
                      </div>
                    </div>

                    <div 
                      className={cn(
                        "flex-1 rounded-lg p-3 border-l-4",
                        shift.isOpenShift && "bg-orange-50 dark:bg-orange-950/20 border-l-orange-500",
                        isPending && !shift.isOpenShift && "bg-yellow-50 dark:bg-yellow-950/20 border-l-yellow-500",
                        !isPending && !shift.isOpenShift && "bg-green-50 dark:bg-green-950/20 border-l-green-500"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        {shift.isOpenShift ? (
                          <div className="flex items-center space-x-2" data-testid={`shift-open-badge-${shift.id}`}>
                            <AlertCircle className="w-4 h-4 text-orange-600" />
                            <span className="font-bold text-orange-900 dark:text-orange-400 text-sm">OPEN</span>
                          </div>
                        ) : employee ? (
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: employee.color }}
                              data-testid={`shift-employee-avatar-${shift.id}`}
                            >
                              {employee.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <div className="font-bold text-foreground text-sm" data-testid={`shift-employee-name-${shift.id}`}>
                                {employee.name}
                              </div>
                              <div className="text-xs text-muted-foreground" data-testid={`shift-position-${shift.id}`}>
                                {shift.position}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        
                        {isPending && (
                          <span 
                            className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full"
                            data-testid={`shift-status-pending-${shift.id}`}
                          >
                            Pending
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <Building className="w-3 h-3" />
                          <span data-testid={`shift-client-${shift.id}`}>{shift.client}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span data-testid={`shift-duration-${shift.id}`}>{shift.duration}h</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Approvals Drawer */}
      {showApprovals && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowApprovals(false)}
        >
          <div 
            className="bg-card rounded-t-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gradient-mobile-header text-white p-4 rounded-t-2xl sticky top-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Pending Approvals</h2>
                  <p className="text-sm opacity-90">{pendingShifts.length} items need review</p>
                </div>
                <button 
                  onClick={() => setShowApprovals(false)} 
                  className="p-2 hover:bg-white/20 rounded-lg"
                  data-testid="button-close-approvals"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {pendingShifts.map(shift => {
                const employee = shift.employeeId ? getEmployee(shift.employeeId) : null;
                return (
                  <div key={shift.id} className="bg-card border-2 border-orange-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {employee && (
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: employee.color }}
                          >
                            {employee.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-foreground">{employee?.name || 'Open Shift'}</div>
                          <div className="text-sm text-muted-foreground">{shift.position} • {shift.client}</div>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {formatTime(shift.startHour)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleApproveShift(shift.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid={`button-approve-${shift.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleDenyShift(shift.id)}
                        variant="destructive"
                        data-testid={`button-deny-${shift.id}`}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Deny
                      </Button>
                    </div>
                  </div>
                );
              })}

              {pendingShifts.length === 0 && (
                <div className="text-center py-8" data-testid="empty-approvals">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="text-foreground font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No pending approvals</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Panel Drawer - Placeholder */}
      {showAIPanel && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowAIPanel(false)}
        >
          <div 
            className="bg-card rounded-t-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gradient-mobile-header text-white p-4 rounded-t-2xl sticky top-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">AI Automation</h2>
                  <p className="text-sm opacity-90">Smart scheduling tools</p>
                </div>
                <button 
                  onClick={() => setShowAIPanel(false)} 
                  className="p-2 hover:bg-white/20 rounded-lg"
                  data-testid="button-close-ai-panel"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 text-center" data-testid="ai-panel-placeholder">
              <Bot className="w-16 h-16 mx-auto mb-4 text-purple-600" />
              <p className="text-muted-foreground">AI features integration in progress</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileManagerSchedule;
