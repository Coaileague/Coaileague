import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Server, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";

interface MaintenanceStatus {
  success: boolean;
  isUnderMaintenance: boolean;
  message: string;
  estimatedEndTime: string | null;
  progressPercent: number;
}

interface HealthSummary {
  status: string;
  checks: {
    database: boolean;
    memory: boolean;
    uptime: number;
  };
}

export default function StatusPage() {
  const { data: maintenanceStatus, refetch: refetchMaintenance } = useQuery<MaintenanceStatus>({
    queryKey: ["/api/maintenance/status"],
    refetchInterval: 15000,
  });

  const { data: healthStatus } = useQuery<HealthSummary>({
    queryKey: ["/api/health/summary"],
    refetchInterval: 30000,
  });

  const isUnderMaintenance = maintenanceStatus?.isUnderMaintenance ?? false;
  const estimatedEnd = maintenanceStatus?.estimatedEndTime 
    ? new Date(maintenanceStatus.estimatedEndTime)
    : null;

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <>
      <Helmet>
        <title>System Status | CoAIleague</title>
        <meta name="description" content="Check the current operational status of CoAIleague platform and services." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              System Status
            </h1>
            <p className="text-muted-foreground">
              Current operational status of CoAIleague services
            </p>
          </div>

          {isUnderMaintenance && (
            <Card className="mb-6 border-amber-500 bg-amber-500/10">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  <CardTitle className="text-amber-500">
                    Scheduled Maintenance
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-foreground">
                  {maintenanceStatus?.message}
                </p>

                {estimatedEnd && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      Estimated completion: {estimatedEnd.toLocaleString()}
                    </span>
                  </div>
                )}

                {maintenanceStatus && maintenanceStatus.progressPercent > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{maintenanceStatus.progressPercent}%</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${maintenanceStatus.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchMaintenance()}
                  className="gap-2"
                  data-testid="button-refresh-status"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Status
                </Button>
              </CardContent>
            </Card>
          )}

          {!isUnderMaintenance && (
            <Card className="mb-6 border-green-500 bg-green-500/10">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  <CardTitle className="text-green-500">
                    All Systems Operational
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  All CoAIleague services are running normally.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">Platform Services</CardTitle>
                  </div>
                  <Badge 
                    variant={healthStatus?.status === 'healthy' ? 'default' : 'destructive'}
                    data-testid="badge-platform-status"
                  >
                    {healthStatus?.status === 'healthy' ? 'Online' : 'Degraded'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Database</span>
                  <Badge variant={healthStatus?.checks?.database ? 'default' : 'destructive'}>
                    {healthStatus?.checks?.database ? 'Connected' : 'Offline'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <Badge variant={healthStatus?.checks?.memory ? 'default' : 'destructive'}>
                    {healthStatus?.checks?.memory ? 'Normal' : 'High'}
                  </Badge>
                </div>
                {healthStatus?.checks?.uptime && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="text-foreground">{formatUptime(healthStatus.checks.uptime)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Security Status</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Authentication</span>
                  <Badge variant="default">Secured</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Data Encryption</span>
                  <Badge variant="default">AES-256</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API Protection</span>
                  <Badge variant="default">Active</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              Need help? Contact{' '}
              <a href="/contact" className="text-primary hover:underline">support</a>
            </p>
            <p className="mt-2">
              Last checked: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
