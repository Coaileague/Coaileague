import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, ExternalLink, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface ServiceHealth {
  integrationId: string;
  integrationName: string;
  isHealthy: boolean;
  lastChecked: string;
  errorMessage?: string;
  recoveryAction?: string;
  estimatedRecoveryTime?: string;
  alternativeAction?: string;
}

interface ServiceHealthResponse {
  success: boolean;
  data: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
  };
}

interface OutageAnalysis {
  diagnosis: string;
  userGuidance: string;
  alternativeActions: string[];
  estimatedImpact: string;
  supportRecommendation: string;
}

export function IntegrationServiceStatus() {
  const { data, isLoading, error, refetch } = useQuery<ServiceHealthResponse>({
    queryKey: ['/api/workspace/integrations/health'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-service-status-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Alert variant="destructive" data-testid="alert-service-status-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Unable to check service status</AlertTitle>
        <AlertDescription>
          We couldn't retrieve the status of your connected services. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const { summary } = data;
  const unhealthyServices = data.data.filter(s => !s.isHealthy);
  const healthyServices = data.data.filter(s => s.isHealthy);

  return (
    <Card data-testid="card-service-status">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Integration Health
              {summary.unhealthy === 0 ? (
                <Badge variant="default" className="bg-green-500" data-testid="badge-all-healthy">
                  All Healthy
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-issues-detected">
                  {summary.unhealthy} Issue{summary.unhealthy > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {summary.healthy} of {summary.total} connected services are operating normally
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {unhealthyServices.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Services with Issues
            </h4>
            {unhealthyServices.map((service) => (
              <ServiceIssueCard key={service.integrationId} service={service} />
            ))}
          </div>
        )}

        {healthyServices.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Healthy Services
            </h4>
            <div className="grid gap-2">
              {healthyServices.map((service) => (
                <div 
                  key={service.integrationId}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  data-testid={`service-healthy-${service.integrationId}`}
                >
                  <span className="font-medium">{service.integrationName}</span>
                  <Badge variant="outline" className="text-green-600">
                    Operational
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No integrations connected yet.</p>
            <p className="text-sm mt-2">
              Connect your first integration to start syncing data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceIssueCard({ service }: { service: ServiceHealth }) {
  const { data: analysis } = useQuery<{ success: boolean; data: OutageAnalysis }>({
    queryKey: ['/api/workspace/integrations/analyze', service.integrationId],
    enabled: !service.isHealthy,
    staleTime: 300000,
  });

  return (
    <Alert variant="destructive" data-testid={`service-issue-${service.integrationId}`}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>{service.integrationName}</span>
        <Badge variant="destructive">Service Disruption</Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>{service.errorMessage || 'Service is currently experiencing issues.'}</p>
        
        {analysis?.data && (
          <div className="bg-background/50 rounded-lg p-3 space-y-2 text-sm">
            <p className="font-medium">{analysis.data.userGuidance}</p>
            
            {analysis.data.alternativeActions.length > 0 && (
              <div>
                <p className="font-medium text-foreground">What you can do:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {analysis.data.alternativeActions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <p className="text-muted-foreground">
              <strong>Impact:</strong> {analysis.data.estimatedImpact}
            </p>
            
            <p className="text-muted-foreground">
              {analysis.data.supportRecommendation}
            </p>
          </div>
        )}
        
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" data-testid={`button-retry-${service.integrationId}`}>
            <RefreshCw className="h-3 w-3 mr-2" />
            Retry Connection
          </Button>
          <Button size="sm" variant="ghost" data-testid={`button-support-${service.integrationId}`}>
            <ExternalLink className="h-3 w-3 mr-2" />
            Contact Support
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function IntegrationServiceBanner() {
  const { data } = useQuery<ServiceHealthResponse>({
    queryKey: ['/api/workspace/integrations/health'],
    refetchInterval: 60000,
  });

  if (!data?.success || data.summary.unhealthy === 0) {
    return null;
  }

  const unhealthyServices = data.data.filter(s => !s.isHealthy);

  return (
    <Alert variant="destructive" className="mb-4" data-testid="banner-service-issues">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Integration Service Issues Detected</AlertTitle>
      <AlertDescription>
        {unhealthyServices.length === 1 
          ? `${unhealthyServices[0].integrationName} is currently experiencing issues.`
          : `${unhealthyServices.length} integrations are currently experiencing issues.`
        }
        {' '}Your data is safe and will sync when services resume. 
        {/* @ts-ignore */}
        <Button variant="link" className="p-0 h-auto ml-1" data-testid="link-view-status">
          View Status
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ServiceUnavailablePage({ 
  serviceName, 
  errorDetails 
}: { 
  serviceName: string;
  errorDetails?: string;
}) {
  const { data: analysis } = useQuery<{ success: boolean; data: OutageAnalysis }>({
    queryKey: ['/api/workspace/integrations/analyze', serviceName],
    staleTime: 300000,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" data-testid="page-service-unavailable">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>Service Temporarily Unavailable</CardTitle>
          <CardDescription>
            {serviceName} is currently experiencing issues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorDetails && (
            <Alert>
              <AlertTitle>What happened</AlertTitle>
              <AlertDescription>{errorDetails}</AlertDescription>
            </Alert>
          )}

          {analysis?.data && (
            <>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{analysis.data.userGuidance}</p>
              </div>

              {analysis.data.alternativeActions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">What you can do in the meantime:</h4>
                  <ul className="space-y-2">
                    {analysis.data.alternativeActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={() => window.location.reload()} data-testid="button-try-again">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" data-testid="button-go-back">
              Go Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
