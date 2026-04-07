/**
 * ScheduleGrid - GetSling-quality schedule interface with drag-and-drop
 * Features: Employee sidebar, color-coded shifts, dnd-kit drag & drop, Trinity AI indicators
 * Desktop-only drag-and-drop with screen-width guards
 */

import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { format, addHours, startOfDay, differenceInMinutes, isSameDay } from 'date-fns';
import { cn, formatRoleDisplay } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Sparkles, Clock, MapPin, Shield, User, Plus, Calendar,
  ChevronDown, ChevronUp, GripVertical
} from 'lucide-react';
import {
  DndContext,
  pointerWithin,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { Shift, Employee, Client } from '@shared/schema';
import { getPositionById, getPositionByTitle, inferPositionFromTitle, POSITION_CATEGORIES } from '@shared/positionRegistry';
import type { PositionDefinition } from '@shared/positionRegistry';
import { POSITION_CATEGORY_COLORS, getPositionCategoryColor } from '@/constants/scheduling';

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
  pendingShiftIds?: Set<string>;
}

type ShiftStatus = 'scheduled' | 'pending' | 'conflict' | 'published' | 'completed' | 'draft';

const SHIFT_STATUS_GRADIENTS: Record<ShiftStatus, { gradient: string; border: string; text: string }> = {
  scheduled: { gradient: 'from-green-500/15 via-green-400/10 to-emerald-500/5', border: 'border-l-green-500', text: 'text-green-700 dark:text-green-300' },
  pending: { gradient: 'from-yellow-500/15 via-amber-400/10 to-orange-500/5', border: 'border-l-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
  conflict: { gradient: 'from-red-500/15 via-red-400/10 to-rose-500/5', border: 'border-l-red-500', text: 'text-red-700 dark:text-red-300' },
  published: { gradient: 'from-blue-500/15 via-blue-400/10 to-indigo-500/5', border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  completed: { gradient: 'from-gray-500/10 via-gray-400/5 to-slate-500/5', border: 'border-l-gray-400', text: 'text-gray-600 dark:text-gray-400' },
  draft: { gradient: 'from-purple-500/15 via-violet-400/10 to-purple-500/5', border: 'border-l-purple-500', text: 'text-purple-700 dark:text-purple-300' },
};

const SHIFT_COLORS: Record<ShiftStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'bg-green-500/10', border: 'border-l-green-500', text: 'text-green-700 dark:text-green-300' },
  pending: { bg: 'bg-yellow-500/10', border: 'border-l-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
  conflict: { bg: 'bg-red-500/10', border: 'border-l-red-500', text: 'text-red-700 dark:text-red-300' },
  published: { bg: 'bg-blue-500/10', border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  completed: { bg: 'bg-gray-500/10', border: 'border-l-gray-400', text: 'text-gray-600 dark:text-gray-400' },
  draft: { bg: 'bg-purple-500/10', border: 'border-l-purple-500', text: 'text-purple-700 dark:text-purple-300' },
};

const HOUR_WIDTH = 56;
const ROW_HEIGHT = 88;
const SIDEBAR_WIDTH = 220;
const SHIFT_VERTICAL_MARGIN = 8;
const CELL_PADDING = 2;
const DESKTOP_MIN_WIDTH = 1024;

function getShiftStatus(shift: Shift): ShiftStatus {
  if (shift.status === 'completed') return 'completed';
  if (shift.status === 'cancelled') return 'completed';
  if (shift.status === 'in_progress') return 'pending';
  if (shift.status === 'published') return 'published';
  if (shift.status === 'scheduled') return 'scheduled';
  if (!shift.status) return 'draft';
  return 'scheduled';
}

function resolveEmployeePosition(employee: Employee): PositionDefinition | undefined {
  const emp = employee as any;
  if (emp.position) {
    const byId = getPositionById(emp.position);
    if (byId) return byId;
  }
  const title = emp.jobTitle || emp.role || emp.organizationalTitle || '';
  if (title) {
    return inferPositionFromTitle(title);
  }
  return undefined;
}

function PositionColorDot({ position }: { position: PositionDefinition | undefined }) {
  if (!position) return null;
  const catColor = getPositionCategoryColor(position.category);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-block w-2.5 h-2.5 rounded-full flex-shrink-0", catColor.dotClass)}
          data-testid={`position-dot-${position.id}`}
        />
      </TooltipTrigger>
      <TooltipContent>{position.label} ({catColor.label})</TooltipContent>
    </Tooltip>
  );
}

export function PositionColorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/30" data-testid="position-color-legend">
      <span className="text-xs font-semibold text-muted-foreground mr-1">Positions:</span>
      {POSITION_CATEGORIES.map(cat => {
        const catColor = POSITION_CATEGORY_COLORS[cat.id];
        if (!catColor) return null;
        return (
          <div key={cat.id} className="flex items-center gap-1.5" data-testid={`legend-item-${cat.id}`}>
            <span className={cn("w-2.5 h-2.5 rounded-full", catColor.dotClass)} />
            <span className="text-[11px] text-muted-foreground">{cat.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const EmployeeSidebarCard = memo(function EmployeeSidebarCard({ 
  employee, 
  weeklyHours, 
  isOnShift,
  expandedId,
  onToggleExpand,
  isDropTarget,
}: { 
  employee: Employee; 
  weeklyHours: number; 
  isOnShift: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  isDropTarget?: boolean;
}) {
  const isExpanded = expandedId === employee.id;
  const initials = `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase();
  const payRate = (employee as any).hourlyRate || (employee as any).payRate || 0;
  const position = resolveEmployeePosition(employee);
  const catColor = position ? getPositionCategoryColor(position.category) : null;

  return (
    <div
      className={cn(
        "employee-sidebar-card flex flex-col border-b border-border/30 transition-all cursor-pointer",
        "hover:bg-white/60 dark:hover:bg-slate-800/40",
        isExpanded ? "bg-white/80 dark:bg-slate-800/60" : "bg-transparent",
        isDropTarget && "ring-2 ring-primary/50 bg-primary/5"
      )}
      style={{ 
        height: ROW_HEIGHT,
        borderLeftWidth: catColor ? '3px' : undefined,
        borderLeftColor: catColor ? catColor.color : undefined,
        borderLeftStyle: catColor ? 'solid' : undefined,
      }}
      onClick={() => onToggleExpand(employee.id)}
      data-testid={`employee-sidebar-${employee.id}`}
    >
      <div className="flex items-start gap-3.5 p-4 flex-1">
        <Avatar className="h-11 w-11 border border-white dark:border-slate-700 shadow-sm">
          <AvatarImage src={(employee as any).photoUrl || (employee as any).avatarUrl} alt={employee.firstName || ''} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] truncate text-foreground/90 flex items-center gap-1.5">
            <PositionColorDot position={position} />
            {employee.firstName} {employee.lastName}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {position ? position.label : ((employee as any).jobTitle || (employee as any).position || 'Employee')}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {position && catColor && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-medium"
                style={{ borderColor: catColor.color, color: catColor.color }}
                data-testid={`badge-position-${employee.id}`}
              >
                {catColor.label}
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 font-medium",
                isOnShift 
                  ? "border-green-500 text-green-600 dark:text-green-400 bg-green-500/10" 
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {isOnShift ? '● On Shift' : '○ Available'}
            </Badge>
            {payRate > 0 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                ${payRate}/hr
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs font-semibold text-foreground/70 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            {weeklyHours.toFixed(1)}h
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
});

const DraggableShiftBlock = memo(function DraggableShiftBlock({ 
  shift, 
  client, 
  dayStart,
  onShiftClick,
  employeePosition,
  canDrag,
  isPending,
}: { 
  shift: Shift; 
  client?: Client;
  dayStart: Date;
  onShiftClick: (shift: Shift) => void;
  employeePosition?: PositionDefinition;
  canDrag: boolean;
  isPending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { type: 'shift', shift },
    disabled: !canDrag,
  });

  const status = getShiftStatus(shift);
  const gradientColors = SHIFT_STATUS_GRADIENTS[status];
  
  const shiftStart = new Date(shift.startTime);
  const shiftEnd = new Date(shift.endTime);
  
  const startMinutes = differenceInMinutes(shiftStart, dayStart);
  const durationMinutes = differenceInMinutes(shiftEnd, shiftStart);
  
  const leftPx = Math.max(0, (startMinutes / 60) * HOUR_WIDTH);
  const widthPx = Math.max(80, (durationMinutes / 60) * HOUR_WIDTH);
  
  const isAiGenerated = (shift as any).aiGenerated || (shift as any).trinityOptimized;
  
  const clientName = client?.companyName || (shift as any).clientName || 'Unassigned';
  const siteName = (shift as any).siteName || (shift as any).location || '';

  const positionCatColor = employeePosition ? getPositionCategoryColor(employeePosition.category) : null;

  const durationHours = (durationMinutes / 60).toFixed(1);

  const style: React.CSSProperties = {
    left: `${leftPx + 2}px`,
    width: `${widthPx - 6}px`,
    top: `${SHIFT_VERTICAL_MARGIN}px`,
    bottom: `${SHIFT_VERTICAL_MARGIN}px`,
    borderWidth: '2px',
    borderStyle: 'solid',
    borderLeftWidth: '4px',
    borderColor: positionCatColor ? positionCatColor.color : undefined,
    borderTopColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
    borderRightColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
    borderBottomColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
  };

  if (transform && !isDragging) {
    style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0)`;
    style.zIndex = 100;
  }

  const tooltipLines = [
    `${format(shiftStart, 'h:mm a')} - ${format(shiftEnd, 'h:mm a')} (${durationHours}h)`,
    clientName,
    siteName || null,
    employeePosition ? employeePosition.label : null,
    `Status: ${status}`,
  ].filter(Boolean);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn(
            "shift-block absolute rounded-lg cursor-pointer transition-all duration-200",
            `bg-gradient-to-r ${gradientColors.gradient}`,
            "bg-white/90 dark:bg-slate-800/90",
            "backdrop-blur-[2px]",
            isDragging 
              ? "opacity-30 pointer-events-none" 
              : "hover:shadow-sm hover:-translate-y-0.5 hover:ring-1 hover:ring-border/60",
            isPending && "shift-pending-reassign"
          )}
          style={{
            ...style,
            boxShadow: isDragging ? undefined : '0 1px 6px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
          }}
          onClick={() => {
            if (!isDragging) onShiftClick(shift);
          }}
          data-testid={`shift-block-${shift.id}`}
        >
          <div className="px-2.5 py-1.5 h-full flex flex-col overflow-hidden justify-center">
            <div className="flex items-center gap-1">
              {canDrag && (
                <div
                  {...listeners}
                  {...attributes}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`drag-handle-${shift.id}`}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
              )}
              <div className={cn("text-[12px] font-bold truncate flex items-center gap-1.5 flex-1 tracking-wide", gradientColors.text)}>
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>{format(shiftStart, 'h:mm a')} - {format(shiftEnd, 'h:mm a')}</span>
                <span className="text-[10px] font-medium opacity-70">({durationHours}h)</span>
              </div>
              {isAiGenerated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Trinity AI optimized this shift</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-[11px] font-semibold truncate flex items-center gap-1.5 text-foreground/80 mt-1">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{clientName}{siteName && ` - ${siteName}`}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              {employeePosition && positionCatColor ? (
                <>
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", positionCatColor.dotClass)} />
                  <span className="truncate font-medium">{employeePosition.label}</span>
                </>
              ) : (
                <>
                  <Shield className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="truncate">{formatRoleDisplay((shift as any).positionType || (shift as any).role || 'Security')}</span>
                </>
              )}
              {isPending && (
                <span className="ml-auto flex-shrink-0 text-[9px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-sm border border-amber-400/40">
                  Pending
                </span>
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[300px] text-xs">
        {tooltipLines.map((line, i) => (
          <div key={i} className={i === 0 ? 'font-semibold' : 'text-muted-foreground'}>{line}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
});

function ShiftDragOverlay({ 
  shift, 
  client, 
  employeePosition,
}: { 
  shift: Shift; 
  client?: Client;
  employeePosition?: PositionDefinition;
}) {
  const status = getShiftStatus(shift);
  const gradientColors = SHIFT_STATUS_GRADIENTS[status];
  const shiftStart = new Date(shift.startTime);
  const shiftEnd = new Date(shift.endTime);
  const clientName = client?.companyName || (shift as any).clientName || 'Unassigned';
  const positionCatColor = employeePosition ? getPositionCategoryColor(employeePosition.category) : null;
  const durationMinutes = differenceInMinutes(shiftEnd, shiftStart);
  const durationHours = (durationMinutes / 60).toFixed(1);

  return (
    <div
      className={cn(
        "rounded-lg shadow-sm ring-2 ring-primary/50 pointer-events-none",
        `bg-gradient-to-r ${gradientColors.gradient}`,
        "bg-white dark:bg-slate-800"
      )}
      style={{
        width: Math.max(180, (durationMinutes / 60) * HOUR_WIDTH - 6),
        height: ROW_HEIGHT - SHIFT_VERTICAL_MARGIN * 2,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderLeftWidth: '4px',
        borderColor: positionCatColor ? positionCatColor.color : 'hsl(var(--primary))',
        borderTopColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
        borderRightColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
        borderBottomColor: positionCatColor ? `${positionCatColor.color}40` : undefined,
        transform: 'scale(1.05)',
      }}
      data-testid="shift-drag-overlay"
    >
      <div className="px-2.5 py-1.5 h-full flex flex-col overflow-hidden justify-center">
        <div className={cn("text-[12px] font-bold truncate flex items-center gap-1.5", gradientColors.text)}>
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span>{format(shiftStart, 'h:mm a')} - {format(shiftEnd, 'h:mm a')}</span>
          <span className="text-[10px] font-normal opacity-70">({durationHours}h)</span>
        </div>
        <div className="text-[11px] font-medium truncate flex items-center gap-1.5 text-foreground/80 mt-1">
          <MapPin className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{clientName}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Drop on an employee row to reassign
        </div>
      </div>
    </div>
  );
}

const DroppableRow = memo(function DroppableRow({
  employeeId,
  children,
  isOver,
}: {
  employeeId: string;
  children: React.ReactNode;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `row-${employeeId}`,
    data: { type: 'employee-row', employeeId },
  });

  return (
    <div ref={setNodeRef} className="relative">
      {isOver && (
        <div className="absolute inset-0 z-40 pointer-events-none rounded-md border-2 border-dashed schedule-drop-zone-active transition-all duration-150" data-testid={`drop-indicator-${employeeId}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold text-primary bg-white/95 dark:bg-slate-800/95 px-3 py-1.5 rounded-md shadow-sm ring-1 ring-primary/20">
              Reassign here
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
});

function TimeHeader({ dayStart }: { dayStart: Date }) {
  const hours = Array.from({ length: 24 }, (_, i) => addHours(dayStart, i));
  const currentHour = new Date().getHours();
  const isToday = isSameDay(dayStart, new Date());
  
  return (
    <div className="flex border-b border-border/30 bg-slate-100/90 dark:bg-slate-800/80 sticky top-0 z-20 backdrop-blur-sm">
      {hours.map((hour, i) => {
        const hourNum = parseInt(format(hour, 'H'));
        const isWorkHour = hourNum >= 6 && hourNum < 22;
        const isCurrentHour = isToday && hourNum === currentHour;
        const isEvenHour = hourNum % 2 === 0;
        
        return (
          <div 
            key={i}
            className={cn(
              "time-header-cell flex-shrink-0 text-xs font-semibold px-2 py-3 border-r border-border/15 text-center transition-colors",
              isCurrentHour 
                ? "bg-blue-200/60 dark:bg-blue-800/40 text-blue-700 dark:text-blue-300 font-bold"
                : isWorkHour 
                  ? "text-foreground/80" 
                  : "text-muted-foreground/60 bg-slate-200/40 dark:bg-slate-700/30",
              !isCurrentHour && isWorkHour && isEvenHour && "bg-slate-50/50 dark:bg-slate-800/20"
            )}
            style={{ width: HOUR_WIDTH }}
          >
            {format(hour, 'h a')}
          </div>
        );
      })}
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
  pendingShiftIds,
}: ScheduleGridProps) {
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [overEmployeeId, setOverEmployeeId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const checkWidth = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  useEffect(() => {
    if (gridRef.current) {
      const currentHour = new Date().getHours();
      const scrollTarget = Math.max(0, (currentHour - 1) * HOUR_WIDTH);
      const scrollContainer = gridRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ left: scrollTarget, behavior: 'smooth' });
      }
    }
  }, [selectedDate]);

  const dndEnabled = isDesktop && canEdit && !!onShiftDrop;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

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

  const employeePositionMap = useMemo(() => {
    const map = new Map<string, PositionDefinition>();
    employees.forEach(emp => {
      const pos = resolveEmployeePosition(emp);
      if (pos) map.set(emp.id, pos);
    });
    return map;
  }, [employees]);

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

  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach(s => map.set(s.id, s));
    return map;
  }, [shifts]);

  const handleCellClick = useCallback((employee: Employee, hour: number) => {
    if (!canEdit) return;
    onCreateShift(employee, selectedDate, hour);
  }, [canEdit, onCreateShift, selectedDate]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'shift') {
      setActiveShiftId(data.shift.id);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current;
    if (overData?.type === 'employee-row') {
      setOverEmployeeId(overData.employeeId);
    } else {
      setOverEmployeeId(null);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveShiftId(null);
    setOverEmployeeId(null);

    if (!over || !onShiftDrop) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'shift' && overData?.type === 'employee-row') {
      const shift = activeData.shift as Shift;
      const newEmployeeId = overData.employeeId as string;

      if (shift.employeeId === newEmployeeId) return;

      const shiftStart = new Date(shift.startTime);
      onShiftDrop(shift, newEmployeeId, shiftStart);
    }
  }, [onShiftDrop]);

  const handleDragCancel = useCallback(() => {
    setActiveShiftId(null);
    setOverEmployeeId(null);
  }, []);

  const activeShift = activeShiftId ? shiftMap.get(activeShiftId) : null;

  if (employees.length === 0) {
    return <EmptyState />;
  }

  const gridContent = (
    <div className="schedule-grid-container flex rounded-md overflow-hidden shadow-sm border border-border/30" data-testid="schedule-grid">
      <div 
        className="flex-shrink-0 border-r border-border/40 bg-slate-50/80 dark:bg-slate-900/50 sticky left-0 z-30"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="h-[48px] border-b border-border/40 flex items-center px-4 bg-slate-100/80 dark:bg-slate-800/60 sticky top-0 z-30">
          <User className="h-4 w-4 mr-2.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground/90">Team</span>
          <Badge variant="secondary" className="ml-auto text-[10px] bg-white dark:bg-slate-700">
            {employees.length}
          </Badge>
        </div>
        <ScrollArea className="h-[calc(100vh-200px)]">
          {employees.map(employee => (
            <EmployeeSidebarCard
              key={employee.id}
              employee={employee}
              weeklyHours={weeklyHoursMap.get(employee.id) || 0}
              isOnShift={isOnShiftMap.get(employee.id) || false}
              expandedId={expandedEmployeeId}
              onToggleExpand={setExpandedEmployeeId}
              isDropTarget={overEmployeeId === employee.id}
            />
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-hidden bg-slate-50/50 dark:bg-slate-900/30">
        <ScrollArea className="h-[calc(100vh-200px)]" ref={gridRef}>
          <div style={{ width: 24 * HOUR_WIDTH }}>
            <TimeHeader dayStart={dayStart} />
            
            <div className="relative">
              {employees.map((employee, rowIndex) => {
                const empShifts = employeeShiftsMap.get(employee.id) || [];
                const isRowDropTarget = overEmployeeId === employee.id;
                
                const rowContent = (
                  <div 
                    key={employee.id}
                    className={cn(
                      "schedule-row relative border-b border-border/20 transition-colors duration-150",
                      rowIndex % 2 === 0 
                        ? "bg-white/60 dark:bg-slate-800/40" 
                        : "bg-slate-50/80 dark:bg-slate-850/50",
                      isRowDropTarget && "bg-primary/5 dark:bg-primary/10"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    data-testid={`schedule-row-${employee.id}`}
                  >
                    {Array.from({ length: 24 }).map((_, i) => {
                      const isNowHour = isSameDay(dayStart, new Date()) && new Date().getHours() === i;
                      const isEvenHour = i % 2 === 0;
                      const isOffHour = i < 6 || i >= 22;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "schedule-cell absolute top-0 bottom-0 cursor-pointer transition-all duration-150",
                            "border-r border-border/15",
                            "hover:bg-blue-100/60 dark:hover:bg-blue-900/40",
                            "hover:ring-1 hover:ring-inset hover:ring-blue-300/50 dark:hover:ring-blue-600/40",
                            "active:bg-blue-200/70 dark:active:bg-blue-800/50",
                            isNowHour && "bg-blue-50/50 dark:bg-blue-900/20",
                            !isNowHour && isEvenHour && !isOffHour && "bg-slate-50/30 dark:bg-slate-800/10",
                            isOffHour && "bg-slate-100/40 dark:bg-slate-800/30"
                          )}
                          style={{ 
                            left: i * HOUR_WIDTH, 
                            width: HOUR_WIDTH,
                            padding: CELL_PADDING 
                          }}
                          onClick={() => handleCellClick(employee, i)}
                          data-testid={`schedule-cell-${employee.id}-hour-${i}`}
                        >
                          {isNowHour && (
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-blue-400/40 dark:bg-blue-500/30 pointer-events-none" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Plus className="h-4 w-4 text-blue-400/60" />
                          </div>
                        </div>
                      );
                    })}
                    
                    {empShifts.map(shift => (
                      <DraggableShiftBlock
                        key={shift.id}
                        shift={shift}
                        client={shift.clientId ? clientMap.get(shift.clientId) : undefined}
                        dayStart={dayStart}
                        onShiftClick={onShiftClick}
                        employeePosition={employeePositionMap.get(employee.id)}
                        canDrag={dndEnabled}
                        isPending={pendingShiftIds?.has(shift.id)}
                      />
                    ))}
                    
                    {empShifts.length === 0 && canEdit && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-60 transition-opacity pointer-events-none">
                        <span className="text-xs text-muted-foreground bg-white/90 dark:bg-slate-800/90 px-3 py-1.5 rounded-md shadow-sm border border-border/30">
                          Click any hour to add a shift
                        </span>
                      </div>
                    )}
                  </div>
                );

                if (dndEnabled) {
                  return (
                    <DroppableRow
                      key={employee.id}
                      employeeId={employee.id}
                      isOver={isRowDropTarget}
                    >
                      {rowContent}
                    </DroppableRow>
                  );
                }

                return rowContent;
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );

  if (dndEnabled) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {gridContent}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
          {activeShift && (
            <ShiftDragOverlay
              shift={activeShift}
              client={activeShift.clientId ? clientMap.get(activeShift.clientId) : undefined}
              employeePosition={activeShift.employeeId ? employeePositionMap.get(activeShift.employeeId) : undefined}
            />
          )}
        </DragOverlay>
      </DndContext>
    );
  }

  return gridContent;
}

export default ScheduleGrid;
