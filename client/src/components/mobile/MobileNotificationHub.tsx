import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, ChevronRight, Check, X, Wrench, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, startOfDay, endOfDay, parseISO, isToday } from "date-fns";

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
}

function NotificationRow({ 
  notification, 
  onAction 
}: { 
  notification: UserNotification; 
  onAction: (action: string, id: string, data?: any) => void;
}) {
  const { actionType, actionData, id } = notification;
  const hasAction = actionType && actionType !== '';
  const initials = notification.title?.substring(0, 2).toUpperCase() || 'N';
  
  return (
    <div 
      className="flex items-start gap-3 px-4 py-3 border-b border-border/50"
      data-testid={`notification-row-${notification.id}`}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarFallback className="bg-muted text-muted-foreground text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2">
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: false })}
        </p>
        
        {hasAction && (
          <div className="flex gap-2 mt-2">
            {(actionType === 'shift_request' || actionType === 'swap_request') && (
              <>
                <Button 
                  size="sm" 
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onAction('approve', id, actionData)}
                  data-testid={`button-approve-${id}`}
                >
                  <Check className="w-3 h-3 mr-1" />
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-8 px-3 border-red-500/50 text-red-500"
                  onClick={() => onAction('deny', id, actionData)}
                  data-testid={`button-deny-${id}`}
                >
                  <X className="w-3 h-3 mr-1" />
                  Deny
                </Button>
              </>
            )}
            {actionType === 'acknowledge' && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8 px-3"
                onClick={() => onAction('acknowledge', id)}
                data-testid={`button-acknowledge-${id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Acknowledge
              </Button>
            )}
            {(actionType === 'hotpatch' || actionType === 'trinity_fix') && (
              <>
                <Button 
                  size="sm" 
                  className="h-8 px-3 bg-purple-600 hover:bg-purple-700"
                  onClick={() => onAction('run_hotpatch', id, actionData)}
                  data-testid={`button-hotpatch-${id}`}
                >
                  <Wrench className="w-3 h-3 mr-1" />
                  Run Fix
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-8 px-3"
                  onClick={() => onAction('dismiss', id)}
                  data-testid={`button-dismiss-${id}`}
                >
                  Dismiss
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
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
  
  const myEmployeeId = employeeData?.id;
  const todayShifts = (shiftsData || []).filter(s => 
    s.employeeId === myEmployeeId && isToday(parseISO(s.date))
  );
  const nextShift = todayShifts[0];

  const userName = userData?.user?.firstName || 
                   userData?.user?.name?.split(' ')[0] || 
                   employeeData?.firstName ||
                   '';
  const userRole = userData?.user?.platformRole || userData?.user?.role || employeeData?.position || '';
  
  const displayName = userRole && userName 
    ? `(${userRole.replace(/_/g, ' ')}) ${userName}`
    : userName || 'User';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="bg-[#0095FF] text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <Avatar className="h-10 w-10 border-2 border-white/30">
            <AvatarImage src={userData?.user?.avatar} />
            <AvatarFallback className="bg-white/20 text-white">
              {(userName || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <button className="p-2" data-testid="button-menu">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="10" cy="4" r="2"/>
              <circle cx="10" cy="10" r="2"/>
              <circle cx="10" cy="16" r="2"/>
            </svg>
          </button>
        </div>
        
        <div className="px-4 pb-2">
          <h1 className="text-xl font-semibold" data-testid="text-greeting">
            {greeting} {displayName}
          </h1>
          <p className="text-sm text-white/80 mt-1" data-testid="text-notification-summary">
            {unreadCount === 0 
              ? "You have no unread notifications"
              : `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        
        <div 
          className="mx-4 mb-4 px-4 py-3 bg-[#0077CC] rounded-lg flex items-center gap-3 cursor-pointer min-h-[48px]"
          onClick={() => setLocation('/schedule')}
          data-testid="card-shift-status"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-white/10">
            <Calendar className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">
            {shiftsLoading ? (
              "Loading..."
            ) : nextShift ? (
              `${nextShift.client?.name || 'Shift'} at ${nextShift.startTime}`
            ) : (
              "You don't have any shifts scheduled"
            )}
          </span>
        </div>
      </div>
      
      <button
        onClick={() => setLocation('/schedule')}
        className="w-full py-3 text-center text-[#0095FF] text-sm font-medium border-b border-border min-h-[44px]"
        data-testid="link-roster"
      >
        Today's roster<ChevronRight className="inline w-4 h-4 ml-0.5" />
      </button>
      
      <div className="flex-1 overflow-auto bg-background">
        {notificationsLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : allNotifications.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div>
            {allNotifications.slice(0, 30).map(notification => (
              <NotificationRow 
                key={notification.id} 
                notification={notification}
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
