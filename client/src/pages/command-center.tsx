import { WorkspaceLayout, WorkspaceSection } from "@/components/workspace-layout";
import { UNSCommandCenter } from "@/components/uns-command-center";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Sparkles, Activity, Check, AlertTriangle, Info, Shield, Clock, ChevronRight, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";

interface NotificationItem {
  id: string;
  title: string;
  message?: string;
  description?: string;
  category: string;
  priority?: string;
  isRead?: boolean;
  isViewed?: boolean;
  createdAt: string;
  metadata?: {
    endUserSummary?: string;
    requiresAction?: boolean;
  };
  actions?: Array<{
    label: string;
    type: string;
    target: string;
  }>;
}

interface NotificationsData {
  platformUpdates: NotificationItem[];
  maintenanceAlerts: NotificationItem[];
  notifications: NotificationItem[];
  totalUnread: number;
}

function MobileNotificationCard({ notification, onDismiss, onNavigate }: { 
  notification: NotificationItem; 
  onDismiss: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const isRead = notification.isRead || notification.isViewed;
  const message = notification.metadata?.endUserSummary || notification.message || notification.description || '';
  
  const priorityColors: Record<string, string> = {
    critical: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
    high: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20',
    medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  };
  
  const categoryIcons: Record<string, typeof Bell> = {
    alerts: AlertTriangle,
    updates: Info,
    system: Shield,
  };
  
  const Icon = categoryIcons[notification.category] || Bell;
  const priorityClass = priorityColors[notification.priority || 'info'] || priorityColors.info;
  
  let timeAgo = 'Just now';
  try {
    const date = parseISO(notification.createdAt);
    if (isValid(date)) {
      timeAgo = formatDistanceToNow(date, { addSuffix: true });
    }
  } catch {}
  
  const primaryAction = notification.actions?.[0];

  return (
    <div 
      className={cn(
        "relative border-l-4 rounded-lg p-4 mb-3 transition-all",
        priorityClass,
        !isRead && "ring-1 ring-primary/20"
      )}
      data-testid={`notification-card-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
          notification.priority === 'critical' ? "bg-red-100 dark:bg-red-900/30" :
          notification.priority === 'high' ? "bg-orange-100 dark:bg-orange-900/30" :
          "bg-blue-100 dark:bg-blue-900/30"
        )}>
          <Icon className={cn(
            "w-5 h-5",
            notification.priority === 'critical' ? "text-red-600" :
            notification.priority === 'high' ? "text-orange-600" :
            "text-blue-600"
          )} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn(
              "font-medium text-base leading-tight",
              !isRead && "font-semibold"
            )}>
              {notification.title}
            </h3>
            {!isRead && (
              <Badge className="bg-primary text-white text-[10px] px-1.5 py-0.5 flex-shrink-0">
                NEW
              </Badge>
            )}
          </div>
          
          {message && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {message}
            </p>
          )}
          
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            
            <div className="flex items-center gap-2">
              {primaryAction && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-sm"
                  onClick={() => onNavigate(primaryAction.target)}
                  data-testid={`button-action-${notification.id}`}
                >
                  {primaryAction.label}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onDismiss(notification.id)}
                data-testid={`button-dismiss-${notification.id}`}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const isMobile = useIsMobile();
  const { user, workspaceId } = useAuth();
  const [, navigate] = useLocation();
  
  // WebSocket for real-time notification sync
  const { isConnected } = useNotificationWebSocket(user?.id, workspaceId || user?.workspaceId);
  
  const { data: notificationsData, isLoading } = useQuery<NotificationsData>({
    queryKey: ['/api/notifications/combined'],
    refetchInterval: isConnected ? 60000 : 30000, // Slower polling when WS connected
  });
  
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
  
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    },
  });
  
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    },
  });

  // Platform support roles that see all notifications
  const PLATFORM_SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
  // Workspace management roles that see business notifications
  const WORKSPACE_MANAGEMENT_ROLES = ['org_owner', 'co_owner', 'org_admin', 'manager', 'department_manager', 'supervisor'];

  // Role-based filter for mobile notifications
  const applyRoleFilter = (notifications: NotificationItem[]): NotificationItem[] => {
    const platformRole = user?.platformRole;
    const wsRole = user?.workspaceRole;
    
    // Platform support staff see ALL notifications
    if (platformRole && PLATFORM_SUPPORT_ROLES.includes(platformRole)) {
      return notifications;
    }
    
    // Org owners, managers, supervisors see all business notifications
    if (wsRole && WORKSPACE_MANAGEMENT_ROLES.includes(wsRole)) {
      return notifications;
    }
    
    // End users (staff) see shift-related and personal notifications
    return notifications.filter(n => {
      const title = n.title?.toLowerCase() || '';
      const message = (n.message || n.description || '')?.toLowerCase() || '';
      
      // Show shift-related notifications
      if (title.includes('shift') || message.includes('shift')) return true;
      // Show schedule notifications
      if (title.includes('schedule') || message.includes('schedule')) return true;
      // Show time tracking notifications
      if (title.includes('time') || title.includes('clock')) return true;
      // Show document notifications
      if (title.includes('document') || title.includes('handbook')) return true;
      // Show critical alerts
      if (n.priority === 'critical') return true;
      // Hide system maintenance from staff
      if (n.category === 'system' && title.includes('maintenance')) return false;
      // Show most non-system notifications
      if (n.category !== 'system') return true;
      return false;
    });
  };

  const allNotifications: NotificationItem[] = applyRoleFilter([
    ...(notificationsData?.notifications || []),
    ...(notificationsData?.platformUpdates || []),
    ...(notificationsData?.maintenanceAlerts || []),
  ]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  const unreadCount = allNotifications.filter(n => !n.isRead && !n.isViewed).length;

  if (isMobile) {
    return (
      <WorkspaceLayout title="Notifications">
        <div className="flex flex-col h-full">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Notifications</h1>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/80">
                      {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                    </p>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 text-xs text-white/70">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                  onClick={() => clearAllMutation.mutate()}
                  disabled={clearAllMutation.isPending}
                  data-testid="button-clear-all"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
          
          <ScrollArea className="flex-1 px-4 py-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : allNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-lg">No notifications</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  You're all caught up! Check back later for updates.
                </p>
              </div>
            ) : (
              <div>
                {allNotifications.map(notification => (
                  <MobileNotificationCard
                    key={notification.id}
                    notification={notification}
                    onDismiss={(id) => dismissMutation.mutate(id)}
                    onNavigate={navigate}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
          
          <div className="border-t bg-background px-4 py-3 flex-shrink-0">
            <Button
              variant="outline"
              className="w-full h-11 flex items-center justify-center gap-2"
              onClick={() => navigate("/trinity-insights")}
              data-testid="button-ask-trinity"
            >
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span className="font-medium bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Ask Trinity
              </span>
            </Button>
          </div>
        </div>
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
            <UNSCommandCenter 
              className="w-full" 
              platformRole={user?.platformRole}
              workspaceRole={user?.workspaceRole}
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
