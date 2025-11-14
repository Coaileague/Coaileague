import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Calendar, Clock, Users, Edit2, Trash2, Plus, Download, Bot, 
  CheckCircle, AlertCircle, BarChart3, X, Building, Shield,
  UserCheck, UserPlus, DollarSign, Move, Clock3,
  ChevronRight, Menu, Settings, Bell, Target, Award, Zap,
  XCircle, Eye
} from 'lucide-react';
import { useEmployee } from '@/hooks/useEmployee';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Shift, Employee, Client } from '@shared/schema';

export default function MobileSchedule() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();
  
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showShiftDetails, setShowShiftDetails] = useState(false);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [viewMode, setViewMode] = useState<'my' | 'full'>('my');

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  // Fetch shifts
  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['/api/shifts'],
  });

  // Approve shift mutation
  const approveMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await apiRequest('PATCH', `/api/shifts/${shiftId}`, { status: 'scheduled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: 'Shift approved' });
    },
  });

  // Deny shift mutation
  const denyMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await apiRequest('DELETE', `/api/shifts/${shiftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({ title: 'Shift denied' });
    },
  });

  // Delete shift mutation
  const deleteMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await apiRequest('DELETE', `/api/shifts/${shiftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setShowShiftDetails(false);
      toast({ title: 'Shift deleted' });
    },
  });

  // Helper functions (must be defined before use)
  const formatTime = (date: Date) => {
    const hour = new Date(date).getHours();
    if (hour === 0) return '12a';
    if (hour < 12) return `${hour}a`;
    if (hour === 12) return '12p';
    return `${hour - 12}p`;
  };

  const getShiftDuration = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  };

  const getEmployee = (id: string) => employees.find(e => e.id === id);
  
  const getEmployeeColor = (id: string) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const index = employees.findIndex(e => e.id === id);
    return colors[index % colors.length];
  };

  function calculateLaborCost() {
    let total = 0;
    shifts.forEach(shift => {
      const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
      if (emp && emp.hourlyRate) {
        total += parseFloat(emp.hourlyRate) * getShiftDuration(shift);
      }
    });
    return `$${(total / 1000).toFixed(1)}k`;
  }

  function calculateTotalHours() {
    return shifts.reduce((acc, shift) => acc + getShiftDuration(shift), 0);
  }

  // Calculate pending shifts first (needed for manager tools)
  const pendingShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'draft');
  }, [shifts]);

  const managerTools = [
    {
      category: 'Schedule',
      items: [
        { id: 'approve', icon: CheckCircle, label: 'Approvals', colorClass: 'bg-green-100 text-green-600', badge: pendingShifts.length },
        { id: 'edit', icon: Edit2, label: 'Edit Shifts', colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'move', icon: Move, label: 'Move Shifts', colorClass: 'bg-purple-100 text-purple-600' },
        { id: 'delete', icon: Trash2, label: 'Delete', colorClass: 'bg-red-100 text-red-600' },
      ]
    },
    {
      category: 'Team',
      items: [
        { id: 'employees', icon: Users, label: 'Employees', colorClass: 'bg-blue-100 text-blue-600', path: '/employees' },
        { id: 'add', icon: UserPlus, label: 'Add Staff', colorClass: 'bg-green-100 text-green-600', path: '/employees' },
        { id: 'clients', icon: Building, label: 'Clients', colorClass: 'bg-purple-100 text-purple-600', path: '/clients' },
      ]
    },
    {
      category: 'Reports',
      items: [
        { id: 'labor', icon: DollarSign, label: 'Labor Costs', colorClass: 'bg-green-100 text-green-600' },
        { id: 'hours', icon: Clock, label: 'Hours', colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'attendance', icon: UserCheck, label: 'Attendance', colorClass: 'bg-purple-100 text-purple-600' },
      ]
    },
    {
      category: 'AI',
      items: [
        { id: 'workflow', icon: Bot, label: 'Workflow', colorClass: 'bg-purple-100 text-purple-600', path: '/workflow-approvals' },
        { id: 'autofill', icon: Zap, label: 'Auto-Fill', colorClass: 'bg-yellow-100 text-yellow-600' },
      ]
    }
  ];

  const reports = [
    {
      id: 'labor',
      title: 'Labor Costs',
      icon: DollarSign,
      data: { Total: calculateLaborCost(), OT: '$0' }
    },
    {
      id: 'hours',
      title: 'Hours',
      icon: Clock,
      data: { Total: calculateTotalHours(), Sched: shifts.length * 8 }
    },
    {
      id: 'attendance',
      title: 'Attendance',
      icon: UserCheck,
      data: { Present: employees.length, Late: 0 }
    }
  ];

  // Check if user is manager/supervisor
  const isManagerOrSupervisor = useMemo(() => {
    if (!currentEmployee || !currentEmployee.workspaceRole) return false;
    return ['owner', 'admin', 'department_manager', 'supervisor'].includes(currentEmployee.workspaceRole);
  }, [currentEmployee]);

  // Get today's shifts (filtered by view mode)
  const todayShifts = useMemo(() => {
    const today = new Date();
    let filteredShifts = shifts.filter(s => {
      const shiftDate = new Date(s.startTime);
      return shiftDate.toDateString() === today.toDateString();
    });

    // Filter by view mode for managers/supervisors
    if (isManagerOrSupervisor && viewMode === 'my') {
      filteredShifts = filteredShifts.filter(s => s.employeeId === currentEmployee?.id);
    }

    return filteredShifts;
  }, [shifts, viewMode, isManagerOrSupervisor, currentEmployee]);

  const handleApprove = (shiftId: string) => {
    approveMutation.mutate(shiftId);
  };

  const handleDeny = (shiftId: string) => {
    denyMutation.mutate(shiftId);
  };

  const handleDelete = (shiftId: string) => {
    deleteMutation.mutate(shiftId);
  };

  const handleMenuItemClick = (itemId: string, path?: string) => {
    if (path) {
      setLocation(path);
    } else if (itemId === 'approve') {
      setShowApprovals(true);
    } else if (itemId === 'employees') {
      setShowEmployeeList(true);
    } else if (['labor', 'hours', 'attendance'].includes(itemId)) {
      setShowReports(true);
    }
    setShowMenu(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white sticky top-0 z-40 shadow-lg">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setShowMenu(true)} 
              className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded active:scale-95"
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-1.5">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-bold">Manager</span>
            </div>
            <button 
              onClick={() => setShowApprovals(true)} 
              className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded relative active:scale-95"
              data-testid="button-mobile-approvals"
            >
              <Bell className="w-5 h-5" />
              {pendingShifts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                  {pendingShifts.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-center mb-2">
            <div className="text-xs opacity-90">Today</div>
            <div className="text-sm font-bold">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Compact Stats */}
        <div className="bg-white bg-opacity-10 px-3 py-1.5 flex justify-around text-xs">
          <div className="flex items-center space-x-1" data-testid="stat-shifts">
            <Users className="w-3 h-3" />
            <span>{todayShifts.length}</span>
          </div>
          <div className="flex items-center space-x-1" data-testid="stat-pending">
            <Clock3 className="w-3 h-3" />
            <span>{pendingShifts.length}</span>
          </div>
          <div className="flex items-center space-x-1" data-testid="stat-labor">
            <DollarSign className="w-3 h-3" />
            <span>{calculateLaborCost().replace('$', '').replace('k', '')}</span>
          </div>
        </div>

        {/* View Mode Tabs (Manager/Supervisor only) */}
        {isManagerOrSupervisor && (
          <div className="bg-white bg-opacity-20 px-3 py-2 flex gap-2">
            <button
              onClick={() => setViewMode('my')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                viewMode === 'my'
                  ? 'bg-white text-blue-600'
                  : 'bg-transparent text-white hover:bg-white hover:bg-opacity-20'
              }`}
              data-testid="tab-my-schedule"
            >
              My Schedule
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                viewMode === 'full'
                  ? 'bg-white text-blue-600'
                  : 'bg-transparent text-white hover:bg-white hover:bg-opacity-20'
              }`}
              data-testid="tab-full-schedule"
            >
              Full Schedule
            </button>
          </div>
        )}
      </div>

      {/* Compact Action Grid */}
      <div className="px-3 py-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setShowApprovals(true)}
            className="bg-white rounded-lg p-3 shadow-sm border border-orange-200 active:scale-95"
            data-testid="button-action-approvals"
          >
            <div className="flex items-center justify-between mb-1">
              <Clock3 className="w-5 h-5 text-orange-600" />
              {pendingShifts.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingShifts.length}
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-gray-900">Approvals</div>
          </button>

          <button
            onClick={() => setShowReports(true)}
            className="bg-white rounded-lg p-3 shadow-sm border border-blue-200 active:scale-95"
            data-testid="button-action-reports"
          >
            <BarChart3 className="w-5 h-5 text-blue-600 mb-1" />
            <div className="text-xs font-bold text-gray-900">Reports</div>
          </button>

          <button
            onClick={() => setShowEmployeeList(true)}
            className="bg-white rounded-lg p-3 shadow-sm border border-green-200 active:scale-95"
            data-testid="button-action-team"
          >
            <Users className="w-5 h-5 text-green-600 mb-1" />
            <div className="text-xs font-bold text-gray-900">Team</div>
          </button>

          <button
            onClick={() => setLocation('/workflow-approvals')}
            className="bg-white rounded-lg p-3 shadow-sm border border-purple-200 active:scale-95"
            data-testid="button-action-workflow"
          >
            <Target className="w-5 h-5 text-purple-600 mb-1" />
            <div className="text-xs font-bold text-gray-900">Workflow</div>
          </button>
        </div>

        {/* Shifts List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-2.5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Today's Shifts</h3>
            <button 
              onClick={() => setLocation('/schedule')}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium"
              data-testid="button-add-shift"
            >
              <Plus className="w-3 h-3 inline mr-0.5" />
              Add
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {todayShifts.length === 0 && (
              <div className="p-6 text-center text-gray-500 text-sm">
                No shifts scheduled for today
              </div>
            )}
            
            {todayShifts.map(shift => {
              const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
              const isPending = shift.status === 'draft';
              const isOpen = !shift.employeeId;
              
              return (
                <div
                  key={shift.id}
                  onClick={() => {
                    setSelectedShift(shift);
                    setShowShiftDetails(true);
                  }}
                  className="p-2.5 active:bg-gray-50"
                  data-testid={`shift-item-${shift.id}`}
                >
                  <div className="flex items-start space-x-2">
                    {/* Time */}
                    <div className="text-center min-w-[40px] flex-shrink-0">
                      <div className="text-xs font-bold text-gray-900">{formatTime(shift.startTime)}</div>
                      <div className="text-xs text-gray-400">-</div>
                      <div className="text-xs font-bold text-gray-900">{formatTime(shift.endTime)}</div>
                    </div>

                    {/* Shift Card */}
                    <div 
                      className="flex-1 rounded-lg p-2 border-l-2 min-w-0"
                      style={{ 
                        backgroundColor: isOpen ? '#fff7ed' : isPending ? '#fef3c7' : emp ? `${getEmployeeColor(emp.id)}15` : '#f3f4f6',
                        borderLeftColor: isOpen ? '#fb923c' : isPending ? '#f59e0b' : emp ? getEmployeeColor(emp.id) : '#6b7280'
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        {isOpen ? (
                          <div className="flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-orange-600 flex-shrink-0" />
                            <span className="font-bold text-orange-900 text-xs">OPEN</span>
                          </div>
                        ) : emp ? (
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: getEmployeeColor(emp.id) }}
                            >
                              {emp.firstName.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-gray-900 text-xs truncate">{emp.firstName} {emp.lastName}</div>
                              <div className="text-xs text-gray-600 truncate">{shift.title || emp.role}</div>
                            </div>
                          </div>
                        ) : null}
                        
                        {isPending && (
                          <span className="bg-yellow-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                            !
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <div className="flex items-center space-x-0.5 truncate">
                          <Building className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{shift.description || 'No location'}</span>
                        </div>
                        <div className="flex items-center space-x-0.5 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>{getShiftDuration(shift)}h</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Menu Drawer */}
      {showMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setShowMenu(false)}>
          <div 
            className="absolute inset-y-0 left-0 w-64 bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5">
                  <Shield className="w-5 h-5" />
                  <h2 className="text-base font-bold">Tools</h2>
                </div>
                <button 
                  onClick={() => setShowMenu(false)} 
                  className="p-1 rounded"
                  data-testid="button-close-menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-4">
              {managerTools.map(cat => (
                <div key={cat.category}>
                  <h3 className="font-bold text-gray-900 mb-2 text-xs uppercase tracking-wide">
                    {cat.category}
                  </h3>
                  <div className="space-y-1.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleMenuItemClick(item.id, 'path' in item ? item.path : undefined)}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 active:bg-gray-100"
                          data-testid={`menu-item-${item.id}`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`p-1.5 rounded-lg ${item.colorClass}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-gray-900 text-sm">{item.label}</span>
                          </div>
                          {'badge' in item && item.badge && item.badge > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approvals Drawer */}
      {showApprovals && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end" onClick={() => setShowApprovals(false)}>
          <div className="bg-white rounded-t-xl w-full max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-gradient-to-r from-orange-600 to-yellow-600 text-white p-3 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Approvals</h2>
                  <p className="text-xs opacity-90">{pendingShifts.length} pending</p>
                </div>
                <button 
                  onClick={() => setShowApprovals(false)} 
                  className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-full"
                  data-testid="button-close-approvals"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {pendingShifts.map(shift => {
                const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
                return (
                  <div key={shift.id} className="bg-white border-2 border-orange-200 rounded-lg p-3" data-testid={`approval-item-${shift.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        {emp && (
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ backgroundColor: getEmployeeColor(emp.id) }}
                          >
                            {emp.firstName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 text-sm truncate">{emp ? `${emp.firstName} ${emp.lastName}` : 'Open'}</div>
                          <div className="text-xs text-gray-600 truncate">{shift.title || emp?.role}</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-900 flex-shrink-0">
                        {formatTime(shift.startTime)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleApprove(shift.id)}
                        className="bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
                        data-testid={`button-approve-shift-${shift.id}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeny(shift.id)}
                        className="bg-red-600 text-white py-2 rounded-lg text-sm font-medium"
                        data-testid={`button-deny-shift-${shift.id}`}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                );
              })}

              {pendingShifts.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 font-medium">All caught up!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reports Drawer */}
      {showReports && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end" onClick={() => setShowReports(false)}>
          <div className="bg-white rounded-t-xl w-full max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Reports</h2>
                <button 
                  onClick={() => setShowReports(false)} 
                  className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-full"
                  data-testid="button-close-reports"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {reports.map(report => {
                const Icon = report.icon;
                return (
                  <div key={report.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm">{report.title}</h3>
                    </div>

                    <div className="bg-gray-50 rounded p-2 mb-2">
                      <div className="flex justify-around text-center">
                        {Object.entries(report.data).map(([key, val]) => (
                          <div key={key}>
                            <div className="text-xs text-gray-600">{key}</div>
                            <div className="text-sm font-bold text-gray-900">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium">
                      View Full
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Shift Details */}
      {showShiftDetails && selectedShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end" onClick={() => setShowShiftDetails(false)}>
          <div className="bg-white rounded-t-xl w-full max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Shift Details</h2>
                <button 
                  onClick={() => setShowShiftDetails(false)} 
                  className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-full"
                  data-testid="button-close-shift-details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedShift.employeeId && (() => {
                const emp = getEmployee(selectedShift.employeeId);
                return emp ? (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: getEmployeeColor(emp.id) }}
                      >
                        {emp.firstName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{emp.firstName} {emp.lastName}</div>
                        <div className="text-xs text-gray-600">{selectedShift.title || emp.role}</div>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Time</span>
                  <span className="font-medium text-gray-900">
                    {formatTime(selectedShift.startTime)}-{formatTime(selectedShift.endTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-medium text-gray-900">{getShiftDuration(selectedShift)}h</span>
                </div>
                {selectedShift.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location</span>
                    <span className="font-medium text-gray-900">{selectedShift.description}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {selectedShift.status === 'draft' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        handleApprove(selectedShift.id);
                        setShowShiftDetails(false);
                      }}
                      className="bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        handleDeny(selectedShift.id);
                        setShowShiftDetails(false);
                      }}
                      className="bg-red-600 text-white py-2 rounded-lg text-sm font-medium"
                    >
                      Deny
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleDelete(selectedShift.id)}
                  className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-1"
                  data-testid="button-delete-shift"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Shift</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee List Drawer */}
      {showEmployeeList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end" onClick={() => setShowEmployeeList(false)}>
          <div className="bg-white rounded-t-xl w-full max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-3 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Team</h2>
                  <p className="text-xs opacity-90">{employees.length} employees</p>
                </div>
                <button 
                  onClick={() => setShowEmployeeList(false)} 
                  className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-full"
                  data-testid="button-close-employees"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {employees.map(emp => (
                <div 
                  key={emp.id} 
                  className="bg-white border border-gray-200 rounded-lg p-3"
                  data-testid={`employee-item-${emp.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ backgroundColor: getEmployeeColor(emp.id) }}
                    >
                      {emp.firstName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm truncate">{emp.firstName} {emp.lastName}</div>
                      <div className="text-xs text-gray-600 truncate">{emp.role || 'Employee'}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-medium text-gray-900">${emp.hourlyRate || '0'}/hr</div>
                      <div className="text-xs text-green-600 font-medium">Active</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
