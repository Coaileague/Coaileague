import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Shift } from "@shared/schema";

interface ShiftApprovalDialogProps {
  shift: Shift;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'approve' | 'reject';
}

export function ShiftApprovalDialog({
  shift,
  open,
  onOpenChange,
  action,
}: ShiftApprovalDialogProps) {
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const endpoint = action === 'approve'
        ? `/api/shifts/${shift.id}/approve`
        : `/api/shifts/${shift.id}/reject`;

      return apiRequest(endpoint, {
        method: 'POST',
        body: { notes, reason: notes },
      });
    },
    onSuccess: () => {
      toast({
        title: action === 'approve' ? 'Shift Approved' : 'Shift Rejected',
        description: `Shift has been ${action === 'approve' ? 'approved' : 'rejected'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      onOpenChange(false);
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${action} shift`,
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === 'approve' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            {action === 'approve' ? 'Approve Shift' : 'Reject Shift'}
          </DialogTitle>
          <DialogDescription>
            {shift.employeeId && (
              <div className="text-sm mt-2">
                <p className="font-medium">Shift Details</p>
                <p className="text-xs mt-1">Date: {shift.date}</p>
                <p className="text-xs">Time: {shift.startTime} - {shift.endTime}</p>
                <p className="text-xs">Status: <Badge variant="outline">{shift.status}</Badge></p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">
              {action === 'approve' ? 'Approval Notes' : 'Rejection Reason'}
            </label>
            <Textarea
              placeholder={action === 'approve' ? 'Optional notes...' : 'Reason for rejection...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 min-h-24"
              data-testid="textarea-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            data-testid={`button-${action}-shift`}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {action === 'approve' ? 'Approving...' : 'Rejecting...'}
              </>
            ) : (
              action === 'approve' ? 'Approve' : 'Reject'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
