import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, Send, Users, AlertCircle, Shield, 
  Headphones, User, Circle, Settings, Info, Menu, X,
  Bot, Mic, MicOff, Sparkles
} from "lucide-react";
import type { ChatConversation, ChatMessage } from "@shared/schema";

interface OnlineUser {
  id: string;
  name: string;
  role: 'admin' | 'support' | 'customer' | 'bot';
  status: 'online' | 'away' | 'busy';
  avatar?: string;
}

export default function HelpdeskChatPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [mobileView, setMobileView] = useState<'chat' | 'users' | 'info'>('chat');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Static users including help_bot
  const [onlineUsers] = useState<OnlineUser[]>([
    { id: 'bot-1', name: 'help_bot', role: 'bot', status: 'online' },
    { id: '1', name: 'Admin Sarah', role: 'admin', status: 'online' },
    { id: '2', name: 'Support Mike', role: 'support', status: 'online' },
    { id: '3', name: 'Support Lisa', role: 'support', status: 'away' },
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Poll for conversations every 3 seconds
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 3000,
  });

  // Poll for messages when conversation is selected
  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", selectedConversation, "messages"],
    enabled: !!selectedConversation,
    refetchInterval: 2000,
  });

  const sendMessage = useMutation({
    mutationFn: async (data: { conversationId: string; content: string }) => {
      return await apiRequest(`/api/chat/conversations/${data.conversationId}/messages`, "POST", { 
        message: data.content,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", selectedConversation, "messages"] });
      setMessageText("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const grantVoice = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/chat/conversations/${conversationId}/grant-voice`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", selectedConversation, "messages"] });
      toast({
        title: "Voice Granted",
        description: "User can now send messages",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant voice",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !messageText.trim()) return;

    sendMessage.mutate({
      conversationId: selectedConversation,
      content: messageText.trim(),
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3 h-3 text-red-500" />;
      case 'support':
        return <Headphones className="w-3 h-3 text-blue-500" />;
      case 'bot':
        return <Bot className="w-3 h-3 text-purple-500" />;
      default:
        return <User className="w-3 h-3 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-muted/30';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'support':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'bot':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const formatTime = (timestamp: string | Date | null) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  // Room List Component (Active Conversations - MSN/IRC Style)
  const RoomListPanel = () => (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-3 bg-[#252525] border-b border-[#3a3a3a]">
        <div className="flex items-center gap-2 text-gray-300">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-semibold">Active Rooms ({conversations.length})</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversationsLoading ? (
            <div className="text-gray-500 text-center py-4 text-sm">Loading rooms...</div>
          ) : conversations.length === 0 ? (
            <div className="text-gray-500 text-center py-8 px-3">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No active support rooms</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors min-h-[48px] ${
                  selectedConversation === conv.id 
                    ? 'bg-indigo-600/20 border border-indigo-600/30' 
                    : 'hover:bg-[#2a2a2a] border border-transparent'
                }`}
                data-testid={`room-${conv.id}`}
              >
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    conv.status === 'active' 
                      ? 'bg-gradient-to-br from-green-600 to-accent' 
                      : conv.status === 'resolved'
                      ? 'bg-gradient-to-br from-blue-600 to-cyan-600'
                      : 'bg-gradient-to-br from-gray-600 to-gray-700'
                  }`}>
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1e1e1e] ${
                    conv.status === 'active' ? 'bg-muted/30' : 
                    conv.status === 'resolved' ? 'bg-blue-500' : 'bg-gray-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-sm font-medium text-white truncate">
                      Room #{conv.id.slice(0, 8)}
                    </p>
                    {conv.isSilenced && <MicOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[10px] h-4 px-1.5 ${
                      conv.priority === 'urgent' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      conv.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    }`}>
                      {conv.priority}
                    </Badge>
                    <Badge className={`text-[10px] h-4 px-1.5 ${
                      conv.status === 'active' ? 'bg-muted/30/10 text-green-500 border-primary/20' :
                      conv.status === 'resolved' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      'bg-gray-500/10 text-gray-500 border-gray-500/20'
                    }`}>
                      {conv.status}
                    </Badge>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  // User List Component
  const UserListPanel = () => (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-3 bg-[#252525] border-b border-[#3a3a3a]">
        <div className="flex items-center gap-2 text-gray-300">
          <Users className="w-4 h-4" />
          <span className="text-sm font-semibold">Online Staff ({onlineUsers.length})</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {onlineUsers.map((user) => (
            <button
              key={user.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-[#2a2a2a] transition-colors min-h-[48px]"
              data-testid={`user-${user.id}`}
            >
              <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  user.role === 'bot' 
                    ? 'bg-gradient-to-br from-purple-600 to-pink-600' 
                    : 'bg-gradient-to-br from-indigo-600 to-purple-600'
                }`}>
                  {getRoleIcon(user.role)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1e1e1e] ${getStatusColor(user.status)}`} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-white truncate">{user.name}</p>
                  {user.role === 'bot' && <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                </div>
                <Badge className={`text-[10px] h-4 px-1.5 ${getRoleBadgeColor(user.role)}`}>
                  {user.role}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  // Info Panel Component
  const InfoPanel = () => (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-3 bg-[#252525] border-b border-[#3a3a3a]">
        <div className="flex items-center gap-2 text-gray-300">
          <Info className="w-4 h-4" />
          <span className="text-sm font-semibold">Conversation Info</span>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4">
        {selectedConv ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-gray-400 mb-2">Status</p>
              <Badge variant="outline" className={
                selectedConv.status === 'active' ? 'bg-muted/30/10 text-green-500 border-primary/20' :
                selectedConv.status === 'resolved' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                'bg-gray-500/10 text-gray-500 border-gray-500/20'
              }>
                {selectedConv.status}
              </Badge>
            </div>
            
            <Separator className="bg-[#3a3a3a]" />
            
            <div>
              <p className="text-gray-400 mb-2">Priority</p>
              <Badge variant="outline" className={
                selectedConv.priority === 'urgent' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                selectedConv.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                'bg-blue-500/10 text-blue-500 border-blue-500/20'
              }>
                {selectedConv.priority}
              </Badge>
            </div>

            <Separator className="bg-[#3a3a3a]" />

            <div>
              <p className="text-gray-400 mb-2">Voice Status</p>
              <div className="flex items-center gap-2">
                {selectedConv.isSilenced ? (
                  <>
                    <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                      <MicOff className="w-3 h-3 mr-1" />
                      Silenced
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => grantVoice.mutate(selectedConv.id)}
                      disabled={grantVoice.isPending}
                      className="bg-green-600 hover:bg-green-700 h-7"
                      data-testid="button-grant-voice"
                    >
                      <Mic className="w-3 h-3 mr-1" />
                      Grant Voice
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="bg-muted/30/10 text-green-500 border-primary/20">
                    <Mic className="w-3 h-3 mr-1" />
                    Has Voice
                  </Badge>
                )}
              </div>
            </div>

            <Separator className="bg-[#3a3a3a]" />

            <div>
              <p className="text-gray-400 mb-2">Created</p>
              <p className="text-white text-sm">
                {selectedConv.createdAt ? new Date(selectedConv.createdAt).toLocaleString() : 'N/A'}
              </p>
            </div>

            {selectedConv.lastMessageAt && (
              <>
                <Separator className="bg-[#3a3a3a]" />
                <div>
                  <p className="text-gray-400 mb-2">Last Message</p>
                  <p className="text-white text-sm">
                    {new Date(selectedConv.lastMessageAt as Date).toLocaleString()}
                  </p>
                </div>
              </>
            )}

            {selectedConv.voiceGrantedAt && (
              <>
                <Separator className="bg-[#3a3a3a]" />
                <div>
                  <p className="text-gray-400 mb-2">Voice Granted</p>
                  <p className="text-white text-sm">
                    {new Date(selectedConv.voiceGrantedAt as Date).toLocaleString()}
                  </p>
                </div>
              </>
            )}

            <Separator className="bg-[#3a3a3a]" />

            <div>
              <p className="text-gray-400 mb-2">Workspace ID</p>
              <p className="text-white font-mono text-xs break-all">
                {selectedConv.workspaceId}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select a conversation to view details</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Chat Panel Component
  const ChatPanel = () => (
    <div className="h-full flex flex-col bg-[#2b2b2b]">
      {/* Current Room Header */}
      <div className="px-3 py-3 bg-[#252525] border-b border-[#3a3a3a] flex items-center gap-2 min-h-[56px]">
        {/* Back button for mobile */}
        {selectedConv && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedConversation(null)}
            className="lg:hidden flex-shrink-0 min-h-[40px] min-w-[40px]"
            data-testid="button-back-to-rooms"
          >
            <X className="w-4 h-4 text-white" />
          </Button>
        )}
        <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {selectedConv ? (
          <>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">
                Room #{selectedConv.id.slice(0, 8)}
              </h3>
              <p className="text-xs text-gray-400 truncate">
                Workspace: {selectedConv.workspaceId.slice(0, 8)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="outline" className={
                selectedConv.priority === 'urgent' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                selectedConv.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                'bg-blue-500/10 text-blue-500 border-blue-500/20'
              }>
                {selectedConv.priority}
              </Badge>
              {selectedConv.isSilenced && (
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                  <MicOff className="w-3 h-3 mr-1" />
                  Silenced
                </Badge>
              )}
            </div>
          </>
        ) : (
          <span className="text-gray-500 text-sm">No room selected</span>
        )}
      </div>

      {/* Messages Area - Classic IRC Style */}
      <ScrollArea className="flex-1 p-3 md:p-4">
        {!selectedConversation ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        ) : messagesLoading ? (
          <div className="text-gray-500 text-center py-8">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No messages yet. Start the conversation!</div>
        ) : (
          <div className="space-y-1.5 font-mono text-xs md:text-sm" data-testid="messages-container">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 flex-wrap ${
                  msg.senderType === 'system' ? 'text-yellow-500 italic' :
                  msg.senderType === 'bot' ? 'text-purple-400' :
                  'text-gray-300'
                }`}
                data-testid={`message-${msg.id}`}
              >
                <span className="text-gray-500 text-xs flex-shrink-0">
                  [{formatTime(msg.createdAt)}]
                </span>
                <span className={`flex items-center gap-1 flex-shrink-0 ${
                  msg.senderType === 'support' ? 'text-blue-400 font-semibold' :
                  msg.senderType === 'customer' ? 'text-green-400 font-semibold' :
                  msg.senderType === 'bot' ? 'text-purple-400 font-semibold' :
                  'text-gray-400'
                }`}>
                  {msg.senderType === 'support' && <Headphones className="w-3 h-3 inline" />}
                  {msg.senderType === 'bot' && <Bot className="w-3 h-3 inline" />}
                  {msg.senderName}:
                </span>
                <span className="text-white break-words flex-1 min-w-0">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input - Classic IRC Style */}
      {selectedConversation && (
        <div className="p-3 bg-[#1e1e1e] border-t border-[#3a3a3a]">
          {selectedConv?.isSilenced ? (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded">
              <MicOff className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-400">
                User is silenced. Grant voice to allow messaging.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-[#2b2b2b] border-[#3a3a3a] text-white placeholder:text-gray-500 font-mono min-h-[44px]"
                disabled={sendMessage.isPending}
                autoFocus
                data-testid="input-message"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!messageText.trim() || sendMessage.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 min-h-[44px] min-w-[44px]"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#2b2b2b]">
      {/* Classic MSN/IRC Header */}
      <div className="bg-[#1a1a1a] border-b border-[#3a3a3a] px-3 md:px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2 rounded flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base md:text-lg font-bold text-white truncate" data-testid="text-chat-title">
                WorkforceOS Support Chat
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">Live Support Helpdesk • AI-Powered</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-muted/30/10 text-green-500 border-primary/20 hidden sm:flex">
              <Circle className="w-2 h-2 fill-green-500 mr-1" />
              {onlineUsers.filter(u => u.status === 'online').length} Online
            </Badge>
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden min-h-[44px] min-w-[44px]"
              data-testid="button-mobile-menu"
            >
              {showMobileMenu ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Tabs (visible on small screens) */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0">
        <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as any)} className="flex-1 flex flex-col">
          <TabsList className="w-full rounded-none bg-[#1e1e1e] border-b border-[#3a3a3a] p-0 h-auto">
            <TabsTrigger 
              value="chat" 
              className="flex-1 rounded-none data-[state=active]:bg-[#2b2b2b] data-[state=active]:text-white py-3 min-h-[48px]"
              data-testid="tab-chat"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Rooms ({conversations.length})
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="flex-1 rounded-none data-[state=active]:bg-[#2b2b2b] data-[state=active]:text-white py-3 min-h-[48px]"
              data-testid="tab-users"
            >
              <Users className="w-4 h-4 mr-2" />
              Staff ({onlineUsers.length})
            </TabsTrigger>
            <TabsTrigger 
              value="info" 
              className="flex-1 rounded-none data-[state=active]:bg-[#2b2b2b] data-[state=active]:text-white py-3 min-h-[48px]"
              data-testid="tab-info"
            >
              <Info className="w-4 h-4 mr-2" />
              Info
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 m-0 min-h-0">
            {/* Show room list and selected chat on mobile */}
            {!selectedConversation ? (
              <RoomListPanel />
            ) : (
              <ChatPanel />
            )}
          </TabsContent>
          <TabsContent value="users" className="flex-1 m-0 min-h-0">
            <UserListPanel />
          </TabsContent>
          <TabsContent value="info" className="flex-1 m-0 min-h-0">
            <InfoPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop 3-Column Layout (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Left Column: Room List */}
        <div className="w-64 border-r border-[#3a3a3a]">
          <RoomListPanel />
        </div>

        {/* Center Column: Chat Messages */}
        <div className="flex-1 min-w-0">
          <ChatPanel />
        </div>

        {/* Right Column: Info Panel with Tabs */}
        <div className="w-80 border-l border-[#3a3a3a] flex flex-col">
          <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full rounded-none bg-[#252525] border-b border-[#3a3a3a] p-0 h-auto">
              <TabsTrigger 
                value="info" 
                className="flex-1 rounded-none data-[state=active]:bg-[#1e1e1e] data-[state=active]:text-white py-2 text-xs"
              >
                <Info className="w-3 h-3 mr-1" />
                Room Info
              </TabsTrigger>
              <TabsTrigger 
                value="staff" 
                className="flex-1 rounded-none data-[state=active]:bg-[#1e1e1e] data-[state=active]:text-white py-2 text-xs"
              >
                <Users className="w-3 h-3 mr-1" />
                Staff ({onlineUsers.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="flex-1 m-0 min-h-0">
              <InfoPanel />
            </TabsContent>
            <TabsContent value="staff" className="flex-1 m-0 min-h-0">
              <UserListPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Classic IRC Status Bar */}
      <div className="bg-[#1a1a1a] border-t border-[#3a3a3a] px-3 md:px-4 py-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 md:gap-4 text-gray-400 overflow-hidden">
          <span className="hidden sm:inline">WorkforceOS IRC v2.0</span>
          <span className="hidden sm:inline">•</span>
          <span className="truncate">{conversations.length} conversations</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{messages.length} messages</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline flex items-center gap-1">
            <Bot className="w-3 h-3 text-purple-400" />
            help_bot online
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Circle className={`w-2 h-2 fill-green-500`} />
          <span className="text-green-500">Connected</span>
        </div>
      </div>
    </div>
  );
}
