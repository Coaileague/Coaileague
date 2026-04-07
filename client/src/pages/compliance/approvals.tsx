import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Clock, CheckCircle, XCircle, AlertCircle, User, FileText, ChevronRight } from "lucide-react";

interface Approval {
  approval: {
    id: string;
    employeeId: string;
    documentId: string;
    complianceRecordId: string;
    approvalType: string;
    status: string;
    priority: string;
    requestedBy: string;
    requestNotes: string;
    createdAt: string;
  };
  document: {
    id: string;
    fileName: string;
    fileType: string;
    imageSide: string;
    isColorImage: boolean;
  } | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export default function ComplianceApprovals() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);

  const { data: pendingData, isLoading: pendingLoading } = useQuery<{ success: boolean; approvals: Approval[] }>({
    queryKey: ['/api/security-compliance/approvals/pending'],
  });

  const { data: allData, isLoading: allLoading } = useQuery<{ success: boolean; approvals: Approval[] }>({
    queryKey: ['/api/security-compliance/approvals'],
  });

  const decideMutation = useMutation({
    mutationFn: async ({ approvalId, decision, notes }: { approvalId: string; decision: string; notes: string }) => {
      return await apiRequest('POST', `/api/security-compliance/approvals/${approvalId}/decide`, {
        decision,
        decisionNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/approvals/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/records/stats'] });
      toast({
        title: "Decision Recorded",
        description: `Approval has been ${pendingDecision}`,
      });
      setShowDialog(false);
      setSelectedApproval(null);
      setDecisionNotes("");
      setPendingDecision(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to record decision",
      });
    },
  });

  const handleDecision = (decision: string) => {
    if (!selectedApproval) return;
    setPendingDecision(decision);
    setShowDialog(true);
  };

  const confirmDecision = () => {
    if (!selectedApproval || !pendingDecision) return;
    decideMutation.mutate({
      approvalId: selectedApproval.approval.id,
      decision: pendingDecision,
      notes: decisionNotes,
    });
  };

  const pendingApprovals = pendingData?.approvals || [];
  const allApprovals = allData?.approvals || [];
  const recentDecisions = allApprovals.filter(a => a.approval.status !== 'pending').slice(0, 10);

  const isLoading = pendingLoading || allLoading;

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      default:
        return <Badge variant="secondary">Normal</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pageConfig: CanvasPageConfig = {
    id: 'compliance-approvals',
    title: 'Approval Workflow',
    subtitle: 'Review and approve compliance documents',
    category: 'operations',
    maxWidth: '6xl',
    backButton: true,
    onBack: () => navigate('/security-compliance'),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-pending-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{pendingApprovals.length}</p>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-approved-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold">
                    {allApprovals.filter(a => a.approval.status === 'approved').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-rejected-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold">
                    {allApprovals.filter(a => a.approval.status === 'rejected').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-urgent-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold">
                    {pendingApprovals.filter(a => a.approval.priority === 'urgent' || a.approval.priority === 'high').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Urgent/High Priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-pending-approvals">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Documents awaiting your review</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : pendingApprovals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.map((item) => (
                  <div
                    key={item.approval.id}
                    className="flex items-center justify-between gap-2 p-4 border rounded-lg hover-elevate cursor-pointer"
                    onClick={() => setSelectedApproval(item)}
                    data-testid={`approval-item-${item.approval.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.document?.fileName || 'Document'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {getPriorityBadge(item.approval.priority)}
                      <span className="text-sm text-muted-foreground">
                        {formatDate(item.approval.createdAt)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {recentDecisions.length > 0 && (
          <Card data-testid="card-recent-decisions">
            <CardHeader>
              <CardTitle>Recent Decisions</CardTitle>
              <CardDescription>Last 10 approval decisions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentDecisions.map((item) => (
                  <div
                    key={item.approval.id}
                    className="flex items-center justify-between gap-2 p-3 border rounded-lg"
                    data-testid={`decision-item-${item.approval.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.document?.fileName || 'Document'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.approval.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedApproval && (
        <UniversalModal open={!!selectedApproval && !showDialog} onOpenChange={() => setSelectedApproval(null)}>
          <UniversalModalContent size="default">
            <UniversalModalHeader>
              <UniversalModalTitle>Review Document</UniversalModalTitle>
            </UniversalModalHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid gap-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Employee:</span>
                    <span className="font-medium">
                      {selectedApproval.employee 
                        ? `${selectedApproval.employee.firstName} ${selectedApproval.employee.lastName}`
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Document:</span>
                    <span className="font-medium truncate">{selectedApproval.document?.fileName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Type:</span>
                    <span className="font-medium">{selectedApproval.approval.approvalType || 'Document'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Image Side:</span>
                    <span className="font-medium">{selectedApproval.document?.imageSide || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Color Scan:</span>
                    <span className="font-medium">
                      {selectedApproval.document?.isColorImage ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {selectedApproval.approval.requestNotes && (
                    <div className="pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Notes:</span>
                      <p className="text-sm mt-1">{selectedApproval.approval.requestNotes}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Priority:</span>
                {getPriorityBadge(selectedApproval.approval.priority)}
              </div>
            </div>
            <UniversalModalFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleDecision('needs_revision')}
                data-testid="button-needs-revision"
              >
                Request Revision
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDecision('rejected')}
                data-testid="button-reject"
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
              <Button
                onClick={() => handleDecision('approved')}
                className="bg-green-600"
                data-testid="button-approve"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Approve
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      )}

      <UniversalModal open={showDialog} onOpenChange={setShowDialog}>
        <UniversalModalContent size="sm">
          <UniversalModalHeader>
            <UniversalModalTitle>
              {pendingDecision === 'approved' ? 'Confirm Approval' : 
               pendingDecision === 'rejected' ? 'Confirm Rejection' : 'Request Revision'}
            </UniversalModalTitle>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="decision-notes">Notes (optional)</Label>
              <Textarea
                id="decision-notes"
                placeholder="Add any notes about your decision..."
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                data-testid="textarea-decision-notes"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-decision">
              Cancel
            </Button>
            <Button
              onClick={confirmDecision}
              disabled={decideMutation.isPending}
              className={pendingDecision === 'approved' ? 'bg-green-600' : ''}
              variant={pendingDecision === 'rejected' ? 'destructive' : 'default'}
              data-testid="button-confirm-decision"
            >
              {decideMutation.isPending ? 'Processing...' : 'Confirm'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
