import { WorkspaceLayout, WorkspaceSection } from "@/components/workspace-layout";
import { UNSCommandCenter } from "@/components/uns-command-center";
import { MobileNotificationHub } from "@/components/mobile/MobileNotificationHub";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export default function CommandCenterPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  
  const { data: trinityStatus } = useQuery<{ status: string; activeAgents?: number }>({
    queryKey: ['/api/trinity/status'],
  });

  const { data: healthData } = useQuery<{
    overall: string;
    services: Array<{ name: string; status: string }>;
  }>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 60000,
  });

  if (isMobile) {
    return <MobileNotificationHub />;
  }

  const operationalServices = healthData?.services?.filter(s => s.status === 'operational').length || 0;
  const totalServices = healthData?.services?.length || 0;

  return (
    <WorkspaceLayout>
      <WorkspaceSection title="Command Center">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UNSCommandCenter 
              className="w-full" 
              platformRole={user?.platformRole ?? undefined}
              workspaceRole={user?.workspaceRole ?? undefined}
            />
          </div>
          
          <div className="space-y-4">
            <Card data-testid="card-trinity-status">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Trinity AI Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge 
                    variant={trinityStatus?.status === 'operational' ? 'default' : 'secondary'}
                    className={trinityStatus?.status === 'operational' ? 'bg-emerald-500' : ''}
                  >
                    {trinityStatus?.status === 'operational' ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                {trinityStatus?.activeAgents && trinityStatus.activeAgents > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-muted-foreground">Active Agents</span>
                    <span className="font-medium">{trinityStatus.activeAgents}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-system-health">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="w-5 h-5 text-blue-500" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Overall</span>
                  <Badge 
                    variant={healthData?.overall === 'operational' ? 'default' : 'secondary'}
                    className={healthData?.overall === 'operational' ? 'bg-emerald-500' : ''}
                  >
                    {healthData?.overall === 'operational' ? 'Operational' : healthData?.overall || 'Unknown'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-muted-foreground">Services</span>
                  <span className="font-medium">{operationalServices}/{totalServices} Online</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </WorkspaceSection>
    </WorkspaceLayout>
  );
}
