/**
 * Trinity Approval Queue — 1% Human Intervention UI
 *
 * Shown on owner/manager dashboard. Compact card list of pending Trinity actions.
 * One-tap approve or reject. Auto-refreshes every 30 seconds.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Activity } from "lucide-react";

interface PendingApproval {
  id: string;
  action_type: string;
  parameters: Record<string, any>;
  reason: string;
  created_at: string;
  expires_at: string;
  // Trinity's deliberation — present when the action went through the
  // conscience gate (terminate_employee / cancel_client / etc.).
  deliberation?: {
    verdict: string;
    headline: string;
    reasoning: string;
    empathyStatement?: string;
    riskAssessment?: {
      financial: string;
      legal: string;
      relational: string;
      operational: string;
    };
    alternatives?: Array<{ title: string; description: string }>;
    generatedDocuments?: Array<{ type: string; title: string }>;
  };
}

const ACTION_LABELS: Record<string, string> = {
  'scheduling.create_shift': 'Create Shift',
  'scheduling.cancel_shift': 'Cancel Shift',
  'scheduling.reassign_shift': 'Reassign Shift',
  'scheduling.fill_open_shift': 'Fill Open Shift',
  'employees.deactivate': 'Deactivate Employee',
  'notify.send': 'Send Notification',
  'billing.invoice_create': 'Create Invoice',
  'billing.invoice_send': 'Send Invoice',
};

export function TrinityApprovalQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/trinity/scheduling/pending-approvals"],
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/trinity/scheduling/pending-approvals/${id}/approve`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/scheduling/pending-approvals"] });
      toast({ title: "Action approved", description: "Trinity will execute it now." });
    },
    onError: () => toast({ title: "Approval failed", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/trinity/scheduling/pending-approvals/${id}/reject`, { reason: "Owner rejected" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/scheduling/pending-approvals"] });
      toast({ title: "Action rejected" });
    },
    onError: () => toast({ title: "Rejection failed", variant: "destructive" }),
  });

  const approvals: PendingApproval[] = (data as any)?.approvals || [];

  if (isLoading) {
    return (
      <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
        Loading pending actions...
      </div>
    );
  }

  if (!approvals.length) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
        <Activity className="w-4 h-4 text-purple-400" />
        Trinity is running fully autonomously — no approvals needed.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="trinity-approval-queue">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold">
          Trinity Needs Your Input ({approvals.length})
        </span>
      </div>
      {approvals.map((approval) => {
        const label = ACTION_LABELS[approval.action_type] || approval.action_type;
        const expiresIn = Math.max(0, Math.round(
          (new Date(approval.expires_at).getTime() - Date.now()) / 3600000
        ));

        return (
          <div
            key={approval.id}
            className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card"
            data-testid={`approval-item-${approval.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {approval.reason || "Trinity proposed this action"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Expires in {expiresIn}h
                </p>
              </div>
            </div>
            {approval.deliberation && (
              <div className="space-y-1.5" data-testid={`deliberation-${approval.id}`}>
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                  <p className="font-medium text-amber-400 mb-0.5">{approval.deliberation.headline}</p>
                  <p className="text-muted-foreground leading-relaxed">{approval.deliberation.reasoning}</p>
                </div>
                {approval.deliberation.empathyStatement && (
                  <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-xs text-blue-300">
                    {approval.deliberation.empathyStatement}
                  </div>
                )}
                {(approval.deliberation.alternatives?.length ?? 0) > 0 && (
                  <div className="text-xs space-y-0.5">
                    <p className="font-medium text-green-400">Trinity suggests first:</p>
                    {approval.deliberation.alternatives!.map((alt, i) => (
                      <p key={i} className="text-muted-foreground">• {alt.title}: {alt.description}</p>
                    ))}
                  </div>
                )}
                {(approval.deliberation.generatedDocuments?.length ?? 0) > 0 && (
                  <p className="text-xs text-purple-400">
                    Auto-generated: {approval.deliberation.generatedDocuments!.map(d => d.title).join(', ')}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-1.5 justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={() => approveMutation.mutate(approval.id)}
                disabled={approveMutation.isPending}
                data-testid={`button-approve-${approval.id}`}
              >
                <CheckCircle className="w-3 h-3 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => rejectMutation.mutate(approval.id)}
                disabled={rejectMutation.isPending}
                data-testid={`button-reject-${approval.id}`}
              >
                <XCircle className="w-3 h-3 mr-1" /> Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TrinityApprovalQueue;
