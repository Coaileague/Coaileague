import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  User, 
  AlertCircle,
  Loader2,
  ArrowRightLeft,
  UserMinus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { format } from "date-fns";

interface ShiftAction {
  id: string;
  actionType: 'accept' | 'deny' | 'switch_request' | 'cover_request';
  status: 'pending' | 'approved' | 'denied' | 'completed' | 'canceled';
  requestedBy: string;
  requestedByName: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  reason?: string;
  shiftId: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  denialReason?: string;
  createdAt: string;
}

export default function ShiftApprovalsPage() {
  const [selectedAction, setSelectedAction] = useState<ShiftAction | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const { toast } = useToast();

  // Fetch pending shift actions
  const { data: actions, isLoading } = useQuery<ShiftAction[]>({
    queryKey: queryKeys.shifts.proposals,
    queryFn: () => apiGet('shifts.pendingActions'),
  });

  // Approve/Deny mutation (uses single endpoint with approved boolean)
  const actionMutation = useMutation({
    mutationFn: async ({ actionId, approved, managerNotes }: { actionId: string; approved: boolean; managerNotes?: string }) => {
      return await apiPatch('shifts.approveAction', { actionId, approved, managerNotes });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.proposals });
      toast({
        title: variables.approved ? "Request Approved" : "Request Denied",
        description: variables.approved 
          ? "The shift action has been approved successfully"
          : "The shift action has been denied",
      });
      setSelectedAction(null);
      setDenialReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Action Failed",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (action: ShiftAction) => {
    actionMutation.mutate({ actionId: action.id, approved: true });
  };

  const handleDeny = (action: ShiftAction) => {
    if (!denialReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for denying this request",
        variant: "destructive",
      });
      return;
    }
    actionMutation.mutate({ actionId: action.id, approved: false, managerNotes: denialReason.trim() });
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'accept':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'deny':
        return <UserMinus className="h-4 w-4" />;
      case 'switch_request':
        return <ArrowRightLeft className="h-4 w-4" />;
      case 'cover_request':
        return <User className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'accept':
        return 'Accept Shift';
      case 'deny':
        return 'Decline Shift';
      case 'switch_request':
        return 'Switch Request';
      case 'cover_request':
        return 'Cover Request';
      default:
        return type;
    }
  };

  const getActionVariant = (type: string): "default" | "secondary" | "destructive" => {
    switch (type) {
      case 'accept':
        return 'default';
      case 'deny':
        return 'destructive';
      case 'switch_request':
      case 'cover_request':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const pendingActions = actions?.filter(a => a.status === 'pending') || [];
  const groupedByType = {
    accept: pendingActions.filter(a => a.actionType === 'accept'),
    deny: pendingActions.filter(a => a.actionType === 'deny'),
    switch_request: pendingActions.filter(a => a.actionType === 'switch_request'),
    cover_request: pendingActions.filter(a => a.actionType === 'cover_request'),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Shift Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve employee shift change requests
        </p>
      </div>

      {pendingActions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">All Caught Up!</p>
            <p className="text-sm text-muted-foreground">
              No pending shift approval requests at this time
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">
              All ({pendingActions.length})
            </TabsTrigger>
            <TabsTrigger value="accept" data-testid="tab-accept">
              Accept ({groupedByType.accept.length})
            </TabsTrigger>
            <TabsTrigger value="deny" data-testid="tab-deny">
              Decline ({groupedByType.deny.length})
            </TabsTrigger>
            <TabsTrigger value="switch" data-testid="tab-switch">
              Switch ({groupedByType.switch_request.length})
            </TabsTrigger>
            <TabsTrigger value="cover" data-testid="tab-cover">
              Cover ({groupedByType.cover_request.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {pendingActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                selected={selectedAction?.id === action.id}
                onSelect={setSelectedAction}
                onApprove={handleApprove}
                onDeny={() => setSelectedAction(action)}
                denialReason={denialReason}
                setDenialReason={setDenialReason}
                handleDenySubmit={handleDeny}
                isProcessing={actionMutation.isPending}
                getActionIcon={getActionIcon}
                getActionLabel={getActionLabel}
                getActionVariant={getActionVariant}
              />
            ))}
          </TabsContent>

          {(['accept', 'deny', 'switch', 'cover'] as const).map((tab) => {
            const typeKey = tab === 'switch' ? 'switch_request' : tab === 'cover' ? 'cover_request' : tab;
            const filteredActions = groupedByType[typeKey];
            
            return (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {filteredActions.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <p className="text-sm text-muted-foreground">
                        No {getActionLabel(typeKey).toLowerCase()} requests pending
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      selected={selectedAction?.id === action.id}
                      onSelect={setSelectedAction}
                      onApprove={handleApprove}
                      onDeny={() => setSelectedAction(action)}
                      denialReason={denialReason}
                      setDenialReason={setDenialReason}
                      handleDenySubmit={handleDeny}
                      isProcessing={actionMutation.isPending}
                      getActionIcon={getActionIcon}
                      getActionLabel={getActionLabel}
                      getActionVariant={getActionVariant}
                    />
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

interface ActionCardProps {
  action: ShiftAction;
  selected: boolean;
  onSelect: (action: ShiftAction | null) => void;
  onApprove: (action: ShiftAction) => void;
  onDeny: () => void;
  denialReason: string;
  setDenialReason: (reason: string) => void;
  handleDenySubmit: (action: ShiftAction) => void;
  isProcessing: boolean;
  getActionIcon: (type: string) => JSX.Element;
  getActionLabel: (type: string) => string;
  getActionVariant: (type: string) => "default" | "secondary" | "destructive";
}

function ActionCard({
  action,
  selected,
  onSelect,
  onApprove,
  onDeny,
  denialReason,
  setDenialReason,
  handleDenySubmit,
  isProcessing,
  getActionIcon,
  getActionLabel,
  getActionVariant,
}: ActionCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={getActionVariant(action.actionType)}>
                {getActionIcon(action.actionType)}
                <span className="ml-1">{getActionLabel(action.actionType)}</span>
              </Badge>
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {format(new Date(action.createdAt), 'MMM d, h:mm a')}
              </Badge>
            </div>
            <CardTitle className="text-base">
              {action.requestedByName}
            </CardTitle>
            <CardDescription>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                {format(new Date(action.shiftDate), 'EEEE, MMMM d, yyyy')}
                <span className="text-muted-foreground">
                  {action.shiftStart} - {action.shiftEnd}
                </span>
              </div>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Request Details */}
        {action.reason && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Reason:</strong> {action.reason}
            </AlertDescription>
          </Alert>
        )}

        {action.targetEmployeeName && (
          <div className="mb-4 p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-1">Target Employee</p>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{action.targetEmployeeName}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {!selected ? (
          <div className="flex gap-2">
            <Button
              onClick={() => onApprove(action)}
              disabled={isProcessing}
              data-testid={`button-approve-${action.id}`}
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
              data-testid={`button-deny-${action.id}`}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Deny
            </Button>
          </div>
        ) : (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="denial-reason">Reason for Denial</Label>
              <Textarea
                id="denial-reason"
                placeholder="Explain why this request is being denied..."
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                rows={3}
                data-testid="input-denial-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => handleDenySubmit(action)}
                disabled={isProcessing || !denialReason.trim()}
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
                  setDenialReason("");
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
