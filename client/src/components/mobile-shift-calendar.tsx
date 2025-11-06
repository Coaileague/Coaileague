import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfWeek, addDays, isSameDay, isToday, addWeeks } from "date-fns";
import { Bell, Plus, X, MessageSquare, FileText, Clock, Eye, AlertCircle, CheckCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shift, Employee, Client, ShiftAcknowledgment } from "@shared/schema";
import { ShiftActionsMenu } from "@/components/shift-actions-menu";

interface MobileShiftCalendarProps {
  onCreateShift?: () => void;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return `${hour} ${ampm}`;
});

// Shift color mapping by status
const getShiftColor = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'in_progress':
      return 'bg-purple-600 border-purple-600 text-purple-600';
    case 'completed':
      return 'bg-indigo-500 border-indigo-500 text-indigo-500';
    case 'draft':
      return 'bg-yellow-600 border-yellow-600 text-yellow-600';
    case 'cancelled':
      return 'bg-red-600 border-red-600 text-red-600';
    case 'scheduled':
    case 'published':
    default:
      return 'bg-emerald-500 border-emerald-500 text-emerald-500'; // Emergency Green #10b981
  }
};

const getStatusLabel = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'draft':
      return 'Draft';
    case 'cancelled':
      return 'Cancelled';
    case 'published':
      return 'Published';
    case 'scheduled':
    default:
      return 'Scheduled';
  }
};

export function MobileShiftCalendar({ onCreateShift }: MobileShiftCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAcknowledgmentDialog, setShowAcknowledgmentDialog] = useState(false);
  const { toast } = useToast();

  // Fetch current user for role-based features
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch data
  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Fetch shift acknowledgments for selected shift
  const { data: shiftAcknowledgments = [] } = useQuery<ShiftAcknowledgment[]>({
    queryKey: selectedShift ? ["/api/shifts", selectedShift.id, "acknowledgments"] : [],
    enabled: !!selectedShift,
  });

  // Fetch active time entries to find if user is clocked in for this shift
  const { data: timeEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/time-entries"],
    enabled: !!selectedShift,
  });

  // Find active time entry for this shift
  const activeTimeEntry = selectedShift
    ? timeEntries.find(entry => entry.shiftId === selectedShift.id && !entry.clockOut)
    : null;

  // Clock In mutation
  const clockInMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest(`/api/time-entries/clock-in`, {
        method: "POST",
        body: { shiftId },
      });
    },
    onSuccess: () => {
      toast({
        title: "Clocked In Successfully",
        description: "Your time tracking has started",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setIsModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Clock In Failed",
        description: error.message || "Could not clock in",
        variant: "destructive",
      });
    },
  });

  // Clock Out mutation
  const clockOutMutation = useMutation({
    mutationFn: async (timeEntryId: string) => {
      return await apiRequest(`/api/time-entries/${timeEntryId}/clock-out`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      toast({
        title: "Clocked Out Successfully",
        description: "Your time entry has been saved",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setIsModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Clock Out Failed",
        description: error.message || "Could not clock out",
        variant: "destructive",
      });
    },
  });

  // Acknowledge shift acknowledgment
  const acknowledgeMutation = useMutation({
    mutationFn: async (acknowledgmentId: string) => {
      return await apiRequest(`/api/acknowledgments/${acknowledgmentId}/acknowledge`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      toast({
        title: "Acknowledged",
        description: "Post orders acknowledged successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setShowAcknowledgmentDialog(false);
    },
  });

  const navigateWeek = (weeks: number) => {
    setIsLoading(true);
    setCurrentWeekStart(addWeeks(currentWeekStart, weeks));
    setTimeout(() => setIsLoading(false), 300);
  };

  const getWeekDate = (dayIndex: number) => {
    return addDays(currentWeekStart, dayIndex);
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown';
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client?.companyName || client?.firstName + ' ' + client?.lastName || 'Client';
  };

  const timeToMinutes = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 60 + minutes;
  };

  const formatTime = (date: Date) => {
    return format(date, 'h:mm a');
  };

  const showShiftDetails = (shift: Shift) => {
    setSelectedShift(shift);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedShift(null), 200);
  };

  const weekRangeText = `${format(currentWeekStart, 'MMM d')} - ${format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}`;

  // Render day agenda view for mobile
  const renderDayAgenda = () => {
    let agendaHtml: JSX.Element[] = [];

    for (let i = 0; i < 7; i++) {
      const dayDate = getWeekDate(i);
      const isDayToday = isToday(dayDate);
      const dayString = format(dayDate, 'EEE, MMM d');

      const shiftsForDay = shifts
        .filter(s => {
          const shiftDate = new Date(s.startTime);
          return isSameDay(shiftDate, dayDate);
        })
        .sort((a, b) => timeToMinutes(new Date(a.startTime)) - timeToMinutes(new Date(b.startTime)));

      agendaHtml.push(
        <div key={i} className="space-y-3">
          <h2 className={`text-lg font-extrabold pt-2 ${isDayToday ? 'text-emerald-600' : 'text-gray-800'}`}>
            {dayString}
            {isDayToday && <span className="text-sm font-semibold ml-2 text-emerald-500">(Today)</span>}
          </h2>

          {shiftsForDay.length === 0 ? (
            <div className="text-center p-3 text-gray-400 bg-gray-50 rounded-lg mb-4">
              <p className="font-medium text-sm">No shifts scheduled.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shiftsForDay.map(shift => {
                const colorClasses = getShiftColor(shift.status);
                const statusLabel = getStatusLabel(shift.status);
                const employeeName = shift.employeeId ? getEmployeeName(shift.employeeId) : 'Unassigned';
                const clientName = getClientName(shift.clientId);

                return (
                  <div
                    key={shift.id}
                    className={`p-3 bg-white rounded-xl shadow-md border-l-4 ${colorClasses.split(' ')[1]} cursor-pointer hover:shadow-lg transition duration-200`}
                    onClick={() => showShiftDetails(shift)}
                    data-testid={`shift-card-${shift.id}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">
                          {clientName || 'Shift'}
                        </h3>
                        <p className={`text-xs font-semibold ${colorClasses.split(' ')[2]}`}>
                          {formatTime(new Date(shift.startTime))} - {formatTime(new Date(shift.endTime))}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`block text-xs font-semibold uppercase ${
                          shift.status === 'in_progress' ? 'text-red-500' : 'text-emerald-500'
                        }`}>
                          {statusLabel}
                        </span>
                        <span className="block text-xs text-gray-500">{employeeName}</span>
                      </div>
                    </div>
                    {shift.description && (
                      <p className="text-xs text-gray-600 mt-2 border-t border-gray-100 pt-2">
                        {shift.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return <div className="p-3 space-y-4">{agendaHtml}</div>;
  };

  const getClockButtonConfig = () => {
    if (!selectedShift) return null;

    switch (selectedShift.status?.toLowerCase()) {
      case 'scheduled':
      case 'published':
      case 'draft':
        return {
          text: 'Clock In',
          className: 'bg-emerald-500 hover:bg-emerald-600', // Emergency Green
        };
      case 'in_progress':
        return {
          text: 'Clock Out',
          className: 'bg-red-600 hover:bg-red-700',
        };
      case 'completed':
        return {
          text: 'View Timesheet',
          className: 'bg-gray-500 hover:bg-gray-600',
        };
      default:
        return {
          text: 'Clock In',
          className: 'bg-emerald-500 hover:bg-emerald-600', // Emergency Green
        };
    }
  };

  const clockButtonConfig = getClockButtonConfig();

  return (
    <div className="w-full bg-white shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="p-4 bg-white border-b border-emerald-100 sticky top-0 z-20">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-extrabold text-gray-900">My Shift Schedule</h1>
          <button 
            className="p-2 rounded-full text-emerald-600 hover:bg-emerald-50 transition"
            data-testid="button-notifications"
          >
            <Bell className="h-6 w-6" />
          </button>
        </div>

        {/* Date Navigation */}
        <div className="flex justify-between items-center text-gray-700">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
            data-testid="button-prev-week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-bold text-lg text-emerald-700" data-testid="text-week-range">
            {weekRangeText}
          </span>
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
            data-testid="button-next-week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="pb-20">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
          </div>
        ) : (
          renderDayAgenda()
        )}
      </div>

      {/* FAB */}
      {onCreateShift && (
        <button
          onClick={onCreateShift}
          className="fixed bottom-6 right-6 z-30 flex items-center justify-center p-4 rounded-full text-white bg-emerald-600 hover:bg-emerald-700 transition duration-300 shadow-lg"
          data-testid="button-add-shift"
        >
          <Plus className="h-7 w-7" strokeWidth={3} />
        </button>
      )}

      {/* Shift Details Modal */}
      {isModalOpen && selectedShift && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full transform transition-all">
            {/* Modal Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-2xl font-extrabold text-gray-900" data-testid="modal-shift-title">
                  {selectedShift.title || getClientName(selectedShift.clientId) || 'Shift'}
                </h3>
                <p className="text-emerald-600 font-semibold" data-testid="modal-shift-time">
                  {formatTime(new Date(selectedShift.startTime))} - {formatTime(new Date(selectedShift.endTime))}
                </p>
                {currentUser?.role && ['owner', 'manager', 'supervisor'].includes(currentUser.role) && selectedShift.employeeId && selectedShift.employeeId !== currentUser.id && (
                  <Badge variant="outline" className="ml-2 text-xs border-emerald-500 text-emerald-600">
                    Manager Override
                  </Badge>
                )}
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full transition"
                data-testid="button-close-modal"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-2 mb-6 text-sm text-gray-700">
              {selectedShift.employeeId && (
                <p>
                  <strong>Employee:</strong>{' '}
                  <span data-testid="modal-shift-employee">{getEmployeeName(selectedShift.employeeId)}</span>
                </p>
              )}
              <p>
                <strong>Status:</strong>{' '}
                <span className="font-bold" data-testid="modal-shift-status">
                  {getStatusLabel(selectedShift.status)}
                </span>
              </p>
              {selectedShift.description && (
                <p className="pt-2 border-t border-gray-100">
                  <strong className="block text-gray-500 mb-1">Details:</strong>
                  <span data-testid="modal-shift-details">{selectedShift.description}</span>
                </p>
              )}
            </div>

            {/* Post Orders / Acknowledgments Alert */}
            {shiftAcknowledgments.length > 0 && shiftAcknowledgments.some(a => !a.acknowledgedAt) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">Post Orders Require Acknowledgment</p>
                    <p className="text-xs text-amber-700 mt-1">
                      You must acknowledge {shiftAcknowledgments.filter(a => !a.acknowledgedAt).length} post order(s) before clocking in
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => setShowAcknowledgmentDialog(true)}
                      data-testid="button-view-acknowledgments"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Post Orders
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Action: Clock In/Out */}
            {clockButtonConfig && (
              <>
                <Button
                  className={`w-full ${clockButtonConfig.className} text-white font-bold py-6 text-lg`}
                  onClick={() => {
                    const isManager = currentUser?.role && ['owner', 'manager', 'supervisor'].includes(currentUser.role);
                    const isManagingOthers = selectedShift.employeeId && selectedShift.employeeId !== currentUser?.id;
                    
                    // Manager override: Skip acknowledgment requirement when helping employees
                    const hasUnacknowledged = shiftAcknowledgments.some(a => !a.acknowledgedAt);
                    if (clockButtonConfig.text === "Clock In" && hasUnacknowledged && !isManagingOthers) {
                      setShowAcknowledgmentDialog(true);
                      toast({
                        title: "Acknowledgment Required",
                        description: "Please acknowledge all post orders before clocking in",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Manager override notification
                    if (isManager && isManagingOthers && clockButtonConfig.text === "Clock In") {
                      toast({
                        title: "Manager Override",
                        description: `Clocking in employee: ${getEmployeeName(selectedShift.employeeId!)}`,
                      });
                    }
                    
                    if (clockButtonConfig.text === "Clock In") {
                      clockInMutation.mutate(selectedShift.id);
                    } else if (clockButtonConfig.text === "Clock Out") {
                      if (activeTimeEntry?.id) {
                        if (isManager && isManagingOthers) {
                          toast({
                            title: "Manager Override",
                            description: `Clocking out employee: ${getEmployeeName(selectedShift.employeeId!)}`,
                          });
                        }
                        clockOutMutation.mutate(activeTimeEntry.id);
                      } else {
                        toast({
                          title: "No Active Time Entry",
                          description: "Could not find an active clock-in for this shift",
                          variant: "destructive",
                        });
                      }
                    }
                  }}
                  disabled={clockInMutation.isPending || clockOutMutation.isPending}
                  data-testid="button-clock-action"
                >
                  <Clock className="h-6 w-6 mr-2" />
                  {clockInMutation.isPending || clockOutMutation.isPending ? "Processing..." : clockButtonConfig.text}
                </Button>
                
                {/* Manager Helper Note */}
                {currentUser?.role && ['owner', 'manager', 'supervisor'].includes(currentUser.role) && selectedShift.employeeId && selectedShift.employeeId !== currentUser.id && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Managing shift for {getEmployeeName(selectedShift.employeeId)} • Post orders bypass enabled
                  </p>
                )}
              </>
            )}

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button
                variant="outline"
                className="flex flex-col items-center gap-2 py-4 hover-elevate border-emerald-500"
                onClick={async () => {
                  try {
                    // Create chat room for this shift
                    const response = await apiRequest("/api/chat/rooms", {
                      method: "POST",
                      body: {
                        name: `Shift: ${getClientName(selectedShift.clientId) || 'Assignment'}`,
                        description: `Chat for shift on ${format(new Date(selectedShift.startTime), 'MMM d, yyyy')}`,
                        isPublic: false,
                      },
                    });
                    toast({
                      title: "Chat Created",
                      description: "Opening shift communication channel...",
                    });
                    // Navigate to chat or open chat panel
                    window.location.href = `/team-communication?room=${response.id}`;
                  } catch (error: any) {
                    toast({
                      title: "Failed to Create Chat",
                      description: error.message || "Could not create communication channel",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-create-chat"
              >
                <MessageSquare className="h-5 w-5 text-emerald-500" />
                <span className="text-xs font-semibold">Start Chat</span>
              </Button>

              <Button
                variant="outline"
                className="flex flex-col items-center gap-2 py-4 hover-elevate border-emerald-500"
                onClick={async () => {
                  try {
                    // Fetch audit trail for this shift
                    const auditData = await apiRequest(`/api/audit/entity/shift/${selectedShift.id}`);
                    toast({
                      title: "Audit Trail",
                      description: `Found ${auditData.length || 0} audit entries for this shift`,
                    });
                    // Could open a dialog or navigate to audit view
                  } catch (error: any) {
                    toast({
                      title: "Audit Trail Unavailable",
                      description: error.message || "Could not load audit data",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-view-audit"
              >
                <Eye className="h-5 w-5 text-emerald-500" />
                <span className="text-xs font-semibold">Audit Trail</span>
              </Button>
              
              {shiftAcknowledgments.length > 0 && (
                <Button
                  variant="outline"
                  className="flex flex-col items-center gap-2 py-4 hover-elevate border-emerald-500"
                  onClick={() => setShowAcknowledgmentDialog(true)}
                  data-testid="button-post-orders"
                >
                  <FileText className="h-5 w-5 text-emerald-500" />
                  <span className="text-xs font-semibold">Post Orders</span>
                  {shiftAcknowledgments.some(a => !a.acknowledgedAt) && (
                    <Badge variant="destructive" className="text-xs">
                      {shiftAcknowledgments.filter(a => !a.acknowledgedAt).length}
                    </Badge>
                  )}
                </Button>
              )}

              <Button
                variant="outline"
                className="flex flex-col items-center gap-2 py-4 hover-elevate border-emerald-500"
                data-testid="button-more-options"
              >
                <ChevronRight className="h-5 w-5 text-emerald-500" />
                <span className="text-xs font-semibold">More</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Post Orders Acknowledgment Dialog */}
      {showAcknowledgmentDialog && selectedShift && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center p-4 z-[60] transition-opacity">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto transform transition-all">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                  <FileText className="h-6 w-6 text-emerald-500" />
                  Post Orders & Acknowledgments
                </h3>
                <p className="text-sm text-gray-600 mt-1">Review and acknowledge before clocking in</p>
              </div>
              <button
                onClick={() => setShowAcknowledgmentDialog(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full transition"
                data-testid="button-close-acknowledgment"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Acknowledgments List */}
            <div className="space-y-4">
              {shiftAcknowledgments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No post orders for this shift</p>
                </div>
              ) : (
                shiftAcknowledgments.map((ack) => (
                  <div
                    key={ack.id}
                    className={`p-4 rounded-lg border ${
                      ack.acknowledgedAt
                        ? 'bg-green-50 border-green-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                    data-testid={`acknowledgment-${ack.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900">{ack.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{ack.content}</p>
                      </div>
                      {ack.acknowledgedAt ? (
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                      )}
                    </div>

                    {ack.acknowledgedAt ? (
                      <div className="text-xs text-green-700 mt-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Acknowledged on {format(new Date(ack.acknowledgedAt), 'MMM d, yyyy h:mm a')}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white w-full"
                        onClick={() => acknowledgeMutation.mutate(ack.id)}
                        disabled={acknowledgeMutation.isPending}
                        data-testid={`button-acknowledge-${ack.id}`}
                      >
                        {acknowledgeMutation.isPending ? "Acknowledging..." : "✓ I Acknowledge"}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer Actions */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAcknowledgmentDialog(false)}
                data-testid="button-done-acknowledgments"
              >
                {shiftAcknowledgments.some(a => !a.acknowledgedAt) ? "Close" : "Done"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
