import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { 
  Bug, CheckCircle, XCircle, Clock, Loader2, AlertTriangle,
  FileCode, RefreshCw, Eye, ThumbsUp, ThumbsDown, Wrench,
  BarChart3, TrendingUp
} from "lucide-react";

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
      <CardContent className="flex items-center gap-4 p-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        {trend && (
          <Badge variant="outline" className="gap-1">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </Badge>
        )}
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
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base line-clamp-1" data-testid={`text-title-${remediation.id}`}>
              {remediation.title}
            </CardTitle>
            <CardDescription className="text-xs font-mono">
              ID: {remediation.id}
            </CardDescription>
          </div>
          <div className="flex gap-1">
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

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-xs text-muted-foreground">
            Confidence: {Math.round(remediation.confidence * 100)}%
          </div>
          <div className="flex gap-1">
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-dashboard-title">
            <Bug className="h-6 w-6 text-primary" />
            Bug Remediation Dashboard
          </h1>
          <p className="text-muted-foreground">
            Review and approve AI-generated bug fixes
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            pendingQuery.refetch();
            allQuery.refetch();
            statsQuery.refetch();
          }}
          data-testid="button-refresh-dashboard"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Pending Review" value={stats.pending} icon={Clock} />
          <StatCard title="Approved" value={stats.approved} icon={CheckCircle} />
          <StatCard title="Applied" value={stats.applied} icon={Wrench} />
          <StatCard title="Avg Confidence" value={`${Math.round(stats.avgConfidence * 100)}%`} icon={BarChart3} />
        </div>
      )}

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-sm">No pending remediations to review.</p>
              </CardContent>
            </Card>
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bug className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No remediations yet</p>
                <p className="text-sm">Bug reports will appear here once analyzed by Trinity AI.</p>
              </CardContent>
            </Card>
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

      <Dialog open={!!selectedRemediation} onOpenChange={() => setSelectedRemediation(null)}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedRemediation && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  {selectedRemediation.title}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  ID: {selectedRemediation.id}
                </DialogDescription>
              </DialogHeader>

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

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Confidence: {Math.round(selectedRemediation.confidence * 100)}%</span>
                  <span>Created: {new Date(selectedRemediation.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <DialogFooter>
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
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reject Fix
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this proposed fix.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            data-testid="input-reject-reason"
          />
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
