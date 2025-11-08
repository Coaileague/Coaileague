/**
 * Quick Actions Ribbon - Compact horizontal command menu
 * Icon-focused design for maximum space efficiency
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageSquare, Users, BarChart3, Ticket, Settings, Bell,
  Shield, UserCog, FileText, Zap, AlertCircle, TrendingUp,
  Database, Server, Globe, Activity, RefreshCw, Eye,
  Lock, Unlock, UserPlus, UserX, CheckCircle, XCircle
} from "lucide-react";
import { useLocation } from "wouter";

interface QuickAction {
  id: string;
  label: string;
  icon: any;
  path?: string;
  badge?: number;
  onClick?: () => void;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  staffOnly?: boolean;
}

const ACTION_VARIANTS = {
  default: "bg-slate-100 hover:bg-slate-200 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100",
  success: "bg-muted/50 hover:bg-muted text-foreground dark:bg-slate-900/30 dark:hover:bg-slate-900/50 dark:text-background",
  warning: "bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-100",
  danger: "bg-red-100 hover:bg-red-200 text-red-900 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-100",
  info: "bg-blue-100 hover:bg-blue-200 text-blue-900 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-100",
};

interface QuickActionsRibbonProps {
  isStaff?: boolean;
  liveData?: {
    chatUsers?: number;
    queueLength?: number;
    activeTickets?: number;
    alerts?: number;
    onlineStaff?: number;
  };
  onActionClick?: (actionId: string) => void;
}

export function QuickActionsRibbon({ 
  isStaff = false, 
  liveData = {},
  onActionClick 
}: QuickActionsRibbonProps) {
  const [, setLocation] = useLocation();

  const QUICK_ACTIONS: QuickAction[] = [
    // Support Actions
    {
      id: 'live-chat',
      label: 'Live Chat',
      icon: MessageSquare,
      path: '/helpdesk-cab',
      badge: liveData.chatUsers || 0,
      variant: liveData.chatUsers ? 'info' : 'default',
    },
    {
      id: 'support-queue',
      label: 'Queue',
      icon: Users,
      badge: liveData.queueLength || 0,
      variant: liveData.queueLength ? 'warning' : 'default',
    },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: Ticket,
      path: '/admin-support',
      badge: liveData.activeTickets || 0,
      variant: liveData.activeTickets ? 'danger' : 'default',
    },
    
    // Analytics & Monitoring
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      path: '/admin-usage',
      variant: 'default',
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: Activity,
      path: '/admin-command-center',
      variant: 'default',
    },
    
    // User Management
    {
      id: 'user-mgmt',
      label: 'Users',
      icon: UserCog,
      path: '/platform-users',
      variant: 'default',
      staffOnly: true,
    },
    {
      id: 'add-user',
      label: 'Add User',
      icon: UserPlus,
      variant: 'success',
      staffOnly: true,
    },
    
    // Account Actions
    {
      id: 'reset-pass',
      label: 'Reset PW',
      icon: RefreshCw,
      variant: 'warning',
      staffOnly: true,
    },
    {
      id: 'unlock',
      label: 'Unlock',
      icon: Unlock,
      variant: 'success',
      staffOnly: true,
    },
    {
      id: 'suspend',
      label: 'Suspend',
      icon: UserX,
      variant: 'danger',
      staffOnly: true,
    },
    
    // System
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      path: '/admin-settings',
      variant: 'default',
      staffOnly: true,
    },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: Bell,
      badge: liveData.alerts || 0,
      variant: liveData.alerts ? 'danger' : 'default',
      staffOnly: true,
    },
    {
      id: 'health',
      label: 'Health',
      icon: Shield,
      variant: 'success',
      staffOnly: true,
    },
  ];

  const handleActionClick = (action: QuickAction) => {
    if (action.path) {
      setLocation(action.path);
    }
    if (action.onClick) {
      action.onClick();
    }
    if (onActionClick) {
      onActionClick(action.id);
    }
  };

  const visibleActions = QUICK_ACTIONS.filter(action => 
    !action.staffOnly || isStaff
  );

  return (
    <TooltipProvider>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="px-4 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {/* Title */}
            <div className="flex items-center gap-2 pr-3 border-r border-slate-300 dark:border-slate-700 mr-2 flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Quick Actions
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 flex-1">
              {visibleActions.map((action, index) => (
                <div key={action.id} className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleActionClick(action)}
                        className={`h-8 px-2 gap-1.5 relative ${ACTION_VARIANTS[action.variant || 'default']}`}
                        data-testid={`quick-action-${action.id}`}
                      >
                        <action.icon className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium hidden xl:inline">
                          {action.label}
                        </span>
                        {action.badge !== undefined && action.badge > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center"
                          >
                            {action.badge > 99 ? '99+' : action.badge}
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">{action.label}</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Separator after certain groups */}
                  {(index === 2 || index === 4 || index === 6 || index === 9) && (
                    <Separator orientation="vertical" className="h-6 mx-1" />
                  )}
                </div>
              ))}
            </div>

            {/* Live Stats Indicator */}
            {isStaff && (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-300 dark:border-slate-700 ml-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-muted/30 rounded-full animate-pulse" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {liveData.onlineStaff || 0} staff
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-blue-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    Live
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
