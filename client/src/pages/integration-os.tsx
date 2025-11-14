import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plug, Plus, Search, CheckCircle2, XCircle, AlertCircle, Settings,
  Key, Webhook, FileText, ExternalLink, Copy, Trash2, ToggleLeft,
  ToggleRight, Activity, DollarSign, Users, Calendar, Mail, Database,
  Cloud, Zap, Shield, Code, Link as LinkIcon, Eye, EyeOff
} from "lucide-react";
import { SiQuickbooks, SiSalesforce, SiSlack } from "react-icons/si";

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  icon?: string;
  authType: string;
  isActive: boolean;
  isCertified: boolean;
  supportedFeatures: string[];
  webhookSupport: boolean;
}

interface Connection {
  id: string;
  integrationId: string;
  integrationName: string;
  status: "active" | "inactive" | "error";
  connectedAt: string;
  lastSync?: string;
  config?: any;
}

interface ApiKeyData {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  lastDelivery?: string;
  deliveryCount?: number;
}

export default function IntegrationOS() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  // Fetch integration marketplace
  const { data: marketplace = [], isLoading: marketplaceLoading } = useQuery<Integration[]>({
    queryKey: ['/api/integrations/marketplace'],
    enabled: !!user,
  });

  // Fetch active connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery<Connection[]>({
    queryKey: ['/api/integrations/connections'],
    enabled: !!user,
  });

  // Fetch API keys
  const { data: apiKeys = [], isLoading: apiKeysLoading } = useQuery<ApiKeyData[]>({
    queryKey: ['/api/integrations/api-keys'],
    enabled: !!user,
  });

  // Fetch webhooks
  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery<WebhookData[]>({
    queryKey: ['/api/integrations/webhooks'],
    enabled: !!user,
  });

  // Connect integration mutation
  const connectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      return await apiRequest('/api/integrations/connections', 'POST', { integrationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/connections'] });
      setShowConnectDialog(false);
      toast({
        title: "Integration connected",
        description: "Successfully connected to the service",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to connect integration",
        variant: "destructive",
      });
    },
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest('/api/integrations/api-keys', 'POST', { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/api-keys'] });
      setShowApiKeyDialog(false);
      setNewApiKeyName("");
      toast({
        title: "API Key created",
        description: "New API key has been generated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  // Create webhook mutation
  const createWebhookMutation = useMutation({
    mutationFn: async ({ url, events }: { url: string; events: string[] }) => {
      return await apiRequest('/api/integrations/webhooks', 'POST', { url, events });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/webhooks'] });
      setShowWebhookDialog(false);
      setNewWebhookUrl("");
      setSelectedEvents([]);
      toast({
        title: "Webhook created",
        description: "Webhook has been configured successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create webhook",
        variant: "destructive",
      });
    },
  });

  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/integrations/connections/${id}`, 'DELETE', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/connections'] });
      toast({
        title: "Connection removed",
        description: "Integration has been disconnected",
      });
    },
  });

  if (authLoading) {
    return <ResponsiveLoading fullScreen message="Loading IntegrationOS™..." />;
  }

  const categories = Array.from(new Set(marketplace.map((i) => i.category)));
  const filteredMarketplace = marketplace.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || integration.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getIntegrationIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("quickbooks")) return <SiQuickbooks className="h-8 w-8" />;
    if (lowerName.includes("salesforce")) return <SiSalesforce className="h-8 w-8" />;
    if (lowerName.includes("slack")) return <SiSlack className="h-8 w-8" />;
    return <Plug className="h-8 w-8" />;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Plug className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">IntegrationOS™</h1>
              <p className="text-sm text-muted-foreground">
                External Service Ecosystem & API Management
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Active Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {connections.filter((c) => c.status === "active").length}
            </p>
            <p className="text-xs text-muted-foreground">Connected services</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plug className="h-4 w-4 text-blue-500" />
              Available Integrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{marketplace.length}</p>
            <p className="text-xs text-muted-foreground">In marketplace</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-orange-500" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{apiKeys.length}</p>
            <p className="text-xs text-muted-foreground">Active keys</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="h-4 w-4 text-purple-500" />
              Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {webhooks.filter((w) => w.isActive).length}
            </p>
            <p className="text-xs text-muted-foreground">Active webhooks</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="marketplace" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="marketplace" data-testid="tab-marketplace">
            <Plug className="h-4 w-4 mr-2" />
            Marketplace
          </TabsTrigger>
          <TabsTrigger value="connections" data-testid="tab-connections">
            <LinkIcon className="h-4 w-4 mr-2" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        {/* Marketplace Tab */}
        <TabsContent value="marketplace" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search integrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-integrations"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {marketplaceLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredMarketplace.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Plug className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No integrations found</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMarketplace.map((integration) => {
                    const isConnected = connections.some(
                      (c) => c.integrationId === integration.id && c.status === "active"
                    );

                    return (
                      <Card key={integration.id} className="hover-elevate" data-testid={`integration-${integration.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between mb-2">
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                              {getIntegrationIcon(integration.name)}
                            </div>
                            {integration.isCertified && (
                              <Badge variant="default" className="h-5">
                                <Shield className="h-3 w-3 mr-1" />
                                Certified
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-lg">{integration.name}</CardTitle>
                          <CardDescription className="line-clamp-2">
                            {integration.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="h-5 text-xs">
                                {integration.authType}
                              </Badge>
                              <Badge variant="secondary" className="h-5 text-xs">
                                {integration.category}
                              </Badge>
                              {integration.webhookSupport && (
                                <Badge variant="outline" className="h-5 text-xs">
                                  <Webhook className="h-2.5 w-2.5 mr-1" />
                                  Webhooks
                                </Badge>
                              )}
                            </div>
                            <Button
                              className="w-full"
                              variant={isConnected ? "outline" : "default"}
                              disabled={isConnected || connectMutation.isPending}
                              onClick={() => {
                                setSelectedIntegration(integration);
                                setShowConnectDialog(true);
                              }}
                              data-testid={`button-connect-${integration.id}`}
                            >
                              {isConnected ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Connected
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Connect
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Connections</CardTitle>
              <CardDescription>Manage your connected services</CardDescription>
            </CardHeader>
            <CardContent>
              {connectionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : connections.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <LinkIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No connections</p>
                  <p className="text-sm mb-4">Connect your first integration from the marketplace</p>
                  <Button onClick={() => document.querySelector('[data-testid="tab-marketplace"]')?.dispatchEvent(new Event('click', { bubbles: true }))}>
                    Browse Marketplace
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {connections.map((connection) => (
                    <Card key={connection.id} className="hover-elevate" data-testid={`connection-${connection.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                              {getIntegrationIcon(connection.integrationName)}
                            </div>
                            <div>
                              <h4 className="font-medium">{connection.integrationName}</h4>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Connected {new Date(connection.connectedAt).toLocaleDateString()}
                                </span>
                                {connection.lastSync && (
                                  <span className="flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    Synced {new Date(connection.lastSync).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                connection.status === "active"
                                  ? "default"
                                  : connection.status === "error"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="h-5"
                            >
                              {connection.status === "active" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {connection.status === "error" && <XCircle className="h-3 w-3 mr-1" />}
                              {connection.status}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteConnectionMutation.mutate(connection.id)}
                              data-testid={`button-disconnect-${connection.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage API keys for external access</CardDescription>
                </div>
                <Button onClick={() => setShowApiKeyDialog(true)} data-testid="button-create-api-key">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Key
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {apiKeysLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Key className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No API keys</p>
                  <p className="text-sm">Create an API key to access the platform programmatically</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((key) => (
                    <Card key={key.id} className="hover-elevate" data-testid={`api-key-${key.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{key.name}</h4>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-mono">{key.keyPreview}</span>
                              <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                              {key.lastUsedAt && (
                                <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" data-testid={`button-copy-key-${key.id}`}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" data-testid={`button-delete-key-${key.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Webhooks</CardTitle>
                  <CardDescription>Configure event notifications</CardDescription>
                </div>
                <Button onClick={() => setShowWebhookDialog(true)} data-testid="button-create-webhook">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Webhook
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {webhooksLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Webhook className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No webhooks</p>
                  <p className="text-sm">Add a webhook to receive real-time event notifications</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {webhooks.map((webhook) => (
                    <Card key={webhook.id} className="hover-elevate" data-testid={`webhook-${webhook.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium font-mono text-sm">{webhook.url}</h4>
                              <Badge variant={webhook.isActive ? "default" : "secondary"} className="h-5">
                                {webhook.isActive ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                                {webhook.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                              <span>Created {new Date(webhook.createdAt).toLocaleDateString()}</span>
                              {webhook.lastDelivery && (
                                <span>Last delivery {new Date(webhook.lastDelivery).toLocaleDateString()}</span>
                              )}
                              {webhook.deliveryCount !== undefined && (
                                <span>{webhook.deliveryCount} deliveries</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {webhook.events.map((event) => (
                                <Badge key={event} variant="outline" className="h-5 text-xs">
                                  {event}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" data-testid={`button-toggle-webhook-${webhook.id}`}>
                              {webhook.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" data-testid={`button-delete-webhook-${webhook.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Connect Integration Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent data-testid="dialog-connect-integration">
          <DialogHeader>
            <DialogTitle>Connect {selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Configure and authorize this integration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">
                {selectedIntegration?.authType === "oauth2"
                  ? "You'll be redirected to authorize this integration"
                  : "Enter your API credentials to connect"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedIntegration && connectMutation.mutate(selectedIntegration.id)}
              disabled={connectMutation.isPending}
              data-testid="button-confirm-connect"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent data-testid="dialog-create-api-key">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for programmatic access
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="api-key-name">Key Name *</Label>
              <Input
                id="api-key-name"
                placeholder="e.g., Production API Key"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
                data-testid="input-api-key-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiKeyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createApiKeyMutation.mutate(newApiKeyName)}
              disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending}
              data-testid="button-create-api-key-submit"
            >
              {createApiKeyMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Webhook Dialog */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent data-testid="dialog-create-webhook">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive events
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="webhook-url">Webhook URL *</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                data-testid="input-webhook-url"
              />
            </div>
            <div>
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {["user.created", "user.updated", "invoice.paid", "timeoff.approved"].map((event) => (
                  <label key={event} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEvents([...selectedEvents, event]);
                        } else {
                          setSelectedEvents(selectedEvents.filter((e) => e !== event));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{event}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createWebhookMutation.mutate({ url: newWebhookUrl, events: selectedEvents })
              }
              disabled={!newWebhookUrl.trim() || selectedEvents.length === 0 || createWebhookMutation.isPending}
              data-testid="button-create-webhook-submit"
            >
              {createWebhookMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
