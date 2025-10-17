import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useChatSounds } from "@/hooks/use-chat-sounds";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { ChatAgreementModal } from "@/components/chat-agreement-modal";
import { useTransition } from "@/contexts/transition-context";
import { apiRequest } from "@/lib/queryClient";
import { 
  Send, Menu, X, Settings, Users, Circle, Shield, 
  Headphones, Bot, MessageSquare, Lock, HelpCircle,
  XCircle, CheckCircle, Clock, AlertCircle, ChevronDown,
  UserCheck, FileText, Camera, PenTool, Info, ArrowRight, Sparkles
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
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
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

  // Check if user has accepted agreement
  const { data: agreementStatus } = useQuery<{ hasAccepted: boolean; acceptedAt: string | null }>({
    queryKey: ['/api/helpdesk/agreement/check/helpdesk', sessionId],
    enabled: isAuthenticated,
    retry: false,
  });

  // Agreement acceptance mutation
  const acceptAgreementMutation = useMutation({
    mutationFn: async (fullName: string) => {
      return apiRequest('/api/helpdesk/agreement/accept', 'POST', {
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

  // Show loading transition on initial load (DC360.5 branded)
  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Initializing DC360.5 Mobile HelpDesk...",
      submessage: "Connecting to WorkforceOS Support",
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

  // Support commands that work on selected user
  const supportCommands = [
    { 
      icon: UserCheck, 
      label: 'Release Hold & Welcome', 
      action: () => handleReleaseHold(),
      color: 'text-emerald-400',
      description: 'Remove spectator mode + send greeting'
    },
    { 
      icon: Lock, 
      label: 'Request Authentication', 
      action: () => handleRequestAuth(),
      color: 'text-indigo-400',
      description: 'Ask user to verify their identity'
    },
    { 
      icon: FileText, 
      label: 'Request Document', 
      action: () => handleRequestDocument(),
      color: 'text-blue-400',
      description: 'Request file upload from user'
    },
    { 
      icon: Camera, 
      label: 'Request Photo', 
      action: () => handleRequestPhoto(),
      color: 'text-cyan-400',
      description: 'Request photo/screenshot'
    },
    { 
      icon: PenTool, 
      label: 'Request Signature', 
      action: () => handleRequestSignature(),
      color: 'text-purple-400',
      description: 'Request e-signature'
    },
    { 
      icon: Info, 
      label: 'Request Info', 
      action: () => handleRequestInfo(),
      color: 'text-orange-400',
      description: 'Ask for specific information'
    },
    { 
      icon: ArrowRight, 
      label: 'Transfer User', 
      action: () => handleTransfer(),
      color: 'text-pink-400',
      description: 'Transfer to another agent'
    },
    { 
      icon: CheckCircle, 
      label: 'Mark Resolved', 
      action: () => handleResolve(),
      color: 'text-green-400',
      description: 'Close ticket as resolved'
    },
  ];

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

  const handleUserSelect = (user: OnlineUser) => {
    setSelectedUser(user);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
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
    setShowCommandMenu(false);
    setSelectedUser(null);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header */}
      <div className="relative z-10 backdrop-blur-xl bg-black/30 border-b border-white/10 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm">
                  HD
                </div>
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                helpDeskRoom?.status === 'open' ? 'bg-emerald-500' : 'bg-red-500'
              }`}></div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-sm">Help Desk</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Users size={12} />
                <span>{onlineUsers.length} online</span>
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              </div>
            </div>
          </div>
          {isStaff && (
            <button 
              onClick={() => setShowCommandMenu(!showCommandMenu)}
              className={`flex-shrink-0 p-3 rounded-xl transition-all shadow-lg ${
                showCommandMenu 
                  ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-indigo-500/50' 
                  : 'bg-white/10 text-white hover:bg-white/20 shadow-black/20'
              }`}
              data-testid="button-command-menu"
              aria-label="Command Menu"
            >
              <Menu size={20} />
            </button>
          )}
        </div>
        {/* Selected user badge - Full row below header when user selected */}
        {isStaff && selectedUser && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="flex items-center gap-2">
              <UserCheck size={14} className="text-indigo-400 flex-shrink-0" />
              <span className="text-xs text-indigo-400 font-medium">Selected:</span>
              <span className="text-sm text-white font-semibold truncate flex-1">{selectedUser.name}</span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs flex-shrink-0 animate-pulse">
                ACTIVE
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Command Menu - Hidden by default, shows when hamburger clicked */}
      {showCommandMenu && isStaff && (
        <div className={`absolute left-0 right-0 z-50 backdrop-blur-xl bg-black/90 border-b border-white/10 p-4 shadow-2xl animate-in slide-in-from-top-2 fade-in max-h-[70vh] overflow-y-auto ${
          selectedUser ? 'top-[120px]' : 'top-16'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="whitespace-nowrap">Support Commands</span>
              {!selectedUser && <span className="text-xs text-orange-400 whitespace-nowrap">(Select a user first)</span>}
            </h3>
            <button 
              onClick={() => setShowCommandMenu(false)} 
              className="text-slate-400 hover:text-white"
              data-testid="button-close-commands"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-2">
            {supportCommands.map((cmd, idx) => (
              <button
                key={idx}
                onClick={cmd.action}
                disabled={!selectedUser}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                  selectedUser 
                    ? 'bg-white/5 hover:bg-white/10 border-white/10 active:scale-98' 
                    : 'bg-white/5 opacity-50 cursor-not-allowed border-white/5'
                }`}
                data-testid={`command-${cmd.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <cmd.icon size={20} className={`flex-shrink-0 ${selectedUser ? cmd.color : 'text-slate-600'}`} />
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-sm font-medium break-words ${selectedUser ? 'text-white' : 'text-slate-600'}`}>
                    {cmd.label}
                  </div>
                  <div className="text-xs text-slate-500 break-words">{cmd.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
              <p className="text-sm text-slate-200 leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
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
            <div className="mt-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {onlineUsers.map((user) => {
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
              )})}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Input Area */}
      <div className="relative z-10 backdrop-blur-xl bg-black/40 border-t border-white/10 px-4 py-3">
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
            className="p-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full text-white hover:shadow-lg hover:shadow-indigo-500/50 transition-all active:scale-95"
            data-testid="button-send"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* Agreement Modal - Mobile Optimized */}
      {showAgreement && (
        <ChatAgreementModal
          roomName="Mobile Support Chat (DC360.5)"
          onAccept={(fullName) => acceptAgreementMutation.mutate(fullName)}
          isSubmitting={acceptAgreementMutation.isPending}
        />
      )}
    </div>
  );
}
