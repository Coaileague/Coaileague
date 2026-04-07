/**
 * Week Stats Bar - Compact inline schedule summary bar
 * Matches GetSling screenshot: thin horizontal bar with key metrics
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, DollarSign, Users, TrendingUp, CheckCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Shift, Employee } from '@shared/schema';

interface WeekStatsBarProps {
  weekStart: Date;
  weekEnd: Date;
  weekDisplay: string;
  shifts: Shift[];
  employees: Employee[];
  onViewDetailedReport: () => void;
}

export function WeekStatsBar({
  weekStart,
  weekEnd,
  weekDisplay,
  shifts,
  employees,
  onViewDetailedReport,
}: WeekStatsBarProps) {
  const stats = useMemo(() => calculateStatsFromShifts(shifts, employees), [shifts, employees]);

  const fillPct = stats.fillRate.toFixed(0);
  const hasOvertime = stats.overtimeHours > 0;
  const hasOpenShifts = stats.openShifts > 0;

  return (
    <div
      className="flex items-center gap-0 flex-wrap border-b border-border/40 bg-muted/30 px-3 py-1.5 text-xs"
      data-testid="week-stats-bar"
    >
      {/* Week label */}
      <span className="font-semibold text-foreground/80 mr-3 shrink-0">
        Week Summary:
      </span>
      <span className="text-muted-foreground mr-4 shrink-0">{weekDisplay}</span>

      {/* Divider */}
      <div className="h-3.5 w-px bg-border/60 mr-4 hidden sm:block" />

      {/* Total Hours */}
      <div className="flex items-center gap-1 mr-4 shrink-0">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold text-foreground">{stats.totalHours.toFixed(1)}h</span>
        <span className="text-muted-foreground">Total Hours</span>
      </div>

      {/* Labor Cost */}
      <div className="flex items-center gap-1 mr-4 shrink-0">
        <DollarSign className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold text-foreground">${stats.laborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span className="text-muted-foreground">Labor Cost</span>
      </div>

      {/* Avg/Employee */}
      <div className="flex items-center gap-1 mr-4 shrink-0">
        <Users className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold text-foreground">{stats.avgHoursPerEmployee.toFixed(1)}h</span>
        <span className="text-muted-foreground">Avg/Employee</span>
      </div>

      {/* Overtime */}
      <div className={cn("flex items-center gap-1 mr-4 shrink-0", hasOvertime && "text-amber-600 dark:text-amber-400")}>
        <TrendingUp className="h-3 w-3" />
        <span className="font-bold">{stats.overtimeHours.toFixed(1)}h</span>
        <span className={cn("text-muted-foreground", hasOvertime && "text-amber-600/80 dark:text-amber-400/80")}>Overtime</span>
      </div>

      {/* Fill Rate */}
      <div className="flex items-center gap-1 mr-3 shrink-0">
        <CheckCircle className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold text-foreground">{stats.shiftsFilled}/{stats.totalShifts}</span>
        <span className="text-muted-foreground">
          ({fillPct}%) Filled
        </span>
      </div>

      {/* Open shifts badge */}
      {hasOpenShifts && (
        <Badge
          className="mr-4 text-[10px] px-1.5 py-0 h-4 shrink-0 bg-orange-600 text-white border-none"
          data-testid="badge-open-shifts"
        >
          {stats.openShifts} Open
        </Badge>
      )}

      {/* Spacer pushes report button to the right */}
      <div className="flex-1 hidden sm:block" />

      {/* View Detailed Report */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onViewDetailedReport}
        data-testid="button-view-report"
        className="h-6 px-2 text-xs font-medium text-primary hover:text-primary shrink-0 ml-auto sm:ml-0"
      >
        <BarChart3 className="h-3 w-3 mr-1" />
        View Detailed Report
      </Button>
    </div>
  );
}

function calculateStatsFromShifts(shifts: Shift[], employees: Employee[]) {
  const assignedShifts = shifts.filter(s => s.employeeId);
  const openShifts = shifts.filter(s => !s.employeeId);

  let totalHours = 0;
  let laborCost = 0;
  const employeeHours = new Map<string, number>();

  shifts.forEach(shift => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    totalHours += hours;

    if (shift.employeeId) {
      const currentHours = employeeHours.get(shift.employeeId) || 0;
      employeeHours.set(shift.employeeId, currentHours + hours);

      const employee = employees.find(e => e.id === shift.employeeId);
      const hourlyRate = shift.hourlyRateOverride
        ? parseFloat(shift.hourlyRateOverride)
        : (employee?.hourlyRate ? parseFloat(employee.hourlyRate as string) : 15);
      laborCost += hours * hourlyRate;
    }
  });

  let overtimeHours = 0;
  employeeHours.forEach(hours => {
    if (hours > 40) overtimeHours += hours - 40;
  });

  const activeEmployeeCount = employeeHours.size || 1;
  const avgHoursPerEmployee = totalHours / activeEmployeeCount;
  const fillRate = shifts.length > 0 ? (assignedShifts.length / shifts.length) * 100 : 100;

  return {
    totalHours,
    laborCost,
    avgHoursPerEmployee,
    overtimeHours,
    shiftsFilled: assignedShifts.length,
    totalShifts: shifts.length,
    openShifts: openShifts.length,
    fillRate,
  };
}
