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
import { WorkforceOSLogo } from "@/components/workforceos-logo";
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

  // Check if user has accepted agreement - FIXED: Custom queryFn to pass sessionId properly
  const { data: agreementStatus } = useQuery<{ hasAccepted: boolean; acceptedAt: string | null }>({
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

  // Get user type icon - LARGER & CLEARER for better readability
  const getUserTypeIcon = (userType: string, role: string) => {
    // ROOT ADMIN - Slate ring with WF logo (LARGER)
    if (role === 'root') {
      return (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-slate-600 shadow-md"></div>
          <WFLogoCompact size={20} />
        </div>
      );
    }
    
    // Bot gets special animated icon (LARGER)
    if (role === 'bot') {
      return (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500 animate-pulse shadow-md"></div>
          <Bot className="w-5 h-5 text-blue-600" />
        </div>
      );
    }
    
    // Staff gets WF logo with subtle ring (LARGER)
    if (['deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      return (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-slate-500 shadow-md"></div>
          <WFLogoCompact size={18} />
        </div>
      );
    }
    
    // Authenticated users - WF logo with subtle ring (LARGER)
    if (userType === 'subscriber') {
      return (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 shadow-md"></div>
          <WFLogoCompact size={18} />
        </div>
      );
    }
    
    if (userType === 'org_user') {
      return (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-slate-400 shadow-md"></div>
          <WFLogoCompact size={18} />
        </div>
      );
    }
    
    // Guests get question mark with gray ring (LARGER)
    return (
      <div className="relative flex items-center justify-center w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-slate-300 shadow-md"></div>
        <HelpCircle className="w-5 h-5 text-slate-500" />
      </div>
    );
  };

  // Get status indicator - LARGER for better visibility
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online': return <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50 border-2 border-white" />;
      case 'away': return <div className="w-3.5 h-3.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50 border-2 border-white" />;
      case 'busy': return <div className="w-3.5 h-3.5 bg-rose-500 rounded-full shadow-lg shadow-rose-500/50 border-2 border-white" />;
      default: return <div className="w-3.5 h-3.5 bg-slate-400 rounded-full border-2 border-white" />;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'root': return <Crown className="w-3.5 h-3.5 text-slate-600" />;
      case 'bot': return <Sparkles className="w-3.5 h-3.5 text-slate-500" />;
      case 'deputy_admin': return <Shield className="w-3.5 h-3.5 text-slate-600" />;
      case 'deputy_assistant': return <UserCog className="w-3.5 h-3.5 text-slate-500" />;
      case 'sysop': return <Wrench className="w-3.5 h-3.5 text-slate-500" />;
      default: return null;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'root': return 'text-slate-700 font-black';  // Root admin
      case 'bot': return 'text-slate-600 font-bold';
      case 'deputy_admin': return 'text-slate-700 font-bold';
      case 'deputy_assistant': return 'text-slate-600 font-bold';
      case 'sysop': return 'text-slate-600 font-bold';
      default: return 'text-slate-700 font-semibold';
    }
  };

  // Get message bubble color - Professional styling
  const getMessageBubbleColor = (senderType: string, role: string, isSelf: boolean) => {
    if (isSelf) {
      return 'bg-slate-100 border border-slate-300';
    }
    
    // Root admin messages
    if (role === 'root') {
      return 'bg-slate-200 border border-slate-300';
    }
    
    // Bot messages
    if (role === 'bot') {
      return 'bg-white border border-slate-200';
    }
    
    // Staff messages
    if (['deputy_admin', 'deputy_assistant', 'sysop'].includes(role)) {
      return 'bg-slate-50 border border-slate-200';
    }
    
    // Customer messages
    return 'bg-white border border-slate-200';
  };

  const isStaff = user && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes((user as any).platformRole);
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
    toast({ title: "Password reset initiated", description: `Email sent to ${targetUser.name}` });
  };

  const handleUnlockAccount = (targetUser: any) => {
    sendRawMessage({ 
      type: 'unlock_account', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} Your account has been unlocked. You can now log in.`);
    toast({ title: "Account unlocked", description: `${targetUser.name} can now access their account` });
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
    toast({ title: "Email summary sent", description: `Conversation summary sent to ${targetUser.name}` });
  };

  const handleMarkVIP = (targetUser: any) => {
    sendRawMessage({ 
      type: 'mark_vip', 
      targetUserId: targetUser.id 
    });
    toast({ title: "VIP status granted", description: `${targetUser.name} flagged as VIP customer` });
  };

  const handleUserHistory = (targetUser: any) => {
    sendRawMessage({ 
      type: 'user_history', 
      targetUserId: targetUser.id 
    });
    toast({ title: "History loaded", description: `Viewing ${targetUser.name}'s complete interaction history` });
  };

  const handleIssueWarning = (targetUser: any) => {
    sendRawMessage({ 
      type: 'issue_warning', 
      targetUserId: targetUser.id 
    });
    sendQuickMessage(`@${targetUser.name} This is a formal warning. Please follow our community guidelines.`);
    toast({ title: "Warning issued", description: `Formal warning sent to ${targetUser.name}`, variant: "destructive" });
  };

  const handleTempMute = (targetUser: any) => {
    sendRawMessage({ 
      type: 'temp_mute', 
      targetUserId: targetUser.id,
      duration: 300 
    });
    toast({ title: "User muted", description: `${targetUser.name} muted for 5 minutes`, variant: "destructive" });
  };

  const handleBan = (targetUser: any) => {
    sendRawMessage({ 
      type: 'ban_user', 
      targetUserId: targetUser.id 
    });
    toast({ 
      title: "User banned", 
      description: `${targetUser.name} permanently banned from platform`, 
      variant: "destructive" 
    });
  };

  const handleAnalytics = () => {
    sendRawMessage({ type: 'analytics' });
    toast({ title: "Analytics dashboard", description: "Opening system analytics..." });
  };

  const handleForceReconnect = (targetUser: any) => {
    sendRawMessage({ 
      type: 'force_reconnect', 
      targetUserId: targetUser.id 
    });
    toast({ title: "Reconnection forced", description: `${targetUser.name}'s connection reset` });
  };

  const handleTestMessage = () => {
    sendRawMessage({ type: 'test_message', timestamp: Date.now() });
    sendQuickMessage(`🔧 SYSTEM TEST - Message sent at ${new Date().toLocaleTimeString()}`);
    toast({ title: "Test message sent", description: "System diagnostic message transmitted" });
  };

  const handleClearCache = (targetUser: any) => {
    sendRawMessage({ 
      type: 'clear_cache', 
      targetUserId: targetUser.id 
    });
    toast({ title: "Cache cleared", description: `${targetUser.name}'s session cache cleared` });
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
      toast({ title: "User unmuted", description: `${targetUser.name} can now speak` });
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
      toast({ title: "User unbanned", description: `${targetUser.name} has been unbanned` });
    } else {
      // Ban
      sendRawMessage({ type: 'ban_user', targetUserId: targetUser.id });
      setBannedUsers(prev => {
        const next = new Set(prev);
        next.add(targetUser.id);
        return next;
      });
      toast({ title: "User banned", description: `${targetUser.name} permanently banned`, variant: "destructive" });
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
      {/* WorkforceOS Header + Banner - UNIFIED AD SPACE - Animations flow through entire block */}
      <header className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white shadow-2xl relative z-10 border-b-4 border-blue-600">
        <div className="flex items-center justify-between max-w-7xl mx-auto p-3 relative">
          {/* Left: Logo and Controls */}
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-slate-300" />
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-1.5 shadow-lg">
              <WorkforceOSLogo size="sm" showText={false} />
            </div>
            {isStaff && (
              <div className="flex items-center gap-1.5 ml-2">
                <Button
                  onClick={() => {
                    setSeasonalAnimationsEnabled(prev => {
                      const newValue = !prev;
                      localStorage.setItem('seasonal-animations-enabled', String(newValue));
                      return newValue;
                    });
                    toast({ 
                      title: seasonalAnimationsEnabled ? "Seasonal animations disabled" : "Seasonal animations enabled",
                      description: seasonalAnimationsEnabled ? "Background effects turned off" : "Background effects turned on"
                    });
                  }}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 gap-1 bg-slate-600/40 border-slate-500/40 hover:bg-slate-600/60 text-white shadow-md"
                  data-testid="button-toggle-seasonal"
                >
                  ❄️ {seasonalAnimationsEnabled ? 'ON' : 'OFF'}
                </Button>
                <Button
                  onClick={() => setShowBannerManager(true)}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 gap-1 bg-slate-600/40 border-slate-500/40 hover:bg-slate-600/60 text-white shadow-md"
                  data-testid="button-open-banner-manager"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Banner
                </Button>
              </div>
            )}
          </div>
          
          {/* Center: Title (allows animations to flow through) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <span className="text-sm font-bold text-white/95 backdrop-blur-[2px] drop-shadow-lg">WorkforceOS Support</span>
          </div>
          
          {/* Right: Connection Status */}
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex items-center gap-1 text-[10px] bg-emerald-500/30 px-2 py-1 rounded-full backdrop-blur-sm border border-emerald-400/40 shadow-lg">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                Connected
              </div>
            )}
          </div>
        </div>
        
        {/* Announcement Banner - NO SEPARATE BACKGROUND - Seamless blend with header */}
        <div className="border-t border-slate-600/30">
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
      </header>

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
                  <div key={idx} className={`${bubbleColor} shadow-sm p-2 rounded-lg max-w-[90%] hover:shadow-md transition-all`}>
                    <div className="flex items-start gap-2">
                      {/* Avatar Icon - Compact */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getUserTypeIcon((msg as any).userType || 'guest', role)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header: Name, Role Badge, Timestamp */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-xs ${nameColor}`}>{displayName}</span>
                          {getRoleIcon(role)}
                          <span className="text-[10px] text-slate-500 ml-auto">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        
                        {/* Message Content - Smaller text */}
                        <p className="text-slate-800 text-xs leading-snug">{msg.message}</p>
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

        {/* RIGHT COLUMN: User List - MSN-style with gradient background */}
        <section className="min-w-[240px] max-w-[340px] w-auto bg-gradient-to-b from-slate-100 via-blue-50 to-slate-100 backdrop-blur-sm flex flex-col flex-shrink-0 shadow-[-4px_0_12px_rgba(0,0,0,0.1)]">
          <div className="p-4 border-b-2 border-blue-300/50 flex-shrink-0 bg-gradient-to-r from-blue-100/80 to-slate-100/80 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600 flex-shrink-0 drop-shadow-sm" />
              <h2 className="text-sm font-bold text-slate-800 drop-shadow-sm">
                Online Users
              </h2>
              <Badge variant="default" className="ml-auto text-xs bg-blue-600 text-white shadow-md" data-testid="text-user-count">
                {uniqueUsers.length}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-3">
              {uniqueUsers.map((u) => {
                // No IRC prefix - WF logo icon shows authority
                
                return (
                  <ContextMenu key={u.id}>
                    <ContextMenuTrigger>
                      <div 
                        className={`
                          flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2
                          ${selectedUserId === u.id 
                            ? 'bg-blue-100/90 shadow-lg border-blue-400/70 scale-[1.02]' 
                            : 'bg-white/80 hover:bg-white/95 border-slate-200/50 hover:border-blue-300/50 hover:shadow-md'
                          }
                        `}
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`user-${u.id}`}
                      >
                        {/* Status Indicator - LARGER */}
                        <div className="flex-shrink-0">
                          {getStatusIndicator(u.status || 'online')}
                        </div>
                        
                        {/* User Type Icon - MUCH LARGER & CLEARER */}
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-100/70 rounded-lg border border-slate-300/50 shadow-sm">
                          {getUserTypeIcon(u.userType || 'guest', u.role)}
                        </div>
                        
                        {/* User Name and Role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-bold break-words ${getRoleColor(u.role)} drop-shadow-sm`}>
                              {u.name}
                            </span>
                            {getRoleIcon(u.role)}
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

      {/* Branded Kick Dialog - Two-step with templated reasons */}
      <KickDialog
        open={!!kickDialogUser}
        userName={kickDialogUser?.userName || ''}
        onConfirm={(reason) => {
          if (kickDialogUser) {
            kickUser(kickDialogUser.userId, reason);
            toast({ 
              title: "User Removed", 
              description: `${kickDialogUser.userName} has been kicked from chat. Reason: ${reason}`,
              variant: "destructive" 
            });
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
              title: "User Silenced", 
              description: `${silenceDialogUser.userName} muted for ${duration} minutes. Reason: ${reason}`,
              variant: "destructive" 
            });
            setSilenceDialogUser(null);
          }
        }}
        onCancel={() => setSilenceDialogUser(null)}
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
    </div>
  );
}

// Default export for backward compatibility
export default HelpDeskCab;
