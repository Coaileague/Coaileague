import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle,
  Users,
  Settings,
  MessageSquare,
  Zap,
  Shield,
  Clock,
  AlertCircle,
  Building2,
  UserCog,
  Star,
  Coffee,
  CheckCircle,
  Power,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HelpDeskCommandBarProps {
  // User info
  userRole: 'guest' | 'subscriber' | 'org_user' | 'staff';
  isStaff: boolean;
  
  // Status & Queue
  userStatus?: 'online' | 'away' | 'busy';
  onStatusChange?: (status: 'online' | 'away' | 'busy') => void;
  queueLength?: number;
  onlineStaffCount?: number;
  showCoffeeCup?: boolean;
  
  // Actions
  onShowHelp?: () => void;
  onShowQueue?: () => void;
  onShowTutorial?: () => void;
  onToggleRoomStatus?: () => void;
  onQuickResponse?: (command: string) => void;
  
  // Data
  roomStatus?: 'open' | 'closed' | 'maintenance';
}

export function HelpDeskCommandBar({
  userRole,
  isStaff,
  userStatus = 'online',
  onStatusChange,
  queueLength = 0,
  onlineStaffCount = 0,
  showCoffeeCup = false,
  onShowHelp,
  onShowQueue,
  onShowTutorial,
  onToggleRoomStatus,
  onQuickResponse,
  roomStatus = 'open',
}: HelpDeskCommandBarProps) {
  
  // Role hierarchy: guest < subscriber < org_user < staff
  const canAccessSubscriberFeatures = ['subscriber', 'org_user', 'staff'].includes(userRole);
  const canAccessOrgFeatures = ['org_user', 'staff'].includes(userRole);
  
  return (
    <div className="border-b border-slate-300 bg-white/95 backdrop-blur-sm" data-testid="helpdesk-command-bar">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 px-3 py-2 min-w-max">
          {/* Guest/All Users: Basic Commands */}
          <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
            <Button
              onClick={onShowHelp}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              data-testid="button-show-help"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help
            </Button>
            
            <Button
              onClick={onShowQueue}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              data-testid="button-show-queue"
            >
              <Users className="w-3.5 h-3.5" />
              Queue
              {queueLength > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-blue-100 text-blue-800">
                  {queueLength}
                </Badge>
              )}
            </Button>
            
            <Button
              onClick={onShowTutorial}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              data-testid="button-tutorial"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Tutorial
            </Button>
          </div>

          {/* Subscriber Features */}
          {canAccessSubscriberFeatures && (
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
              <Button
                onClick={() => onQuickResponse?.('/info')}
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                data-testid="button-account-info"
              >
                <UserCog className="w-3.5 h-3.5" />
                Account
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                data-testid="button-priority-support"
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                Priority
              </Button>
            </div>
          )}

          {/* Organization Features */}
          {canAccessOrgFeatures && (
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                data-testid="button-org-settings"
              >
                <Building2 className="w-3.5 h-3.5" />
                Organization
              </Button>
            </div>
          )}

          {/* Staff Controls */}
          {isStaff && (
            <>
              <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    Status:
                    {showCoffeeCup && (
                      <Coffee className="w-3 h-3 text-amber-600 animate-bounce" />
                    )}
                  </label>
                  <select
                    value={userStatus}
                    onChange={(e) => onStatusChange?.(e.target.value as any)}
                    className="h-8 px-2 border border-slate-300 rounded text-xs bg-white focus:ring-blue-500 focus:border-blue-500"
                    data-testid="select-status"
                  >
                    <option value="online">● Available</option>
                    <option value="away">● Away</option>
                    <option value="busy">● Busy</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-slate-600">Staff:</span>
                  <Badge variant="secondary" className="h-5 px-2 text-xs bg-blue-100 text-blue-800">
                    {onlineStaffCount}
                  </Badge>
                </div>
              </div>

              {/* Chat Commands */}
              <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
                <span className="text-xs text-slate-500 font-medium">Commands:</span>
                <Button
                  onClick={() => onQuickResponse?.('/intro')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  data-testid="button-intro-macro"
                >
                  <Zap className="w-3.5 h-3.5" />
                  AI Greeting
                </Button>
              </div>

              {/* Quick Responses - Using original slash commands */}
              <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
                <span className="text-xs text-slate-500 font-medium">Quick:</span>
                <Button
                  onClick={() => onQuickResponse?.('/welcome')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-welcome"
                >
                  Welcome
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/details')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-request-details"
                >
                  Details
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/screenshot')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-screenshot"
                >
                  Screenshot
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/checkaccount')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-check-account"
                >
                  Check Account
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/escalate')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-escalate"
                >
                  Escalate
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/resolved')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="button-resolved"
                >
                  Resolved
                </Button>
              </div>

              {/* Privacy & Room Controls */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium">Controls:</span>
                <Button
                  onClick={() => onQuickResponse?.('/spectate')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  data-testid="button-spectate"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Spectate
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/voice')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  data-testid="button-voice"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Voice
                </Button>
                <Button
                  onClick={onToggleRoomStatus}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  data-testid="button-room-status"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Room
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/close')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-red-600 border-red-300"
                  data-testid="button-close-ticket"
                >
                  <Power className="w-3.5 h-3.5" />
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
