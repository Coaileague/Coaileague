import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, Clock, Calendar, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface TimesheetEditRequest {
  id: string;
  timeEntryId: string;
  requestedBy: string;
  requestedByName: string;
  reason: string;
  proposedClockIn: string | null;
  proposedClockOut: string | null;
  proposedNotes: string | null;
  originalClockIn: string | null;
  originalClockOut: string | null;
  originalNotes: string | null;
  status: string;
  createdAt: string;
}

export default function TimesheetApprovals() {
  const [selectedRequest, setSelectedRequest] = useState<TimesheetEditRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const { toast } = useToast();

  const { data: requests, isLoading } = useQuery<TimesheetEditRequest[]>({
    queryKey: ['/api/timesheet-edit-requests/pending'],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, approved, reviewNotes }: { requestId: string; approved: boolean; reviewNotes?: string }) => {
      return await apiRequest(`/api/timesheet-edit-requests/${requestId}/review`, 'PUT', { approved, reviewNotes });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/timesheet-edit-requests/pending'] });
      toast({
        title: variables.approved ? "Request Approved" : "Request Denied",
        description: variables.approved 
          ? "The timesheet edit has been approved and applied"
          : "The timesheet edit request has been denied",
      });
      setSelectedRequest(null);
      setReviewNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Action Failed",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (request: TimesheetEditRequest) => {
    reviewMutation.mutate({ requestId: request.id, approved: true });
  };

  const handleDeny = (request: TimesheetEditRequest) => {
    if (!reviewNotes.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for denying this request",
        variant: "destructive",
      });
      return;
    }
    reviewMutation.mutate({ requestId: request.id, approved: false, reviewNotes: reviewNotes.trim() });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'h:mm a');
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = requests?.length || 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
          Timesheet Edit Approvals
        </h1>
        <p className="text-muted-foreground">
          Review and approve timesheet edit requests from employees
        </p>
      </div>

      {/* Stats Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Pending Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold" data-testid="text-pending-count">
              {pendingCount}
            </span>
            <span className="text-muted-foreground">
              {pendingCount === 1 ? 'request' : 'requests'} awaiting review
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {pendingCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground">
              There are no pending timesheet edit requests to review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop View */}
          <div className="hidden md:block space-y-4">
            {requests?.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                selected={selectedRequest?.id === request.id}
                onSelect={setSelectedRequest}
                onApprove={handleApprove}
                onDeny={() => setSelectedRequest(request)}
                reviewNotes={reviewNotes}
                setReviewNotes={setReviewNotes}
                handleDenySubmit={handleDeny}
                isProcessing={reviewMutation.isPending}
                formatDateTime={formatDateTime}
                formatTime={formatTime}
              />
            ))}
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
            {requests?.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {request.requestedByName}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Requested {format(new Date(request.createdAt), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      <Clock className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RequestCard
                    key={request.id}
                    request={request}
                    selected={selectedRequest?.id === request.id}
                    onSelect={setSelectedRequest}
                    onApprove={handleApprove}
                    onDeny={() => setSelectedRequest(request)}
                    reviewNotes={reviewNotes}
                    setReviewNotes={setReviewNotes}
                    handleDenySubmit={handleDeny}
                    isProcessing={reviewMutation.isPending}
                    formatDateTime={formatDateTime}
                    formatTime={formatTime}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RequestCardProps {
  request: TimesheetEditRequest;
  selected: boolean;
  onSelect: (request: TimesheetEditRequest | null) => void;
  onApprove: (request: TimesheetEditRequest) => void;
  onDeny: () => void;
  reviewNotes: string;
  setReviewNotes: (notes: string) => void;
  handleDenySubmit: (request: TimesheetEditRequest) => void;
  isProcessing: boolean;
  formatDateTime: (dateString: string | null) => string;
  formatTime: (dateString: string | null) => string;
}

function RequestCard({
  request,
  selected,
  onSelect,
  onApprove,
  onDeny,
  reviewNotes,
  setReviewNotes,
  handleDenySubmit,
  isProcessing,
  formatDateTime,
  formatTime,
}: RequestCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {request.requestedByName}
            </CardTitle>
            <CardDescription>
              Requested {format(new Date(request.createdAt), 'MMMM d, yyyy \'at\' h:mm a')}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reason */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm mb-1">Reason for Request</p>
              <p className="text-sm text-muted-foreground">{request.reason}</p>
            </div>
          </div>
        </div>

        {/* Time Changes Comparison */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Original Times */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Current Times</h4>
            <div className="bg-card border rounded-lg p-3 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Clock In</p>
                <p className="font-medium text-sm" data-testid={`text-original-clock-in-${request.id}`}>
                  {formatDateTime(request.originalClockIn)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clock Out</p>
                <p className="font-medium text-sm" data-testid={`text-original-clock-out-${request.id}`}>
                  {formatDateTime(request.originalClockOut)}
                </p>
              </div>
              {request.originalNotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{request.originalNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Proposed Times */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-primary">Proposed Changes</h4>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              {request.proposedClockIn && (
                <div>
                  <p className="text-xs text-muted-foreground">Clock In</p>
                  <p className="font-medium text-sm text-primary" data-testid={`text-proposed-clock-in-${request.id}`}>
                    {formatDateTime(request.proposedClockIn)}
                  </p>
                </div>
              )}
              {request.proposedClockOut && (
                <div>
                  <p className="text-xs text-muted-foreground">Clock Out</p>
                  <p className="font-medium text-sm text-primary" data-testid={`text-proposed-clock-out-${request.id}`}>
                    {formatDateTime(request.proposedClockOut)}
                  </p>
                </div>
              )}
              {request.proposedNotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{request.proposedNotes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!selected ? (
          <div className="flex gap-2">
            <Button
              onClick={() => onApprove(request)}
              disabled={isProcessing}
              data-testid={`button-approve-${request.id}`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={onDeny}
              disabled={isProcessing}
              data-testid={`button-deny-${request.id}`}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Deny
            </Button>
          </div>
        ) : (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="review-notes">Reason for Denial</Label>
              <Textarea
                id="review-notes"
                placeholder="Explain why this request is being denied..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                data-testid="input-review-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => handleDenySubmit(request)}
                disabled={isProcessing || !reviewNotes.trim()}
                data-testid="button-submit-denial"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Denying...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Confirm Denial
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onSelect(null);
                  setReviewNotes("");
                }}
                disabled={isProcessing}
                data-testid="button-cancel-denial"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
