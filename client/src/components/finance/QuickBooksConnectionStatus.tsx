import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiQuickbooks } from 'react-icons/si';
import { Link } from 'wouter';

interface QBConnectionStatus {
  connected: boolean;
  status: string;
  realmId?: string;
  lastSyncAt?: string;
  tokenExpired?: boolean;
  refreshTokenExpired?: boolean;
  failedRefreshAttempts?: number;
  requiresReauth?: boolean;
  reauthUrl?: string;
}

export function QuickBooksConnectionBanner() {
  const { data: status, isLoading } = useQuery<QBConnectionStatus>({
    queryKey: ['/api/quickbooks/connection-status'],
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || !status) return null;
  if (status.connected) return null;

  const isExpired = status.refreshTokenExpired || status.tokenExpired;
  const isFailed = (status.failedRefreshAttempts || 0) >= 3;
  const isDisconnected = status.status === 'not_connected';

  let headline = 'QuickBooks Disconnected';
  let detail = 'Your QuickBooks connection is inactive. Sync and invoice features are unavailable.';

  if (isExpired) {
    headline = 'QuickBooks Authorization Expired';
    detail = 'Your QuickBooks refresh token has expired. Reconnect to restore automatic syncing.';
  } else if (isFailed) {
    headline = 'QuickBooks Token Refresh Failed';
    detail = `Trinity has failed to refresh your QuickBooks token ${status.failedRefreshAttempts} times. Reconnect to restore automatic syncing.`;
  } else if (!isDisconnected) {
    headline = 'QuickBooks Sync Error';
    detail = `QuickBooks sync is in an error state (${status.status}). Reconnect to resolve.`;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
      data-testid="banner-qb-disconnected"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <SiQuickbooks className="h-4 w-4 shrink-0 text-[#2CA01C]" aria-hidden="true" />
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-destructive">{headline}:</span>
        <span className="text-muted-foreground">{detail}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        asChild
        data-testid="button-qb-reconnect"
      >
        <Link href="/settings/integrations">
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Reconnect
        </Link>
      </Button>
    </div>
  );
}
