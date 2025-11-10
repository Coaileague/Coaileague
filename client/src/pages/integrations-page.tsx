import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, ExternalLink, Link as LinkIcon, Unlink } from 'lucide-react';
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

export default function IntegrationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; partner: string | null }>({
    open: false,
    partner: null,
  });

  // Fetch connections
  const { data: connectionsData, isLoading } = useQuery<{ connections: PartnerConnection[] }>({
    queryKey: ['/api/integrations/connections', user?.currentWorkspaceId],
    enabled: !!user?.currentWorkspaceId,
  });

  const connections = connectionsData?.connections || [];
  const quickbooksConnection = connections.find(c => c.partnerType === 'quickbooks');
  const gustoConnection = connections.find(c => c.partnerType === 'gusto');

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async (partner: 'quickbooks' | 'gusto') => {
      const response = await apiRequest(
        'POST',
        `/api/integrations/${partner}/connect`,
        { workspaceId: user?.currentWorkspaceId }
      );
      
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
      
      return data;
    },
    onError: (error: any) => {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to initiate connection',
        variant: 'destructive',
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (partner: 'quickbooks' | 'gusto') => {
      const response = await apiRequest(
        'DELETE',
        `/api/integrations/${partner}/disconnect`,
        { workspaceId: user?.currentWorkspaceId }
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/connections'] });
      toast({
        title: 'Disconnected',
        description: 'Integration disconnected successfully',
      });
      setDisconnectDialog({ open: false, partner: null });
    },
    onError: (error: any) => {
      toast({
        title: 'Disconnect Failed',
        description: error.message || 'Failed to disconnect',
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
      toast({
        title: 'Token Refreshed',
        description: 'Access token refreshed successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Refresh Failed',
        description: error.message || 'Failed to refresh token',
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
            Connected
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-status-expired`}>
            <AlertCircle className="w-3 h-3" />
            Expired
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1" data-testid={`badge-status-error`}>
            <XCircle className="w-3 h-3" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1" data-testid={`badge-status-disconnected`}>
            <Unlink className="w-3 h-3" />
            Not Connected
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
    const isConnected = connection?.status === 'connected';
    const isExpired = connection?.status === 'expired';

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
              </div>
            </div>
            {getStatusBadge(connection?.status || 'disconnected')}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection && (
            <div className="space-y-2 text-sm">
              {connection.companyId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company ID:</span>
                  <span className="font-mono text-xs" data-testid={`text-company-id-${partner}`}>
                    {connection.companyId}
                  </span>
                </div>
              )}
              {connection.lastSyncedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Synced:</span>
                  <span data-testid={`text-last-synced-${partner}`}>
                    {new Date(connection.lastSyncedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {connection.accessTokenExpiresAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token Expires:</span>
                  <span data-testid={`text-token-expires-${partner}`}>
                    {new Date(connection.accessTokenExpiresAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!isConnected ? (
              <Button
                onClick={() => connectMutation.mutate(partner)}
                disabled={connectMutation.isPending}
                className="gap-2"
                data-testid={`button-connect-${partner}`}
              >
                <LinkIcon className="w-4 h-4" />
                {connectMutation.isPending ? 'Connecting...' : 'Connect'}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDisconnectDialog({ open: true, partner })}
                  className="gap-2"
                  data-testid={`button-disconnect-${partner}`}
                >
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </Button>
                {isExpired && (
                  <Button
                    variant="secondary"
                    onClick={() => refreshMutation.mutate(partner)}
                    disabled={refreshMutation.isPending}
                    className="gap-2"
                    data-testid={`button-refresh-${partner}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Token'}
                  </Button>
                )}
              </>
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Partner Integrations</h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Connect AutoForce™ with QuickBooks Online for invoicing and Gusto for payroll processing
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Production Setup Required:</strong> Before connecting, ensure your admin has configured
          the OAuth credentials (client ID, client secret, redirect URIs) and encryption key in environment variables.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
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

      <Card>
        <CardHeader>
          <CardTitle>About Partner Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <h3 className="font-semibold text-foreground mb-2">QuickBooks Online</h3>
            <p>
              Sync your AutoForce™ clients as QuickBooks customers, create invoices automatically,
              and record payments. All financial data stays synchronized between platforms.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Gusto Payroll</h3>
            <p>
              Sync employees, submit time tracking data, create payroll runs, and process payroll
              directly from AutoForce™. Ensure FLSA compliance with automated calculations.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Usage-Based Billing</h3>
            <p>
              All API calls to partner services are tracked and billed based on your workspace tier.
              You pay operational costs (API fees) plus AutoForce™ markup.
            </p>
          </div>
          <div className="pt-2 border-t">
            <a
              href="https://autoforce.example.com/docs/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
              data-testid="link-integration-docs"
            >
              Learn more about integrations
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Dialog open={disconnectDialog.open} onOpenChange={(open) => setDisconnectDialog({ open, partner: null })}>
        <DialogContent data-testid="dialog-disconnect">
          <DialogHeader>
            <DialogTitle>Disconnect Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect from {disconnectDialog.partner === 'quickbooks' ? 'QuickBooks Online' : 'Gusto'}?
              This will revoke access and you'll need to reconnect to use the integration again.
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
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
