import { WorkspaceLayout, WorkspaceSection } from "@/components/workspace-layout";
import { UNSCommandCenter } from "@/components/uns-command-center";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotificationsPopover } from "@/components/notifications-popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Zap, Settings2, Sparkles, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function CommandCenterPage() {
  const isMobile = useIsMobile();
  
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
    return (
      <WorkspaceLayout title="Command Center">
        <WorkspaceSection>
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
            <Bell className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Mobile Notifications</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Access your notifications from the bell icon in the navigation bar for the best mobile experience.
            </p>
            <NotificationsPopover />
          </div>
        </WorkspaceSection>
      </WorkspaceLayout>
    );
  }

  const operationalServices = healthData?.services?.filter(s => s.status === 'operational').length || 0;
  const totalServices = healthData?.services?.length || 0;

  return (
    <WorkspaceLayout title="Command Center">
      <WorkspaceSection>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UNSCommandCenter className="w-full" />
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

            <Card data-testid="card-quick-actions">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Common automation tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <a 
                  href="/settings" 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                  data-testid="link-settings"
                >
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Notification Settings</span>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </WorkspaceSection>
    </WorkspaceLayout>
  );
}
