import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Calendar, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Approval {
  id: string;
  type: string;
  title: string;
  description?: string;
  requestedBy?: string;
  requestedByName?: string;
  entityId?: string;
  decision: string;
  createdAt?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

const pageConfig: CanvasPageConfig = {
  id: 'shift-approvals',
  title: 'Shift Approvals',
  subtitle: 'Review and approve pending shift requests',
  category: 'operations',
};

function ApprovalCard({ approval, onDecision }: { approval: Approval; onDecision: (id: string, decision: 'approved' | 'rejected', note?: string) => void }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    setIsPending(true);
    try {
      await onDecision(approval.id, decision, note || undefined);
    } finally {
      setIsPending(false);
      setShowNote(false);
      setNote('');
    }
  };

  const createdAt = approval.createdAt ? new Date(approval.createdAt) : null;

  return (
    <Card data-testid={`card-shift-approval-${approval.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold">{approval.title}</CardTitle>
          {approval.description && (
            <p className="text-sm text-muted-foreground">{approval.description}</p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0" data-testid={`badge-approval-status-${approval.id}`}>
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {approval.requestedByName && (
            <span className="flex items-center gap-1.5" data-testid={`text-requested-by-${approval.id}`}>
              <User className="h-3.5 w-3.5" />
              {approval.requestedByName}
            </span>
          )}
          {createdAt && (
            <span className="flex items-center gap-1.5" data-testid={`text-created-at-${approval.id}`}>
              <Calendar className="h-3.5 w-3.5" />
              {format(createdAt, 'MMM d, yyyy h:mm a')}
            </span>
          )}
        </div>

        {showNote && (
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-sm"
            data-testid={`textarea-approval-note-${approval.id}`}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowNote(!showNote)}
            data-testid={`button-toggle-note-${approval.id}`}
          >
            {showNote ? 'Hide Note' : 'Add Note'}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDecision('rejected')}
              disabled={isPending}
              className="text-destructive border-destructive/30"
              data-testid={`button-reject-approval-${approval.id}`}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => handleDecision('approved')}
              disabled={isPending}
              data-testid={`button-approve-approval-${approval.id}`}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Approve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ShiftApprovalsPage() {
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<{ success: boolean; approvals: Approval[] }>({
    queryKey: ['/api/approvals/pending'],
    staleTime: 30 * 1000,
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      apiRequest('POST', `/api/approvals/${id}/decision`, { decision, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/all-pending-counts'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to process approval decision. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleDecision = async (id: string, decision: 'approved' | 'rejected', note?: string) => {
    await decideMutation.mutateAsync({ id, decision, note });
    toast({
      title: decision === 'approved' ? 'Approved' : 'Rejected',
      description: `Shift request has been ${decision}.`,
    });
  };

  const approvals = data?.approvals ?? [];
  const shiftApprovals = approvals.filter(a => !a.type || a.type === 'shift' || a.type === 'shift_request' || a.type === 'open_shift');

  return (
    <CanvasHubPage config={pageConfig}>
      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="loading-shift-approvals">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2" data-testid="error-shift-approvals">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load shift approvals. Please refresh.</p>
        </div>
      )}

      {!isLoading && !isError && shiftApprovals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3" data-testid="empty-shift-approvals">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No pending shift approvals</p>
            <p className="text-sm text-muted-foreground mt-1">All shift requests have been reviewed.</p>
          </div>
        </div>
      )}

      {!isLoading && !isError && shiftApprovals.length > 0 && (
        <div className="flex flex-col gap-4" data-testid="list-shift-approvals">
          <p className="text-sm text-muted-foreground">
            {shiftApprovals.length} pending {shiftApprovals.length === 1 ? 'request' : 'requests'} awaiting review
          </p>
          {shiftApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}
    </CanvasHubPage>
  );
}
