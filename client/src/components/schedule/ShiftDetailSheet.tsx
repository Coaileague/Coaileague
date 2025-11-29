/**
 * ShiftDetailSheet - Tappable shift popup showing full details with actions
 * Mobile-first bottom sheet for viewing shift details
 */

import { format } from 'date-fns';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  MapPin,
  User,
  Building2,
  Calendar,
  Edit2,
  Trash2,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Timer,
  DollarSign,
} from 'lucide-react';
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

  const getStatusBadge = () => {
    if (shift.status === 'completed') {
      return <Badge className="bg-green-600">Completed</Badge>;
    }
    if (shift.status === 'scheduled') {
      return <Badge className="bg-blue-600">Scheduled</Badge>;
    }
    if (shift.status === 'draft') {
      return <Badge variant="secondary">Pending Approval</Badge>;
    }
    if (shift.status === 'in_progress') {
      return <Badge className="bg-amber-600">In Progress</Badge>;
    }
    if (isPast) {
      return <Badge variant="outline">Past</Badge>;
    }
    if (isToday) {
      return <Badge className="bg-amber-600">Today</Badge>;
    }
    return <Badge variant="outline">Scheduled</Badge>;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl font-bold">
              {shift.title || 'Shift Details'}
            </DrawerTitle>
            {getStatusBadge()}
          </div>
          <DrawerDescription className="text-left">
            {format(start, 'EEEE, MMMM d, yyyy')}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          {/* Time Info - Prominent */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold">
                {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground ml-8">
              <Timer className="w-4 h-4" />
              <span className="text-sm">{hours.toFixed(1)} hours</span>
            </div>
          </div>

          <Separator />

          {/* Employee Info */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Assigned To</div>
              {isOpenShift ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    Open Shift
                  </Badge>
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                </div>
              ) : employee ? (
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {getInitials(`${employee.firstName} ${employee.lastName}`)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">
                    {employee.firstName} {employee.lastName}
                  </span>
                  {employee.role && (
                    <Badge variant="secondary" className="text-xs">
                      {employee.role}
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          </div>

          {/* Client/Location */}
          {client && (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Client / Location</div>
                <div className="font-medium">{client.companyName || `${client.firstName} ${client.lastName}`}</div>
                {client.address && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {client.address}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pay Info (if visible) */}
          {shift.hourlyRateOverride && (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Pay Rate</div>
                <div className="font-medium">${shift.hourlyRateOverride}/hr</div>
                <div className="text-sm text-green-600">
                  Est. ${(parseFloat(shift.hourlyRateOverride) * hours).toFixed(2)} total
                </div>
              </div>
            </div>
          )}

          {/* Description/Notes */}
          {shift.description && (
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Notes</div>
                <div className="text-sm whitespace-pre-wrap">{shift.description}</div>
              </div>
            </div>
          )}

          {/* Status History (if scheduled) */}
          {shift.status === 'scheduled' && (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="text-sm text-green-600 font-medium">
                  Scheduled and approved
                </div>
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="flex-row gap-2 pt-2 border-t">
          {/* Open shift - show claim button */}
          {isOpenShift && onClaimShift && (
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => {
                onClaimShift(shift);
                onOpenChange(false);
              }}
              data-testid="button-claim-shift"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Claim Shift
            </Button>
          )}

          {/* Edit button - managers only */}
          {canEdit && onEdit && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onEdit(shift);
                onOpenChange(false);
              }}
              data-testid="button-edit-shift"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}

          {/* Delete button - managers only */}
          {canEdit && onDelete && (
            <Button
              variant="destructive"
              size="icon"
              onClick={() => {
                onDelete(shift);
                onOpenChange(false);
              }}
              data-testid="button-delete-shift"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}

          <DrawerClose asChild>
            <Button variant="ghost" className={canEdit ? '' : 'flex-1'}>
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
