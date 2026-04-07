import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Link2, Unlink, RefreshCw, Clock, CheckCircle,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Building2, Zap, ShieldCheck
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: "hris-management",
  title: "HRIS Integrations",
  subtitle: "Connect and sync with external HR systems",
  category: "operations",
};

const secureFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const ENTITY_TYPES = [
  { id: "employee", label: "Employees" },
  { id: "department", label: "Departments" },
  { id: "payroll", label: "Payroll" },
  { id: "time_off", label: "Time Off" },
  { id: "benefits", label: "Benefits" },
  { id: "compensation", label: "Compensation" },
] as const;

const SYNC_DIRECTIONS = [
  { id: "inbound", label: "Inbound", icon: ArrowDownToLine },
  { id: "outbound", label: "Outbound", icon: ArrowUpFromLine },
  { id: "bidirectional", label: "Both", icon: ArrowLeftRight },
] as const;

export default function HRISManagementPage() {
  const { toast } = useToast();
  const [syncDirection, setSyncDirection] = useState<string>("bidirectional");
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set(["employee"]));
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ["/api/hris/providers"],
    queryFn: () => secureFetch("/api/hris/providers"),
  });

  const connectionsQuery = useQuery({
    queryKey: ["/api/hris/connections"],
    queryFn: () => secureFetch("/api/hris/connections"),
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/hris/auth/${provider}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast({ title: "Connection initiated", description: "Follow the authorization prompts to complete connection" });
      }
    },
    onError: () => {
      toast({ title: "Connection failed", description: "Could not initiate provider connection", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (provider: string) => {
      setSyncingProvider(provider);
      const res = await apiRequest("POST", `/api/hris/sync/${provider}`, {
        direction: syncDirection,
        entities: Array.from(selectedEntities),
        fullSync: false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sync started", description: "Data synchronization has been initiated" });
      setSyncingProvider(null);
      queryClient.invalidateQueries({ queryKey: ["/api/hris/connections"] });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not start data synchronization", variant: "destructive" });
      setSyncingProvider(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest("DELETE", `/api/hris/disconnect/${provider}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Provider disconnected", description: "HRIS provider has been disconnected" });
      queryClient.invalidateQueries({ queryKey: ["/api/hris/connections"] });
    },
    onError: () => {
      toast({ title: "Disconnect failed", variant: "destructive" });
    },
  });

  const toggleEntity = (entity: string) => {
    setSelectedEntities(prev => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const providers = providersQuery.data?.providers || [];
  const connections = connectionsQuery.data?.connections || [];
  const connectedProviderIds = new Set(connections.map((c: any) => c.provider || c.id));
  const isLoading = providersQuery.isLoading || connectionsQuery.isLoading;

  const summaryCards = [
    { label: "Connected", value: connections.length.toString(), icon: Link2, color: "text-green-500" },
    { label: "Last Sync", value: connections.length > 0 && connections[0]?.lastSync ? new Date(connections[0].lastSync).toLocaleDateString() : "Never", icon: Clock, color: "text-blue-500" },
    { label: "Synced", value: connections.reduce((sum: number, c: any) => sum + (c.employeeCount || 0), 0).toString(), icon: Users, color: "text-purple-500" },
    { label: "Health", value: connections.every((c: any) => c.status === "healthy" || c.status === "connected") ? "Healthy" : connections.length === 0 ? "--" : "Issues", icon: ShieldCheck, color: "text-orange-500" },
  ];

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {summaryCards.map(c => (
              <Card key={c.label}>
                <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
                  <c.icon className={`h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 shrink-0 ${c.color}`} />
                  <div className="min-w-0">
                    <p className="text-base sm:text-xl md:text-2xl font-bold" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>{c.value}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{c.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Sync Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Sync Direction</p>
              <div className="flex flex-wrap gap-2">
                {SYNC_DIRECTIONS.map(dir => (
                  <Button
                    key={dir.id}
                    variant={syncDirection === dir.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSyncDirection(dir.id)}
                    className={syncDirection === dir.id ? "toggle-elevate toggle-elevated" : "toggle-elevate"}
                    data-testid={`button-direction-${dir.id}`}
                  >
                    <dir.icon className="h-4 w-4 mr-1" />{dir.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Entity Types</p>
              <div className="flex flex-wrap gap-3">
                {ENTITY_TYPES.map(entity => (
                  <label key={entity.id} className="flex items-center gap-2 cursor-pointer" data-testid={`checkbox-entity-${entity.id}`}>
                    <Checkbox
                      checked={selectedEntities.has(entity.id)}
                      onCheckedChange={() => toggleEntity(entity.id)}
                    />
                    <span className="text-sm">{entity.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">HRIS Providers</h3>
          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : providers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Providers Available</h3>
                <p className="text-muted-foreground max-w-md">
                  HRIS provider integrations are not yet configured for this workspace.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {providers.map((provider: any) => {
                const providerId = provider.id || provider.name?.toLowerCase();
                const isConnected = connectedProviderIds.has(providerId);
                const connection = connections.find((c: any) => (c.provider || c.id) === providerId);

                return (
                  <Card key={providerId} className="hover-elevate" data-testid={`card-provider-${providerId}`}>
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium" data-testid={`text-provider-name-${providerId}`}>{provider.name || providerId}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">{provider.description || "HR System"}</p>
                          </div>
                        </div>
                        <Badge variant={isConnected ? "default" : "outline"} className="shrink-0 text-[10px] sm:text-xs" data-testid={`badge-status-${providerId}`}>
                          {isConnected ? "Connected" : "Available"}
                        </Badge>
                      </div>

                      {isConnected && connection && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {connection.lastSync && (
                            <p className="flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="truncate">Last sync: {new Date(connection.lastSync).toLocaleString()}</span>
                            </p>
                          )}
                          {connection.employeeCount !== undefined && (
                            <p className="flex items-center gap-1">
                              <Users className="h-3 w-3 shrink-0" />{connection.employeeCount} employees
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        {isConnected ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => syncMutation.mutate(providerId)}
                              disabled={syncMutation.isPending && syncingProvider === providerId}
                              data-testid={`button-sync-${providerId}`}
                            >
                              {syncMutation.isPending && syncingProvider === providerId ? (
                                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />Syncing</>
                              ) : (
                                <><RefreshCw className="h-4 w-4 mr-1" />Sync</>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectMutation.mutate(providerId)}
                              disabled={disconnectMutation.isPending}
                              data-testid={`button-disconnect-${providerId}`}
                            >
                              <Unlink className="h-4 w-4 mr-1" />Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => connectMutation.mutate(providerId)}
                            disabled={connectMutation.isPending}
                            data-testid={`button-connect-${providerId}`}
                          >
                            <Link2 className="h-4 w-4 mr-1" />Connect
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CanvasHubPage>
  );
}