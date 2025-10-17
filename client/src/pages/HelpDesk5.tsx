import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import "../styles/chat-animations.css"; // Import animations
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useChatSounds } from "@/hooks/use-chat-sounds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { SupportMobileMenu } from "@/components/support-mobile-menu";
import { SecureRequestDialog } from "@/components/secure-request-dialog";
import { BrandedConfirmDialog } from "@/components/branded-input-dialog";
import { ChatAnnouncementBanner } from "@/components/chat-announcement-banner";
import { BannerEditorDialog } from "@/components/banner-editor-dialog";
import { ChatTutorialSlides } from "@/components/chat-tutorial-slides";
import { QueueViewerDialog } from "@/components/queue-viewer-dialog";
import { 
  MessageSquare, Send, Users, Circle, Shield, 
  Headphones, User, Bot, Sparkles, Wifi, WifiOff,
  Lock, Settings, AlertCircle, CheckCircle, Menu, X,
  ArrowLeft, MoreVertical, ArrowDown
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
  const [workId, setWorkId] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [authMode, setAuthMode] = useState<"customer" | "staff">("customer");
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showStaffControls, setShowStaffControls] = useState(false);
  const [showMobileUsers, setShowMobileUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showUserActions, setShowUserActions] = useState(false);
  const [secureRequest, setSecureRequest] = useState<{
    type: 'authenticate' | 'document' | 'photo' | 'signature' | 'info';
    requestedBy: string;
    message?: string;
  } | null>(null);
  const [roomStatusControl, setRoomStatusControl] = useState<"open" | "closed" | "maintenance">("open");
  const [roomStatusMessage, setRoomStatusMessage] = useState("");
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [customBannerMessages, setCustomBannerMessages] = useState<any[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [confirmKick, setConfirmKick] = useState<{ userId: string; userName: string } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAtBottomRef = useRef(true);
  const { toast } = useToast();
  const { playSound } = useChatSounds();
  
  // Get current user data
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<{ user: { id: string; email: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    retryOnMount: false,
    staleTime: Infinity, // Never refetch automatically
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  
  const userId = currentUser?.user?.id;
  const userName = currentUser?.user?.email || 'Guest';
  const isStaff = currentUser?.user?.platformRole && 
    ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(currentUser.user.platformRole);
  const isAuthenticated = !!currentUser?.user;
  
  // Fetch HelpDesk room info (only if authenticated)
  const { data: helpDeskRoom } = useQuery<{ status: string; statusMessage: string | null }>({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: !!userId && isAuthenticated,
    retry: false,
    staleTime: 30000,
  });

  // Fetch queue data for visual dialog and banner
  const { data: queueData } = useQuery<any[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isAuthenticated,
    refetchInterval: 5000, // Refresh every 5s
  });
  
  // Calculate queue position - return actual position or null if not in queue
  const queuePosition = (() => {
    if (!queueData || !userId) return null;
    const index = queueData.findIndex(entry => entry.userId === userId);
    return index >= 0 ? index + 1 : null;
  })();
  
  // Use WebSocket for real-time messaging (only if authenticated)
  const { 
    messages, sendMessage, sendTyping, sendRawMessage, typingUsers, onlineUsers, isConnected, error, reconnect,
    requiresTicket, roomStatus, statusMessage: wsStatusMessage, temporaryError, clearAccessError
  } = useChatroomWebSocket(isAuthenticated ? userId : undefined, userName);
  
  const selectedUser = onlineUsers.find(u => u.id === selectedUserId);
  
  // Helper to send quick messages
  const sendQuickMessage = (message: string) => {
    if (message.trim() && isConnected) {
      sendMessage(message, userName, 'support');
    }
  };
  
  // Mobile detection (touch device check)
  const isMobileDevice = () => {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  };
  
  // Dynamic banner messages with rotation (properly capitalized and grammatically correct)
  const bannerMessages = [
    "Live Support Chat - Get instant help from our support team and AI assistant",
    "Support staff are online and ready to assist you",
    "💡 Tip: Visit our FAQ section while you wait for faster answers",
    "Average wait time: 2-5 minutes - We appreciate your patience",
    "✨ Powered by HelpOS™ AI - Smart support queue management",
    "📋 All conversations are logged for quality assurance and training",
  ];
  
  // Rotate banner messages every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % bannerMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Show ticket dialog if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      // Small delay to prevent showing dialog during navigation
      const timer = setTimeout(() => {
        setShowTicketDialog(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoadingUser, isAuthenticated]);

  // Ticket authentication mutation (for customer guests)
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

  // Staff work ID authentication mutation (for staff guests)
  const authenticateWorkIdMutation = useMutation({
    mutationFn: async ({ workId, email }: { workId: string; email: string }) => {
      const result = await apiRequest('POST', '/api/helpdesk/authenticate-workid', {
        workId,
        email,
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setShowTicketDialog(false);
      setWorkId("");
      setWorkEmail("");
      toast({
        title: "Staff Authentication Successful",
        description: "Welcome! You now have staff access to Live Chat.",
      });
      window.location.reload(); // Reload to get new session
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Invalid work ID or email",
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

  // Online users now come from WebSocket (includes HelpOS™ bot + connected users)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessageText(value);
    
    // Send typing indicator (debounced)
    if (value.trim() && isConnected) {
      sendTyping(true);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing indicator after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 2000);
    } else if (!value.trim()) {
      // Stop typing indicator if input is empty
      sendTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };
  
  const handleSendMessage = (e?: React.FormEvent, text?: string) => {
    if (e) e.preventDefault();
    const msgToSend = text || messageText;
    if (!msgToSend.trim()) return;
    
    // INTERCEPT /queue command to show visual dialog
    if (msgToSend.trim() === '/queue') {
      setShowQueueDialog(true);
      setMessageText("");
      return;
    }
    
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "Not connected to chat server. Reconnecting...",
        variant: "destructive",
      });
      reconnect();
      return;
    }
    
    // Stop typing indicator when sending
    sendTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Play send sound
    playSound('send');

    // Send as support if staff, otherwise as customer
    const senderRole = isStaff ? 'support' : 'customer';
    sendMessage(msgToSend.trim(), userName, senderRole);
    setMessageText("");
  };

  const handleCommandSelect = (command: string) => {
    handleSendMessage(undefined, command);
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

  // Show tutorial to new non-staff users
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('helpdesk-tutorial-seen');
    if (isAuthenticated && isConnected && !isStaff && !hasSeenTutorial) {
      // Small delay to let chat load first
      setTimeout(() => {
        setShowTutorial(true);
        localStorage.setItem('helpdesk-tutorial-seen', 'true');
      }, 1000);
    }
  }, [isAuthenticated, isConnected, isStaff]);

  // Handle scroll position and unread count
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    
    isAtBottomRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom);
    
    // Reset unread when scrolling to bottom
    if (isNearBottom) {
      setUnreadCount(0);
    }
  }, []);
  
  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
    setShowScrollButton(false);
  }, []);
  
  // Auto-scroll to bottom when new messages arrive + play receive sound
  useEffect(() => {
    // Only auto-scroll if user is already at bottom
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      // User is scrolled up - increment unread counter
      if (messages.length > previousMessageCountRef.current && previousMessageCountRef.current > 0) {
        setUnreadCount(prev => prev + 1);
      }
    }
    
    // Play receive sound when new messages arrive (but not on initial load)
    if (messages.length > previousMessageCountRef.current && previousMessageCountRef.current > 0) {
      const latestMessage = messages[messages.length - 1];
      
      // Only play sound for messages not sent by current user
      if (latestMessage && !latestMessage.message?.includes(userName)) {
        // Check if it's a join/leave message
        if (latestMessage.isSystemMessage) {
          if (latestMessage.message?.includes('joined')) {
            playSound('join');
          } else if (latestMessage.message?.includes('left')) {
            playSound('leave');
          }
        } else {
          // Regular message received
          playSound('receive');
        }
      }
    }
    
    previousMessageCountRef.current = messages.length;
  }, [messages, userName, playSound]);

  const getRoleIcon = (senderName: string, senderType: string) => {
    // Special icons for specific roles
    if (senderName.startsWith('Root ')) {
      return <Shield className="w-3.5 h-3.5 text-red-400" />; // 🛡️ Root = Shield (red)
    }
    if (senderName.startsWith('Sysop ') || senderName.startsWith('Admin ') || senderName.startsWith('Deputy ')) {
      return <Shield className="w-3.5 h-3.5 text-amber-400" />; // 🛡️ Sysop/Admin = Shield (amber)
    }
    if (senderName.startsWith('Subscriber ')) {
      return <span className="text-sm">⭐</span>; // Star for subscribers
    }
    if (senderName.startsWith('Guest ')) {
      return <span className="text-sm">💬</span>; // Speech bubble for guests
    }
    
    // Standard type-based icons
    switch (senderType) {
      case 'support':
        return <Headphones className="w-3.5 h-3.5 text-indigo-400" />;
      case 'bot':
      case 'system':
        return <Bot className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-slate-400" />;
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
      {/* Professional Header with WorkforceOS Branding */}
      <header className="border-b border-slate-700/50 bg-slate-800/95 backdrop-blur-sm px-2 sm:px-4 py-3 sm:py-4 flex-shrink-0 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-4 min-w-0 flex-1">
            {/* Mobile Back Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = '/'}
              className="md:hidden text-white hover:bg-white/20 flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9"
              data-testid="button-mobile-back"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            
            {/* WorkforceOS Branding - Hidden on small mobile */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <WorkforceOSLogo size="sm" showText={false} />
              <div className="hidden sm:block h-8 w-px bg-white/30" />
            </div>
            
            {/* HelpDesk Title */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 bg-white/10 backdrop-blur-sm rounded-lg flex-shrink-0">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-lg font-bold truncate text-white">
                  DC360.5
                </h1>
                <p className="text-xs text-indigo-100 hidden sm:block flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
                  {helpDeskRoom?.statusMessage || "Instant Support · Real-Time Messaging"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Professional Status Badge */}
            <Badge 
              variant={helpDeskRoom?.status === 'open' ? 'default' : 'secondary'}
              className="gap-1 flex-shrink-0 bg-white/20 border-white/30 text-white hover-elevate"
              data-testid="badge-room-status"
            >
              {helpDeskRoom?.status === 'open' ? (
                <>
                  <Circle className="w-2 h-2 fill-blue-400 text-blue-400 animate-pulse" />
                  <span className="hidden sm:inline">Open</span>
                </>
              ) : helpDeskRoom?.status === 'closed' ? (
                <>
                  <Circle className="w-2 h-2 fill-red-400 text-red-400" />
                  <span className="hidden sm:inline">Closed</span>
                </>
              ) : (
                <>
                  <Circle className="w-2 h-2 fill-amber-400 text-amber-400 animate-pulse" />
                  <span className="hidden sm:inline">Maintenance</span>
                </>
              )}
            </Badge>
            
            <Badge 
              variant={isConnected ? "default" : "secondary"} 
              className="gap-1 hidden sm:flex bg-white/20 border-white/30 text-white"
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

            {/* Universal Support Menu - Staff Queue & Commands (Mobile Only) */}
            {isStaff && <SupportMobileMenu />}

            {isStaff && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStaffControls(true)}
                data-testid="button-staff-controls"
                className="gap-2 hidden sm:flex bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/40"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">Staff Controls</span>
              </Button>
            )}

            {/* Mobile users list trigger - Hidden (no users to display) */}
            {onlineUsers.length > 0 && (
              <Sheet open={showMobileUsers} onOpenChange={setShowMobileUsers}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="md:hidden bg-white/10 border-white/30 text-white hover:bg-white/20"
                    data-testid="button-mobile-users"
                  >
                    <Users className="w-4 h-4" />
                    <span className="ml-1">{onlineUsers.length}</span>
                  </Button>
                </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-slate-900 border-indigo-500/20">
                <SheetHeader className="flex flex-row items-center justify-between">
                  <SheetTitle className="flex items-center gap-2 text-indigo-100">
                    <Users className="w-4 h-4" />
                    Online ({onlineUsers.length})
                  </SheetTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowMobileUsers(false)}
                    className="h-6 w-6 text-slate-400 hover:text-white"
                    data-testid="button-close-mobile-users"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </SheetHeader>
                <div className="mt-4 space-y-2">
                  {onlineUsers.map((user) => {
                    const isActionable = isStaff && user.role !== 'root' && user.role !== 'bot';
                    return (
                      <div 
                        key={user.id}
                        onClick={() => {
                          if (isActionable) {
                            setSelectedUserId(user.id);
                            setShowUserActions(true);
                          }
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/40 border border-indigo-500/20 ${
                          isActionable
                            ? 'hover-elevate active-elevate-2 cursor-pointer' 
                            : ''
                        }`}
                        data-testid={`user-${user.id}`}
                      >
                        <Circle className="w-2 h-2 fill-blue-400 text-blue-400 flex-shrink-0 animate-pulse" />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {user.role === 'admin' && <Shield className="w-3 h-3 text-red-400 flex-shrink-0" />}
                          {user.role === 'support' && <Headphones className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
                          {user.role === 'bot' && <Bot className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                          <span className="text-sm font-medium break-words text-slate-200">{user.name}</span>
                        </div>
                        {isActionable && (
                          <MoreVertical className="w-4 h-4 text-emerald-400 flex-shrink-0 animate-pulse" />
                        )}
                      </div>
                    );
                  })}
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
                      className="w-full gap-2 bg-indigo-500/10 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20"
                    >
                      <Settings className="w-4 h-4" />
                      Staff Controls
                    </Button>
                  </div>
                )}
                
                {/* Back to Chat Button */}
                <div className="mt-4 pt-4 border-t border-indigo-500/20">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMobileUsers(false)}
                    data-testid="button-back-to-chat"
                    className="w-full gap-2 bg-slate-800/40 border-slate-600/30 text-slate-200 hover:bg-slate-700/40"
                  >
                    Back to Chat
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            )}
          </div>
        </div>
      </header>

      {/* Mobile User Actions Sheet - Smart Context Menu */}
      {selectedUser && (
        <Sheet open={showUserActions} onOpenChange={setShowUserActions}>
          <SheetContent side="bottom" className="bg-slate-900 border-indigo-500/20 rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-indigo-100">
                <User className="w-4 h-4" />
                Support Actions → {selectedUser.name}
              </SheetTitle>
            </SheetHeader>
            
            <div className="mt-6 space-y-2">
              {/* Release Hold & Welcome */}
              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'release_spectator', 
                    targetUserId: selectedUser.id 
                  });
                  sendQuickMessage(`Welcome ${selectedUser.name}! 👋 Thanks for your patience. How can I help you today?`);
                  setShowUserActions(false);
                  toast({ title: `Released ${selectedUser.name} from hold` });
                }}
                className="w-full justify-start gap-3 h-12 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500"
                data-testid="button-release-hold"
              >
                <Sparkles className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-semibold">Release Hold & Welcome</div>
                  <div className="text-xs opacity-90">Remove spectator + send greeting</div>
                </div>
              </Button>

              {/* Secure Requests */}
              <Button
                onClick={() => {
                  setSecureRequest({
                    type: 'authenticate',
                    requestedBy: userName,
                    message: 'Please verify your identity to proceed'
                  });
                  setShowUserActions(false);
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-12 bg-indigo-500/10 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20"
                data-testid="button-request-auth"
              >
                <Lock className="w-4 h-4" />
                Request Authentication
              </Button>

              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'request_secure', 
                    targetUserId: selectedUser.id,
                    requestType: 'document',
                    message: 'Please upload the requested document'
                  });
                  setShowUserActions(false);
                  toast({ title: `Document request sent to ${selectedUser.name}` });
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-slate-800/40 border-slate-600/30 text-slate-200"
                data-testid="button-request-document"
              >
                📄 Request Document Upload
              </Button>

              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'request_secure', 
                    targetUserId: selectedUser.id,
                    requestType: 'photo',
                    message: 'Please upload a photo of the issue'
                  });
                  setShowUserActions(false);
                  toast({ title: `Photo request sent to ${selectedUser.name}` });
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-slate-800/40 border-slate-600/30 text-slate-200"
                data-testid="button-request-photo"
              >
                📸 Request Photo
              </Button>

              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'request_secure', 
                    targetUserId: selectedUser.id,
                    requestType: 'signature',
                    message: 'Please sign the consent form'
                  });
                  setShowUserActions(false);
                  toast({ title: `E-Signature request sent to ${selectedUser.name}` });
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-slate-800/40 border-slate-600/30 text-slate-200"
                data-testid="button-request-signature"
              >
                ✍️ Request E-Signature
              </Button>

              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'request_secure', 
                    targetUserId: selectedUser.id,
                    requestType: 'info',
                    message: 'Please provide more details about your issue'
                  });
                  setShowUserActions(false);
                  toast({ title: `Info request sent to ${selectedUser.name}` });
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-slate-800/40 border-slate-600/30 text-slate-200"
                data-testid="button-request-info"
              >
                ℹ️ Request Additional Info
              </Button>

              <div className="border-t border-slate-700 my-2" />

              {/* Transfer & Resolve */}
              <Button
                onClick={() => {
                  sendRawMessage({ 
                    type: 'transfer_user', 
                    targetUserId: selectedUser.id 
                  });
                  setShowUserActions(false);
                  toast({ title: `Transferred ${selectedUser.name} to senior support` });
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-blue-500/10 border-blue-500/30 text-blue-200"
                data-testid="button-transfer-user"
              >
                🔄 Transfer to Senior Support
              </Button>

              <Button
                onClick={() => {
                  sendQuickMessage(`@${selectedUser.name} Your issue has been resolved! Is there anything else I can help you with today?`);
                  setShowUserActions(false);
                }}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 bg-green-500/10 border-green-500/30 text-green-200"
                data-testid="button-mark-resolved"
              >
                ✅ Mark Resolved
              </Button>

              {/* Cancel */}
              <Button
                onClick={() => setShowUserActions(false)}
                variant="ghost"
                className="w-full mt-4"
                data-testid="button-cancel-actions"
              >
                Cancel
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Secure Request Dialog - Appears when customer receives request */}
      {secureRequest && (
        <SecureRequestDialog
          open={true}
          requestType={secureRequest.type}
          requestedBy={secureRequest.requestedBy}
          requestMessage={secureRequest.message}
          onSubmit={(data) => {
            sendRawMessage({
              type: 'secure_submission',
              data,
              submissionType: secureRequest.type
            });
            setSecureRequest(null);
            toast({ title: 'Information submitted securely' });
          }}
          onClose={() => setSecureRequest(null)}
        />
      )}

      {/* Banner Editor Dialog - Staff only */}
      <BannerEditorDialog
        open={showBannerEditor}
        onOpenChange={setShowBannerEditor}
        currentMessages={customBannerMessages}
        onSave={(messages) => {
          setCustomBannerMessages(messages);
          // TODO: Broadcast to all users via WebSocket
        }}
      />

      {/* Main Content - Professional Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Subtle animated mesh background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950/10 via-slate-900/60 to-slate-800/40 pointer-events-none" />
          
          {/* Scroll to Bottom Button - Mobile Optimized Position */}
          {showScrollButton && (
            <Button
              onClick={scrollToBottom}
              size="icon"
              className="absolute bottom-28 right-4 z-50 rounded-full shadow-lg bg-blue-600 hover:bg-blue-500 text-white"
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
          
          {/* Messages */}
          <ScrollArea className="flex-1 p-4 relative z-10" onScroll={handleScroll as any}>
            <div className="max-w-full md:max-w-5xl mx-auto space-y-4 pb-32">
              {/* Interactive Announcement Banner - Full Width */}
              <div className="sticky top-0 z-50 -mx-4">
                <ChatAnnouncementBanner 
                  queuePosition={queuePosition ?? undefined}
                  queueWaitTime="2-3 minutes"
                  onlineStaff={onlineUsers.filter(u => u.role === 'support' || u.role === 'admin').length}
                  customMessages={customBannerMessages.length > 0 ? customBannerMessages : undefined}
                />
              </div>
              
              {messages.length === 0 ? (
                <Card className="border-dashed border-slate-600/30 bg-slate-800/40 backdrop-blur-sm">
                  <CardContent className="p-8 text-center">
                    <div className="p-4 bg-blue-500/10 rounded-full w-fit mx-auto mb-4">
                      <MessageSquare className="w-12 h-12 text-blue-400" />
                    </div>
                    <h3 className="font-semibold mb-2 text-slate-200">Welcome to HelpDesk</h3>
                    <p className="text-sm text-slate-400">
                      Your messages will appear here. Start a conversation with our support team or chat with HelpOS™, our AI assistant.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                messages.map((message, index) => {
                  const isBot = message.senderType === 'bot' || message.senderType === 'system';
                  const isSupport = message.senderType === 'support';
                  const isSystemMsg = message.isSystemMessage || message.senderType === 'system';
                  
                  // System announcements (join/leave) centered - Orange for server messages
                  if (isSystemMsg) {
                    return (
                      <div
                        key={message.id || index}
                        className="flex justify-center animate-in fade-in duration-300"
                        data-testid={`message-${message.id || index}`}
                      >
                        <div className="bg-orange-900/30 border border-orange-600/40 rounded-full px-4 py-1.5 text-xs text-orange-300">
                          <Bot className="w-3 h-3 inline mr-1.5 text-orange-400" />
                          {message.message}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div
                      key={message.id || index}
                      className={`flex ${isSupport || isBot ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                      data-testid={`message-${message.id || index}`}
                    >
                      <div className={`max-w-[85%] sm:max-w-[70%]`}>
                        {/* Message Header with Logo for Support Staff */}
                        <div className={`flex items-center gap-2 mb-1.5 ${isSupport || isBot ? '' : 'justify-end'}`}>
                          {isSupport && (
                            <WorkforceOSLogo size="sm" showText={false} className="flex-shrink-0" />
                          )}
                          {isBot && getRoleIcon(message.senderName || '', message.senderType)}
                          <span className="text-xs font-semibold text-slate-300">{message.senderName || 'User'}</span>
                          <span className="text-xs text-slate-500">
                            {formatTime(message.createdAt)}
                          </span>
                        </div>
                        
                        {/* Professional Message Bubble - Compact with Light/Dark Contrast */}
                        <div 
                          className={`rounded-xl p-2 backdrop-blur-sm transition-all duration-300 hover-elevate ${
                            isBot 
                              ? 'bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 text-slate-900 shadow-lg' 
                              : isSupport
                              ? 'bg-gradient-to-br from-white to-slate-100 border border-slate-300 text-slate-900 shadow-lg'
                              : 'bg-gradient-to-br from-slate-700/60 to-slate-800/40 border border-slate-600/30 text-slate-100 shadow-lg'
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {message.message.replace(/\*/g, '')}
                          </p>
                          {isBot && !isSystemMsg && (
                            <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-300">
                              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                              <span className="text-xs text-blue-600 font-medium">HelpOS™ AI Assistant</span>
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

          {/* Typing Indicator */}
          {typingUsers.size > 0 && (
            <div className="px-4 py-2 border-t border-slate-700/30">
              <div className="max-w-full md:max-w-5xl mx-auto flex items-center gap-2 text-xs text-slate-400">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-slate-300">
                  {typingUsers.size === 1 ? 'Someone is typing...' : `${typingUsers.size} people are typing...`}
                </span>
              </div>
            </div>
          )}
          
          {/* Professional Message Input */}
          <div className="border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-md p-4 flex-shrink-0 relative z-10">
            <div className="max-w-full md:max-w-5xl mx-auto">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={messageText}
                  onChange={handleInputChange}
                  placeholder={isConnected ? "Type your message..." : "Connecting..."}
                  className="flex-1 bg-slate-800/60 border-slate-600/40 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/30"
                  data-testid="input-chat-message"
                  autoFocus
                  disabled={!isConnected}
                />
                <Button 
                  type="submit" 
                  disabled={!messageText.trim() || !isConnected}
                  data-testid="button-send-message"
                  className="gap-2 flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
              <p className="text-xs text-slate-500 text-center mt-2 hidden sm:flex items-center justify-center gap-1">
                <Wifi className="w-3 h-3 text-blue-400 inline" />
                <span>Instant delivery via WebSocket · Real-Time Messaging</span>
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Online Users Sidebar - Professional Style - Compact width */}
        <div className="min-w-[180px] max-w-[280px] w-auto border-l border-indigo-500/20 bg-slate-900/60 backdrop-blur-sm p-4 hidden md:block flex-shrink-0">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-indigo-100">
                <Users className="w-4 h-4 text-indigo-400" />
                Online ({onlineUsers.length})
              </h3>
              <div className="space-y-2">
                {onlineUsers.map((user) => (
                  <div 
                    key={user.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/40 border border-indigo-500/20 hover-elevate transition-all duration-200"
                    data-testid={`user-${user.id}`}
                  >
                    <Circle className="w-2 h-2 fill-blue-400 text-blue-400 flex-shrink-0 animate-pulse" />
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {user.role === 'admin' && <Shield className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      {user.role === 'support' && <Headphones className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
                      {user.role === 'bot' && <Bot className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                      <span className="text-sm font-medium break-words text-slate-200">{user.name}</span>
                    </div>
                    {user.role === 'bot' && (
                      <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-indigo-500/20" />

            <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 backdrop-blur-sm shadow-lg shadow-purple-500/10">
              <CardHeader className="p-3">
                <CardTitle className="text-xs flex items-center gap-2 text-purple-200">
                  <Sparkles className="w-3 h-3 text-purple-300" />
                  GPT-4 AI Assistant
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-slate-400">
                  HelpOS™ is powered by GPT-4 and can assist with platform questions, queue management, and support commands instantly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dual Authentication Dialog (Customer or Staff) - Professional Style */}
      <Dialog open={showTicketDialog && !isLoadingUser} onOpenChange={(open) => {
        if (!open) {
          // If closing dialog without authentication, redirect to home
          window.location.href = '/';
        }
      }}>
        <DialogContent data-testid="dialog-ticket-verification" className="w-[95vw] max-w-md max-h-[90vh] p-0 flex flex-col bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/40 border-indigo-500/30 shadow-2xl shadow-indigo-500/20">
          <div className="p-4 sm:p-6 pb-0 relative">
            {/* Subtle animated gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none rounded-t-lg" />
            
            {/* WorkforceOS Branding at top */}
            <div className="relative z-10 flex justify-center mb-4">
              <WorkforceOSLogo size="md" showText={true} />
            </div>
            
            <DialogHeader className="relative z-10">
              <DialogTitle className="flex items-center justify-center gap-2 text-base sm:text-lg text-indigo-100">
                <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg border border-indigo-400/30">
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300 flex-shrink-0" />
                </div>
                <span className="line-clamp-1 bg-gradient-to-r from-indigo-200 to-purple-200 bg-clip-text text-transparent font-semibold">
                  HelpDesk Authentication
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-slate-400 text-center">
                Secure access to live support chat
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="overflow-y-auto flex-1 px-4 sm:px-6">
            <Tabs value={authMode} onValueChange={(v: any) => setAuthMode(v)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-auto sticky top-0 z-10 bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-indigo-500/20 p-1">
                <TabsTrigger 
                  value="customer" 
                  data-testid="tab-customer" 
                  className="text-xs sm:text-sm py-2 sm:py-2.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-500/30 transition-all duration-200"
                >
                  <User className="w-3 h-3 mr-1.5" />
                  Customer
                </TabsTrigger>
                <TabsTrigger 
                  value="staff" 
                  data-testid="tab-staff" 
                  className="text-xs sm:text-sm py-2 sm:py-2.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-500/30 transition-all duration-200"
                >
                  <Shield className="w-3 h-3 mr-1.5" />
                  Staff
                </TabsTrigger>
              </TabsList>
            
            {/* Customer Ticket Authentication */}
            <TabsContent value="customer" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 backdrop-blur-sm">
                <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="ticket-number" className="text-xs sm:text-sm text-indigo-200 font-medium">Ticket Number</Label>
                    <Input
                      id="ticket-number"
                      placeholder="TKT-ABCD1234"
                      value={ticketNumber}
                      onChange={(e) => setTicketNumber(e.target.value)}
                      data-testid="input-ticket-number"
                      className="text-sm sm:text-base bg-slate-800/50 border-indigo-500/30 focus:border-indigo-400 text-slate-100 placeholder:text-slate-500"
                    />
                    <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">
                      From your support request confirmation
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="ticket-email" className="text-xs sm:text-sm text-indigo-200 font-medium">Email Address</Label>
                    <Input
                      id="ticket-email"
                      type="email"
                      placeholder="your.email@company.com"
                      value={ticketEmail}
                      onChange={(e) => setTicketEmail(e.target.value)}
                      data-testid="input-ticket-email"
                      className="text-sm sm:text-base bg-slate-800/50 border-indigo-500/30 focus:border-indigo-400 text-slate-100 placeholder:text-slate-500"
                    />
                    <p className="text-[10px] sm:text-xs text-slate-400 leading-tight">
                      Email used when creating the ticket
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => window.location.href = "/contact"}
                  data-testid="button-create-ticket"
                  size="sm"
                  className="w-full sm:w-auto text-xs sm:text-sm bg-slate-800/40 border-slate-600/40 text-slate-200 hover:bg-slate-700/40 hover:border-indigo-500/40"
                >
                  Create Ticket
                </Button>
                <Button
                  onClick={() => authenticateTicketMutation.mutate({ ticketNumber, email: ticketEmail })}
                  disabled={!ticketNumber.trim() || !ticketEmail.trim() || authenticateTicketMutation.isPending}
                  data-testid="button-verify-ticket"
                  size="sm"
                  className="gap-2 w-full sm:w-auto text-xs sm:text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30 border-none"
                >
                  {authenticateTicketMutation.isPending ? (
                    <span className="text-xs sm:text-sm">Authenticating...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Authenticate</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
            
            {/* Staff Work ID Authentication */}
            <TabsContent value="staff" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="work-id" className="text-xs sm:text-sm">Work ID</Label>
                <Input
                  id="work-id"
                  placeholder="root-admin-workfos"
                  value={workId}
                  onChange={(e) => setWorkId(e.target.value)}
                  data-testid="input-work-id"
                  className="text-sm sm:text-base"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                  Your employee or staff work ID
                </p>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="work-email" className="text-xs sm:text-sm">Email Address</Label>
                <Input
                  id="work-email"
                  type="email"
                  placeholder="staff@workforceos.com"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  data-testid="input-work-email"
                  className="text-sm sm:text-base"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                  Your work email address
                </p>
              </div>
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardContent className="p-2 sm:p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="text-[10px] sm:text-xs space-y-0.5 sm:space-y-1 min-w-0">
                      <p className="font-semibold">Staff Access</p>
                      <p className="text-muted-foreground leading-tight">
                        For support team members without platform login
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                  data-testid="button-cancel-auth"
                  size="sm"
                  className="w-full sm:w-auto text-xs sm:text-sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => authenticateWorkIdMutation.mutate({ workId, email: workEmail })}
                  disabled={!workId.trim() || !workEmail.trim() || authenticateWorkIdMutation.isPending}
                  data-testid="button-verify-workid"
                  size="sm"
                  className="gap-2 w-full sm:w-auto text-xs sm:text-sm"
                >
                  {authenticateWorkIdMutation.isPending ? (
                    <span className="text-xs sm:text-sm">Authenticating...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Authenticate</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
            
            {wsStatusMessage && (
              <Card className="border-destructive/50 bg-destructive/10 mt-3 sm:mt-4 mb-4">
                <CardContent className="p-2 sm:p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-xs sm:text-sm text-destructive leading-tight">{wsStatusMessage}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </Tabs>
        </div>
        </DialogContent>
      </Dialog>

      {/* Staff Controls Overlay Panel - Gmail-style */}
      {showStaffControls && (
        <>
          {/* Backdrop - Click to close - See-through overlay */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300"
            onClick={() => setShowStaffControls(false)}
            data-testid="overlay-backdrop"
          />
          
          {/* Side Panel */}
          <div 
            className="fixed left-0 top-0 bottom-0 w-full sm:w-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg shadow-2xl z-50 animate-in slide-in-from-left duration-300"
            data-testid="panel-staff-controls"
          >
            {/* Header with Close Button */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Staff Controls</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowStaffControls(false)}
                className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-800"
                data-testid="button-close-staff-controls"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-140px)]">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Manage HelpDesk room status and announcements. Changes apply immediately.
              </p>

              {/* Banner Editor Button */}
              <Button
                onClick={() => {
                  setShowBannerEditor(true);
                  setShowStaffControls(false);
                }}
                className="w-full gap-2"
                variant="outline"
                data-testid="button-edit-banners"
              >
                <Sparkles className="w-4 h-4" />
                Edit Chat Banners
              </Button>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="room-status" className="text-sm font-medium">Room Status</Label>
                <Select
                  value={roomStatusControl}
                  onValueChange={(value: any) => setRoomStatusControl(value)}
                >
                  <SelectTrigger id="room-status" data-testid="select-room-status" className="h-10 bg-white dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                        <span>Open</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-red-500 text-red-500" />
                        <span>Closed</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="maintenance">
                      <div className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-yellow-500 text-yellow-500" />
                        <span>Maintenance</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-message" className="text-sm font-medium">Status Message (Optional)</Label>
                <Textarea
                  id="status-message"
                  placeholder="Optional message to display to users..."
                  value={roomStatusMessage}
                  onChange={(e) => setRoomStatusMessage(e.target.value)}
                  rows={3}
                  className="text-sm resize-none bg-white dark:bg-slate-800"
                  data-testid="textarea-status-message"
                />
              </div>

              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Staff Bypass</p>
                      <p className="text-slate-600 dark:text-slate-400">Platform staff can always access the HelpDesk.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Footer Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg">
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
                  className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
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
          </div>
        </>
      )}

      {/* Tutorial Slides */}
      <ChatTutorialSlides
        open={showTutorial}
        onComplete={() => setShowTutorial(false)}
      />

      {/* Queue Viewer Dialog */}
      <QueueViewerDialog
        open={showQueueDialog}
        onClose={() => setShowQueueDialog(false)}
        queueEntries={(queueData || []).map((entry: any, index: number) => ({
          id: entry.id || `queue-${index}`,
          userName: entry.userName || 'User',
          position: entry.position || (index + 1),
          waitTime: entry.estimatedWaitMinutes || 5,
          priority: entry.priority || 'normal',
          userType: entry.userType || 'guest'
        }))}
      />

      {/* Branded Confirm Dialog - Mobile Support */}
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
            // Future: Add kickUser functionality here
            setConfirmKick(null);
          }}
        />
      )}
    </div>
  );
}
