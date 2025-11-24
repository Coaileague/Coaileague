import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

export interface ShiftApprovalAction {
  id: string;
  actionType: 'accept' | 'deny' | 'switch_request' | 'cover_request';
  status: 'pending' | 'approved' | 'denied';
  requestedByName: string;
  targetEmployeeName?: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  reason?: string;
}

interface ShiftApprovalModalProps {
  action: ShiftApprovalAction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (actionId: string) => void;
  onDeny: (actionId: string, reason: string) => void;
  isPending?: boolean;
}

export function ShiftApprovalModal({
  action,
  open,
  onOpenChange,
  onApprove,
  onDeny,
  isPending = false,
}: ShiftApprovalModalProps) {
  const [denialReason, setDenialReason] = useState("");
  const [showingDenialForm, setShowingDenialForm] = useState(false);

  if (!action) return null;

  const handleDeny = () => {
    if (!denialReason.trim()) return;
    onDeny(action.id, denialReason);
    setDenialReason("");
    setShowingDenialForm(false);
  };

  const getActionIcon = () => {
    switch (action.actionType) {
      case 'accept':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'deny':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'switch_request':
        return <AlertCircle className="h-5 w-5 text-blue-600" />;
      case 'cover_request':
        return <AlertCircle className="h-5 w-5 text-blue-600" />;
      default:
        return null;
    }
  };

  const getActionTitle = () => {
    switch (action.actionType) {
      case 'accept':
        return `Accept Shift - ${action.requestedByName}`;
      case 'deny':
        return `Decline Shift - ${action.requestedByName}`;
      case 'switch_request':
        return `Shift Switch Request`;
      case 'cover_request':
        return `Coverage Request`;
      default:
        return 'Shift Action';
    }
  };

  const getActionDescription = () => {
    switch (action.actionType) {
      case 'accept':
        return `${action.requestedByName} wants to accept this shift`;
      case 'deny':
        return `${action.requestedByName} wants to decline this shift`;
      case 'switch_request':
        return `${action.requestedByName} requests to switch with ${action.targetEmployeeName}`;
      case 'cover_request':
        return `${action.requestedByName} is requesting coverage for this shift`;
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getActionIcon()}
            <div>
              <DialogTitle>{getActionTitle()}</DialogTitle>
              <DialogDescription>{getActionDescription()}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Shift Details */}
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Date</Label>
              <p className="text-sm font-medium">
                {format(new Date(action.shiftDate), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Time</Label>
              <p className="text-sm font-medium">
                {format(new Date(`2000-01-01T${action.shiftStart}`), 'h:mm a')} -{' '}
                {format(new Date(`2000-01-01T${action.shiftEnd}`), 'h:mm a')}
              </p>
            </div>
            {action.reason && (
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Reason</Label>
                <p className="text-sm">{action.reason}</p>
              </div>
            )}
          </div>

          {/* Denial Form (shown conditionally) */}
          {showingDenialForm ? (
            <div className="space-y-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
              <Label htmlFor="denial-reason" className="font-semibold text-sm">
                Why are you denying this request?
              </Label>
              <Textarea
                id="denial-reason"
                placeholder="Provide a reason for denying this shift action..."
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                className="min-h-[100px]"
                disabled={isPending}
                data-testid="textarea-denial-reason"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowingDenialForm(false);
              setDenialReason("");
              onOpenChange(false);
            }}
            disabled={isPending}
            data-testid="button-cancel-approval"
          >
            Cancel
          </Button>

          {!showingDenialForm ? (
            <>
              <Button
                variant="destructive"
                onClick={() => setShowingDenialForm(true)}
                disabled={isPending}
                data-testid="button-deny-action"
              >
                Deny
              </Button>
              <Button
                onClick={() => onApprove(action.id)}
                disabled={isPending}
                data-testid="button-approve-action"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  'Approve'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowingDenialForm(false);
                  setDenialReason("");
                }}
                disabled={isPending}
                data-testid="button-cancel-denial"
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeny}
                disabled={!denialReason.trim() || isPending}
                data-testid="button-confirm-denial"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Denying...
                  </>
                ) : (
                  'Confirm Denial'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
