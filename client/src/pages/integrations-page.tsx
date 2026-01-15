import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, ExternalLink, Link as LinkIcon, Unlink, Users, Building2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { FRIENDLY_LABELS, FRIENDLY_MESSAGES, FRIENDLY_HELP, friendlyError } from '@/lib/friendlyStrings';
import { IntegrationHealthPanel } from '@/components/integration-health-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Helper function for relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

interface PartnerConnection {
  id: string;
  partnerType: 'quickbooks' | 'gusto';
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  companyId: string | null;
  lastSyncedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  metadata: any;
}

interface HRISProvider {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
  oauthSupported: boolean;
}

interface HRISConnection {
  id: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  lastSyncedAt: string | null;
  syncDirection: string;
  entityTypes: string[];
}

const HRIS_PROVIDER_ICONS: Record<string, React.ReactNode> = {
  quickbooks: <Building2 className="w-6 h-6 text-green-600" />,
  gusto: <Users className="w-6 h-6 text-orange-500" />,
  adp: <Building2 className="w-6 h-6 text-red-600" />,
  paychex: <Users className="w-6 h-6 text-blue-600" />,
  zenefits: <Users className="w-6 h-6 text-purple-600" />,
  rippling: <Building2 className="w-6 h-6 text-indigo-600" />,
  bamboohr: <Users className="w-6 h-6 text-green-500" />,
  workday: <Building2 className="w-6 h-6 text-blue-500" />,
};

export default function IntegrationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; partner: string | null }>({
    open: false,
    partner: null,
  });
  const [hrisDisconnectDialog, setHrisDisconnectDialog] = useState<{ open: boolean; provider: string | null }>({
    open: false,
    provider: null,
  });

  // Fetch QuickBooks status from unified endpoint
  const { data: qbStatus, isLoading: qbStatusLoading, error: qbStatusError } = useQuery<{
    connected: boolean;
    status: string;
    connectionId?: string;
    realmId?: string;
    companyId?: string;
    companyName?: string;
    lastSyncedAt?: string;
    accessTokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
    tokenExpiresSoon?: boolean;
    tokenExpired?: boolean;
    needsAttention?: boolean;
    message?: string;
    authorizationUrl?: string;
    canDisconnect?: boolean;
    canRefresh?: boolean;
    error?: string;
  }>({
    queryKey: ['/api/integrations/quickbooks/status', user?.currentWorkspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/quickbooks/status?workspaceId=${user?.currentWorkspaceId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch QuickBooks status');
      }
      return res.json();
    },
    enabled: !!user?.currentWorkspaceId,
    refetchInterval: 30000, // Refresh every 30s
    retry: 2,
  });

  // Fetch connections (for Gusto and legacy)
  const { data: connectionsData, isLoading, error: connectionsError } = useQuery<{ connections: PartnerConnection[] }>({
    queryKey: ['/api/integrations/connections', user?.currentWorkspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/connections?workspaceId=${user?.currentWorkspaceId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch connections');
      }
      return res.json();
    },
    enabled: !!user?.currentWorkspaceId,
    retry: 2,
  });

  // Fetch HRIS providers
  const { data: hrisProvidersData, isLoading: hrisProvidersLoading } = useQuery<{ success: boolean; providers: HRISProvider[] }>({
    queryKey: ['/api/hris/providers'],
  });

  // Fetch HRIS connections
  const { data: hrisConnectionsData, isLoading: hrisConnectionsLoading } = useQuery<{ success: boolean; connections: HRISConnection[] }>({
    queryKey: ['/api/hris/connections'],
  });

  const hrisProviders = hrisProvidersData?.providers || [];
  const hrisConnections = hrisConnectionsData?.connections || [];

  // HRIS Connect mutation
  const hrisConnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest('GET', `/api/hris/auth/${provider}`);
      const data = await response.json();
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      }
      return data;
    },
    onError: (error: any) => {
      toast({
        title: 'Connection Failed',
        description: friendlyError(error.message || 'Could not start connection'),
        variant: 'destructive',
      });
    },
  });

  // HRIS Disconnect mutation
  const hrisDisconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest('DELETE', `/api/hris/disconnect/${provider}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hris/connections'] });
      toast({
        title: 'Disconnected',
        description: 'HRIS provider has been disconnected.',
      });
      setHrisDisconnectDialog({ open: false, provider: null });
    },
    onError: (error: any) => {
      toast({
        title: 'Disconnect Failed',
        description: friendlyError(error.message || 'Could not disconnect provider'),
        variant: 'destructive',
      });
    },
  });

  // HRIS Sync mutation
  const hrisSyncMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest('POST', `/api/hris/sync/${provider}`, {
        direction: 'bidirectional',
        entities: ['employee'],
        fullSync: false,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/hris/connections'] });
      toast({
        title: 'Sync Started',
        description: `Syncing ${data.result?.recordsProcessed || 0} records from HRIS.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: friendlyError(error.message || 'Could not sync data'),
        variant: 'destructive',
      });
    },
  });

  const connections = connectionsData?.connections || [];
  const quickbooksConnection = connections.find(c => c.partnerType === 'quickbooks');
  const gustoConnection = connections.find(c => c.partnerType === 'gusto');

  // Connect mutation - uses unified status endpoint for QuickBooks
  const connectMutation = useMutation({
    mutationFn: async (partner: 'quickbooks' | 'gusto') => {
      // For QuickBooks, use the authorization URL from status if available
      if (partner === 'quickbooks' && qbStatus?.authorizationUrl) {
        window.location.href = qbStatus.authorizationUrl;
        return { redirecting: true };
      }

      // Otherwise, call the connect endpoint
      const response = await apiRequest(
        'POST',
        `/api/integrations/${partner}/connect`,
        { workspaceId: user?.currentWorkspaceId }
      );
      
      const data = await response.json();
      
      // Handle both authUrl and authorizationUrl
      if (data.authorizationUrl || data.authUrl) {
        window.location.href = data.authorizationUrl || data.authUrl;
      }
      
      return data;
    },
    onError: (error: any) => {
      toast({
        title: 'Could Not Connect',
        description: friendlyError(error.message || 'Failed to initiate connection'),
        variant: 'destructive',
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (partner: 'quickbooks' | 'gusto') => {
      const response = await apiRequest(
        'POST',
        `/api/integrations/${partner}/disconnect`,
        { workspaceId: user?.currentWorkspaceId }
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/connections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/quickbooks/status'] });
      toast({
        title: 'Disconnected',
        description: FRIENDLY_MESSAGES.disconnectSuccess,
      });
      setDisconnectDialog({ open: false, partner: null });
    },
    onError: (error: any) => {
      toast({
        title: 'Could Not Disconnect',
        description: friendlyError(error.message || 'Failed to disconnect'),
        variant: 'destructive',
      });
    },
  });

  // Refresh token mutation
  const refreshMutation = useMutation({
    mutationFn: async (partner: 'quickbooks' | 'gusto') => {
      const response = await apiRequest(
        'POST',
        `/api/integrations/${partner}/refresh`,
        { workspaceId: user?.currentWorkspaceId }
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/connections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/quickbooks/status'] });
      toast({
        title: 'Connection Renewed',
        description: FRIENDLY_MESSAGES.refreshSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Could Not Renew',
        description: friendlyError(error.message || 'Failed to refresh token'),
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="default" className="gap-1" data-testid={`badge-status-connected`}>
            <CheckCircle className="w-3 h-3" />
            {FRIENDLY_LABELS.connected}
          </Badge>
        );
      case 'token_expiring':
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-status-token-expiring`}>
            <AlertCircle className="w-3 h-3" />
            Expiring Soon
          </Badge>
        );
      case 'token_expired':
        return (
          <Badge variant="destructive" className="gap-1" data-testid={`badge-status-token-expired`}>
            <XCircle className="w-3 h-3" />
            Token Expired
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-status-expired`}>
            <AlertCircle className="w-3 h-3" />
            {FRIENDLY_LABELS.expired}
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1" data-testid={`badge-status-error`}>
            <XCircle className="w-3 h-3" />
            {FRIENDLY_LABELS.error}
          </Badge>
        );
      case 'disconnected_recoverable':
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-status-recoverable`}>
            <AlertCircle className="w-3 h-3" />
            Can Restore
          </Badge>
        );
      case 'needs_reauthorization':
        return (
          <Badge variant="destructive" className="gap-1" data-testid={`badge-status-needs-reauth`}>
            <XCircle className="w-3 h-3" />
            Needs Reconnect
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1" data-testid={`badge-status-disconnected`}>
            <Unlink className="w-3 h-3" />
            {FRIENDLY_LABELS.disconnected}
          </Badge>
        );
    }
  };

  const IntegrationCard = ({ 
    title, 
    description, 
    partner, 
    connection, 
    icon 
  }: { 
    title: string; 
    description: string; 
    partner: 'quickbooks' | 'gusto'; 
    connection?: PartnerConnection;
    icon: React.ReactNode;
  }) => {
    // For QuickBooks, use the unified status endpoint
    const isQuickBooks = partner === 'quickbooks';
    const isConnected = isQuickBooks ? qbStatus?.connected : connection?.status === 'connected';
    const isExpired = isQuickBooks 
      ? (qbStatus?.status === 'token_expired' || qbStatus?.status === 'error' || qbStatus?.tokenExpired)
      : connection?.status === 'expired';
    const isRecoverable = isQuickBooks && qbStatus?.status === 'disconnected_recoverable';
    const needsReauth = isQuickBooks && qbStatus?.status === 'needs_reauthorization';
    const canRefresh = isQuickBooks ? qbStatus?.canRefresh : false;
    const needsAttention = isQuickBooks ? qbStatus?.needsAttention : false;
    const statusMessage = isQuickBooks ? (qbStatusError ? String(qbStatusError) : qbStatus?.message) : null;
    const lastSyncedAt = isQuickBooks ? qbStatus?.lastSyncedAt : connection?.lastSyncedAt;
    const accessTokenExpiresAt = isQuickBooks ? qbStatus?.accessTokenExpiresAt : connection?.accessTokenExpiresAt;
    const companyName = isQuickBooks ? qbStatus?.companyName : null;
    // Determine display status with proper token state handling
    const displayStatus = isQuickBooks 
      ? (qbStatus?.status || (qbStatus?.connected ? 'connected' : 'disconnected'))
      : (connection?.status || 'disconnected');

    return (
      <Card data-testid={`card-integration-${partner}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted">
                {icon}
              </div>
              <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="text-sm mt-1">{description}</CardDescription>
                {companyName && isConnected && (
                  <p className="text-xs text-muted-foreground mt-1">Connected to: {companyName}</p>
                )}
              </div>
            </div>
            {getStatusBadge(displayStatus)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status message for QuickBooks */}
          {isQuickBooks && statusMessage && (
            <Alert variant={needsAttention ? 'destructive' : 'default'} className="py-2">
              <AlertDescription className="text-sm">
                {statusMessage}
              </AlertDescription>
            </Alert>
          )}

          {(lastSyncedAt || accessTokenExpiresAt) && isConnected && (
            <div className="space-y-3 text-sm bg-muted/30 p-4 rounded-md">
              {lastSyncedAt && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="font-medium" data-testid={`text-last-synced-${partner}`}>
                        {partner === 'quickbooks' ? 'QuickBooks' : 'Gusto'} finished updating {getRelativeTime(new Date(lastSyncedAt))}. You're all set!
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {partner === 'quickbooks' 
                          ? 'Invoices and payments update automatically in the background.' 
                          : 'Payroll and employee hours update automatically in the background.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {accessTokenExpiresAt && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <div>
                      <p className="font-medium" data-testid={`text-token-expires-${partner}`}>
                        This connection stays active until {new Date(accessTokenExpiresAt).toLocaleDateString()}.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        We'll remind you before then. If you see a warning, click "Renew Connection" to keep things running.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {/* Show Connect button when not connected and no recoverable state */}
            {!isConnected && !isRecoverable && !isExpired && (
              <Button
                onClick={() => connectMutation.mutate(partner)}
                disabled={connectMutation.isPending || (isQuickBooks && qbStatusLoading)}
                className="gap-2"
                data-testid={`button-connect-${partner}`}
              >
                {(connectMutation.isPending || (isQuickBooks && qbStatusLoading)) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                {connectMutation.isPending ? 'Connecting...' : 'Connect'}
              </Button>
            )}

            {/* Show Reconnect button if needs reauthorization */}
            {needsReauth && (
              <Button
                onClick={() => connectMutation.mutate(partner)}
                disabled={connectMutation.isPending}
                className="gap-2"
                variant="destructive"
                data-testid={`button-reconnect-${partner}`}
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                {connectMutation.isPending ? 'Reconnecting...' : 'Reconnect to QuickBooks'}
              </Button>
            )}

            {/* Show Refresh button for recoverable states */}
            {(isRecoverable || isExpired || (canRefresh && needsAttention)) && !needsReauth && (
              <Button
                onClick={() => refreshMutation.mutate(partner)}
                disabled={refreshMutation.isPending}
                className="gap-2"
                data-testid={`button-refresh-${partner}`}
              >
                <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshMutation.isPending ? 'Restoring Connection...' : 'Restore Connection'}
              </Button>
            )}

            {/* Show Disconnect button when connected */}
            {isConnected && (
              <Button
                variant="outline"
                onClick={() => setDisconnectDialog({ open: true, partner })}
                className="gap-2"
                data-testid={`button-disconnect-${partner}`}
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const getHRISConnection = (providerId: string) => {
    return hrisConnections.find((c) => c.provider === providerId);
  };

  const HRISProviderCard = ({ provider }: { provider: HRISProvider }) => {
    const connection = getHRISConnection(provider.id);
    const isConnected = connection?.status === 'connected';

    return (
      <Card data-testid={`card-hris-${provider.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                {HRIS_PROVIDER_ICONS[provider.id] || <Users className="w-5 h-5" />}
              </div>
              <div>
                <CardTitle className="text-base">{provider.name}</CardTitle>
                <CardDescription className="text-xs mt-0.5">{provider.description}</CardDescription>
              </div>
            </div>
            {getStatusBadge(connection?.status || 'disconnected')}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {connection && connection.lastSyncedAt && (
            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              Last synced: {getRelativeTime(new Date(connection.lastSyncedAt))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {!isConnected ? (
              <Button
                size="sm"
                onClick={() => hrisConnectMutation.mutate(provider.id)}
                disabled={hrisConnectMutation.isPending}
                className="gap-1.5"
                data-testid={`button-connect-hris-${provider.id}`}
              >
                {hrisConnectMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LinkIcon className="w-3 h-3" />
                )}
                Connect
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => hrisSyncMutation.mutate(provider.id)}
                  disabled={hrisSyncMutation.isPending}
                  className="gap-1.5"
                  data-testid={`button-sync-hris-${provider.id}`}
                >
                  {hrisSyncMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Sync
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHrisDisconnectDialog({ open: true, provider: provider.id })}
                  className="gap-1.5 text-muted-foreground"
                  data-testid={`button-disconnect-hris-${provider.id}`}
                >
                  <Unlink className="w-3 h-3" />
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Connect Your Services</h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Link your business tools to automate workflows and sync data
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Need Help Getting Started?</strong> Contact CoAIleague support and we'll help you set up these connections.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="accounting" className="space-y-6">
        <TabsList>
          <TabsTrigger value="accounting" data-testid="tab-accounting">Accounting</TabsTrigger>
          <TabsTrigger value="hris" data-testid="tab-hris">HR Systems</TabsTrigger>
        </TabsList>

        <TabsContent value="accounting" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 grid gap-6 md:grid-cols-2">
              <IntegrationCard
                title="QuickBooks Online"
                description="Automated invoicing and financial management"
                partner="quickbooks"
                connection={quickbooksConnection}
                icon={
                  <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <rect width="24" height="24" rx="4" />
                  </svg>
                }
              />

              <IntegrationCard
                title="Gusto Payroll"
                description="Streamlined payroll processing and employee management"
                partner="gusto"
                connection={gustoConnection}
                icon={
                  <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                }
              />
            </div>

            <div className="lg:col-span-1">
              <IntegrationHealthPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hris" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">HR Information Systems</CardTitle>
              <CardDescription>
                Connect your HR platform to automatically sync employee data, benefits, and payroll information
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hrisProvidersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {hrisProviders.map((provider) => (
                    <HRISProviderCard key={provider.id} provider={provider} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What HRIS Integrations Do</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                <h3 className="font-semibold text-foreground mb-1">Automatic Employee Sync</h3>
                <p>Keep employee records up to date automatically. When you add or update employees in your HRIS, changes sync to CoAIleague.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">AI-Powered Field Mapping</h3>
                <p>Our AI intelligently maps fields between systems, ensuring data flows correctly even when field names differ.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Bidirectional Sync</h3>
                <p>Changes can flow both ways. Update employee schedules in CoAIleague and see them reflected in your HRIS.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>What These Services Do</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <h3 className="font-semibold text-foreground mb-2">QuickBooks Online</h3>
            <p>
              Automatically creates invoices for your clients and tracks payments. Your financial data stays updated in both systems.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Gusto Payroll</h3>
            <p>
              Automatically processes payroll for your employees using their time tracking data. Ensures accurate calculations and compliance.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">How Billing Works</h3>
            <p>
              You pay only for what you use. CoAIleague charges you for the actual cost plus a small service fee based on your plan.
            </p>
          </div>
          <div className="pt-2 border-t">
            <a
              href="https://coaileague.example.com/docs/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
              data-testid="link-integration-docs"
            >
              Learn more
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Dialog open={disconnectDialog.open} onOpenChange={(open) => setDisconnectDialog({ open, partner: null })}>
        <DialogContent size="md" data-testid="dialog-disconnect">
          <DialogHeader>
            <DialogTitle>Stop Using {disconnectDialog.partner === 'quickbooks' ? 'QuickBooks' : 'Gusto'}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop using {disconnectDialog.partner === 'quickbooks' ? 'QuickBooks' : 'Gusto'}?
              You'll need to connect again to use automatic {disconnectDialog.partner === 'quickbooks' ? 'invoicing' : 'payroll'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectDialog({ open: false, partner: null })}
              data-testid="button-cancel-disconnect"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disconnectDialog.partner && disconnectMutation.mutate(disconnectDialog.partner as 'quickbooks' | 'gusto')}
              disabled={disconnectMutation.isPending}
              data-testid="button-confirm-disconnect"
            >
              {disconnectMutation.isPending ? 'Stopping...' : 'Stop Using'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hrisDisconnectDialog.open} onOpenChange={(open) => setHrisDisconnectDialog({ open, provider: null })}>
        <DialogContent size="md" data-testid="dialog-hris-disconnect">
          <DialogHeader>
            <DialogTitle>Disconnect HR System?</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect this HR system? Employee data will no longer sync automatically.
              You can reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHrisDisconnectDialog({ open: false, provider: null })}
              data-testid="button-cancel-hris-disconnect"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => hrisDisconnectDialog.provider && hrisDisconnectMutation.mutate(hrisDisconnectDialog.provider)}
              disabled={hrisDisconnectMutation.isPending}
              data-testid="button-confirm-hris-disconnect"
            >
              {hrisDisconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
