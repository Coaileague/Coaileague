import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Send, Users, ArrowDown, MessageSquare, Clock, 
  Shield, Crown, UserCog, Wrench, Star, AlertCircle,
  Menu, X, ChevronDown
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import type { ChatMessage } from "@shared/schema";

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

// Desktop IRC-style chatroom with always-visible user list
export default function DesktopChatroom() {
  const { user, isAuthenticated } = useAuth();
  const [inputMessage, setInputMessage] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [contextMenuUser, setContextMenuUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';

  const { messages, isConnected, sendMessage, sendTyping, onlineUsers } = useChatroomWebSocket(user?.id, userName);

  // Fetch room data and queue for status banner
  const { data: roomData } = useQuery({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: isAuthenticated,
  });

  const { data: queueData } = useQuery<any[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  // Use real-time user list from WebSocket (includes HelpOS™ bot and all connected users)
  const uniqueUsers = onlineUsers.map(u => ({
    ...u,
    avatar: null,
    isOnline: true,
  }));

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
  }, []);

  // Handle scroll for unread counter
  const handleScroll = useCallback((e: any) => {
    const element = e.target;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
    
    if (isNearBottom) {
      setUnreadCount(0);
    }
    
    lastScrollTop.current = element.scrollTop;
  }, []);

  // Auto-scroll on new messages if near bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const element = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (element) {
        const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 150;
        if (isNearBottom) {
          scrollToBottom();
        } else {
          setUnreadCount(prev => prev + 1);
        }
      }
    }
  }, [messages, scrollToBottom]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    sendTyping(true);
  };

  // Get role icon and color
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

  // Context menu actions
  const handlePrivateMessage = (userId: string) => {
    setInputMessage(`/pm ${userId} `);
  };

  const handleMention = (userName: string) => {
    setInputMessage(prev => prev + `@${userName} `);
  };

  const handleKick = (userId: string) => {
    setInputMessage(`/kick ${userId}`);
    handleSendMessage();
  };

  const handleBan = (userId: string) => {
    setInputMessage(`/ban ${userId}`);
    handleSendMessage();
  };

  // Status banner data
  const queueLength = queueData?.length || 0;
  const avgWaitTime = queueLength > 0 ? Math.ceil(queueLength * 2.5) : 0;
  const staffCount = uniqueUsers.filter(u => ['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* IRC-style header with neon effects */}
      <div className="relative border-b border-blue-500/30 bg-slate-900/90 backdrop-blur-sm p-3">
        {/* Animated scanline effect */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent animate-scan" />
        </div>
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WorkforceOSLogo size="sm" showText={false} />
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-400" />
                Live HelpDesk
                {isConnected && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    Connected
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">WorkforceOS Support Channel</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-slate-300">{uniqueUsers.length} online</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-slate-300">
                {queueLength > 0 ? `${queueLength} in queue • ~${avgWaitTime}min wait` : 'No queue'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main IRC-style three-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Center: Messages */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Scroll to bottom button */}
          {showScrollButton && (
            <Button
              onClick={scrollToBottom}
              size="icon"
              className="absolute bottom-6 right-6 z-50 rounded-full shadow-lg bg-blue-600 hover:bg-blue-500"
              data-testid="button-scroll-bottom"
            >
              <ArrowDown className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          )}

          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef} onScroll={handleScroll as any}>
            <div className="space-y-2 max-w-5xl mx-auto">
              {messages.map((msg) => {
                const isSystem = msg.senderId === 'system';
                const isAI = msg.senderId === 'helpos-ai';
                const role = (msg as any).userRole || 'user';
                
                return (
                  <div key={msg.id} className={`flex gap-3 ${isSystem || isAI ? 'justify-center' : ''}`}>
                    {!isSystem && !isAI && (
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <Avatar className="w-8 h-8 border-2 border-blue-500/30 cursor-pointer hover:border-blue-400">
                            <AvatarFallback className="bg-slate-800 text-blue-400 text-xs">
                              {msg.senderName?.substring(0, 2).toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="bg-slate-900 border-blue-500/30">
                          <ContextMenuItem onClick={() => handleMention(msg.senderName || 'user')} data-testid="context-mention">
                            <Star className="w-4 h-4 mr-2" />
                            Mention @{msg.senderName}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handlePrivateMessage(msg.senderId || '')} data-testid="context-pm">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Private Message
                          </ContextMenuItem>
                          {['platform_admin', 'deputy_admin'].includes((user as any)?.platformRole || '') && (
                            <>
                              <ContextMenuItem onClick={() => handleKick(msg.senderId || '')} className="text-orange-400" data-testid="context-kick">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Kick User
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleBan(msg.senderId || '')} className="text-red-400" data-testid="context-ban">
                                <Shield className="w-4 h-4 mr-2" />
                                Ban User
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                    
                    <div className={`flex-1 ${isSystem || isAI ? 'max-w-2xl' : ''}`}>
                      {!isSystem && !isAI && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-semibold ${getRoleColor(role)}`}>
                            {msg.senderName || 'Unknown'}
                          </span>
                          {getRoleIcon(role)}
                          {role !== 'user' && (
                            <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                              {role.replace('_', ' ').toUpperCase()}
                            </Badge>
                          )}
                          <span className="text-xs text-slate-500">
                            {msg.createdAt && formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      
                      <div className={`
                        ${isSystem ? 'text-center text-sm italic text-blue-300 bg-blue-500/10 rounded px-3 py-1' : ''}
                        ${isAI ? 'text-center text-sm bg-purple-500/10 rounded px-3 py-1 border border-purple-500/30' : ''}
                        ${!isSystem && !isAI ? 'text-slate-200' : ''}
                      `}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-blue-500/30 bg-slate-900/90 backdrop-blur-sm p-4">
            <div className="flex gap-2 max-w-5xl mx-auto">
              <Input
                value={inputMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={isConnected ? "Type a message or /help for commands..." : "Connecting..."}
                disabled={!isConnected}
                className="flex-1 bg-slate-800 border-blue-500/30 focus:border-blue-400 text-white placeholder:text-slate-500"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected || !inputMessage.trim()}
                className="bg-blue-600 hover:bg-blue-500"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: User List (always visible on desktop) */}
        <div className="w-64 border-l border-blue-500/30 bg-slate-900/50 backdrop-blur-sm">
          <div className="p-3 border-b border-blue-500/30">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Online Users ({uniqueUsers.length})
            </h3>
          </div>
          
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-2 space-y-1">
              {uniqueUsers.map((u) => (
                <ContextMenu key={u.id}>
                  <ContextMenuTrigger>
                    <div className="flex items-center gap-2 p-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors" data-testid={`user-${u.id}`}>
                      <div className="relative">
                        <Avatar className="w-6 h-6 border border-blue-500/30">
                          <AvatarFallback className="bg-slate-800 text-blue-400 text-xs">
                            {u.name?.substring(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-slate-900" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-medium truncate ${getRoleColor(u.role)}`}>
                            {u.name}
                          </span>
                          {getRoleIcon(u.role)}
                        </div>
                        {u.role !== 'user' && (
                          <span className="text-xs text-slate-500">
                            {u.role.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-slate-900 border-blue-500/30">
                    <ContextMenuItem onClick={() => handleMention(u.name)} data-testid={`context-mention-${u.id}`}>
                      <Star className="w-4 h-4 mr-2" />
                      Mention @{u.name}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handlePrivateMessage(u.id)} data-testid={`context-pm-${u.id}`}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Private Message
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .animate-scan {
          animation: scan 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
