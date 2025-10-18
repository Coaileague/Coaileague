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
  XCircle, CheckCircle, Clock, AlertCircle, ChevronDown,
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
  const [activeTab, setActiveTab] = useState<'chat' | 'diagnostics' | 'tools'>('chat');
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [userContext, setUserContext] = useState<any>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [hasAcceptedAgreement, setHasAcceptedAgreement] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
      case 'root': return 'ADMIN';
      case 'deputy_admin': return 'DEPUTY';
      case 'deputy_assistant': return 'ASSISTANT';
      case 'sysop': return 'SYSOP';
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

  // All staff roles
  const ALL_STAFF = ['root', 'deputy_admin', 'deputy_assistant', 'sysop'];
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

  const handleSend = () => {
    if (messageText.trim()) {
      sendMessage(messageText, userName, isStaff ? 'support' : 'customer');
      setMessageText('');
      playSound('send');
    }
  };

  // Fetch user context when user is selected (staff only)
  const { data: fetchedUserContext } = useQuery<any>({
    queryKey: ['/api/helpdesk/user-context', selectedUser?.id],
    enabled: !!selectedUser && isStaff,
    retry: false,
    staleTime: 30000,
  });

  // Update context when fetched
  useEffect(() => {
    if (fetchedUserContext) {
      setUserContext(fetchedUserContext);
    }
  }, [fetchedUserContext]);

  const handleUserSelect = (user: OnlineUser) => {
    setSelectedUser(user);
    setUserContext(null); // Clear old context
    setShowUserList(false);
    toast({ 
      title: "User Selected", 
      description: `${user.name} - All commands will apply to this user`
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
  };

  const handleInternalNote = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `INTERNAL_NOTE:${selectedUser.id}:${selectedUser.name}:Staff note added to ticket`;
    sendRawMessage(message);
    
    toast({ title: "Internal note added", description: "Note visible to staff only" });
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
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
    setActiveTab("chat");
  };

  const handlePriorityTag = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `PRIORITY_TAG:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Priority flag added", description: `${selectedUser.name}'s ticket marked as high priority`, variant: "default" });
    setActiveTab("chat");
  };

  const handleFollowUp = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `FOLLOW_UP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Follow-up scheduled", description: "Reminder set for 24 hours" });
    setActiveTab("chat");
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
    setActiveTab("chat");
  };

  const handleMarkVIP = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `MARK_VIP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "VIP status granted", description: `${selectedUser.name} flagged as VIP customer` });
    setActiveTab("chat");
  };

  const handleUserHistory = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `USER_HISTORY:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "History loaded", description: `Viewing ${selectedUser.name}'s complete interaction history` });
    setActiveTab("chat");
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
    setActiveTab("chat");
  };

  const handleTempMute = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `TEMP_MUTE:${selectedUser.id}:${selectedUser.name}:300`;
    sendRawMessage(message);
    
    toast({ title: "User muted", description: `${selectedUser.name} muted for 5 minutes`, variant: "destructive" });
    setActiveTab("chat");
  };

  const handleKick = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `KICK_USER:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "User kicked", description: `${selectedUser.name} removed from chat room`, variant: "destructive" });
    setActiveTab("chat");
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
    setActiveTab("chat");
    setSelectedUser(null);
  };

  // NEW COMMAND HANDLERS - TIER 7 (System)
  const handleAnalytics = () => {
    const message = `ANALYTICS:system`;
    sendRawMessage(message);
    
    toast({ title: "Analytics dashboard", description: "Opening system analytics..." });
    setActiveTab("chat");
  };

  const handleForceReconnect = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `FORCE_RECONNECT:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Reconnection forced", description: `${selectedUser.name}'s connection reset` });
    setActiveTab("chat");
  };

  const handleTestMessage = () => {
    const message = `TEST_MESSAGE:system:${Date.now()}`;
    sendRawMessage(message);
    sendMessage(`🔧 SYSTEM TEST - Message sent at ${new Date().toLocaleTimeString()}`, userName, 'support');
    
    toast({ title: "Test message sent", description: "System diagnostic message transmitted" });
    setActiveTab("chat");
  };

  const handleClearCache = () => {
    if (!selectedUser) {
      toast({ title: "No user selected", variant: "destructive" });
      return;
    }
    
    const message = `CLEAR_CACHE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Cache cleared", description: `${selectedUser.name}'s session cache cleared` });
    setActiveTab("chat");
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
              <h2 className="text-white font-bold text-sm">WorkforceOS Support</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Users size={12} />
                <span>{onlineUsers.length} online</span>
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-sm font-semibold transition-all ${
              activeTab === 'chat'
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-slate-400 hover:text-white'
            }`}
            data-testid="tab-chat"
          >
            Chat
          </button>
          {isStaff && (
            <>
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={`flex-1 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'diagnostics'
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid="tab-diagnostics"
              >
                Diagnostics
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`flex-1 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'tools'
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid="tab-tools"
              >
                Tools
              </button>
            </>
          )}
        </div>
      </div>


      {/* Tab Content */}
      {activeTab === 'chat' && (
        <>
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative z-10">
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
                </span>
                {/* Always show role badge for staff/bot */}
                {(roleDisplay || (msg.senderId === userId && userPlatformRole)) && (
                  <Badge 
                    variant="secondary" 
                    className={`text-[10px] px-1.5 py-0 border font-semibold ${
                      msg.senderType === 'bot' 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                        : isCurrentUser
                          ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30 border-indigo-500/50'
                          : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                    }`}
                    style={isCurrentUser ? {
                      animation: 'glow 2s ease-in-out infinite',
                    } : {}}
                  >
                    <span className={isCurrentUser ? 'text-indigo-400 font-bold animate-pulse' : ''}>
                      {roleDisplay || (msg.senderId === userId ? getRoleDisplay(userPlatformRole) : null)}
                    </span>
                  </Badge>
                )}
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


      {/* Floating User List Button (Bottom Right) - Staff Only */}
      {isStaff && (
        <Sheet open={showUserList} onOpenChange={setShowUserList}>
          <SheetTrigger asChild>
            <button
              className="fixed bottom-20 right-4 z-50 p-4 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full text-white shadow-2xl shadow-indigo-500/50 hover:shadow-indigo-500/70 transition-all active:scale-95"
              data-testid="button-user-list"
            >
              <Users size={24} />
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
                {onlineUsers.length}
              </div>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-h-[80vh]">
            <SheetHeader>
              <SheetTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Online Users ({onlineUsers.length})
              </SheetTitle>
            </SheetHeader>
            
            {/* User Context Card - Shows when user selected */}
            {selectedUser && userContext && (
              <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-white">{userContext.user?.firstName} {userContext.user?.lastName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Active Tickets:</span>
                    <span className="text-white ml-1 font-mono">{userContext.metrics?.activeTickets || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Resolved:</span>
                    <span className="text-emerald-400 ml-1 font-mono">{userContext.metrics?.resolvedTickets || 0}</span>
                  </div>
                  {userContext.workspace && (
                    <>
                      <div className="col-span-2">
                        <span className="text-slate-400">Org:</span>
                        <span className="text-white ml-1">{userContext.workspace.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Serial:</span>
                        <span className="text-cyan-400 ml-1 font-mono text-[10px]">{userContext.workspace.serialNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Tier:</span>
                        <span className="text-purple-400 ml-1 capitalize">{userContext.workspace.subscriptionTier}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {/* Sort users: Root admin at absolute top, staff next, then others */}
              {(() => {
                const sortedUsers = [...onlineUsers].sort((a, b) => {
                  const rolePriority: Record<string, number> = {
                    'root': 0,              // Root admin at absolute top
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
                  
                  return a.name.localeCompare(b.name);
                });
                
                return sortedUsers.map((user) => {
                  const userRole = (user as any).platformRole || user.role;
                  const userRoleDisplay = getRoleDisplay(userRole) || user.role.toUpperCase();
                
                return (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user as OnlineUser)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    selectedUser?.id === user.id
                      ? 'bg-indigo-500/20 border-indigo-500/50'
                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  data-testid={`user-${user.id}`}
                >
                  {/* WorkforceOS Logo */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                    user.role === 'bot' ? 'bg-gradient-to-br from-amber-500 to-yellow-600' :
                    user.role === 'support' || user.role === 'admin' ? 'bg-gradient-to-br from-indigo-600 to-blue-600' :
                    'bg-gradient-to-br from-slate-600 to-slate-700'
                  }`}>
                    {user.role === 'bot' ? (
                      <Sparkles size={20} className="text-white" />
                    ) : (
                      <WorkforceOSLogo className="h-6 w-6" showText={false} />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-white font-medium text-sm">
                      {user.role === 'bot' ? 'HelpOS' : user.name.split('(')[0].trim()}
                    </div>
                    <div className="text-slate-400 text-xs">ID: {user.id}</div>
                  </div>
                  <Badge className={`text-xs ${
                    user.role === 'bot' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                    user.role === 'support' || user.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                    'bg-slate-500/20 text-slate-400 border-slate-500/30'
                  }`}>
                    {userRoleDisplay}
                  </Badge>
                  {selectedUser?.id === user.id && (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  )}
                </button>
                );
                });
              })()}
            </div>
          </SheetContent>
        </Sheet>
      )}
      
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
            <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 fade-in">
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
        </>
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
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
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
