/**
 * AUTOSCHEDULER AUDIT TRACKER™ - Manager Dispute Review
 * 
 * Managers review employee grievances with AI assistance:
 * - View AI summary and recommendation
 * - Review evidence and compliance categories
 * - Make final decision (approve/reject/escalate)
 * - Human always has final say
 */

import { secureFetch } from "@/lib/csrf";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, CheckCircle2, XCircle, AlertTriangle, Sparkles, FileText, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface Dispute {
  id: string;
  title: string;
  disputeType: string;
  filedAt: string;
  filedByName?: string;
  aiRecommendation?: string;
  aiSummary?: string;
  aiConfidenceScore?: number;
  aiAnalysisFactors?: string[];
  complianceCategory?: string;
  reason: string;
  requestedOutcome?: string;
}

export default function ReviewDisputes() {
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [decision, setDecision] = useState<'approve' | 'reject' | 'escalate' | null>(null);

  // Fetch pending disputes
  const { data: disputes, isLoading } = useQuery<Dispute[]>({
    queryKey: ['/api/disputes/pending-review'],
  });

  // Review dispute mutation
  const reviewMutation = useMutation({
    mutationFn: async ({
      disputeId,
      decision,
      notes,
    }: {
      disputeId: string;
      decision: string;
      notes: string;
    }) => {
      const response = await secureFetch(`/api/disputes/${disputeId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewerNotes: notes }),
      });
      if (!response.ok) throw new Error('Failed to review dispute');
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Dispute Reviewed",
        description: "Your decision has been recorded and the employee will be notified.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/pending-review'] });
      setSelectedDispute(null);
      setReviewNotes("");
      setDecision(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to review dispute",
        variant: "destructive",
      });
    },
  });

  const handleReview = () => {
    if (!selectedDispute || !decision) return;
    
    reviewMutation.mutate({
      disputeId: selectedDispute.id,
      decision,
      notes: reviewNotes,
    });
  };

  const pageConfig: CanvasPageConfig = {
    id: 'review-disputes',
    title: 'Review Grievances',
    subtitle: 'Review employee disputes with AI assistance',
    category: 'operations',
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>

      {/* Disputes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Grievances</CardTitle>
          <CardDescription>
            Employee disputes awaiting manager review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disputes && disputes.length > 0 ? (
            <>
            <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>AI Recommendation</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputes.map((dispute: any) => (
                  <TableRow key={dispute.id} data-testid={`row-dispute-${dispute.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {dispute.filedByName || 'Employee'}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{dispute.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {dispute.disputeType.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(new Date(dispute.filedAt), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {dispute.aiRecommendation ? (
                        <Badge
                          variant={
                            dispute.aiRecommendation === 'approve'
                              ? 'default'
                              : dispute.aiRecommendation === 'reject'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="gap-1"
                        >
                          <Brain className="w-3 h-3" />
                          {dispute.aiRecommendation}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Sparkles className="w-3 h-3" />
                          Processing...
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {dispute.complianceCategory && dispute.complianceCategory !== 'none' ? (
                        <Badge variant="outline" className="text-destructive">
                          {dispute.complianceCategory.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => setSelectedDispute(dispute)}
                        data-testid={`button-review-${dispute.id}`}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <div className="sm:hidden space-y-3">
              {disputes.map((dispute: any) => (
                <div
                  key={dispute.id}
                  className="border rounded-lg p-3 space-y-2 hover-elevate cursor-pointer"
                  onClick={() => setSelectedDispute(dispute)}
                  data-testid={`card-dispute-mobile-${dispute.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2">{dispute.title}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{dispute.filedByName || 'Employee'}</span>
                      </div>
                    </div>
                    {dispute.aiRecommendation ? (
                      <Badge
                        variant={
                          dispute.aiRecommendation === 'approve' ? 'default' :
                          dispute.aiRecommendation === 'reject' ? 'destructive' : 'secondary'
                        }
                        className="gap-1 shrink-0 text-[10px]"
                      >
                        <Brain className="w-3 h-3" />
                        {dispute.aiRecommendation}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 shrink-0 text-[10px]">
                        <Sparkles className="w-3 h-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{dispute.disputeType.replace('_', ' ')}</Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(dispute.filedAt), 'MMM dd')}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => setSelectedDispute(dispute)} data-testid={`button-review-mobile-${dispute.id}`}>
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            </>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
              <p className="text-muted-foreground">
                No pending grievances to review
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Review Dialog */}
      <UniversalModal open={!!selectedDispute} onOpenChange={() => setSelectedDispute(null)}>
        <UniversalModalContent size="full" className="max-h-[90vh] overflow-y-auto">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Review Grievance: {selectedDispute?.title}
            </UniversalModalTitle>
            <UniversalModalDescription>
              Review employee grievance with AI assistance and make a decision
            </UniversalModalDescription>
          </UniversalModalHeader>

          {selectedDispute && (
            <div className="space-y-6">
              {/* Employee Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Employee Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Filed By</p>
                      <p className="font-medium">{selectedDispute.filedByName || 'Employee'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Filed On</p>
                      <p className="font-medium">
                        {format(new Date(selectedDispute.filedAt), 'MMM dd, yyyy h:mm a')}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <Badge variant="outline">
                        {selectedDispute.disputeType.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Compliance Category</p>
                      {selectedDispute.complianceCategory && selectedDispute.complianceCategory !== 'none' ? (
                        <Badge variant="destructive">
                          {selectedDispute.complianceCategory.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Analysis */}
              {selectedDispute.aiSummary && (
                <Alert className="border-l-4 border-l-primary">
                  <Brain className="w-4 h-4" />
                  <AlertTitle className="flex items-center gap-2">
                    AI Analysis
                    <Badge variant="outline" className="gap-1">
                      <Sparkles className="w-3 h-3" />
                      Confidence: {Math.round((selectedDispute.aiConfidenceScore || 0) * 100)}%
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="space-y-3 mt-3">
                    <div>
                      <p className="font-medium text-sm mb-1">Summary:</p>
                      <p className="text-sm">{selectedDispute.aiSummary}</p>
                    </div>
                    <div>
                      <p className="font-medium text-sm mb-1">AI Recommendation:</p>
                      <Badge
                        variant={
                          selectedDispute.aiRecommendation === 'approve'
                            ? 'default'
                            : selectedDispute.aiRecommendation === 'reject'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {selectedDispute.aiRecommendation}
                      </Badge>
                    </div>
                    {selectedDispute.aiAnalysisFactors && selectedDispute.aiAnalysisFactors.length > 0 && (
                      <div>
                        <p className="font-medium text-sm mb-1">Key Factors Considered:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {selectedDispute.aiAnalysisFactors.map((factor: string, idx: number) => (
                            <li key={idx}>{factor}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground italic">
                      Note: AI provides guidance only. Human managers make the final decision.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Employee's Reason */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Employee's Reason</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{selectedDispute.reason}</p>
                </CardContent>
              </Card>

              {/* Requested Outcome */}
              {selectedDispute.requestedOutcome && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Requested Outcome</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{selectedDispute.requestedOutcome}</p>
                  </CardContent>
                </Card>
              )}

              {/* Your Decision */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Your Decision</CardTitle>
                  <CardDescription>
                    Review the AI analysis and employee's reason, then make your decision
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={decision === 'approve' ? 'default' : 'outline'}
                      onClick={() => setDecision('approve')}
                      data-testid="button-approve"
                      className="gap-1 flex-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button
                      variant={decision === 'reject' ? 'destructive' : 'outline'}
                      onClick={() => setDecision('reject')}
                      data-testid="button-reject"
                      className="gap-1 flex-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                    <Button
                      variant={decision === 'escalate' ? 'default' : 'outline'}
                      onClick={() => setDecision('escalate')}
                      data-testid="button-escalate"
                      className="gap-1 flex-1"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Escalate
                    </Button>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Reviewer Notes (required)
                    </label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Explain your decision and any actions taken..."
                      rows={4}
                      data-testid="textarea-reviewer-notes"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <UniversalModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDispute(null);
                setReviewNotes("");
                setDecision(null);
              }}
              data-testid="button-cancel-review"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={!decision || !reviewNotes || reviewMutation.isPending}
              data-testid="button-submit-review"
            >
              {reviewMutation.isPending ? 'Submitting...' : 'Submit Decision'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
