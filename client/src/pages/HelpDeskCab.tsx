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
import { WFLogoCompact } from "@/components/wf-logo";
import { AutoForceLogo } from "@/components/autoforce-logo";
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
import { TermsDialog } from "@/components/terms-dialog";
import { ChatAgreementModal } from "@/components/chat-agreement-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDiagnosticsPanel } from "@/components/user-diagnostics-panel";
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

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

interface HelpDeskCabProps {
  forceMobileLayout?: boolean; // Force mobile layout regardless of screen size
}

// Desktop IRC/MSN-style 3-column chatroom with WorkforceOS blue branding
// Can also be forced to mobile layout for /mobilechat route
export function HelpDeskCab({ forceMobileLayout = false }: HelpDeskCabProps = {}) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
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
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [hasAcceptedAgreement, setHasAcceptedAgreement] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsUserId, setDiagnosticsUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // User state tracking for contextual menus
  const [silencedUsers, setSilencedUsers] = useState<Set<string>>(new Set());
  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
  const [documentRequests, setDocumentRequests] = useState<Map<string, Set<string>>>(new Map());
  // Map structure: userId => Set of request types ('authenticate', 'document', 'photo', 'signature', 'info')
  
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

  // No IRC-style messages - users see terms/agreement first, then optional MOTD dialog if set by admins

  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';

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

  // Enhanced connection state tracking
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error' | 'denied'>('disconnected');
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  const { data: roomData, error: roomError } = useQuery({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: isAuthenticated,
    retry: 1,
  });

  // Check if user has accepted agreement - FIXED: Custom queryFn to pass sessionId properly
  const { data: agreementStatus, error: agreementError } = useQuery<{ hasAccepted: boolean; acceptedAt: string | null }>({
    queryKey: ['/api/helpdesk/agreement/check/helpdesk', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/helpdesk/agreement/check/helpdesk?sessionId=${sessionId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check agreement');
      return res.json();
    },
    enabled: isAuthenticated,
    retry: false,
  });

  // Agreement acceptance mutation
  const acceptAgreementMutation = useMutation({
    mutationFn: async (fullName: string) => {
      return apiRequest('POST', '/api/helpdesk/agreement/accept', {
        fullName,
        roomSlug: 'helpdesk',
        sessionId,
      });
    },
    onSuccess: () => {
      setHasAcceptedAgreement(true);
      setShowAgreement(false);
      toast({
        title: "Agreement Accepted",
        description: "Welcome to WorkforceOS Support Chat",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit agreement",
        variant: "destructive",
      });
    },
  });

  // Show agreement modal if not accepted
  useEffect(() => {
    if (agreementStatus && !agreementStatus.hasAccepted && !hasAcceptedAgreement && isAuthenticated) {
      setShowAgreement(true);
    }
  }, [agreementStatus, hasAcceptedAgreement, isAuthenticated]);

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

  // Check if user has accepted terms on component mount
  useEffect(() => {
    const accepted = localStorage.getItem('helpdesk_terms_accepted');
    if (accepted === 'true') {
      setTermsAccepted(true);
    } else {
      // Show terms dialog on first visit
      setShowTermsDialog(true);
    }
  }, []);

  // Show MOTD dialog if there's an active MOTD that hasn't been acknowledged (only after terms accepted)
  useEffect(() => {
    if (termsAccepted && motdResponse && motdResponse.motd && !motdResponse.acknowledged) {
      setMotdData(motdResponse.motd);
      setShowMotd(true);
    }
  }, [motdResponse, termsAccepted]);

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
  }, [isConnected, roomError, agreementError, queueError, motdError, onlineUsers.length, roomData]);

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

  // Handle terms acceptance with initials
  const handleAcceptTerms = async (initials: string) => {
    try {
      // Save to database for audit compliance
      await apiRequest('POST', '/api/helpdesk/terms/accept', {
        initialsProvided: initials,
        userName: userName,
        userEmail: user?.email,
        workspaceId: (user as any)?.currentWorkspaceId,
        ticketNumber: (user as any)?.ticketNumber || null,
      });

      localStorage.setItem('helpdesk_terms_accepted', 'true');
      setTermsAccepted(true);
      setShowTermsDialog(false);
      
      toast({
        title: "Terms Accepted",
        description: "Your agreement has been recorded. Welcome to HelpDesk Support!",
      });
    } catch (error) {
      console.error('Failed to save terms acceptance:', error);
      toast({
        title: "Error",
        description: "Failed to save your acceptance. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeclineTerms = () => {
    // Clear any stored acceptance and redirect away from chat
    localStorage.removeItem('helpdesk_terms_accepted');
    setShowTermsDialog(false);
    
    toast({
      title: "Terms Declined",
      description: "You must accept the terms to access support chat. Redirecting...",
      variant: "destructive",
    });
    
    // Redirect to home page after a brief delay
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  };

  // Get user type icon - WorkforceOS logo ONLY for staff, avatars for users
  const getUserTypeIcon = (userType: string, role: string, userName: string = 'User') => {
    // ROOT ADMIN - Detailed WorkforceOS logo (COMPACT SIZE)
    if (role === 'root') {
      return (
        <div className="flex items-center justify-center scale-[0.55]">
          <AutoForceLogo size="sm" variant="icon" />
        </div>
      );
    }
    
    // Bot gets special amber Sparkles icon (matching mobile chat)
    if (role === 'bot') {
      return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-500 to-yellow-600 ring-2 ring-amber-500/50">
          <Sparkles size={14} className="text-white" />
        </div>
      );
    }
    
    // ALL STAFF (deputy_admin, deputy_assistant, sysop) - WorkforceOS logo (COMPACT SIZE)
    if (['deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      return (
        <div className="flex items-center justify-center scale-[0.55]">
          <AutoForceLogo size="sm" variant="icon" />
        </div>
      );
    }
    
    // Subscribers - Professional avatar with initials
    if (userType === 'subscriber') {
      const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return (
        <Avatar className="w-5 h-5 border border-blue-400">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-[9px] font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      );
    }
    
    // Organization users - Professional avatar with initials
    if (userType === 'org_user') {
      const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return (
        <Avatar className="w-5 h-5 border border-slate-400">
          <AvatarFallback className="bg-slate-100 text-slate-700 text-[9px] font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      );
    }
    
    // Guests - Simple avatar with question mark
    return (
      <Avatar className="w-5 h-5 border border-slate-300">
        <AvatarFallback className="bg-slate-50 text-slate-500 text-[9px]">
          <HelpCircle className="w-3 h-3" />
        </AvatarFallback>
      </Avatar>
    );
  };

  // Get status indicator - Extra Compact
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online': return <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-sm" />;
      case 'away': return <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shadow-sm" />;
      case 'busy': return <div className="w-1.5 h-1.5 bg-rose-500 rounded-full shadow-sm" />;
      default: return <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />;
    }
  };

  // Get role display text - matching mobile chat format
  const getRoleDisplay = (role?: string) => {
    if (!role) return null;
    switch(role) {
      case 'root': return 'Admin';
      case 'deputy_admin': return 'Deputy';
      case 'deputy_assistant': return 'Assistant';
      case 'sysop': return 'Sysop';
      case 'auditor': return 'Auditor';
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
    const staffRoles = ['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'auditor', 'bot'];
    
    if (!staffRoles.includes(role)) {
      return null; // No badge for regular users/subscribers
    }
    
    const roleText = getRoleDisplay(role);
    if (!roleText) return null;
    
    const isBot = role === 'bot';
    // Smaller superscript (text-[9px]) but still visible with space separation
    return (
      <sup className={`text-[9px] font-semibold ml-1 ${isBot ? 'text-amber-500' : 'text-indigo-500'}`}>
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
      
      // Add the username with superscript role - HARDCODED smaller but visible
      parts.push(
        <span key={key++} className="font-semibold">
          {userName}
          <sup className={`text-[9px] font-semibold ml-1 ${isBot ? 'text-amber-500' : 'text-indigo-500'}`}>
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
      case 'root': return 'text-indigo-600 font-bold';  // Root admin
      case 'bot': return 'text-amber-600 font-bold';  // Bot
      case 'deputy_admin': return 'text-indigo-600 font-bold';
      case 'deputy_assistant': return 'text-blue-600 font-bold';
      case 'sysop': return 'text-purple-600 font-bold';
      default: return 'text-slate-700 font-semibold';  // Regular users
    }
  };

  // Get message bubble color - Unified, aesthetically pleasing design with good contrast
  const getMessageBubbleColor = (senderType: string, role: string, isSelf: boolean) => {
    if (isSelf) {
      // Support staff own messages - soft indigo (not too dark)
      return 'bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 shadow-sm';
    }
    
    // Bot messages - warm amber/cream background
    if (role === 'bot' || senderType === 'bot') {
      return 'bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 shadow-sm';
    }
    
    // Staff messages - soft indigo/blue background (lighter than own messages)
    if (role === 'root' || role === 'deputy_admin' || role === 'deputy_assistant' || role === 'sysop') {
      return 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 shadow-sm';
    }
    
    // Customer/regular messages - neutral warm gray
    return 'bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 shadow-sm';
  };

  const isStaff = user && ['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes((user as any).platformRole);
  const userPlatformRole = (user as any)?.platformRole;
  const queueLength = queueData?.length || 0;

  // Role-based permission system
  const hasContextPermission = (requiredRoles: string[]) => {
    if (!userPlatformRole) return false;
    return requiredRoles.includes(userPlatformRole);
  };

  // Role constants
  const ALL_STAFF = ['root', 'deputy_admin', 'deputy_assistant', 'sysop'];
  const DEPUTY_ASSISTANT_PLUS = ['root', 'deputy_admin', 'deputy_assistant'];
  const DEPUTY_ADMIN_PLUS = ['root', 'deputy_admin'];
  const ADMIN_ONLY = ['root', 'deputy_admin'];
  const SYSTEM_ONLY = ['root', 'sysop'];

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

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 relative">
      {/* Seasonal Animated Background */}
      <SeasonalBackground enabled={seasonalAnimationsEnabled} />
      {/* ADVERTISEMENT / ANNOUNCEMENT BANNER - Thick, customizable, seasonal */}
      <div className="relative z-20 bg-transparent">
        <div className="relative">
          {/* Main Banner Content */}
          <ChatAnnouncementBanner
            queuePosition={queueLength || 1}
            queueWaitTime="2-3 minutes"
            onlineStaff={uniqueUsers.filter(u => ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}
            seasonalAnimationsEnabled={seasonalAnimationsEnabled}
            customMessages={customBannerMessage ? [{
              id: 'custom-1',
              text: customBannerMessage,
              type: 'promo' as const,
              icon: 'zap'
            }] : []}
          />
          
          {/* Floating Controls - Overlaid on banner - Far Right Only */}
          <div className="absolute top-1 right-2 flex items-center gap-1.5">
            {/* Connection Status indicators removed - only show by send button */}
            
            {/* Theme Toggle - Transparent and only visible on hover (desktop) */}
            <div className="hidden md:flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
              <div className="bg-white/20 hover:bg-white/40 border border-white/30 backdrop-blur-md h-6 w-6 rounded-md flex items-center justify-center">
                <ThemeToggle />
              </div>
            </div>
            
            {/* Staff Controls - Transparent and only visible on hover (desktop) */}
            {isStaff && (
              <div className="hidden md:flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
                <Button
                  onClick={() => {
                    const newValue = !seasonalAnimationsEnabled;
                    setSeasonalAnimationsEnabled(newValue);
                    localStorage.setItem('seasonal-animations-enabled', String(newValue));
                    toast({ 
                      title: newValue ? "✓ Animations On" : "Animations Off",
                    });
                  }}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[9px] px-2 gap-1 bg-white/20 hover:bg-white/40 border-white/30 backdrop-blur-md text-white shadow-sm"
                  data-testid="button-toggle-seasonal"
                >
                  ❄️ {seasonalAnimationsEnabled ? 'ON' : 'OFF'}
                </Button>
                <Button
                  onClick={() => setShowBannerManager(true)}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[9px] px-2 gap-1 bg-white/20 hover:bg-white/40 border-white/30 backdrop-blur-md text-white shadow-sm"
                  data-testid="button-open-banner-manager"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Banner
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout - Full Width with MSN-style separation */}
      <main className="flex flex-grow overflow-hidden max-w-7xl mx-auto w-full relative z-10 border-l-4 border-r-4 border-slate-300/50">
        {/* CENTER COLUMN: Chat Area - Clear boundary */}
        <section className="flex-grow flex flex-col bg-white/60 backdrop-blur-md relative border-r-2 border-slate-300/70 shadow-inner">
          {/* Messages Area */}
          <ScrollArea className="flex-grow p-3">
            <div className="space-y-2">

              {/* Chat Messages - Modern bubbles with WorkforceOS blue */}
              {messages.map((msg, idx) => {
                const isSelf = msg.senderId === user?.id;
                const role = (msg as any).role || 'guest';
                
                // System messages
                if (msg.senderType === 'system' || msg.isSystemMessage) {
                  return (
                    <div key={idx} className="flex justify-center my-1">
                      <span className="text-[10px] font-mono text-slate-600 italic bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1.5">
                        <WFLogoCompact size={10} />
                        {parseSystemMessage(msg.message)}
                      </span>
                    </div>
                  );
                }

                // Regular messages - ALL left-aligned with modern bubbles
                const displayName = msg.senderName || userName || 'User';
                const bubbleColor = getMessageBubbleColor(msg.senderType || 'customer', role, isSelf);
                const nameColor = getRoleColor(role);

                return (
                  <div key={idx} className={`${bubbleColor} shadow-sm p-2 rounded-lg max-w-[90%] hover:shadow-md transition-all`}>
                    <div className="flex items-start gap-2">
                      {/* Avatar Icon - Compact */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getUserTypeIcon((msg as any).userType || 'guest', role, displayName)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header: Name with inline superscript role badge + Timestamp */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-xs font-bold ${nameColor}`}>
                            {role === 'bot' ? 'HelpOS' : displayName.split('(')[0].trim()}
                            {/* Role badge as inline superscript like mathematical notation */}
                            {getRoleIcon(role)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-auto">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        
                        {/* Message Content - Smaller text with proper wrapping */}
                        <p className="text-slate-800 text-xs leading-snug break-words whitespace-pre-wrap">
                          {role === 'bot' ? parseSystemMessage(msg.message) : msg.message}
                        </p>
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
                className="flex-grow p-3 border-2 border-slate-300 rounded-2xl resize-none focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder:text-slate-400"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isConnected || !inputMessage.trim()}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-2xl font-semibold shadow-sm transition-all h-full"
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

        {/* RIGHT COLUMN: User List */}
        <section className="min-w-[200px] max-w-[260px] w-auto bg-gradient-to-b from-slate-100 via-blue-50 to-slate-100 backdrop-blur-sm flex flex-col flex-shrink-0 shadow-[-4px_0_12px_rgba(0,0,0,0.1)]">
          
          {/* User List Header */}
          <div className="px-3 py-2 border-b border-blue-300/50 flex-shrink-0 bg-gradient-to-r from-blue-100/80 to-slate-100/80">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <h2 className="text-xs font-bold text-slate-800">
                Online Users
              </h2>
              <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0 bg-blue-600 text-white" data-testid="text-user-count">
                {uniqueUsers.length}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="flex-grow p-2">
            <div className="space-y-1">
              {uniqueUsers.map((u) => {
                // No IRC prefix - WF logo icon shows authority
                
                return (
                  <ContextMenu key={u.id}>
                    <ContextMenuTrigger>
                      <div 
                        className={`
                          flex items-center gap-1.5 p-1 rounded-lg cursor-pointer transition-all border
                          ${selectedUserId === u.id 
                            ? 'bg-blue-100/90 shadow-sm border-blue-400/70' 
                            : 'bg-amber-50/90 hover:bg-amber-100/95 border-slate-200/50 hover:border-blue-300/50'
                          }
                        `}
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`user-${u.id}`}
                      >
                        {/* Status Indicator - Extra Compact */}
                        <div className="flex-shrink-0">
                          {getStatusIndicator(u.status || 'online')}
                        </div>
                        
                        {/* User Type Icon - WorkforceOS Logo for staff, Avatar for users */}
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
                    <ContextMenuContent className="bg-white border-slate-300 w-64">
                      {isStaff && u.role !== 'bot' && (userPlatformRole === 'root' || u.role !== 'root') ? (
                        <>
                          <div className="px-2 py-1.5 text-xs font-bold text-slate-700 border-b border-slate-200">
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
                              View Profile (QueryOS™)
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

      {/* QueryOS™ - User Diagnostics Panel (Desktop) */}
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
          description="Welcome to WorkforceOS HelpDesk! Here's how to use the system: 1) Use the command buttons to quickly access features. 2) Type /help to see all available commands. 3) Staff will assist you shortly. 4) Use the chat to describe your issue clearly."
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

      {/* Room Status Dialog - Functional with Select + Textarea + Save */}
      <Dialog open={showRoomStatus && isStaff} onOpenChange={(open) => { if (!open) setShowRoomStatus(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <WFLogoCompact className="h-8 w-auto" />
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

      {/* Terms & Conditions Dialog - Must accept before accessing chat */}
      <TermsDialog
        open={showTermsDialog}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
        userName={userName}
      />

      {/* Controls Menu - Slide-Over Panel (Emerald Color Scheme) */}
      <Sheet open={showControlsMenu} onOpenChange={setShowControlsMenu}>
        <SheetContent className="w-full sm:max-w-2xl bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300">
          <SheetHeader className="border-b border-emerald-200 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-2xl font-bold text-emerald-900">
                <div className="flex items-center gap-2">
                  <Settings className="w-6 h-6 text-emerald-600" />
                  Controls & Actions
                </div>
              </SheetTitle>
              <Button
                onClick={() => setShowControlsMenu(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-700 hover:bg-emerald-200"
                data-testid="button-close-controls"
              >
                <X className="w-5 h-5" />
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
              onlineStaffCount={uniqueUsers.filter(u => ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(u.role)).length}
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

      {/* User Profile/Diagnostics Dialog */}
      <Dialog open={showUserProfile} onOpenChange={(open) => {
        setShowUserProfile(open);
        if (!open) setSelectedUserId(null); // Reset selection when dialog closes
      }}>
        <DialogContent className="sm:max-w-[600px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl text-white">
              <AutoForceLogo size="sm" variant="icon" />
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-cyan-400" />
                User Profile & Diagnostics
              </div>
            </DialogTitle>
            <DialogDescription className="text-slate-300">
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
                    <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-blue-500/50">
                          <Users size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">
                            {userContext.user.firstName} {userContext.user.lastName}
                          </h3>
                          <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30 mt-1">
                            Simulated Demo User
                          </Badge>
                        </div>
                      </div>
                      <p className="text-blue-200 text-sm mb-3">
                        This is a simulated user account for testing and demonstration purposes.
                      </p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Email:</span>
                          <span className="text-white">{userContext.user.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">Role:</span>
                          <span className="text-white">{userContext.user.platformRole}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">User ID:</span>
                          <span className="text-white font-mono text-xs">{userContext.user.id}</span>
                        </div>
                      </div>
                    </div>

                    {userContext.note && (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                          <span className="text-blue-300 text-xs">
                            {userContext.note}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (selectedUserId.startsWith('helpbot') || selectedUserId.startsWith('system_')) ? (
                  /* Bot/System user information */
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center ring-2 ring-amber-500/50">
                          <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">
                            {selectedUserId.startsWith('helpbot') ? 'HelpOS™' : 'System Bot'}
                          </h3>
                          <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 border-amber-500/30 mt-1">
                            System-Generated AI Assistant
                          </Badge>
                        </div>
                      </div>
                      <p className="text-amber-200 text-sm">
                        AI-powered customer support assistant designed to provide instant responses and assistance.
                      </p>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                      <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        Capabilities
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-xs">24/7 instant customer support</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-xs">Automated ticket creation and routing</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-xs">Context-aware responses</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-xs">Human escalation when needed</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-amber-300 text-xs">
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
                        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                          <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                            <Info className="w-4 h-4 text-cyan-400" />
                            User Details
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <span className="text-slate-400 text-xs block mb-1">Full Name</span>
                              <span className="text-white text-sm font-medium">
                                {userContext.user.firstName} {userContext.user.lastName}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-xs block mb-1">User ID</span>
                              <span className="text-white font-mono text-xs">{userContext.user.id}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-xs block mb-1">Email</span>
                              <span className="text-white text-sm">{userContext.user.email || 'Not Available'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-xs block mb-1">Platform Role</span>
                              <Badge variant="secondary" className="text-xs">
                                {userContext.user.platformRole || 'guest'}
                              </Badge>
                            </div>
                            <div>
                              <span className="text-slate-400 text-xs block mb-1">Account Created</span>
                              <span className="text-slate-300 text-xs">
                                {userContext.user.createdAt ? new Date(userContext.user.createdAt).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {userContext.workspace && (
                          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                            <h4 className="text-white font-semibold text-sm mb-3">Workspace Info</h4>
                            <div className="space-y-3">
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Workspace</span>
                                <span className="text-white text-sm">{userContext.workspace.name}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Serial Number</span>
                                <span className="text-white font-mono text-xs">{userContext.workspace.serialNumber}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Subscription</span>
                                <Badge variant="outline" className="text-xs">
                                  {userContext.workspace.subscriptionTier || 'Free'}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Role</span>
                                <Badge variant="secondary" className="text-xs">
                                  {userContext.workspace.role || 'member'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}

                        {userContext.metrics && (
                          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                            <h4 className="text-white font-semibold text-sm mb-3">Support Metrics</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Total Tickets</span>
                                <span className="text-white text-lg font-bold">{userContext.metrics.totalTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Active</span>
                                <span className="text-amber-400 text-lg font-bold">{userContext.metrics.activeTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Resolved</span>
                                <span className="text-emerald-400 text-lg font-bold">{userContext.metrics.resolvedTickets || 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block mb-1">Resolution Rate</span>
                                <span className="text-cyan-400 text-lg font-bold">{userContext.metrics.resolutionRate || 0}%</span>
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
                          className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-white"
                          data-testid="button-user-history"
                        >
                          <History className="w-4 h-4 mr-2" />
                          View Full History
                        </Button>
                      </>
                    ) : (
                      /* Limited information for regular users */
                      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <h4 className="text-white font-semibold text-sm mb-3">Basic Info</h4>
                        <div className="space-y-3">
                          <div>
                            <span className="text-slate-400 text-xs block mb-1">Name</span>
                            <span className="text-white text-sm">
                              {userContext.user.firstName} {userContext.user.lastName}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-xs block mb-1">Status</span>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-emerald-400 text-sm">Online</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <p className="text-blue-300 text-xs">
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
                    <p className="text-red-400 text-sm font-semibold">
                      {(userContextError as any)?.error || 'User information not available'}
                    </p>
                    {(userContextError as any)?.suggestion && (
                      <p className="text-slate-400 text-xs mt-2">{(userContextError as any).suggestion}</p>
                    )}
                    {(userContextError as any)?.userId && (
                      <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-red-300 text-xs">
                          <strong>User ID:</strong> {(userContextError as any).userId}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fallback - No data */
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                    <p className="text-slate-400 text-sm">No user information available</p>
                  </div>
                )}
              </div>
            ) : (
              /* Loading state with WorkforceOS branding */
              <div className="text-center py-8">
                <div className="mb-4 flex justify-center">
                  <AutoForceLogo size="lg" variant="icon" className="opacity-75" />
                </div>
                <div className="w-12 h-12 mx-auto mb-4 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 text-sm font-medium">Loading user information...</p>
                <p className="text-slate-500 text-xs mt-1">Powered by WorkforceOS™</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowUserProfile(false)} variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20" data-testid="button-close-profile">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Default export for backward compatibility
export default HelpDeskCab;
