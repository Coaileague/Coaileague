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
  Settings, Power, HelpCircle, Zap, Clock, AlertCircle, CheckCircle
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';

  const { messages, isConnected, sendMessage, sendTyping, onlineUsers } = useChatroomWebSocket(user?.id, userName);

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
          <h1 className="text-2xl font-black tracking-wide flex items-center">
            <MessageSquare className="w-6 h-6 mr-2 text-amber-300" />
            HELPDESKC<span className="text-lg font-light">AB</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold">Channel: #support-main</span>
            {isConnected && (
              <div className="flex items-center gap-1 text-xs bg-green-500/20 px-2 py-1 rounded">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Connected
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main 3-Column Layout */}
      <main className="flex flex-grow overflow-hidden max-w-7xl mx-auto w-full border-x border-gray-300">
        
        {/* LEFT COLUMN: Options/Settings */}
        <section className="w-1/4 bg-white border-r border-gray-200 flex flex-col p-4 overflow-y-auto">
          <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex items-center">
            <Settings className="w-5 h-5 mr-2 text-indigo-500" />
            Staff Controls
          </h2>

          <div className="space-y-4">
            {/* User Status */}
            <div className="p-3 bg-indigo-50 rounded-xl shadow-inner border border-indigo-200">
              <label className="block text-sm font-medium text-indigo-700 mb-2">Your Status</label>
              <select 
                value={userStatus} 
                onChange={(e) => setUserStatus(e.target.value as any)}
                className="w-full p-2 border border-indigo-300 rounded-lg text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                data-testid="select-status"
              >
                <option value="online">● Online</option>
                <option value="away">● Away</option>
                <option value="busy">● Busy</option>
              </select>
            </div>

            {/* Queue Info */}
            <div className="p-3 bg-gray-50 rounded-xl shadow-inner border border-gray-200">
              <h3 className="text-base font-semibold text-gray-700 mb-2">Support Queue</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">In Queue:</span>
                  <Badge variant="secondary">{queueLength}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Online Staff:</span>
                  <Badge variant="secondary">{uniqueUsers.filter(u => ['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}</Badge>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            {isStaff && (
              <div className="pt-4 border-t border-gray-200 space-y-2">
                <Button 
                  onClick={() => handleCommand('/intro')}
                  className="w-full bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
                  data-testid="button-intro"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  AI Introduction
                </Button>
                <Button 
                  onClick={() => handleCommand('/help')}
                  className="w-full bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
                  data-testid="button-help"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  View Commands
                </Button>
                <Button 
                  onClick={() => handleCommand('/queue')}
                  className="w-full bg-purple-600 hover:bg-purple-700 shadow-md hover:shadow-lg transition-all"
                  data-testid="button-queue"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Check Queue
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* CENTER COLUMN: Chat Messages */}
        <section className="flex flex-col flex-grow bg-white">
          {/* Messages Container */}
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-3">
              {/* System Welcome Message */}
              <div className="text-center text-sm italic text-orange-600">
                *** Welcome to #support-main. Users online: {uniqueUsers.length} ***
              </div>

              {messages.map((msg, idx) => {
                const isSystem = msg.senderType === 'system';
                const isBot = msg.senderType === 'bot';
                const isSelf = msg.senderId === user?.id;
                const role = (msg as any).userRole || 'user';

                if (isSystem) {
                  return (
                    <div key={idx} className="text-center text-sm italic text-orange-600">
                      [{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}] 
                      <span className="font-bold text-blue-600 ml-1">System</span>: {msg.message}
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
        <section className="w-1/4 bg-gray-50 border-l border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center">
              <Users className="w-5 h-5 mr-2 text-purple-600" />
              User List (<span data-testid="text-user-count">{uniqueUsers.length}</span>)
            </h2>
          </div>
          
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-1">
              {uniqueUsers.map((u) => (
                <ContextMenu key={u.id}>
                  <ContextMenuTrigger>
                    <div 
                      className={`
                        flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
                        ${selectedUserId === u.id 
                          ? 'bg-indigo-100 font-bold text-indigo-700 shadow-md' 
                          : 'hover:bg-gray-200'
                        }
                      `}
                      onClick={() => setSelectedUserId(u.id)}
                      data-testid={`user-${u.id}`}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="bg-slate-800 text-blue-400 text-xs">
                          {u.name?.substring(0, 2).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm truncate ${getRoleColor(u.role)}`}>{u.name}</span>
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
              ))}
            </div>
          </ScrollArea>
        </section>
      </main>
    </div>
  );
}
