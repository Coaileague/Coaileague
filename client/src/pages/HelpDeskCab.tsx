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
  ChevronLeft, ChevronRight, Info, Coffee, Star, Building2, Bot, Sparkles
} from "lucide-react";
import { WFLogoCompact } from "@/components/wf-logo";
import { formatDistanceToNow } from "date-fns";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ChatMessage } from "@shared/schema";

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

// Desktop IRC/MSN-style 3-column chatroom with WorkforceOS blue branding
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

  // Sort users: Root admin at top, then bot, then staff (by role hierarchy), then subscribers, org users, guests
  const sortedUsers = [...onlineUsers].sort((a, b) => {
    // Role priority (lower number = higher priority)
    const rolePriority: Record<string, number> = {
      'root': 0,              // Root admin at absolute top (you)
      'bot': 1,               // HelpOS AI bot
      'platform_admin': 2,    // Platform administrators
      'deputy_admin': 3,      // Deputy administrators
      'deputy_assistant': 4,  // Deputy assistants
      'sysop': 5,             // System operators
      'subscriber': 6,        // Paid subscribers
      'org_user': 7,          // Organization users
      'guest': 8,             // Guest users
    };
    
    const aPriority = rolePriority[a.role] ?? 99;
    const bPriority = rolePriority[b.role] ?? 99;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Within same role, sort by name
    return a.name.localeCompare(b.name);
  });

  const uniqueUsers = sortedUsers.map(u => ({
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

  // Get user type icon - PROMINENT with WorkforceOS blue branding
  const getUserTypeIcon = (userType: string, role: string) => {
    // ROOT ADMIN gets golden crown - YOU
    if (role === 'root') {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/50">
          <Crown className="w-4 h-4 text-white" />
        </div>
      );
    }
    
    // Bot gets special animated icon
    if (role === 'bot') {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse">
          <Bot className="w-4 h-4 text-white" />
        </div>
      );
    }
    
    // Staff gets WF logo with blue gradient
    if (['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      const bgColor = role === 'platform_admin' 
        ? 'from-blue-500 to-indigo-600'
        : role === 'deputy_admin'
        ? 'from-blue-600 to-slate-700'
        : role === 'deputy_assistant'
        ? 'from-indigo-500 to-blue-600'
        : 'from-cyan-500 to-blue-600';
        
      return (
        <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br ${bgColor}`}>
          <WFLogoCompact size={12} className="text-white" />
        </div>
      );
    }
    
    // Based on user type with blue/neutral tones
    switch (userType) {
      case 'subscriber': 
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
            <Star className="w-4 h-4 text-white" />
          </div>
        );
      case 'org_user': 
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-gray-500">
            <Building2 className="w-4 h-4 text-white" />
          </div>
        );
      case 'guest': 
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-gray-400">
            <HelpCircle className="w-4 h-4 text-white" />
          </div>
        );
      default: 
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-gray-400">
            <HelpCircle className="w-4 h-4 text-white" />
          </div>
        );
    }
  };

  // Get status indicator
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online': return <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50" />;
      case 'away': return <div className="w-2.5 h-2.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50" />;
      case 'busy': return <div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-lg shadow-rose-500/50" />;
      default: return <div className="w-2.5 h-2.5 bg-slate-400 rounded-full" />;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'root': return <Crown className="w-3.5 h-3.5 text-amber-500" />;
      case 'bot': return <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />;
      case 'platform_admin': return <Crown className="w-3.5 h-3.5 text-blue-500" />;
      case 'deputy_admin': return <Shield className="w-3.5 h-3.5 text-blue-600" />;
      case 'deputy_assistant': return <UserCog className="w-3.5 h-3.5 text-indigo-500" />;
      case 'sysop': return <Wrench className="w-3.5 h-3.5 text-cyan-500" />;
      default: return null;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'root': return 'text-amber-600 font-black';  // Root admin - bold gold
      case 'bot': return 'text-blue-600 font-bold';
      case 'platform_admin': return 'text-blue-600 font-bold';
      case 'deputy_admin': return 'text-blue-700 font-bold';
      case 'deputy_assistant': return 'text-indigo-600 font-bold';
      case 'sysop': return 'text-cyan-600 font-bold';
      default: return 'text-slate-700 font-semibold';
    }
  };

  // Get message bubble color - WorkforceOS blue branding
  const getMessageBubbleColor = (senderType: string, role: string, isSelf: boolean) => {
    if (isSelf) {
      return 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-300';
    }
    
    // Root admin messages - golden
    if (role === 'root') {
      return 'bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-300';
    }
    
    // Bot messages - blue
    if (role === 'bot') {
      return 'bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-200';
    }
    
    // Staff messages - slate blue
    if (['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      return 'bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-300';
    }
    
    // Customer messages - light gray
    return 'bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-300';
  };

  const isStaff = user && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes((user as any).platformRole);
  const queueLength = queueData?.length || 0;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-blue-100">
      {/* WorkforceOS Blue Gradient Header */}
      <header className="bg-gradient-to-r from-blue-900 via-indigo-800 to-slate-800 p-3 text-white shadow-lg">
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
              <MessageSquare className="w-6 h-6 mr-2 text-blue-300" />
              HelpDesk
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold font-mono">irc.wfos.com #HelpDesk</span>
            {isConnected && (
              <div className="flex items-center gap-1 text-xs bg-emerald-500/30 px-3 py-1 rounded-full backdrop-blur-sm">
                <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                Connected
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout with Collapsible Sidebar */}
      <main className="flex flex-grow overflow-hidden max-w-7xl mx-auto w-full">
        
        {/* LEFT COLUMN: Options/Settings (Collapsible) */}
        {!sidebarCollapsed && (
          <section className="w-48 bg-white/90 backdrop-blur-sm border-r border-slate-300 flex flex-col p-3 overflow-y-auto transition-all">
          <h2 className="text-sm font-bold text-blue-900 mb-3 pb-2 border-b border-blue-200 flex items-center">
            <Settings className="w-4 h-4 mr-2 text-blue-600" />
            Staff Controls
          </h2>

          <div className="space-y-3">
            {/* User Status */}
            <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
              <label className="block text-xs font-medium text-blue-800 mb-1 flex items-center gap-1">
                Your Status
                {showCoffeeCup && (
                  <Coffee className="w-3 h-3 text-amber-600 animate-bounce" />
                )}
              </label>
              <select 
                value={userStatus} 
                onChange={(e) => handleStatusChange(e.target.value as any)}
                className="w-full p-1.5 border border-blue-300 rounded text-xs bg-white focus:ring-blue-500 focus:border-blue-500"
                data-testid="select-status"
              >
                <option value="online">● Available</option>
                <option value="away">● Away</option>
                <option value="busy">● Busy</option>
              </select>
            </div>

            {/* Queue Info */}
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-800 mb-2">Support Queue</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">In Queue:</span>
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">{queueLength}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Online Staff:</span>
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">{uniqueUsers.filter(u => ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}</Badge>
                </div>
              </div>
            </div>

            {/* Quick Actions for Staff */}
            {isStaff && (
              <>
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <Button 
                    onClick={() => handleCommand('/intro')}
                    size="sm"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs h-8 shadow-md"
                    data-testid="button-intro"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    <span className="truncate">AI Intro</span>
                  </Button>
                  <Button 
                    onClick={() => handleCommand('/help')}
                    size="sm"
                    className="w-full bg-gradient-to-r from-slate-600 to-blue-600 hover:from-slate-700 hover:to-blue-700 text-white text-xs h-8 shadow-md"
                    data-testid="button-help"
                  >
                    <HelpCircle className="w-3 h-3 mr-1" />
                    <span className="truncate">Commands</span>
                  </Button>
                  <Button 
                    onClick={() => handleCommand('/queue')}
                    size="sm"
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs h-8 shadow-md"
                    data-testid="button-queue"
                  >
                    <Users className="w-3 h-3 mr-1" />
                    <span className="truncate">Queue</span>
                  </Button>
                </div>

                {/* Quick Response Templates for Agents */}
                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-800 mb-2">Quick Responses</h3>
                  <div className="space-y-1">
                    <Button 
                      onClick={() => setInputMessage("Thank you for contacting WorkforceOS support! How can I help you today?")}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs h-auto py-1.5 border-blue-300 hover:bg-blue-50"
                    >
                      Welcome Message
                    </Button>
                    <Button 
                      onClick={() => setInputMessage("I've resolved your issue. Is there anything else I can help you with?")}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs h-auto py-1.5 border-blue-300 hover:bg-blue-50"
                    >
                      Issue Resolved
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        )}

        {/* CENTER COLUMN: Chat Area */}
        <section className="flex-grow flex flex-col bg-white/70 backdrop-blur-sm">
          {/* Info Banner */}
          <div className="bg-gradient-to-r from-blue-100 via-slate-100 to-indigo-100 px-4 py-2 text-sm text-blue-900 border-b border-blue-200 text-center font-mono">
            <Info className="w-3 h-3 inline mr-2" />
            {infoBanners[currentBannerIndex]}
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-4">
              {/* IRC-style MOTD */}
              {ircMessages.map((msg, idx) => (
                <div key={`irc-${idx}`} className="text-xs font-mono text-blue-700 italic">
                  {msg}
                </div>
              ))}

              {/* Chat Messages - Modern bubbles with WorkforceOS blue */}
              {messages.map((msg, idx) => {
                const isSelf = msg.senderId === user?.id;
                const role = (msg as any).role || 'guest';
                
                // System messages
                if (msg.senderType === 'system' || msg.isSystemMessage) {
                  return (
                    <div key={idx} className="flex justify-center my-2">
                      <span className="text-xs font-mono text-blue-700 italic bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                        *** {msg.message}
                      </span>
                    </div>
                  );
                }

                // Regular messages - ALL left-aligned with modern bubbles
                const displayName = isSelf ? 'You' : (msg.senderName || 'User');
                const bubbleColor = getMessageBubbleColor(msg.senderType || 'customer', role, isSelf);
                const nameColor = getRoleColor(role);

                return (
                  <div key={idx} className={`${bubbleColor} shadow-md p-4 rounded-3xl max-w-[85%] hover:shadow-lg transition-all`}>
                    <div className="flex items-start gap-3">
                      {/* Avatar Icon - PROMINENT */}
                      <div className="flex-shrink-0">
                        {getUserTypeIcon((msg as any).userType || 'guest', role)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header: Name, Role Badge, Timestamp */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-sm ${nameColor}`}>{displayName}</span>
                          {getRoleIcon(role)}
                          <span className="text-xs text-slate-500 ml-auto">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        
                        {/* Message Content */}
                        <p className="text-slate-800 text-sm leading-relaxed">{msg.message}</p>
                        
                        {/* Reaction Bar */}
                        <div className="flex items-center gap-2 mt-3 text-xs">
                          <button className="hover:scale-110 transition-transform opacity-50 hover:opacity-100" title="Like">
                            👍
                          </button>
                          <button className="hover:scale-110 transition-transform opacity-50 hover:opacity-100" title="Love">
                            ❤️
                          </button>
                          <button className="hover:scale-110 transition-transform opacity-50 hover:opacity-100" title="Verified">
                            ✅
                          </button>
                          <button className="hover:scale-110 transition-transform opacity-50 hover:opacity-100" title="Star">
                            ⭐
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t-2 border-blue-200 bg-white/90 backdrop-blur-sm p-4">
            <div className="flex items-end gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message here..."
                disabled={!isConnected}
                className="flex-grow p-3 border-2 border-blue-300 rounded-2xl resize-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected || !inputMessage.trim()}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all h-full"
                data-testid="button-send"
              >
                Send <Send className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-slate-600">
              <span><Clock className="w-3 h-3 inline mr-1" />Enter to send</span>
              <span>{isConnected ? <CheckCircle className="w-3 h-3 inline mr-1 text-emerald-500" /> : <AlertCircle className="w-3 h-3 inline mr-1 text-rose-500" />}{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: User List with PROMINENT ICONS */}
        <section className="w-72 bg-white/90 backdrop-blur-sm border-l border-slate-300 flex flex-col">
          <div className="p-4 border-b border-blue-200 flex-shrink-0 bg-gradient-to-r from-blue-50 to-slate-50">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700 flex-shrink-0" />
              <h2 className="text-sm font-bold text-blue-900">
                Online Users
              </h2>
              <Badge variant="secondary" className="ml-auto text-xs bg-blue-100 text-blue-800" data-testid="text-user-count">
                {uniqueUsers.length}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="flex-grow p-3">
            <div className="space-y-2">
              {uniqueUsers.map((u) => {
                const isOp = ['root', 'platform_admin', 'deputy_admin'].includes(u.role);
                const isVoice = ['deputy_assistant', 'sysop'].includes(u.role);
                const ircPrefix = isOp ? '@' : isVoice ? '+' : '';
                
                return (
                  <ContextMenu key={u.id}>
                    <ContextMenuTrigger>
                      <div 
                        className={`
                          flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all
                          ${selectedUserId === u.id 
                            ? 'bg-gradient-to-r from-blue-100 to-indigo-100 shadow-md scale-105' 
                            : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 hover:shadow-sm'
                          }
                        `}
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`user-${u.id}`}
                      >
                        {/* Status Indicator */}
                        <div className="flex-shrink-0">
                          {getStatusIndicator(u.status || 'online')}
                        </div>
                        
                        {/* User Type Icon - PROMINENT */}
                        <div className="flex-shrink-0">
                          {getUserTypeIcon(u.userType || 'guest', u.role)}
                        </div>
                        
                        {/* User Name and Role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold truncate ${getRoleColor(u.role)}`} title={u.name}>
                              {ircPrefix}{u.name}
                            </span>
                            {getRoleIcon(u.role)}
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-white border-blue-300 w-56">
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
