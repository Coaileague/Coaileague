/**
 * Mobile-Optimized Schedule Component
 * List-based shift view with manager tools, approvals, reports, and team management
 */

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { 
  Calendar, Clock, Users, Edit2, Trash2, Plus, Download, Bot, 
  CheckCircle, AlertCircle, BarChart3, X, Building, Shield,
  UserCheck, UserPlus, DollarSign, Move, Clock3,
  ChevronRight, Menu, Settings, Bell, Target, Award, Zap,
  XCircle, Eye, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEmployee } from '@/hooks/useEmployee';
import { useScheduleData } from '@/hooks/useScheduleData';
import { useShiftActions } from '@/hooks/useShiftActions';
import type { Shift } from '@shared/schema';

interface MobileScheduleProps {
  weekStart: Date;
  weekEnd: Date;
  onWeekChange: (direction: 'prev' | 'next') => void;
}

export default function MobileSchedule({ weekStart, weekEnd, onWeekChange }: MobileScheduleProps) {
  const [, setLocation] = useLocation();
  const { employee: currentEmployee } = useEmployee();
  const { shifts, employees, getEmployee, getEmployeeColor, isLoading, pendingShiftsCount, openShiftsCount, totalScheduledHours } = useScheduleData({ weekStart, weekEnd });
  const { approveShift, rejectShift, deleteShift } = useShiftActions();

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showShiftDetails, setShowShiftDetails] = useState(false);
  const [showEmployeeList, setShowEmployeeList] = useState(false);

  // RBAC check
  const canManage = currentEmployee?.role === 'org_owner' || 
                     currentEmployee?.role === 'org_admin' || 
                     currentEmployee?.role === 'manager';

  // Manager tools configuration
  const managerTools = [
    {
      category: 'Schedule',
      items: [
        { id: 'approve', icon: CheckCircle, label: 'Approvals', colorClass: 'bg-green-100 text-green-600', badge: pendingShiftsCount },
        { id: 'edit', icon: Edit2, label: 'Edit Shifts', colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'move', icon: Move, label: 'Move Shifts', colorClass: 'bg-purple-100 text-purple-600' },
        { id: 'delete', icon: Trash2, label: 'Delete', colorClass: 'bg-red-100 text-red-600' },
      ]
    },
    {
      category: 'Team',
      items: [
        { id: 'employees', icon: Users, label: 'Employees', colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'add', icon: UserPlus, label: 'Add Staff', colorClass: 'bg-green-100 text-green-600' },
        { id: 'timeoff', icon: Clock3, label: 'Time Off', colorClass: 'bg-orange-100 text-orange-600' },
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
        { id: 'optimize', icon: Bot, label: 'Optimize', colorClass: 'bg-purple-100 text-purple-600' },
        { id: 'autofill', icon: Zap, label: 'Auto-Fill', colorClass: 'bg-yellow-100 text-yellow-600' },
      ]
    }
  ];

  // Format time helper
  const formatTime = (date: Date) => {
    const hour = date.getHours();
    if (hour === 0) return '12a';
    if (hour < 12) return `${hour}a`;
    if (hour === 12) return '12p';
    return `${hour - 12}p`;
  };

  // Calculate shift duration
  const getShiftDuration = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  };

  // Filter shifts for today (or current selected date)
  const todayShifts = useMemo(() => {
    const today = new Date();
    return shifts.filter(s => {
      const shiftDate = new Date(s.startTime);
      return shiftDate.toDateString() === today.toDateString();
    });
  }, [shifts]);

  // Pending shifts for approval
  const pendingShifts = useMemo(() => {
    return shifts.filter(s => s.status === 'draft');
  }, [shifts]);

  // Handle approval
  const handleApprove = (shiftId: string) => {
    approveShift.mutate(shiftId, {
      onSuccess: () => {
        setShowApprovals(false);
      }
    });
  };

  // Handle rejection
  const handleDeny = (shiftId: string) => {
    rejectShift.mutate(shiftId, {
      onSuccess: () => {
        setShowApprovals(false);
      }
    });
  };

  // Handle delete
  const handleDelete = (shiftId: string) => {
    deleteShift.mutate(shiftId, {
      onSuccess: () => {
        setShowShiftDetails(false);
      }
    });
  };

  // Estimated labor cost (placeholder - will be replaced with real calculation)
  const estimatedLaborCost = Math.round(totalScheduledHours * 25); // $25/hr average

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white sticky top-0 z-40 shadow-lg">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setShowMenu(true)} 
              className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded active:scale-95"
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {canManage && (
              <div className="flex items-center space-x-1.5">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-bold">Manager</span>
              </div>
            )}
            {canManage && (
              <button 
                onClick={() => setShowApprovals(true)} 
                className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded relative active:scale-95"
                data-testid="button-mobile-approvals"
              >
                <Bell className="w-5 h-5" />
                {pendingShiftsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                    {pendingShiftsCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="text-center mb-2">
            <div className="text-xs opacity-90">Week</div>
            <div className="flex items-center justify-center space-x-2">
              <button 
                onClick={() => onWeekChange('prev')} 
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded active:scale-95"
                data-testid="button-prev-week"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="text-sm font-bold">
                {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <button 
                onClick={() => onWeekChange('next')} 
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded active:scale-95"
                data-testid="button-next-week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
            <span>{pendingShiftsCount}</span>
          </div>
          <div className="flex items-center space-x-1" data-testid="stat-labor">
            <DollarSign className="w-3 h-3" />
            <span>{(estimatedLaborCost / 1000).toFixed(1)}k</span>
          </div>
        </div>
      </div>

      {/* Compact Action Grid */}
      {canManage && (
        <div className="px-3 py-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setShowApprovals(true)}
              className="bg-card rounded-lg p-3 shadow-sm border border-orange-200 active:scale-95 hover-elevate"
              data-testid="button-action-approvals"
            >
              <div className="flex items-center justify-between mb-1">
                <Clock3 className="w-5 h-5 text-orange-600" />
                {pendingShiftsCount > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                    {pendingShiftsCount}
                  </Badge>
                )}
              </div>
              <div className="text-xs font-bold">Approvals</div>
            </button>

            <button
              onClick={() => setShowReports(true)}
              className="bg-card rounded-lg p-3 shadow-sm border active:scale-95 hover-elevate"
              data-testid="button-action-reports"
            >
              <BarChart3 className="w-5 h-5 text-blue-600 mb-1" />
              <div className="text-xs font-bold">Reports</div>
            </button>

            <button
              onClick={() => setShowEmployeeList(true)}
              className="bg-card rounded-lg p-3 shadow-sm border active:scale-95 hover-elevate"
              data-testid="button-action-team"
            >
              <Users className="w-5 h-5 text-green-600 mb-1" />
              <div className="text-xs font-bold">Team</div>
            </button>

            <button
              onClick={() => setLocation('/workflow-approvals')}
              className="bg-card rounded-lg p-3 shadow-sm border active:scale-95 hover-elevate"
              data-testid="button-action-workflow"
            >
              <Sparkles className="w-5 h-5 text-purple-600 mb-1" />
              <div className="text-xs font-bold">Workflow</div>
            </button>
          </div>
        </div>
      )}

      {/* Shifts List */}
      <div className="px-3">
        <div className="bg-card rounded-lg shadow-sm overflow-hidden">
          <div className="p-2.5 border-b flex items-center justify-between">
            <h3 className="text-sm font-bold">Today</h3>
            {canManage && (
              <Button size="sm" className="h-7 text-xs" data-testid="button-add-shift">
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            )}
          </div>

          <div className="divide-y">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="text-sm text-muted-foreground">Loading shifts...</div>
              </div>
            ) : todayShifts.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <div className="text-sm text-muted-foreground">No shifts scheduled</div>
              </div>
            ) : (
              todayShifts.map(shift => {
                const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
                const isPending = shift.status === 'draft';
                const isOpen = !shift.employeeId;
                const duration = getShiftDuration(shift);
                
                return (
                  <div
                    key={shift.id}
                    onClick={() => {
                      setSelectedShift(shift);
                      setShowShiftDetails(true);
                    }}
                    className="p-2.5 active:bg-muted/50 cursor-pointer"
                    data-testid={`shift-item-${shift.id}`}
                  >
                    <div className="flex items-start space-x-2">
                      {/* Time */}
                      <div className="text-center min-w-[40px] flex-shrink-0">
                        <div className="text-xs font-bold">{formatTime(new Date(shift.startTime))}</div>
                        <div className="text-xs text-muted-foreground">-</div>
                        <div className="text-xs font-bold">{formatTime(new Date(shift.endTime))}</div>
                      </div>

                      {/* Shift Card */}
                      <div 
                        className="flex-1 rounded-lg p-2 border-l-2 min-w-0"
                        style={{ 
                          backgroundColor: isOpen ? 'hsl(var(--muted)/0.5)' : isPending ? 'hsl(var(--warning)/0.1)' : emp ? `${getEmployeeColor(emp.id)}15` : 'hsl(var(--muted))',
                          borderLeftColor: isOpen ? 'hsl(var(--destructive))' : isPending ? 'hsl(var(--warning))' : getEmployeeColor(emp?.id || null)
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          {isOpen ? (
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                              <span className="font-bold text-xs">OPEN SHIFT</span>
                            </div>
                          ) : emp ? (
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ backgroundColor: getEmployeeColor(emp.id) }}
                              >
                                {emp.firstName?.charAt(0) || 'E'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs truncate">{emp.firstName} {emp.lastName?.[0]}.</div>
                                <div className="text-xs text-muted-foreground truncate">{shift.position || 'Shift'}</div>
                              </div>
                            </div>
                          ) : null}
                          
                          {isPending && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0.5 flex-shrink-0">
                              Draft
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          {shift.location && (
                            <div className="flex items-center space-x-0.5 truncate">
                              <Building className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{shift.location}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-0.5 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            <span>{duration}h</span>
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

      {/* Menu Drawer */}
      {showMenu && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowMenu(false)}>
          <div 
            className="absolute inset-y-0 left-0 w-64 bg-card shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5">
                  <Shield className="w-5 h-5" />
                  <h2 className="text-base font-bold">Manager Tools</h2>
                </div>
                <button onClick={() => setShowMenu(false)} className="p-1 rounded" data-testid="button-close-menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-4">
              {managerTools.map(cat => (
                <div key={cat.category}>
                  <h3 className="font-bold text-xs uppercase tracking-wide mb-2 text-muted-foreground">
                    {cat.category}
                  </h3>
                  <div className="space-y-1.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.id === 'approve') setShowApprovals(true);
                            if (item.id === 'employees') setShowEmployeeList(true);
                            if (['labor', 'hours', 'attendance'].includes(item.id)) setShowReports(true);
                            setShowMenu(false);
                          }}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover-elevate active-elevate-2"
                          data-testid={`menu-item-${item.id}`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`p-1.5 rounded-lg ${item.colorClass}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">{item.label}</span>
                          </div>
                          {item.badge !== undefined && item.badge > 0 && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                              {item.badge}
                            </Badge>
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
      {showApprovals && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card rounded-t-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-yellow-600 text-white p-3 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Approvals</h2>
                  <p className="text-xs opacity-90">{pendingShiftsCount} pending</p>
                </div>
                <button onClick={() => setShowApprovals(false)} className="p-1" data-testid="button-close-approvals">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {pendingShifts.map(shift => {
                const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
                const duration = getShiftDuration(shift);
                
                return (
                  <div key={shift.id} className="bg-card border-2 border-orange-200 rounded-lg p-3" data-testid={`approval-item-${shift.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        {emp && (
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ backgroundColor: getEmployeeColor(emp.id) }}
                          >
                            {emp.firstName?.charAt(0) || 'E'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">{emp ? `${emp.firstName} ${emp.lastName}` : 'Open Shift'}</div>
                          <div className="text-xs text-muted-foreground truncate">{shift.position || 'Shift'} • {duration}h</div>
                        </div>
                      </div>
                      <span className="text-xs font-medium flex-shrink-0">
                        {formatTime(new Date(shift.startTime))}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleApprove(shift.id)}
                        variant="default"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        data-testid={`button-approve-shift-${shift.id}`}
                      >
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleDeny(shift.id)}
                        variant="destructive"
                        size="sm"
                        data-testid={`button-deny-shift-${shift.id}`}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                );
              })}

              {pendingShiftsCount === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reports Drawer */}
      {showReports && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card rounded-t-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Reports</h2>
                <button onClick={() => setShowReports(false)} className="p-1" data-testid="button-close-reports">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {/* Labor Costs */}
              <div className="bg-card border rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="p-2 rounded-lg bg-green-100 text-green-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm">Labor Costs</h3>
                </div>

                <div className="bg-muted rounded p-2 mb-2">
                  <div className="flex justify-around text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="text-sm font-bold">${(estimatedLaborCost / 1000).toFixed(1)}k</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Hours</div>
                      <div className="text-sm font-bold">{Math.round(totalScheduledHours)}</div>
                    </div>
                  </div>
                </div>

                <Button variant="default" size="sm" className="w-full" data-testid="button-view-labor">
                  View Full Report
                </Button>
              </div>

              {/* Hours */}
              <div className="bg-card border rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm">Hours</h3>
                </div>

                <div className="bg-muted rounded p-2 mb-2">
                  <div className="flex justify-around text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Scheduled</div>
                      <div className="text-sm font-bold">{Math.round(totalScheduledHours)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Shifts</div>
                      <div className="text-sm font-bold">{shifts.length}</div>
                    </div>
                  </div>
                </div>

                <Button variant="default" size="sm" className="w-full" data-testid="button-view-hours">
                  View Full Report
                </Button>
              </div>

              {/* Attendance */}
              <div className="bg-card border rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm">Attendance</h3>
                </div>

                <div className="bg-muted rounded p-2 mb-2">
                  <div className="flex justify-around text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Staff</div>
                      <div className="text-sm font-bold">{employees.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Active</div>
                      <div className="text-sm font-bold">{employees.filter(e => e.status === 'active').length}</div>
                    </div>
                  </div>
                </div>

                <Button variant="default" size="sm" className="w-full" data-testid="button-view-attendance">
                  View Full Report
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee List Drawer */}
      {showEmployeeList && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card rounded-t-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white p-3 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Team ({employees.length})</h2>
                <button onClick={() => setShowEmployeeList(false)} className="p-1" data-testid="button-close-employees">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {employees.map(emp => (
                <div key={emp.id} className="bg-card border rounded-lg p-3 flex items-center space-x-3" data-testid={`employee-item-${emp.id}`}>
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: getEmployeeColor(emp.id) }}
                  >
                    {emp.firstName?.charAt(0) || 'E'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{emp.firstName} {emp.lastName}</div>
                    <div className="text-xs text-muted-foreground truncate">{emp.position || 'Employee'}</div>
                  </div>
                  <Badge variant={emp.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {emp.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Shift Details Drawer */}
      {showShiftDetails && selectedShift && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card rounded-t-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white p-3 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Shift Details</h2>
                <button onClick={() => setShowShiftDetails(false)} className="p-1" data-testid="button-close-shift-details">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {selectedShift.employeeId && (() => {
                const emp = getEmployee(selectedShift.employeeId);
                return emp ? (
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: getEmployeeColor(emp.id) }}
                      >
                        {emp.firstName?.charAt(0) || 'E'}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{emp.firstName} {emp.lastName}</div>
                        <div className="text-xs text-muted-foreground">{selectedShift.position}</div>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">
                    {formatTime(new Date(selectedShift.startTime))}-{formatTime(new Date(selectedShift.endTime))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{getShiftDuration(selectedShift)}h</span>
                </div>
                {selectedShift.location && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium">{selectedShift.location}</span>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="space-y-2 pt-2">
                  {selectedShift.status === 'draft' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleApprove(selectedShift.id)}
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-approve-shift-details"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleDeny(selectedShift.id)}
                        variant="destructive"
                        data-testid="button-deny-shift-details"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Deny
                      </Button>
                    </div>
                  )}
                  
                  <Button
                    onClick={() => handleDelete(selectedShift.id)}
                    variant="outline"
                    className="w-full text-destructive"
                    data-testid="button-delete-shift"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Shift
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
