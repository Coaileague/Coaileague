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
import { FRIENDLY_LABELS, FRIENDLY_MESSAGES, FRIENDLY_HELP, friendlyError } from '@/lib/friendlyStrings';

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
            <div className="space-y-3 text-sm bg-muted/30 p-4 rounded-md">
              {connection.lastSyncedAt && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="font-medium" data-testid={`text-last-synced-${partner}`}>
                        {partner === 'quickbooks' ? 'QuickBooks' : 'Gusto'} finished updating {getRelativeTime(new Date(connection.lastSyncedAt))}. You're all set!
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
              {connection.accessTokenExpiresAt && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <div>
                      <p className="font-medium" data-testid={`text-token-expires-${partner}`}>
                        This connection stays active until {new Date(connection.accessTokenExpiresAt).toLocaleDateString()}.
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
                    {refreshMutation.isPending ? 'Renewing...' : 'Renew Connection'}
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
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Connect Your Services</h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Link QuickBooks for automatic invoicing and Gusto for automatic payroll
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Need Help Getting Started?</strong> Contact AutoForce support and we'll help you set up these connections.
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
              You pay only for what you use. AutoForce charges you for the actual cost plus a small service fee based on your plan.
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
              Learn more
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Dialog open={disconnectDialog.open} onOpenChange={(open) => setDisconnectDialog({ open, partner: null })}>
        <DialogContent data-testid="dialog-disconnect">
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
    </div>
  );
}
