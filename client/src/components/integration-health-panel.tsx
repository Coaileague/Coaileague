import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertCircle, XCircle, RefreshCw, Activity, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryClient } from '@/lib/queryClient';

interface ServiceHealth {
  service: string;
  status: 'operational' | 'degraded' | 'down';
  isCritical: boolean;
  message?: string;
  lastChecked: string;
  latencyMs?: number;
  metadata?: {
    connectedAccounts?: number;
    expiringTokens?: number;
  };
}

interface IntegrationHealthData {
  quickbooks: ServiceHealth;
  gusto: ServiceHealth;
  overall: 'operational' | 'degraded' | 'down';
  timestamp: string;
}

export function IntegrationHealthPanel() {
  const { data, isLoading, error, isFetching } = useQuery<IntegrationHealthData>({
    queryKey: ['/api/integrations/health'],
    refetchInterval: 60000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/integrations/health'] });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'down':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
      case 'degraded':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Needs Attention</Badge>;
      case 'down':
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const ServiceCard = ({ service, name, icon }: { service: ServiceHealth | undefined; name: string; icon: React.ReactNode }) => {
    if (!service) {
      return (
        <div className="p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              {icon}
            </div>
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 rounded-lg border border-border bg-card hover-elevate transition-all" data-testid={`card-health-${service.service}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium" data-testid={`text-name-${service.service}`}>{name}</span>
                {getStatusIcon(service.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-message-${service.service}`}>
                {service.message}
              </p>
            </div>
          </div>
          {getStatusBadge(service.status)}
        </div>
        
        {service.metadata && (service.metadata.connectedAccounts !== undefined || service.metadata.expiringTokens !== undefined) && (
          <div className="mt-3 pt-3 border-t border-border flex gap-4 text-xs text-muted-foreground">
            {service.metadata.connectedAccounts !== undefined && (
              <span data-testid={`text-accounts-${service.service}`}>
                {service.metadata.connectedAccounts} account{service.metadata.connectedAccounts !== 1 ? 's' : ''} connected
              </span>
            )}
            {service.metadata.expiringTokens !== undefined && service.metadata.expiringTokens > 0 && (
              <span className="text-yellow-600" data-testid={`text-expiring-${service.service}`}>
                {service.metadata.expiringTokens} token{service.metadata.expiringTokens !== 1 ? 's' : ''} expiring soon
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <Card data-testid="card-integration-health-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Integration Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">Unable to load integration status</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
              <RefreshCw className="w-3 h-3 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-integration-health">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Integration Health
            </CardTitle>
            <CardDescription className="mt-1">
              Real-time status of your connected services
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            disabled={isFetching}
            data-testid="button-refresh-health"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <ServiceCard 
              service={data?.quickbooks} 
              name="QuickBooks" 
              icon={
                <svg className="w-5 h-5 text-[#2CA01C]" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              }
            />
            <ServiceCard 
              service={data?.gusto} 
              name="Gusto Payroll" 
              icon={
                <svg className="w-5 h-5 text-[#F45D48]" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              }
            />
          </>
        )}

        {data && (
          <div className="pt-2 text-xs text-muted-foreground text-center" data-testid="text-last-updated">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
