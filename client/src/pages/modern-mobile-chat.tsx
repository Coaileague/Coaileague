import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useChatSounds } from "@/hooks/use-chat-sounds";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { WFLogoCompact } from "@/components/wf-logo";
import { ChatAgreementModal } from "@/components/chat-agreement-modal";
import { useTransition } from "@/contexts/transition-context";
import { apiRequest } from "@/lib/queryClient";
import { 
  Send, Menu, X, Settings, Users, Circle, Shield, 
  Headphones, Bot, MessageSquare, Lock, HelpCircle,
  XCircle, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronRight,
  UserCheck, FileText, Camera, PenTool, Info, ArrowRight, Sparkles,
  Ban, AlertTriangle, Timer, UserX, TrendingUp, Key, Mail, ListChecks,
  Tag, ClipboardList, History, Zap, MessageCircle, ArrowUpCircle, Star,
  Eye, UserCog, RefreshCw, PackageCheck, FileSearch
} from "lucide-react";
import type { ChatMessage } from "@shared/schema";

interface OnlineUser {
  id: string;
  name: string;
  role: 'admin' | 'support' | 'customer' | 'bot';
  status: 'online';
}

export default function ModernMobileChat() {
  const [messageText, setMessageText] = useState("");
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [userContext, setUserContext] = useState<any>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [hasAcceptedAgreement, setHasAcceptedAgreement] = useState(false);
  const [showFABs, setShowFABs] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { playSound } = useChatSounds();
  const { showTransition, hideTransition } = useTransition();
  
  // Generate or get session ID for tracking
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem('chat-session-id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('chat-session-id', newId);
    return newId;
  });

  // Get current user data
  const { data: currentUser } = useQuery<{ user: { id: string; email: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const userId = currentUser?.user?.id;
  const userName = currentUser?.user?.email || 'Guest';
  const userPlatformRole = currentUser?.user?.platformRole;
  const isStaff = userPlatformRole && 
    ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(userPlatformRole);
  const isAuthenticated = !!currentUser?.user;
  
  // Get role display text
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
  
  // Check if message is from current user for animated badge
  const isOwnMessage = (senderId: string) => senderId === userId;

  // Fetch HelpDesk room info
  const { data: helpDeskRoom } = useQuery<{ status: string; statusMessage: string | null }>({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: !!userId && isAuthenticated,
    retry: false,
    staleTime: 30000,
  });

  // Use WebSocket for real-time messaging
  const { 
    messages, sendMessage, sendRawMessage, onlineUsers, isConnected
  } = useChatroomWebSocket(isAuthenticated ? userId : undefined, userName);

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

  // Show loading transition on initial load
  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Initializing WorkforceOS Support...",
      submessage: "Connecting to Live Support Chat",
      duration: 2000,
      onComplete: () => {
        hideTransition();
        // Show agreement if not accepted
        if (agreementStatus && !agreementStatus.hasAccepted && !hasAcceptedAgreement && isAuthenticated) {
          setShowAgreement(true);
        }
      }
    });
  }, []); // Only run once on mount

  // Show agreement modal if not accepted (after loading)
  useEffect(() => {
    if (agreementStatus && !agreementStatus.hasAccepted && !hasAcceptedAgreement && isAuthenticated) {
      setShowAgreement(true);
    }
  }, [agreementStatus, hasAcceptedAgreement, isAuthenticated]);

  // Role-based permission system
  const hasPermission = (requiredRoles: string[]) => {
    if (!userPlatformRole) return false;
    return requiredRoles.includes(userPlatformRole);
  };

  // All staff roles - INCLUDES 'support' for frontline agents
  const ALL_STAFF = ['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'];
  const DEPUTY_ASSISTANT_PLUS = ['root', 'deputy_admin', 'deputy_assistant'];
  const DEPUTY_ADMIN_PLUS = ['root', 'deputy_admin'];
  const ADMIN_ONLY = ['root', 'deputy_admin'];
  const SYSTEM_ONLY = ['root', 'sysop'];

  // Quick Responses for staff
  const quickResponses = [
    {
      icon: CheckCircle,
      label: 'Welcome & Introduction',
      text: 'Welcome to WorkforceOS Support! I\'m here to assist you. How can I help you today?',
      color: 'text-emerald-400'
    },
    {
      icon: Clock,
      label: 'Please Wait',
      text: 'Thank you for your patience. I\'m looking into this for you right now and will have an answer shortly.',
      color: 'text-blue-400'
    },
    {
      icon: HelpCircle,
      label: 'Need More Info',
      text: 'To better assist you, could you provide more details about the issue you\'re experiencing?',
      color: 'text-orange-400'
    },
    {
      icon: FileSearch,
      label: 'Investigating Issue',
      text: 'I\'m investigating this issue now. I\'ll check our system logs and get back to you with a solution.',
      color: 'text-purple-400'
    },
    {
      icon: PackageCheck,
      label: 'Issue Resolved',
      text: 'Great! I\'ve resolved the issue. Please let me know if you need any further assistance.',
      color: 'text-emerald-400'
    },
    {
      icon: RefreshCw,
      label: 'Try Refreshing',
      text: 'Please try refreshing your browser or logging out and back in. This should resolve the issue.',
      color: 'text-cyan-400'
    },
    {
      icon: Mail,
      label: 'Follow Up',
      text: 'I\'ll follow up with our technical team and send you an email update within 24 hours.',
      color: 'text-indigo-400'
    },
    {
      icon: Star,
      label: 'Closing Remarks',
      text: 'Thank you for contacting WorkforceOS Support! Feel free to reach out anytime you need assistance.',
      color: 'text-amber-400'
    }
  ];

  // Comprehensive command system with role-based filtering
  const getAllCommands = () => {
    const allCommands = [
      // TIER 1 - Basic Support (All Staff)
      { 
        icon: UserCheck, 
        label: 'Release Hold & Welcome', 
        action: () => handleReleaseHold(),
        color: 'text-emerald-400',
        description: 'Remove spectator mode + send greeting',
        roles: ALL_STAFF,
        tier: 'Basic Support'
      },
      { 
        icon: MessageCircle, 
        label: 'Quick Reply', 
        action: () => handleQuickReply(),
        color: 'text-cyan-400',
        description: 'Send pre-configured quick response',
        roles: ALL_STAFF,
        tier: 'Basic Support'
      },
      { 
        icon: Info, 
        label: 'Request Info', 
        action: () => handleRequestInfo(),
        color: 'text-orange-400',
        description: 'Ask for specific information',
        roles: ALL_STAFF,
        tier: 'Basic Support'
      },
      { 
        icon: ClipboardList, 
        label: 'Internal Note', 
        action: () => handleInternalNote(),
        color: 'text-slate-400',
        description: 'Add internal staff-only note',
        roles: ALL_STAFF,
        tier: 'Basic Support'
      },

      // TIER 2 - Authentication
      { 
        icon: Lock, 
        label: 'Request Authentication', 
        action: () => handleRequestAuth(),
        color: 'text-indigo-400',
        description: 'Ask user to verify their identity',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Authentication'
      },
      { 
        icon: Key, 
        label: 'Reset Password', 
        action: () => handleResetPassword(),
        color: 'text-red-400',
        description: 'Initiate password reset for user',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Authentication'
      },
      { 
        icon: UserCog, 
        label: 'Unlock Account', 
        action: () => handleUnlockAccount(),
        color: 'text-green-400',
        description: 'Unlock locked user account',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Authentication'
      },

      // TIER 3 - Documents
      { 
        icon: FileText, 
        label: 'Request Document', 
        action: () => handleRequestDocument(),
        color: 'text-blue-400',
        description: 'Request file upload from user',
        roles: ALL_STAFF,
        tier: 'Documents'
      },
      { 
        icon: Camera, 
        label: 'Request Photo', 
        action: () => handleRequestPhoto(),
        color: 'text-cyan-400',
        description: 'Request photo/screenshot',
        roles: ALL_STAFF,
        tier: 'Documents'
      },
      { 
        icon: PenTool, 
        label: 'Request Signature', 
        action: () => handleRequestSignature(),
        color: 'text-purple-400',
        description: 'Request e-signature',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Documents'
      },
      { 
        icon: Eye, 
        label: 'View Documents', 
        action: () => handleViewDocuments(),
        color: 'text-sky-400',
        description: 'View user submitted documents',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Documents'
      },

      // TIER 4 - Ticket Management
      { 
        icon: CheckCircle, 
        label: 'Mark Resolved', 
        action: () => handleResolve(),
        color: 'text-green-400',
        description: 'Close ticket as resolved',
        roles: ALL_STAFF,
        tier: 'Ticket Management'
      },
      { 
        icon: ArrowRight, 
        label: 'Transfer User', 
        action: () => handleTransfer(),
        color: 'text-pink-400',
        description: 'Transfer to another agent',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Ticket Management'
      },
      { 
        icon: ArrowUpCircle, 
        label: 'Escalate', 
        action: () => handleEscalate(),
        color: 'text-yellow-400',
        description: 'Escalate to higher support tier',
        roles: ALL_STAFF,
        tier: 'Ticket Management'
      },
      { 
        icon: Tag, 
        label: 'Priority Tag', 
        action: () => handlePriorityTag(),
        color: 'text-rose-400',
        description: 'Mark ticket as high priority',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Ticket Management'
      },
      { 
        icon: Clock, 
        label: 'Schedule Follow-up', 
        action: () => handleFollowUp(),
        color: 'text-amber-400',
        description: 'Schedule follow-up reminder',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Ticket Management'
      },

      // TIER 5 - Advanced (Deputy Admin+)
      { 
        icon: Mail, 
        label: 'Email Summary', 
        action: () => handleEmailSummary(),
        color: 'text-blue-400',
        description: 'Send conversation summary via email',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Advanced'
      },
      { 
        icon: Star, 
        label: 'Mark VIP', 
        action: () => handleMarkVIP(),
        color: 'text-yellow-400',
        description: 'Flag user as VIP customer',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Advanced'
      },
      { 
        icon: History, 
        label: 'User History', 
        action: () => handleUserHistory(),
        color: 'text-violet-400',
        description: 'View complete user interaction history',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Advanced'
      },

      // TIER 6 - Moderation (Admin Only)
      { 
        icon: AlertTriangle, 
        label: 'Issue Warning', 
        action: () => handleIssueWarning(),
        color: 'text-orange-500',
        description: 'Send formal warning to user',
        roles: ADMIN_ONLY,
        tier: 'Moderation'
      },
      { 
        icon: Timer, 
        label: 'Temp Mute 5min', 
        action: () => handleTempMute(),
        color: 'text-yellow-500',
        description: 'Temporarily mute user for 5 minutes',
        roles: ADMIN_ONLY,
        tier: 'Moderation'
      },
      { 
        icon: UserX, 
        label: 'Kick from Room', 
        action: () => handleKick(),
        color: 'text-red-500',
        description: 'Remove user from chat room',
        roles: ADMIN_ONLY,
        tier: 'Moderation'
      },
      { 
        icon: Ban, 
        label: 'Ban User', 
        action: () => handleBan(),
        color: 'text-red-600',
        description: 'Permanently ban user from platform',
        roles: ADMIN_ONLY,
        tier: 'Moderation'
      },

      // TIER 7 - System (Root + SysOp)
      { 
        icon: TrendingUp, 
        label: 'Analytics', 
        action: () => handleAnalytics(),
        color: 'text-emerald-400',
        description: 'View system analytics dashboard',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: RefreshCw, 
        label: 'Force Reconnect', 
        action: () => handleForceReconnect(),
        color: 'text-indigo-400',
        description: 'Force user WebSocket reconnection',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: Zap, 
        label: 'Test Message', 
        action: () => handleTestMessage(),
        color: 'text-purple-400',
        description: 'Send system test message',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: PackageCheck, 
        label: 'Clear Cache', 
        action: () => handleClearCache(),
        color: 'text-cyan-400',
        description: 'Clear user session cache',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
    ];

    // Filter commands based on user's role permissions
    return allCommands.filter(cmd => hasPermission(cmd.roles));
  };

  // Get filtered commands based on current user's role
  const supportCommands = getAllCommands();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle FAB visibility on scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      const currentScrollY = container.scrollTop;
      
      // Hide FABs when scrolling
      setShowFABs(false);
      
      // Show FABs again after scrolling stops
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setShowFABs(true);
      }, 1000);
      
      setLastScrollY(currentScrollY);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const handleSend = () => {
    const trimmedMessage = messageText.trim();
    if (trimmedMessage) {
      sendMessage(trimmedMessage, userName, isStaff ? 'support' : 'customer');
      setMessageText('');
      playSound('send');
    }
  };

  // Check if selected user is a bot/platform-generated user
  const isBotUser = selectedUser?.role === 'bot' || selectedUser?.id?.includes('helpos') || selectedUser?.id?.includes('-ai-');

  // Fetch user context when user is selected (staff only) - Skip for bot users
  const { data: fetchedUserContext } = useQuery<any>({
    queryKey: ['/api/helpdesk/user-context', selectedUser?.id],
    enabled: Boolean(selectedUser && isStaff && !isBotUser),
    retry: false,
    staleTime: 30000,
  });

  // Update context when fetched OR generate bot context
  useEffect(() => {
    if (isBotUser && selectedUser) {
      // Set special context for bot/platform-generated users
      setUserContext({
        isPlatformGenerated: true,
        userType: 'Platform AI Bot',
        userId: selectedUser.id,
        userName: selectedUser.name,
        role: selectedUser.role,
        status: 'Active - Automated System',
        description: 'This is a platform-generated AI assistant that provides automated support.',
        capabilities: ['Automated responses', 'Queue management', 'User greeting', 'Basic troubleshooting'],
        restrictions: 'Cannot be modified or removed by staff members'
      });
    } else if (fetchedUserContext) {
      setUserContext(fetchedUserContext);
    }
  }, [fetchedUserContext, isBotUser, selectedUser]);

  const handleUserSelect = (user: OnlineUser) => {
    setSelectedUser(user);
    setUserContext(null); // Clear old context
    setShowUserList(false);
    
    const userTypeLabel = user.role === 'bot' ? '🤖 Platform Bot' : user.name;
    toast({ 
      title: "User Selected", 
      description: `Viewing ${userTypeLabel} - All commands will apply to this user`
    });
  };

  // Support command handlers with user ID tracking
  const handleReleaseHold = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", description: "Please select a user first", variant: "destructive" });
      return;
    }
    
    const message = `RELEASE_HOLD:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    // Send personalized greeting
    setTimeout(() => {
      sendMessage(`Welcome ${selectedUser.name}! I've removed the hold. How can I help you today?`, userName, 'support');
    }, 500);
    
    toast({ title: "Released from hold", description: `${selectedUser.name} can now chat freely` });
  };

  const handleRequestAuth = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `REQUEST_AUTH:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please verify your identity. I'll send you a secure authentication request.`, userName, 'support');
    
    toast({ title: "Auth request sent", description: `Waiting for ${selectedUser.name} to authenticate` });
  };

  const handleRequestDocument = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `REQUEST_DOCUMENT:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please upload the required document using the secure upload dialog.`, userName, 'support');
    
    toast({ title: "Document request sent", description: `${selectedUser.name} will receive upload prompt` });
  };

  const handleRequestPhoto = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `REQUEST_PHOTO:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please upload a photo/screenshot to help us assist you.`, userName, 'support');
    
    toast({ title: "Photo request sent" });
  };

  const handleRequestSignature = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `REQUEST_SIGNATURE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please provide your e-signature to proceed.`, userName, 'support');
    
    toast({ title: "Signature request sent" });
  };

  const handleRequestInfo = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `REQUEST_INFO:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please provide additional information about your request.`, userName, 'support');
    
    toast({ title: "Info request sent" });
  };

  const handleTransfer = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `TRANSFER_USER:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm transferring you to another specialist who can better assist you.`, userName, 'support');
    
    toast({ title: "Transfer initiated", description: `${selectedUser.name} will be transferred` });
  };

  const handleResolve = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `RESOLVE_TICKET:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Your issue has been resolved. Is there anything else I can help you with?`, userName, 'support');
    
    toast({ title: "Ticket resolved", description: `${selectedUser.name}'s ticket marked as resolved` });
    setSelectedUser(null);
  };

  // NEW COMMAND HANDLERS - TIER 1 (Basic Support)
  const handleQuickReply = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const quickReplies = [
      "Thank you for contacting support. I'll be happy to assist you!",
      "I'm looking into this for you right now.",
      "Can you provide more details about the issue you're experiencing?",
      "I understand your concern. Let me help you with that.",
    ];
    const reply = quickReplies[0]; // Use first reply for now
    
    sendMessage(`@${selectedUser.name} ${reply}`, userName, 'support');
    toast({ title: "Quick reply sent" });
  };

  const handleInternalNote = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `INTERNAL_NOTE:${selectedUser.id}:${selectedUser.name}:Staff note added to ticket`;
    sendRawMessage(message);
    
    toast({ title: "Internal note added", description: "Note visible to staff only" });
  };

  // NEW COMMAND HANDLERS - TIER 2 (Authentication)
  const handleResetPassword = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `RESET_PASSWORD:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm initiating a password reset for your account. You'll receive an email shortly.`, userName, 'support');
    
    toast({ title: "Password reset initiated", description: `Email sent to ${selectedUser.name}` });
  };

  const handleUnlockAccount = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `UNLOCK_ACCOUNT:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Your account has been unlocked. You can now log in.`, userName, 'support');
    
    toast({ title: "Account unlocked", description: `${selectedUser.name} can now access their account` });
  };

  // NEW COMMAND HANDLERS - TIER 3 (Documents)
  const handleViewDocuments = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `VIEW_DOCUMENTS:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Document viewer opened", description: `Viewing ${selectedUser.name}'s submitted documents` });
  };

  // NEW COMMAND HANDLERS - TIER 4 (Ticket Management)
  const handleEscalate = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `ESCALATE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm escalating your issue to our senior support team for specialized assistance.`, userName, 'support');
    
    toast({ title: "Ticket escalated", description: "Transferred to Tier 2 support" });
  };

  const handlePriorityTag = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `PRIORITY_TAG:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Priority flag added", description: `${selectedUser.name}'s ticket marked as high priority`, variant: "default" });
  };

  const handleFollowUp = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `FOLLOW_UP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Follow-up scheduled", description: "Reminder set for 24 hours" });
  };

  // NEW COMMAND HANDLERS - TIER 5 (Advanced)
  const handleEmailSummary = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `EMAIL_SUMMARY:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm sending a summary of our conversation to your email.`, userName, 'support');
    
    toast({ title: "Email summary sent", description: `Conversation summary sent to ${selectedUser.name}` });
  };

  const handleMarkVIP = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `MARK_VIP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "VIP status granted", description: `${selectedUser.name} flagged as VIP customer` });
  };

  const handleUserHistory = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `USER_HISTORY:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "History loaded", description: `Viewing ${selectedUser.name}'s complete interaction history` });
  };

  // NEW COMMAND HANDLERS - TIER 6 (Moderation)
  const handleIssueWarning = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `ISSUE_WARNING:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} This is a formal warning. Please follow our community guidelines.`, userName, 'support');
    
    toast({ title: "Warning issued", description: `Formal warning sent to ${selectedUser.name}`, variant: "destructive" });
  };

  const handleTempMute = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `TEMP_MUTE:${selectedUser.id}:${selectedUser.name}:300`;
    sendRawMessage(message);
    
    toast({ title: "User muted", description: `${selectedUser.name} muted for 5 minutes`, variant: "destructive" });
  };

  const handleKick = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `KICK_USER:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "User kicked", description: `${selectedUser.name} removed from chat room`, variant: "destructive" });
    setSelectedUser(null);
  };

  const handleBan = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `BAN_USER:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ 
      title: "User banned", 
      description: `${selectedUser.name} permanently banned from platform`, 
      variant: "destructive" 
    });
    setSelectedUser(null);
  };

  // NEW COMMAND HANDLERS - TIER 7 (System)
  const handleAnalytics = () => {
    const message = `ANALYTICS:system`;
    sendRawMessage(message);
    
    toast({ title: "Analytics dashboard", description: "Opening system analytics..." });
  };

  const handleForceReconnect = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `FORCE_RECONNECT:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Reconnection forced", description: `${selectedUser.name}'s connection reset` });
  };

  const handleTestMessage = () => {
    const message = `TEST_MESSAGE:system:${Date.now()}`;
    sendRawMessage(message);
    sendMessage(`🔧 SYSTEM TEST - Message sent at ${new Date().toLocaleTimeString()}`, userName, 'support');
    
    toast({ title: "Test message sent", description: "System diagnostic message transmitted" });
  };

  const handleClearCache = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `CLEAR_CACHE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Cache cleared", description: `${selectedUser.name}'s session cache cleared` });
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header with User Profile Card */}
      <div className="relative z-10 backdrop-blur-xl bg-black/30 border-b border-white/10 px-4 py-3">
        {selectedUser && isStaff ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xl">{selectedUser.name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-bold text-lg truncate">{selectedUser.name}</h2>
                <p className="text-slate-400 text-xs truncate">{userContext?.workspace?.name || 'WorkforceOS User'}</p>
                <p className="text-slate-500 text-xs truncate">{userContext?.workspace?.serialNumber || 'No device info'}</p>
              </div>
              {selectedUser && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs flex-shrink-0 px-2 py-1 font-bold">
                  URGENT
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>Session: {Math.floor((Date.now() - new Date().getTime()) / 60000) || 5}:23</span>
              </div>
              <div className="flex items-center gap-1">
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
                <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                  <WFLogoCompact size={20} />
                </div>
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                helpDeskRoom?.status === 'open' ? 'bg-emerald-500' : 'bg-red-500'
              }`}></div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-xs sm:text-sm break-words">WorkforceOS Support</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Users size={12} />
                <span>{onlineUsers.length} online</span>
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Messages Container (always visible) */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative z-10">
        {messages.map((msg) => {
          const msgRole = (msg as any).platformRole || msg.senderType;
          const roleDisplay = msgRole === 'bot' ? 'BOT AI' : getRoleDisplay(msgRole);
          const isCurrentUser = msg.senderId && isOwnMessage(msg.senderId);
          
          return (
          <div key={msg.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2">
            {/* WorkforceOS Logo Avatar - Bigger and Bolder */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ring-2 ${
              msg.senderType === 'bot' ? 'bg-gradient-to-br from-amber-500 to-yellow-600 ring-amber-500/50' :
              msg.senderType === 'support' ? 'bg-gradient-to-br from-indigo-600 to-blue-600 ring-indigo-500/50' :
              'bg-gradient-to-br from-slate-600 to-slate-700 ring-slate-500/50'
            }`}>
              {msg.senderType === 'bot' ? (
                <Sparkles size={20} className="text-white font-bold" />
              ) : (
                <WorkforceOSLogo className="h-7 w-7 font-bold" showText={false} />
              )}
            </div>
            {/* WF Logo for STAFF ONLY */}
            {['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(msgRole) && (
              <div className="flex-shrink-0">
                <WFLogoCompact size={16} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-bold text-sm ${
                  msg.senderType === 'bot' ? 'text-amber-400' :
                  msg.senderType === 'support' ? 'text-indigo-400' :
                  'text-white'
                }`}>
                  {msg.senderType === 'bot' ? 'HelpOS' : msg.senderName?.split('(')[0].trim()}
                  {/* Role badge as superscript - attached inline like 10² */}
                  {(roleDisplay || (msg.senderId === userId && userPlatformRole)) && (
                    <sup className={`text-[8px] font-normal ${
                      msg.senderType === 'bot' 
                        ? 'text-amber-400/70' 
                        : isCurrentUser
                          ? 'text-indigo-400'
                          : 'text-indigo-400/70'
                    }`}>
                      ({roleDisplay || (msg.senderId === userId ? getRoleDisplay(userPlatformRole) : null)})
                    </sup>
                  )}
                </span>
                <span className="text-[10px] text-slate-500">
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              {/* Message text with WFLogoCompact for system messages */}
              {msg.senderId === 'system' ? (
                <span className="text-sm text-slate-200 leading-relaxed break-words whitespace-pre-wrap flex items-center gap-2">
                  <WFLogoCompact size={14} />
                  {msg.message}
                </span>
              ) : (
                <p className="text-sm text-slate-200 leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
              )}
            </div>
          </div>
        )})}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Add glow animation for Admin badge */}
      <style>{`
        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.8)) drop-shadow(0 0 12px rgba(139, 92, 246, 0.6));
          }
          50% {
            filter: drop-shadow(0 0 12px rgba(99, 102, 241, 1)) drop-shadow(0 0 20px rgba(139, 92, 246, 0.8));
          }
        }
      `}</style>
      
      {/* Quick Responses Section - Staff Only */}
      {isStaff && selectedUser && (
        <div className="relative z-10 border-t border-white/10 bg-gradient-to-b from-indigo-900/30 to-purple-900/30 backdrop-blur-sm">
          <button
            onClick={() => setShowQuickResponses(!showQuickResponses)}
            className="w-full flex items-center justify-between px-4 py-2 text-white hover-elevate transition-all"
            data-testid="button-toggle-quick-responses"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold">Quick Responses</span>
              <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                {quickResponses.length}
              </Badge>
            </div>
            <ChevronDown className={`w-5 h-5 transition-transform ${showQuickResponses ? 'rotate-180' : ''}`} />
          </button>
          
          {showQuickResponses && (
            <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 fade-in max-h-[40vh] overflow-y-auto">
              {quickResponses.map((response, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setMessageText(response.text);
                    setShowQuickResponses(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover-elevate active-elevate-2 border border-white/10 transition-all"
                  data-testid={`quick-response-${idx}`}
                >
                  <div className="flex items-start gap-2">
                    <response.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${response.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white mb-0.5">{response.label}</div>
                      <div className="text-xs text-slate-400 line-clamp-2">{response.text}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Action Buttons - Mobile Only (Bottom Right) */}
      {isStaff && (
        <div className={`fixed bottom-24 right-4 flex flex-col gap-3 z-50 transition-all duration-300 ${
          showFABs ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none'
        }`}>
          {/* User List Button */}
          <Sheet open={showUserList} onOpenChange={setShowUserList}>
            <SheetTrigger asChild>
              <button
                className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg hover:shadow-indigo-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
                data-testid="button-float-users"
              >
                <Users size={24} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 max-h-[80vh]">
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  Online Users ({onlineUsers.length})
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2 max-h-[65vh] overflow-y-auto pr-2">
                {onlineUsers.map((user) => {
                  const isBot = user.role === 'bot' || user.id?.includes('helpos') || user.id?.includes('-ai-');
                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user as OnlineUser);
                        setShowUserList(false);
                        toast({ title: "User selected", description: `Viewing ${user.name}` });
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        selectedUser?.id === user.id
                          ? 'bg-indigo-500/20 border-indigo-500/50'
                          : 'bg-white/5 border-white/10 hover-elevate active-elevate-2'
                      }`}
                      data-testid={`user-${user.id}`}
                    >
                      {isBot ? (
                        <Bot className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <div className={`w-3 h-3 rounded-full ${user.status === 'online' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                      )}
                      <div className="flex-1 text-left">
                        <div className={`font-medium text-sm ${isBot ? 'text-amber-400' : 'text-white'}`}>
                          {isBot && '🤖 '}
                          {user.name.split('(')[0].trim()}
                          {user.role && user.role !== 'customer' && (
                            <sup className="ml-0.5 text-[8px] font-normal text-indigo-400/70">
                              ({getRoleDisplay(user.role)})
                            </sup>
                          )}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {isBot ? 'Platform Bot - Automated' : (user.status === 'online' ? 'Active now' : 'Away')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* Diagnostics Button */}
          <Sheet open={showDiagnostics} onOpenChange={setShowDiagnostics}>
            <SheetTrigger asChild>
              <button
                className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-lg hover:shadow-cyan-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
                data-testid="button-float-diagnostics"
              >
                <Eye size={24} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 max-h-[80vh]">
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  Diagnostics
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 max-h-[65vh] overflow-y-auto pr-2">
                {selectedUser && userContext ? (
                  <div className="space-y-3">
                    {/* Platform Bot Badge */}
                    {userContext.isPlatformGenerated && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
                        <Bot className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-amber-400 font-semibold text-sm">Platform-Generated Bot</div>
                          <div className="text-amber-300/70 text-xs">Automated support assistant</div>
                        </div>
                      </div>
                    )}
                    
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Info className="w-5 h-5 text-cyan-400" />
                        <h4 className="text-white font-semibold">
                          {userContext.isPlatformGenerated ? 'Bot Information' : 'User Context'}
                        </h4>
                      </div>
                      <div className="space-y-2 text-sm">
                        {userContext.isPlatformGenerated ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Type:</span>
                              <span className="text-amber-400 break-all text-right ml-2">{userContext.userType}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Status:</span>
                              <span className="text-emerald-400 break-all text-right ml-2">{userContext.status}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Bot ID:</span>
                              <span className="text-white font-mono text-xs break-all text-right ml-2">{userContext.userId}</span>
                            </div>
                            <div className="border-t border-white/10 pt-2 mt-2">
                              <span className="text-slate-400 text-xs">Description:</span>
                              <p className="text-slate-300 text-xs mt-1">{userContext.description}</p>
                            </div>
                            <div className="border-t border-white/10 pt-2 mt-2">
                              <span className="text-slate-400 text-xs">Capabilities:</span>
                              <ul className="text-slate-300 text-xs mt-1 space-y-1">
                                {userContext.capabilities?.map((cap: string, i: number) => (
                                  <li key={i} className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    {cap}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="border-t border-white/10 pt-2 mt-2">
                              <span className="text-amber-400 text-xs">⚠️ {userContext.restrictions}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Workspace:</span>
                              <span className="text-white break-all text-right ml-2">{userContext.workspace?.name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Serial #:</span>
                              <span className="text-white font-mono text-xs break-all text-right ml-2">{userContext.workspace?.serialNumber || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">User ID:</span>
                              <span className="text-white font-mono text-xs break-all text-right ml-2">{selectedUser.id}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Hide user history for bots */}
                    {!userContext.isPlatformGenerated && (
                      <button
                        onClick={() => {
                          toast({ title: "Success", description: `Viewing history for ${selectedUser.name}` });
                          setShowDiagnostics(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover-elevate active-elevate-2 border border-white/10"
                        data-testid="diagnostic-user-history"
                      >
                        <History className="w-5 h-5 text-violet-400" />
                        <div className="flex-1 text-left">
                          <div className="text-white font-medium text-sm">View User History</div>
                          <div className="text-slate-400 text-xs">Complete interaction timeline</div>
                        </div>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Select a user to view diagnostics</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Tools Button */}
          <Sheet open={showTools} onOpenChange={setShowTools}>
            <SheetTrigger asChild>
              <button
                className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-lg hover:shadow-purple-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
                data-testid="button-float-tools"
              >
                <Settings size={24} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 max-h-[80vh]">
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-purple-400" />
                  Support Tools
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 max-h-[65vh] overflow-y-auto pr-2">
                {selectedUser ? (
                  <div className="space-y-2">
                    {supportCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          cmd.action();
                          setShowTools(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover-elevate active-elevate-2 border border-white/10"
                        data-testid={`tool-${cmd.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <cmd.icon className={`w-5 h-5 flex-shrink-0 ${cmd.color}`} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-white font-medium text-sm">{cmd.label}</div>
                          <div className="text-slate-400 text-xs break-words">{cmd.description}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Select a user to access tools</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* Input Area */}
      <div className="relative z-10 backdrop-blur-xl bg-black/40 border-t border-white/10 px-4 py-3">
        {/* Connection Status Indicator */}
        {!isConnected && (
          <div className="mb-2 flex items-center gap-2 text-xs text-amber-400">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Connecting to chat...
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={selectedUser ? `Message to ${selectedUser.name}...` : "Type a message..."}
              className="w-full bg-white/10 backdrop-blur-sm text-white placeholder-slate-400 px-4 py-3 rounded-full border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              data-testid="input-message"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!isConnected || !messageText.trim()}
            className={`p-3 rounded-full text-white transition-all ${
              isConnected && messageText.trim()
                ? 'bg-gradient-to-r from-indigo-500 to-blue-500 hover:shadow-lg hover:shadow-indigo-500/50 active:scale-95'
                : 'bg-slate-600 cursor-not-allowed opacity-50'
            }`}
            data-testid="button-send"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* Agreement Modal - Mobile Optimized */}
      {showAgreement && (
        <ChatAgreementModal
          roomName="WorkforceOS Support Chat"
          onAccept={(fullName) => acceptAgreementMutation.mutate(fullName)}
          isSubmitting={acceptAgreementMutation.isPending}
        />
      )}
    </div>
  );
}
