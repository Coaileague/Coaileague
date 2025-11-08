import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight,
  Bell, Trash2, CheckCircle, XCircle, AlertCircle, Mail
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { useTransition } from "@/contexts/transition-context";
import { MobileLoading } from "@/components/mobile-loading";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: 'shift_assigned' | 'shift_changed' | 'shift_removed' | 'pto_approved' | 'pto_denied' | 'profile_updated' | 'document_assigned' | 'policy_acknowledgment' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  actionUrl?: string;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showTransition, hideTransition } = useTransition();
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Get current user and workspace
  const { data: currentUser } = useQuery<{ id: string; email?: string }>({ 
    queryKey: ['/api/auth/me'] 
  });
  const userId = currentUser?.id;
  
  const { data: workspace } = useQuery<{ id: string; name?: string }>({ 
    queryKey: ['/api/workspace'] 
  });
  const workspaceId = workspace?.id;

  // Connect to notification WebSocket for real-time updates
  const { unreadCount: wsUnreadCount, isConnected } = useNotificationWebSocket(userId, workspaceId);

  // Fetch notifications
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: isAuthenticated,
  });

  // Fetch workspace stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  // Fetch employees to determine user's workspace role
  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: isAuthenticated,
  });

  // Determine current user's workspace role
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'staff';

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}/read`, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Delete notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/notifications/mark-all-read', 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Show loading transition on mount
  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Loading Dashboard...",
      submessage: "Preparing your workspace",
      duration: 1500,
      onComplete: hideTransition
    });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return <MobileLoading fullScreen message="Loading Dashboard..." />;
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = (stats as any)?.totalEmployees || 0;
  const activeToday = (stats as any)?.activeToday || 0;
  const totalRevenue = (stats as any)?.totalRevenue || 0;

  // Use WebSocket unread count if available
  const unreadCount = isConnected && wsUnreadCount !== undefined 
    ? wsUnreadCount 
    : notifications.filter((n) => !n.isRead).length;

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (notificationFilter === 'unread') return !n.isRead;
    if (notificationFilter === 'read') return n.isRead;
    return true;
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'shift_assigned':
      case 'shift_changed':
        return <Calendar className="h-5 w-5 text-blue-400" />;
      case 'shift_removed':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'pto_approved':
        return <CheckCircle className="h-5 w-5 text-emerald-400" />;
      case 'pto_denied':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'profile_updated':
        return <Users className="h-5 w-5 text-teal-400" />;
      case 'document_assigned':
        return <FileText className="h-5 w-5 text-emerald-400" />;
      case 'policy_acknowledgment':
        return <AlertCircle className="h-5 w-5 text-amber-400" />;
      case 'system':
        return <Bell className="h-5 w-5 text-green-400" />;
      default:
        return <Mail className="h-5 w-5 text-gray-400" />;
    }
  };

  const getNotificationTypeBadge = (type: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      shift_assigned: { label: 'Shift', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
      shift_changed: { label: 'Schedule', className: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
      shift_removed: { label: 'Shift', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
      pto_approved: { label: 'PTO', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
      pto_denied: { label: 'PTO', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
      profile_updated: { label: 'Profile', className: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
      document_assigned: { label: 'Document', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
      policy_acknowledgment: { label: 'Policy', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
      system: { label: 'System', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
    };
    const badge = badges[type] || { label: 'Info', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
    return <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-teal-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Branded Header with Logo */}
        <div className="mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="transform hover:scale-105 transition-transform duration-300">
                <AutoForceLogo variant="full" size="md" />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-emerald-100 to-green-200 bg-clip-text text-transparent mb-1 break-words" data-testid="text-welcome">
                  Welcome back, {firstName}
                </h2>
                <p className="text-slate-300 text-sm sm:text-base">
                  {workspaceRole === 'org_owner' ? '🎯 Manage your entire workforce with AutoForce™' : 
                   workspaceRole === 'department_manager' ? '📊 Oversee your team performance' :
                   '⏰ Track your time and tasks'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid - Animated Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Total Employees Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-4" data-testid="card-employees">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Total Employees</p>
            <p className="text-4xl font-bold text-white">{totalEmployees}</p>
          </div>

          {/* Active Today Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-teal-500/10 to-emerald-500/5 border border-teal-500/20 rounded-2xl p-6 hover:border-teal-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/20 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0.1s' }} data-testid="card-active">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-teal-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-teal-400 animate-pulse" />
              </div>
              <div className="h-2 w-2 bg-teal-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Active Today</p>
            <p className="text-4xl font-bold text-white">{activeToday}</p>
          </div>

          {/* Revenue Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0.2s' }} data-testid="card-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Total Revenue</p>
            <p className="text-4xl font-bold text-white">${(totalRevenue / 1000).toFixed(1)}K</p>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link href="/employees">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300 group" data-testid="button-manage-employees">
              <div className="p-3 bg-emerald-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-emerald-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Manage Employees</h4>
              <p className="text-sm text-slate-400 mb-3">View and edit employee records</p>
              <div className="flex items-center text-emerald-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                View all <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/schedule">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-green-500/30 transition-all duration-300 group" data-testid="button-schedule">
              <div className="p-3 bg-green-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="w-8 h-8 text-green-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Schedule</h4>
              <p className="text-sm text-slate-400 mb-3">Manage shifts and assignments</p>
              <div className="flex items-center text-green-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Open <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/time-tracking">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-teal-500/30 transition-all duration-300 group" data-testid="button-time-tracking">
              <div className="p-3 bg-teal-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Clock className="w-8 h-8 text-teal-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Time Tracking</h4>
              <p className="text-sm text-slate-400 mb-3">Review and approve time entries</p>
              <div className="flex items-center text-teal-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Review <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/invoices">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300 group" data-testid="button-invoices">
              <div className="p-3 bg-emerald-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-8 h-8 text-emerald-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Invoices</h4>
              <p className="text-sm text-slate-400 mb-3">Generate and send invoices</p>
              <div className="flex items-center text-emerald-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Create <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>
        </div>

        {/* Notification Center Section */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0.3s' }}>
          {/* Notification Center Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <Bell className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  Notification Center
                  {isConnected && (
                    <span className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse" title="Live updates active" />
                  )}
                </h3>
                <p className="text-sm text-slate-400">
                  Stay updated on your shifts, PTO, and important platform changes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Unread:</span>
              <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm font-bold text-white bg-emerald-500 rounded-full shadow-lg">
                {unreadCount}
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <Button
              variant={notificationFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('all')}
              className={notificationFilter === 'all' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              data-testid="button-filter-all"
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={notificationFilter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('unread')}
              className={notificationFilter === 'unread' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              data-testid="button-filter-unread"
            >
              Unread ({unreadCount})
            </Button>
            <Button
              variant={notificationFilter === 'read' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNotificationFilter('read')}
              className={notificationFilter === 'read' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              data-testid="button-filter-read"
            >
              Read ({notifications.length - unreadCount})
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                className="ml-auto text-emerald-400 hover:text-emerald-300"
                data-testid="button-mark-all-read"
              >
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notification Table */}
          <div className="overflow-x-auto">
            {notificationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
                <span className="ml-3 text-slate-400">Loading notifications...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Bell className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-semibold">All caught up!</p>
                <p className="text-sm mt-1">
                  {notificationFilter === 'unread' 
                    ? 'You have no unread notifications.' 
                    : notificationFilter === 'read'
                    ? 'You have no read notifications.'
                    : 'You have no notifications yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`backdrop-blur-xl border rounded-2xl p-4 transition-all duration-300 hover:scale-[1.01] ${
                      notification.isRead
                        ? 'bg-white/5 border-white/10'
                        : 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                    }`}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="mt-1 shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-white text-sm">
                              {notification.title}
                            </h4>
                            {getNotificationTypeBadge(notification.type)}
                          </div>
                          {!notification.isRead && (
                            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mb-2 break-words">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          className={`h-9 w-9 p-0 ${
                            notification.isRead
                              ? 'text-slate-400 hover:text-emerald-400'
                              : 'text-emerald-400 hover:text-emerald-300'
                          }`}
                          title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
                          data-testid={`button-toggle-read-${notification.id}`}
                        >
                          <CheckCircle className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotificationMutation.mutate(notification.id)}
                          className="h-9 w-9 p-0 text-slate-400 hover:text-red-400"
                          title="Delete notification"
                          data-testid={`button-delete-${notification.id}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
