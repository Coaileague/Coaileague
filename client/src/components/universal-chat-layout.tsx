/**
 * Universal Chat Layout
 * Full-featured responsive chat interface for mobile AND desktop with:
 * - WhatsApp-style bubble layout (responsive widths)
 * - User drawer panel (slide-out)
 * - Action toolbar with HelpAI
 * - Quick tools and commands
 * - Online user count
 * - Responsive styling for all screen sizes
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { MobileResponsiveSheet } from "@/components/canvas-hub";
import { 
  Send, 
  ChevronLeft, 
  Home, 
  Users, 
  Bot, 
  Wrench,
  MessageSquare,
  XCircle,
  Shield,
  UserCheck,
  Volume2,
  VolumeX,
  KeyRound,
  UserX,
  Brain,
  Crown,
  User,
  Headphones,
  Camera,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { useLocation } from "wouter";
import { MobileUserActionSheet } from "./mobile-user-action-sheet";
import { StaffNameDisplay } from "./staff-name-display";
import { MessageTextWithIcons } from "./message-text-with-icons";
import { MOBILE_CONFIG } from "@/config/mobileConfig";
import type { ChatMessage } from "@shared/schema";

interface User {
  id: string;
  name: string;
  role: 'staff' | 'customer' | 'guest' | 'bot';
  platformRole?: string;
}

interface UniversalChatLayoutProps {
  messages: ChatMessage[];
  users: User[];
  currentUser: { id: string; name: string; isStaff: boolean };
  onSendMessage: (message: string) => void;
  onCommandExecute: (command: string) => void;
  onKickUser?: (userId: string, reason?: string) => void;
  onSilenceUser?: (userId: string, duration?: number, reason?: string) => void;
  onGiveVoice?: (userId: string) => void;
  onExit?: () => void;
  isLoading?: boolean;
  roomName?: string;
  className?: string;
  onInvokeHelpAI?: () => void;
}

const QUICK_COMMANDS = [
  { id: 'intro', label: 'Introduce', command: '/intro', icon: Headphones },
  { id: 'close', label: 'Close Ticket', command: '/close', icon: XCircle },
  { id: 'ask', label: 'Ask Trinity', command: '/ask ', icon: Brain },
];

// RBAC-based actions: Staff actions on customers
const STAFF_TO_CUSTOMER_ACTIONS = [
  { id: 'auth', label: 'Authenticate', command: '/auth', icon: Shield, color: 'text-primary' },
  { id: 'verify', label: 'Verify ID', command: '/verify', icon: UserCheck, color: 'text-primary' },
  { id: 'silence', label: 'Mute', action: 'silence', icon: VolumeX, color: 'text-destructive' },
  { id: 'voice', label: 'Unmute', action: 'voice', icon: Volume2, color: 'text-primary' },
  { id: 'resetpass', label: 'Reset Pass', command: '/resetpass', icon: KeyRound, color: 'text-muted-foreground' },
  { id: 'kick', label: 'Remove', action: 'kick', icon: UserX, color: 'text-destructive' },
];

// RBAC-based actions: Customer actions on staff - help tools
const CUSTOMER_TO_STAFF_ACTIONS = [
  { id: 'dm', label: 'Private Message', command: '/dm', icon: MessageSquare, color: 'text-primary' },
  { id: 'screenshot', label: 'Send Screenshot', command: '/screenshot', icon: Camera, color: 'text-muted-foreground' },
  { id: 'verify', label: 'Verify My Account', command: '/verifyme', icon: UserCheck, color: 'text-primary' },
  { id: 'help', label: 'Request Help', command: '/help', icon: HelpCircle, color: 'text-muted-foreground' },
  { id: 'issue', label: 'Report Issue', command: '/issue', icon: AlertTriangle, color: 'text-destructive' },
];

// RBAC-based actions: Staff actions on other staff
const STAFF_TO_STAFF_ACTIONS = [
  { id: 'dm', label: 'Direct Message', command: '/dm', icon: MessageSquare, color: 'text-primary' },
  { id: 'mention', label: 'Mention', command: '/mention', icon: Users, color: 'text-muted-foreground' },
];

// Get actions based on current user role and target user role
function getActionsForUser(currentUserIsStaff: boolean, targetRole: 'staff' | 'customer' | 'guest' | 'bot') {
  if (currentUserIsStaff) {
    if (targetRole === 'staff') {
      return STAFF_TO_STAFF_ACTIONS;
    }
    return STAFF_TO_CUSTOMER_ACTIONS;
  } else {
    // Customers can interact with staff and bots
    if (targetRole === 'staff' || targetRole === 'bot') {
      return CUSTOMER_TO_STAFF_ACTIONS;
    }
    return []; // Customers can't take actions on other customers
  }
}

function getRoleIcon(role: string, platformRole?: string) {
  if (platformRole === 'root_admin' || platformRole === 'co_admin') return Crown;
  if (role === 'staff') return Shield;
  if (role === 'customer') return User;
  return User;
}

function getRoleColor(role: string, platformRole?: string) {
  if (platformRole === 'root_admin' || platformRole === 'co_admin') return 'text-primary';
  if (role === 'staff') return 'text-primary';
  if (role === 'customer') return 'text-muted-foreground';
  return 'text-muted-foreground';
}

export function UniversalChatLayout({
  messages,
  users,
  currentUser,
  onSendMessage,
  onCommandExecute,
  onKickUser,
  onSilenceUser,
  onGiveVoice,
  onExit,
  isLoading = false,
  roomName,
  className,
  onInvokeHelpAI,
}: UniversalChatLayoutProps) {
  const [, setLocation] = useLocation();
  const [inputMessage, setInputMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ username: string; userId: string; role: 'staff' | 'customer' | 'guest' | 'bot' } | null>(null);
  const [showUserDrawer, setShowUserDrawer] = useState(false);
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    
    onSendMessage(inputMessage);
    setInputMessage("");
  };

  // Long-press detection for mobile
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  
  const handleUsernameInteraction = useCallback((msg: ChatMessage, isLongPress: boolean = false) => {
    if (!msg.senderId) return;
    if (msg.senderType === 'system' || msg.senderType === 'bot') return;
    if (msg.senderId === currentUser.id) return;

    const user = users.find(u => u.id === msg.senderId);
    // Allow both staff and customers to interact - RBAC determines available actions
    if (user && msg.senderId) {
      setSelectedUser({
        username: msg.senderName,
        userId: msg.senderId,
        role: user.role,
      });
    }
  }, [currentUser.id, users]);
  
  const handleUsernameTouchStart = useCallback((msg: ChatMessage) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      handleUsernameInteraction(msg, true);
    }, 500); // 500ms long-press
  }, [handleUsernameInteraction]);
  
  const handleUsernameTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  const handleUsernameClick = useCallback((msg: ChatMessage) => {
    // Only trigger if not a long-press
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    handleUsernameInteraction(msg, false);
  }, [handleUsernameInteraction]);

  const handleUserSelect = (user: User) => {
    // Toggle selection - if already selected, deselect; otherwise select
    if (selectedUserForAction?.id === user.id) {
      setSelectedUserForAction(null);
    } else {
      setSelectedUserForAction(user);
    }
    // Keep drawer open so user can see action panel
  };

  // Long-press handlers for user list items
  const userListLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userListLongPressTriggeredRef = useRef(false);
  
  const handleUserListTouchStart = useCallback((user: User) => {
    userListLongPressTriggeredRef.current = false;
    userListLongPressTimerRef.current = setTimeout(() => {
      userListLongPressTriggeredRef.current = true;
      // Long-press selects and opens action panel
      setSelectedUserForAction(user);
    }, 500); // 500ms long-press
  }, []);
  
  const handleUserListTouchEnd = useCallback(() => {
    if (userListLongPressTimerRef.current) {
      clearTimeout(userListLongPressTimerRef.current);
      userListLongPressTimerRef.current = null;
    }
  }, []);
  
  const handleUserListClick = useCallback((user: User, canTakeAction: boolean) => {
    // Only trigger if not a long-press and has available actions
    if (userListLongPressTriggeredRef.current) {
      userListLongPressTriggeredRef.current = false;
      return;
    }
    if (canTakeAction) {
      handleUserSelect(user);
    }
  }, []);

  // Type for action items
  type ActionItem = { id: string; label: string; command?: string; action?: string; icon: typeof Shield; color: string };
  
  const handleUserAction = (action: ActionItem) => {
    if (!selectedUserForAction) return;
    
    if (action.command) {
      onCommandExecute(`${action.command} ${selectedUserForAction.id}`);
    } else if (action.action === 'kick' && onKickUser) {
      onKickUser(selectedUserForAction.id);
    } else if (action.action === 'silence' && onSilenceUser) {
      onSilenceUser(selectedUserForAction.id);
    } else if (action.action === 'voice' && onGiveVoice) {
      onGiveVoice(selectedUserForAction.id);
    }
    setSelectedUserForAction(null);
    setShowUserDrawer(false); // Close drawer after action
  };

  const handleQuickCommand = (cmd: typeof QUICK_COMMANDS[0]) => {
    if (cmd.command.endsWith(' ')) {
      setInputMessage(cmd.command);
      setShowToolsDrawer(false);
    } else {
      onCommandExecute(cmd.command);
      setShowToolsDrawer(false);
    }
  };

  const handleInvokeHelpAI = () => {
    if (onInvokeHelpAI) {
      onInvokeHelpAI();
    } else {
      onSendMessage('/helpai');
    }
    setShowToolsDrawer(false);
  };

  const onlineUsers = users;
  const staffCount = users.filter(u => u.role === 'staff').length;
  const customerCount = users.filter(u => u.role === 'customer' || u.role === 'guest').length;
  const botCount = users.filter(u => u.role === 'bot').length;

  const renderMessage = (msg: ChatMessage) => {
    const isSystem = msg.senderType === 'system';
    const isBot = msg.senderType === 'bot';
    const isSelf = msg.senderId === currentUser.id;
    const targetUser = users.find(u => u.id === msg.senderId);
    const targetRole = targetUser?.role || 'customer';
    const availableActions = msg.senderId !== currentUser.id ? getActionsForUser(currentUser.isStaff, targetRole) : [];
    const isClickable = !isSystem && !isBot && msg.senderId !== currentUser.id && availableActions.length > 0;
    
    // Format timestamp
    const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    // System messages - centered with proper overflow handling for mobile
    if (isSystem) {
      return (
        <div key={msg.id} className="flex justify-center py-1 px-2">
          <div className="bg-primary/10 dark:bg-primary/20 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs text-primary shadow-sm max-w-[95%] sm:max-w-[85%] text-center break-words overflow-hidden">
            <MessageTextWithIcons text={msg.message} />
          </div>
        </div>
      );
    }

    // Bot messages - left aligned with special styling and responsive text
    if (isBot) {
      return (
        <div key={msg.id} className="flex justify-start px-2 sm:px-4 py-0.5">
          <div className="max-w-[90%] sm:max-w-[75%] md:max-w-[65%] lg:max-w-[55%] bg-card rounded-lg rounded-tl-none shadow-sm px-3 py-2 border border-primary/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Bot className="w-3 h-3 text-primary shrink-0" />
              <StaffNameDisplay name={msg.senderName || 'HelpAI'} className="text-[11px] sm:text-xs font-bold text-primary truncate" />
            </div>
            <div className="text-[13px] sm:text-sm whitespace-pre-wrap text-foreground break-words overflow-hidden">{msg.message}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-1 text-right">{timestamp}</div>
          </div>
        </div>
      );
    }

    // WhatsApp-style bubbles - right for self, left for others with responsive text
    return (
      <div key={msg.id} className={cn("flex px-2 sm:px-4 py-0.5", isSelf ? "justify-end" : "justify-start")}>
        <div 
          className={cn(
            "max-w-[90%] sm:max-w-[75%] md:max-w-[65%] lg:max-w-[55%] rounded-lg shadow-sm px-3 py-2",
            isSelf 
              ? "bg-primary/20 dark:bg-primary/30 rounded-tr-none" 
              : "bg-card rounded-tl-none"
          )}
        >
          {/* Show sender name for others */}
          {!isSelf && (
            <div 
              className={`text-[11px] sm:text-xs font-semibold mb-0.5 inline-flex items-center gap-1 truncate max-w-full ${isClickable ? 'text-primary active:opacity-70 cursor-pointer select-none' : 'text-primary'}`}
              data-testid={`message-sender-${msg.id}`}
              onClick={() => isClickable && handleUsernameClick(msg)}
              onTouchStart={() => isClickable && handleUsernameTouchStart(msg)}
              onTouchEnd={() => isClickable && handleUsernameTouchEnd()}
              onTouchCancel={() => isClickable && handleUsernameTouchEnd()}
            >
              <StaffNameDisplay name={msg.senderName || 'Unknown'} />
              {isClickable && <span className="text-[9px] sm:text-[10px] text-muted-foreground">(tap)</span>}
            </div>
          )}
          <div className="text-[13px] sm:text-sm whitespace-pre-wrap text-foreground break-words overflow-hidden">{msg.message}</div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-1 text-right">{timestamp}</div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn(MOBILE_CONFIG.layout.containerBase, "bg-background", className)}>
      {/* Mobile User Action Sheet (triggered by tapping username in messages) */}
      <MobileUserActionSheet
        open={selectedUser !== null}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        username={selectedUser?.username || ''}
        userId={selectedUser?.userId || ''}
        userRole={selectedUser?.role || 'guest'}
        isStaff={currentUser.isStaff}
        onCommandExecute={onCommandExecute}
        onKickUser={onKickUser}
        onSilenceUser={onSilenceUser}
        onGiveVoice={onGiveVoice}
      />

      {/* HEADER - WhatsApp-style gradient, responsive */}
      <div className={cn(MOBILE_CONFIG.layout.headerFlex, "flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b bg-primary text-primary-foreground gap-1 sm:gap-2")}>
        {/* Back Button */}
        <Button
          size="icon"
          variant="ghost"
          className="text-primary-foreground"
          onClick={() => onExit ? onExit() : setLocation("/dashboard")}
          data-testid="button-chatroom-exit"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        {/* Title + Online Badge */}
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
          <span className="text-sm font-bold truncate">{roomName || 'Support Chat'}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary-foreground border-primary/30">
            {onlineUsers.length} online
          </Badge>
        </div>
        
        {/* User List Button */}
        <Button
          size="icon"
          variant="ghost"
          className="text-primary-foreground relative"
          onClick={() => setShowUserDrawer(true)}
          data-testid="button-users-drawer"
        >
          <Users className="h-4 w-4" />
          {onlineUsers.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-accent text-accent-foreground text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
              {onlineUsers.length}
            </span>
          )}
        </Button>
        <MobileResponsiveSheet
          open={showUserDrawer}
          onOpenChange={setShowUserDrawer}
          title="Online Users"
          titleIcon={
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-sm shrink-0">
              <Users className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          }
          subtitle={`${staffCount} staff${botCount > 0 ? ` · ${botCount} bots` : ''} · ${customerCount} customers`}
          side="right"
          headerGradient={true}
          className="px-3 py-3"
        >
          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="space-y-2 pr-2">
              {/* Staff Section */}
              {onlineUsers.filter(u => u.role === 'staff').length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Support Staff</span>
                  </div>
                  {onlineUsers.filter(u => u.role === 'staff').map(user => {
                    const RoleIcon = getRoleIcon(user.role, user.platformRole);
                    const roleColor = getRoleColor(user.role, user.platformRole);
                    const isSelected = selectedUserForAction?.id === user.id;
                    const availableActions = getActionsForUser(currentUser.isStaff, user.role);
                    const canTakeAction = user.id !== currentUser.id && availableActions.length > 0;
                    
                    return (
                      <div key={user.id} className="space-y-1">
                        <Button
                          variant={isSelected ? "secondary" : "ghost"}
                          className="w-full justify-start gap-1.5 px-2 min-w-0"
                          onClick={() => handleUserListClick(user, canTakeAction)}
                          onTouchStart={() => canTakeAction && handleUserListTouchStart(user)}
                          onTouchEnd={handleUserListTouchEnd}
                          onTouchCancel={handleUserListTouchEnd}
                          data-testid={`user-item-${user.id}`}
                        >
                          <RoleIcon className={cn("w-3.5 h-3.5 shrink-0", roleColor)} />
                          <span className="truncate flex-1 text-left text-xs min-w-0">{user.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                            Staff
                          </Badge>
                        </Button>
                        
                        {/* Action Panel */}
                        {isSelected && canTakeAction && (
                          <div className="ml-2 p-2 bg-muted/50 rounded-lg border">
                            <p className="text-xs text-muted-foreground mb-2">Actions:</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {availableActions.map(action => {
                                const ActionIcon = action.icon;
                                return (
                                  <Button
                                    key={action.id}
                                    size="sm"
                                    variant="outline"
                                    className="gap-2 px-2 justify-start w-full"
                                    onClick={() => handleUserAction(action)}
                                    data-testid={`action-${action.id}`}
                                  >
                                    <ActionIcon className={cn("w-3.5 h-3.5 shrink-0", action.color)} />
                                    <span className="text-xs">{action.label}</span>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Bots Section - Customers can interact with bots for help */}
              {onlineUsers.filter(u => u.role === 'bot').length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Assistants</span>
                  </div>
                  {onlineUsers.filter(u => u.role === 'bot').map(user => {
                    const isSelected = selectedUserForAction?.id === user.id;
                    const availableActions = getActionsForUser(currentUser.isStaff, user.role);
                    const canTakeAction = availableActions.length > 0;
                    
                    return (
                      <div key={user.id} className="space-y-1">
                        <Button
                          variant={isSelected ? "secondary" : "ghost"}
                          className="w-full justify-start gap-1.5 px-2 min-w-0"
                          onClick={() => handleUserListClick(user, canTakeAction)}
                          onTouchStart={() => canTakeAction && handleUserListTouchStart(user)}
                          onTouchEnd={handleUserListTouchEnd}
                          onTouchCancel={handleUserListTouchEnd}
                          data-testid={`user-item-${user.id}`}
                        >
                          <Bot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate flex-1 text-left text-xs min-w-0">{user.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                            Bot
                          </Badge>
                        </Button>
                        
                        {/* Action Panel - Customers can interact with bots */}
                        {isSelected && canTakeAction && (
                          <div className="ml-2 p-2 bg-muted/50 rounded-lg border">
                            <p className="text-xs text-muted-foreground mb-2">Actions:</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {availableActions.map(action => {
                                const ActionIcon = action.icon;
                                return (
                                  <Button
                                    key={action.id}
                                    size="sm"
                                    variant="outline"
                                    className="gap-2 px-2 justify-start w-full"
                                    onClick={() => handleUserAction(action)}
                                    data-testid={`action-${action.id}`}
                                  >
                                    <ActionIcon className={cn("w-3.5 h-3.5 shrink-0", action.color)} />
                                    <span className="text-xs">{action.label}</span>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Customers Section */}
              {onlineUsers.filter(u => u.role === 'customer' || u.role === 'guest').length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customers</span>
                  </div>
                  {onlineUsers.filter(u => u.role === 'customer' || u.role === 'guest').map(user => {
                    const RoleIcon = getRoleIcon(user.role, user.platformRole);
                    const roleColor = getRoleColor(user.role, user.platformRole);
                    const isSelected = selectedUserForAction?.id === user.id;
                    const availableActions = getActionsForUser(currentUser.isStaff, user.role);
                    const canTakeAction = user.id !== currentUser.id && availableActions.length > 0;
                    
                    return (
                      <div key={user.id} className="space-y-1">
                        <Button
                          variant={isSelected ? "secondary" : "ghost"}
                          className="w-full justify-start gap-1.5 px-2 min-w-0"
                          onClick={() => handleUserListClick(user, canTakeAction)}
                          onTouchStart={() => canTakeAction && handleUserListTouchStart(user)}
                          onTouchEnd={handleUserListTouchEnd}
                          onTouchCancel={handleUserListTouchEnd}
                          data-testid={`user-item-${user.id}`}
                        >
                          <RoleIcon className={cn("w-3.5 h-3.5 shrink-0", roleColor)} />
                          <span className="truncate flex-1 text-left text-xs min-w-0">{user.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                            User
                          </Badge>
                        </Button>
                        
                        {/* Action Panel - RBAC based */}
                        {isSelected && canTakeAction && (
                          <div className="ml-2 p-2 bg-muted/50 rounded-lg border">
                            <p className="text-xs text-muted-foreground mb-2">Actions for {user.name}:</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {availableActions.map(action => {
                                const ActionIcon = action.icon;
                                return (
                                  <Button
                                    key={action.id}
                                    size="sm"
                                    variant="outline"
                                    className="gap-2 px-2 justify-start w-full"
                                    onClick={() => handleUserAction(action)}
                                    data-testid={`action-${action.id}`}
                                  >
                                    <ActionIcon className={cn("w-3.5 h-3.5 shrink-0", action.color)} />
                                    <span className="text-xs">{action.label}</span>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Empty State */}
              {onlineUsers.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No users online</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </MobileResponsiveSheet>
        
        {/* Home Button */}
        <Button
          size="icon"
          variant="ghost"
          className="text-primary-foreground"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-home"
        >
          <Home className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages Area - WhatsApp-style wallpaper background */}
      <ScrollArea className={cn(MOBILE_CONFIG.layout.contentFlex, "bg-muted/50 dark:bg-background")}>
        <div className="min-h-full py-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-muted-foreground text-sm">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 gap-4">
              <Bot className="w-12 h-12 text-primary opacity-50" />
              <div className="text-center">
                <p className="text-muted-foreground text-sm">No messages yet.</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {currentUser.isStaff 
                    ? "Tap the tools button to access commands" 
                    : "HelpAI is ready to assist you!"}
                </p>
              </div>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* INPUT AREA with tools - responsive */}
      <div className={cn(MOBILE_CONFIG.layout.footerFlex, "border-t bg-card")}>
        {/* Action Toolbar (staff only) */}
        {currentUser.isStaff && (
          <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 border-b bg-muted/50 overflow-x-auto">
            {/* HelpAI Button */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 px-2 bg-primary/10 border-primary/30 text-primary flex-shrink-0"
              onClick={handleInvokeHelpAI}
              data-testid="button-helpai"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="text-xs">HelpAI</span>
            </Button>
            
            {/* Quick Commands */}
            {QUICK_COMMANDS.map(cmd => {
              const CmdIcon = cmd.icon;
              return (
                <Button
                  key={cmd.id}
                  size="sm"
                  variant="ghost"
                  className="gap-1 px-2 flex-shrink-0"
                  onClick={() => handleQuickCommand(cmd)}
                  data-testid={`cmd-${cmd.id}`}
                >
                  <CmdIcon className="w-3.5 h-3.5" />
                  <span className="text-xs">{cmd.label}</span>
                </Button>
              );
            })}
            
            {/* More Tools Drawer */}
            <UniversalModal open={showToolsDrawer} onOpenChange={setShowToolsDrawer}>
              <UniversalModalTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 px-2 flex-shrink-0"
                  data-testid="button-more-tools"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span className="text-xs">More</span>
                </Button>
              </UniversalModalTrigger>
              <UniversalModalContent side="bottom" className="h-auto max-h-[60vh]">
                <UniversalModalHeader className="pb-2">
                  <UniversalModalTitle className="flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Support Tools
                  </UniversalModalTitle>
                </UniversalModalHeader>
                <div className="grid grid-cols-3 gap-2 py-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={handleInvokeHelpAI}
                  >
                    <Bot className="w-5 h-5 text-primary" />
                    <span className="text-xs">Ask HelpAI</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={() => { onCommandExecute('/intro'); setShowToolsDrawer(false); }}
                  >
                    <Headphones className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs">Introduce</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={() => { onCommandExecute('/close'); setShowToolsDrawer(false); }}
                  >
                    <XCircle className="w-5 h-5 text-destructive" />
                    <span className="text-xs">Close</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={() => { setInputMessage('/ask '); setShowToolsDrawer(false); }}
                  >
                    <Brain className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs">Ask Trinity</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={() => { onCommandExecute('/status'); setShowToolsDrawer(false); }}
                  >
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <span className="text-xs">Status</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-col gap-1 py-4"
                    onClick={() => setShowUserDrawer(true)}
                  >
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs">Users</span>
                  </Button>
                </div>
              </UniversalModalContent>
            </UniversalModal>
          </div>
        )}
        
        {/* Message Input - WhatsApp-style, responsive */}
        <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3 p-2 sm:p-3 bg-muted dark:bg-card">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 text-sm sm:text-base rounded-full bg-background dark:bg-muted border-0"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputMessage.trim()}
            data-testid="button-send"
            className="flex-shrink-0 rounded-full bg-primary text-primary-foreground"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
