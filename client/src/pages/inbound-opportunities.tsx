import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  Inbox,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  Settings,
  Layers,
  Ban,
  RefreshCw,
  Mail,
} from 'lucide-react';;

const pageConfig: CanvasPageConfig = {
  id: "inbound-opportunities",
  title: "Inbound Opportunities",
  subtitle: "AI-powered staffing opportunity processing and auto-assignment",
  category: "operations",
};

const secureFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed": return "default";
    case "active":
    case "in_progress":
      return "secondary";
    case "escalated": return "destructive";
    case "pending":
      return "outline";
    default: return "outline";
  }
}

export default function InboundOpportunitiesPage() {
  const { toast } = useToast();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const workflowsQuery = useQuery({
    queryKey: ["/api/trinity-staffing/workflows"],
    queryFn: () => secureFetch("/api/trinity-staffing/workflows"),
  });

  const settingsQuery = useQuery({
    queryKey: ["/api/trinity-staffing/settings"],
    queryFn: () => secureFetch("/api/trinity-staffing/settings"),
  });

  const escalationsQuery = useQuery({
    queryKey: ["/api/trinity-staffing/escalation-tiers"],
    queryFn: () => secureFetch("/api/trinity-staffing/escalation-tiers"),
  });

  const workflowDetailQuery = useQuery({
    queryKey: ["/api/trinity-staffing/workflows", selectedWorkflowId],
    queryFn: () => secureFetch(`/api/trinity-staffing/workflows/${selectedWorkflowId}`),
    enabled: !!selectedWorkflowId,
  });

  const cancelMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const res = await apiRequest("POST", `/api/trinity-staffing/workflows/${workflowId}/cancel`, { reason: "Cancelled by user" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workflow cancelled", description: "The workflow has been cancelled successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity-staffing/workflows"] });
      setSelectedWorkflowId(null);
    },
    onError: () => {
      toast({ title: "Cancel failed", description: "Could not cancel the workflow", variant: "destructive" });
    },
  });

  const workflows = workflowsQuery.data?.workflows || [];
  const activeCount = workflows.filter((w: any) => w.status === "active" || w.status === "in_progress").length;
  const completedCount = workflows.filter((w: any) => w.status === "completed").length;
  const pendingCount = workflows.filter((w: any) => w.status === "pending").length;
  const escalatedCount = workflows.filter((w: any) => w.status === "escalated").length;

  const summaryCards = [
    { label: "Active", value: activeCount.toString(), icon: Play, color: "text-blue-500" },
    { label: "Completed", value: completedCount.toString(), icon: CheckCircle, color: "text-green-500" },
    { label: "Pending", value: pendingCount.toString(), icon: Clock, color: "text-orange-500" },
    { label: "Escalated", value: escalatedCount.toString(), icon: AlertTriangle, color: "text-red-500" },
  ];

  const settings = settingsQuery.data?.settings;
  const tiers = escalationsQuery.data?.tiers || [];
  const workflowDetail = workflowDetailQuery.data?.workflow;

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {workflowsQuery.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map(c => (
              <Card key={c.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <c.icon className={`h-6 w-6 sm:h-8 sm:w-8 shrink-0 ${c.color}`} />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold truncate" data-testid={`stat-${c.label.toLowerCase()}`}>{c.value}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs defaultValue="workflows" data-testid="tabs-inbound-opportunities">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="workflows" data-testid="tab-workflows">
              <Inbox className="h-4 w-4 mr-1" />Workflows
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 mr-1" />Settings
            </TabsTrigger>
            <TabsTrigger value="escalations" data-testid="tab-escalations">
              <Layers className="h-4 w-4 mr-1" />Escalations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="mt-4 space-y-3">
            {workflowsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : workflows.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Workflows Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Inbound staffing opportunities will appear here as emails are processed and workflows are created automatically.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {selectedWorkflowId && workflowDetail && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Workflow Details
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={() => setSelectedWorkflowId(null)} data-testid="button-close-detail">
                          <XCircle className="h-4 w-4 mr-1" />Close
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <Badge variant={getStatusVariant(workflowDetail.status)} data-testid="badge-detail-status">{workflowDetail.status}</Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Created</p>
                          <p className="text-sm truncate" data-testid="text-detail-created">{new Date(workflowDetail.createdAt).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Source</p>
                          <p className="text-sm">{workflowDetail.source || "Email"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Priority</p>
                          <p className="text-sm">{workflowDetail.priority || "Normal"}</p>
                        </div>
                      </div>
                      {workflowDetail.subject && (
                        <div>
                          <p className="text-xs text-muted-foreground">Subject</p>
                          <p className="text-sm">{workflowDetail.subject}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {workflows.map((wf: any) => (
                  <Card key={wf.id} data-testid={`card-workflow-${wf.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-workflow-subject-${wf.id}`}>
                              {wf.subject || wf.title || `Workflow ${wf.id.slice(0, 8)}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {wf.from || "Unknown sender"} {wf.createdAt ? `- ${new Date(wf.createdAt).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={getStatusVariant(wf.status)} data-testid={`badge-status-${wf.id}`}>{wf.status}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedWorkflowId(wf.id)}
                            data-testid={`button-view-${wf.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(wf.status === "active" || wf.status === "in_progress" || wf.status === "pending") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cancelMutation.mutate(wf.id)}
                              disabled={cancelMutation.isPending}
                              data-testid={`button-cancel-${wf.id}`}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            {settingsQuery.isLoading ? (
              <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ) : !settings ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Settings Unavailable</h3>
                  <p className="text-muted-foreground max-w-md">
                    Staffing settings could not be loaded. Ensure you have manager access to view configuration.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Staffing Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(settings).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`setting-${key}`}>
                        <span className="text-sm text-muted-foreground truncate min-w-0">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                        <span className="text-sm font-medium shrink-0">
                          {typeof value === "boolean" ? (
                            <Badge variant={value ? "default" : "secondary"}>{value ? "Enabled" : "Disabled"}</Badge>
                          ) : (
                            String(value)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="escalations" className="mt-4">
            {escalationsQuery.isLoading ? (
              <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ) : tiers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Escalation Tiers</h3>
                  <p className="text-muted-foreground max-w-md">
                    Escalation tier configuration will appear here once configured.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tiers.map((tier: any, idx: number) => (
                  <Card key={idx} data-testid={`card-escalation-tier-${idx}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 shrink-0">
                            <span className="text-sm font-bold">{idx + 1}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-tier-name-${idx}`}>{tier.name || `Tier ${idx + 1}`}</p>
                            <p className="text-xs text-muted-foreground truncate">{tier.description || "No description"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {tier.timeoutMinutes && (
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />{tier.timeoutMinutes}min
                            </Badge>
                          )}
                          {tier.autoEscalate !== undefined && (
                            <Badge variant={tier.autoEscalate ? "default" : "secondary"}>
                              {tier.autoEscalate ? "Auto" : "Manual"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {tier.assignees && tier.assignees.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tier.assignees.map((assignee: string, aIdx: number) => (
                            <Badge key={aIdx} variant="outline">{assignee}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}