import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { 
  MessageSquare, Send, Users, Circle, Shield, 
  Headphones, User, Bot, Sparkles, Wifi, WifiOff
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
  const { data: currentUser } = useQuery<{ user: { id: string; email: string } }>({
    queryKey: ["/api/auth/me"],
  });
  
  const userId = currentUser?.user?.id;
  const userName = currentUser?.user?.email || 'User';
  
  // Use WebSocket for real-time messaging
  const { messages, sendMessage, isConnected, error, reconnect } = useChatroomWebSocket(
    userId,
    userName
  );

  // Static online users (would be WebSocket-based in production)
  const [onlineUsers] = useState<OnlineUser[]>([
    { id: 'bot-1', name: 'help_bot', role: 'bot', status: 'online' },
    { id: userId || '1', name: userName, role: 'admin', status: 'online' },
    { id: '2', name: 'Support Mike', role: 'support', status: 'online' },
    { id: '3', name: 'Support Lisa', role: 'support', status: 'online' },
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "Not connected to chat server. Reconnecting...",
        variant: "destructive",
      });
      reconnect();
      return;
    }

    sendMessage(messageText.trim(), userName, 'support');
    setMessageText("");
  };

  // Show error toast when connection issues occur
  useEffect(() => {
    if (error) {
      toast({
        title: "Connection Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Auto-scroll to bottom when new messages arrive
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

  const formatTime = (date: Date | string | null) => {
    if (!date) return '';
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                <span className="text-sm font-medium">{onlineUsers.length} Online</span>
              </div>
              <Badge 
                variant={isConnected ? "default" : "destructive"} 
                className="gap-1"
                data-testid="badge-connection-status"
              >
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Disconnected
                  </>
                )}
              </Badge>
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
                <p className="text-sm text-muted-foreground mb-2">
                  Start the conversation - messages appear <strong>instantly</strong> for all users
                </p>
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="w-3 h-3" />
                  Real-time WebSocket messaging
                </Badge>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.senderId === userId;
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
                    data-testid={`message-${msg.id}`}
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
              placeholder={isConnected ? "Type your message..." : "Connecting..."}
              className="flex-1"
              data-testid="input-chat-message"
              autoFocus
              disabled={!isConnected}
            />
            <Button 
              type="submit" 
              disabled={!messageText.trim() || !isConnected}
              data-testid="button-send-message"
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            <strong>Instant delivery</strong> via WebSocket • IRC/MSN-style live messaging
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
                  data-testid={`user-${user.id}`}
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
