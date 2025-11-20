/**
 * EmployeeShiftCard - Employee with their shifts displayed as gradient cards
 */

import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Employee, Shift } from '@shared/schema';

interface EmployeeShiftCardProps {
  employee: Employee;
  shifts: Shift[];
  weeklyHours: number;
  onEditShift?: (shift: Shift) => void;
  onDeleteShift?: (shift: Shift) => void;
  onAddShift?: (employee: Employee) => void;
  canEdit: boolean;
}

// Role-based gradient styles matching the HTML design
const roleGradients: Record<string, string> = {
  paramedic: 'from-red-500 to-red-600',
  emt: 'from-emerald-500 to-emerald-600',
  dispatcher: 'from-amber-500 to-amber-600',
  supervisor: 'from-purple-500 to-purple-600',
  driver: 'from-blue-500 to-blue-600',
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
  canEdit,
}: EmployeeShiftCardProps) {
  const role = employee.role || 'Employee';

  return (
    <Card className="overflow-hidden" data-testid={`employee-card-${employee.id}`}>
      <CardHeader className="bg-muted/50 border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-semibold text-base">
              {employee.firstName} {employee.lastName}
            </div>
            <div className="text-sm text-muted-foreground capitalize">
              {role}
            </div>
          </div>
          <Badge variant="secondary" className="font-semibold">
            {weeklyHours.toFixed(1)} hrs
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {shifts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-3 opacity-30">📅</div>
            <div className="text-sm mb-4">No shift scheduled</div>
            {canEdit && onAddShift && (
              <Button
                onClick={() => onAddShift(employee)}
                size="sm"
                className="bg-primary"
                data-testid={`button-add-shift-${employee.id}`}
              >
                + Add Shift
              </Button>
            )}
          </div>
        ) : (
          shifts.map((shift) => (
            <ShiftBlock
              key={shift.id}
              shift={shift}
              role={role}
              onEdit={canEdit && onEditShift ? () => onEditShift(shift) : undefined}
              onDelete={canEdit && onDeleteShift ? () => onDeleteShift(shift) : undefined}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface ShiftBlockProps {
  shift: Shift;
  role: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

function ShiftBlock({ shift, role, onEdit, onDelete }: ShiftBlockProps) {
  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const timeDisplay = `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  
  const gradient = getRoleGradient(role);
  const isOpen = !shift.employeeId; // Open shift has no employee assigned

  return (
    <div
      className={cn(
        "relative rounded-xl p-4 text-white shadow-lg",
        isOpen
          ? "border-2 border-dashed border-amber-500 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 text-amber-900 dark:text-amber-100"
          : `bg-gradient-to-br ${gradient}`
      )}
      data-testid={`shift-block-${shift.id}`}
    >
      <div className="text-lg font-bold mb-2">{timeDisplay}</div>
      <div className="flex items-center gap-4 text-sm opacity-95">
        {shift.title && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            <span>{shift.title}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>{hours.toFixed(1)} hrs</span>
        </div>
      </div>
      
      {isOpen && (
        <Badge className="absolute top-3 right-3 bg-white/25 backdrop-blur-md border-white/30">
          OPEN
        </Badge>
      )}
      
      {(onEdit || onDelete) && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          {onEdit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 bg-white/20 hover:bg-white/30 text-white border-white/30"
              onClick={onEdit}
              data-testid={`button-edit-shift-${shift.id}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 bg-white/20 hover:bg-white/30 text-white border-white/30"
              onClick={onDelete}
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
