import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useNavigationProtection } from "@/hooks/use-navigation-protection";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Send, Users, MessageSquare, Shield, Crown, UserCog, Wrench,
  Settings, Power, HelpCircle, Zap, Clock, AlertCircle, CheckCircle,
  ChevronLeft, ChevronRight, Info, Coffee, Star, Building2, Bot, Sparkles, Menu, X,
  UserCheck, FileText, Camera, PenTool, ArrowRight, Ban, AlertTriangle,
  Timer, UserX, TrendingUp, Key, Mail, ListChecks, Tag, ClipboardList,
  History, MessageCircle, ArrowUpCircle, Eye, RefreshCw, PackageCheck, FileSearch
} from "lucide-react";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { SecureRequestDialog } from "@/components/secure-request-dialog";
import { BrandedConfirmDialog } from "@/components/branded-input-dialog";
import { KickDialog, SilenceDialog } from "@/components/moderation-dialogs";
import { HelpDeskCommandBar } from "@/components/helpdesk-command-bar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatAnnouncementBanner } from "@/components/chat-announcement-banner";
import { BannerManager } from "@/components/banner-manager";
import { HelpCommandPanel } from "@/components/help-command-panel";
import { QueueManagerPanel } from "@/components/queue-manager-panel";
import { TutorialManagerPanel } from "@/components/tutorial-manager-panel";
import { PriorityManagerPanel } from "@/components/priority-manager-panel";
import { AccountSupportPanel } from "@/components/account-support-panel";
import { MotdDialog } from "@/components/motd-dialog";
import { AnimatedStatusBar } from "@/components/animated-status-bar";
import { ChatAgreementModal } from "@/components/chat-agreement-modal";
import { UserDiagnosticsPanel } from "@/components/user-diagnostics-panel";
import { HelpOsAiTester } from "@/components/helpos-ai-tester";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { SeasonalBackground } from "@/components/seasonal-background";
import type { ChatMessage } from "@shared/schema";
import { HelpDeskProgressHeader } from "@/components/helpdesk-progress-header";
import { AgentToolbelt } from "@/components/agent-toolbelt";
import { TicketContextPanel } from "@/components/ticket-context-panel";
import { sanitizeMessage } from "@/lib/sanitize";
import { MobileChatLayout } from "@/components/mobile-chat-layout";

const MAIN_ROOM_ID = 'helpdesk'; // Must match support_rooms.slug in database

interface HelpDeskProps {
  forceMobileLayout?: boolean; // Force mobile layout regardless of screen size
}

// Desktop IRC/MSN-style 3-column chatroom with AutoForce™ professional branding
// Can also be forced to mobile layout for /mobilechat route
export function HelpDesk(props?: HelpDeskProps & any) {
  // Auto-detect mobile layout based on viewport width
  const [isMobileView, setIsMobileView] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const { forceMobileLayout = false } = props || {};
  const shouldUseMobileLayout = forceMobileLayout || isMobileView;
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation(); // For navigation buttons
  const [inputMessage, setInputMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [userStatus, setUserStatus] = useState<"online" | "away" | "busy">("online");
  const [showCoffeeCup, setShowCoffeeCup] = useState(false);
  const [secureRequest, setSecureRequest] = useState<{
    type: 'authenticate' | 'document' | 'photo' | 'signature' | 'info';
    requestedBy: string;
    message?: string;
  } | null>(null);
  const [kickDialogUser, setKickDialogUser] = useState<{ userId: string; userName: string } | null>(null);
  const [silenceDialogUser, setSilenceDialogUser] = useState<{ userId: string; userName: string } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showRoomStatus, setShowRoomStatus] = useState(false);
  const [roomStatusControl, setRoomStatusControl] = useState<"open" | "closed" | "maintenance">("open");
  const [roomStatusMessage, setRoomStatusMessage] = useState("");
  const [showControlsMenu, setShowControlsMenu] = useState(false);
  const [showBannerManager, setShowBannerManager] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showPriorityPanel, setShowPriorityPanel] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showMotd, setShowMotd] = useState(false);
  const [motdData, setMotdData] = useState<any>(null);
  // REMOVED: Agreement and terms dialogs - chatroom is now publicly accessible without barriers
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsUserId, setDiagnosticsUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // User state tracking for contextual menus
  const [silencedUsers, setSilencedUsers] = useState<Set<string>>(new Set());
  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
  const [documentRequests, setDocumentRequests] = useState<Map<string, Set<string>>>(new Map());
  // Map structure: userId => Set of request types ('authenticate', 'document', 'photo', 'signature', 'info')
  
  // Enhanced HelpDesk state
  const [ticketStatus, setTicketStatus] = useState<'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated'>('investigating');
  const [showContextPanel, setShowContextPanel] = useState(true);
  
  // Seasonal animations toggle (staff only)
  const [seasonalAnimationsEnabled, setSeasonalAnimationsEnabled] = useState(() => {
    const stored = localStorage.getItem('seasonal-animations-enabled');
    return stored !== null ? stored === 'true' : true; // Default enabled
  });
  
  // Generate or get session ID for tracking
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem('chat-session-id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('chat-session-id', newId);
    return newId;
  });

  // Read URL parameters for direct conversation links (from escalation)
  const urlParams = new URLSearchParams(window.location.search);
  const urlConversationId = urlParams.get('conversationId');
  const urlGuestToken = urlParams.get('guestToken');
  
  // Check sessionStorage for escalation data
  const escalationData = sessionStorage.getItem('helpos_escalation');
  const parsedEscalation = escalationData ? JSON.parse(escalationData) : null;
  
  // Determine the conversation ID to join (escalation > default)
  const conversationToJoin = urlConversationId || parsedEscalation?.conversationId || MAIN_ROOM_ID;
  
  console.log('[HelpDesk] Conversation join logic:', {
    urlConversationId,
    urlGuestToken,
    parsedEscalation,
    conversationToJoin,
    isGuest: !user
  });

  // No IRC-style messages - users see terms/agreement first, then optional MOTD dialog if set by admins

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : parsedEscalation?.guestName || user?.email?.split('@')[0] || 'Guest';

  const { 
    messages, 
    isConnected, 
    sendMessage, 
    sendTyping, 
    sendStatusChange, 
    kickUser, 
    silenceUser, 
    giveVoice, 
    sendRawMessage, 
    onlineUsers, 
    customBannerMessage, 
    typingUserInfo, 
    isSilenced, 
    justGotVoice 
  } = useChatroomWebSocket(
    user?.id || `guest-${sessionId}`, // Use sessionId for guests so WebSocket connects
    userName,
    conversationToJoin, // Join escalated conversation or default main room
    (request) => {
      // When staff requests secure info, open the dialog
      setSecureRequest({
        type: request.type as any,
        requestedBy: request.requestedBy,
        message: request.message,
      });
    }
  );

  // Navigation protection - prevent accidental disconnects from live chat
  useNavigationProtection({
    currentRoute: '/chat',
    shouldProtect: isConnected || messages.length > 0,
  });

  // Enhanced connection state tracking
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error' | 'denied'>('disconnected');
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  const { data: roomData, error: roomError } = useQuery({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: isAuthenticated,
    retry: 1,
  });

  // REMOVED MANDATORY AGREEMENT CHECK - Chatroom is now publicly accessible
  // Agreement modal is now optional (staff can enable if needed for compliance)
  // Support staff are auto-authenticated and bypass all entry forms
  // Audit trails still maintained via sessionId tracking in websocket connections
  
  // TODO: END-USER PRIORITY SYSTEM
  // Implement queue weighting in server/services/helpOsQueue.ts to give end users
  // priority over support staff during peak hours. Use weighted round-robin that
  // demotes staff join requests when end-user concurrency threshold is hit.

  const { data: queueData, error: queueError } = useQuery<any[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
    retry: 1,
  });

  // Fetch MOTD
  const { data: motdResponse, error: motdError } = useQuery<{ motd: any, acknowledged: boolean }>({
    queryKey: ['/api/helpdesk/motd'],
    enabled: isAuthenticated,
    retry: 1,
  });

  // Fetch promotional banners (staff only - API has authorization)
  const { data: promotionalBannersRaw = [] } = useQuery<any[]>({
    queryKey: ['/api/promotional-banners'],
    enabled: isAuthenticated,
    retry: 1,
  });

  // Transform promotional banners to match BannerManager format
  const promotionalBanners = promotionalBannersRaw.map((banner: any) => ({
    id: banner.id,
    text: banner.message,
    type: 'promo' as const,
    link: banner.ctaLink,
    enabled: banner.isActive,
  }));

  // Banner management mutations
  const createBannerMutation = useMutation({
    mutationFn: async (data: { message: string; ctaText?: string; ctaLink?: string; isActive?: boolean }) => {
      return await apiRequest('POST', '/api/promotional-banners', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
      toast({ title: "✓ Banner Created" });
    },
  });

  const updateBannerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest('PATCH', `/api/promotional-banners/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
      toast({ title: "✓ Banner Updated" });
    },
  });

  const deleteBannerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/promotional-banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
      toast({ title: "✓ Banner Deleted" });
    },
  });

  // Fetch selected user context for profile/diagnostics
  const { data: userContext, error: userContextError, isError: userContextIsError } = useQuery<any>({
    queryKey: ['/api/helpdesk/user-context', selectedUserId],
    queryFn: async () => {
      const res = await fetch(`/api/helpdesk/user-context/${selectedUserId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to fetch user context' }));
        throw errorData;
      }
      return res.json();
    },
    enabled: !!selectedUserId && isAuthenticated,
    retry: 1,
  });

  // Show MOTD dialog if there's an active MOTD that hasn't been acknowledged
  useEffect(() => {
    if (motdResponse && motdResponse.motd && !motdResponse.acknowledged) {
      setMotdData(motdResponse.motd);
      setShowMotd(true);
    }
  }, [motdResponse]);

  // Monitor connection and API health - Make server more self-aware
  useEffect(() => {
    const errors: string[] = [];
    
    // Only check for CRITICAL API errors (non-critical errors like missing MOTD table are suppressed)
    if (roomError) errors.push('Room unavailable');
    // Suppress non-critical database schema errors from UI:
    // - agreementError (optional feature)
    // - queueError (informational only)
    // - motdError (optional feature)
    
    // Determine overall connection status
    if (!isConnected) {
      setConnectionStatus('disconnected');
    } else if (errors.length > 0) {
      // Connected to WebSocket but API is failing
      setConnectionStatus('error');
      setApiErrors(errors);
    } else if (onlineUsers.length === 0 && isConnected) {
      // Connected but no users (possible server issue)
      setConnectionStatus('error');
      setApiErrors(['No users detected']);
    } else if (roomData && (roomData as any).status === 'closed') {
      setConnectionStatus('denied');
      setApiErrors(['Chat room is closed']);
    } else {
      setConnectionStatus('connected');
      setApiErrors([]);
    }
  }, [isConnected, roomError, queueError, motdError, onlineUsers.length, roomData]);

  // MOTD acknowledgment mutation
  const acknowledgeMOTD = useMutation({
    mutationFn: async (motdId: string) => {
      return await apiRequest('POST', '/api/helpdesk/motd/acknowledge', {
        motdId,
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

  // Room status update mutation
  const toggleRoomStatusMutation = useMutation({
    mutationFn: async ({ status, statusMessage }: { status: string; statusMessage?: string }) => {
      return await apiRequest('POST', '/api/helpdesk/room/helpdesk/status', {
        status,
        statusMessage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/helpdesk/room/helpdesk'] });
      setShowRoomStatus(false);
      toast({
        title: "Room Status Updated",
        description: `HelpDesk is now ${roomStatusControl}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update room status",
        variant: "destructive",
      });
    },
  });

  // Sort users: Root admin at top, then bot, then staff (by role hierarchy), then subscribers, org users, guests
  const sortedUsers = [...onlineUsers].sort((a, b) => {
    // Role priority (lower number = higher priority)
    const rolePriority: Record<string, number> = {
      'root_admin': 0,        // Root admin at absolute top (you)
      'bot': 1,               // HelpOS AI bot
      'deputy_admin': 2,      // Deputy administrators
      'support_manager': 3,   // Support managers
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

  // No rotating banners - removed IRC-style system

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


  // Get user type icon - AutoForce™ logo ONLY for staff, avatars for users
  const getUserTypeIcon = (userType: string, role: string, userName: string = 'User') => {
    // ROOT ADMIN - Detailed AutoForce™ logo (COMPACT SIZE)
    if (role === 'root_admin') {
      return (
        <div className="flex items-center justify-center scale-[0.55]">
          <AnimatedAutoForceLogo size="sm" variant="icon" />
        </div>
      );
    }
    
    // Bot gets special amber Sparkles icon (matching mobile chat)
    if (role === 'bot') {
      return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-blue-500/50">
          <Sparkles size={14} className="text-white" />
        </div>
      );
    }
    
    // ALL STAFF (deputy_admin, support_manager, sysop) - AutoForce™ logo (COMPACT SIZE)
    if (['deputy_admin', 'support_manager', 'sysop'].includes(role)) {
      return (
        <div className="flex items-center justify-center scale-[0.55]">
          <AnimatedAutoForceLogo size="sm" variant="icon" />
        </div>
      );
    }
    
    // Subscribers - Professional avatar with initials
    if (userType === 'subscriber') {
      const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return (
        <Avatar className="w-5 h-5 border border-primary/80">
          <AvatarFallback className="bg-muted/50 text-primary text-[9px] font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      );
    }
    
    // Organization users - Professional avatar with initials
    if (userType === 'org_user') {
      const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return (
        <Avatar className="w-5 h-5 border border-border">
          <AvatarFallback className="bg-muted text-foreground text-[9px] font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      );
    }
    
    // Guests - Simple avatar with question mark
    return (
      <Avatar className="w-5 h-5 border border-border">
        <AvatarFallback className="bg-muted text-muted-foreground text-[9px]">
          <HelpCircle className="w-3 h-3" />
        </AvatarFallback>
      </Avatar>
    );
  };

  // Get status indicator - Extra Compact
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online': return <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-sm" />;
      case 'away': return <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-sm" />;
      case 'busy': return <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm" />;
      default: return <div className="w-1.5 h-1.5 bg-gray-500 rounded-full" />;
    }
  };

  // Get role display text - matching mobile chat format
  const getRoleDisplay = (role?: string) => {
    if (!role) return null;
    switch(role) {
      case 'root_admin': return 'Admin';
      case 'deputy_admin': return 'Deputy';
      case 'support_manager': return 'Manager';
      case 'sysop': return 'Sysop';
      case 'compliance_officer': return 'Compliance';
      case 'bot': return 'BOT AI';
      default: return null;
    }
  };

  const getRoleIcon = (role: string) => {
    /**
     * HARDCODED SUPERSCRIPT ROLE DISPLAY - DESKTOP CHAT ONLY
     * DO NOT MODIFY WITHOUT EXPLICIT USER PERMISSION
     * Makes role display like ™ in HelpOS™ - superscript but large enough to read
     * for older users or those with vision difficulties
     */
    // Inline superscript role badge - ONLY for staff and bot roles
    // Regular users and subscribers should NOT show role badges
    const staffRoles = ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'compliance_officer', 'bot'];
    
    if (!staffRoles.includes(role)) {
      return null; // No badge for regular users/subscribers
    }
    
    const roleText = getRoleDisplay(role);
    if (!roleText) return null;
    
    const isBot = role === 'bot';
    // Smaller superscript (text-[9px]) but still visible with space separation - BLUE THEME
    return (
      <sup className={`text-[9px] font-semibold ml-1 ${isBot ? 'text-blue-400' : 'text-blue-500'}`}>
        ({roleText})
      </sup>
    );
  };

  // Parse system messages to render names with superscript role badges
  const parseSystemMessage = (message: string) => {
    // Match pattern like "Name (Role)" and convert to Name with superscript role
    // Updated regex to capture full names including spaces, hyphens, apostrophes
    const rolePattern = /([\w\s'-]+?)\s*\((Admin|Deputy|Assistant|Sysop|Auditor|BOT AI)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = rolePattern.exec(message)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(message.substring(lastIndex, match.index));
      }

      const userName = match[1].trim(); // Trim whitespace from captured name
      const roleText = match[2];
      
      // Determine if it's a bot for styling
      const isBot = roleText === 'BOT AI';
      
      // Add the username with superscript role - BLUE THEME for visibility
      parts.push(
        <span key={key++} className="font-semibold">
          {userName}
          <sup className={`text-[9px] font-semibold ml-1 ${isBot ? 'text-blue-400' : 'text-blue-500'}`}>
            ({roleText})
          </sup>
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return parts.length > 0 ? parts : message;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'root_admin': return 'text-blue-600 font-bold';  // Root admin
      case 'bot': return 'text-blue-500 font-bold';  // Bot
      case 'deputy_admin': return 'text-blue-600 font-bold';
      case 'support_manager': return 'text-blue-600 font-bold';
      case 'sysop': return 'text-blue-600 font-bold';
      default: return 'text-white font-semibold';  // Regular users - white for visibility
    }
  };

  // Get message bubble color - Blue visibility scheme with proper contrast
  const getMessageBubbleColor = (senderType: string, role: string, isSelf: boolean) => {
    if (isSelf) {
      // Support staff own messages - blue theme with white text
      return 'bg-blue-600 border border-blue-700 shadow-md text-white dark:bg-blue-700 dark:border-blue-800';
    }
    
    // Bot messages - lighter blue for distinction
    if (role === 'bot' || senderType === 'bot') {
      return 'bg-blue-100 border border-blue-300 shadow-sm text-blue-900 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-100';
    }
    
    // Staff messages - blue theme with white text
    if (role === 'root_admin' || role === 'deputy_admin' || role === 'support_manager' || role === 'sysop') {
      return 'bg-blue-500 border border-blue-600 shadow-sm text-white dark:bg-blue-600 dark:border-blue-700';
    }
    
    // Customer/regular messages - darker blue background with white text
    return 'bg-blue-700 border border-blue-800 shadow-md text-white dark:bg-blue-800 dark:border-blue-900';
  };

  const isStaff = user && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((user as any).platformRole);
  const userPlatformRole = (user as any)?.platformRole;
  const queueLength = queueData?.length || 0;

  // Role-based permission system
  const hasContextPermission = (requiredRoles: string[]) => {
    if (!userPlatformRole) return false;
    return requiredRoles.includes(userPlatformRole);
  };

  // Role constants
  const ALL_STAFF = ['root_admin', 'deputy_admin', 'support_manager', 'sysop'];
  const DEPUTY_ASSISTANT_PLUS = ['root_admin', 'deputy_admin', 'support_manager'];
  const DEPUTY_ADMIN_PLUS = ['root_admin', 'deputy_admin'];
  const ADMIN_ONLY = ['root_admin', 'deputy_admin'];
  const SYSTEM_ONLY = ['root_admin', 'sysop'];

  // Support command handlers (27 comprehensive commands)
  const handleQuickReply = (targetUser: any) => {
    const quickReplies = [
      "Thank you for contacting support. I'll be happy to assist you!",
      "I'm looking into this for you right now.",
      "Can you provide more details about the issue you're experiencing?",
      "I understand your concern. Let me help you with that.",
    ];
    const reply = quickReplies[0];
    sendQuickMessage(`@${targetUser.name} ${reply}`);
    toast({ title: "Quick reply sent" });
  };

  const handleInternalNote = (targetUser: any) => {
    sendRawMessage({ 
      type: 'internal_note', 
      targetUserId: targetUser.id,
      note: `Staff note added to ${targetUser.name}'s ticket`
    });
    toast({ title: "Internal note added", description: "Note visible to staff only" });
  };

  const handleResetPassword = (targetUser: any) => {
    sendRawMessage({ 
      type: 'reset_password', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} I'm initiating a password reset for your account. You'll receive an email shortly.`);
    toast({ title: "✓ Password Reset Sent" });
  };

  const handleUnlockAccount = (targetUser: any) => {
    sendRawMessage({ 
      type: 'unlock_account', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} Your account has been unlocked. You can now log in.`);
    toast({ title: "✓ Account Unlocked" });
  };

  const handleViewDocuments = (targetUser: any) => {
    sendRawMessage({ 
      type: 'view_documents', 
      targetUserId: targetUser.id 
    });
    toast({ title: "Document viewer opened", description: `Viewing ${targetUser.name}'s submitted documents` });
  };

  const handleEscalate = (targetUser: any) => {
    sendRawMessage({ 
      type: 'escalate', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} I'm escalating your issue to our senior support team for specialized assistance.`);
    toast({ title: "Ticket escalated", description: "Transferred to Tier 2 support" });
  };

  const handlePriorityTag = (targetUser: any) => {
    sendRawMessage({ 
      type: 'priority_tag', 
      targetUserId: targetUser.id 
    });
    toast({ title: "Priority flag added", description: `${targetUser.name}'s ticket marked as high priority` });
  };

  const handleFollowUp = (targetUser: any) => {
    sendRawMessage({ 
      type: 'follow_up', 
      targetUserId: targetUser.id 
    });
    toast({ title: "Follow-up scheduled", description: "Reminder set for 24 hours" });
  };

  const handleEmailSummary = (targetUser: any) => {
    sendRawMessage({ 
      type: 'email_summary', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} I'm sending a summary of our conversation to your email.`);
    toast({ title: "✓ Email Summary Sent" });
  };

  const handleMarkVIP = (targetUser: any) => {
    sendRawMessage({ 
      type: 'mark_vip', 
      targetUserId: targetUser.id 
    });
    toast({ title: "✓ VIP Status Granted" });
  };

  const handleUserHistory = (targetUser: any) => {
    sendRawMessage({ 
      type: 'user_history', 
      targetUserId: targetUser.id 
    });
    toast({ title: "📜 History Loaded" });
  };

  const handleIssueWarning = (targetUser: any) => {
    sendRawMessage({ 
      type: 'issue_warning', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} This is a formal warning. Please follow our community guidelines.`);
    toast({ title: "⚠️ Warning Issued", description: `${targetUser.name}` });
  };

  const handleTempMute = (targetUser: any) => {
    sendRawMessage({ 
      type: 'temp_mute', 
      targetUserId: targetUser.id,
      duration: 300 
    });
    toast({ title: "🔇 User Muted", description: `${targetUser.name} • 5min` });
  };

  const handleBan = (targetUser: any) => {
    sendRawMessage({ 
      type: 'ban_user', 
      targetUserId: targetUser.id 
    });
    toast({ 
      title: "🚫 User Banned", 
      description: `${targetUser.name}`, 
    });
  };

  const handleAnalytics = () => {
    sendRawMessage({ type: 'analytics' });
    toast({ title: "📊 Analytics Opened" });
  };

  const handleForceReconnect = (targetUser: any) => {
    sendRawMessage({ 
      type: 'force_reconnect', 
      targetUserId: targetUser.id 
    });
    toast({ title: "🔄 Connection Reset" });
  };

  const handleTestMessage = () => {
    sendRawMessage({ type: 'test_message', timestamp: Date.now() });
    sendQuickMessage(`🔧 SYSTEM TEST - Message sent at ${new Date().toLocaleTimeString()}`);
    toast({ title: "🔧 Test Message Sent" });
  };

  const handleClearCache = (targetUser: any) => {
    sendRawMessage({ 
      type: 'clear_cache', 
      targetUserId: targetUser.id 
    });
    toast({ title: "✓ Cache Cleared" });
  };

  // Stateful menu helpers - for context menu toggles
  const toggleSilence = (targetUser: any) => {
    const isSilencedNow = silencedUsers.has(targetUser.id);
    if (isSilencedNow) {
      // Unmute
      sendRawMessage({ type: 'give_voice', targetUserId: targetUser.id });
      setSilencedUsers(prev => {
        const next = new Set(prev);
        next.delete(targetUser.id);
        return next;
      });
      toast({ title: "🔊 User Unmuted" });
    } else {
      // Open silence dialog for branded reason selection
      setSilenceDialogUser({ userId: targetUser.id, userName: targetUser.name });
    }
  };

  const toggleBan = (targetUser: any) => {
    const isBannedNow = bannedUsers.has(targetUser.id);
    if (isBannedNow) {
      // Unban
      sendRawMessage({ type: 'unban_user', targetUserId: targetUser.id });
      setBannedUsers(prev => {
        const next = new Set(prev);
        next.delete(targetUser.id);
        return next;
      });
      toast({ title: "✓ User Unbanned" });
    } else {
      // Ban
      sendRawMessage({ type: 'ban_user', targetUserId: targetUser.id });
      setBannedUsers(prev => {
        const next = new Set(prev);
        next.add(targetUser.id);
        return next;
      });
      toast({ title: "🚫 User Banned", description: `${targetUser.name}` });
    }
  };

  const trackDocumentRequest = (targetUserId: string, requestType: string) => {
    setDocumentRequests(prev => {
      const next = new Map(prev);
      const userRequests = next.get(targetUserId) || new Set();
      userRequests.add(requestType);
      next.set(targetUserId, userRequests);
      return next;
    });
  };

  const hasRequestedDocument = (targetUserId: string, requestType: string): boolean => {
    return documentRequests.get(targetUserId)?.has(requestType) || false;
  };

  // MOBILE-OPTIMIZED CHAT - Full-featured mobile layout with tools
  if (shouldUseMobileLayout) {
    // Prepare users list for mobile chat
    const mobileUsers = uniqueUsers.map(u => ({
      id: u.id,
      name: u.name,
      role: (['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.role) ? 'staff' : 'customer') as 'staff' | 'customer' | 'guest',
      platformRole: u.role,
    }));

    return (
      <MobileChatLayout
        messages={messages}
        users={mobileUsers}
        currentUser={{
          id: user?.id || '',
          name: userName,
          isStaff: isStaff || false,
        }}
        onSendMessage={(message) => sendMessage(message, userName, isStaff ? 'support' : 'customer')}
        onCommandExecute={(command) => {
          // Handle IRC-style commands
          if (command.startsWith('/')) {
            const parts = command.slice(1).split(' ');
            const cmd = parts[0];
            const args = parts.slice(1);

            switch (cmd) {
              case 'clear':
                // Clear messages would need backend support
                toast({ title: "Clear requested", description: "Admin will clear chat history" });
                break;
              case 'help':
                toast({ title: "Help", description: "Tap usernames for quick actions. Use hamburger menu for commands." });
                break;
              default:
                sendMessage(command, userName, 'system');
            }
          } else {
            sendMessage(command, userName, isStaff ? 'support' : 'customer');
          }
        }}
        onKickUser={(userId, reason) => {
          sendMessage(`/kick ${userId} ${reason || ''}`, userName, 'system');
          toast({ title: "User Kicked", description: `User removed from chat` });
        }}
        onSilenceUser={(userId, duration, reason) => {
          sendMessage(`/silence ${userId} ${duration}m ${reason || ''}`, userName, 'system');
          toast({ title: "User Silenced", description: `Muted for ${duration} minutes` });
        }}
        onGiveVoice={(userId) => {
          sendMessage(`/voice ${userId}`, userName, 'system');
          toast({ title: "Voice Granted", description: `User can now speak` });
        }}
      />
    );
  }

  // DESKTOP LAYOUT - Full featured IRC-style chat
  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 relative">
      {/* Seasonal Animated Background */}
      <SeasonalBackground enabled={seasonalAnimationsEnabled} />
      
      {/* CLEAN MOBILE-FIRST HEADER - CENTERED ALIGNMENT */}
      <header className="relative z-50 bg-slate-800 border-b border-blue-600 flex-shrink-0">
        <div className="flex items-center justify-center px-3 py-2 gap-2 relative">
          {/* Centered: Logo + Title */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">AF</span>
            </div>
            <div>
              <h1 className="text-blue-400 font-bold text-sm sm:text-base text-center">HelpDesk</h1>
              <p className="text-blue-300 text-[10px] sm:text-xs text-center">Live support chat</p>
            </div>
          </div>

          {/* Right: Exit Chat Room Button - Absolute positioned */}
          <Button
            onClick={() => navigate('/dashboard')}
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 absolute right-3"
            data-testid="button-exit-chatroom"
            title="Exit Chat Room"
          >
            <X className="w-5 h-5 text-blue-400 hover:text-blue-300" />
          </Button>
        </div>

        {/* Queue Status Bar - Blue info strip */}
        <div className="bg-blue-950/40 px-3 py-1.5 border-t border-blue-700">
          <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-blue-300">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{uniqueUsers.filter(u => ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.role)).length} agents online</span>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <Clock className="w-3.5 h-3.5" />
              <span>~2-3 min wait</span>
            </span>
          </div>
        </div>
      </header>

      {/* Announcement Banner - Bright emerald/green theme */}
      <ChatAnnouncementBanner
        queuePosition={messages.filter(m => m.senderType === 'customer').length + 1}
        queueWaitTime="2-3 minutes"
        onlineStaff={uniqueUsers.filter(u => ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.role)).length}
        customMessages={promotionalBanners}
        seasonalAnimationsEnabled={seasonalAnimationsEnabled}
      />

      {/* Main Layout - Responsive: Stacked (mobile) vs 3-column (desktop) */}
      <main className="flex flex-col md:flex-row flex-grow overflow-y-auto md:overflow-hidden w-full relative z-10">
        {/* CENTER COLUMN: Chat Area - Mobile-first with proper scroll */}
        <section className="flex-grow flex flex-col bg-slate-900/80 backdrop-blur-md relative md:border-r-2 border-blue-700 shadow-inner min-h-0">
          {/* Progress Header - Only visible to staff */}
          {isStaff && (
            <div className="px-4 py-3 border-b border-blue-700 bg-slate-800/70">
              <HelpDeskProgressHeader
                status={ticketStatus}
                assignedAgent={userName}
                slaRemaining={3600}
                priority="normal"
                ticketId={sessionId}
              />
            </div>
          )}
          
          {/* Messages Area - Explicit height for mobile scroll */}
          <ScrollArea className="flex-1 min-h-0 p-2 sm:p-3">
            <div className="space-y-2">

              {/* Chat Messages - Modern bubbles with AutoForce™ professional styling */}
              {messages.map((msg, idx) => {
                const isSelf = msg.senderId === user?.id;
                const role = (msg as any).role || 'guest';
                
                // System messages
                if (msg.senderType === 'system' || msg.isSystemMessage) {
                  return (
                    <div key={idx} className="flex justify-center my-1">
                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-300 italic bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-blue-500" />
                        <span dangerouslySetInnerHTML={{ __html: sanitizeMessage(msg.message) }} />
                      </span>
                    </div>
                  );
                }

                // Regular messages - ALL left-aligned with modern bubbles
                // SHOW ACTUAL NAME, not role - use firstName if available
                const actualName = msg.senderName || (user as any)?.firstName || userName || 'User';
                const bubbleColor = getMessageBubbleColor(msg.senderType || 'customer', role, isSelf);
                const nameColor = getRoleColor(role);

                return (
                  <div key={idx} className={`${bubbleColor} shadow-sm p-2 sm:p-2.5 rounded-lg w-full max-w-full sm:max-w-[90%] hover:shadow-md transition-all min-w-0`}>
                    <div className="flex items-start gap-1.5 sm:gap-2 min-w-0">
                      {/* Avatar Icon - Compact, hidden on very small screens */}
                      <div className="hidden xs:block flex-shrink-0 mt-0.5">
                        {getUserTypeIcon((msg as any).userType || 'guest', role, actualName)}
                      </div>
                      
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {/* Header: Name with inline superscript role badge + Timestamp */}
                        <div className="flex items-center gap-1 sm:gap-1.5 mb-1 flex-wrap min-w-0">
                          <span className={`text-xs font-bold ${nameColor} truncate`}>
                            {role === 'bot' ? 'HelpOS' : actualName.split('(')[0].trim()}
                            {/* Role badge as inline superscript like mathematical notation */}
                            {getRoleIcon(role)}
                          </span>
                          <span className="text-[10px] text-blue-500 dark:text-blue-400 ml-auto flex-shrink-0">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        
                        {/* Message Content - Mobile-safe wrapping with overflow protection */}
                        <div 
                          className="text-white dark:text-blue-100 text-xs sm:text-xs leading-snug break-words whitespace-pre-wrap overflow-wrap-anywhere hyphens-auto"
                          dangerouslySetInnerHTML={{ __html: sanitizeMessage(msg.message) }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area - Mobile-responsive padding and sizing */}
          <div className="border-t border-border bg-muted p-2 sm:p-3 md:p-4">
            {/* Agent Toolbelt - Only visible to staff, stacked on mobile */}
            {isStaff && (
              <div className="mb-2 sm:mb-3 flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 rounded-md border border-border bg-muted/40 p-2 sm:p-3 backdrop-blur">
                <AgentToolbelt
                  ticketId={sessionId}
                  onMacroInsert={(macro) => setInputMessage(prev => prev ? `${prev}\n\n${macro}` : macro)}
                  onRequestFile={(type) => {
                    sendMessage(`📎 Please provide: ${type}`, userName, 'support');
                    toast({ title: "File Request Sent", description: `Requested ${type} from customer` });
                  }}
                  onSendKBLink={(link) => setInputMessage(prev => prev ? `${prev}\n\n${link}` : link)}
                  onEscalate={(reason, queue) => {
                    setTicketStatus('escalated');
                    sendMessage(`⚠️ Escalating to ${queue}: ${reason}`, userName, 'system');
                    toast({ title: "Ticket Escalated", description: `Sent to ${queue} queue` });
                  }}
                  onCreateBug={(description) => {
                    toast({ title: "Bug Report Created", description: "Engineering team notified" });
                  }}
                  className="w-full xs:w-auto"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const statuses: typeof ticketStatus[] = ['assigned', 'investigating', 'waiting_user', 'resolved'];
                    const currentIndex = statuses.indexOf(ticketStatus);
                    const nextIndex = (currentIndex + 1) % statuses.length;
                    setTicketStatus(statuses[nextIndex]);
                    toast({ title: "Status Updated", description: `Changed to ${statuses[nextIndex]}` });
                  }}
                  className="w-full xs:w-auto gap-2"
                  data-testid="button-update-status"
                >
                  <UserCog className="h-4 w-4" />
                  Update Status
                </Button>
              </div>
            )}
            
            <div className="flex items-end gap-1.5 sm:gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type message..."
                disabled={!isConnected}
                className="flex-grow p-2 sm:p-2.5 md:p-3 border-2 border-border rounded-xl sm:rounded-2xl resize-none focus:ring-primary focus:border-primary bg-background text-foreground placeholder:text-muted-foreground text-sm"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected || !inputMessage.trim()}
                variant="default"
                className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-xl sm:rounded-2xl font-semibold shadow-sm transition-all h-auto text-sm flex-shrink-0"
                data-testid="button-send"
              >
                <Send className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Send</span>
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

        {/* RIGHT COLUMN: User List or Context Panel - Only render on desktop for better mobile performance */}
        {!shouldUseMobileLayout && (
        <section className="min-w-[280px] max-w-[320px] w-auto bg-muted border-l border-border flex flex-col flex-shrink-0">
          
          {/* Header with toggle */}
          <div className="px-3 py-2 border-b border-border flex-shrink-0 bg-muted/50">
            <div className="flex items-center gap-1.5">
              {showContextPanel && isStaff ? (
                <>
                  <Info className="w-4 h-4 text-primary flex-shrink-0" />
                  <h2 className="text-xs font-bold text-foreground">
                    Ticket Context
                  </h2>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 text-primary flex-shrink-0" />
                  <h2 className="text-xs font-bold text-foreground">
                    Online Users
                  </h2>
                </>
              )}
              {isStaff && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-5 px-2 text-[9px]"
                  onClick={() => setShowContextPanel(!showContextPanel)}
                  data-testid="toggle-context-panel"
                >
                  {showContextPanel ? 'Users' : 'Context'}
                </Button>
              )}
              {!showContextPanel && (
                <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0 bg-primary text-white" data-testid="text-user-count">
                  {uniqueUsers.length}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Content Area - Context Panel or User List */}
          {showContextPanel && isStaff && selectedUserId ? (
            <TicketContextPanel
              user={{
                id: selectedUserId,
                name: uniqueUsers.find(u => u.id === selectedUserId)?.name || "User",
                email: "customer@example.com",
                organization: "AutoForce™ Customer",
                subscriptionTier: "professional" as const,
                accountCreated: new Date().toISOString().split('T')[0],
              }}
              previousTickets={[]}
              suggestedArticles={[
                {
                  id: "kb-001",
                  title: "Getting Started with AutoForce™",
                  url: "/help/getting-started",
                  relevance: 0.95,
                },
                {
                  id: "kb-002",
                  title: "Common Support Issues",
                  url: "/help/troubleshooting",
                  relevance: 0.87,
                },
              ]}
            />
          ) : (
            <ScrollArea className="flex-grow p-2">
              <div className="space-y-1">
                {uniqueUsers.map((u) => {
                  // No IRC prefix - WF logo icon shows authority
                
                return (
                  <ContextMenu key={u.id}>
                    <ContextMenuTrigger>
                      <div 
                        className={`
                          flex items-center gap-1.5 p-1.5 rounded-lg cursor-pointer transition-all border
                          ${selectedUserId === u.id 
                            ? 'bg-muted shadow-sm border-primary/50 ring-1 ring-primary/20' 
                            : 'bg-card hover:bg-muted border-border hover:border-primary/30'
                          }
                        `}
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`user-${u.id}`}
                      >
                        {/* Status Indicator - Extra Compact */}
                        <div className="flex-shrink-0">
                          {getStatusIndicator(u.status || 'online')}
                        </div>
                        
                        {/* User Type Icon - AutoForce™ Logo for staff, Avatar for users */}
                        <div className="flex-shrink-0">
                          {getUserTypeIcon(u.userType || 'guest', u.role, u.name)}
                        </div>
                        
                        {/* User Name with inline superscript role badge - matching mobile chat */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-0.5 flex-wrap">
                            <span className={`text-[11px] font-semibold break-words ${getRoleColor(u.role)}`}>
                              {u.role === 'bot' ? 'HelpOS' : u.name}
                              {/* Inline superscript role badge */}
                              {getRoleIcon(u.role)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-card shadow-lg border-2 border-border w-72 z-50">
                      {isStaff && u.role !== 'bot' && (userPlatformRole === 'root_admin' || u.role !== 'root_admin') ? (
                        <>
                          <div className="px-2 py-1.5 text-xs font-bold text-foreground border-b border-border">
                            {u.name}
                          </div>
                          
                          {/* View Profile - Available to Everyone */}
                          <ContextMenuItem onClick={() => {
                            setSelectedUserId(u.id);
                            setShowUserProfile(true);
                          }}>
                            <Info className="w-4 h-4 mr-2" />
                            View Profile
                          </ContextMenuItem>
                          
                          {/* Quick Actions - Top Level */}
                          {hasContextPermission(ALL_STAFF) && (
                            <>
                              <ContextMenuItem onClick={() => {
                                sendRawMessage({ type: 'release_spectator', targetUserId: u.id });
                                sendQuickMessage(`Hi ${u.name}! 👋 My name is ${userName}, I'm here to help you today. What can I assist you with?`);
                              }}>
                                🎤 Welcome
                              </ContextMenuItem>
                              
                              <ContextMenuItem onClick={() => handleQuickReply(u)}>
                                💬 Quick Reply
                              </ContextMenuItem>
                            </>
                          )}
                          
                          {/* Chat Commands Submenu */}
                          {hasContextPermission(ALL_STAFF) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                💭 Chat Commands
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => {
                                  sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'info', message: 'Please provide more details' });
                                }}>
                                  ❓ Request Info
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleInternalNote(u)}>
                                  📝 Internal Note
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => toggleSilence(u)}>
                                  {silencedUsers.has(u.id) ? '🔊 Unmute User' : '🔇 Silence User'}
                                </ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* Account Actions Submenu */}
                          {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                👤 Account Actions
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => {
                                  sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'authenticate', message: 'Please verify your identity' });
                                }}>
                                  🔐 Request Auth
                                </ContextMenuItem>
                                {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
                                  <>
                                    <ContextMenuItem onClick={() => handleResetPassword(u)}>
                                      🔑 Reset Password
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleUnlockAccount(u)}>
                                      🔓 Unlock Account
                                    </ContextMenuItem>
                                  </>
                                )}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* Documents Submenu */}
                          {hasContextPermission(ALL_STAFF) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                📁 Documents
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => {
                                  sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'document', message: 'Please upload the document' });
                                  trackDocumentRequest(u.id, 'document');
                                }}>
                                  {hasRequestedDocument(u.id, 'document') ? '✅ Already Asked: Document' : '📄 Request Document'}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => {
                                  sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'photo', message: 'Please upload a photo' });
                                  trackDocumentRequest(u.id, 'photo');
                                }}>
                                  {hasRequestedDocument(u.id, 'photo') ? '✅ Already Asked: Photo' : '📷 Request Photo'}
                                </ContextMenuItem>
                                {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
                                  <>
                                    <ContextMenuItem onClick={() => {
                                      sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'signature', message: 'Please sign the form' });
                                      trackDocumentRequest(u.id, 'signature');
                                    }}>
                                      {hasRequestedDocument(u.id, 'signature') ? '✅ Already Asked: Signature' : '✍️ Request E-Signature'}
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleViewDocuments(u)}>
                                      📂 View Uploads
                                    </ContextMenuItem>
                                  </>
                                )}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* Case Management Submenu */}
                          {hasContextPermission(ALL_STAFF) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                📋 Case Management
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => {
                                  sendQuickMessage(`@${u.name} Your issue has been resolved! Anything else I can help with?`);
                                }}>
                                  ✅ Mark Resolved
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleEscalate(u)}>
                                  ⬆️ Escalate
                                </ContextMenuItem>
                                {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
                                  <>
                                    <ContextMenuItem onClick={() => {
                                      sendRawMessage({ type: 'transfer_user', targetUserId: u.id });
                                    }}>
                                      🔄 Transfer
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleFollowUp(u)}>
                                      ⏰ Follow-up
                                    </ContextMenuItem>
                                  </>
                                )}
                                {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
                                  <ContextMenuItem onClick={() => handlePriorityTag(u)}>
                                    🏷️ Priority Tag
                                  </ContextMenuItem>
                                )}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* Advanced Tools Submenu */}
                          {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                ⚙️ Advanced Tools
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => handleEmailSummary(u)}>
                                  📧 Email Summary
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleMarkVIP(u)}>
                                  ⭐ Mark VIP
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleUserHistory(u)}>
                                  📜 User History
                                </ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* Moderation Submenu */}
                          {hasContextPermission(ADMIN_ONLY) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger className="text-red-600">
                                ⚠️ Moderation
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => handleIssueWarning(u)}>
                                  ⚠️ Issue Warning
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleTempMute(u)}>
                                  ⏱️ Mute 5min
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => setKickDialogUser({ userId: u.id, userName: u.name })} className="text-red-600">
                                  🚫 Kick
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => toggleBan(u)} className="text-red-700 font-bold">
                                  {bannedUsers.has(u.id) ? '✅ Unban User' : '🔨 Ban User'}
                                </ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                          
                          {/* System Tools Submenu */}
                          {hasContextPermission(SYSTEM_ONLY) && (
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>
                                🛠️ System Tools
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                <ContextMenuItem onClick={() => handleAnalytics()}>
                                  📊 Analytics
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleForceReconnect(u)}>
                                  🔄 Reconnect
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleTestMessage()}>
                                  🧪 Test Message
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleClearCache(u)}>
                                  ⚡ Clear Cache
                                </ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          )}
                        </>
                      ) : (
                        <>
                          {isStaff && (
                            <ContextMenuItem onClick={() => {
                              setDiagnosticsUserId(u.id);
                              setShowDiagnostics(true);
                            }} data-testid={`button-view-profile-${u.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Profile (AI Diagnostics™)
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem onClick={() => {
                            setSelectedUserId(u.id);
                            setShowUserProfile(true);
                          }}>
                            <Info className="w-4 h-4 mr-2" />
                            View Basic Info
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleMention(u.name)}>
                            💬 Mention {u.name}
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
              </div>
            </ScrollArea>
          )}
        </section>
        )}
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

      {/* Branded Kick Dialog - Two-step with templated reasons */}
      <KickDialog
        open={!!kickDialogUser}
        userName={kickDialogUser?.userName || ''}
        onConfirm={(reason) => {
          if (kickDialogUser) {
            kickUser(kickDialogUser.userId, reason);
            // Don't show success toast immediately - wait for server confirmation
            // Server will broadcast a system message when user is actually removed
            setKickDialogUser(null);
          }
        }}
        onCancel={() => setKickDialogUser(null)}
      />

      {/* Branded Silence Dialog - Two-step with templated reasons */}
      <SilenceDialog
        open={!!silenceDialogUser}
        userName={silenceDialogUser?.userName || ''}
        onConfirm={(duration, reason) => {
          if (silenceDialogUser) {
            sendRawMessage({ 
              type: 'silence_user', 
              targetUserId: silenceDialogUser.userId,
              duration: parseInt(duration),
              reason: reason
            });
            setSilencedUsers(prev => {
              const next = new Set(prev);
              next.add(silenceDialogUser.userId);
              return next;
            });
            toast({ 
              title: "✓ User Silenced", 
              description: `${silenceDialogUser.userName} • ${duration}min • ${reason}`,
            });
            setSilenceDialogUser(null);
          }
        }}
        onCancel={() => setSilenceDialogUser(null)}
      />

      {/* AI Diagnostics™ - User Diagnostics Panel (Desktop) */}
      <UserDiagnosticsPanel
        userId={diagnosticsUserId}
        open={showDiagnostics}
        onClose={() => {
          setShowDiagnostics(false);
          setDiagnosticsUserId(null);
        }}
        variant="desktop"
      />

      {/* Tutorial Dialog */}
      {showTutorial && (
        <BrandedConfirmDialog
          open={showTutorial}
          onClose={() => setShowTutorial(false)}
          title="HelpDesk Tutorial"
          description="Welcome to AutoForce™ HelpDesk! Here's how to use the system: 1) Use the command buttons to quickly access features. 2) Type /help to see all available commands. 3) Staff will assist you shortly. 4) Use the chat to describe your issue clearly."
          confirmLabel="Got it!"
          onConfirm={() => setShowTutorial(false)}
        />
      )}


      {/* Banner Manager - Staff Only */}
      {isStaff && (
        <BannerManager
          open={showBannerManager}
          onClose={() => setShowBannerManager(false)}
          currentBanners={promotionalBanners}
          onSendCommand={(command) => {
            // Parse banner commands and call API
            const parts = command.split(' ');
            const action = parts[1]; // 'add', 'edit', 'remove', 'toggle'
            
            if (action === 'add') {
              // Extract message from quotes
              const messageMatch = command.match(/"([^"]+)"/);
              const message = messageMatch ? messageMatch[1] : '';
              
              if (message) {
                createBannerMutation.mutate({
                  message,
                  isActive: true, // Make new banners active by default
                });
                setShowBannerManager(false);
              }
            } else if (action === 'edit') {
              // /banner edit <id> "<message>" <type> <icon> [<link>]
              const bannerId = parts[2];
              const messageMatch = command.match(/"([^"]+)"/);
              const message = messageMatch ? messageMatch[1] : '';
              
              if (bannerId && message) {
                updateBannerMutation.mutate({
                  id: bannerId,
                  data: { message },
                });
                setShowBannerManager(false);
              }
            } else if (action === 'remove') {
              const bannerId = parts[2];
              if (bannerId) {
                deleteBannerMutation.mutate(bannerId);
              }
            } else if (action === 'toggle') {
              const bannerId = parts[2];
              const isActive = parts[3] === 'on';
              if (bannerId) {
                updateBannerMutation.mutate({
                  id: bannerId,
                  data: { isActive },
                });
              }
            }
          }}
        />
      )}

      {/* Help Command Panel */}
      <HelpCommandPanel
        open={showHelpPanel}
        onClose={() => setShowHelpPanel(false)}
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

      {/* Room Status Dialog - Functional with Select + Textarea + Save - Mobile responsive */}
      <Dialog open={showRoomStatus && isStaff} onOpenChange={(open) => { if (!open) setShowRoomStatus(false); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[calc(100vh-2rem)] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle>Change Room Status</DialogTitle>
                <DialogDescription>
                  Update HelpDesk availability and notify users
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status-select">Room Status</Label>
              <Select 
                value={roomStatusControl} 
                onValueChange={(value: "open" | "closed" | "maintenance") => setRoomStatusControl(value)}
              >
                <SelectTrigger id="status-select" data-testid="select-room-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">🟢 Open - Accepting Support Requests</SelectItem>
                  <SelectItem value="closed">🔴 Closed - No Support Available</SelectItem>
                  <SelectItem value="maintenance">🟡 Maintenance - System Updates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-message">Status Message (Optional)</Label>
              <Textarea
                id="status-message"
                data-testid="textarea-status-message"
                placeholder="e.g., 'Back at 9 AM EST' or 'System upgrade in progress'"
                value={roomStatusMessage}
                onChange={(e) => setRoomStatusMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRoomStatus(false)}
              data-testid="button-cancel-status"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                toggleRoomStatusMutation.mutate({
                  status: roomStatusControl,
                  statusMessage: roomStatusMessage || undefined,
                });
              }}
              disabled={toggleRoomStatusMutation.isPending}
              data-testid="button-save-status"
            >
              {toggleRoomStatusMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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


      {/* Controls Menu - Slide-Over Panel (Emerald Color Scheme) */}
      <Sheet open={showControlsMenu} onOpenChange={setShowControlsMenu}>
        <SheetContent className="w-full sm:max-w-2xl bg-muted border-border">
          <SheetHeader className="border-b border-primary pb-4 mb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-2xl font-bold text-primary">
                <div className="flex items-center gap-2">
                  <Settings className="w-6 h-6 text-primary" />
                  Controls & Actions
                </div>
              </SheetTitle>
              <Button
                onClick={() => setShowControlsMenu(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                data-testid="button-close-controls"
              >
                <X className="w-5 h-5 text-foreground dark:text-foreground hover:text-primary" />
              </Button>
            </div>
          </SheetHeader>
          
          {/* Full Command Bar Inside Sheet */}
          <div className="space-y-4">
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
              onlineStaffCount={uniqueUsers.filter(u => ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.role)).length}
              showCoffeeCup={showCoffeeCup}
              onShowHelp={() => {
                setShowHelpPanel(true);
                setShowControlsMenu(false);
              }}
              onShowQueue={() => {
                setShowQueuePanel(true);
                setShowControlsMenu(false);
              }}
              onShowTutorial={() => {
                setShowTutorial(true);
                setShowControlsMenu(false);
              }}
              onShowPriority={() => {
                setShowPriorityPanel(true);
                setShowControlsMenu(false);
              }}
              onShowAccount={() => {
                setShowAccountPanel(true);
                setShowControlsMenu(false);
              }}
              onToggleRoomStatus={() => {
                setShowRoomStatus(true);
                setShowControlsMenu(false);
              }}
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
        </SheetContent>
      </Sheet>

      {/* User Profile/Diagnostics Dialog - Mobile responsive */}
      <Dialog open={showUserProfile} onOpenChange={(open) => {
        setShowUserProfile(open);
        if (!open) setSelectedUserId(null); // Reset selection when dialog closes
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-y-auto bg-gradient-to-br from-white via-gray-50 to-blue-50 border-2 border-gray-200 text-gray-900 [&>button]:text-gray-500 [&>button]:opacity-100 [&>button]:hover:text-gray-900 [&>button]:focus-visible:ring-2 [&>button]:focus-visible:ring-blue-600">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl text-gray-900">
              <AnimatedAutoForceLogo size="sm" variant="icon" />
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-400" />
                User Profile & Diagnostics
              </div>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              {isStaff ? 'Complete user information and diagnostics' : 'Basic user information'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {selectedUserId && userContext ? (
              <div className="space-y-4">
                {/* Detect simulated/demo users */}
                {(selectedUserId.startsWith('sim-') || selectedUserId.startsWith('demo-')) && userContext.user?.isSimulated ? (
                  /* Simulated/Demo user information */
                  <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-md">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 shadow-md flex items-center justify-center ring-2 ring-blue-200">
                          <Users size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-gray-900 font-bold text-lg">
                            {userContext.user.firstName} {userContext.user.lastName}
                          </h3>
                          <Badge variant="secondary" className="bg-muted/20 text-primary border-primary/30 mt-1">
                            Simulated Demo User
                          </Badge>
                        </div>
                      </div>
                      <p className="text-primary text-sm mb-3">
                        This is a simulated user account for testing and demonstration purposes.
                      </p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Email:</span>
                          <span className="text-gray-900">{userContext.user.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Role:</span>
                          <span className="text-gray-900">{userContext.user.platformRole}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">User ID:</span>
                          <span className="text-gray-900 font-mono text-xs">{userContext.user.id}</span>
                        </div>
                      </div>
                    </div>

                    {userContext.note && (
                      <div className="bg-muted/10 border border-primary/30 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-primary text-xs">
                            {userContext.note}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (selectedUserId.startsWith('helpbot') || selectedUserId.startsWith('system_')) ? (
                  /* Bot/System user information */
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center ring-2 ring-blue-500/50">
                          <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-gray-900 font-bold text-lg">
                            {selectedUserId.startsWith('helpbot') ? 'HelpOS™' : 'System Bot'}
                          </h3>
                          <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 border-blue-500/30 mt-1">
                            System-Generated AI Assistant
                          </Badge>
                        </div>
                      </div>
                      <p className="text-blue-800 text-sm">
                        AI-powered customer support assistant designed to provide instant responses and assistance.
                      </p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-400" />
                        Capabilities
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 text-xs">24/7 instant customer support</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 text-xs">Automated ticket creation and routing</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 text-xs">Context-aware responses</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 text-xs">Human escalation when needed</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-blue-300 text-xs">
                          This is an automated system. For sensitive issues, request human support agent.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : userContext.user ? (
                  /* Real user information */
                  <div className="space-y-3">
                    {isStaff ? (
                      /* Full information for support staff */
                      <>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                            <Info className="w-4 h-4 text-blue-400" />
                            User Details
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <span className="text-gray-600 text-xs block mb-1">Full Name</span>
                              <span className="text-gray-900 text-sm font-medium">
                                {userContext.user.firstName} {userContext.user.lastName}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600 text-xs block mb-1">User ID</span>
                              <span className="text-gray-900 font-mono text-xs">{userContext.user.id}</span>
                            </div>
                            <div>
                              <span className="text-gray-600 text-xs block mb-1">Email</span>
                              <span className="text-gray-900 text-sm">{userContext.user.email || 'Not Available'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600 text-xs block mb-1">Platform Role</span>
                              <Badge variant="secondary" className="text-xs">
                                {userContext.user.platformRole || 'guest'}
                              </Badge>
                            </div>
                            <div>
                              <span className="text-gray-600 text-xs block mb-1">Account Created</span>
                              <span className="text-gray-600 text-xs">
                                {userContext.user.createdAt ? new Date(userContext.user.createdAt).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {userContext.workspace && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="text-gray-900 font-semibold text-sm mb-3">Workspace Info</h4>
                            <div className="space-y-3">
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Workspace</span>
                                <span className="text-gray-900 text-sm">{userContext.workspace.name}</span>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Serial Number</span>
                                <span className="text-gray-900 font-mono text-xs">{userContext.workspace.serialNumber}</span>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Subscription</span>
                                <Badge variant="outline" className="text-xs">
                                  {userContext.workspace.subscriptionTier || 'Free'}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Role</span>
                                <Badge variant="secondary" className="text-xs">
                                  {userContext.workspace.role || 'member'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}

                        {userContext.metrics && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="text-gray-900 font-semibold text-sm mb-3">Support Metrics</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Total Tickets</span>
                                <span className="text-gray-900 text-lg font-bold">{userContext.metrics.totalTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Active</span>
                                <span className="text-blue-600 text-lg font-bold">{userContext.metrics.activeTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Resolved</span>
                                <span className="text-blue-600 text-lg font-bold">{userContext.metrics.resolvedTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-600 text-xs block mb-1">Resolution Rate</span>
                                <span className="text-blue-600 text-lg font-bold">{userContext.metrics.resolutionRate || 0}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => {
                            toast({ 
                              title: "Success", 
                              description: `Viewing full history for ${userContext.user.firstName} ${userContext.user.lastName}` 
                            });
                            setShowUserProfile(false);
                          }}
                          className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-gray-900"
                          data-testid="button-user-history"
                        >
                          <History className="w-4 h-4 mr-2" />
                          View Full History
                        </Button>
                      </>
                    ) : (
                      /* Limited information for regular users */
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="text-gray-900 font-semibold text-sm mb-3">Basic Info</h4>
                        <div className="space-y-3">
                          <div>
                            <span className="text-gray-600 text-xs block mb-1">Name</span>
                            <span className="text-gray-900 text-sm">
                              {userContext.user.firstName} {userContext.user.lastName}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600 text-xs block mb-1">Status</span>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                              <span className="text-primary text-sm">Online</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-primary text-xs">
                            <Info className="w-3 h-3 inline mr-1" />
                            Full user details are only visible to support staff
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : userContextIsError ? (
                  /* Error state - user not found or error loading */
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                    <p className="text-red-600 text-sm font-semibold">
                      {(userContextError as any)?.error || 'User information not available'}
                    </p>
                    {(userContextError as any)?.suggestion && (
                      <p className="text-gray-600 text-xs mt-2">{(userContextError as any).suggestion}</p>
                    )}
                    {(userContextError as any)?.userId && (
                      <div className="mt-3 bg-red-50 border border-red-300 rounded-lg p-3">
                        <p className="text-red-700 text-xs">
                          <strong>User ID:</strong> {(userContextError as any).userId}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fallback - No data */
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 text-sm">No user information available</p>
                  </div>
                )}
              </div>
            ) : (
              /* Loading state with AutoForce™ branding */
              <div className="text-center py-8">
                <div className="mb-4 flex justify-center">
                  <AnimatedAutoForceLogo size="lg" variant="icon" className="opacity-75" />
                </div>
                <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-600 text-sm font-medium">Loading user information...</p>
                <p className="text-gray-600 text-xs mt-1">Powered by AutoForce™</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowUserProfile(false)} variant="outline" className="bg-blue-50 text-gray-900 border-gray-200 hover:bg-blue-100" data-testid="button-close-profile">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HelpOS™ AI Tester - Floating button to test Gemini integration */}
      <HelpOsAiTester />
    </div>
  );
}

// Default export for backward compatibility
export default HelpDesk;
