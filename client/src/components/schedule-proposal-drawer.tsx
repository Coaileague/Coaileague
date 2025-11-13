/**
 * ScheduleOS™ Smart AI Proposal Review Drawer
 * 99% AI, 1% Human Governance - Review and approve AI-generated schedules
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Clock,
  Users,
  TrendingUp,
  Loader2,
  X,
} from "lucide-react";
import type { ScheduleProposal } from "@shared/schema";

interface ScheduleProposalDrawerProps {
  open: boolean;
  onClose: () => void;
  proposalId: string | null;
  onApproved?: () => void;
  onRejected?: () => void;
}

export function ScheduleProposalDrawer({
  open,
  onClose,
  proposalId,
  onApproved,
  onRejected,
}: ScheduleProposalDrawerProps) {
  const { toast } = useToast();
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);

  // Fetch proposal details
  const { data: proposal, isLoading } = useQuery<ScheduleProposal>({
    queryKey: ["/api/scheduleos/proposals", proposalId],
    enabled: !!proposalId && open,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!proposalId) throw new Error("No proposal ID");
      const res = await apiRequest("PATCH", `/api/scheduleos/proposals/${proposalId}/approve`, {
        disclaimerAcknowledged: disclaimerAccepted,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Schedule Approved",
        description: data.message || "AI schedule successfully applied to shifts.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduleos/proposals"] });
      onApproved?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve schedule proposal",
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!proposalId) throw new Error("No proposal ID");
      const res = await apiRequest("PATCH", `/api/scheduleos/proposals/${proposalId}/reject`, {
        reason: "User rejected AI proposal",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Proposal Rejected",
        description: "AI schedule proposal rejected. No shifts were modified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduleos/proposals"] });
      onRejected?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject proposal",
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (!proposal) return;

    // Show disclaimer dialog for confidence < 100%
    if (proposal.confidence < 100 && !disclaimerAccepted) {
      setShowDisclaimerDialog(true);
    } else {
      approveMutation.mutate();
    }
  };

  const aiResponse = proposal?.aiResponse as any;
  const requiresDisclaimer = (proposal?.confidence ?? 100) < 100;

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Schedule Proposal
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SheetDescription>
              Review AI-generated schedule assignments and approve or reject
            </SheetDescription>
          </SheetHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && proposal && (
            <div className="space-y-6 mt-6">
              {/* Confidence Score Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Confidence Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold text-primary">
                      {proposal.confidence}%
                    </div>
                    <div className="flex-1">
                      <Badge
                        variant={
                          proposal.confidence >= 95
                            ? "default"
                            : proposal.confidence >= 85
                            ? "secondary"
                            : "destructive"
                        }
                        className="mb-2"
                      >
                        {proposal.confidence >= 95
                          ? "High Confidence"
                          : proposal.confidence >= 85
                          ? "Medium Confidence"
                          : "Low Confidence"}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {aiResponse?.confidenceFactors?.reasoning ||
                          "AI analysis complete"}
                      </p>
                    </div>
                  </div>

                  {/* Confidence Factors */}
                  {aiResponse?.confidenceFactors && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        {aiResponse.confidenceFactors.hardConstraintsMet ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span>
                          {aiResponse.confidenceFactors.hardConstraintsMet
                            ? "All hard constraints met"
                            : "Hard constraints violated"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span>
                          {aiResponse.confidenceFactors.softConstraintsViolated || 0} soft
                          constraint violations
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span>
                          {aiResponse.confidenceFactors.unassignedCount || 0} unassigned
                          shifts
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary */}
              {aiResponse?.summary && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">AI Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{aiResponse.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Assignments List */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Proposed Assignments ({aiResponse?.assignments?.length || 0})
                  </CardTitle>
                  <CardDescription>
                    Shifts that will be assigned to employees
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {aiResponse?.assignments?.map((assignment: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                      data-testid={`assignment-${idx}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Shift {idx + 1}
                          </Badge>
                          <Badge
                            variant={
                              assignment.confidence >= 0.9 ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {Math.round(assignment.confidence * 100)}% match
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mt-2">
                          Employee: {assignment.employeeId}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {assignment.reasoning}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Legal Disclaimer for <100% confidence */}
              {requiresDisclaimer && (
                <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Acknowledgment Required
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="disclaimer"
                        checked={disclaimerAccepted}
                        onCheckedChange={(checked) =>
                          setDisclaimerAccepted(checked as boolean)
                        }
                        data-testid="checkbox-disclaimer"
                      />
                      <Label
                        htmlFor="disclaimer"
                        className="text-sm leading-relaxed cursor-pointer"
                      >
                        I acknowledge that ScheduleOS™ generated this schedule at{" "}
                        <strong>{proposal.confidence}% confidence</strong> and I accept
                        responsibility for verifying assignments before publishing.
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator />

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={
                    approveMutation.isPending ||
                    (requiresDisclaimer && !disclaimerAccepted)
                  }
                  className="flex-1"
                  data-testid="button-approve-proposal"
                >
                  {approveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve Schedule
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                  className="flex-1"
                  data-testid="button-reject-proposal"
                >
                  {rejectMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
              </div>

              <Button
                variant="ghost"
                onClick={onClose}
                className="w-full"
                data-testid="button-review-later"
              >
                Review Later
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Disclaimer Confirmation Dialog */}
      <AlertDialog open={showDisclaimerDialog} onOpenChange={setShowDisclaimerDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirm Approval
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This AI-generated schedule has{" "}
                <strong className="text-foreground">{proposal?.confidence}% confidence</strong>.
              </p>
              <p>
                By approving, you acknowledge that ScheduleOS™ performed autonomous scheduling
                and you accept responsibility for reviewing and verifying all assignments.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-disclaimer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDisclaimerAccepted(true);
                setShowDisclaimerDialog(false);
                approveMutation.mutate();
              }}
              data-testid="button-confirm-disclaimer"
            >
              I Accept Responsibility
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
