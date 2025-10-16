import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, Send, Users, Circle, Shield, 
  Headphones, User, Bot, Sparkles
} from "lucide-react";
import type { ChatMessage } from "@shared/schema";

interface OnlineUser {
  id: string;
  name: string;
  role: 'admin' | 'support' | 'customer' | 'bot';
  status: 'online';
}

export default function LiveChatroomPage() {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Get current user data
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/me"],
  });
  
  // Get or create the MAIN chatroom conversation (always ID: 'main-chatroom')
  const { data: mainRoom } = useQuery({
    queryKey: ["/api/chat/main-room"],
    retry: false,
  });

  // Poll for ALL messages in the main room every 1 second for live updates
  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/main-room/messages"],
    refetchInterval: 1000, // 1 second for live feel
  });

  // Static online users (would be WebSocket-based in production)
  const [onlineUsers] = useState<OnlineUser[]>([
    { id: 'bot-1', name: 'help_bot', role: 'bot', status: 'online' },
    { id: currentUser?.user?.id || '1', name: currentUser?.user?.email || 'You', role: 'admin', status: 'online' },
    { id: '2', name: 'Support Mike', role: 'support', status: 'online' },
    { id: '3', name: 'Support Lisa', role: 'support', status: 'online' },
  ]);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("/api/chat/main-room/messages", "POST", { 
        message: content,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/main-room/messages"] });
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    sendMessage.mutate(messageText.trim());
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getRoleIcon = (senderType: string) => {
    switch (senderType) {
      case 'support':
        if (senderType.includes('Admin')) {
          return <Shield className="w-3 h-3 text-red-500" />;
        }
        return <Headphones className="w-3 h-3 text-blue-500" />;
      case 'bot':
      case 'system':
        return <Bot className="w-3 h-3 text-purple-500" />;
      default:
        return <User className="w-3 h-3 text-gray-500" />;
    }
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-primary" />
                <div>
                  <h1 className="text-xl font-bold">WorkforceOS Support Chat</h1>
                  <p className="text-sm text-muted-foreground">Live Support Helpdesk • AI-Powered</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-green-500 text-green-500" />
              <span className="text-sm font-medium">{onlineUsers.length} Online</span>
            </div>
          </div>
        </div>

        {/* Messages Feed */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <MessageSquare className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Welcome to the chatroom!</h3>
                <p className="text-sm text-muted-foreground">
                  Start the conversation - messages appear here in real-time
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.senderId === currentUser?.user?.id;
                const isSystemMessage = msg.senderType === 'system';
                
                if (isSystemMessage) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {msg.message}
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-1 min-w-[60px]">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        msg.senderType === 'support' ? 'bg-blue-500/10' :
                        msg.senderType === 'bot' ? 'bg-purple-500/10' :
                        'bg-muted'
                      }`}>
                        {getRoleIcon(msg.senderType)}
                      </div>
                      <span className="text-xs text-muted-foreground text-center leading-tight">
                        {msg.senderName}
                      </span>
                    </div>
                    
                    <div className={`flex-1 max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      <div className={`rounded-lg px-4 py-2 ${
                        isOwnMessage 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground px-1">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message Input */}
        <div className="border-t p-4 bg-card">
          <form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              className="flex-1"
              data-testid="input-chat-message"
              autoFocus
            />
            <Button 
              type="submit" 
              disabled={!messageText.trim() || sendMessage.isPending}
              data-testid="button-send-message"
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Messages appear instantly for all online users
          </p>
        </div>
      </div>

      {/* Right Sidebar - Online Users */}
      <div className="w-64 border-l bg-card p-4 hidden md:block">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Online ({onlineUsers.length})
            </h3>
            <div className="space-y-2">
              {onlineUsers.map((user) => (
                <div 
                  key={user.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover-elevate"
                >
                  <Circle className="w-2 h-2 fill-green-500 text-green-500 flex-shrink-0" />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {user.role === 'admin' && <Shield className="w-3 h-3 text-red-500 flex-shrink-0" />}
                    {user.role === 'support' && <Headphones className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                    {user.role === 'bot' && <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />}
                    <span className="text-sm font-medium truncate">{user.name}</span>
                  </div>
                  {user.role === 'bot' && (
                    <Sparkles className="w-3 h-3 text-purple-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="p-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Sparkles className="w-3 h-3" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xs text-muted-foreground">
                help_bot is powered by GPT-4 and can assist with common questions instantly.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
