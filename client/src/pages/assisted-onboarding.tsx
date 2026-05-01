import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  Users,
  Plus,
  Mail,
  Phone,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  FileText,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type HandoffStatus = "pending_setup" | "ready_for_handoff" | "handoff_sent" | "handoff_complete" | "handoff_expired";

interface AssistedWorkspace {
  id: string;
  name: string;
  targetUserEmail: string | null;
  targetUserName: string | null;
  handoffStatus: HandoffStatus | null;
  createdAt: string | null;
  assistedDocsUploaded: number | null;
  assistedExtractionStatus: string | null;
}

const statusConfig: Record<HandoffStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending_setup: { label: "Setting Up", variant: "secondary", icon: Clock },
  ready_for_handoff: { label: "Ready", variant: "default", icon: CheckCircle2 },
  handoff_sent: { label: "Email Sent", variant: "outline", icon: Mail },
  handoff_complete: { label: "Complete", variant: "default", icon: CheckCircle2 },
  handoff_expired: { label: "Expired", variant: "destructive", icon: AlertCircle },
};

function StatusBadge({ status }: { status: HandoffStatus | null }) {
  if (!status) return <Badge variant="secondary">Unknown</Badge>;
  const config = statusConfig[status] || statusConfig.pending_setup;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function AssistedOnboarding() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    targetUserEmail: "",
    targetUserName: "",
    targetUserPhone: "",
    workspaceName: "",
    notes: "",
  });

  const { data: workspacesData, isLoading } = useQuery<{
    success: boolean;
    workspaces: AssistedWorkspace[];
    count: number;
  }>({
    queryKey: ["/api/support/assisted-onboarding/list"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/support/assisted-onboarding/create", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Workspace Created",
          description: "The assisted workspace has been created successfully.",
        });
        setIsCreateOpen(false);
        setFormData({ targetUserEmail: "", targetUserName: "", targetUserPhone: "", workspaceName: "", notes: "" });
        queryClient.invalidateQueries({ queryKey: ["/api/support/assisted-onboarding/list"] });
      } else {
        toast({ title: "Error", description: data.error || "Failed to create workspace", variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to create workspace", variant: "destructive" });
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", `/api/support/assisted-onboarding/${workspaceId}/ready`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Workspace marked as ready for handoff" });
      queryClient.invalidateQueries({ queryKey: ["/api/support/assisted-onboarding/list"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendHandoffMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", `/api/support/assisted-onboarding/${workspaceId}/handoff`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Handoff Email Sent",
          description: "The user will receive an email with instructions to claim their workspace.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/support/assisted-onboarding/list"] });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!formData.targetUserEmail || !formData.targetUserName || !formData.workspaceName) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const workspaces = workspacesData?.workspaces || [];

  const headerActions = (
      <UniversalModal open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <UniversalModalTrigger asChild>
          <Button data-testid="button-create-new">
            <Plus className="h-4 w-4 mr-2" />
            New Assisted Workspace
          </Button>
        </UniversalModalTrigger>
        <UniversalModalContent size="md">
          <UniversalModalHeader>
            <UniversalModalTitle>Create Assisted Workspace</UniversalModalTitle>
            <UniversalModalDescription>
              Enter the target user's information. You'll set up their workspace and then hand it off to them.
            </UniversalModalDescription>
          </UniversalModalHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="targetUserEmail">User Email *</Label>
              <Input
                id="targetUserEmail"
                type="email"
                placeholder="Enter email address"
                value={formData.targetUserEmail}
                onChange={(e) => setFormData({ ...formData, targetUserEmail: e.target.value })}
                data-testid="input-target-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetUserName">User Name *</Label>
              <Input
                id="targetUserName"
                placeholder="John Smith"
                value={formData.targetUserName}
                onChange={(e) => setFormData({ ...formData, targetUserName: e.target.value })}
                data-testid="input-target-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetUserPhone">Phone (Optional)</Label>
              <Input
                id="targetUserPhone"
                type="tel"
                placeholder="Enter phone number"
                value={formData.targetUserPhone}
                onChange={(e) => setFormData({ ...formData, targetUserPhone: e.target.value })}
                data-testid="input-target-phone"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace Name *</Label>
              <Input
                id="workspaceName"
                placeholder="Acme Corp Scheduling"
                value={formData.workspaceName}
                onChange={(e) => setFormData({ ...formData, workspaceName: e.target.value })}
                data-testid="input-workspace-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about this assisted onboarding..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="resize-none"
                data-testid="input-notes"
              />
            </div>
          </div>

          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Workspace
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'assisted-onboarding',
    title: 'Support-Assisted Onboarding',
    subtitle: 'Create and manage workspaces on behalf of users who need assistance',
    category: 'admin',
    headerActions: headerActions,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : workspaces.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Assisted Workspaces</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              You haven't created any assisted workspaces yet. Click the button above to help a user get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} data-testid={`card-workspace-${workspace.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5 shrink-0" />
                      <span className="truncate">{workspace.name}</span>
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {workspace.targetUserEmail || "No email"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {workspace.targetUserName || "Unknown"}
                      </span>
                    </CardDescription>
                  </div>
                  <StatusBadge status={workspace.handoffStatus as HandoffStatus} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Created {workspace.createdAt ? formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true }) : "unknown"}
                    </span>
                    {workspace.assistedDocsUploaded ? (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {workspace.assistedDocsUploaded} docs
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {workspace.handoffStatus === "pending_setup" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markReadyMutation.mutate(workspace.id)}
                        disabled={markReadyMutation.isPending}
                        data-testid={`button-mark-ready-${workspace.id}`}
                      >
                        {markReadyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Mark Ready
                      </Button>
                    )}

                    {workspace.handoffStatus === "ready_for_handoff" && (
                      <Button
                        size="sm"
                        onClick={() => sendHandoffMutation.mutate(workspace.id)}
                        disabled={sendHandoffMutation.isPending}
                        data-testid={`button-send-handoff-${workspace.id}`}
                      >
                        {sendHandoffMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        Send Handoff Email
                      </Button>
                    )}

                    {workspace.handoffStatus === "handoff_sent" && (
                      <Badge variant="outline" className="gap-1">
                        <Mail className="h-3 w-3" />
                        Awaiting User Response
                      </Badge>
                    )}

                    {workspace.handoffStatus === "handoff_complete" && (
                      <Badge variant="default" className="gap-1 bg-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Transferred
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CanvasHubPage>
  );
}
