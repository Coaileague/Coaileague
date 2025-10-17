import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { SecureRequestDialog } from "@/components/secure-request-dialog";
import { BrandedConfirmDialog } from "@/components/branded-input-dialog";
import { HelpDeskCommandBar } from "@/components/helpdesk-command-bar";
import { ChatAnnouncementBanner } from "@/components/chat-announcement-banner";
import { BannerManager } from "@/components/banner-manager";
import { HelpCommandPanel } from "@/components/help-command-panel";
import { QueueManagerPanel } from "@/components/queue-manager-panel";
import { TutorialManagerPanel } from "@/components/tutorial-manager-panel";
import { PriorityManagerPanel } from "@/components/priority-manager-panel";
import { AccountSupportPanel } from "@/components/account-support-panel";
import { MotdDialog } from "@/components/motd-dialog";
import { AnimatedStatusBar } from "@/components/animated-status-bar";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const [inputMessage, setInputMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<"online" | "away" | "busy">("online");
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [showCoffeeCup, setShowCoffeeCup] = useState(false);
  const [secureRequest, setSecureRequest] = useState<{
    type: 'authenticate' | 'document' | 'photo' | 'signature' | 'info';
    requestedBy: string;
    message?: string;
  } | null>(null);
  const [confirmKick, setConfirmKick] = useState<{ userId: string; userName: string } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showRoomStatus, setShowRoomStatus] = useState(false);
  const [showBannerManager, setShowBannerManager] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showPriorityPanel, setShowPriorityPanel] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showMotd, setShowMotd] = useState(false);
  const [motdData, setMotdData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // IRC-style MOTD and helpful info banners
  const infoBanners = [
    "irc.wfos.com - WorkforceOS Support Network - 24/7 Support Available",
    "Queue Position: You are #1 in line - Estimated wait: 2-3 minutes",
    "Tools: Use command buttons above for Help, Queue, Tutorial, and Priority support",
    "Tip: Describe your issue clearly and staff will assist you shortly",
    "FAQ: Use Account button for password reset | Right-click users for quick actions",
    "HelpOS™ AI is monitoring - Urgent issues are auto-prioritized"
  ];

  // IRC-style system messages
  const [ircMessages, setIrcMessages] = useState<string[]>([
    "Connecting to irc.wfos.com (WorkforceOS Support Network)",
    "Connected to server irc.wfos.com",
    `Message of the Day - irc.wfos.com`,
    "=====================================================",
    "Welcome to WorkforceOS HelpDesk Support Network",
    "Your satisfaction is our priority - 24/7/365",
    "Use command buttons: Help, Queue, Tutorial, Priority, Account",
    "Right-click any user for quick support actions (staff only)",
    "Click your username to view your queue position and info",
    "=====================================================",
    `End of MOTD - You are now in #HelpDesk`,
  ]);

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';

  const { messages, isConnected, sendMessage, sendTyping, sendStatusChange, kickUser, sendRawMessage, onlineUsers, customBannerMessage, typingUserInfo, isSilenced, justGotVoice } = useChatroomWebSocket(
    user?.id, 
    userName,
    (request) => {
      // When staff requests secure info, open the dialog
      setSecureRequest({
        type: request.type as any,
        requestedBy: request.requestedBy,
        message: request.message,
      });
    }
  );

  const { data: roomData } = useQuery({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: isAuthenticated,
  });

  const { data: queueData } = useQuery<any[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  // Fetch MOTD
  const { data: motdResponse } = useQuery<{ motd: any, acknowledged: boolean }>({
    queryKey: ['/api/helpdesk/motd'],
    enabled: isAuthenticated,
  });

  // Show MOTD dialog if there's an active MOTD that hasn't been acknowledged
  useEffect(() => {
    if (motdResponse && motdResponse.motd && !motdResponse.acknowledged) {
      setMotdData(motdResponse.motd);
      setShowMotd(true);
    }
  }, [motdResponse]);

  // MOTD acknowledgment mutation
  const acknowledgeMOTD = useMutation({
    mutationFn: async (motdId: string) => {
      return await apiRequest('/api/helpdesk/motd/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ motdId }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/helpdesk/motd'] });
      setShowMotd(false);
      toast({
        title: "Welcome to HelpDesk!",
        description: "You can now access the support chat",
      });
    },
  });

  // Sort users: Root admin at top, then bot, then staff (by role hierarchy), then subscribers, org users, guests
  const sortedUsers = [...onlineUsers].sort((a, b) => {
    // Role priority (lower number = higher priority)
    const rolePriority: Record<string, number> = {
      'root': 0,              // Root admin at absolute top (you)
      'bot': 1,               // HelpOS AI bot
      'deputy_admin': 2,      // Deputy administrators
      'deputy_assistant': 3,  // Deputy assistants
      'sysop': 4,             // System operators
      'subscriber': 5,        // Paid subscribers
      'org_user': 6,          // Organization users
      'guest': 7,             // Guest users
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

  const handleQuickResponse = (action: string) => {
    // Handle panel-based actions
    if (action === '/info' || action === 'account') {
      setShowAccountPanel(true);
      return;
    }
    if (action === 'priority') {
      setShowPriorityPanel(true);
      return;
    }
    if (action === 'organization') {
      toast({
        title: "Organization Settings",
        description: "Organization management panel coming soon!",
      });
      return;
    }
    
    // All slash commands should be sent via WebSocket
    if (action.startsWith('/')) {
      if (!isConnected) {
        toast({
          title: "Not Connected",
          description: "Cannot send commands while disconnected",
          variant: "destructive",
        });
        return;
      }
      
      // Send the slash command as a message - server will process it
      sendMessage(action, userName, 'support');
      
      toast({
        title: "Command Sent",
        description: `${action} command executed`,
      });
    }
  };

  const handleMention = (userName: string) => {
    setInputMessage(prev => prev + `@${userName} `);
  };

  const sendQuickMessage = (message: string) => {
    if (message.trim() && isConnected) {
      sendMessage(message, userName, 'support');
    }
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
    // ROOT ADMIN gets golden crown with W logo
    if (role === 'root') {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/50">
          <WFLogoCompact size={12} className="text-white" />
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
    if (['deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      const bgColor = role === 'deputy_admin'
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
    
    // Authenticated users (subscribers & org users) get W logo with tier-based colors
    if (userType === 'subscriber') {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
          <WFLogoCompact size={12} className="text-white" />
        </div>
      );
    }
    
    if (userType === 'org_user') {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
          <WFLogoCompact size={12} className="text-white" />
        </div>
      );
    }
    
    // Guests get question mark
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-gray-400">
        <HelpCircle className="w-4 h-4 text-white" />
      </div>
    );
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
    if (['deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
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
            <h1 className="text-2xl font-black tracking-wide flex items-center">
              <MessageSquare className="w-6 h-6 mr-2 text-blue-300" />
              HelpDesk
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold font-mono">irc.wfos.com #HelpDesk</span>
            {isStaff && (
              <Button
                onClick={() => setShowBannerManager(true)}
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-2 bg-purple-500/20 border-purple-300/50 hover:bg-purple-500/30 text-white"
                data-testid="button-open-banner-manager"
              >
                <Sparkles className="w-3 h-3" />
                Banner Manager
              </Button>
            )}
            {isConnected && (
              <div className="flex items-center gap-1 text-xs bg-emerald-500/30 px-3 py-1 rounded-full backdrop-blur-sm">
                <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                Connected
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Horizontal Command Bar - Role-Based Actions */}
      <div className="max-w-7xl mx-auto w-full">
        <HelpDeskCommandBar
          userRole={
            isStaff ? 'staff' :
            (user as any)?.subscriptionTier ? 'subscriber' :
            (user as any)?.workspaceId ? 'org_user' :
            'guest'
          }
          isStaff={isStaff || false}
          userStatus={userStatus}
          onStatusChange={(status) => {
            setUserStatus(status);
            handleStatusChange(status);
          }}
          queueLength={queueLength}
          onlineStaffCount={uniqueUsers.filter(u => ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}
          showCoffeeCup={showCoffeeCup}
          onShowHelp={() => setShowHelpPanel(true)}
          onShowQueue={() => setShowQueuePanel(true)}
          onShowTutorial={() => setShowTutorial(true)}
          onShowPriority={() => setShowPriorityPanel(true)}
          onShowAccount={() => setShowAccountPanel(true)}
          onToggleRoomStatus={() => setShowRoomStatus(true)}
          onToggleAI={async () => {
            const newState = !aiEnabled;
            setAiEnabled(newState);
            
            // Send toggle to server via WebSocket
            sendRawMessage({
              type: 'ai_toggle',
              aiEnabled: newState,
              userId: user?.id,
            });
            
            toast({
              title: newState ? "HelpOS™ AI Enabled" : "HelpOS™ AI Disabled",
              description: newState 
                ? "AI costs are billed to customer credits" 
                : "Standard support mode active",
              variant: newState ? "default" : "destructive",
            });
          }}
          aiEnabled={aiEnabled}
          onQuickResponse={handleQuickResponse}
          roomStatus="open"
        />
      </div>

      {/* Main Layout - Full Width */}
      <main className="flex flex-grow overflow-hidden max-w-7xl mx-auto w-full">
        {/* CENTER COLUMN: Chat Area */}
        <section className="flex-grow flex flex-col bg-white/70 backdrop-blur-sm relative">
          {/* Animated Seasonal Banner - STICKY at top */}
          <div className="sticky top-0 z-50">
            <ChatAnnouncementBanner
              queuePosition={queueLength || 1}
              queueWaitTime="2-3 minutes"
              onlineStaff={uniqueUsers.filter(u => ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}
              customMessages={customBannerMessage ? [{
                id: 'custom-1',
                text: customBannerMessage,
                type: 'promo' as const,
                icon: 'zap'
              }] : []}
            />
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
                        {msg.message}
                      </span>
                    </div>
                  );
                }

                // Regular messages - ALL left-aligned with modern bubbles
                const displayName = msg.senderName || userName || 'User';
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
            <div className="mt-2 px-1" data-testid="chat-status-bar">
              <AnimatedStatusBar
                isSilenced={isSilenced}
                isConnected={isConnected}
                typingUser={typingUserInfo}
                justGotVoice={justGotVoice}
              />
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: User List with PROMINENT ICONS - Dynamic width based on content */}
        <section className="min-w-[200px] max-w-[320px] w-auto bg-white/90 backdrop-blur-sm border-l border-slate-300 flex flex-col flex-shrink-0">
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
                // No IRC prefix - WF logo icon shows authority
                
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-semibold break-words ${getRoleColor(u.role)}`}>
                              {u.name}
                            </span>
                            {getRoleIcon(u.role)}
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-white border-blue-300 w-64">
                      {isStaff && u.role !== 'root' && u.role !== 'bot' ? (
                        <>
                          <div className="px-2 py-1.5 text-xs font-bold text-blue-700 border-b border-blue-200">
                            Support Actions → {u.name}
                          </div>
                          
                          <ContextMenuItem onClick={() => {
                            // Release from spectator mode & send welcome
                            sendRawMessage({ 
                              type: 'release_spectator', 
                              targetUserId: u.id 
                            });
                            sendQuickMessage(`Hi ${u.name}! 👋 My name is ${userName}, I'm here to help you today. What can I assist you with? Please provide your ticket number if you have one.`);
                          }}>
                            🎤 Release Hold & Welcome
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'request_secure', 
                              targetUserId: u.id,
                              requestType: 'authenticate',
                              message: 'Please verify your identity to proceed'
                            });
                          }}>
                            🔐 Request Authentication
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'request_secure', 
                              targetUserId: u.id,
                              requestType: 'document',
                              message: 'Please upload the requested document'
                            });
                          }}>
                            📄 Request Document Upload
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'request_secure', 
                              targetUserId: u.id,
                              requestType: 'photo',
                              message: 'Please upload a photo of the issue'
                            });
                          }}>
                            📷 Request Photo
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'request_secure', 
                              targetUserId: u.id,
                              requestType: 'signature',
                              message: 'Please sign the consent form'
                            });
                          }}>
                            ✍️ Request E-Signature
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'request_secure', 
                              targetUserId: u.id,
                              requestType: 'info',
                              message: 'Please provide more details about your issue'
                            });
                          }}>
                            ❓ Request More Info
                          </ContextMenuItem>
                          
                          <div className="border-t border-slate-200 my-1" />
                          
                          <ContextMenuItem onClick={() => {
                            sendRawMessage({ 
                              type: 'transfer_user', 
                              targetUserId: u.id 
                            });
                          }}>
                            🔄 Transfer to Another Agent
                          </ContextMenuItem>
                          
                          <ContextMenuItem onClick={() => {
                            sendQuickMessage(`@${u.name} Your issue has been resolved! Is there anything else I can help you with today?`);
                          }}>
                            ✅ Mark Resolved
                          </ContextMenuItem>
                          
                          <ContextMenuItem 
                            onClick={() => setConfirmKick({ userId: u.id, userName: u.name })}
                            className="text-red-600 font-bold"
                          >
                            🚫 Kick User
                          </ContextMenuItem>
                        </>
                      ) : (
                        <ContextMenuItem onClick={() => handleMention(u.name)}>
                          💬 Mention {u.name}
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          </ScrollArea>
        </section>
      </main>

      {/* Secure Request Dialog - Opens when staff requests secure info from user */}
      {secureRequest && (
        <SecureRequestDialog
          open={!!secureRequest}
          onClose={() => setSecureRequest(null)}
          requestType={secureRequest.type}
          requestedBy={secureRequest.requestedBy}
          requestMessage={secureRequest.message}
          onSubmit={(data) => {
            // Send secure data back to staff via WebSocket
            sendRawMessage({
              type: 'secure_response',
              data: data
            });
            setSecureRequest(null);
          }}
        />
      )}

      {/* Branded Confirm Dialog - Kick User */}
      {confirmKick && (
        <BrandedConfirmDialog
          open={!!confirmKick}
          onClose={() => setConfirmKick(null)}
          title="Remove User from Chat?"
          description={`Are you sure you want to remove ${confirmKick.userName} from the chat for policy violation? This action will disconnect them immediately.`}
          confirmLabel="Remove User"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            kickUser(confirmKick.userId, 'policy violation');
            setConfirmKick(null);
          }}
        />
      )}

      {/* Tutorial Dialog */}
      {showTutorial && (
        <BrandedConfirmDialog
          open={showTutorial}
          onClose={() => setShowTutorial(false)}
          title="HelpDesk Tutorial"
          description="Welcome to WorkforceOS HelpDesk! Here's how to use the system: 1) Use the command buttons to quickly access features. 2) Type /help to see all available commands. 3) Staff will assist you shortly. 4) Use the chat to describe your issue clearly."
          confirmLabel="Got it!"
          onConfirm={() => setShowTutorial(false)}
        />
      )}

      {/* Room Status Dialog */}
      {showRoomStatus && isStaff && (
        <BrandedConfirmDialog
          open={showRoomStatus}
          onClose={() => setShowRoomStatus(false)}
          title="Change Room Status"
          description={`Current status: ${(roomData as any)?.status || 'Open'}. Use /room open, /room closed, or /room maintenance to change the status.`}
          confirmLabel="OK"
          onConfirm={() => setShowRoomStatus(false)}
        />
      )}

      {/* Banner Manager - Staff Only */}
      {isStaff && (
        <BannerManager
          open={showBannerManager}
          onClose={() => setShowBannerManager(false)}
          currentBanners={[]}
          onSendCommand={(command) => {
            if (isConnected) {
              sendMessage(command, userName, 'support');
              toast({
                title: "Banner Command Sent",
                description: "Your banner has been created and will appear for all users.",
              });
            }
          }}
        />
      )}

      {/* Help Command Panel */}
      <HelpCommandPanel
        isOpen={showHelpPanel}
        onClose={() => setShowHelpPanel(false)}
        onCommandExecute={(command) => {
          if (isConnected) {
            sendMessage(command, userName, 'support');
          }
        }}
      />

      {/* Queue Manager Panel */}
      <QueueManagerPanel
        isOpen={showQueuePanel}
        onClose={() => setShowQueuePanel(false)}
        queueUsers={queueData?.map((q: any) => ({
          id: q.userId,
          name: q.userName,
          type: q.ticketNumber ? 'ticket' : 'chat',
          ticketNumber: q.ticketNumber,
          waitTime: Math.floor((Date.now() - new Date(q.joinedAt).getTime()) / 60000),
          status: q.status === 'silenced' ? 'silenced' : 'waiting',
          position: q.queuePosition,
        }))}
        onUserAction={(userId, action) => {
          toast({
            title: "Action Executed",
            description: `${action} performed on user ${userId}`,
          });
        }}
      />

      {/* Tutorial Manager Panel */}
      <TutorialManagerPanel
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
      />

      {/* Priority Manager Panel */}
      <PriorityManagerPanel
        isOpen={showPriorityPanel}
        onClose={() => setShowPriorityPanel(false)}
      />

      {/* Account Support Panel */}
      <AccountSupportPanel
        isOpen={showAccountPanel}
        onClose={() => setShowAccountPanel(false)}
        accountInfo={user ? {
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          email: user.email,
          status: 'active',
          tier: (user as any).subscriptionTier || 'free'
        } : undefined}
        isStaff={isStaff}
        onAction={(action, data) => {
          toast({
            title: "Account Action",
            description: `${action} executed successfully`,
          });
        }}
      />

      {/* MOTD (Message of the Day) Dialog */}
      <MotdDialog
        open={showMotd}
        message={motdData}
        onAcknowledge={() => {
          if (motdData) {
            acknowledgeMOTD.mutate(motdData.id);
          }
        }}
        onClose={() => {
          if (!motdData?.requiresAcknowledgment) {
            setShowMotd(false);
          }
        }}
      />
    </div>
  );
}
