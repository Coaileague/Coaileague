import { useState } from "react";
import { useApprovals, usePendingApprovalsCount, useApprovalDecision, ApprovalRequest } from "@/hooks/useApprovals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronUp, 
  ChevronDown,
  Bell,
  Brain,
  Sparkles,
  Bot,
  Coins,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onDecision: (id: string, decision: 'approved' | 'rejected', note?: string) => void;
  isPending: boolean;
}

function ApprovalCard({ approval, onDecision, isPending }: ApprovalCardProps) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const sourceIcon = {
    ai_brain: <Brain className="w-4 h-4" />,
    trinity: <Sparkles className="w-4 h-4" />,
    subagent: <Bot className="w-4 h-4" />,
  }[approval.sourceSystem];

  const priorityColor = {
    low: "secondary",
    normal: "outline",
    high: "default",
    urgent: "destructive",
  }[approval.priority] as "secondary" | "outline" | "default" | "destructive";

  const handleApprove = () => {
    onDecision(approval.id, 'approved', showNote ? note : undefined);
    setNote("");
    setShowNote(false);
  };

  const handleReject = () => {
    onDecision(approval.id, 'rejected', showNote ? note : undefined);
    setNote("");
    setShowNote(false);
  };

  return (
    <div 
      className="p-3 border rounded-lg space-y-2 bg-card hover-elevate"
      data-testid={`approval-card-${approval.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">{sourceIcon}</span>
            <p className="font-medium text-sm truncate">{approval.title}</p>
            <Badge variant={priorityColor} className="text-xs">
              {approval.priority}
            </Badge>
          </div>
          {approval.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {approval.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
            </span>
            {approval.estimatedTokens > 0 && (
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {approval.estimatedTokens} tokens
              </span>
            )}
            {approval.expiresAt && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle className="w-3 h-3" />
                Expires {formatDistanceToNow(new Date(approval.expiresAt), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      {showNote && (
        <Textarea
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="text-sm min-h-[60px]"
          data-testid="textarea-approval-note"
        />
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          onClick={handleApprove}
          disabled={isPending}
          className="flex-1"
          data-testid={`button-approve-${approval.id}`}
        >
          <CheckCircle className="w-4 h-4 mr-1" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={isPending}
          className="flex-1"
          data-testid={`button-reject-${approval.id}`}
        >
          <XCircle className="w-4 h-4 mr-1" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowNote(!showNote)}
          data-testid={`button-toggle-note-${approval.id}`}
        >
          {showNote ? 'Hide' : 'Note'}
        </Button>
      </div>
    </div>
  );
}

interface ApprovalTrayProps {
  workspaceId?: string;
  userId?: string;
  scope?: 'admin' | 'manager' | 'employee';
  isMobile?: boolean;
}

export function ApprovalTray({ scope = 'employee', isMobile = false }: ApprovalTrayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: count = 0 } = usePendingApprovalsCount();
  const { data: approvals = [], isLoading } = useApprovals({ 
    decision: ['pending'],
    scope,
    enabled: isOpen || count > 0,
  });
  const decisionMutation = useApprovalDecision();

  const handleDecision = (id: string, decision: 'approved' | 'rejected', note?: string) => {
    decisionMutation.mutate({ approvalId: id, decision, note });
  };

  const pendingApprovals = approvals.filter(a => a.decision === 'pending');

  if (isMobile) {
    return (
      <UniversalModal open={isOpen} onOpenChange={setIsOpen}>
        <UniversalModalTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="relative"
            data-testid="button-open-approvals-mobile"
          >
            <Bell className="w-4 h-4" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Button>
        </UniversalModalTrigger>
        <UniversalModalContent side="bottom" className="h-[80vh] sm:max-w-3xl" showHomeButton={false}>
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Pending Approvals
              {count > 0 && (
                <Badge variant="destructive">{count}</Badge>
              )}
            </UniversalModalTitle>
          </UniversalModalHeader>
          <ScrollArea className="h-full mt-4">
            <div className="space-y-3 pb-20">
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
              ) : pendingApprovals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No pending approvals</p>
              ) : (
                pendingApprovals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    onDecision={handleDecision}
                    isPending={decisionMutation.isPending}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </UniversalModalContent>
      </UniversalModal>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40" data-testid="approval-tray-desktop">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-background border-t shadow-sm">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between gap-2 py-3 px-4 rounded-none"
              data-testid="button-toggle-approval-tray"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                <span className="font-medium">Approval Requests</span>
                {count > 0 && (
                  <Badge variant="destructive">{count} pending</Badge>
                )}
              </div>
              {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t max-h-[300px] overflow-auto p-4">
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : pendingApprovals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No pending approvals</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pendingApprovals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approval={approval}
                      onDecision={handleDecision}
                      isPending={decisionMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

export function ApprovalBadge({ onClick }: { onClick?: () => void }) {
  const { data: count = 0 } = usePendingApprovalsCount();

  if (count === 0) return null;

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="relative" 
      onClick={onClick}
      data-testid="button-approval-badge"
    >
      <Bell className="w-5 h-5" />
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    </Button>
  );
}

export default ApprovalTray;
