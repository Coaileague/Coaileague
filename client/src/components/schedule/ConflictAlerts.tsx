/**
 * Conflict Alerts - Visual indicators for scheduling issues
 * Detects overtime, double-booking, insufficient rest, missing certifications
 */

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  AlertTriangle, Clock, Calendar, Users, Shield, 
  ChevronDown, X, CheckCircle 
} from 'lucide-react';
import { format, differenceInHours, differenceInDays, parseISO } from 'date-fns';
import type { Shift, Employee } from '@shared/schema';

export interface ScheduleConflict {
  id: string;
  type: 'overtime' | 'double_booked' | 'insufficient_rest' | 'consecutive_days' | 'missing_cert';
  severity: 'warning' | 'error';
  employeeId: string;
  employeeName: string;
  message: string;
  details: string;
  shiftIds: string[];
}

interface ConflictAlertsProps {
  shifts: Shift[];
  employees: Employee[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onDismissConflict?: (conflictId: string) => void;
  onResolve?: (shiftId: string) => void;
  onDismiss?: () => void;
  className?: string;
}

export function ConflictAlerts({
  shifts,
  employees,
  isCollapsed: externalCollapsed = false,
  onToggleCollapse,
  onDismissConflict,
  onResolve,
  onDismiss,
  className = '',
}: ConflictAlertsProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(externalCollapsed);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const isControlled = !!onToggleCollapse;
  const isCollapsed = isControlled ? externalCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (isControlled) {
      onToggleCollapse?.();
    } else {
      setInternalCollapsed(prev => !prev);
    }
  };

  const conflicts = useMemo(() => {
    return detectConflicts(shifts, employees);
  }, [shifts, employees]);

  const errorCount = conflicts.filter(c => c.severity === 'error').length;
  const warningCount = conflicts.filter(c => c.severity === 'warning').length;
  const visibleConflicts = conflicts.filter(c => !dismissedIds.has(c.id));

  if (conflicts.length === 0) {
    return null;
  }

  const getIcon = (type: ScheduleConflict['type']) => {
    switch (type) {
      case 'overtime':
        return <Clock className="w-4 h-4" />;
      case 'double_booked':
        return <Calendar className="w-4 h-4" />;
      case 'insufficient_rest':
        return <AlertTriangle className="w-4 h-4" />;
      case 'consecutive_days':
        return <Users className="w-4 h-4" />;
      case 'missing_cert':
        return <Shield className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };
  
  const handleDismissOne = (conflictId: string) => {
    setDismissedIds(prev => new Set([...prev, conflictId]));
    onDismissConflict?.(conflictId);
  };
  
  if (visibleConflicts.length === 0) return null;

  return (
    <Collapsible open={!isCollapsed} onOpenChange={handleToggle}>
      <Card className={`border-amber-500/50 ${className}`} data-testid="conflict-alerts">
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger className="flex flex-wrap items-center w-full gap-x-2 gap-y-1">
            <div className="flex items-center gap-1.5 min-w-0 mr-auto">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <CardTitle className="text-xs font-semibold truncate">
                Schedule Conflicts
              </CardTitle>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400 dark:text-amber-400 dark:border-amber-600">
                {visibleConflicts.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onDismiss && (
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDismiss(); }} data-testid="button-dismiss-conflicts" aria-label="Dismiss conflicts">
                  <X className="w-3 h-3" />
                </Button>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${!isCollapsed ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0 px-3 pb-2">
            <ScrollArea className="max-h-[30vh] sm:max-h-[40vh]">
              <div className="space-y-1.5 pr-2">
                {visibleConflicts.map(conflict => (
                  <div 
                    key={conflict.id}
                    className={`rounded-md border p-1.5 ${
                      conflict.severity === 'error' 
                        ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30' 
                        : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                    }`}
                    data-testid={`conflict-${conflict.id}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className={`shrink-0 mt-0.5 ${conflict.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
                        {getIcon(conflict.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-semibold leading-none" data-testid={`conflict-name-${conflict.id}`}>
                            {conflict.employeeName}
                          </span>
                          <span className={`text-[10px] font-medium leading-none ${
                            conflict.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {conflict.message}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {conflict.details}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {onResolve && conflict.shiftIds.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onResolve(conflict.shiftIds[0])}
                              data-testid={`button-resolve-${conflict.id}`}
                            >
                              Resolve
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDismissOne(conflict.id)}
                            data-testid={`button-acknowledge-${conflict.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function detectConflicts(shifts: Shift[], employees: Employee[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const employeeMap = new Map(employees.map(e => [e.id, e]));

  const activeStatuses = new Set(['published', 'scheduled', 'in_progress', 'completed', 'confirmed', 'approved', 'auto_approved']);
  const activeShifts = shifts.filter(s => s.status && activeStatuses.has(s.status));

  const shiftsByEmployee = new Map<string, Shift[]>();
  activeShifts.forEach(shift => {
    if (shift.employeeId) {
      const empShifts = shiftsByEmployee.get(shift.employeeId) || [];
      empShifts.push(shift);
      shiftsByEmployee.set(shift.employeeId, empShifts);
    }
  });

  shiftsByEmployee.forEach((empShifts, employeeId) => {
    const employee = employeeMap.get(employeeId);
    if (!employee) return;

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const sortedShifts = empShifts.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    let totalHours = 0;
    sortedShifts.forEach(shift => {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      totalHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    });

    if (totalHours > 40) {
      conflicts.push({
        id: `overtime-${employeeId}`,
        type: 'overtime',
        severity: totalHours > 50 ? 'error' : 'warning',
        employeeId,
        employeeName,
        message: 'Too Many Hours',
        details: `Scheduled for ${totalHours.toFixed(0)}hrs this week — that's ${(totalHours - 40).toFixed(0)}hrs over the 40hr limit`,
        shiftIds: sortedShifts.map(s => s.id),
      });
    }

    for (let i = 0; i < sortedShifts.length; i++) {
      for (let j = i + 1; j < sortedShifts.length; j++) {
        const shiftA = sortedShifts[i];
        const shiftB = sortedShifts[j];
        
        const aStart = new Date(shiftA.startTime).getTime();
        const aEnd = new Date(shiftA.endTime).getTime();
        const bStart = new Date(shiftB.startTime).getTime();
        const bEnd = new Date(shiftB.endTime).getTime();

        if (aStart < bEnd && bStart < aEnd) {
          conflicts.push({
            id: `double-${shiftA.id}-${shiftB.id}`,
            type: 'double_booked',
            severity: 'error',
            employeeId,
            employeeName,
            message: 'Shift Overlap',
            details: `Has two shifts at the same time on ${format(new Date(shiftA.startTime), 'EEE, MMM d')} — one needs to be moved or removed`,
            shiftIds: [shiftA.id, shiftB.id],
          });
        }
      }
    }

    for (let i = 0; i < sortedShifts.length - 1; i++) {
      const currentEnd = new Date(sortedShifts[i].endTime);
      const nextStart = new Date(sortedShifts[i + 1].startTime);
      const restHours = differenceInHours(nextStart, currentEnd);

      if (restHours < 8 && restHours >= 0) {
        conflicts.push({
          id: `rest-${sortedShifts[i].id}-${sortedShifts[i + 1].id}`,
          type: 'insufficient_rest',
          severity: 'warning',
          employeeId,
          employeeName,
          message: 'Not Enough Rest',
          details: `Only ${restHours}hrs of rest between back-to-back shifts — needs at least 8hrs to recover`,
          shiftIds: [sortedShifts[i].id, sortedShifts[i + 1].id],
        });
      }
    }

    if (sortedShifts.length >= 7) {
      const shiftDates = new Set(
        sortedShifts.map(s => format(new Date(s.startTime), 'yyyy-MM-dd'))
      );
      if (shiftDates.size >= 7) {
        conflicts.push({
          id: `consecutive-${employeeId}`,
          type: 'consecutive_days',
          severity: 'warning',
          employeeId,
          employeeName,
          message: 'No Day Off',
          details: `Working ${shiftDates.size} days straight with no break — consider adding a rest day`,
          shiftIds: sortedShifts.map(s => s.id),
        });
      }
    }
  });

  return conflicts;
}

export function getShiftConflictBadge(
  shift: Shift, 
  allShifts: Shift[], 
  employees: Employee[]
): { type: string; severity: 'warning' | 'error' } | null {
  if (!shift.employeeId) return null;
  
  const employee = employees.find(e => e.id === shift.employeeId);
  if (!employee) return null;

  const empShifts = allShifts.filter(s => s.employeeId === shift.employeeId);
  
  for (const other of empShifts) {
    if (other.id === shift.id) continue;
    
    const aStart = new Date(shift.startTime).getTime();
    const aEnd = new Date(shift.endTime).getTime();
    const bStart = new Date(other.startTime).getTime();
    const bEnd = new Date(other.endTime).getTime();

    if (aStart < bEnd && bStart < aEnd) {
      return { type: 'Double Booked', severity: 'error' };
    }
  }

  let totalHours = 0;
  empShifts.forEach(s => {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    totalHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  });

  if (totalHours > 40) {
    return { type: 'Overtime', severity: totalHours > 50 ? 'error' : 'warning' };
  }

  return null;
}

/**
 * Time Clock Status - GetSling-style shift status indicators
 * Returns visual status based on current time vs shift times and clock in/out status
 */
export type TimeClockStatus = 
  | 'scheduled'    // Future shift, not started
  | 'clocked_in'   // Currently working
  | 'on_break'     // On break during shift
  | 'late'         // Should have started, not clocked in
  | 'early_clock'  // Clocked in before shift start
  | 'completed'    // Shift finished and clocked out
  | 'missed'       // Past shift, never clocked in
  | 'overtime';    // Still clocked in past end time

export interface TimeClockInfo {
  status: TimeClockStatus;
  label: string;
  color: string;
  bgColor: string;
  icon: 'clock' | 'check' | 'alert' | 'play' | 'pause' | 'x';
}

export function getShiftTimeClockStatus(
  shift: Shift,
  now: Date = new Date()
): TimeClockInfo {
  const startTime = new Date(shift.startTime);
  const endTime = new Date(shift.endTime);
  const currentTime = now.getTime();
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  
  // Check if shift has actual clock in/out times
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const hasClockIn = !!shift.actualClockIn;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const hasClockOut = !!shift.actualClockOut;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const actualClockIn = shift.actualClockIn ? new Date(shift.actualClockIn).getTime() : null;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const actualClockOut = shift.actualClockOut ? new Date(shift.actualClockOut).getTime() : null;
  
  // Completed: has both clock in and out
  if (hasClockIn && hasClockOut) {
    return {
      status: 'completed',
      label: 'Completed',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      icon: 'check',
    };
  }
  
  // Currently clocked in
  if (hasClockIn && !hasClockOut) {
    // Check if past end time (overtime)
    if (currentTime > endMs) {
      return {
        status: 'overtime',
        label: 'Overtime',
        color: 'text-amber-600',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        icon: 'alert',
      };
    }
    // Normal working
    return {
      status: 'clocked_in',
      label: 'Working',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'play',
    };
  }
  
  // Not clocked in yet
  if (!hasClockIn) {
    // Future shift
    if (currentTime < startMs) {
      // Check for early clock allowance (15 min before)
      if (currentTime > startMs - 15 * 60 * 1000) {
        return {
          status: 'scheduled',
          label: 'Ready',
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          icon: 'clock',
        };
      }
      return {
        status: 'scheduled',
        label: 'Scheduled',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
        icon: 'clock',
      };
    }
    
    // Should have started - late
    if (currentTime >= startMs && currentTime < endMs) {
      // Grace period: 5 minutes
      if (currentTime < startMs + 5 * 60 * 1000) {
        return {
          status: 'scheduled',
          label: 'Starting',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          icon: 'clock',
        };
      }
      return {
        status: 'late',
        label: 'Late',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        icon: 'alert',
      };
    }
    
    // Past shift, never clocked in
    if (currentTime > endMs) {
      return {
        status: 'missed',
        label: 'No Show',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        icon: 'x',
      };
    }
  }
  
  // Default: scheduled
  return {
    status: 'scheduled',
    label: 'Scheduled',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    icon: 'clock',
  };
}
