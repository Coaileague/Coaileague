import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Calendar, Clock, ChevronRight, Check, X, Wrench, AlertTriangle, User, CheckCircle2, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, formatDistanceToNow, startOfDay, endOfDay, parseISO, isToday } from "date-fns";

interface UserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
  actionType?: string;
  actionData?: any;
}

interface PlatformUpdate {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  createdAt: string;
  read: boolean;
}

interface NotificationsData {
  userNotifications: UserNotification[];
  platformUpdates: PlatformUpdate[];
  unreadCount: number;
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  employeeId?: string;
  clientId?: string;
  client?: { name: string };
  location?: string;
  notes?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function NotificationActionButtons({ 
  notification, 
  onAction 
}: { 
  notification: UserNotification; 
  onAction: (action: string, id: string, data?: any) => void;
}) {
  const { actionType, actionData, id } = notification;
  
  if (actionType === 'shift_request' || actionType === 'swap_request') {
    return (
      <div className="flex gap-2 mt-3">
        <Button 
          size="sm" 
          variant="default"
          onClick={() => onAction('approve', id, actionData)}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          data-testid={`button-approve-${id}`}
        >
          <Check className="w-4 h-4 mr-1" />
          Approve
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => onAction('deny', id, actionData)}
          className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
          data-testid={`button-deny-${id}`}
        >
          <X className="w-4 h-4 mr-1" />
          Deny
        </Button>
      </div>
    );
  }
  
  if (actionType === 'acknowledge') {
    return (
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => onAction('acknowledge', id)}
        className="w-full mt-3"
        data-testid={`button-acknowledge-${id}`}
      >
        <CheckCircle2 className="w-4 h-4 mr-1" />
        Acknowledge
      </Button>
    );
  }
  
  if (actionType === 'hotpatch' || actionType === 'trinity_fix') {
    return (
      <div className="flex gap-2 mt-3">
        <Button 
          size="sm" 
          variant="default"
          onClick={() => onAction('run_hotpatch', id, actionData)}
          className="flex-1 bg-purple-600 hover:bg-purple-700"
          data-testid={`button-hotpatch-${id}`}
        >
          <Wrench className="w-4 h-4 mr-1" />
          Run Hotpatch
        </Button>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => onAction('dismiss', id)}
          className="text-muted-foreground"
          data-testid={`button-dismiss-${id}`}
        >
          Dismiss
        </Button>
      </div>
    );
  }
  
  return null;
}

function NotificationCard({ 
  notification, 
  onAction 
}: { 
  notification: UserNotification; 
  onAction: (action: string, id: string, data?: any) => void;
}) {
  const iconMap: Record<string, any> = {
    shift: Calendar,
    time: Clock,
    system: AlertTriangle,
    message: MessageSquare,
    user: User,
    scheduling: Calendar,
    alert: AlertTriangle,
  };
  
  const Icon = iconMap[notification.category || notification.type || 'system'] || Bell;
  const isUrgent = notification.priority === 'high' || notification.priority === 'urgent';
  const hasAction = notification.actionType && notification.actionType !== '';
  
  return (
    <Card 
      className={`p-4 ${!notification.read ? 'bg-primary/5 border-primary/20' : ''} ${isUrgent ? 'border-l-4 border-l-amber-500' : ''}`}
      data-testid={`notification-card-${notification.id}`}
    >
      <div className="flex gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isUrgent ? 'bg-amber-500/20' : 'bg-muted'}`}>
          <Icon className={`w-5 h-5 ${isUrgent ? 'text-amber-500' : 'text-muted-foreground'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm text-foreground truncate">
              {notification.title}
            </h3>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {notification.message}
          </p>
          {hasAction && (
            <NotificationActionButtons notification={notification} onAction={onAction} />
          )}
        </div>
      </div>
    </Card>
  );
}

export function MobileNotificationHub() {
  const [, setLocation] = useLocation();
  
  const { data: userData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });
  
  const { data: notificationsData, isLoading: notificationsLoading } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    refetchInterval: 30000,
  });
  
  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();
  
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", dayStart, dayEnd],
  });
  
  const { data: employeeData } = useQuery<any>({
    queryKey: ["/api/employees/me"],
  });
  
  const actionMutation = useMutation({
    mutationFn: async ({ action, id, data }: { action: string; id: string; data?: any }) => {
      return apiRequest(`/api/notifications/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, data }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
    },
  });
  
  const handleAction = (action: string, id: string, data?: any) => {
    actionMutation.mutate({ action, id, data });
  };
  
  const userNotifications = notificationsData?.userNotifications || [];
  const platformUpdates = notificationsData?.platformUpdates || [];
  const allNotifications: UserNotification[] = [
    ...userNotifications,
    ...platformUpdates.map(p => ({
      id: p.id,
      type: 'platform',
      title: p.title,
      message: p.message,
      createdAt: p.createdAt,
      read: p.read,
      priority: p.severity === 'critical' ? 'urgent' as const : p.severity === 'warning' ? 'high' as const : 'normal' as const,
      category: p.category,
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  const unreadCount = notificationsData?.unreadCount || 0;
  const actionableCount = allNotifications.filter(n => n.actionType && n.actionType !== '').length;
  
  const myEmployeeId = employeeData?.id;
  const todayShifts = (shiftsData || []).filter(s => 
    s.employeeId === myEmployeeId && isToday(parseISO(s.date))
  );
  const nextShift = todayShifts[0];
  
  const userName = userData?.user?.firstName || 
                   userData?.user?.name?.split(' ')[0] || 
                   employeeData?.firstName ||
                   'there';
  const userRole = userData?.user?.platformRole || userData?.user?.role || employeeData?.position || '';
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-primary/90 to-primary overflow-auto">
      <header className="px-4 pt-6 pb-8 text-primary-foreground">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-12 w-12 border-2 border-primary-foreground/30">
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-lg">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-lg font-semibold" data-testid="text-greeting">
              {getGreeting()}, {userName}
            </h1>
            {userRole && (
              <span className="text-sm text-primary-foreground/70">
                {userRole.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
        
        <div 
          className="flex items-center gap-2 text-sm text-primary-foreground/90"
          data-testid="text-notification-summary"
        >
          <Bell className="w-4 h-4" />
          {unreadCount === 0 
            ? "You have no unread notifications"
            : `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
          }
        </div>
      </header>
      
      <div className="flex-1 bg-background rounded-t-3xl -mt-4 overflow-auto">
        <div className="p-4 space-y-4">
          <Card 
            className="p-4 flex items-center gap-3 cursor-pointer hover-elevate"
            onClick={() => setLocation('/schedule')}
            data-testid="card-shift-status"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              {shiftsLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : nextShift ? (
                <>
                  <p className="font-medium text-sm">
                    {nextShift.client?.name || 'Shift'} at {nextShift.startTime}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nextShift.location || format(parseISO(nextShift.date), 'EEEE, MMM d')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You don't have any shifts scheduled today
                </p>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </Card>
          
          <button
            onClick={() => setLocation('/schedule')}
            className="w-full text-center py-2 text-primary text-sm font-medium"
            data-testid="link-roster"
          >
            Today's roster <ChevronRight className="inline w-4 h-4" />
          </button>
          
          {actionableCount > 0 && (
            <div className="flex items-center gap-2 py-2">
              <Badge variant="destructive" className="text-xs">
                {actionableCount} Action Required
              </Badge>
            </div>
          )}
          
          {notificationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : allNotifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allNotifications.slice(0, 20).map(notification => (
                <NotificationCard 
                  key={notification.id} 
                  notification={notification}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
