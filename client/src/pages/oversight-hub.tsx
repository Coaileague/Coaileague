import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {Eye, AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  DollarSign,
  Calendar,
  Users,
  FileText,
  TrendingUp,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { FRIENDLY_LABELS } from "@/lib/friendlyStrings";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface OversightEvent {
  id: string;
  entityType: string;
  entityId: string;
  detectedBy: string;
  detectedAt: string;
  autoScore: number | null;
  flagReason: string;
  entitySummary: {
    amount?: string;
    date?: string;
    employeeName?: string;
    clientName?: string;
    description?: string;
  } | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

export default function OversightHub() {
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<OversightEvent | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<OversightEvent[]>({
    queryKey: ['/api/oversight'],
  });

  const { data: stats } = useQuery<{ pending: number; approved: number; rejected: number }>({
    queryKey: ['/api/oversight/stats'],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return apiRequest('PATCH', `/api/oversight/${id}/approve`, { resolutionNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oversight'] });
      queryClient.invalidateQueries({ queryKey: ['/api/oversight/stats'] });
      toast({
        title: "Approved",
        description: "Item approved successfully",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve item",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      return apiRequest('PATCH', `/api/oversight/${id}/reject`, { resolutionNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oversight'] });
      queryClient.invalidateQueries({ queryKey: ['/api/oversight/stats'] });
      toast({
        title: "Rejected",
        description: "Item rejected successfully",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject item",
        variant: "destructive",
      });
    },
  });

  const handleReview = (event: OversightEvent, action: 'approve' | 'reject') => {
    setSelectedEvent(event);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setReviewDialogOpen(false);
    setSelectedEvent(null);
    setReviewNotes("");
  };

  const handleSubmitReview = () => {
    if (!selectedEvent) return;

    if (reviewAction === 'approve') {
      approveMutation.mutate({ id: selectedEvent.id, notes: reviewNotes });
    } else {
      if (!reviewNotes.trim()) {
        toast({
          title: "Reason Required",
          description: "Please explain why you're rejecting this item",
          variant: "destructive",
        });
        return;
      }
      rejectMutation.mutate({ id: selectedEvent.id, notes: reviewNotes });
    }
  };

  const getEntityIcon = (entityType: string) => {
    const icons: Record<string, any> = {
      invoice: DollarSign,
      expense: FileText,
      timesheet: Clock,
      shift: Calendar,
      payroll_run: TrendingUp,
      time_entry: Clock,
    };
    const Icon = icons[entityType] || AlertCircle;
    return <Icon className="h-4 w-4" />;
  };

  const getEntityLabel = (entityType: string) => {
    const labels: Record<string, string> = {
      invoice: "Invoice",
      expense: "Expense",
      timesheet: "Timesheet",
      shift: "Shift",
      payroll_run: "Payroll",
      time_entry: "Time Entry",
      dispute: "Dispute",
    };
    return labels[entityType] || entityType;
  };

  const getRiskBadge = (score: number | null) => {
    if (!score) return null;
    
    if (score >= 80) {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />High Risk</Badge>;
    } else if (score >= 50) {
      return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />Medium Risk</Badge>;
    } else {
      return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />Low Risk</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading oversight queue...</div>;
  }

  const pendingEvents = events.filter(e => e.status === 'pending');

  const pageConfig: CanvasPageConfig = {
    id: 'oversight-hub',
    title: FRIENDLY_LABELS.oversight || "1% Oversight Queue",
    subtitle: 'Review items flagged by automation for your approval',
    category: 'operations',
    maxWidth: '7xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Needs Your Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="count-pending">
              {stats?.pending || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary" data-testid="count-approved">
              {stats?.approved || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive" data-testid="count-rejected">
              {stats?.rejected || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event List */}
      {pendingEvents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
            <p className="text-muted-foreground">
              No items need your review right now. {(import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague'} is handling everything smoothly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingEvents.map((event) => (
            <Card key={event.id} data-testid={`card-oversight-${event.id}`} className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getEntityIcon(event.entityType)}
                      <CardTitle className="text-lg">
                        {getEntityLabel(event.entityType)}
                        {event.entitySummary?.amount && (
                          <span className="ml-2 font-mono">${event.entitySummary.amount}</span>
                        )}
                      </CardTitle>
                      {getRiskBadge(event.autoScore)}
                    </div>
                    <CardDescription>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Eye className="h-3 w-3" />
                          <span className="font-medium">Why flagged:</span>
                          {event.flagReason}
                        </div>
                        {event.entitySummary && (
                          <div className="flex flex-wrap gap-4 mt-2 text-xs">
                            {event.entitySummary.employeeName && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {event.entitySummary.employeeName}
                              </span>
                            )}
                            {event.entitySummary.clientName && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {event.entitySummary.clientName}
                              </span>
                            )}
                            {event.entitySummary.date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(event.entitySummary.date), "MMM dd, yyyy")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleReview(event, 'approve')}
                      data-testid={`button-approve-${event.id}`}
                      className="gap-1"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReview(event, 'reject')}
                      data-testid={`button-reject-${event.id}`}
                      className="gap-1"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <UniversalModal open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <UniversalModalContent size="md" data-testid="dialog-review">
          <UniversalModalHeader>
            <UniversalModalTitle>
              {reviewAction === 'approve' ? 'Approve Item' : 'Reject Item'}
            </UniversalModalTitle>
            <UniversalModalDescription>
              {reviewAction === 'approve'
                ? 'You can add optional notes about why you approved this item.'
                : 'Please explain why you are rejecting this item.'}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            {selectedEvent && (
              <div className="bg-muted/30 p-3 rounded-md space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {getEntityIcon(selectedEvent.entityType)}
                  {getEntityLabel(selectedEvent.entityType)}
                  {selectedEvent.entitySummary?.amount && (
                    <span className="font-mono">${selectedEvent.entitySummary.amount}</span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium">Flagged because:</span> {selectedEvent.flagReason}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="review-notes">
                {reviewAction === 'approve' ? 'Notes (Optional)' : 'Reason for Rejection *'}
              </Label>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === 'approve'
                    ? 'Add any notes about your approval...'
                    : 'Explain why you are rejecting this item...'
                }
                rows={3}
                data-testid="textarea-review-notes"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              data-testid="button-cancel-review"
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleSubmitReview}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              data-testid="button-confirm-review"
            >
              {approveMutation.isPending || rejectMutation.isPending
                ? 'Processing...'
                : reviewAction === 'approve'
                ? 'Approve'
                : 'Reject'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
