/**
 * ShiftDetailSheet - Compact shift details popup
 * Polished professional design matching Sling-style UI
 */

import { format } from 'date-fns';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Clock,
  MapPin,
  User,
  Building2,
  Edit2,
  Trash2,
  UserPlus,
  Timer,
  DollarSign,
  FileText,
  X,
} from 'lucide-react';
import { LogoMark } from '@/components/ui/logo-mark';
import type { Shift, Employee, Client } from '@shared/schema';

interface ShiftDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  employee?: Employee | null;
  client?: Client | null;
  canEdit: boolean;
  onEdit?: (shift: Shift) => void;
  onDelete?: (shift: Shift) => void;
  onClaimShift?: (shift: Shift) => void;
}

export function ShiftDetailSheet({
  open,
  onOpenChange,
  shift,
  employee,
  client,
  canEdit,
  onEdit,
  onDelete,
  onClaimShift,
}: ShiftDetailSheetProps) {
  if (!shift) return null;

  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const isOpenShift = !shift.employeeId;
  const isPast = end < new Date();
  const isToday = format(start, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const getStatusConfig = () => {
    if (shift.status === 'completed') {
      return { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
    }
    if (shift.status === 'in_progress') {
      return { label: 'In Progress', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    }
    if (shift.status === 'draft') {
      return { label: 'Pending', className: 'bg-slate-500/15 text-slate-600 border-slate-500/30' };
    }
    if (isToday) {
      return { label: 'Today', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
    }
    if (isPast) {
      return { label: 'Past', className: 'bg-slate-500/15 text-slate-500 border-slate-500/30' };
    }
    return { label: 'Scheduled', className: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' };
  };

  const statusConfig = getStatusConfig();

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh] focus:outline-none">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogoMark size="xs" />
                <div>
                  <DrawerTitle className="text-base font-semibold">
                    {shift.title || 'Shift Details'}
                  </DrawerTitle>
                  <p className="text-xs text-muted-foreground">
                    {format(start, 'EEE, MMM d')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
                  {statusConfig.label}
                </Badge>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-3 space-y-3">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-lg font-bold">
                    {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{hours.toFixed(1)}h</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-xs">Assigned To</span>
                </div>
                {isOpenShift ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs">
                    Open Shift
                  </Badge>
                ) : employee ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                        {getInitials(`${employee.firstName} ${employee.lastName}`)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {employee.firstName} {employee.lastName}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
              </div>

              {client && (
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="text-xs">Client</span>
                  </div>
                  <span className="text-sm font-medium truncate block">
                    {client.companyName || `${client.firstName} ${client.lastName}`}
                  </span>
                </div>
              )}
            </div>

            {(shift.location || client?.address) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{shift.location || client?.address}</span>
              </div>
            )}

            {shift.hourlyRateOverride && (
              <div className="flex items-center justify-between bg-emerald-500/10 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium">${shift.hourlyRateOverride}/hr</span>
                </div>
                <span className="text-sm text-emerald-600 font-medium">
                  ~${(parseFloat(shift.hourlyRateOverride) * hours).toFixed(2)}
                </span>
              </div>
            )}

            {shift.description && (
              <div className="bg-muted/30 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Notes</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{shift.description}</p>
              </div>
            )}
          </div>

          <DrawerFooter className="flex-row gap-2 pt-2 pb-4 px-4 border-t">
            {isOpenShift && onClaimShift && (
              <Button
                className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  onClaimShift(shift);
                  onOpenChange(false);
                }}
                data-testid="button-claim-shift"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Claim
              </Button>
            )}

            {canEdit && onEdit && (
              <Button
                variant="outline"
                className="flex-1 h-9"
                onClick={() => {
                  onEdit(shift);
                  onOpenChange(false);
                }}
                data-testid="button-edit-shift"
              >
                <Edit2 className="w-4 h-4 mr-1.5" />
                Edit
              </Button>
            )}

            {canEdit && onDelete && (
              <Button
                variant="destructive"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  onDelete(shift);
                  onOpenChange(false);
                }}
                data-testid="button-delete-shift"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}

            {!canEdit && !isOpenShift && (
              <DrawerClose asChild>
                <Button variant="outline" className="flex-1 h-9">
                  Close
                </Button>
              </DrawerClose>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
