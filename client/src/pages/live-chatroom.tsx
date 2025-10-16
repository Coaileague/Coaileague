import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  MessageSquare, Send, Users, Circle, Shield, 
  Headphones, User, Bot, Sparkles, Wifi, WifiOff,
  Lock, Settings, AlertCircle, CheckCircle, Menu, X
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
  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketEmail, setTicketEmail] = useState("");
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showStaffControls, setShowStaffControls] = useState(false);
  const [showMobileUsers, setShowMobileUsers] = useState(false);
  const [roomStatusControl, setRoomStatusControl] = useState<"open" | "closed" | "maintenance">("open");
  const [roomStatusMessage, setRoomStatusMessage] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Get current user data
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<{ user: { id: string; email: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  
  const userId = currentUser?.user?.id;
  const userName = currentUser?.user?.email || 'Guest';
  const isStaff = currentUser?.user?.platformRole && 
    ['platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(currentUser.user.platformRole);
  const isAuthenticated = !!currentUser?.user;
  
  // Fetch HelpDesk room info
  const { data: helpDeskRoom } = useQuery<{ status: string; statusMessage: string | null }>({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: !!userId,
    retry: false,
  });
  
  // Use WebSocket for real-time messaging
  const { 
    messages, sendMessage, isConnected, error, reconnect,
    requiresTicket, roomStatus, statusMessage: wsStatusMessage, temporaryError, clearAccessError
  } = useChatroomWebSocket(userId, userName);

  // Show ticket dialog if not authenticated
  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      setShowTicketDialog(true);
    }
  }, [isLoadingUser, isAuthenticated]);

  // Ticket authentication mutation (for guests)
  const authenticateTicketMutation = useMutation({
    mutationFn: async ({ ticketNumber, email }: { ticketNumber: string; email: string }) => {
      const result = await apiRequest('POST', '/api/helpdesk/authenticate-ticket', {
        ticketNumber,
        email,
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setShowTicketDialog(false);
      setTicketNumber("");
      setTicketEmail("");
      toast({
        title: "Authentication Successful",
        description: "Welcome to Live Chat! You can now message our support team.",
      });
      window.location.reload(); // Reload to get new session
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Invalid ticket number or email",
        variant: "destructive",
      });
    },
  });

  // Room status toggle mutation (staff only)
  const toggleRoomStatusMutation = useMutation({
    mutationFn: async ({ status, message }: { status: string; message: string }) => {
      const result = await apiRequest('POST', `/api/helpdesk/room/helpdesk/status`, {
        status,
        statusMessage: message || null,
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/helpdesk/room/helpdesk'] });
      setShowStaffControls(false);
      toast({
        title: "Room Status Updated",
        description: "HelpDesk room status has been changed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update room status",
        variant: "destructive",
      });
    },
  });

  // Online users
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

    // Send as support if staff, otherwise as customer
    const senderRole = isStaff ? 'support' : 'customer';
    sendMessage(messageText.trim(), userName, senderRole);
    setMessageText("");
  };

  // Sync staff controls state with server data
  useEffect(() => {
    if (helpDeskRoom) {
      setRoomStatusControl(helpDeskRoom.status as "open" | "closed" | "maintenance");
      setRoomStatusMessage(helpDeskRoom.statusMessage || "");
    }
  }, [helpDeskRoom]);

  // Show ticket verification dialog when access is denied
  useEffect(() => {
    if (requiresTicket && !isStaff) {
      setShowTicketDialog(true);
    }
  }, [requiresTicket, isStaff]);

  // Show error toast when connection issues occur
  useEffect(() => {
    if (error && !requiresTicket) {
      toast({
        title: temporaryError ? "Temporary Error" : "Connection Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, requiresTicket, temporaryError, toast]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getRoleIcon = (senderType: string) => {
    switch (senderType) {
      case 'support':
        return <Headphones className="w-3 h-3 text-blue-500" />;
      case 'bot':
      case 'system':
        return <Bot className="w-3 h-3 text-purple-500" />;
      default:
        return <User className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const statusBadge = helpDeskRoom && (
    <Badge 
      variant={helpDeskRoom.status === 'open' ? 'default' : 'secondary'}
      className="gap-1 flex-shrink-0"
      data-testid="badge-room-status"
    >
      {helpDeskRoom.status === 'open' ? (
        <>
          <Circle className="w-2 h-2 fill-green-500 text-green-500" />
          <span className="hidden sm:inline">Open</span>
        </>
      ) : helpDeskRoom.status === 'closed' ? (
        <>
          <Circle className="w-2 h-2 fill-red-500 text-red-500" />
          <span className="hidden sm:inline">Closed</span>
        </>
      ) : (
        <>
          <Circle className="w-2 h-2 fill-yellow-500 text-yellow-500" />
          <span className="hidden sm:inline">Maintenance</span>
        </>
      )}
    </Badge>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header - Clean and Organized */}
      <header className="border-b bg-card px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">
                HelpDesk
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {helpDeskRoom?.statusMessage || "Live Support"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge}
            
            <Badge 
              variant={isConnected ? "default" : "secondary"} 
              className="gap-1 hidden sm:flex"
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

            {isStaff && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStaffControls(true)}
                data-testid="button-staff-controls"
                className="gap-2 hidden sm:flex"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">Controls</span>
              </Button>
            )}

            {/* Mobile users list trigger */}
            <Sheet open={showMobileUsers} onOpenChange={setShowMobileUsers}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden"
                  data-testid="button-mobile-users"
                >
                  <Users className="w-4 h-4" />
                  <span className="ml-1">{onlineUsers.length}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Online ({onlineUsers.length})
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2">
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
                    </div>
                  ))}
                </div>

                {isStaff && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowMobileUsers(false);
                        setShowStaffControls(true);
                      }}
                      data-testid="button-staff-controls-mobile"
                      className="w-full gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Staff Controls
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content - Artifact Style Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center">
                    <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <h3 className="font-semibold mb-2">Welcome to HelpDesk</h3>
                    <p className="text-sm text-muted-foreground">
                      Your messages will appear here. Start a conversation with our support team.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                messages.map((message, index) => {
                  const isBot = message.senderType === 'bot' || message.senderType === 'system';
                  const isSupport = message.senderType === 'support';
                  
                  return (
                    <div
                      key={message.id || index}
                      className={`flex ${isSupport || isBot ? 'justify-start' : 'justify-end'}`}
                      data-testid={`message-${message.id || index}`}
                    >
                      <div className={`max-w-[85%] sm:max-w-[70%]`}>
                        {/* Message Header */}
                        <div className={`flex items-center gap-2 mb-1 ${isSupport || isBot ? '' : 'justify-end'}`}>
                          {(isSupport || isBot) && getRoleIcon(message.senderType)}
                          <span className="text-xs font-medium">{message.senderName || 'User'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(message.createdAt)}
                          </span>
                        </div>
                        
                        {/* Message Bubble */}
                        <div 
                          className={`rounded-lg p-3 ${
                            isBot 
                              ? 'bg-purple-500/10 border border-purple-500/20 text-foreground' 
                              : isSupport
                              ? 'bg-primary/10 border border-primary/20 text-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {message.message}
                          </p>
                          {isBot && (
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-purple-500/20">
                              <Sparkles className="w-3 h-3 text-purple-500" />
                              <span className="text-xs text-muted-foreground">AI Assistant</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Message Input - Fixed Bottom */}
          <div className="border-t bg-card p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSendMessage} className="flex gap-2">
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
                  className="gap-2 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
              <p className="text-xs text-muted-foreground text-center mt-2 hidden sm:block">
                <Wifi className="w-3 h-3 inline mr-1" />
                Instant delivery via WebSocket
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Online Users Sidebar */}
        <div className="w-64 border-l bg-card p-4 hidden md:block flex-shrink-0">
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

      {/* Ticket Authentication Dialog */}
      <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
        <DialogContent data-testid="dialog-ticket-verification">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Live Chat Authentication
            </DialogTitle>
            <DialogDescription>
              Enter your support ticket number and email to access Live Chat. Don't have a ticket? <a href="/contact" className="underline text-primary">Create one here</a>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ticket-number">Support Ticket Number</Label>
              <Input
                id="ticket-number"
                placeholder="e.g., TKT-ABCD1234"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                data-testid="input-ticket-number"
              />
              <p className="text-xs text-muted-foreground">
                The ticket number you received after submitting a support request
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-email">Email Address</Label>
              <Input
                id="ticket-email"
                type="email"
                placeholder="your.email@company.com"
                value={ticketEmail}
                onChange={(e) => setTicketEmail(e.target.value)}
                data-testid="input-ticket-email"
              />
              <p className="text-xs text-muted-foreground">
                The email you used when creating the support ticket
              </p>
            </div>
            {wsStatusMessage && (
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                    <p className="text-sm text-destructive">{wsStatusMessage}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => window.location.href = "/contact"}
                data-testid="button-create-ticket"
              >
                Create Ticket
              </Button>
              <Button
                onClick={() => authenticateTicketMutation.mutate({ ticketNumber, email: ticketEmail })}
                disabled={!ticketNumber.trim() || !ticketEmail.trim() || authenticateTicketMutation.isPending}
                data-testid="button-verify-ticket"
                className="gap-2"
              >
                {authenticateTicketMutation.isPending ? (
                  <>Authenticating...</>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Authenticate
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff Controls Dialog */}
      <Dialog open={showStaffControls} onOpenChange={setShowStaffControls}>
        <DialogContent data-testid="dialog-staff-controls">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              HelpDesk Staff Controls
            </DialogTitle>
            <DialogDescription>
              Manage HelpDesk room status and access control. Changes apply immediately to all users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-status">Room Status</Label>
              <Select
                value={roomStatusControl}
                onValueChange={(value: any) => setRoomStatusControl(value)}
              >
                <SelectTrigger id="room-status" data-testid="select-room-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex items-center gap-2">
                      <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                      Open - Everyone can join
                    </div>
                  </SelectItem>
                  <SelectItem value="closed">
                    <div className="flex items-center gap-2">
                      <Circle className="w-2 h-2 fill-red-500 text-red-500" />
                      Closed - No new access
                    </div>
                  </SelectItem>
                  <SelectItem value="maintenance">
                    <div className="flex items-center gap-2">
                      <Circle className="w-2 h-2 fill-yellow-500 text-yellow-500" />
                      Maintenance - Staff only
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-message">Status Message (Optional)</Label>
              <Textarea
                id="status-message"
                placeholder="e.g., 'Closed for the weekend' or 'System maintenance in progress'"
                value={roomStatusMessage}
                onChange={(e) => setRoomStatusMessage(e.target.value)}
                rows={3}
                data-testid="textarea-status-message"
              />
              <p className="text-xs text-muted-foreground">
                This message will be shown to users trying to access the room.
              </p>
            </div>
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-blue-500 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Staff Bypass</p>
                    <p className="text-muted-foreground">
                      Platform staff can always access the room, even when closed or under maintenance.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowStaffControls(false)}
                data-testid="button-cancel-controls"
              >
                Cancel
              </Button>
              <Button
                onClick={() => toggleRoomStatusMutation.mutate({ 
                  status: roomStatusControl, 
                  message: roomStatusMessage 
                })}
                disabled={toggleRoomStatusMutation.isPending}
                data-testid="button-apply-controls"
                className="gap-2"
              >
                {toggleRoomStatusMutation.isPending ? (
                  <>Applying...</>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Apply Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
