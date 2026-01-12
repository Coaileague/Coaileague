/**
 * ScheduleGrid - GetSling-quality schedule interface
 * Features: Employee sidebar, color-coded shifts, drag & drop, Trinity AI indicators
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, addHours, startOfDay, differenceInMinutes, isSameDay } from 'date-fns';
import { cn, formatRoleDisplay } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Sparkles, Clock, MapPin, Shield, User, Plus, Calendar,
  ChevronDown, ChevronUp
} from 'lucide-react';
import type { Shift, Employee, Client } from '@shared/schema';

interface ScheduleGridProps {
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  weekStart: Date;
  selectedDate: Date;
  onShiftClick: (shift: Shift) => void;
  onCreateShift: (employee: Employee, date: Date, hour: number) => void;
  onShiftDrop?: (shift: Shift, newEmployeeId: string, newStartTime: Date) => void;
  canEdit: boolean;
  viewMode: 'day' | 'week';
}

type ShiftStatus = 'scheduled' | 'pending' | 'conflict' | 'published' | 'completed' | 'draft';

const SHIFT_COLORS: Record<ShiftStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'bg-green-500/10', border: 'border-l-green-500', text: 'text-green-700 dark:text-green-300' },
  pending: { bg: 'bg-yellow-500/10', border: 'border-l-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
  conflict: { bg: 'bg-red-500/10', border: 'border-l-red-500', text: 'text-red-700 dark:text-red-300' },
  published: { bg: 'bg-blue-500/10', border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  completed: { bg: 'bg-gray-500/10', border: 'border-l-gray-400', text: 'text-gray-600 dark:text-gray-400' },
  draft: { bg: 'bg-purple-500/10', border: 'border-l-purple-500', text: 'text-purple-700 dark:text-purple-300' },
};

const HOUR_WIDTH = 60; // pixels per hour
const ROW_HEIGHT = 80; // pixels per employee row
const SIDEBAR_WIDTH = 240; // pixels for employee sidebar

function getShiftStatus(shift: Shift): ShiftStatus {
  if (shift.status === 'completed') return 'completed';
  if (shift.status === 'draft') return 'draft';
  if (shift.status === 'pending' || shift.status === 'pending_approval') return 'pending';
  if (shift.status === 'published') return 'published';
  if (shift.status === 'confirmed') return 'scheduled';
  return 'scheduled';
}

function EmployeeSidebarCard({ 
  employee, 
  weeklyHours, 
  isOnShift,
  expandedId,
  onToggleExpand 
}: { 
  employee: Employee; 
  weeklyHours: number; 
  isOnShift: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedId === employee.id;
  const initials = `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase();
  const payRate = (employee as any).hourlyRate || (employee as any).payRate || 0;

  return (
    <div
      className={cn(
        "flex flex-col border-b border-border/50 transition-all cursor-pointer hover-elevate",
        isExpanded ? "bg-muted/50" : ""
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onToggleExpand(employee.id)}
      data-testid={`employee-sidebar-${employee.id}`}
    >
      <div className="flex items-start gap-3 p-3 flex-1">
        <Avatar className="h-12 w-12 border-2 border-border">
          <AvatarImage src={(employee as any).photoUrl || (employee as any).avatarUrl} alt={employee.firstName || ''} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">
            {employee.firstName} {employee.lastName}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {(employee as any).jobTitle || (employee as any).position || 'Employee'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0",
                isOnShift 
                  ? "border-green-500 text-green-600 bg-green-500/10" 
                  : "border-muted-foreground/30"
              )}
            >
              {isOnShift ? '● On Shift' : '○ Available'}
            </Badge>
            {payRate > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ${payRate}/hr
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {weeklyHours.toFixed(1)}h
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}

function ShiftBlock({ 
  shift, 
  client, 
  dayStart,
  onClick,
  isDragging 
}: { 
  shift: Shift; 
  client?: Client;
  dayStart: Date;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const status = getShiftStatus(shift);
  const colors = SHIFT_COLORS[status];
  
  const shiftStart = new Date(shift.startTime);
  const shiftEnd = new Date(shift.endTime);
  
  const startMinutes = differenceInMinutes(shiftStart, dayStart);
  const durationMinutes = differenceInMinutes(shiftEnd, shiftStart);
  
  const leftPx = Math.max(0, (startMinutes / 60) * HOUR_WIDTH);
  const widthPx = Math.max(60, (durationMinutes / 60) * HOUR_WIDTH);
  
  const isAiGenerated = (shift as any).aiGenerated || (shift as any).trinityOptimized;
  
  const clientName = client?.companyName || (shift as any).clientName || 'Unassigned';
  const siteName = (shift as any).siteName || (shift as any).location || '';

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded-md border-l-4 shadow-sm cursor-pointer transition-all",
        colors.bg,
        colors.border,
        isDragging ? "opacity-60 scale-105 shadow-lg z-50" : "hover:shadow-md hover:-translate-y-0.5"
      )}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx - 4}px`,
      }}
      onClick={onClick}
      data-testid={`shift-block-${shift.id}`}
    >
      <div className="p-2 h-full flex flex-col overflow-hidden">
        <div className={cn("text-xs font-bold truncate flex items-center gap-1", colors.text)}>
          <Clock className="h-3 w-3 flex-shrink-0" />
          {format(shiftStart, 'h:mm a')} - {format(shiftEnd, 'h:mm a')}
          {isAiGenerated && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent>Trinity AI optimized this shift</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-xs font-medium truncate flex items-center gap-1 text-foreground/80 mt-0.5">
          <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          {clientName}
          {siteName && ` - ${siteName}`}
        </div>
        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
          <Shield className="h-3 w-3 flex-shrink-0" />
          {formatRoleDisplay((shift as any).positionType || (shift as any).role || 'Security')}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ dayStart }: { dayStart: Date }) {
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  if (!isSameDay(now, dayStart)) return null;
  
  const minutesSinceStart = differenceInMinutes(now, dayStart);
  const leftPx = (minutesSinceStart / 60) * HOUR_WIDTH;
  
  if (leftPx < 0 || leftPx > 24 * HOUR_WIDTH) return null;
  
  return (
    <div 
      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
      style={{ left: `${leftPx}px` }}
    >
      <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-red-500" />
    </div>
  );
}

function TimeHeader({ dayStart }: { dayStart: Date }) {
  const hours = Array.from({ length: 24 }, (_, i) => addHours(dayStart, i));
  
  return (
    <div className="flex border-b border-border bg-muted/30 sticky top-0 z-10">
      {hours.map((hour, i) => (
        <div 
          key={i}
          className="flex-shrink-0 text-xs text-muted-foreground px-2 py-2 border-r border-border/30 text-center"
          style={{ width: HOUR_WIDTH }}
        >
          {format(hour, 'h a')}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAutoSchedule }: { onAutoSchedule?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="schedule-empty-state">
      <Calendar className="h-16 w-16 mb-4 text-muted-foreground" />
      <h3 className="text-lg font-semibold text-foreground mb-2">No shifts scheduled</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Create shifts manually or let Trinity AI optimize your schedule automatically.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" data-testid="button-create-schedule">
          <Plus className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
        {onAutoSchedule && (
          <Button onClick={onAutoSchedule} data-testid="button-auto-schedule-trinity">
            <Sparkles className="h-4 w-4 mr-2" />
            Auto-Schedule with Trinity
          </Button>
        )}
      </div>
    </div>
  );
}

export function ScheduleGrid({
  shifts,
  employees,
  clients,
  weekStart,
  selectedDate,
  onShiftClick,
  onCreateShift,
  onShiftDrop,
  canEdit,
  viewMode,
}: ScheduleGridProps) {
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  
  const dayStart = startOfDay(selectedDate);
  
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  const employeeShiftsMap = useMemo(() => {
    const map = new Map<string, Shift[]>();
    shifts.forEach(shift => {
      if (shift.employeeId && isSameDay(new Date(shift.startTime), selectedDate)) {
        const empShifts = map.get(shift.employeeId) || [];
        empShifts.push(shift);
        map.set(shift.employeeId, empShifts);
      }
    });
    return map;
  }, [shifts, selectedDate]);

  const weeklyHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    shifts.forEach(shift => {
      if (shift.employeeId) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        map.set(shift.employeeId, (map.get(shift.employeeId) || 0) + hours);
      }
    });
    return map;
  }, [shifts]);

  const now = new Date();
  const isOnShiftMap = useMemo(() => {
    const map = new Map<string, boolean>();
    shifts.forEach(shift => {
      if (shift.employeeId) {
        const start = new Date(shift.startTime);
        const end = new Date(shift.endTime);
        if (now >= start && now <= end) {
          map.set(shift.employeeId, true);
        }
      }
    });
    return map;
  }, [shifts]);

  const handleCellClick = useCallback((employee: Employee, hour: number) => {
    if (!canEdit) return;
    onCreateShift(employee, selectedDate, hour);
  }, [canEdit, onCreateShift, selectedDate]);

  if (employees.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex border rounded-lg bg-card shadow-sm overflow-hidden" data-testid="schedule-grid">
      {/* Employee Sidebar */}
      <div 
        className="flex-shrink-0 border-r border-border bg-muted/20"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="h-10 border-b border-border flex items-center px-3 bg-muted/30">
          <User className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="text-sm font-medium">Employees</span>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {employees.length}
          </Badge>
        </div>
        <ScrollArea className="h-[calc(100vh-280px)]">
          {employees.map(employee => (
            <EmployeeSidebarCard
              key={employee.id}
              employee={employee}
              weeklyHours={weeklyHoursMap.get(employee.id) || 0}
              isOnShift={isOnShiftMap.get(employee.id) || false}
              expandedId={expandedEmployeeId}
              onToggleExpand={setExpandedEmployeeId}
            />
          ))}
        </ScrollArea>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-[calc(100vh-240px)]" ref={gridRef}>
          <div style={{ width: 24 * HOUR_WIDTH }}>
            <TimeHeader dayStart={dayStart} />
            
            <div className="relative">
              <CurrentTimeIndicator dayStart={dayStart} />
              
              {employees.map((employee, rowIndex) => {
                const empShifts = employeeShiftsMap.get(employee.id) || [];
                
                return (
                  <div 
                    key={employee.id}
                    className={cn(
                      "relative border-b border-border/30",
                      rowIndex % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    data-testid={`schedule-row-${employee.id}`}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-border/10 cursor-pointer hover:bg-primary/5"
                        style={{ left: i * HOUR_WIDTH, width: HOUR_WIDTH }}
                        onClick={() => handleCellClick(employee, i)}
                        data-testid={`schedule-cell-${employee.id}-hour-${i}`}
                      />
                    ))}
                    
                    {/* Shift blocks */}
                    {empShifts.map(shift => (
                      <ShiftBlock
                        key={shift.id}
                        shift={shift}
                        client={shift.clientId ? clientMap.get(shift.clientId) : undefined}
                        dayStart={dayStart}
                        onClick={() => onShiftClick(shift)}
                      />
                    ))}
                    
                    {/* Empty state per row */}
                    {empShifts.length === 0 && canEdit && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                          Click to add shift
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

export default ScheduleGrid;
