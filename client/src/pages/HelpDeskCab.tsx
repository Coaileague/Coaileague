import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Send, Users, MessageSquare, Shield, Crown, UserCog, Wrench,
  Settings, Power, HelpCircle, Zap, Clock, AlertCircle, CheckCircle,
  ChevronLeft, ChevronRight, Info, Coffee, Star, Building2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ChatMessage } from "@shared/schema";

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

// Desktop IRC/MSN-style 3-column chatroom
export default function HelpDeskCab() {
  const { user, isAuthenticated } = useAuth();
  const [inputMessage, setInputMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<"online" | "away" | "busy">("online");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [showCoffeeCup, setShowCoffeeCup] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // IRC-style MOTD and helpful info banners
  const infoBanners = [
    "*** irc.wfos.com - WorkforceOS Support Network - 24/7 Support Available ***",
    "*** Queue Position: You are #1 in line - Estimated wait: 2-3 minutes ***",
    "*** Commands: /help /motd /info /queue /staff - Type /help for full list ***",
    "*** Tip: Describe your issue clearly and staff will assist you shortly ***",
    "*** FAQ: Password reset via /resetpass | Account issues: mention 'account' ***",
    "*** HelpOS™ AI is monitoring - Urgent issues are auto-prioritized ***"
  ];

  // IRC-style system messages
  const [ircMessages, setIrcMessages] = useState<string[]>([
    "*** Connecting to irc.wfos.com (WorkforceOS Support Network)",
    "*** Connected to server irc.wfos.com",
    `*** Message of the Day - irc.wfos.com`,
    "*** =====================================================",
    "*** Welcome to WorkforceOS HelpDesk Support Network",
    "*** Your satisfaction is our priority - 24/7/365",
    "*** Type /help for available commands",
    "*** Type /staff to see online support agents",
    "*** Type /queue to check your position",
    "*** =====================================================",
    `*** End of MOTD - You are now in #HelpDesk`,
  ]);

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';

  const { messages, isConnected, sendMessage, sendTyping, sendStatusChange, onlineUsers } = useChatroomWebSocket(user?.id, userName);

  const { data: roomData } = useQuery({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: isAuthenticated,
  });

  const { data: queueData } = useQuery<any[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const uniqueUsers = onlineUsers.map(u => ({
    ...u,
    avatar: null,
    isOnline: true,
  }));

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Rotate info banners every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % infoBanners.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [infoBanners.length]);

  const handleSendMessage = () => {
    if (inputMessage.trim() && isConnected) {
      sendMessage(inputMessage, userName, 'support');
      setInputMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCommand = (command: string) => {
    setInputMessage(command);
  };

  const handleMention = (userName: string) => {
    setInputMessage(prev => prev + `@${userName} `);
  };

  // Handle status change with coffee cup animation
  const handleStatusChange = (newStatus: "online" | "away" | "busy") => {
    setUserStatus(newStatus);
    setShowCoffeeCup(true);
    sendStatusChange(newStatus);
    
    // Hide coffee cup after animation
    setTimeout(() => setShowCoffeeCup(false), 2000);
  };

  // Get user type icon
  const getUserTypeIcon = (userType: string, role: string) => {
    // Staff gets logo (using Crown for now - can be replaced with actual logo)
    if (['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      return <Crown className="w-3.5 h-3.5 text-blue-500" />;
    }
    
    // Based on user type
    switch (userType) {
      case 'subscriber': return <Star className="w-3.5 h-3.5 text-amber-500" />;
      case 'org_user': return <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />;
      case 'guest': return <HelpCircle className="w-3.5 h-3.5 text-slate-400" />;
      default: return <HelpCircle className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Get status indicator
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online': return <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />;
      case 'away': return <div className="w-2 h-2 bg-yellow-500 rounded-full" />;
      case 'busy': return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      default: return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'bot': return <MessageSquare className="w-3 h-3 text-purple-400 animate-pulse" />;
      case 'platform_admin': return <Crown className="w-3 h-3 text-yellow-400" />;
      case 'deputy_admin': return <Shield className="w-3 h-3 text-blue-400" />;
      case 'deputy_assistant': return <UserCog className="w-3 h-3 text-purple-400" />;
      case 'sysop': return <Wrench className="w-3 h-3 text-cyan-400" />;
      default: return null;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'bot': return 'text-purple-400';
      case 'platform_admin': return 'text-yellow-400';
      case 'deputy_admin': return 'text-blue-400';
      case 'deputy_assistant': return 'text-purple-400';
      case 'sysop': return 'text-cyan-400';
      default: return 'text-slate-400';
    }
  };

  const isStaff = user && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes((user as any).platformRole);
  const queueLength = queueData?.length || 0;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* MSN-style Gradient Header */}
      <header className="bg-gradient-to-r from-indigo-600 via-blue-500 to-blue-700 p-3 text-white shadow-lg">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-white hover:bg-white/20 h-8 w-8"
              data-testid="button-toggle-sidebar"
            >
              {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </Button>
            <h1 className="text-2xl font-black tracking-wide flex items-center">
              <MessageSquare className="w-6 h-6 mr-2 text-amber-300" />
              HelpDesk
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold font-mono">irc.wfos.com #HelpDesk</span>
            {isConnected && (
              <div className="flex items-center gap-1 text-xs bg-green-500/20 px-2 py-1 rounded">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Connected
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout with Collapsible Sidebar */}
      <main className="flex flex-grow overflow-hidden max-w-7xl mx-auto w-full border-x border-gray-300">
        
        {/* LEFT COLUMN: Options/Settings (Collapsible) */}
        {!sidebarCollapsed && (
          <section className="w-48 bg-white border-r border-gray-200 flex flex-col p-3 overflow-y-auto transition-all">
          <h2 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b flex items-center">
            <Settings className="w-4 h-4 mr-2 text-indigo-500" />
            Staff Controls
          </h2>

          <div className="space-y-3">
            {/* User Status */}
            <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <label className="block text-xs font-medium text-indigo-700 mb-1 flex items-center gap-1">
                Your Status
                {showCoffeeCup && (
                  <Coffee className="w-3 h-3 text-amber-600 animate-bounce" />
                )}
              </label>
              <select 
                value={userStatus} 
                onChange={(e) => handleStatusChange(e.target.value as any)}
                className="w-full p-1.5 border border-indigo-300 rounded text-xs bg-white focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="select-status"
              >
                <option value="online">● Available</option>
                <option value="away">● Away</option>
                <option value="busy">● Busy</option>
              </select>
            </div>

            {/* Queue Info */}
            <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Support Queue</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">In Queue:</span>
                  <Badge variant="secondary" className="text-xs">{queueLength}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Online Staff:</span>
                  <Badge variant="secondary" className="text-xs">{uniqueUsers.filter(u => ['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}</Badge>
                </div>
              </div>
            </div>

            {/* Quick Actions for Staff */}
            {isStaff && (
              <>
                <div className="pt-3 border-t border-gray-200 space-y-1.5">
                  <Button 
                    onClick={() => handleCommand('/intro')}
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700 text-xs h-8"
                    data-testid="button-intro"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    <span className="truncate">AI Intro</span>
                  </Button>
                  <Button 
                    onClick={() => handleCommand('/help')}
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8"
                    data-testid="button-help"
                  >
                    <HelpCircle className="w-3 h-3 mr-1" />
                    <span className="truncate">Commands</span>
                  </Button>
                  <Button 
                    onClick={() => handleCommand('/queue')}
                    size="sm"
                    className="w-full bg-purple-600 hover:bg-purple-700 text-xs h-8"
                    data-testid="button-queue"
                  >
                    <Users className="w-3 h-3 mr-1" />
                    <span className="truncate">Queue</span>
                  </Button>
                </div>

                {/* Quick Response Templates for Agents */}
                <div className="pt-3 border-t border-gray-200">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Quick Responses</h3>
                  <div className="space-y-1">
                    <Button 
                      onClick={() => setInputMessage("Hello! I'm here to help. Can you describe your issue?")}
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 justify-start"
                    >
                      Greeting
                    </Button>
                    <Button 
                      onClick={() => setInputMessage("I've escalated this to our technical team. You'll receive an update within 24 hours.")}
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 justify-start"
                    >
                      Escalate
                    </Button>
                    <Button 
                      onClick={() => setInputMessage("Your issue has been resolved. Is there anything else I can help you with?")}
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 justify-start"
                    >
                      Resolved
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Client Help Panel */}
            {!isStaff && (
              <div className="pt-3 border-t border-gray-200">
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Need Help?</h3>
                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="font-semibold text-blue-700">Your Position</div>
                    <div className="text-blue-600">#1 in queue</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <div className="font-semibold text-green-700">Est. Wait Time</div>
                    <div className="text-green-600">2-3 minutes</div>
                  </div>
                  <div className="p-2 bg-purple-50 rounded border border-purple-200">
                    <div className="font-semibold text-purple-700">Quick Commands</div>
                    <div className="text-purple-600">/help /queue /staff</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        {/* CENTER COLUMN: Chat Messages */}
        <section className="flex flex-col flex-grow bg-white">
          {/* Rotating Info Banner */}
          <div className="bg-blue-50 border-b border-blue-200 p-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div className="text-sm text-blue-800 animate-fade-in">
              {infoBanners[currentBannerIndex]}
            </div>
          </div>

          {/* Messages Container */}
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-2">
              {/* IRC MOTD Messages */}
              {ircMessages.map((ircMsg, idx) => (
                <div key={`irc-${idx}`} className="text-xs font-mono text-purple-600">
                  {ircMsg}
                </div>
              ))}

              {/* User Join Messages */}
              <div className="text-xs font-mono text-green-600">
                *** {userName} (~{user?.email?.split('@')[0]}@wfos.client) has joined #HelpDesk
              </div>

              {messages.map((msg, idx) => {
                const isSystem = msg.senderType === 'system';
                const isBot = msg.senderType === 'bot';
                const isSelf = msg.senderId === user?.id;
                const role = (msg as any).userRole || 'user';

                if (isSystem) {
                  return (
                    <div key={idx} className="text-xs font-mono text-red-600">
                      *** [{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '00:00'}] 
                      <span className="font-bold ml-1">irc.wfos.com</span>: {msg.message}
                    </div>
                  );
                }

                if (isSelf) {
                  return (
                    <div key={idx} className="flex justify-end">
                      <div className="bg-emerald-50 border-r-4 border-emerald-400 p-2 rounded-lg max-w-[80%]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-emerald-700 text-sm">You</span>
                          {getRoleIcon(role)}
                        </div>
                        <p className="text-gray-800 text-sm">{msg.message}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded-lg max-w-[80%]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-bold text-sm ${getRoleColor(role)}`}>{msg.senderName || 'User'}</span>
                      {getRoleIcon(role)}
                    </div>
                    <p className="text-gray-800 text-sm">{msg.message}</p>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t-2 border-gray-200 bg-gray-50 p-4">
            <div className="flex items-end gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message here..."
                disabled={!isConnected}
                className="flex-grow p-3 border border-gray-300 rounded-lg resize-none focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected || !inputMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:shadow-lg transition-all h-full"
                data-testid="button-send"
              >
                Send <Send className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
              <span><Clock className="w-3 h-3 inline mr-1" />Enter to send</span>
              <span>{isConnected ? <CheckCircle className="w-3 h-3 inline mr-1 text-green-500" /> : <AlertCircle className="w-3 h-3 inline mr-1 text-red-500" />}{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: User List */}
        <section className="w-64 bg-gray-50 border-l border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <h2 className="text-sm font-bold text-gray-800">
                User List
              </h2>
              <Badge variant="secondary" className="ml-auto text-xs" data-testid="text-user-count">
                {uniqueUsers.length}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="flex-grow p-3">
            <div className="space-y-1">
              {uniqueUsers.map((u) => {
                const isOp = ['platform_admin', 'deputy_admin'].includes(u.role);
                const isVoice = ['deputy_assistant', 'sysop'].includes(u.role);
                const ircPrefix = isOp ? '@' : isVoice ? '+' : '';
                
                return (
                  <ContextMenu key={u.id}>
                    <ContextMenuTrigger>
                      <div 
                        className={`
                          flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors
                          ${selectedUserId === u.id 
                            ? 'bg-indigo-100 font-bold text-indigo-700 shadow-md' 
                            : 'hover:bg-gray-200'
                          }
                        `}
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`user-${u.id}`}
                      >
                        {/* Status Indicator */}
                        {getStatusIndicator(u.status || 'online')}
                        
                        {/* User Type Icon */}
                        {getUserTypeIcon(u.userType || 'guest', u.role)}
                        
                        {/* User Name */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs truncate ${getRoleColor(u.role)}`}>
                              {ircPrefix}{u.name}
                            </span>
                            {getRoleIcon(u.role)}
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                  <ContextMenuContent className="bg-white border-gray-300 w-56">
                    <ContextMenuItem onClick={() => handleMention(u.name)}>
                      @Mention {u.name}
                    </ContextMenuItem>
                    {isStaff && (
                      <>
                        <ContextMenuItem onClick={() => handleCommand(`/intro`)}>
                          /intro - AI Introduction
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCommand(`/auth ${u.name}`)}>
                          /auth - Request Auth
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCommand(`/verify ${u.name}`)}>
                          /verify - Verify User
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleCommand(`/kick ${u.name}`)}>
                          /kick - Remove User
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
            </div>
          </ScrollArea>
        </section>
      </main>
    </div>
  );
}
