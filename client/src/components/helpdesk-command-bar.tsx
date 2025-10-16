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
    <div className="border-b-2 border-blue-200 bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 shadow-sm" data-testid="helpdesk-command-bar">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 px-4 py-3 min-w-max">
          {/* Guest/All Users: Basic Commands */}
          <div className="flex items-center gap-2 pr-4 border-r-2 border-blue-200">
            <Button
              onClick={onShowHelp}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
              data-testid="button-show-help"
            >
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">Help</span>
            </Button>
            
            <Button
              onClick={onShowQueue}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
              data-testid="button-show-queue"
            >
              <Users className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">Queue</span>
              {queueLength > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-blue-500 text-white font-bold">
                  {queueLength}
                </Badge>
              )}
            </Button>
            
            <Button
              onClick={onShowTutorial}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
              data-testid="button-tutorial"
            >
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">Tutorial</span>
            </Button>
          </div>

          {/* Subscriber Features */}
          {canAccessSubscriberFeatures && (
            <div className="flex items-center gap-2 pr-4 border-r-2 border-blue-200">
              <Button
                onClick={() => onQuickResponse?.('/info')}
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
                data-testid="button-account-info"
              >
                <UserCog className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold">Account</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 border-amber-200 hover:bg-amber-50 hover:border-amber-300"
                data-testid="button-priority-support"
              >
                <Star className="w-4 h-4 text-amber-500" />
                <span className="font-semibold">Priority</span>
              </Button>
            </div>
          )}

          {/* Organization Features */}
          {canAccessOrgFeatures && (
            <div className="flex items-center gap-2 pr-4 border-r-2 border-blue-200">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 border-purple-200 hover:bg-purple-50 hover:border-purple-300"
                data-testid="button-org-settings"
              >
                <Building2 className="w-4 h-4 text-purple-600" />
                <span className="font-semibold">Organization</span>
              </Button>
            </div>
          )}

          {/* Staff Controls */}
          {isStaff && (
            <>
              <div className="flex items-center gap-2 pr-4 border-r-2 border-emerald-200 bg-emerald-50/30 px-3 py-1 rounded-md">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    Status:
                    {showCoffeeCup && (
                      <Coffee className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                    )}
                  </label>
                  <select
                    value={userStatus}
                    onChange={(e) => onStatusChange?.(e.target.value as any)}
                    className="h-9 px-3 border-2 border-emerald-300 rounded-md text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    data-testid="select-status"
                  >
                    <option value="online">● Available</option>
                    <option value="away">● Away</option>
                    <option value="busy">● Busy</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs font-bold text-emerald-700">Staff Online:</span>
                  <Badge variant="secondary" className="h-6 px-3 text-xs bg-emerald-600 text-white font-bold">
                    {onlineStaffCount}
                  </Badge>
                </div>
              </div>

              {/* Chat Commands */}
              <div className="flex items-center gap-2 pr-4 border-r-2 border-violet-200">
                <span className="text-xs text-violet-700 font-bold">AI:</span>
                <Button
                  onClick={() => onQuickResponse?.('/intro')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 border-violet-200 hover:bg-violet-50 hover:border-violet-300"
                  data-testid="button-intro-macro"
                >
                  <Zap className="w-4 h-4 text-violet-600" />
                  <span className="font-semibold">AI Greeting</span>
                </Button>
              </div>

              {/* Quick Responses - Using original slash commands */}
              <div className="flex items-center gap-2 pr-4 border-r-2 border-cyan-200">
                <span className="text-xs text-cyan-700 font-bold">Quick:</span>
                <Button
                  onClick={() => onQuickResponse?.('/welcome')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-cyan-200 hover:bg-cyan-50"
                  data-testid="button-welcome"
                >
                  Welcome
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/details')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-cyan-200 hover:bg-cyan-50"
                  data-testid="button-request-details"
                >
                  Details
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/screenshot')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-cyan-200 hover:bg-cyan-50"
                  data-testid="button-screenshot"
                >
                  Screenshot
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/checkaccount')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-cyan-200 hover:bg-cyan-50"
                  data-testid="button-check-account"
                >
                  Account
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/escalate')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-orange-200 hover:bg-orange-50"
                  data-testid="button-escalate"
                >
                  Escalate
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/resolved')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-green-200 hover:bg-green-50"
                  data-testid="button-resolved"
                >
                  Resolved
                </Button>
              </div>

              {/* Privacy & Room Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700 font-bold">Controls:</span>
                <Button
                  onClick={() => onQuickResponse?.('/spectate')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 border-slate-300 hover:bg-slate-100"
                  data-testid="button-spectate"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold">Spectate</span>
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/voice')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 border-slate-300 hover:bg-slate-100"
                  data-testid="button-voice"
                >
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="font-semibold">Voice</span>
                </Button>
                <Button
                  onClick={onToggleRoomStatus}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 border-slate-300 hover:bg-slate-100"
                  data-testid="button-room-status"
                >
                  <Settings className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold">Room</span>
                </Button>
                <Button
                  onClick={() => onQuickResponse?.('/close')}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 border-red-300 hover:bg-red-50 text-red-600"
                  data-testid="button-close-ticket"
                >
                  <Power className="w-4 h-4" />
                  <span className="font-bold">Close</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
