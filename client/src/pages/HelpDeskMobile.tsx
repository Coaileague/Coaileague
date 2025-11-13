import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useIdentity } from "@/hooks/useIdentity";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useNavigationProtection } from "@/hooks/use-navigation-protection";
import { useChatSounds } from "@/hooks/use-chat-sounds";
import { MessageBubble, TypingIndicator, ParticipantDrawer, MacrosDrawer } from "@/components/chat";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { WFLogoCompact } from "@/components/wf-logo";
import { UserDiagnosticsPanel } from "@/components/user-diagnostics-panel";
import { useTransition } from "@/contexts/transition-context";
import { apiRequest } from "@/lib/queryClient";
import { 
  Send, Menu, X, Settings, Users, Circle, Shield, 
  Headphones, Bot, MessageSquare, Lock, HelpCircle,
  XCircle, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronRight,
  UserCheck, FileText, Camera, PenTool, Info, ArrowRight, Sparkles,
  Ban, AlertTriangle, Timer, UserX, TrendingUp, Key, Mail, ListChecks,
  Tag, ClipboardList, History, Zap, MessageCircle, ArrowUpCircle, Star,
  Eye, UserCog, RefreshCw, PackageCheck, FileSearch, Paperclip, Loader2
} from "lucide-react";
import type { ChatMessage } from "@shared/schema";
import { sanitizeMessage } from "@/lib/sanitize";

interface OnlineUser {
  id: string;
  name: string;
  role: 'admin' | 'support' | 'customer' | 'bot';
  status: 'online';
}

// Available conversations for multi-room support
const AVAILABLE_CONVERSATIONS = [
  { id: 'main-chatroom-workforceos', name: 'General Support', description: 'Main support room' },
  { id: 'premium-support', name: 'Premium Support', description: 'For premium members' },
  { id: 'technical-support', name: 'Technical Help', description: 'Technical issues' },
];

export default function ModernMobileChat() {
  const [messageText, setMessageText] = useState("");
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [diagnosticsUserId, setDiagnosticsUserId] = useState<string | null>(null);
  const [showFABs, setShowFABs] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  
  // Premium features state
  const [selectedConversationId, setSelectedConversationId] = useState('main-chatroom-workforceos');
  const [conversationSelectorOpen, setConversationSelectorOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { playSound } = useChatSounds();
  const { showTransition, hideTransition } = useTransition();
  const [, navigate] = useLocation();
  
  // Keyboard-aware mobile input handling
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);
    return () => window.removeEventListener('resize', setVH);
  }, []);
  
  // Generate or get session ID for tracking
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem('chat-session-id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('chat-session-id', newId);
    return newId;
  });

  // Get current user data using useAuth hook (matches desktop implementation)
  const { user } = useAuth();
  const { 
    externalId, 
    employeeId, 
    supportCode, 
    orgId, 
    userType, 
    workspaceRole,
    platformRole
  } = useIdentity(); // Universal RBAC tracking - ALL user types

  const userId = user?.id;
  // Generate display name like desktop does
  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'Guest';
  const userPlatformRole = user?.platformRole;
  const isStaff = userPlatformRole && 
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(userPlatformRole);
  const isAuthenticated = !!user;

  // Log comprehensive identity tracking for RBAC (critical for audit trails)
  useEffect(() => {
    if (externalId && userId) {
      const role = workspaceRole || platformRole || userPlatformRole || 'guest';
      console.log(`[MOBILE RBAC] User authenticated: ${userName} (${externalId}) - Type: ${userType} - Role: ${role} - Org: ${orgId || 'N/A'}`);
    } else if (userId) {
      console.log(`[MOBILE RBAC] User authenticated: ${userName} (No external ID) - Role: ${userPlatformRole || 'guest'}`);
    }
  }, [externalId, userId, userName, userType, workspaceRole, platformRole, userPlatformRole, orgId]);
  
  // Get role display text
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
      
      // Add the username with superscript role
      parts.push(
        <span key={key++} className="font-semibold">
          {userName}
          <sup className={`text-[8px] font-normal ${isBot ? 'text-blue-500' : 'text-blue-500'}`}>
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
  
  // Check if message is from current user for animated badge
  const isOwnMessage = (senderId: string) => senderId === userId;

  // Fetch HelpDesk room info
  const { data: helpDeskRoom } = useQuery<{ status: string; statusMessage: string | null }>({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: !!userId && isAuthenticated,
    retry: false,
    staleTime: 30000,
  });

  // Use WebSocket for real-time messaging with dynamic conversation support
  const { 
    messages, sendMessage, sendRawMessage, kickUser, silenceUser, giveVoice, onlineUsers, isConnected,
    isSilenced, justGotVoice,
    // Premium features
    sendTyping, readReceipts, conversationParticipants, typingUserInfo, error
  } = useChatroomWebSocket(
    userId || `guest-${sessionId}`, 
    userName,
    selectedConversationId  // Dynamic conversation switching
  );

  // Navigation protection - prevent accidental disconnects from live chat
  useNavigationProtection({
    currentRoute: '/mobile-chat',
    shouldProtect: isConnected || messages.length > 0,
  });

  // Show loading transition on initial load
  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Initializing AutoForce™ Support...",
      submessage: "Connecting to Live Support Chat",
      duration: 2000,
      onComplete: () => {
        hideTransition();
      }
    });
  }, []); // Only run once on mount

  // Watch for voice_granted event to immediately enable chat
  useEffect(() => {
    if (justGotVoice) {
      toast({
        title: "Chat Enabled",
        description: "You can now send messages!",
        duration: 3000,
      });
    }
  }, [justGotVoice, toast]);

  // Premium Features: Typing Handler
  const handleTyping = (text: string) => {
    setMessageText(text);
    
    if (!isTyping && text.length > 0) {
      setIsTyping(true);
      sendTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTyping(false);
    }, 2000);
  };

  // Premium Features: File Upload Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const MAX_FILES = 5;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    if (selectedFiles.length + files.length > MAX_FILES) {
      toast({
        title: "Too many files",
        description: `Maximum ${MAX_FILES} files allowed`,
        variant: "destructive"
      });
      return;
    }

    const validFiles = files.filter(file => {
      if (file.size > MAX_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive"
        });
        return false;
      }
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (selectedFiles.length === 0) return [];

    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('files', file));

      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json() as { uploadedFiles: Array<{ id: string; filename: string; storageUrl: string }> };
      return data.uploadedFiles.map(f => f.storageUrl);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsUploading(false);
    }
  };

  // Premium Features: Conversation Switching
  const selectedConversation = AVAILABLE_CONVERSATIONS.find(c => c.id === selectedConversationId) 
    || AVAILABLE_CONVERSATIONS[0];

  const handleConversationSwitch = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setConversationSelectorOpen(false);
    toast({
      title: "Switched conversation",
      description: `Now in: ${AVAILABLE_CONVERSATIONS.find(c => c.id === conversationId)?.name}`,
    });
  };

  // Premium Features: Macro Handler
  const handleMacroSelect = (macroText: string) => {
    setMessageText(macroText);
    setMacrosOpen(false);
  };

  // Role-based permission system
  const hasPermission = (requiredRoles: string[]) => {
    if (!userPlatformRole) return false;
    return requiredRoles.includes(userPlatformRole);
  };

  // All staff roles - INCLUDES 'support_agent' for frontline agents
  const ALL_STAFF = ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'];
  const DEPUTY_ASSISTANT_PLUS = ['root_admin', 'deputy_admin', 'support_manager'];
  const DEPUTY_ADMIN_PLUS = ['root_admin', 'deputy_admin'];
  const ADMIN_ONLY = ['root_admin', 'deputy_admin'];
  const SYSTEM_ONLY = ['root_admin', 'sysop'];

  // Quick Responses for staff - Personalized with selected user's name
  const getQuickResponses = () => {
    const userName = selectedUser?.name || 'there';
    const firstName = userName.split(' ')[0]; // Get first name for more personal messages
    
    return [
      {
        icon: CheckCircle,
        label: 'Welcome & Introduction',
        text: `Hi ${firstName}! Welcome to AutoForce™ Support! I'm here to assist you. How can I help you today?`,
        color: 'text-blue-500'
      },
      {
        icon: Clock,
        label: 'Please Wait',
        text: `Thank you for your patience, ${firstName}. I'm looking into this for you right now and will have an answer shortly.`,
        color: 'text-blue-500'
      },
      {
        icon: HelpCircle,
        label: 'Need More Info',
        text: `${firstName}, to better assist you, could you provide more details about the issue you're experiencing?`,
        color: 'text-blue-600'
      },
      {
        icon: FileSearch,
        label: 'Investigating Issue',
        text: `${firstName}, I'm investigating this issue now. I'll check our system logs and get back to you with a solution.`,
        color: 'text-blue-500'
      },
      {
        icon: PackageCheck,
        label: 'Issue Resolved',
        text: `Great news, ${firstName}! I've resolved the issue. Please let me know if you need any further assistance.`,
        color: 'text-blue-500'
      },
      {
        icon: RefreshCw,
        label: 'Try Refreshing',
        text: `${firstName}, please try refreshing your browser or logging out and back in. This should resolve the issue.`,
        color: 'text-blue-500'
      },
      {
        icon: Mail,
        label: 'Follow Up',
        text: `${firstName}, I'll follow up with our technical team and send you an email update within 24 hours.`,
        color: 'text-blue-500'
      },
      {
        icon: Star,
        label: 'Closing Remarks',
        text: `Thank you for contacting AutoForce™ Support, ${firstName}! Feel free to reach out anytime you need assistance.`,
        color: 'text-blue-600'
      }
    ];
  };
  
  const quickResponses = getQuickResponses();

  // Comprehensive command system with role-based filtering
  const getAllCommands = () => {
    const allCommands = [
      // TIER 1 - Basic Support (All Staff)
      { 
        icon: UserCheck, 
        label: 'Release Hold & Welcome', 
        action: () => handleReleaseHold(),
        color: 'text-blue-500',
        description: 'Remove spectator mode + send greeting',
        roles: ALL_STAFF,
        tier: 'Basic Support'
      },
      { 
        icon: Info, 
        label: 'Request Info', 
        action: () => handleRequestInfo(),
        color: 'text-blue-600',
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
        color: 'text-blue-500',
        description: 'Ask user to verify their identity',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Authentication'
      },
      { 
        icon: Key, 
        label: 'Reset Password', 
        action: () => handleResetPassword(),
        color: 'text-destructive',
        description: 'Initiate password reset for user',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Authentication'
      },
      { 
        icon: UserCog, 
        label: 'Unlock Account', 
        action: () => handleUnlockAccount(),
        color: 'text-blue-500',
        description: 'Unlock locked user account',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Authentication'
      },

      // TIER 3 - Documents
      { 
        icon: FileText, 
        label: 'Request Document', 
        action: () => handleRequestDocument(),
        color: 'text-blue-500',
        description: 'Request file upload from user',
        roles: ALL_STAFF,
        tier: 'Documents'
      },
      { 
        icon: Camera, 
        label: 'Request Photo', 
        action: () => handleRequestPhoto(),
        color: 'text-blue-500',
        description: 'Request photo/screenshot',
        roles: ALL_STAFF,
        tier: 'Documents'
      },
      { 
        icon: PenTool, 
        label: 'Request Signature', 
        action: () => handleRequestSignature(),
        color: 'text-blue-500',
        description: 'Request e-signature',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Documents'
      },
      { 
        icon: Eye, 
        label: 'View Documents', 
        action: () => handleViewDocuments(),
        color: 'text-blue-500',
        description: 'View user submitted documents',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Documents'
      },

      // TIER 4 - Ticket Management
      { 
        icon: CheckCircle, 
        label: 'Mark Resolved', 
        action: () => handleResolve(),
        color: 'text-blue-500',
        description: 'Close ticket as resolved',
        roles: ALL_STAFF,
        tier: 'Ticket Management'
      },
      { 
        icon: ArrowRight, 
        label: 'Transfer User', 
        action: () => handleTransfer(),
        color: 'text-destructive',
        description: 'Transfer to another agent',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Ticket Management'
      },
      { 
        icon: ArrowUpCircle, 
        label: 'Escalate', 
        action: () => handleEscalate(),
        color: 'text-blue-600',
        description: 'Escalate to higher support tier',
        roles: ALL_STAFF,
        tier: 'Ticket Management'
      },
      { 
        icon: Tag, 
        label: 'Priority Tag', 
        action: () => handlePriorityTag(),
        color: 'text-blue-400',
        description: 'Mark ticket as high priority',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Ticket Management'
      },
      { 
        icon: Clock, 
        label: 'Schedule Follow-up', 
        action: () => handleFollowUp(),
        color: 'text-blue-600',
        description: 'Schedule follow-up reminder',
        roles: DEPUTY_ASSISTANT_PLUS,
        tier: 'Ticket Management'
      },

      // TIER 5 - Advanced (Deputy Admin+)
      { 
        icon: Mail, 
        label: 'Email Summary', 
        action: () => handleEmailSummary(),
        color: 'text-blue-500',
        description: 'Send conversation summary via email',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Advanced'
      },
      { 
        icon: Star, 
        label: 'Mark VIP', 
        action: () => handleMarkVIP(),
        color: 'text-blue-600',
        description: 'Flag user as VIP customer',
        roles: DEPUTY_ADMIN_PLUS,
        tier: 'Advanced'
      },
      { 
        icon: History, 
        label: 'User History', 
        action: () => handleUserHistory(),
        color: 'text-blue-400',
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
        color: 'text-destructive',
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
        color: 'text-blue-500',
        description: 'View system analytics dashboard',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: RefreshCw, 
        label: 'Force Reconnect', 
        action: () => handleForceReconnect(),
        color: 'text-blue-500',
        description: 'Force user WebSocket reconnection',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: Zap, 
        label: 'Test Message', 
        action: () => handleTestMessage(),
        color: 'text-blue-500',
        description: 'Send system test message',
        roles: SYSTEM_ONLY,
        tier: 'System'
      },
      { 
        icon: PackageCheck, 
        label: 'Clear Cache', 
        action: () => handleClearCache(),
        color: 'text-blue-500',
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

  const handleSend = async () => {
    // Guard: Don't send if disconnected or silenced
    if (!isConnected || isSilenced) {
      if (isSilenced) {
        toast({
          title: "Cannot Send",
          description: "You don't have permission to send messages yet.",
          duration: 2000,
        });
      }
      return;
    }
    
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage && selectedFiles.length === 0) return;

    // Upload files first if any selected
    if (selectedFiles.length > 0) {
      const uploadedUrls = await uploadFiles();
      if (uploadedUrls.length > 0) {
        const fileMessage = uploadedUrls.map((url, i) => `File ${i + 1}: ${url}`).join('\n');
        const fullMessage = trimmedMessage 
          ? `${trimmedMessage}\n\nAttached files:\n${fileMessage}`
          : `Attached files:\n${fileMessage}`;
        
        sendMessage(fullMessage, userName, isStaff ? 'support' : 'customer');
      }
      setSelectedFiles([]);
    } else if (trimmedMessage) {
      sendMessage(trimmedMessage, userName, isStaff ? 'support' : 'customer');
    }
    
    setMessageText('');
    setIsTyping(false);
    sendTyping(false);
    playSound('send');
  };

  const handleUserSelect = (user: OnlineUser) => {
    setSelectedUser(user);
    setShowUserList(false);
    
    // Open diagnostics panel for this user (QueryOS™)
    setDiagnosticsUserId(user.id);
    setShowDiagnostics(true);
    
    const userTypeLabel = user.role === 'bot' ? '🤖 Platform Bot' : user.name;
    toast({ 
      title: "User Selected", 
      description: `Viewing ${userTypeLabel} diagnostics via QueryOS™`
    });
  };

  // Support command handlers with user ID tracking
  const handleReleaseHold = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected", description: "Select a user first" });
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
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `REQUEST_AUTH:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please verify your identity. I'll send you a secure authentication request.`, userName, 'support');
    
    toast({ title: "Auth request sent", description: `Waiting for ${selectedUser.name} to authenticate` });
  };

  const handleRequestDocument = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `REQUEST_DOCUMENT:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please upload the required document using the secure upload dialog.`, userName, 'support');
    
    toast({ title: "Document request sent", description: `${selectedUser.name} will receive upload prompt` });
  };

  const handleRequestPhoto = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `REQUEST_PHOTO:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please upload a photo/screenshot to help us assist you.`, userName, 'support');
    
    toast({ title: "Photo request sent" });
  };

  const handleRequestSignature = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `REQUEST_SIGNATURE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please provide your e-signature to proceed.`, userName, 'support');
    
    toast({ title: "Signature request sent" });
  };

  const handleRequestInfo = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `REQUEST_INFO:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} Please provide additional information about your request.`, userName, 'support');
    
    toast({ title: "Info request sent" });
  };

  const handleTransfer = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `TRANSFER_USER:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm transferring you to another specialist who can better assist you.`, userName, 'support');
    
    toast({ title: "Transfer initiated", description: `${selectedUser.name} will be transferred` });
  };

  const handleResolve = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
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
      toast({ title: "⚠️ No User Selected" });
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
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `INTERNAL_NOTE:${selectedUser.id}:${selectedUser.name}:Staff note added to ticket`;
    sendRawMessage(message);
    
    toast({ title: "Internal note added", description: "Note visible to staff only" });
  };

  // NEW COMMAND HANDLERS - TIER 2 (Authentication)
  const handleResetPassword = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `RESET_PASSWORD:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm initiating a password reset for your account. You'll receive an email shortly.`, userName, 'support');
    
    toast({ title: "Password reset initiated", description: `Email sent to ${selectedUser.name}` });
  };

  const handleUnlockAccount = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
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
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `VIEW_DOCUMENTS:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Document viewer opened", description: `Viewing ${selectedUser.name}'s submitted documents` });
  };

  // NEW COMMAND HANDLERS - TIER 4 (Ticket Management)
  const handleEscalate = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `ESCALATE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm escalating your issue to our senior support team for specialized assistance.`, userName, 'support');
    
    toast({ title: "Ticket escalated", description: "Transferred to Tier 2 support" });
  };

  const handlePriorityTag = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `PRIORITY_TAG:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Priority flag added", description: `${selectedUser.name}'s ticket marked as high priority`, variant: "default" });
  };

  const handleFollowUp = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `FOLLOW_UP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Follow-up scheduled", description: "Reminder set for 24 hours" });
  };

  // NEW COMMAND HANDLERS - TIER 5 (Advanced)
  const handleEmailSummary = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `EMAIL_SUMMARY:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} I'm sending a summary of our conversation to your email.`, userName, 'support');
    
    toast({ title: "Email summary sent", description: `Conversation summary sent to ${selectedUser.name}` });
  };

  const handleMarkVIP = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `MARK_VIP:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "VIP status granted", description: `${selectedUser.name} flagged as VIP customer` });
  };

  const handleUserHistory = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `USER_HISTORY:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "History loaded", description: `Viewing ${selectedUser.name}'s complete interaction history` });
  };

  // NEW COMMAND HANDLERS - TIER 6 (Moderation)
  const handleIssueWarning = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `ISSUE_WARNING:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    sendMessage(`@${selectedUser.name} This is a formal warning. Please follow our community guidelines.`, userName, 'support');
    
    toast({ title: "⚠️ Warning Issued", description: `${selectedUser.name}` });
  };

  const handleTempMute = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    // Use proper silenceUser function (duration in minutes)
    silenceUser(selectedUser.id, 5, 'Temporary mute');
    
    toast({ title: "🔇 Muting User...", description: `${selectedUser.name} • 5min` });
  };

  const handleKick = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    // Use proper kickUser function from WebSocket hook
    kickUser(selectedUser.id, 'Chat violation');
    
    toast({ title: "✓ Kicking User...", description: `${selectedUser.name}` });
    setSelectedUser(null);
  };

  const handleBan = () => {
    if (!selectedUser) {
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    // TODO: Implement ban_user WebSocket command on server
    // For now, kick the user as banning is not yet implemented
    kickUser(selectedUser.id, 'Banned for violations');
    
    toast({ 
      title: "🚫 Banning User...", 
      description: `${selectedUser.name}`, 
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
      toast({ title: "⚠️ No User Selected" });
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
      toast({ title: "⚠️ No User Selected" });
      return;
    }
    
    const message = `CLEAR_CACHE:${selectedUser.id}:${selectedUser.name}`;
    sendRawMessage(message);
    
    toast({ title: "Cache cleared", description: `${selectedUser.name}'s session cache cleared` });
  };

  return (
    <div className="h-screen w-full max-w-full bg-muted flex flex-col relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 opacity-20 overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-muted/30 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-muted/30 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header with User Profile Card - Reduced height for more chat space + safe-area support */}
      <div className="relative z-10 backdrop-blur-xl bg-transparent border-b border-white/10 px-3 py-2 pt-safe">
        {selectedUser && isStaff ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-600 shadow-md flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-base">{selectedUser.name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-gray-900 font-bold text-sm truncate">{selectedUser.name}</h2>
                <p className="text-slate-400 text-[10px] truncate">
                  {selectedUser.role === 'bot' ? 'Platform AI Bot' : 'AutoForce™ User'}
                </p>
              </div>
              {selectedUser && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] flex-shrink-0 px-1.5 py-0.5 font-bold">
                  URGENT
                </Badge>
              )}
              <Button
                onClick={() => navigate('/dashboard')}
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                data-testid="button-exit-chatroom-mobile"
                title="Exit Chat Room"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <Clock size={10} />
                <span>Session: {Math.floor((Date.now() - new Date().getTime()) / 60000) || 5}:23</span>
              </div>
              <div className="flex items-center gap-1">
                <Circle className={`w-1.5 h-1.5 ${isConnected ? 'fill-blue-500 text-blue-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
                <span className={isConnected ? 'text-blue-500' : 'text-red-400'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <AnimatedAutoForceLogo variant="icon" size="sm" className="scale-75" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-gray-900 font-bold text-sm break-words">AutoForce™ HelpDesk</h2>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                <Users size={10} />
                <span>{onlineUsers.length} online</span>
                <Circle className={`w-1.5 h-1.5 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              </div>
            </div>
            <Button
              onClick={() => navigate('/dashboard')}
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              data-testid="button-exit-chatroom-mobile"
              title="Exit Chat Room"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Messages Container (always visible) - with safe-area bottom padding */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative z-10 smooth-scroll has-bottom-nav">
        {messages.map((msg) => {
          const msgRole = (msg as any).platformRole || msg.senderType;
          const roleDisplay = msgRole === 'bot' ? 'BOT AI' : getRoleDisplay(msgRole);
          const isCurrentUser = msg.senderId && isOwnMessage(msg.senderId);
          const isPrivate = (msg as any).isPrivateMessage || false;
          const isServerMessage = msg.senderType === 'system' || msg.senderId === 'system' || msg.senderId === null;
          
          // SERVER/SYSTEM MESSAGE - Modern style without avatar/logo
          if (isServerMessage) {
            return (
              <div key={msg.id} className="flex justify-center my-3 px-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-gradient-to-r from-slate-800/40 via-slate-700/60 to-slate-800/40 rounded-lg px-4 py-2.5 max-w-[90%] border border-slate-600/30 backdrop-blur-sm">
                  <div className="flex items-center gap-2 justify-center mb-1">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">System</span>
                  </div>
                  <div 
                    className="text-sm text-slate-200 text-center leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeMessage(msg.message) }}
                  />
                </div>
              </div>
            );
          }
          
          return (
          <div key={msg.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2">
            {/* WorkforceOS Logo Avatar - Bigger and Bolder */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ring-2 ${
              msg.senderType === 'bot' ? 'bg-gradient-to-br from-blue-500 to-blue-600 ring-blue-500/50' :
              msg.senderType === 'support' ? 'bg-gradient-to-br from-primary to-accent ring-primary/50' :
              'bg-gradient-to-br from-slate-600 to-slate-700 ring-slate-500/50'
            }`}>
              {msg.senderType === 'bot' ? (
                <Sparkles size={20} className="text-white font-bold" />
              ) : (
                <AnimatedAutoForceLogo className="h-7 w-7 font-bold" variant="icon" />
              )}
            </div>
            {/* WF Logo for STAFF ONLY */}
            {['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(msgRole) && (
              <div className="flex-shrink-0">
                <WFLogoCompact size={16} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-bold text-sm ${
                  msg.senderType === 'bot' ? 'text-blue-500' :
                  msg.senderType === 'support' ? 'text-blue-500' :
                  'text-white'
                }`}>
                  {msg.senderType === 'bot' ? 'HelpOS AI Bot' : msg.senderName?.split('(')[0].trim()}
                  {/* Role badge as superscript - attached inline like 10² */}
                  {(roleDisplay || (msg.senderId === userId && userPlatformRole)) && (
                    <sup className={`text-[8px] font-normal ${
                      msg.senderType === 'bot' 
                        ? 'text-blue-500/70' 
                        : isCurrentUser
                          ? 'text-blue-500'
                          : 'text-blue-500/70'
                    }`}>
                      ({roleDisplay || (msg.senderId === userId ? getRoleDisplay(userPlatformRole || undefined) : null)})
                    </sup>
                  )}
                </span>
                {/* Private Message Indicator with Glow Effect */}
                {isPrivate && (
                  <span className="text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-muted/20 border border-primary/80/30 animate-pulse-glow" data-testid="badge-private-message">
                    whispered
                  </span>
                )}
                <span className="text-[10px] text-slate-500">
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div 
                className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${
                  msg.senderType === 'bot' 
                    ? 'bg-blue-500/10 rounded-lg px-3 py-2 text-slate-200' 
                    : 'text-slate-200'
                }`}
                dangerouslySetInnerHTML={{ __html: sanitizeMessage(msg.message) }}
              />
            </div>
          </div>
        )})}
        
        {/* Typing Indicator - Premium Feature */}
        {typingUserInfo && (
          <TypingIndicator userName={typingUserInfo.name} isStaff={typingUserInfo.isStaff} />
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Add glow animations */}
      <style>{`
        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.8)) drop-shadow(0 0 12px rgba(139, 92, 246, 0.6));
          }
          50% {
            filter: drop-shadow(0 0 12px rgba(99, 102, 241, 1)) drop-shadow(0 0 20px rgba(139, 92, 246, 0.8));
          }
        }
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.2);
            border-color: rgba(168, 85, 247, 0.3);
          }
          50% {
            box-shadow: 0 0 16px rgba(168, 85, 247, 0.6), 0 0 24px rgba(168, 85, 247, 0.3);
            border-color: rgba(168, 85, 247, 0.5);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
      
      {/* Quick Responses Section - Staff Only */}
      {isStaff && selectedUser && (
        <div className="relative z-10 border-t border-gray-200 bg-white backdrop-blur-sm">
          <button
            onClick={() => setShowQuickResponses(!showQuickResponses)}
            className="w-full flex items-center justify-between px-4 py-2 text-white hover-elevate transition-all"
            data-testid="button-toggle-quick-responses"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold">Quick Responses</span>
                <span className="text-[10px] text-blue-500 font-medium">
                  → {selectedUser.name.split(' ')[0]}
                </span>
              </div>
              <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-500 border-blue-500/30">
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

      {/* Floating Action Buttons - Mobile Only (Bottom Right) with safe-area support */}
      {isStaff && (
        <div className={`fixed right-4 flex flex-col gap-3 z-50 transition-all duration-300 pb-safe ${
          showFABs ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none'
        }`}
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
          {/* User List Button */}
          <Sheet open={showUserList} onOpenChange={setShowUserList}>
            <SheetTrigger asChild>
              <button
                className="tap w-14 h-14 min-h-[56px] min-w-[56px] rounded-full bg-gradient-to-br from-blue-600 to-blue-600 text-white shadow-lg hover:shadow-blue-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
                data-testid="button-float-users"
              >
                <Users size={24} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 h-[85vh] flex flex-col">
              <SheetHeader className="flex-shrink-0">
                <SheetTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  Online Users ({onlineUsers.length})
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2 flex-1 overflow-y-auto pr-2">
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
                          ? 'bg-muted/20 border-primary/50'
                          : 'bg-white/5 border-white/10 hover-elevate active-elevate-2'
                      }`}
                      data-testid={`user-${user.id}`}
                    >
                      {isBot ? (
                        <Bot className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <div className={`w-3 h-3 rounded-full ${user.status === 'online' ? 'bg-muted/30' : 'bg-slate-500'}`} />
                      )}
                      <div className="flex-1 text-left">
                        <div className={`font-medium text-sm ${isBot ? 'text-blue-500' : 'text-white'}`}>
                          {isBot && '🤖 '}
                          {user.name.split('(')[0].trim()}
                          {user.role && user.role !== 'customer' && (
                            <sup className="ml-0.5 text-[8px] font-normal text-blue-500/70">
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

          {/* Diagnostics Button - Opens QueryOS™ User Diagnostics Panel */}
          <button
            onClick={() => {
              if (selectedUser) {
                setDiagnosticsUserId(selectedUser.id);
                setShowDiagnostics(true);
              } else {
                toast({ title: "No User Selected", description: "Please select a user from the user list first" });
              }
            }}
            className="tap w-14 h-14 min-h-[56px] min-w-[56px] rounded-full bg-gradient-to-br from-blue-600 to-blue-600 text-white shadow-lg hover:shadow-blue-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
            data-testid="button-float-diagnostics"
          >
            <Eye size={24} />
          </button>

          {/* Tools Button */}
          <Sheet open={showTools} onOpenChange={setShowTools}>
            <SheetTrigger asChild>
              <button
                className="tap w-14 h-14 min-h-[56px] min-w-[56px] rounded-full bg-gradient-to-br from-blue-600 to-blue-600 text-white shadow-lg hover:shadow-blue-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center border-2 border-white/20"
                data-testid="button-float-tools"
              >
                <Settings size={24} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900/95 backdrop-blur-xl border-t border-white/10 h-[80vh] flex flex-col">
              <SheetHeader className="flex-shrink-0">
                <SheetTitle className="text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" />
                  <div className="flex flex-col items-start">
                    <span>Support Tools</span>
                    {selectedUser && (
                      <span className="text-xs text-primary font-normal">
                        Active User: {selectedUser.name}
                      </span>
                    )}
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto mt-4 pr-2">
                {selectedUser ? (
                  <div className="space-y-2 pb-4">
                    {supportCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          cmd.action();
                          setShowTools(false);
                        }}
                        className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-white/5 hover-elevate active-elevate-2 border border-white/10"
                        data-testid={`tool-${cmd.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <cmd.icon className={`w-4 h-4 flex-shrink-0 ${cmd.color}`} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-white font-medium text-xs leading-tight">{cmd.label}</div>
                          <div className="text-slate-400 text-[10px] break-words leading-tight">{cmd.description}</div>
                        </div>
                        <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
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

      {/* Input Area - keyboard-aware with safe-area bottom padding */}
      <div ref={inputWrapperRef} className="chat-input-sticky backdrop-blur-xl bg-black/40 border-t border-white/10 px-4 py-3 pb-safe">
        {/* Connection Status Indicator */}
        {!isConnected && (
          <div className="mb-2 flex items-center gap-2 text-xs text-blue-500">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Connecting to chat...
          </div>
        )}
        
        {/* File Upload Preview */}
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative flex-shrink-0 bg-white/10 rounded-lg p-2 pr-8">
                <div className="text-xs text-white truncate max-w-[120px]">{file.name}</div>
                <div className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)}KB</div>
                <button
                  onClick={() => removeFile(index)}
                  className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full hover:bg-red-600 transition-colors"
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* File Upload & Macros - Staff Only */}
          {isStaff && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || isUploading}
                className="tap p-3 min-h-[44px] min-w-[44px] rounded-full bg-white/10 backdrop-blur-sm text-white border border-white/10 hover-elevate active-elevate-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                data-testid="button-attach-file"
                title="Attach files"
              >
                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
              </button>
              <button
                onClick={() => setMacrosOpen(true)}
                disabled={!isConnected}
                className="tap p-3 min-h-[44px] min-w-[44px] rounded-full bg-white/10 backdrop-blur-sm text-white border border-white/10 hover-elevate active-elevate-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                data-testid="button-macros"
                title="Quick macros"
              >
                <Zap size={20} />
              </button>
            </>
          )}

          <div className="flex-1 relative">
            <input
              type="text"
              value={messageText}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={selectedUser ? `Message to ${selectedUser.name}...` : "Type a message..."}
              className="tap w-full bg-white/10 backdrop-blur-sm text-white placeholder-slate-400 px-4 py-3 min-h-[44px] rounded-full border border-white/10 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              data-testid="input-message"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!isConnected || (!messageText.trim() && selectedFiles.length === 0) || isSilenced}
            className={`tap p-3 min-h-[44px] min-w-[44px] rounded-full text-white transition-all ${
              isConnected && (messageText.trim() || selectedFiles.length > 0) && !isSilenced
                ? 'bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/50 active:scale-95'
                : 'bg-slate-600 cursor-not-allowed opacity-50'
            }`}
            data-testid="button-send"
          >
            <Send size={20} />
          </button>
        </div>
      </div>


      {/* QueryOS™ - User Diagnostics Panel (Mobile) */}
      <UserDiagnosticsPanel
        userId={diagnosticsUserId}
        open={showDiagnostics}
        onClose={() => {
          setShowDiagnostics(false);
          setDiagnosticsUserId(null);
        }}
        variant="mobile"
      />

      {/* Premium Features: MacrosDrawer - Staff Only */}
      {isStaff && (
        <MacrosDrawer 
          open={macrosOpen} 
          onOpenChange={setMacrosOpen} 
          onSelectMacro={handleMacroSelect} 
        />
      )}

      {/* Premium Features: ParticipantDrawer */}
      <ParticipantDrawer 
        open={participantsOpen} 
        onOpenChange={setParticipantsOpen} 
        participants={conversationParticipants.get(selectedConversationId) || onlineUsers} 
      />
    </div>
  );
}
