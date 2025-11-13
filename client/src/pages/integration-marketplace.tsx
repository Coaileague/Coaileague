import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Package, Search, Star, Check, Link2, Settings, Key, Webhook, 
  Users, DollarSign, FileText, TrendingUp, MessageSquare, Cloud,
  Database, BarChart, Box, Zap, ExternalLink, AlertCircle,
  Play, Pause, Trash2, Copy, Eye, EyeOff, Plus
} from "lucide-react";

// Category icons mapping
const categoryIcons = {
  accounting: DollarSign,
  erp: Database,
  crm: Users,
  hris: FileText,
  communication: MessageSquare,
  productivity: TrendingUp,
  analytics: BarChart,
  storage: Cloud,
  custom: Package,
};

// Category colors for visual distinction
const categoryColors = {
  accounting: "bg-muted/10 text-blue-700 dark:text-blue-400",
  erp: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  crm: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  hris: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  communication: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  productivity: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  analytics: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  storage: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  custom: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

interface Integration {
  id: string;
  name: string;
  slug: string;
  category: string;
  provider: string;
  logoUrl?: string;
  description?: string;
  longDescription?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  authType: string;
  supportedFeatures: string[];
  webhookSupport: boolean;
  isCertified: boolean;
  installCount: number;
  rating?: number;
  isActive: boolean;
}

interface IntegrationConnection {
  id: string;
  integrationId: string;
  connectionName?: string;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  isHealthy: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

interface WebhookSubscription {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  isActive: boolean;
  isHealthy: boolean;
  totalDeliveries: number;
  successfulDeliveries: number;
}

export default function IntegrationMarketplace() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [showApiKeyValue, setShowApiKeyValue] = useState(false);
  const [newApiKeyValue, setNewApiKeyValue] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Fetch available integrations from marketplace
  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations/marketplace"],
  });

  // Fetch active connections
  const { data: connections = [] } = useQuery<IntegrationConnection[]>({
    queryKey: ["/api/integrations/connections"],
  });

  // Fetch API keys
  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ["/api/integrations/api-keys"],
  });

  // Fetch webhook subscriptions
  const { data: webhooks = [] } = useQuery<WebhookSubscription[]>({
    queryKey: ["/api/integrations/webhooks"],
  });

  // Connect integration mutation
  const connectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      return apiRequest("POST", "/api/integrations/connections", {
        integrationId,
        connectionName: `${selectedIntegration?.name} Connection`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/marketplace"] });
      toast({
        title: "Integration Connected",
        description: `Successfully connected to ${selectedIntegration?.name}`,
      });
      setShowConnectionDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect integration",
        variant: "destructive",
      });
    },
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; scopes: string[] }) => {
      const result = await apiRequest("POST", "/api/integrations/api-keys", data);
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/api-keys"] });
      setNewApiKeyValue(data.apiKey); // Full API key returned only once
      setShowApiKeyValue(true);
      toast({
        title: "API Key Created",
        description: "Copy this key now - it won't be shown again!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  // Create webhook mutation
  const createWebhookMutation = useMutation({
    mutationFn: async (data: { name: string; targetUrl: string; events: string[] }) => {
      return apiRequest("POST", "/api/integrations/webhooks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/webhooks"] });
      toast({
        title: "Webhook Created",
        description: "Successfully created webhook subscription",
      });
      setShowWebhookDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create webhook",
        variant: "destructive",
      });
    },
  });

  // Filter integrations
  const filteredIntegrations = integrations.filter(integration => {
    const matchesCategory = selectedCategory === "all" || integration.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && integration.isActive;
  });

  // Check if integration is connected
  const isConnected = (integrationId: string) => {
    return connections.some(conn => conn.integrationId === integrationId && conn.isActive);
  };

  // Get connection status
  const getConnectionStatus = (integrationId: string) => {
    const connection = connections.find(conn => conn.integrationId === integrationId && conn.isActive);
    if (!connection) return null;
    return {
      healthy: connection.isHealthy,
      lastSync: connection.lastSyncAt,
      status: connection.lastSyncStatus,
    };
  };

  // Category tabs
  const categories = [
    { value: "all", label: "All Categories", icon: Package },
    { value: "accounting", label: "Accounting", icon: categoryIcons.accounting },
    { value: "erp", label: "ERP", icon: categoryIcons.erp },
    { value: "crm", label: "CRM", icon: categoryIcons.crm },
    { value: "hris", label: "HRIS", icon: categoryIcons.hris },
    { value: "communication", label: "Communication", icon: categoryIcons.communication },
  ];

  // Available events for webhooks
  const availableEvents = [
    "shift.created", "shift.updated", "shift.deleted",
    "employee.hired", "employee.terminated",
    "timesheet.submitted", "timesheet.approved",
    "invoice.created", "invoice.paid",
    "schedule.published",
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-integrationos">
              <Zap className="w-8 h-8 text-primary" />
              IntegrationOS™
            </h1>
            <p className="text-muted-foreground mt-2">
              Connect WorkforceOS to your entire enterprise ecosystem. Certified integrations with one-click setup.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowApiKeyDialog(true)} data-testid="button-create-api-key">
              <Key className="w-4 h-4 mr-2" />
              API Keys
            </Button>
            <Button variant="outline" onClick={() => setShowWebhookDialog(true)} data-testid="button-create-webhook">
              <Webhook className="w-4 h-4 mr-2" />
              Webhooks
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations (QuickBooks, Salesforce, Slack...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-integrations"
          />
        </div>
      </div>

      {/* Main content */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-4">
          {categories.map(cat => {
            const Icon = cat.icon;
            return (
              <TabsTrigger key={cat.value} value={cat.value} data-testid={`tab-${cat.value}`}>
                <Icon className="w-4 h-4 mr-2" />
                {cat.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-6">
          {integrationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : filteredIntegrations.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Integrations Found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "Try adjusting your search query" : "No integrations available in this category"}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIntegrations.map(integration => {
                const Icon = categoryIcons[integration.category as keyof typeof categoryIcons] || Package;
                const connected = isConnected(integration.id);
                const connectionStatus = getConnectionStatus(integration.id);
                const colorClass = categoryColors[integration.category as keyof typeof categoryColors];

                return (
                  <Card 
                    key={integration.id} 
                    className="relative overflow-hidden hover-elevate transition-all cursor-pointer"
                    onClick={() => setSelectedIntegration(integration)}
                    data-testid={`card-integration-${integration.slug}`}
                  >
                    {/* Certified badge */}
                    {integration.isCertified && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="gap-1">
                          <Check className="w-3 h-3" />
                          Certified
                        </Badge>
                      </div>
                    )}

                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-lg ${colorClass}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="truncate">{integration.name}</CardTitle>
                          <CardDescription className="truncate">{integration.provider}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {integration.description || "No description available"}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {integration.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                            <span>{integration.rating.toFixed(1)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{integration.installCount.toLocaleString()} installs</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {integration.supportedFeatures.slice(0, 3).map(feature => (
                          <Badge key={feature} variant="secondary" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                        {integration.supportedFeatures.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{integration.supportedFeatures.length - 3} more
                          </Badge>
                        )}
                      </div>

                      {connected && connectionStatus && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/10 border border-primary/20">
                          <Check className="w-4 h-4 text-blue-600" />
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Connected {connectionStatus.healthy ? '✓' : '⚠'}
                          </span>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex gap-2">
                      {connected ? (
                        <>
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIntegration(integration);
                              setShowConnectionDialog(true);
                            }}
                            data-testid={`button-manage-${integration.slug}`}
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Manage
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Disconnect logic
                            }}
                            data-testid={`button-disconnect-${integration.slug}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button 
                          className="w-full" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIntegration(integration);
                            setShowConnectionDialog(true);
                          }}
                          data-testid={`button-connect-${integration.slug}`}
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          Connect
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Integration Details Dialog */}
      <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIntegration && (
                <>
                  {selectedIntegration.isCertified && <Check className="w-5 h-5 text-primary" />}
                  {selectedIntegration.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>{selectedIntegration?.provider}</DialogDescription>
          </DialogHeader>

          {selectedIntegration && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">About</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedIntegration.longDescription || selectedIntegration.description}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Features</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedIntegration.supportedFeatures.map(feature => (
                    <Badge key={feature} variant="secondary">{feature}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={() => connectMutation.mutate(selectedIntegration.id)}
                  disabled={connectMutation.isPending || isConnected(selectedIntegration.id)}
                  className="flex-1"
                  data-testid="button-confirm-connect"
                >
                  {connectMutation.isPending ? "Connecting..." : isConnected(selectedIntegration.id) ? "Connected" : "Connect Now"}
                </Button>
                <Button variant="outline" onClick={() => window.open(selectedIntegration.websiteUrl, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Learn More
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* API Key Management Dialog - Placeholder */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Management</DialogTitle>
            <DialogDescription>
              Generate API keys for external applications to access WorkforceOS
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">API key management coming soon...</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Webhook Management Dialog - Placeholder */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Subscriptions</DialogTitle>
            <DialogDescription>
              Subscribe to real-time events from WorkforceOS
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Webhook management coming soon...</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
