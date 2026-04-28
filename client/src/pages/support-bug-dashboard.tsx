import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {Eye, Bug, CheckCircle, XCircle, Clock, Loader2, AlertTriangle,
  FileCode, Eye, ThumbsUp, ThumbsDown, Wrench,
  BarChart3, TrendingUp
} from "lucide-react";
import { UniversalEmptyState } from "@/components/universal/UniversalEmptyState";

interface RemediationRequest {
  id: string;
  reportId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  rootCause: string;
  proposedFix: string;
  affectedFiles: string[];
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  commitHash?: string;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  applied: number;
  avgConfidence: number;
}

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  applied: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

function StatCard({ title, value, icon: Icon, trend }: { 
  title: string; 
  value: number | string; 
  icon: any;
  trend?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:pt-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{title}</p>
            <p className="text-lg sm:text-2xl font-bold truncate">{value}</p>
          </div>
          {trend && (
            <Badge variant="outline" className="gap-1 shrink-0 hidden sm:flex">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RemediationCard({ 
  remediation, 
  onApprove, 
  onReject,
  onView,
  isApproving,
  isRejecting 
}: { 
  remediation: RemediationRequest;
  onApprove: () => void;
  onReject: () => void;
  onView: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-remediation-${remediation.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-sm sm:text-base line-clamp-1" data-testid={`text-title-${remediation.id}`}>
              {remediation.title}
            </CardTitle>
            <CardDescription className="text-xs font-mono truncate">
              ID: {remediation.id}
            </CardDescription>
          </div>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            <Badge className={SEVERITY_COLORS[remediation.severity]}>
              {remediation.severity}
            </Badge>
            <Badge className={STATUS_COLORS[remediation.status]}>
              {remediation.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {remediation.rootCause}
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-xs">{remediation.category}</Badge>
          {remediation.affectedFiles?.slice(0, 2).map((file, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs font-mono">
              {file.split('/').pop()}
            </Badge>
          ))}
          {remediation.affectedFiles?.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{remediation.affectedFiles.length - 2} more
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
          <div className="text-xs text-muted-foreground truncate">
            Confidence: {Math.round(remediation.confidence * 100)}%
          </div>
          <div className="flex gap-1 shrink-0">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onView}
              data-testid={`button-view-${remediation.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {remediation.status === 'pending' && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                  onClick={onApprove}
                  disabled={isApproving || isRejecting}
                  data-testid={`button-approve-${remediation.id}`}
                >
                  {isApproving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsUp className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={onReject}
                  disabled={isApproving || isRejecting}
                  data-testid={`button-reject-${remediation.id}`}
                >
                  {isRejecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsDown className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {remediation.status === 'applied' && remediation.commitHash && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            <span>Applied: {remediation.commitHash.slice(0, 7)}</span>
          </div>
        )}

        {remediation.status === 'rejected' && remediation.rejectionReason && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            <span className="line-clamp-1">{remediation.rejectionReason}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SupportBugDashboard() {
  const { toast } = useToast();
  const [selectedRemediation, setSelectedRemediation] = useState<RemediationRequest | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);

  const pendingQuery = useQuery<{ success: boolean; data: RemediationRequest[] }>({
    queryKey: ['/api/bug-remediation/pending'],
    refetchInterval: 10000,
  });

  const allQuery = useQuery<{ success: boolean; data: RemediationRequest[] }>({
    queryKey: ['/api/bug-remediation/all'],
    refetchInterval: 30000,
  });

  const statsQuery = useQuery<{ success: boolean; data: Stats }>({
    queryKey: ['/api/bug-remediation/stats'],
    refetchInterval: 60000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/bug-remediation/${id}/approve`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Fix Approved",
        description: data?.data?.commitHash 
          ? `Code changes applied. Commit: ${data.data.commitHash.slice(0, 7)}`
          : "The fix has been approved and applied.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Could not approve the fix. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/bug-remediation/${id}/reject`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Fix Rejected",
        description: "The proposed fix has been rejected.",
      });
      setRejectDialogOpen(false);
      setRejectReason('');
      setPendingRejectId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-remediation/stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Could not reject the fix. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleReject = (id: string) => {
    setPendingRejectId(id);
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (pendingRejectId) {
      rejectMutation.mutate({ id: pendingRejectId, reason: rejectReason || 'Rejected by support staff' });
    }
  };

  const pending = pendingQuery.data?.data || [];
  const all = allQuery.data?.data || [];
  const stats = statsQuery.data?.data;
  const isLoading = pendingQuery.isLoading || allQuery.isLoading;

  const pageConfig: CanvasPageConfig = {
    id: "support-bug-dashboard",
    title: "Bug Remediation Dashboard",
    subtitle: "Review and approve AI-generated bug fixes",
    category: "admin",
    maxWidth: "6xl",
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <StatCard title="Pending Review" value={stats.pending} icon={Clock} />
          <StatCard title="Approved" value={stats.approved} icon={CheckCircle} />
          <StatCard title="Applied" value={stats.applied} icon={Wrench} />
          <StatCard title="Avg Confidence" value={`${Math.round(stats.avgConfidence * 100)}%`} icon={BarChart3} />
        </div>
      )}

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="pending" className="gap-2" data-testid="tab-pending">
            <Clock className="h-4 w-4" />
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2" data-testid="tab-all">
            <FileCode className="h-4 w-4" />
            All Remediations ({all.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && pending.length === 0 && (
            <UniversalEmptyState
              icon={<CheckCircle className="h-12 w-12" />}
              title="All caught up!"
              description="No pending remediations to review."
              data-testid="empty-state-pending"
            />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {pending.map((rem) => (
              <RemediationCard
                key={rem.id}
                remediation={rem}
                onApprove={() => approveMutation.mutate(rem.id)}
                onReject={() => handleReject(rem.id)}
                onView={() => setSelectedRemediation(rem)}
                isApproving={approveMutation.isPending && approveMutation.variables === rem.id}
                isRejecting={rejectMutation.isPending && pendingRejectId === rem.id}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && all.length === 0 && (
            <UniversalEmptyState
              icon={<Bug className="h-12 w-12" />}
              title="No remediations yet"
              description="Bug reports will appear here once analyzed by Trinity AI."
              data-testid="empty-state-all"
            />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {all.map((rem) => (
              <RemediationCard
                key={rem.id}
                remediation={rem}
                onApprove={() => approveMutation.mutate(rem.id)}
                onReject={() => handleReject(rem.id)}
                onView={() => setSelectedRemediation(rem)}
                isApproving={approveMutation.isPending && approveMutation.variables === rem.id}
                isRejecting={rejectMutation.isPending && pendingRejectId === rem.id}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <UniversalModal open={!!selectedRemediation} onOpenChange={() => setSelectedRemediation(null)}>
        <UniversalModalContent size="lg">
          {selectedRemediation && (
            <>
              <UniversalModalHeader>
                <UniversalModalTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  {selectedRemediation.title}
                </UniversalModalTitle>
                <UniversalModalDescription className="font-mono text-xs">
                  ID: {selectedRemediation.id}
                </UniversalModalDescription>
              </UniversalModalHeader>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <Badge className={SEVERITY_COLORS[selectedRemediation.severity]}>
                    {selectedRemediation.severity}
                  </Badge>
                  <Badge className={STATUS_COLORS[selectedRemediation.status]}>
                    {selectedRemediation.status}
                  </Badge>
                  <Badge variant="outline">{selectedRemediation.category}</Badge>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedRemediation.description}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Root Cause</h4>
                  <p className="text-sm text-muted-foreground">{selectedRemediation.rootCause}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Proposed Fix</h4>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap">
                    {selectedRemediation.proposedFix}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Affected Files</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedRemediation.affectedFiles?.map((file, idx) => (
                      <Badge key={idx} variant="secondary" className="font-mono text-xs">
                        {file}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground pt-2 border-t">
                  <span>Confidence: {Math.round(selectedRemediation.confidence * 100)}%</span>
                  <span>Created: {new Date(selectedRemediation.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <UniversalModalFooter>
                {selectedRemediation.status === 'pending' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleReject(selectedRemediation.id);
                        setSelectedRemediation(null);
                      }}
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => {
                        approveMutation.mutate(selectedRemediation.id);
                        setSelectedRemediation(null);
                      }}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Approve & Apply
                    </Button>
                  </>
                )}
                {selectedRemediation.status !== 'pending' && (
                  <Button variant="outline" onClick={() => setSelectedRemediation(null)}>
                    Close
                  </Button>
                )}
              </UniversalModalFooter>
            </>
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <UniversalModalContent size="md">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reject Fix
            </UniversalModalTitle>
            <UniversalModalDescription>
              Please provide a reason for rejecting this proposed fix.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <Textarea
            placeholder="Enter rejection reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            data-testid="input-reject-reason"
          />
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Reject
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
