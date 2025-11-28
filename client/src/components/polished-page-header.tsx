import { Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { Link, useLocation } from "wouter";

interface PolishedPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  showAlerts?: boolean;
}

export function PolishedPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  showAlerts = true,
}: PolishedPageHeaderProps) {
  const [, setLocation] = useLocation();

  const { data: notifications } = useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => apiGet('notifications.list'),
  });

  const unreadCount = Array.isArray(notifications) 
    ? notifications.filter((n: any) => !n.isRead).length 
    : 0;

  return (
    <header className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 border-b border-slate-700/50 sticky top-0 z-40">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="flex items-center gap-1 text-sm text-slate-400 mb-1">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight size={14} className="text-slate-500" />}
                    {crumb.href ? (
                      <Link 
                        href={crumb.href}
                        className="hover:text-white transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-slate-300">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate" data-testid="text-page-title">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {actions}
            
            {showAlerts && (
              <Button
                variant="ghost"
                size="sm"
                className="relative bg-slate-700/50 hover:bg-slate-600/50 text-white border border-slate-600/50"
                onClick={() => setLocation('/notifications')}
                data-testid="button-notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1.5 text-xs font-bold"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
                <span className="ml-2 hidden sm:inline">
                  {unreadCount > 0 ? `${unreadCount} New Alert${unreadCount === 1 ? '' : 's'}` : 'Alerts'}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

interface ActivityAlertProps {
  type: 'success' | 'warning' | 'error' | 'info';
  icon?: React.ReactNode;
  title: string;
  message: string;
  time?: string;
}

export function ActivityAlert({ type, icon, title, message, time }: ActivityAlertProps) {
  const typeStyles = {
    success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  };

  const iconStyles = {
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
    info: 'text-blue-500',
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${typeStyles[type]}`}>
      {icon && (
        <div className={`shrink-0 ${iconStyles[type]}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
      </div>
      {time && (
        <span className="text-xs text-muted-foreground shrink-0">{time}</span>
      )}
    </div>
  );
}

export function GradientCard({
  children,
  className = '',
  gradient = 'teal',
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: 'teal' | 'purple' | 'orange' | 'blue';
}) {
  const gradients = {
    teal: 'from-teal-500/10 to-cyan-500/10 border-teal-500/20',
    purple: 'from-purple-500/10 to-pink-500/10 border-purple-500/20',
    orange: 'from-orange-500/10 to-amber-500/10 border-orange-500/20',
    blue: 'from-blue-500/10 to-indigo-500/10 border-blue-500/20',
  };

  return (
    <div className={`bg-gradient-to-br ${gradients[gradient]} border rounded-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ModernCard({
  children,
  className = '',
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div 
      className={`
        bg-card rounded-xl border shadow-sm
        ${hover ? 'transition-all duration-200 hover:shadow-md hover:border-primary/20' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function ModernCardHeader({
  title,
  subtitle,
  icon,
  badge,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg text-foreground">{title}</h3>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ModernCardContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

export function AIStatusBadge({
  status,
  label,
}: {
  status: 'active' | 'processing' | 'idle' | 'error';
  label?: string;
}) {
  const statusStyles = {
    active: 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white',
    processing: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white animate-pulse',
    idle: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    error: 'bg-red-500 text-white',
  };

  const statusLabels = {
    active: 'Powered by Gemini AI',
    processing: 'AI Processing...',
    idle: 'AI Ready',
    error: 'AI Error',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
      <span className="relative flex h-2 w-2">
        {status === 'active' && (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </>
        )}
        {status === 'processing' && (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white animate-pulse" />
        )}
        {status === 'idle' && (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current opacity-50" />
        )}
        {status === 'error' && (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        )}
      </span>
      {label || statusLabels[status]}
    </span>
  );
}

export function SystemHealthIndicator({
  name,
  status,
  icon,
}: {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  icon?: React.ReactNode;
}) {
  const statusStyles = {
    operational: 'text-emerald-500',
    degraded: 'text-amber-500',
    down: 'text-red-500',
  };

  const statusBg = {
    operational: 'bg-emerald-500/10',
    degraded: 'bg-amber-500/10',
    down: 'bg-red-500/10',
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      {icon && (
        <div className={`p-2 rounded-lg ${statusBg[status]}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">{name}</p>
        <p className={`text-xs capitalize ${statusStyles[status]}`}>
          {status}
        </p>
      </div>
      <div className={`h-2 w-2 rounded-full ${statusStyles[status].replace('text-', 'bg-')}`} />
    </div>
  );
}
