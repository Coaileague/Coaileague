import { useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Plus, ChevronLeft, ChevronRight, Calendar, Users, Briefcase, CheckCircle, Clock, MapPin } from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import type { Shift, Employee, Client } from '@shared/schema';
import { getShiftConflictBadge, getShiftTimeClockStatus } from '@/components/schedule/ConflictAlerts';
import { getPositionById, inferPositionFromTitle } from '@shared/positionRegistry';
import { getPositionCategoryColor } from '@/constants/scheduling';

interface WeekGridProps {
  weekStart: Date;
  weekEnd: Date;
  selectedDay: Date;
  shifts: Shift[];
  filteredShifts: Shift[];
  employees: Employee[];
  filteredEmployees: Employee[];
  clients: Client[];
  trinityWorking: boolean;
  isShiftBeingProcessed: (shiftId: string) => boolean;
  wasShiftJustAssigned: (shiftId: string) => boolean;
  getEmployeeColor: (employeeId: string | null) => string;
  getShiftStatusColor: (shift: Shift) => { bg: string; label: string };
  onShiftClick: (shift: Shift) => void;
  onCellClick: (dayIndex: number, hour: number) => void;
  onAIFillOpenShift: (shiftId: string) => void;
  onDaySelect: (day: Date) => void;
  onWeekNav: (direction: 'prev' | 'next') => void;
  isManager: boolean;
  aiFillPending: boolean;
}

export function WeekGrid({
  weekStart,
  weekEnd,
  selectedDay,
  shifts,
  filteredShifts,
  employees,
  filteredEmployees,
  clients,
  trinityWorking,
  isShiftBeingProcessed,
  wasShiftJustAssigned,
  getEmployeeColor,
  getShiftStatusColor,
  onShiftClick,
  onCellClick,
  onAIFillOpenShift,
  onDaySelect,
  onWeekNav,
  isManager,
  aiFillPending,
}: WeekGridProps) {
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const weekDisplay = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const displayEnd = new Date(weekEnd);
    displayEnd.setDate(displayEnd.getDate() - 1);
    return `${weekStart.toLocaleDateString('en-US', opts)} - ${displayEnd.toLocaleDateString('en-US', opts)}, ${displayEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  const today = new Date();
  const todayStr = today.toDateString();

  const getShiftsForEmployeeDay = (employeeId: string | null, day: Date) => {
    return filteredShifts.filter(s => {
      if (employeeId === null) {
        if (s.employeeId) return false;
      } else {
        if (s.employeeId !== employeeId) return false;
      }
      const shiftDate = new Date(s.startTime);
      return shiftDate.toDateString() === day.toDateString();
    });
  };

  const allUnassignedForWeek = weekDays.flatMap(d => getShiftsForEmployeeDay(null, d));

  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const STATUS_GRADIENT_MAP: Record<string, { gradient: string; shadow: string }> = {
    scheduled: { gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', shadow: '0 2px 8px rgba(34,197,94,0.25)' },
    published: { gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', shadow: '0 2px 8px rgba(59,130,246,0.25)' },
    draft: { gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: '0 2px 8px rgba(245,158,11,0.25)' },
    pending: { gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', shadow: '0 2px 8px rgba(245,158,11,0.25)' },
    in_progress: { gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', shadow: '0 2px 8px rgba(139,92,246,0.25)' },
    completed: { gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)', shadow: '0 2px 8px rgba(107,114,128,0.15)' },
    cancelled: { gradient: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)', shadow: 'none' },
    confirmed: { gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: '0 2px 8px rgba(16,185,129,0.25)' },
  };

  const resolveEmployeePosition = (emp: Employee) => {
    const e = emp as any;
    if (e.position) {
      const byId = getPositionById(e.position);
      if (byId) return byId;
    }
    const title = e.jobTitle || e.role || e.organizationalTitle || '';
    if (title) return inferPositionFromTitle(title);
    return undefined;
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const getShiftPosition = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.max(durationMs / 60000, 60);
    const leftPercent = (startMinutes / 1440) * 100;
    const widthPercent = (durationMinutes / 1440) * 100;
    return { leftPercent, widthPercent: Math.max(widthPercent, 5.5) };
  };

  const computeStackRows = (dayShifts: Shift[]) => {
    const rows: Shift[][] = [];
    const sorted = [...dayShifts].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    sorted.forEach(shift => {
      const sStart = new Date(shift.startTime).getTime();
      let placed = false;
      for (const row of rows) {
        const lastInRow = row[row.length - 1];
        if (new Date(lastInRow.endTime).getTime() <= sStart) {
          row.push(shift);
          placed = true;
          break;
        }
      }
      if (!placed) rows.push([shift]);
    });
    return rows;
  };

  const ShiftBar = ({ shift, rowIdx, totalRows, variant = 'scheduled' }: {
    shift: Shift;
    rowIdx: number;
    totalRows: number;
    variant?: 'scheduled' | 'unassigned';
  }) => {
    const startTime = new Date(shift.startTime);
    const endTime = new Date(shift.endTime);
    const durationH = ((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(1);
    const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
    const statusColor = getShiftStatusColor(shift);
    const isProcessing = isShiftBeingProcessed(shift.id);
    const justAssigned = wasShiftJustAssigned(shift.id);
    const isTraining = !!(shift as any).isTrainingShift;
    const { leftPercent, widthPercent } = getShiftPosition(shift);

    const gapPx = 3;
    const rowHeight = totalRows > 1
      ? `calc(${100 / totalRows}% - ${gapPx}px)`
      : 'calc(100% - 8px)';
    const topOffset = totalRows > 1
      ? `calc(${(rowIdx / totalRows) * 100}% + ${gapPx / 2}px)`
      : '4px';

    const shiftEmployee = shift.employeeId ? filteredEmployees.find(e => e.id === shift.employeeId) || employees.find(e => e.id === shift.employeeId) : null;
    const tooltipContent = [
      `${formatTime(startTime)} - ${formatTime(endTime)} (${durationH}h)`,
      client ? client.companyName : null,
      shift.title || null,
      shiftEmployee ? `${shiftEmployee.firstName} ${shiftEmployee.lastName}` : null,
      statusColor.label ? `Status: ${statusColor.label}` : null,
    ].filter(Boolean).join(' | ');

    if (variant === 'unassigned') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`absolute rounded-md px-2 py-1.5 cursor-pointer border-2 border-dashed border-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/60 text-xs flex flex-col justify-center overflow-hidden transition-all duration-200 hover:shadow-sm hover:z-20 hover:-translate-y-px ${
                isProcessing ? 'trinity-shift-processing' : ''
              } ${justAssigned ? 'trinity-shift-assigned' : ''}`}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                top: topOffset,
                height: rowHeight,
                zIndex: 10 + rowIdx,
                minWidth: '60px',
                boxShadow: '0 1px 4px rgba(16,185,129,0.15)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAIFillOpenShift(shift.id);
              }}
              data-testid={`week-unassigned-shift-${shift.id}`}
            >
              <div className="font-bold text-[10px] text-emerald-700 dark:text-emerald-300 truncate leading-snug flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
                {formatTime(startTime)} - {formatTime(endTime)}
                <span className="opacity-60 ml-0.5 font-normal">{durationH}h</span>
              </div>
              {client && (
                <div className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70 truncate leading-snug flex items-center gap-0.5">
                  <MapPin className="w-2 h-2 flex-shrink-0" />
                  {client.companyName}
                </div>
              )}
              {shift.title && (
                <div className="text-[9px] text-emerald-600/60 dark:text-emerald-400/60 truncate leading-snug">{shift.title}</div>
              )}
              {shift.aiGenerated && (
                <TrinityIconStatic size={8} className="absolute top-0.5 right-0.5" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            <div className="font-semibold">Open Shift</div>
            <div>{tooltipContent}</div>
          </TooltipContent>
        </Tooltip>
      );
    }

    const timeClockStatus = isTraining ? null : getShiftTimeClockStatus(shift);
    const conflictBadge = isTraining ? null : getShiftConflictBadge(shift, shifts, employees);

    const statusKey = (shift.status || 'scheduled').toLowerCase();
    const gradientStyle = STATUS_GRADIENT_MAP[statusKey] || STATUS_GRADIENT_MAP.scheduled;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`absolute rounded-md px-2 py-1.5 cursor-pointer text-white flex flex-col justify-center overflow-hidden border border-white/20 transition-all duration-200 hover:z-20 hover:-translate-y-px hover:shadow-sm ${
              isProcessing ? 'trinity-shift-processing' : ''
            } ${justAssigned ? 'trinity-shift-assigned' : ''}`}
            style={{
              background: gradientStyle.gradient,
              boxShadow: gradientStyle.shadow,
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              top: topOffset,
              height: rowHeight,
              zIndex: 10 + rowIdx,
              minWidth: '65px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onShiftClick(shift);
            }}
            data-testid={`week-shift-${shift.id}`}
          >
            <div className="flex items-center gap-0.5">
              <div className="font-bold text-[10px] truncate leading-snug flex-1 flex items-center gap-1 tracking-wide">
                <Clock className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />
                {formatTime(startTime)} - {formatTime(endTime)}
                <span className="opacity-70 ml-0.5 font-medium text-[9px]">{durationH}h</span>
              </div>
              {shift.aiGenerated && (
                <TrinityIconStatic size={8} className="flex-shrink-0" />
              )}
            </div>
            {shift.title && (
              <div className="text-[9px] font-medium opacity-95 truncate leading-snug">{shift.title}</div>
            )}
            {client && (
              <div className="text-[9px] opacity-80 truncate leading-snug flex items-center gap-0.5">
                <MapPin className="w-2 h-2 flex-shrink-0" />
                {client.companyName}
              </div>
            )}
            {timeClockStatus && timeClockStatus.label !== 'Scheduled' && (
              <div className={`absolute top-0.5 right-0.5 px-1 py-px rounded text-[8px] font-bold ${timeClockStatus.bgColor} ${timeClockStatus.color}`}>
                {timeClockStatus.label}
              </div>
            )}
            {conflictBadge && (
              <Badge
                variant="outline"
                className={`absolute bottom-0.5 left-0.5 text-[7px] px-0.5 py-0 ${
                  conflictBadge.severity === 'error'
                    ? 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-700 dark:text-red-300'
                    : 'bg-yellow-100 dark:bg-yellow-900/60 border-yellow-500 text-yellow-700 dark:text-yellow-300'
                }`}
              >
                {conflictBadge.type}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px] text-xs">
          <div className="font-semibold">{tooltipContent}</div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const DayCellTimeline = ({ dayShifts, variant = 'scheduled' }: {
    dayShifts: Shift[];
    variant?: 'scheduled' | 'unassigned';
  }) => {
    const stackRows = computeStackRows(dayShifts);
    const totalRows = Math.max(stackRows.length, 1);

    return (
      <>
        {dayShifts.map(shift => {
          const rowIdx = stackRows.findIndex(row => row.includes(shift));
          return (
            <ShiftBar
              key={shift.id}
              shift={shift}
              rowIdx={rowIdx}
              totalRows={totalRows}
              variant={variant}
            />
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col min-h-full overflow-x-auto" data-testid="week-grid">
      <div className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm min-w-[1100px]">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-blue-50/50 dark:bg-blue-900/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onWeekNav('prev')}
            data-testid="btn-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Previous</span>
          </Button>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200" data-testid="text-week-range">
              {weekDisplay}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDaySelect(new Date())}
              data-testid="btn-today-week"
            >
              Today
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onWeekNav('next')}
            data-testid="btn-next-week"
          >
            <span className="hidden sm:inline mr-1">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex border-b border-slate-200/80 dark:border-slate-600/80">
          <div className="w-[200px] min-w-[200px] px-3 py-2.5 font-semibold text-xs border-r border-slate-200/80 dark:border-slate-600/80 bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === todayStr;
            const isSat = i === 5;
            const isSun = i === 6;
            const dayNum = day.getDate();
            return (
              <div
                key={i}
                className={`flex-1 min-w-[128px] text-center py-2.5 border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0 cursor-pointer transition-colors ${
                  isToday
                    ? 'bg-blue-100 dark:bg-blue-900/40'
                    : (isSat || isSun)
                      ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                }`}
                onClick={() => onDaySelect(day)}
                data-testid={`week-day-header-${i}`}
              >
                <div className={`text-[10px] font-bold tracking-wider ${
                  isToday ? 'text-blue-600 dark:text-blue-400' :
                  (isSat || isSun) ? 'text-emerald-600 dark:text-emerald-400' :
                  'text-slate-500 dark:text-slate-400'
                }`}>
                  {dayLabels[i]}
                </div>
                <div className={`text-sm font-bold ${
                  isToday ? 'text-blue-600 dark:text-blue-400' :
                  (isSat || isSun) ? 'text-emerald-700 dark:text-emerald-300' :
                  'text-slate-700 dark:text-slate-200'
                }`}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`min-w-[1100px] ${trinityWorking ? 'trinity-processing-shimmer' : ''}`}>

        <div className="border-b-2 border-emerald-300 dark:border-emerald-700">
          {(() => {
            const maxUnassignedH = Math.max(64, ...weekDays.map(day => {
              const u = getShiftsForEmployeeDay(null, day);
              return Math.max(computeStackRows(u).length, 1) * 46 + 16;
            }));
            return (
              <div className="flex bg-emerald-50/60 dark:bg-emerald-900/20" style={{ minHeight: `${maxUnassignedH}px` }}>
                <div className="w-[200px] min-w-[200px] px-3 py-2.5 border-r border-emerald-200/60 dark:border-emerald-700/60 flex items-center gap-2.5 flex-shrink-0 bg-emerald-50 dark:bg-emerald-900/30">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Unassigned</div>
                    <div className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">
                      {allUnassignedForWeek.length} shift{allUnassignedForWeek.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                {weekDays.map((day, dayIdx) => {
                  const unassigned = getShiftsForEmployeeDay(null, day);
                  const isToday = day.toDateString() === todayStr;
                  return (
                    <div
                      key={dayIdx}
                      className={`flex-1 min-w-[128px] border-r border-emerald-200/40 dark:border-emerald-800/30 last:border-r-0 relative ${
                        isToday ? 'bg-emerald-100/40 dark:bg-emerald-900/30' : ''
                      }`}
                      data-testid={`week-open-cell-${dayIdx}`}
                    >
                      <DayCellTimeline dayShifts={unassigned} variant="unassigned" />
                      {unassigned.length === 0 && isManager && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <button
                            className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md"
                            onClick={() => {
                              onDaySelect(day);
                              onCellClick(dayIdx, 9);
                            }}
                            data-testid={`week-add-open-${dayIdx}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="border-b border-sky-200 dark:border-sky-800">
          <div className="flex bg-sky-50/40 dark:bg-sky-900/10">
            <div className="w-[200px] min-w-[200px] px-3 py-2.5 border-r border-sky-200/60 dark:border-sky-700/60 flex items-center gap-2.5 flex-shrink-0 bg-sky-50/60 dark:bg-sky-900/20">
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <div className="font-bold text-xs text-sky-700 dark:text-sky-300 uppercase tracking-wide">Available</div>
                <div className="text-[9px] text-sky-600/70 dark:text-sky-400/70">Shifts</div>
              </div>
            </div>
            {(() => {
              const allAvailableByDay = weekDays.map(day => filteredShifts.filter(s => {
                if (s.employeeId) return false;
                if (s.status !== 'draft' && s.status !== 'in_progress') return false;
                return new Date(s.startTime).toDateString() === day.toDateString();
              }));
              const maxAvailH = Math.max(52, ...allAvailableByDay.map(dayShifts =>
                Math.max(computeStackRows(dayShifts).length, 1) * 46 + 16
              ));
              return weekDays.map((day, dayIdx) => {
                const availableShifts = allAvailableByDay[dayIdx];
                const isToday = day.toDateString() === todayStr;
                return (
                  <div
                    key={dayIdx}
                    className={`flex-1 min-w-[128px] border-r border-sky-200/40 dark:border-sky-800/30 last:border-r-0 relative ${
                      isToday ? 'bg-sky-100/30 dark:bg-sky-900/20' : ''
                    }`}
                    style={{ minHeight: `${maxAvailH}px` }}
                    data-testid={`week-available-cell-${dayIdx}`}
                  >
                    <DayCellTimeline dayShifts={availableShifts} variant="unassigned" />
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div>
          <div className="flex items-center px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="w-[200px] min-w-[200px] flex items-center gap-2 flex-shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="font-bold text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">Scheduled Shifts</span>
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p data-testid="text-no-employees">No employees match current filters</p>
            </div>
          ) : (
            filteredEmployees.map((emp, empIndex) => {
              const empColor = getEmployeeColor(emp.id);
              const maxStackPerDay = Math.max(1, ...weekDays.map(d => {
                const dayShifts = getShiftsForEmployeeDay(emp.id, d);
                return computeStackRows(dayShifts).length;
              }));
              const dynamicMinHeight = Math.max(60, maxStackPerDay * 46 + 16);

              const weekTotalHours = weekDays.reduce((sum, d) => {
                return sum + getShiftsForEmployeeDay(emp.id, d).reduce((s, shift) => {
                  const st = new Date(shift.startTime).getTime();
                  const et = new Date(shift.endTime).getTime();
                  return s + (et - st) / (1000 * 60 * 60);
                }, 0);
              }, 0);

              return (
                <div
                  key={emp.id}
                  className={`flex border-b border-slate-200/60 dark:border-slate-700/60 transition-colors ${
                    empIndex % 2 === 0
                      ? 'bg-white/70 dark:bg-slate-900/50'
                      : 'bg-slate-50/80 dark:bg-slate-800/40'
                  }`}
                  style={{ minHeight: `${dynamicMinHeight}px` }}
                  data-testid={`week-employee-row-${emp.id}`}
                >
                  <div className="w-[200px] min-w-[200px] px-3 py-2 border-r border-slate-200/60 dark:border-slate-600/60 bg-slate-50/90 dark:bg-slate-800/80 flex items-center gap-2.5 flex-shrink-0"
                    style={(() => {
                      const pos = resolveEmployeePosition(emp);
                      const catColor = pos ? getPositionCategoryColor(pos.category) : null;
                      return catColor ? { borderLeftWidth: '3px', borderLeftColor: catColor.color, borderLeftStyle: 'solid' as const } : {};
                    })()}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ring-2 ring-white/50 dark:ring-slate-700/50"
                      style={{ backgroundColor: empColor }}
                    >
                      {(emp.firstName?.[0] || '')}{(emp.lastName?.[0] || '')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate leading-tight text-foreground/90 flex items-center gap-1.5">
                        {(() => {
                          const pos = resolveEmployeePosition(emp);
                          const catColor = pos ? getPositionCategoryColor(pos.category) : null;
                          return catColor ? <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${catColor.dotClass}`} /> : null;
                        })()}
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {(() => {
                            const pos = resolveEmployeePosition(emp);
                            return pos ? pos.label : ((emp as any).position || 'Staff');
                          })()}
                        </span>
                        {weekTotalHours > 0 && (
                          <span className="text-[9px] font-semibold text-foreground/60 bg-slate-200/60 dark:bg-slate-700/60 px-1.5 py-px rounded flex-shrink-0">
                            {weekTotalHours.toFixed(0)}h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {weekDays.map((day, dayIdx) => {
                    const dayShifts = getShiftsForEmployeeDay(emp.id, day);
                    const isToday = day.toDateString() === todayStr;
                    const isWeekend = dayIdx >= 5;

                    return (
                      <div
                        key={dayIdx}
                        className={`flex-1 min-w-[128px] border-r border-slate-200/40 dark:border-slate-700/40 last:border-r-0 relative group/cell transition-colors ${
                          isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                        } ${isWeekend ? 'bg-slate-100/50 dark:bg-slate-800/50' : ''}`}
                        data-testid={`week-cell-${emp.id}-${dayIdx}`}
                      >
                        {trinityWorking && dayShifts.length === 0 && empIndex % 2 === dayIdx % 2 && (
                          <div className="absolute inset-2">
                            <div className="h-8 bg-gradient-to-r from-purple-200/40 via-purple-300/60 to-purple-200/40 dark:from-purple-700/30 dark:via-purple-600/50 dark:to-purple-700/30 rounded-md animate-pulse" />
                          </div>
                        )}

                        <DayCellTimeline dayShifts={dayShifts} variant="scheduled" />

                        {dayShifts.length === 0 && !trinityWorking && isManager && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                            <button
                              className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDaySelect(day);
                                onCellClick(dayIdx, 9);
                              }}
                              data-testid={`week-add-shift-${emp.id}-${dayIdx}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
