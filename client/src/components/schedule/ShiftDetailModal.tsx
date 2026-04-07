/**
 * ShiftDetailModal - Mobile-optimized shift details slide-up sheet
 * Features: Employee info, shift details, action buttons, swipe to dismiss
 */

import { format, differenceInHours, differenceInMinutes } from 'date-fns';
import { cn, formatRoleDisplay } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { 
  Clock, MapPin, DollarSign, Shield, Calendar, X,
  Edit, Trash2, ArrowRightLeft, Copy, Sparkles,
  Circle, CheckCircle2, AlertCircle, FileEdit
} from 'lucide-react';
import type { Shift, Employee, Client } from '@shared/schema';

interface ShiftDetailModalProps {
  shift: Shift | null;
  employee?: Employee;
  client?: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (shift: Shift) => void;
  onCancel: (shift: Shift) => void;
  onSwap: (shift: Shift) => void;
  onDuplicate: (shift: Shift) => void;
  canEdit: boolean;
}

type ShiftStatus = 'scheduled' | 'pending' | 'conflict' | 'published' | 'completed' | 'draft';

const STATUS_CONFIG: Record<ShiftStatus, { label: string; color: string; dotColor: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30', dotColor: 'text-green-500' },
  pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30', dotColor: 'text-yellow-500' },
  conflict: { label: 'Conflict', color: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30', dotColor: 'text-red-500' },
  published: { label: 'Published', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30', dotColor: 'text-blue-500' },
  completed: { label: 'Completed', color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30', dotColor: 'text-gray-400' },
  draft: { label: 'Draft', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30', dotColor: 'text-purple-500' },
};

function getShiftStatus(shift: Shift): ShiftStatus {
  if (shift.status === 'completed') return 'completed';
  if (shift.status === 'draft') return 'draft';
  if (shift.status === 'pending' || shift.status === 'pending_approval') return 'pending';
  if (shift.status === 'published') return 'published';
  if (shift.status === 'confirmed') return 'scheduled';
  return 'scheduled';
}

function formatDuration(startTime: Date, endTime: Date): string {
  const totalMinutes = differenceInMinutes(endTime, startTime);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (minutes === 0) {
    return `${hours} hrs`;
  }
  return `${hours}.${Math.round((minutes / 60) * 10)} hrs`;
}

export function ShiftDetailModal({
  shift,
  employee,
  client,
  open,
  onOpenChange,
  onEdit,
  onCancel,
  onSwap,
  onDuplicate,
  canEdit,
}: ShiftDetailModalProps) {
  if (!shift) return null;

  const status = getShiftStatus(shift);
  const statusConfig = STATUS_CONFIG[status];
  
  const startTime = new Date(shift.startTime);
  const endTime = new Date(shift.endTime);
  const duration = formatDuration(startTime, endTime);
  
  const payRate = employee ? ((employee as any).hourlyRate || (employee as any).payRate || 0) : 0;
  const totalPay = payRate * differenceInHours(endTime, startTime);
  
  const isAiGenerated = (shift as any).aiGenerated || (shift as any).trinityOptimized;
  const initials = employee 
    ? `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase()
    : '??';
  
  const clientName = client?.companyName || (shift as any).clientName || 'Unassigned Client';
  const siteName = (shift as any).siteName || (shift as any).location || '';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent 
        className="max-h-[75vh]"
        data-testid="shift-detail-modal"
      >
        <DrawerHeader className="flex items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <DrawerTitle className="flex items-center gap-2 flex-wrap">
                Shift Details
                {isAiGenerated && (
                  <Badge variant="secondary" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1 text-amber-500" />
                    Trinity
                  </Badge>
                )}
              </DrawerTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(startTime, 'EEEE, MMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline"
              className={cn("text-xs font-medium flex items-center gap-1 shrink-0", statusConfig.color)}
            >
              <Circle className={cn("h-2 w-2 fill-current", statusConfig.dotColor)} />
              {statusConfig.label}
            </Badge>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close details">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div data-vaul-no-drag className="px-4 pb-4 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {employee && (
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
              <Avatar className="h-11 w-11 border border-border shrink-0">
                <AvatarImage src={(employee as any).photoUrl || (employee as any).avatarUrl} alt={employee.firstName || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold text-sm">
                  {employee.firstName} {employee.lastName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(employee as any).jobTitle || (employee as any).position || 'Employee'}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/50 divide-y divide-border/30">
            <div className="flex items-center gap-3 text-sm p-3">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <span className="font-medium">
                  {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                </span>
                <span className="text-muted-foreground ml-2">({duration})</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 text-sm p-3">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <span className="font-medium">{clientName}</span>
                {siteName && <span className="text-muted-foreground ml-1">- {siteName}</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-3 text-sm p-3">
              <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>{formatRoleDisplay((shift as any).positionType || (shift as any).role || 'Security Officer')}</span>
            </div>

            {payRate > 0 && (
              <div className="flex items-center gap-3 text-sm p-3">
                <DollarSign className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span className="font-medium">${payRate}/hr</span>
                <span className="text-muted-foreground">= ${totalPay.toFixed(2)} total</span>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button 
                variant="outline"
                onClick={() => {
                  onEdit(shift);
                  onOpenChange(false);
                }}
                data-testid="button-edit-shift"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  onSwap(shift);
                  onOpenChange(false);
                }}
                data-testid="button-swap-shift"
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Swap
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  onDuplicate(shift);
                  onOpenChange(false);
                }}
                data-testid="button-duplicate-shift"
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </Button>
              
              <Button 
                variant="destructive"
                onClick={() => {
                  onCancel(shift);
                  onOpenChange(false);
                }}
                data-testid="button-cancel-shift"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default ShiftDetailModal;
