/**
 * Week Stats Bar - GetSling-style summary bar with key metrics
 * Shows labor cost, hours, fill rate, overtime - all from database
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, DollarSign, Users, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
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
  const { data: stats, isLoading } = useQuery<{
    totalHours: number;
    laborCost: number;
    avgHoursPerEmployee: number;
    overtimeHours: number;
    shiftsFilled: number;
    totalShifts: number;
    openShifts: number;
    fillRate: number;
  }>({
    queryKey: ['/api/schedules/week/stats', weekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/week/stats?weekStart=${weekStart.toISOString()}`);
      if (!res.ok) {
        const calculated = calculateStatsFromShifts(shifts, employees);
        return calculated;
      }
      return res.json();
    },
  });

  const calculatedStats = useMemo(() => {
    if (stats) return stats;
    return calculateStatsFromShifts(shifts, employees);
  }, [stats, shifts, employees]);

  if (isLoading) {
    return (
      <Card className="p-4" data-testid="week-stats-bar">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </Card>
    );
  }

  const hasOvertimeWarning = calculatedStats.overtimeHours > 0;
  const hasOpenShiftWarning = calculatedStats.openShifts > 0;

  return (
    <Card className="p-4 bg-card/50" data-testid="week-stats-bar">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Week Summary:</span>
          <span className="text-sm text-muted-foreground">{weekDisplay}</span>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              <strong>{calculatedStats.totalHours.toFixed(1)}h</strong>
              <span className="text-muted-foreground ml-1">Total Hours</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              <strong>${(calculatedStats?.laborCost ?? 0).toLocaleString()}</strong>
              <span className="text-muted-foreground ml-1">Labor Cost</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              <strong>{calculatedStats.avgHoursPerEmployee.toFixed(1)}h</strong>
              <span className="text-muted-foreground ml-1">Avg/Employee</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${hasOvertimeWarning ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <span className="text-sm">
              <strong className={hasOvertimeWarning ? 'text-amber-500' : ''}>
                {calculatedStats.overtimeHours.toFixed(1)}h
              </strong>
              <span className="text-muted-foreground ml-1">Overtime</span>
            </span>
            {hasOvertimeWarning && (
              <Badge variant="outline" className="text-xs text-amber-500 border-amber-500">
                <AlertTriangle className="w-3 h-3 mr-1" />
                OT
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">
              <strong>{calculatedStats.shiftsFilled}/{calculatedStats.totalShifts}</strong>
              <span className="text-muted-foreground ml-1">
                ({calculatedStats.fillRate.toFixed(0)}%) Filled
              </span>
            </span>
            {hasOpenShiftWarning && (
              <Badge variant="destructive" className="text-xs">
                {calculatedStats.openShifts} Open
              </Badge>
            )}
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={onViewDetailedReport}
            data-testid="button-view-report"
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            View Detailed Report
          </Button>
        </div>
      </div>
    </Card>
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
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    totalHours += hours;

    if (shift.employeeId) {
      const currentHours = employeeHours.get(shift.employeeId) || 0;
      employeeHours.set(shift.employeeId, currentHours + hours);

      const employee = employees.find(e => e.id === shift.employeeId);
      const hourlyRate = shift.hourlyRateOverride 
        ? parseFloat(shift.hourlyRateOverride) 
        : (employee?.hourlyRate ? parseFloat(employee.hourlyRate) : 15);
      laborCost += hours * hourlyRate;
    }
  });

  let overtimeHours = 0;
  employeeHours.forEach((hours) => {
    if (hours > 40) {
      overtimeHours += hours - 40;
    }
  });

  const activeEmployeeCount = employeeHours.size || 1;
  const avgHoursPerEmployee = totalHours / activeEmployeeCount;

  const fillRate = shifts.length > 0 
    ? (assignedShifts.length / shifts.length) * 100 
    : 100;

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
