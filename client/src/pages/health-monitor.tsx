/**
 * Health Monitoring Dashboard
 * Displays real-time system health status for administrators
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface HealthStatus {
  status: string;
  message?: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  services: Record<string, HealthStatus>;
}

export default function HealthMonitor() {
  const { data: health, isLoading, refetch } = useQuery<HealthResponse>({
    queryKey: ['/api/health'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'down':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'up':
        return <Badge className="bg-green-600">Operational</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-600">Degraded</Badge>;
      case 'down':
        return <Badge className="bg-red-600">Down</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-muted-foreground">Real-time service monitoring</p>
        </div>
        <Button
          onClick={() => refetch()}
          size="sm"
          variant="outline"
          className="gap-2"
          data-testid="button-refresh-health"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Status</CardTitle>
          <CardDescription>System-wide operational state</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {getStatusIcon(health?.status || 'unknown')}
            <div>
              <div className="text-lg font-semibold">{getStatusBadge(health?.status || 'unknown')}</div>
              <p className="text-sm text-muted-foreground">
                {health?.status === 'up' && 'All services operational'}
                {health?.status === 'degraded' && 'Some services experiencing issues'}
                {health?.status === 'down' && 'Critical service failures detected'}
              </p>
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <div>Uptime: {((health?.uptime || 0) / 3600).toFixed(2)} hours</div>
            <div>Last Check: {new Date(health?.timestamp || '').toLocaleTimeString()}</div>
            <div>Version: {health?.version}</div>
          </div>
        </CardContent>
      </Card>

      {/* Service Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {health?.services &&
          Object.entries(health.services).map(([service, status]) => (
            <Card key={service}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg capitalize">{service.replace(/_/g, ' ')}</CardTitle>
                  {getStatusIcon(status.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getStatusBadge(status.status)}
                  {status.message && (
                    <p className="text-xs text-muted-foreground">{status.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Manual Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Actions</CardTitle>
          <CardDescription>Trigger health checks or restart services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="w-full"
              data-testid="button-manual-health-check"
            >
              Run Health Check
            </Button>
            <p className="text-xs text-muted-foreground">
              Manually trigger system diagnostics. Results update automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
