import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, Plus, RefreshCw, Eye, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface ApiRegistry {
  id: string;
  providerName: string;
  category: string;
  endpoint: string;
  apiVersion: string;
  supportedMethods: string[];
  requiresAuth: boolean;
}

interface Integration {
  id: string;
  organizationId: string;
  apiRegistryId: string;
  status: 'active' | 'inactive' | 'error';
  lastSyncAt?: string;
  errorMessage?: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  organizationId: string;
  resourceId: string;
  status: 'success' | 'error';
  details: string;
}

export function HelpAIIntegrationPanel() {
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Fetch API Registry
  const { data: registryData, isLoading: registryLoading } = useQuery({
    queryKey: ["/api/helpai/registry"],
    staleTime: 300000,
    queryFn: () => apiFetch('/api/helpai/registry', AnyResponse),
  });

  // Fetch Integrations
  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ["/api/helpai/integrations/config"],
    staleTime: 60000,
    queryFn: () => apiFetch('/api/helpai/integrations/config', AnyResponse),
  });

  // Fetch Audit Log
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["/api/helpai/audit-log"],
    enabled: showAuditLog,
    staleTime: 30000,
    queryFn: () => apiFetch('/api/helpai/audit-log', AnyResponse),
  });

  // Configure Integration Mutation
  const configureIntegrationMutation = useMutation({
    mutationFn: async (apiId: string) => {
      const response = await apiRequest("POST", "/api/helpai/integrations/config", {
        apiRegistryId: apiId,
        configData: {},
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Integration configured successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/helpai/integrations/config"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to configure integration",
        variant: "destructive",
      });
    },
  });

  const registryList: ApiRegistry[] = (registryData as any)?.data || [];
  const integrationsList: Integration[] = (integrationsData as any)?.data || [];
  const auditEntries: AuditLogEntry[] = (auditData as any)?.data || [];

  return (
    <div className="w-full space-y-6" data-testid="helpai-integration-panel">
      {/* Registry Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>HelpAI API Registry</span>
            {registryLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            Available business system integrations for orchestration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registryList.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              No integrations available
            </div>
          ) : (
            <div className="grid gap-3">
              {registryList.map((api) => (
                <div
                  key={api.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-md hover-elevate"
                  data-testid={`api-registry-${api.id}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">{api.providerName}</div>
                    <div className="text-sm text-muted-foreground">{api.category}</div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {api.apiVersion}
                      </Badge>
                      {api.requiresAuth && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Lock className="w-3 h-3" />
                          Auth Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => configureIntegrationMutation.mutate(api.id)}
                    disabled={configureIntegrationMutation.isPending}
                    data-testid={`button-add-integration-${api.id}`}
                  >
                    {configureIntegrationMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Integrations Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Active Integrations</span>
            {integrationsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            Configured business system connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          {integrationsList.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              No active integrations
            </div>
          ) : (
            <div className="grid gap-3">
              {integrationsList.map((integration) => {
                const registryItem = registryList.find(
                  (r) => r.id === integration.apiRegistryId
                );
                return (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between gap-2 p-3 border rounded-md hover-elevate"
                    data-testid={`integration-${integration.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{registryItem?.providerName}</div>
                      <div className="text-sm text-muted-foreground">
                        Status: {integration.status}
                      </div>
                      {integration.lastSyncAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Last sync: {formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })}
                        </div>
                      )}
                      {integration.errorMessage && (
                        <div className="text-xs text-destructive mt-1 flex gap-1 items-center">
                          <AlertCircle className="w-3 h-3" />
                          {integration.errorMessage}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={
                        integration.status === "active"
                          ? "default"
                          : integration.status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                      data-testid={`status-${integration.id}`}
                    >
                      {integration.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log Section */}
      <Card>
        <CardHeader>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAuditLog(!showAuditLog)}
            className="w-full justify-between gap-2"
            data-testid="button-toggle-audit-log"
          >
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Audit Log
            </CardTitle>
            {showAuditLog && auditLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </Button>
          <CardDescription>
            Integration activity and security events
          </CardDescription>
        </CardHeader>
        {showAuditLog && (
          <CardContent>
            {auditEntries.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                No audit entries
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="text-sm p-2 border rounded"
                    data-testid={`audit-entry-${entry.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium">{entry.action}</span>
                      <Badge
                        variant={entry.status === "success" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
