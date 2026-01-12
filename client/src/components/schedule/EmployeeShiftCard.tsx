/**
 * EmployeeShiftCard - Employee with their shifts displayed as gradient cards
 * Mobile-first with tap-to-view-details support
 * Includes break visualization and compliance indicators
 */

import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Edit2, Trash2, Plus, ChevronRight, Calendar, Coffee, AlertTriangle, Copy, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRoleDisplay } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Employee, Shift, ScheduledBreak } from '@shared/schema';

interface ShiftWithBreaks extends Shift {
  scheduledBreaks?: ScheduledBreak[];
  breakCompliance?: {
    isCompliant: boolean;
    missingBreaks?: Array<{
      type: 'meal' | 'rest';
      durationMinutes: number;
      reason: string;
    }>;
  };
}

interface EmployeeShiftCardProps {
  employee: Employee;
  shifts: ShiftWithBreaks[];
  weeklyHours: number;
  onEditShift?: (shift: Shift) => void;
  onDeleteShift?: (shift: Shift) => void;
  onAddShift?: (employee: Employee) => void;
  onViewShift?: (shift: Shift) => void;
  onDuplicateShift?: (shift: Shift) => void;
  onSwapShift?: (shift: Shift) => void;
  canEdit: boolean;
  showBreakCompliance?: boolean;
}

const roleGradients: Record<string, string> = {
  paramedic: 'from-red-500 to-red-600',
  emt: 'from-emerald-500 to-emerald-600',
  dispatcher: 'from-amber-500 to-amber-600',
  supervisor: 'from-purple-500 to-purple-600',
  driver: 'from-blue-500 to-blue-600',
  manager: 'from-indigo-500 to-indigo-600',
  admin: 'from-slate-600 to-slate-700',
  default: 'from-blue-500 to-blue-600',
};

function getRoleGradient(role: string | null): string {
  if (!role) return roleGradients.default;
  const normalized = role.toLowerCase();
  return roleGradients[normalized] || roleGradients.default;
}

export function EmployeeShiftCard({
  employee,
  shifts,
  weeklyHours,
  onEditShift,
  onDeleteShift,
  onAddShift,
  onViewShift,
  onDuplicateShift,
  onSwapShift,
  canEdit,
  showBreakCompliance = true,
}: EmployeeShiftCardProps) {
  const role = formatRoleDisplay(employee.role);

  return (
    <Card className="overflow-hidden touch-manipulation" data-testid={`employee-card-${employee.id}`}>
      <CardHeader className="bg-muted/50 border-b p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base truncate">
              {employee.firstName} {employee.lastName}
            </div>
            <div className="text-sm text-muted-foreground capitalize truncate">
              {role}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="font-semibold text-xs">
              {weeklyHours.toFixed(1)} hrs
            </Badge>
            {canEdit && onAddShift && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onAddShift(employee)}
                data-testid={`button-add-shift-${employee.id}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 space-y-2">
        {shifts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div className="text-sm mb-3">No shift scheduled</div>
            {canEdit && onAddShift && (
              <Button
                onClick={() => onAddShift(employee)}
                size="sm"
                className="bg-primary"
                data-testid={`button-add-empty-shift-${employee.id}`}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Shift
              </Button>
            )}
          </div>
        ) : (
          shifts.map((shift) => (
            <ShiftBlock
              key={shift.id}
              shift={shift}
              role={role}
              onView={onViewShift ? () => onViewShift(shift) : undefined}
              onEdit={canEdit && onEditShift ? () => onEditShift(shift) : undefined}
              onDelete={canEdit && onDeleteShift ? () => onDeleteShift(shift) : undefined}
              onDuplicate={canEdit && onDuplicateShift ? () => onDuplicateShift(shift) : undefined}
              onSwap={onSwapShift ? () => onSwapShift(shift) : undefined}
              canEdit={canEdit}
              showBreakCompliance={showBreakCompliance}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface ShiftBlockProps {
  shift: ShiftWithBreaks;
  role: string;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onSwap?: () => void;
  canEdit: boolean;
  showBreakCompliance?: boolean;
}

function ShiftBlock({ shift, role, onView, onEdit, onDelete, onDuplicate, onSwap, canEdit, showBreakCompliance = true }: ShiftBlockProps) {
  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const timeDisplay = `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  
  const gradient = getRoleGradient(role);
  const isOpen = !shift.employeeId;
  const isPending = shift.status === 'draft';
  const isToday = format(start, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  
  const hasScheduledBreaks = shift.scheduledBreaks && shift.scheduledBreaks.length > 0;
  const isCompliant = shift.breakCompliance?.isCompliant ?? true;
  const missingBreaks = shift.breakCompliance?.missingBreaks || [];

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onView?.();
  };

  return (
    <div
      className={cn(
        "relative rounded-xl p-3 sm:p-4 text-white shadow-lg cursor-pointer active:scale-[0.98] transition-transform touch-manipulation",
        isOpen
          ? "border-2 border-dashed border-amber-500 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 text-amber-900 dark:text-amber-100"
          : `bg-gradient-to-br ${gradient}`
      )}
      onClick={handleClick}
      data-testid={`shift-block-${shift.id}`}
    >
      {/* Time Display - Prominent */}
      <div className="text-lg sm:text-xl font-bold mb-1.5">{timeDisplay}</div>
      
      {/* Details Row */}
      <div className="flex items-center gap-3 text-xs sm:text-sm opacity-95 flex-wrap">
        {shift.title && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate max-w-[120px]">{shift.title}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{hours.toFixed(1)} hrs</span>
        </div>
        
        {/* Break Indicator */}
        {showBreakCompliance && hasScheduledBreaks && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1" data-testid={`break-indicator-${shift.id}`}>
                <Coffee className="h-3.5 w-3.5" />
                <span>{shift.scheduledBreaks?.length} break{shift.scheduledBreaks?.length !== 1 ? 's' : ''}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px]">
              <div className="text-xs space-y-1">
                {shift.scheduledBreaks?.map((brk, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="capitalize">{brk.breakType}:</span>
                    <span>{brk.durationMinutes} min</span>
                    {brk.isPaid && <Badge variant="secondary" className="text-[10px] px-1 py-0">Paid</Badge>}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      
      {/* Status Badges - Top Right */}
      <div className="absolute top-2 right-2 flex gap-1.5">
        {/* Compliance Warning Badge */}
        {showBreakCompliance && !isCompliant && missingBreaks.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                className="bg-red-500/80 backdrop-blur-md border-red-400/50 text-white text-xs px-2 py-0.5 cursor-help"
                data-testid={`compliance-warning-${shift.id}`}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Break
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              <div className="text-xs space-y-1">
                <div className="font-semibold text-red-500">Missing Required Breaks:</div>
                {missingBreaks.map((brk, idx) => (
                  <div key={idx} className="text-muted-foreground">
                    {brk.durationMinutes} min {brk.type} break - {brk.reason}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        
        {isOpen && (
          <Badge className="bg-white/25 backdrop-blur-md border-white/30 text-xs px-2 py-0.5">
            OPEN
          </Badge>
        )}
        {isPending && (
          <Badge variant="secondary" className="text-xs px-2 py-0.5">
            Pending
          </Badge>
        )}
        {isToday && !isOpen && !isPending && (
          <Badge className="bg-white/25 backdrop-blur-md border-white/30 text-xs px-2 py-0.5">
            TODAY
          </Badge>
        )}
      </div>
      
      {/* Tap Indicator (on mobile when not editing) */}
      {onView && !canEdit && (
        <div className="absolute bottom-3 right-3 opacity-60">
          <ChevronRight className="h-5 w-5" />
        </div>
      )}
      
      {/* Action Buttons */}
      {(canEdit || onSwap) && (
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          {onSwap && !isOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={(e) => { e.stopPropagation(); onSwap(); }}
                  data-testid={`button-swap-shift-${shift.id}`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Request Swap</TooltipContent>
            </Tooltip>
          )}
          {canEdit && onDuplicate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                  data-testid={`button-duplicate-shift-${shift.id}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Duplicate</TooltipContent>
            </Tooltip>
          )}
          {canEdit && onEdit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-white/20 hover:bg-white/30 text-current border-0"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              data-testid={`button-edit-shift-${shift.id}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && onDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-white/20 hover:bg-white/30 text-current border-0"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              data-testid={`button-delete-shift-${shift.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
