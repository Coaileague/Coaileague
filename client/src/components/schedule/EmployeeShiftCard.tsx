/**
 * EmployeeShiftCard - Employee with their shifts displayed as gradient cards
 * Mobile-first with tap-to-view-details support
 * Includes break visualization and compliance indicators
 * Actions hidden in expandable section for mobile space efficiency
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Edit2, Trash2, Plus, ChevronRight, ChevronDown, Calendar, Coffee, AlertTriangle, Copy, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRoleDisplay } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
      <CardHeader className="bg-muted/50 border-b p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm sm:text-base truncate">
              {employee.firstName} {employee.lastName}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground capitalize truncate">
              {role}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge variant="secondary" className="font-semibold text-xs px-1.5 py-0.5">
              {weeklyHours.toFixed(1)}h
            </Badge>
            {canEdit && onAddShift && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onAddShift(employee)}
                data-testid={`button-add-shift-${employee.id}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 sm:p-3 space-y-2">
        {shifts.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-xs sm:text-sm mb-2">No shift scheduled</div>
            {canEdit && onAddShift && (
              <Button
                onClick={() => onAddShift(employee)}
                size="default"
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const timeDisplay = `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  
  const gradient = getRoleGradient(role);
  const isOpen = !shift.employeeId;
  const isPending = shift.status === 'draft';
  const isTodayShift = format(start, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  
  const hasScheduledBreaks = shift.scheduledBreaks && shift.scheduledBreaks.length > 0;
  const isCompliant = shift.breakCompliance?.isCompliant ?? true;
  const missingBreaks = shift.breakCompliance?.missingBreaks || [];
  
  const hasActions = canEdit || onSwap;

  const handleMainClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (hasActions) {
      setActionsOpen(!actionsOpen);
    } else if (onView) {
      onView();
    }
  };

  return (
    <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
      <div
        className={cn(
          "relative rounded-lg overflow-hidden text-white shadow-md cursor-pointer active:scale-[0.99] transition-transform touch-manipulation",
          isOpen
            ? "border-2 border-dashed border-amber-500 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 text-amber-900 dark:text-amber-100"
            : `bg-gradient-to-br ${gradient}`
        )}
        data-testid={`shift-block-${shift.id}`}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full p-2.5 sm:p-3 text-left" onClick={handleMainClick}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-base sm:text-lg font-bold truncate">{timeDisplay}</div>
                <div className="flex items-center gap-2 text-xs opacity-90 mt-0.5 flex-wrap">
                  {shift.title && (
                    <span className="flex items-center gap-0.5 truncate max-w-[100px]">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{shift.title}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {hours.toFixed(1)}h
                  </span>
                  {showBreakCompliance && hasScheduledBreaks && (
                    <span className="flex items-center gap-0.5">
                      <Coffee className="h-3 w-3" />
                      {shift.scheduledBreaks?.length}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex gap-1 flex-wrap justify-end">
                  {showBreakCompliance && !isCompliant && (
                    <Badge className="bg-red-500/80 text-white text-[10px] px-1.5 py-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      Break
                    </Badge>
                  )}
                  {isOpen && (
                    <Badge className="bg-white/25 text-[10px] px-1.5 py-0">OPEN</Badge>
                  )}
                  {isPending && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
                  )}
                  {isTodayShift && !isOpen && !isPending && (
                    <Badge className="bg-white/25 text-[10px] px-1.5 py-0">TODAY</Badge>
                  )}
                </div>
                {hasActions ? (
                  <ChevronDown className={cn("h-4 w-4 opacity-70 transition-transform", actionsOpen && "rotate-180")} />
                ) : onView && (
                  <ChevronRight className="h-4 w-4 opacity-70" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 border-t border-white/20">
            {showBreakCompliance && !isCompliant && missingBreaks.length > 0 && (
              <div className="text-xs bg-red-500/20 rounded p-2 mt-2 mb-2">
                <span className="font-medium">Missing breaks: </span>
                {missingBreaks.map((b, i) => (
                  <span key={i}>{b.durationMinutes}min {b.type}{i < missingBreaks.length - 1 ? ', ' : ''}</span>
                ))}
              </div>
            )}
            
            <div className="flex flex-wrap gap-2 mt-2">
              {onView && (
                <Button
                  size="default"
                  variant="secondary"
                  className="flex-1 min-w-[70px] bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={onView}
                  data-testid={`button-view-shift-${shift.id}`}
                >
                  Details
                </Button>
              )}
              {onSwap && !isOpen && (
                <Button
                  size="default"
                  variant="secondary"
                  className="flex-1 min-w-[70px] bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={onSwap}
                  data-testid={`button-swap-shift-${shift.id}`}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                  Swap
                </Button>
              )}
              {canEdit && onDuplicate && (
                <Button
                  size="default"
                  variant="secondary"
                  className="flex-1 min-w-[70px] bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={onDuplicate}
                  data-testid={`button-duplicate-shift-${shift.id}`}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              )}
              {canEdit && onEdit && (
                <Button
                  size="default"
                  variant="secondary"
                  className="flex-1 min-w-[70px] bg-white/20 hover:bg-white/30 text-current border-0"
                  onClick={onEdit}
                  data-testid={`button-edit-shift-${shift.id}`}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {canEdit && onDelete && (
                <Button
                  size="default"
                  variant="secondary"
                  className="min-w-[70px] bg-red-500/20 hover:bg-red-500/30 text-current border-0"
                  onClick={onDelete}
                  data-testid={`button-delete-shift-${shift.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
