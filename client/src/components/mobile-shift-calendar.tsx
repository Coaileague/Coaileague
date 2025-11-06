import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays, isSameDay, isToday, addWeeks } from "date-fns";
import { Bell, Plus, X, MessageSquare, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Shift, Employee, Client } from "@shared/schema";
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
      return 'bg-green-600 border-green-600 text-green-600';
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
                          shift.status === 'in_progress' ? 'text-red-500' : 'text-green-500'
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
          className: 'bg-green-600 hover:bg-green-700',
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
          className: 'bg-green-600 hover:bg-green-700',
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

            {/* Action Buttons */}
            <div className="space-y-3">
              {clockButtonConfig && (
                <Button
                  className={`w-full ${clockButtonConfig.className} text-white font-bold`}
                  data-testid="button-clock-action"
                >
                  {clockButtonConfig.text}
                </Button>
              )}

              {/* Shift Actions Menu Integration */}
              <div className="w-full">
                <ShiftActionsMenu shift={selectedShift} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
