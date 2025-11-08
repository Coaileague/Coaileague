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
  Bot,
  BotOff,
  ChevronDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
  onShowPriority?: () => void;
  onShowAccount?: () => void;
  onToggleRoomStatus?: () => void;
  onToggleAI?: () => void;
  aiEnabled?: boolean;
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
  onShowPriority,
  onShowAccount,
  onToggleRoomStatus,
  onToggleAI,
  aiEnabled = false,
  onQuickResponse,
  roomStatus = 'open',
}: HelpDeskCommandBarProps) {
  
  // Role hierarchy: guest < subscriber < org_user < staff
  const canAccessSubscriberFeatures = ['subscriber', 'org_user', 'staff'].includes(userRole);
  const canAccessOrgFeatures = ['org_user', 'staff'].includes(userRole);
  
  return (
    <div className="border-b-2 border-slate-300 bg-slate-100 shadow-sm" data-testid="helpdesk-command-bar">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
          {/* Guest/All Users: Basic Commands */}
          <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
            <Button
              onClick={onShowHelp}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
              data-testid="button-show-help"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help</span>
            </Button>
            
            <Button
              onClick={onShowQueue}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
              data-testid="button-show-queue"
            >
              <Users className="w-4 h-4" />
              <span>Queue</span>
              {queueLength > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-blue-600 text-white font-bold">
                  {queueLength}
                </Badge>
              )}
            </Button>
            
            <Button
              onClick={onShowTutorial}
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
              data-testid="button-tutorial"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Tutorial</span>
            </Button>
          </div>

          {/* Subscriber Features */}
          {canAccessSubscriberFeatures && (
            <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
              <Button
                onClick={onShowAccount}
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
                data-testid="button-account-info"
              >
                <UserCog className="w-4 h-4" />
                <span>Account</span>
              </Button>
              
              <Button
                onClick={onShowPriority}
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 bg-amber-50 border-amber-500 text-amber-900 font-semibold hover:bg-amber-100"
                data-testid="button-priority-support"
              >
                <Star className="w-4 h-4" />
                <span>Priority</span>
              </Button>
            </div>
          )}

          {/* Organization Features */}
          {canAccessOrgFeatures && (
            <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-2 bg-purple-50 border-purple-500 text-purple-900 font-semibold hover:bg-purple-100"
                data-testid="button-org-settings"
              >
                <Building2 className="w-4 h-4" />
                <span>Organization</span>
              </Button>
            </div>
          )}

          {/* Staff Controls */}
          {isStaff && (
            <>
              <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300 bg-muted/50 px-3 py-1 rounded-md">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1">
                    Status:
                    {showCoffeeCup && (
                      <Coffee className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                    )}
                  </label>
                  <select
                    value={userStatus}
                    onChange={(e) => onStatusChange?.(e.target.value as any)}
                    className="h-9 px-3 border-2 border-primary rounded-md text-xs font-semibold bg-white text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    data-testid="select-status"
                  >
                    <option value="online">● Available</option>
                    <option value="away">● Away</option>
                    <option value="busy">● Busy</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs font-bold text-foreground">Staff Online:</span>
                  <Badge variant="secondary" className="h-6 px-3 text-xs bg-primary text-white font-bold">
                    {onlineStaffCount}
                  </Badge>
                </div>
              </div>

              {/* HelpOS™ AI Toggle */}
              <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
                <span className="text-xs text-slate-900 font-bold">HelpOS™ AI:</span>
                <Button
                  onClick={onToggleAI}
                  variant="outline"
                  size="sm"
                  className={`h-9 text-xs gap-2 font-semibold transition-all ${
                    aiEnabled 
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 border-violet-400 text-white hover:from-violet-600 hover:to-purple-700' 
                      : 'bg-slate-50 border-slate-400 text-slate-600 hover:bg-slate-100'
                  }`}
                  data-testid="button-toggle-ai"
                >
                  {aiEnabled ? (
                    <>
                      <Bot className="w-4 h-4 animate-pulse" />
                      <span>AI ON</span>
                      <Badge variant="secondary" className="h-5 px-2 text-xs bg-white/20 text-white font-bold">
                        Client-Pays
                      </Badge>
                    </>
                  ) : (
                    <>
                      <BotOff className="w-4 h-4" />
                      <span>AI OFF</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Quick Actions - Dropdown Menu */}
              <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
                      data-testid="button-quick-actions"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Quick Actions</span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/welcome')} data-testid="menu-welcome">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Welcome
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/details')} data-testid="menu-details">
                      <HelpCircle className="w-4 h-4 mr-2" />
                      Request Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/screenshot')} data-testid="menu-screenshot">
                      <Settings className="w-4 h-4 mr-2" />
                      Request Screenshot
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/checkaccount')} data-testid="menu-account">
                      <UserCog className="w-4 h-4 mr-2" />
                      Check Account
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/escalate')} className="text-orange-700" data-testid="menu-escalate">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Escalate Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/resolved')} className="text-green-700" data-testid="menu-resolved">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark Resolved
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Controls - Dropdown Menu */}
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs gap-2 bg-white border-slate-400 text-slate-900 font-semibold hover:bg-slate-50"
                      data-testid="button-controls"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Controls</span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/spectate')} data-testid="menu-spectate">
                      <AlertCircle className="w-4 h-4 mr-2 text-amber-600" />
                      Silence User
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/voice')} data-testid="menu-voice">
                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                      Grant Voice
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onToggleRoomStatus} data-testid="menu-room">
                      <Settings className="w-4 h-4 mr-2 text-blue-600" />
                      Room Status
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onQuickResponse?.('/close')} className="text-red-700 font-semibold" data-testid="menu-close">
                      <Power className="w-4 h-4 mr-2" />
                      Close Ticket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
