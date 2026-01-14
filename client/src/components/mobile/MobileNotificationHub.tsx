import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, ChevronRight, Check, X, Wrench, CheckCircle2, Bell, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

function NotificationCard({ 
  notification, 
  onAction 
}: { 
  notification: UserNotification; 
  onAction: (action: string, id: string, data?: any) => void;
}) {
  const { actionType, actionData, id } = notification;
  const hasAction = actionType && actionType !== '';
  const isUrgent = notification.priority === 'high' || notification.priority === 'urgent';
  
  return (
    <Card 
      className={`p-3 ${isUrgent ? 'border-l-2 border-l-amber-500' : ''}`}
      data-testid={`notification-card-${notification.id}`}
    >
      <div className="flex items-start gap-2">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUrgent ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
          <Bell className={`w-4 h-4 ${isUrgent ? 'text-amber-600' : 'text-blue-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground truncate flex-1">
              {notification.title}
            </p>
            <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: false })}
            </span>
          </div>
          
          {hasAction && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(actionType === 'shift_request' || actionType === 'swap_request') && (
                <>
                  <Button 
                    size="sm" 
                    className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => onAction('approve', id, actionData)}
                    data-testid={`button-approve-${id}`}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Approve
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-7 px-2 text-xs border-red-500/50 text-red-500"
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
                  className="h-7 px-2 text-xs"
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
                    className="h-7 px-2 text-xs bg-purple-600 hover:bg-purple-700"
                    onClick={() => onAction('run_hotpatch', id, actionData)}
                    data-testid={`button-hotpatch-${id}`}
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Fix
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-7 px-2 text-xs"
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
    </Card>
  );
}

export function MobileNotificationHub() {
  const [, setLocation] = useLocation();
  
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
  
  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="bg-[#0095FF] px-3 py-3">
        <div className="flex items-center gap-2 text-white text-sm">
          <Bell className="w-4 h-4" />
          <span>
            {unreadCount === 0 
              ? "You have no unread notifications"
              : `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            }
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto px-3 py-3 pb-24 space-y-3">
        <Card 
          className="p-3 flex items-center gap-3 cursor-pointer"
          onClick={() => setLocation('/schedule')}
          data-testid="card-shift-status"
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            {shiftsLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : nextShift ? (
              <p className="text-sm text-foreground truncate">
                {nextShift.client?.name || 'Shift'} at {nextShift.startTime}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You don't have any shifts scheduled today
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </Card>
        
        <button
          onClick={() => setLocation('/schedule')}
          className="w-full py-2 text-center text-[#0095FF] text-sm font-medium min-h-[44px]"
          data-testid="link-roster"
        >
          Today's roster <ChevronRight className="inline w-4 h-4" />
        </button>
        
        {notificationsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-3">
                <div className="flex gap-2">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : allNotifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allNotifications.slice(0, 30).map(notification => (
              <NotificationCard 
                key={notification.id} 
                notification={notification}
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </div>
      
      <button
        onClick={() => setLocation('/trinity-insights')}
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-[#0095FF] text-white shadow-lg flex items-center justify-center z-50"
        data-testid="button-quick-action"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
