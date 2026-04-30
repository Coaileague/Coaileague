import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy, type TouchEvent as ReactTouchEvent } from "react";
import { TrinityArrowMark } from "@/components/trinity-logo";
import { secureFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useNavigationProtection } from "@/hooks/use-navigation-protection";
import { useIsMobile } from "@/hooks/use-mobile"; // CONSOLIDATED: Use single mobile detection hook
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// ScrollArea removed - using native overflow-auto to fix Radix ref thrashing
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Eye,
  Send,
  Users,
  MessageSquare,
  Shield,
  Crown,
  UserCog,
  Wrench,
  Settings,
  Power,
  HelpCircle,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Coffee,
  Star,
  Building2,
  Bot,
  Sparkles,
  Menu,
  X,
  UserCheck,
  FileText,
  Camera,
  PenTool,
  ArrowRight,
  Ban,
  AlertTriangle,
  Timer,
  UserX,
  TrendingUp,
  Key,
  Mail,
  ListChecks,
  Tag,
  ClipboardList,
  History,
  MessageCircle,
  ArrowUpCircle,
  RefreshCw,
  PackageCheck,
  FileSearch,
  Home,
  Check,
  ArrowLeft,
  Lock,
  Unlock,
  CheckCheck,
  Reply,
  Pencil,
  Forward,
  Pin,
  SmilePlus,
  Search as SearchIcon,
  ArrowDown,
  MoreVertical,
  Paperclip,
  Image as ImageIcon,
  FileUp,
  XCircle,
  PhoneOff,
  ThumbsUp,
  Heart,
  Laugh,
  Frown,
  HandHeart,
} from 'lucide-react';;

const REACTION_ICONS: Record<string, { icon: typeof ThumbsUp; label: string }>= {
 "thumbsup": { icon: ThumbsUp, label: "Like" },
 "heart": { icon: Heart, label: "Love" },
 "laugh": { icon: Laugh, label: "Haha" },
 "surprise": { icon: AlertCircle, label: "Wow" },
 "sad": { icon: Frown, label: "Sad" },
 "thanks": { icon: HandHeart, label: "Thanks" },
};
const QUICK_REACTIONS = Object.keys(REACTION_ICONS);
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { SecureRequestDialog } from "@/components/secure-request-dialog";
import { BrandedConfirmDialog } from "@/components/branded-input-dialog";
import { KickDialog, SilenceDialog, ResetEmailDialog, ReportIssueDialog } from "@/components/moderation-dialogs";
import { HelpDeskCommandBar } from "@/components/helpdesk-command-bar";
import { HelpCommandPanel } from "@/components/help-command-panel";
import { QueueManagerPanel } from "@/components/queue-manager-panel";
import { TutorialManagerPanel } from "@/components/tutorial-manager-panel";
import { PriorityManagerPanel } from "@/components/priority-manager-panel";
import { AccountSupportPanel } from "@/components/account-support-panel";
import { MotdDialog } from "@/components/motd-dialog";
import { AnimatedStatusBar } from "@/components/animated-status-bar";
import { ChatAgreementModal } from "@/components/chat-agreement-modal";
import { UserDiagnosticsPanel } from "@/components/user-diagnostics-panel";
import { CoAIleagueAiTester } from "@/components/helpos-ai-tester";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CHAT_BUBBLE_CONFIG } from "@/config/chatBubble";
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
import type { ChatMessage } from "@shared/schema";
import { HelpDeskProgressHeader } from "@/components/helpdesk-progress-header";
import { AgentToolbelt } from "@/components/agent-toolbelt";
import { MessageAttachment } from "@/components/message-attachment";
import { TicketContextPanel } from "@/components/ticket-context-panel";
import { TicketPipelineVisualizer } from "@/components/ticket-pipeline-visualizer";
import { 
 getInitialPipelineState, 
 advancePipeline, 
 setStepError,
 PIPELINE_TIMING,
 type PipelineState 
} from "@/config/ticketWorkflow";
import { sanitizeMessage } from "@/lib/sanitize";
import { hasManagerAccess } from "@/config/mobileConfig";
import { UniversalChatLayout } from "@/components/universal-chat-layout";
import { LiveRoomBrowser } from "@/components/live-room-browser";
import { 
 HELP_DESK_CONFIG as CHAT_CONFIG, 
 MAIN_ROOM_ID,
 sortUsersByRole,
 generateSessionId,
 getStoredEscalationData,
 getStoredGuestIntakeData,
 saveGuestIntakeData,
 getStoredTicketNumber,
 saveTicketNumber,
 type GuestIntakeData,
 type SecureRequestData,
 type UserConnectionStatus,
 type RoomStatus,
} from "@/config/helpDeskConfig";

function HDTypingBubble({ name }: { name: string }) {
 return (
 <div className="flex items-start gap-1.5 py-0.5" data-testid="typing-indicator">
 <span className="text-[10px] text-muted-foreground mb-0.5 px-2">{name}</span>
 <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
 <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1.2s" }} />
 <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "200ms", animationDuration: "1.2s" }} />
 <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "400ms", animationDuration: "1.2s" }} />
 </div>
 </div>
 );
}

function HDFormattedMessage({ text, className }: { text: string; className?: string }) {
 const parts = useMemo(() =>{
 const tokens: { type: "text" | "bold" | "italic" | "code" | "link"; content: string; href?: string }[] = [];
 const regex = /(\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*([^*]+)\*|`([^`]+)`|(https?:\/\/[^\s<>[\]()]+))/g;
 let lastIndex = 0;
 let match;
 while ((match = regex.exec(text)) !== null) {
 if (match.index >lastIndex) {
 tokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
 }
 if (match[2] || match[3]) {
 tokens.push({ type: "bold", content: match[2] || match[3] });
 } else if (match[4] || match[5]) {
 tokens.push({ type: "italic", content: match[4] || match[5] });
 } else if (match[6]) {
 tokens.push({ type: "code", content: match[6] });
 } else if (match[7]) {
 tokens.push({ type: "link", content: match[7], href: match[7] });
 }
 lastIndex = match.index + match[0].length;
 }
 if (lastIndex < text.length) {
 tokens.push({ type: "text", content: text.slice(lastIndex) });
 }
 return tokens.length >0 ? tokens : [{ type: "text" as const, content: text }];
 }, [text]);

 return (
 <span className={className}>
 {parts.map((part, i) =>{
 switch (part.type) {
 case "bold": return <strong key={i}>{part.content}</strong>;
 case "italic": return <em key={i}>{part.content}</em>;
 case "code": return <code key={i} className="px-1 py-0.5 bg-black/10 dark:bg-card/10 rounded text-[12px] font-mono">{part.content}</code>;
 case "link": return <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="underline break-all">{part.content}</a>;
 case "text":
 default: return <span key={i}>{part.content}</span>;
 }
 })}
 </span>
 );
}

function HDQuickReactionHoverBar({
 messageId,
 conversationId,
 isOwn,
 onReply,
 onMoreActions,
}: {
 messageId: string;
 conversationId: string;
 isOwn: boolean;
 onReply: () =>void;
 onMoreActions: () =>void;
}) {
 const { toast } = useToast();
 const HD_QUICK_REACTIONS = ["thumbsup", "heart", "laugh", "surprise"];
 const toggleReaction = useMutation({
 mutationFn: (reactionKey: string) =>apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji: reactionKey }),
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'reactions'] });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Reaction Failed',
 description: error.message || 'Something went wrong. Please try again.',
 variant: 'destructive',
 });
 },
 });

 return (
 <div className={cn(
 "absolute -top-8 flex items-center gap-0.5 bg-card border border-border rounded-full shadow-lg px-1.5 py-0.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity",
 isOwn ? "right-0" : "left-0"
 )} data-testid={`quick-react-bar-${messageId}`}>
 {HD_QUICK_REACTIONS.map((key) =>{
 const IconComp = REACTION_ICONS[key]?.icon;
 return IconComp ? (
 <button key={key} className="hover:scale-125 transition-transform p-0.5 leading-none text-muted-foreground hover:text-foreground"
 onClick={(e) =>{ e.stopPropagation(); toggleReaction.mutate(key); }}
 title={REACTION_ICONS[key].label}>
 <IconComp className="h-3.5 w-3.5" />
 </button>
 ) : null;
 })}
 <button className="p-0.5 hover:scale-110 transition-transform text-muted-foreground"
 onClick={(e) =>{ e.stopPropagation(); onReply(); }}>
 <Reply className="h-3.5 w-3.5" />
 </button>
 <button className="p-0.5 hover:scale-110 transition-transform text-muted-foreground"
 onClick={(e) =>{ e.stopPropagation(); onMoreActions(); }}>
 <MoreVertical className="h-3.5 w-3.5" />
 </button>
 </div>
 );
}

function HDScrollToBottomFab({ containerRef, newCount }: { containerRef: React.RefObject<HTMLDivElement | null>; newCount: number }) {
 const [show, setShow] = useState(false);
 useEffect(() =>{
 const el = containerRef.current;
 if (!el) return;
 const handleScroll = () =>{
 const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
 setShow(distFromBottom >150);
 };
 el.addEventListener("scroll", handleScroll, { passive: true });
 return () =>el.removeEventListener("scroll", handleScroll);
 }, [containerRef]);
 return show ? (
 <button className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full shadow-lg p-2 z-30 flex items-center gap-1.5 hover-elevate transition-colors"
 onClick={() =>containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })}
 data-testid="button-scroll-bottom">
 <ArrowDown className="h-4 w-4" />
 {newCount >0 && <Badge variant="destructive" className="text-[10px] px-1.5 no-default-hover-elevate no-default-active-elevate">{newCount}</Badge>}
 </button>
 ) : null;
}

function HDUnreadDivider() {
 return (
 <div className="flex items-center gap-3 py-2" data-testid="unread-divider">
 <div className="flex-1 h-px bg-destructive/40" />
 <span className="text-xs text-destructive font-medium px-2"> New Messages</span>
 <div className="flex-1 h-px bg-destructive/40" />
 </div>
 );
}

interface HelpDeskProps {
 forceMobileLayout?: boolean;
 roomId?: string;
 roomName?: string;
 onBack?: () =>void;
}

// Desktop IRC/MSN-style 3-column chatroom with CoAIleague professional branding
// SIMPLIFIED: Uses consolidated useIsMobile() hook instead of bespoke detection
export function HelpDesk(props?: HelpDeskProps & any) {
 // CONSOLIDATED: Use single mobile detection hook (eliminates duplicate resize listeners)
 const isMobileView = useIsMobile();
 
 const { forceMobileLayout = false, roomId: propRoomId, roomName: propRoomName, onBack } = props || {};
 const shouldUseMobileLayout = forceMobileLayout || isMobileView;
 const { user, isAuthenticated } = useAuth();
 const { toast } = useToast();
 const [, navigate] = useLocation(); // For navigation buttons
 const [inputMessage, setInputMessage] = useState("");
 const [showSlashMenu, setShowSlashMenu] = useState(false);
 const [slashMenuIndex, setSlashMenuIndex] = useState(0);
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
 const readReceiptsFallback = useMemo(() =>new Map<string, { readByName: string; readAt: Date }>(), []);
 const [silenceDialogUser, setSilenceDialogUser] = useState<{ userId: string; userName: string } | null>(null);
 const [resetEmailDialogUser, setResetEmailDialogUser] = useState<{ userId: string; userName: string } | null>(null);
 const [reportIssueDialogUser, setReportIssueDialogUser] = useState<{ userId: string; userName: string } | null>(null);
 const [showTutorial, setShowTutorial] = useState(false);
 const [showRoomStatus, setShowRoomStatus] = useState(false);
 const [roomStatusControl, setRoomStatusControl] = useState<"open" | "closed" | "maintenance">("open");
 const [roomStatusMessage, setRoomStatusMessage] = useState("");
 const [showControlsMenu, setShowControlsMenu] = useState(false);
 const [showBannerManager, setShowBannerManager] = useState(false);
 const [showHelpPanel, setShowHelpPanel] = useState(false);
 const [endChatConfirmOpen, setEndChatConfirmOpen] = useState(false);
 const [showQueuePanel, setShowQueuePanel] = useState(false);
 const [showPriorityPanel, setShowPriorityPanel] = useState(false);
 const [showAccountPanel, setShowAccountPanel] = useState(false);
 const [aiEnabled, setAiEnabled] = useState(false);
 const [showMotd, setShowMotd] = useState(false);
 const [motdData, setMotdData] = useState<any>(null);
 // REMOVED: Agreement and terms dialogs - chatroom is now publicly accessible without barriers
 const [showDiagnostics, setShowDiagnostics] = useState(false);
 const [diagnosticsUserId, setDiagnosticsUserId] = useState<string | null>(null);
 const [roomClosed, setRoomClosed] = useState(false);
 const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; message: string } | null>(null);
 const [editingMessage, setEditingMessage] = useState<{ id: string; message: string } | null>(null);
 const [lightboxData, setLightboxData] = useState<{ src: string; senderName?: string; timestamp?: string; filename?: string } | null>(null);
 const [chatSearchQuery, setChatSearchQuery] = useState("");
 const [showChatSearch, setShowChatSearch] = useState(false);
 const [pendingAttachment, setPendingAttachment] = useState<{
 file: File;
 previewUrl: string | null;
 type: 'image' | 'video' | 'audio' | 'document';
 } | null>(null);
 const [isUploading, setIsUploading] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);
 
 // Generate or get session ID for tracking (using config helper)
 const [sessionId] = useState(() =>generateSessionId());

 // Read route params for /chatrooms/:roomId or /chat/:roomId pattern
 const [, chatroomsParams] = useRoute("/chatrooms/:roomId");
 const [, chatParams] = useRoute("/chat/:roomId");
 const routeRoomId = chatroomsParams?.roomId || chatParams?.roomId;

 // Read URL parameters for direct conversation links (from escalation)
 // Memoize to prevent new object creation on every render (Guru Mode: Stable Dependencies)
 const urlConversationId = useMemo(() =>{
 const params = new URLSearchParams(window.location.search);
 return params.get('conversationId');
 }, []);
 const urlGuestToken = useMemo(() =>{
 const params = new URLSearchParams(window.location.search);
 return params.get('guestToken');
 }, []);
 
 // Check sessionStorage for escalation data (using config helper)
 // Memoize to prevent recalculation on every render
 const parsedEscalation = useMemo(() =>getStoredEscalationData(), []);
 
 // Guest intake form state (using config helper)
 const [showGuestIntakeForm, setShowGuestIntakeForm] = useState(!user); // Show for guests on load
 const [guestIntakeData, setGuestIntakeData] = useState<GuestIntakeData>(() =>getStoredGuestIntakeData());
 const [hasCompletedIntake, setHasCompletedIntake] = useState(false);

 // Check if form is complete and valid
 const isFormComplete = () =>{
 const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
 return (
 guestIntakeData.name.trim() &&
 emailRegex.test(guestIntakeData.email) &&
 guestIntakeData.issueType &&
 guestIntakeData.problemDescription.trim()
 );
 };

 // Auto-save guest intake data to session storage whenever it changes
 useEffect(() =>{
 saveGuestIntakeData(guestIntakeData);
 }, [guestIntakeData]);
 const [ticketNumber, setTicketNumber] = useState<string | null>(() =>getStoredTicketNumber());
 const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
 const [queueJoinTime] = useState(() =>new Date());
 const [queueUpdateInterval, setQueueUpdateInterval] = useState<NodeJS.Timeout | null>(null);
 
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const scrollContainerRef = useRef<HTMLDivElement>(null);
 const [newMsgCount, setNewMsgCount] = useState(0);
 const [lastReadIndex, setLastReadIndex] = useState(-1);
 const [swipeReplyId, setSwipeReplyId] = useState<string | null>(null);
 const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
 const lastTapRef = useRef<{ time: number; msgId: string } | null>(null);
 const initialLoadCountRef = useRef<number>(-1);
 const newMessageIdsRef = useRef<Set<string>>(new Set());
 
 // User state tracking for contextual menus
 const [silencedUsers, setSilencedUsers] = useState<Set<string>>(new Set());
 const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
 const [documentRequests, setDocumentRequests] = useState<Map<string, Set<string>>>(new Map());
 // Map structure: userId => Set of request types ('authenticate', 'document', 'photo', 'signature', 'info')
 
 // Enhanced HelpDesk state
 const [ticketStatus, setTicketStatus] = useState<'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated'>('investigating');
 const [showContextPanel, setShowContextPanel] = useState(true);
 const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

 // Star rating widget state (H005 - HelpAI rating flow)
 const [showRatingWidget, setShowRatingWidget] = useState(false);
 const [helpaiRating, setHelpaiRating] = useState<number>(0);
 const [ratingHover, setRatingHover] = useState<number>(0);
 const [ratingSubmitted, setRatingSubmitted] = useState(false);
 const [helpaiSessionId, setHelpaiSessionId] = useState<string | null>(() =>{
 try { return sessionStorage.getItem('helpai_session_id'); } catch { return null; }
 });
 
 // Mobile room selection - show room browser first before chat
 const [mobileSelectedRoom, setMobileSelectedRoom] = useState<{ id: string; name: string } | null>(null);
 const [showMobileRoomBrowser, setShowMobileRoomBrowser] = useState(true);
 
 // Determine the conversation ID to join (prop >route param >mobile selection > URL param >escalation >default)
 // Memoize to ensure stable reference for WebSocket hook (Guru Mode: Prevent Feedback Loop)
 const conversationToJoin = useMemo(() =>{
 return propRoomId || routeRoomId || mobileSelectedRoom?.id || urlConversationId || parsedEscalation?.conversationId || MAIN_ROOM_ID;
 }, [propRoomId, routeRoomId, mobileSelectedRoom?.id, urlConversationId, parsedEscalation?.conversationId]);
 

 // No IRC-style messages - users see terms/agreement first, then optional MOTD dialog if set by admins
 const isGuest = !user;
 
 const userName = user?.firstName && user?.lastName 
 ? `${user.firstName} ${user.lastName}` 
 : guestIntakeData.name || parsedEscalation?.guestName || user?.email?.split('@')[0] || 'Guest';

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
 isInTriage,
 justGotVoice,
 ticketClosed,
 ticketClosedReason,
 roomStatus: wsRoomStatus,
 readReceipts: wsReadReceipts,
 } = useChatroomWebSocket(
 user?.id || `guest-${sessionId}`, // Use sessionId for guests so WebSocket connects
 userName,
 conversationToJoin, // Join escalated conversation or default main room
 (request) =>{
 // When staff requests secure info, open the dialog (if moderation enabled)
 if (CHAT_CONFIG.moderation.allowBan || CHAT_CONFIG.moderation.allowSilence || CHAT_CONFIG.moderation.allowKick) {
 setSecureRequest({
 type: request.type as any,
 requestedBy: request.requestedBy,
 message: request.message,
 });
 }
 }
 );

 const readReceipts = wsReadReceipts || readReceiptsFallback;

 // Navigation protection - prevent accidental disconnects from live chat
 useNavigationProtection({
 currentRoute: '/chatrooms',
 shouldProtect: isConnected || messages.length >0,
 });

 // Cleanup queue update interval on unmount or when guest gets voice
 // Note: queueUpdateInterval removed from deps to prevent infinite loop
 const queueUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
 queueUpdateIntervalRef.current = queueUpdateInterval;
 
 useEffect(() =>{
 if (justGotVoice && queueUpdateIntervalRef.current) {
 clearInterval(queueUpdateIntervalRef.current);
 setQueueUpdateInterval(null);
 // Send notification that agent is helping
 sendMessage(
 CHAT_CONFIG.messages.ticketAssigned.message(ticketNumber || 'PENDING'),
 CHAT_CONFIG.messages.ticketAssigned.sender,
 'system'
 );
 }
 
 return () =>{
 if (queueUpdateIntervalRef.current) clearInterval(queueUpdateIntervalRef.current);
 };
 }, [justGotVoice]);

 // Enhanced connection state tracking with refs to prevent infinite loops
 const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error' | 'denied'>('disconnected');
 const [apiErrors, setApiErrors] = useState<string[]>([]);
 // Refs to track previous values and prevent unnecessary state updates (Guru Mode: State Guard)
 const prevConnectionStatusRef = useRef<string>('disconnected');
 const prevApiErrorsRef = useRef<string>('');

 const { data: roomData, error: roomError } = useQuery({
 queryKey: ['/api/helpdesk/room/helpdesk'],
 enabled: isAuthenticated,
 retry: 1,
 queryFn: () => apiFetch('/api/helpdesk/room/helpdesk', AnyResponse),
 });

 // REMOVED MANDATORY AGREEMENT CHECK - Chatroom is now publicly accessible
 // Agreement modal is now optional (staff can enable if needed for compliance)
 // Support staff are auto-authenticated and bypass all entry forms
 // Audit trails still maintained via sessionId tracking in websocket connections
 
 // END-USER PRIORITY SYSTEM (Design Note):
 // Queue weighting is configured in server/services/helpOsQueue.ts
 // End users get priority over support staff during peak hours via weighted round-robin
 // Staff join requests are demoted when end-user concurrency threshold is reached

 const { data: queueData, error: queueError } = useQuery<any[]>({
 queryKey: ['/api/helpdesk/queue'],
 enabled: isAuthenticated,
 refetchInterval: 5000,
 retry: 1,
 // @ts-expect-error — TS migration: fix in refactoring sprint
 queryFn: () => apiFetch('/api/helpdesk/queue', AnyResponse),
 });

 // Fetch MOTD — fires after WebSocket connects so it triggers on every session join
 const { data: motdResponse, error: motdError } = useQuery<{ motd: any, acknowledged: boolean }>({
 queryKey: ['/api/helpdesk/motd', isConnected],
 queryFn: async () => {
   const res = await fetch('/api/helpdesk/motd', { credentials: 'include' });
   if (!res.ok) throw new Error('Failed to fetch MOTD');
   return res.json();
 },
 enabled: isAuthenticated && isConnected,
 retry: 1,
 staleTime: 0,
 });

 // Fetch promotional banners (staff only - API has authorization)
 const { data: promotionalBannersRaw = [] } = useQuery<any[]>({
 queryKey: ['/api/promotional-banners'],
 enabled: isAuthenticated,
 retry: 1,
 // @ts-expect-error — TS migration: fix in refactoring sprint
 queryFn: () => apiFetch('/api/promotional-banners', AnyResponse),
 });

 // Transform promotional banners to match BannerManager format
 // @ts-expect-error — TS migration: fix in refactoring sprint
 const promotionalBanners = promotionalBannersRaw.map((banner: any) =>({
 id: banner.id,
 text: banner.message,
 type: 'promo' as const,
 link: banner.ctaLink,
 enabled: banner.isActive,
 }));

 // Banner management mutations
 const createBannerMutation = useMutation({
 mutationFn: async (data: { message: string; ctaText?: string; ctaLink?: string; isActive?: boolean }) =>{
 return await apiRequest('POST', '/api/promotional-banners', data);
 },
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
 toast({ title: "Banner Created" });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Create Banner Failed',
 description: error.message || 'Something went wrong.',
 variant: 'destructive',
 });
 },
 });

 const updateBannerMutation = useMutation({
 mutationFn: async ({ id, data }: { id: string; data: any }) =>{
 return await apiRequest('PATCH', `/api/promotional-banners/${id}`, data);
 },
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
 toast({ title: "Banner Updated" });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Update Banner Failed',
 description: error.message || 'Something went wrong.',
 variant: 'destructive',
 });
 },
 });

 const deleteBannerMutation = useMutation({
 mutationFn: async (id: string) =>{
 return await apiRequest('DELETE', `/api/promotional-banners/${id}`);
 },
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners'] });
 toast({ title: "Banner Deleted" });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Delete Banner Failed',
 description: error.message || 'Something went wrong.',
 variant: 'destructive',
 });
 },
 });

 // Fetch selected user context for profile/diagnostics
 const { data: userContext, error: userContextError, isError: userContextIsError, isLoading: userContextIsLoading } = useQuery<any>({
 queryKey: ['/api/helpdesk/user-context', selectedUserId],
 queryFn: async () =>{
 const res = await secureFetch(`/api/helpdesk/user-context/${selectedUserId}`, {
 credentials: 'include',
 });
 if (!res.ok) {
 const errorData = await res.json().catch(() =>({ error: 'Failed to fetch user context' }));
 throw errorData;
 }
 return res.json();
 },
 enabled: !!selectedUserId && isAuthenticated,
 retry: 1,
 });

 // Show MOTD dialog if there's an active MOTD that hasn't been acknowledged
 useEffect(() =>{
 if (motdResponse && motdResponse.motd && !motdResponse.acknowledged) {
 setMotdData(motdResponse.motd);
 setShowMotd(true);
 }
 }, [motdResponse]);

 // Monitor connection and API health - Make server more self-aware
 // Guru Mode: State Guard pattern to prevent infinite loops
 useEffect(() =>{
 const errors: string[] = [];
 
 // Only check for CRITICAL API errors (non-critical errors like missing MOTD table are suppressed)
 if (roomError) errors.push('Room unavailable');
 // Suppress non-critical database schema errors from UI:
 // - agreementError (optional feature)
 // - queueError (informational only)
 // - motdError (optional feature)
 
 // Determine overall connection status
 let newStatus: 'connected' | 'disconnected' | 'error' | 'denied' = 'connected';
 let newErrors: string[] = [];
 
 if (!isConnected) {
 newStatus = 'disconnected';
 } else if (errors.length >0) {
 // Connected to WebSocket but API is failing
 newStatus = 'error';
 newErrors = errors;
 } else if (onlineUsers.length === 0 && isConnected) {
 // Connected but no users (possible server issue)
 newStatus = 'error';
 newErrors = ['No users detected'];
 } else if (roomData && (roomData as any).status === 'closed') {
 newStatus = 'denied';
 newErrors = ['Chat room is closed'];
 } else {
 newStatus = 'connected';
 newErrors = [];
 }
 
 // State Guard: Only update if values actually changed (prevents infinite loop)
 const errorsKey = newErrors.join(',');
 if (prevConnectionStatusRef.current !== newStatus) {
 prevConnectionStatusRef.current = newStatus;
 setConnectionStatus(newStatus);
 }
 if (prevApiErrorsRef.current !== errorsKey) {
 prevApiErrorsRef.current = errorsKey;
 setApiErrors(newErrors);
 }
 }, [isConnected, roomError, queueError, motdError, onlineUsers.length, roomData]);

 // MOTD acknowledgment mutation
 const acknowledgeMOTD = useMutation({
 mutationFn: async (motdId: string) =>{
 return await apiRequest('POST', '/api/helpdesk/motd/acknowledge', {
 motdId,
 });
 },
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/helpdesk/motd'] });
 setShowMotd(false);
 toast({
 title: "Welcome to HelpDesk!",
 description: "You can now access the support chat powered by Trinity",
 });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Acknowledge MOTD Failed',
 description: error.message || 'Something went wrong.',
 variant: 'destructive',
 });
 },
 });

 // Room status update mutation
 const toggleRoomStatusMutation = useMutation({
 mutationFn: async ({ status, statusMessage }: { status: string; statusMessage?: string }) =>{
 return await apiRequest('POST', '/api/helpdesk/room/helpdesk/status', {
 status,
 statusMessage,
 });
 },
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/helpdesk/room/helpdesk'] });
 setShowRoomStatus(false);
 toast({
 title: "Room Status Updated",
 description: `HelpDesk is now ${roomStatusControl}`,
 });
 },
 onError: () =>{
 toast({
 title: "Error",
 description: "Failed to update room status",
 variant: "destructive",
 });
 },
 });

 // Room lifecycle state sync from WebSocket
 const workspaceRole = user?.workspaceRole as string | undefined;
 const userPlatformRoleForAccess = (user as any)?.platformRole as string | undefined;
 const canManageRooms = hasManagerAccess(workspaceRole) || 
 ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(userPlatformRoleForAccess || '');

 // Initial room status hydration from room list cache
 const { data: roomListData } = useQuery<{ rooms: any[] }>({
 queryKey: ['/api/chat/rooms'],
 enabled: !!conversationToJoin && conversationToJoin !== MAIN_ROOM_ID,
 staleTime: 30000,
 // @ts-expect-error — TS migration: fix in refactoring sprint
 queryFn: () => apiFetch('/api/chat/rooms', AnyResponse),
 });

 useEffect(() =>{
 // @ts-expect-error — TS migration: fix in refactoring sprint
 if (roomListData?.rooms && conversationToJoin) {
 // @ts-expect-error — TS migration: fix in refactoring sprint
 const room = roomListData.rooms.find((r: any) =>
 r.roomId === conversationToJoin || r.id === conversationToJoin
 );
 if (room?.status === 'closed') {
 setRoomClosed(true);
 }
 }
 }, [roomListData, conversationToJoin]);

 useEffect(() =>{
 if (wsRoomStatus === 'closed') {
 setRoomClosed(true);
 } else if (wsRoomStatus === 'open' || wsRoomStatus === 'active') {
 setRoomClosed(false);
 }
 }, [wsRoomStatus]);

 const closeRoomMutation = useMutation({
 mutationFn: async (reason?: string) =>{
 return await apiRequest('POST', `/api/chat/rooms/${conversationToJoin}/close`, { reason });
 },
 onSuccess: () =>{
 setRoomClosed(true);
 queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
 toast({ title: "Room Closed", description: "This room has been closed. No new messages can be sent." });
 },
 onError: (error: any) =>{
 toast({ title: "Error", description: error.message || "Failed to close room", variant: "destructive" });
 },
 });

 const reopenRoomMutation = useMutation({
 mutationFn: async (reason?: string) =>{
 return await apiRequest('POST', `/api/chat/rooms/${conversationToJoin}/reopen`, { reason });
 },
 onSuccess: () =>{
 setRoomClosed(false);
 queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
 toast({ title: "Room Reopened", description: "This room is now active. Messages can be sent again." });
 },
 onError: (error: any) =>{
 toast({ title: "Error", description: error.message || "Failed to reopen room", variant: "destructive" });
 },
 });

 const { data: reactionsData } = useQuery({
 queryKey: ['/api/chat/manage/conversations', sessionId, 'reactions'],
 staleTime: 1000 * 15,
 refetchInterval: 1000 * 30,
 enabled: messages.length >0,
 queryFn: () => apiFetch(`/api/chat/manage/conversations/${sessionId}/reactions`, AnyResponse),
 });
 const reactionsMap = (reactionsData as any)?.reactions || {};

 const { data: pinnedData } = useQuery({
 queryKey: ['/api/chat/manage/conversations', sessionId, 'pinned'],
 staleTime: 1000 * 60,
 queryFn: () => apiFetch(`/api/chat/manage/conversations/${sessionId}/pinned`, AnyResponse),
 });
 const pinnedMessages = (pinnedData as any)?.messages || [];

 const { data: chatSearchResults } = useQuery({
 queryKey: [`/api/chat/manage/conversations/${sessionId}/search`, { q: chatSearchQuery }],
 enabled: chatSearchQuery.length >= 2,
 staleTime: 1000 * 10,
 queryFn: () => apiFetch(`/api/chat/manage/conversations/${sessionId}/search?q=${encodeURIComponent(chatSearchQuery)}`, AnyResponse),
 });
 const searchHits = (chatSearchResults as any)?.messages || [];
 const searchHitIds = new Set(searchHits.map((m: any) =>m.id));

 const editMessageMutation = useMutation({
 mutationFn: ({ messageId, message }: { messageId: string; message: string }) =>
 apiRequest("PATCH", `/api/chat/manage/messages/${messageId}/edit`, { message }),
 onSuccess: () =>{
 toast({ title: "Message edited" });
 setEditingMessage(null);
 },
 onError: (error: Error) =>{
 toast({
 title: 'Edit Failed',
 description: error.message || 'Something went wrong. Please try again.',
 variant: 'destructive',
 });
 },
 });

 const toggleReactionMutation = useMutation({
 mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
 apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji }),
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', sessionId, 'reactions'] });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Reaction Failed',
 description: error.message || 'Something went wrong. Please try again.',
 variant: 'destructive',
 });
 },
 });

 const togglePinMutation = useMutation({
 mutationFn: (messageId: string) =>
 apiRequest("POST", `/api/chat/manage/messages/${messageId}/pin`),
 onSuccess: () =>{
 queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', sessionId, 'pinned'] });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Pin Failed',
 description: error.message || 'Something went wrong. Please try again.',
 variant: 'destructive',
 });
 },
 });

 const forwardMessageMutation = useMutation({
 mutationFn: ({ messageId, targetConversationId }: { messageId: string; targetConversationId: string }) =>
 apiRequest("POST", `/api/chat/manage/messages/${messageId}/forward`, { targetConversationId }),
 onSuccess: () =>{
 toast({ title: "Message forwarded" });
 },
 onError: (error: Error) =>{
 toast({
 title: 'Forward Failed',
 description: error.message || 'Something went wrong. Please try again.',
 variant: 'destructive',
 });
 },
 });

 const getDateDividerLabel = (dateStr: string) =>{
 const date = new Date(dateStr);
 const today = new Date();
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 if (date.toDateString() === today.toDateString()) return "Today";
 if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
 return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
 };

 // 7-step pipeline animation helper - uses configurable timing
 const animatePipelineStep = useCallback((state: PipelineState): Promise<PipelineState>=>{
 return new Promise((resolve) =>{
 const nextState = advancePipeline(state);
 setPipelineState(nextState);
 setTimeout(() =>resolve(nextState), PIPELINE_TIMING.stepDelay);
 });
 }, []);

 // Support ticket creation mutation with 7-step pipeline visualization
 const createSupportTicketMutation = useMutation({
 mutationFn: async () =>{
 // Step 1: TRIGGER - Ticket submission received
 let state = getInitialPipelineState();
 setPipelineState(state);
 await new Promise(r =>setTimeout(r, PIPELINE_TIMING.initialDelay));
 
 // Step 2: FETCH - Loading context
 state = await animatePipelineStep(state);
 
 // Step 3: VALIDATE - Verifying data
 state = await animatePipelineStep(state);
 
 // Step 4: PROCESS - AI categorization (actual API call happens here)
 state = await animatePipelineStep(state);
 const result = await apiRequest('POST', '/api/support/create-ticket', {
 subject: guestIntakeData.issueType,
 description: guestIntakeData.problemDescription,
 userEmail: guestIntakeData.email,
 userName: guestIntakeData.name,
 conversationHistory: []
 });
 
 // Step 5: MUTATE - Creating ticket record
 state = await animatePipelineStep(state);
 
 // Step 6: CONFIRM - Ticket saved
 state = await animatePipelineStep(state);
 
 // Step 7: NOTIFY - Sending confirmation
 state = await animatePipelineStep(state);
 
 return result;
 },
 onSuccess: (data: any) =>{
 const newTicketId = data.ticketId;
 saveTicketNumber(newTicketId);
 setTicketNumber(newTicketId);

 // H001/H002: Create a HelpAI orchestrator session so it appears in admin dashboard
 apiRequest("POST", "/api/helpai/session/start", {
 guestName: guestIntakeData.name,
 guestEmail: guestIntakeData.email,
 }).then((session: any) =>{
 if (session?.sessionId) {
 setHelpaiSessionId(session.sessionId);
 try { sessionStorage.setItem('helpai_session_id', session.sessionId); } catch {}
 }
 }).catch((err) => {
   console.error('HelpAI session start failed:', err);
   toast({
     title: "AI Session Error",
     description: "We couldn't initialize your AI assistant session, but your ticket has been created.",
     variant: "destructive"
   });
 });
 
 // Send intake data to agents via system message with guest's actual name
 sendMessage(
 `${CHAT_CONFIG.messages.guestIntake.label}\nTicket: ${newTicketId}\nName: ${guestIntakeData.name}\nEmail: ${guestIntakeData.email}\nIssue Type: ${guestIntakeData.issueType}\n\nDescription:\n${guestIntakeData.problemDescription}`,
 guestIntakeData.name,
 'system'
 );
 setHasCompletedIntake(true);
 setShowGuestIntakeForm(false);
 
 // Clear pipeline state after success - uses configurable timing
 setTimeout(() =>setPipelineState(null), PIPELINE_TIMING.clearDelay);
 
 // Start periodic queue update messages
 if (isGuest) {
 const interval = setInterval(() =>{
 if (!justGotVoice && isSilenced) { // Only send if still in queue
 const waitSeconds = Math.round((Date.now() - queueJoinTime.getTime()) / 1000);
 const waitMinutes = Math.floor(waitSeconds / 60);
 const positionInQueue = silencedUsers.size; // Count of silenced users
 
 sendMessage(
 `${CHAT_CONFIG.messages.queueUpdate.label}\nTicket: ${newTicketId}\nWait Time: ${waitMinutes}m ${waitSeconds % 60}s\nPosition in Queue: #${positionInQueue}\n\nTrinity is reviewing your issue. An agent will be assigned shortly.`,
 'Trinity Support',
 'system'
 );
 }
 }, CHAT_CONFIG.queue.updateInterval);
 
 setQueueUpdateInterval(interval);
 }
 
 toast({
 title: CHAT_CONFIG.messages.ticketCreated.title,
 description: CHAT_CONFIG.messages.ticketCreated.description(newTicketId),
 });
 },
 onError: (error: any) =>{
 // Set error on current pipeline step - use functional update to avoid stale state
 setPipelineState(prev =>prev ? setStepError(prev, error.message || "Failed to create ticket") : prev);
 toast({
 title: "Error Creating Ticket",
 description: error.message || "Failed to create support ticket. Please try again.",
 variant: "destructive",
 });
 },
 });

 // Sort users using centralized helper (role hierarchy + alphabetical)
 const sortedUsers = sortUsersByRole(onlineUsers);

 const uniqueUsers = sortedUsers.map(u =>({
 ...u,
 avatar: null,
 isOnline: true,
 }));

 // Track if we've auto-scrolled at least once (for smooth vs instant scroll)
 const hasAutoScrolledRef = useRef(false);
 
 // Simple scroll to bottom when new messages arrive
 const scrollToBottom = useCallback(() =>{
 if (!messagesEndRef.current) return;
 requestAnimationFrame(() =>{
 messagesEndRef.current?.scrollIntoView({ 
 behavior: hasAutoScrolledRef.current ? "smooth" : "auto" 
 });
 hasAutoScrolledRef.current = true;
 });
 }, []); // No dependencies - uses refs to avoid re-creation

 useEffect(() =>{
 if (messages.length === 0) {
 initialLoadCountRef.current = -1;
 newMessageIdsRef.current.clear();
 } else if (initialLoadCountRef.current === -1) {
 initialLoadCountRef.current = messages.length;
 } else if (messages.length < initialLoadCountRef.current) {
 initialLoadCountRef.current = messages.length;
 newMessageIdsRef.current.clear();
 } else if (messages.length >initialLoadCountRef.current) {
 const newMessages = messages.slice(initialLoadCountRef.current);
 newMessages.forEach(m =>{
 if (m.id) newMessageIdsRef.current.add(m.id);
 });
 initialLoadCountRef.current = messages.length;
 setTimeout(() =>{
 newMessageIdsRef.current.clear();
 }, 2000);
 }
 }, [messages.length]);

 useEffect(() =>{
 const el = scrollContainerRef.current;
 const isNearBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight) < 150 : true;
 if (isNearBottom) {
 const timeoutId = setTimeout(scrollToBottom, 100);
 setNewMsgCount(0);
 setLastReadIndex(messages.length - 1);
 return () =>clearTimeout(timeoutId);
 } else {
 const newCount = messages.length - 1 - lastReadIndex;
 if (newCount >0) setNewMsgCount(newCount);
 }
 }, [messages.length, scrollToBottom, lastReadIndex]);

 // H005: Detect HelpAI rating prompt in last bot message
 useEffect(() =>{
 if (ratingSubmitted) return;
 const botMessages = messages.filter((m: any) =>m.role === 'bot' || m.senderRole === 'bot' || m.senderId?.startsWith('helpbot') || m.senderId === 'helpai-bot');
 if (botMessages.length === 0) return;
 const lastBotMsg = botMessages[botMessages.length - 1];
 // @ts-expect-error — TS migration: fix in refactoring sprint
 const text = (lastBotMsg.content || lastBotMsg.message || '').toLowerCase();
 const isRatingPrompt = (text.includes('rate') || text.includes('rating')) && (text.includes('1') || text.includes('five')) && (text.includes('experience') || text.includes('support'));
 setShowRatingWidget(isRatingPrompt);
 }, [messages, ratingSubmitted]);

 // H005: Submit HelpAI star rating via chat message and orchestrator endpoint
 const handleHelpaiRating = useCallback((star: number) =>{
 if (ratingSubmitted) return;
 setHelpaiRating(star);
 setRatingSubmitted(true);
 setShowRatingWidget(false);
 // @ts-expect-error — TS migration: fix in refactoring sprint
 sendMessage(String(star));
 // Also update HelpAI orchestrator session if one was created during intake
 if (helpaiSessionId) {
 apiRequest("POST", `/api/helpai/session/${helpaiSessionId}/rate`, { rating: star }).catch(() =>{});
 }
 }, [ratingSubmitted, sendMessage, helpaiSessionId]);

 useEffect(() =>{
 const el = scrollContainerRef.current;
 if (!el) return;
 const handleScroll = () =>{
 const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
 if (distFromBottom < 100) {
 setNewMsgCount(0);
 setLastReadIndex(messages.length - 1);
 }
 };
 el.addEventListener("scroll", handleScroll, { passive: true });
 return () =>el.removeEventListener("scroll", handleScroll);
 }, [messages.length]);

 // Swipe-to-reply effect
 useEffect(() =>{
 if (swipeReplyId) {
 const msg = messages.find(m =>m.id === swipeReplyId);
 if (msg) {
 setReplyingTo({ id: msg.id || '', senderName: msg.senderName || 'User', message: (msg.message || '').slice(0, 80) });
 }
 setSwipeReplyId(null);
 }
 }, [swipeReplyId, messages]);

 const handleTouchStart = useCallback((e: ReactTouchEvent, msgId: string) =>{
 const touch = e.touches[0];
 touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
 const now = Date.now();
 if (lastTapRef.current && lastTapRef.current.msgId === msgId && now - lastTapRef.current.time < 300) {
 if (msgId) {
 toggleReactionMutation.mutate({ messageId: msgId, emoji: "heart" });
 }
 lastTapRef.current = null;
 } else {
 lastTapRef.current = { time: now, msgId };
 }
 }, []);

 const handleTouchMove = useCallback((e: ReactTouchEvent, msgId: string) =>{
 if (!touchStartRef.current) return;
 const touch = e.touches[0];
 const dx = touch.clientX - touchStartRef.current.x;
 const dy = Math.abs(touch.clientY - touchStartRef.current.y);
 if (dx >60 && dy < 30) {
 setSwipeReplyId(msgId);
 touchStartRef.current = null;
 }
 }, []);

 const SLASH_COMMANDS = useMemo(() =>[
 { name: "kick", usage: "/kick <username>[reason]", description: "Remove user from room" },
 { name: "mute", usage: "/mute <username>[duration]", description: "Mute a user" },
 { name: "broadcast", usage: "/broadcast <message>", description: "Send to all rooms" },
 { name: "suspend", usage: "/suspend <username>[reason]", description: "Suspend a user" },
 { name: "reactivate", usage: "/reactivate <username>", description: "Reactivate a suspended user" },
 { name: "staffstatus", usage: "/staffstatus <username>", description: "Check staff status" },
 { name: "dm", usage: "/dm <username><message>", description: "Send direct message" },
 { name: "assign", usage: "/assign <username>", description: "Assign conversation" },
 { name: "think", usage: "/think <query>", description: "Ask AI to think/analyze" },
 { name: "knowledge", usage: "/knowledge <topic>", description: "Search knowledge base" },
 { name: "transfer", usage: "/transfer <room>", description: "Transfer to another room" },
 { name: "clear", usage: "/clear", description: "Clear chat history" },
 { name: "help", usage: "/help", description: "Show help" },
 ], []);

 const filteredSlashCommands = useMemo(() =>{
 if (!inputMessage.startsWith("/")) return [];
 const query = inputMessage.slice(1).toLowerCase().split(" ")[0];
 if (inputMessage.includes(" ")) return [];
 return SLASH_COMMANDS.filter(cmd =>cmd.name.startsWith(query));
 }, [inputMessage, SLASH_COMMANDS]);

 useEffect(() =>{
 const shouldShow = inputMessage.startsWith("/") && !inputMessage.includes(" ") && filteredSlashCommands.length >0;
 setShowSlashMenu(shouldShow);
 if (shouldShow) {
 setSlashMenuIndex(0);
 }
 }, [inputMessage, filteredSlashCommands]);

 const selectSlashCommand = useCallback((commandName: string) =>{
 setInputMessage(`/${commandName} `);
 setShowSlashMenu(false);
 }, []);

 const detectFileType = useCallback((file: File): 'image' | 'video' | 'audio' | 'document' =>{
 if (file.type.startsWith('image/')) return 'image';
 if (file.type.startsWith('video/')) return 'video';
 if (file.type.startsWith('audio/')) return 'audio';
 return 'document';
 }, []);

 const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) =>{
 const file = e.target.files?.[0];
 if (!file) return;

 const MAX_SIZE = 25 * 1024 * 1024;
 if (file.size > MAX_SIZE) {
 toast({ title: "File too large", description: "Maximum file size is 25MB", variant: "destructive" });
 return;
 }

 const fileType = detectFileType(file);
 let previewUrl: string | null = null;
 if (fileType === 'image' || fileType === 'video') {
 previewUrl = URL.createObjectURL(file);
 }

 setPendingAttachment(prev =>{
 if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
 return { file, previewUrl, type: fileType };
 });
 if (fileInputRef.current) fileInputRef.current.value = '';
 }, [toast, detectFileType]);

 const clearPendingAttachment = useCallback(() =>{
 setPendingAttachment(prev =>{
 if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
 return null;
 });
 }, []);

 useEffect(() =>{
 return () =>{
 if (pendingAttachment?.previewUrl) {
 URL.revokeObjectURL(pendingAttachment.previewUrl);
 }
 };
 }, []);

 const uploadAttachment = useCallback(async (file: File): Promise<{ url: string; name: string; type: string; size: number } | null>=>{
 setIsUploading(true);
 try {
 const formData = new FormData();
 formData.append('files', file);
 formData.append('conversationId', conversationToJoin);
 formData.append('isPublic', 'true');

 const response = await fetch('/api/chat/upload', {
 method: 'POST',
 body: formData,
 credentials: 'include',
 });

 if (!response.ok) {
 const errData = await response.json().catch(() =>({}));
 throw new Error(errData.error || 'Upload failed');
 }

 const data = await response.json();
 if (data.success && data.uploads?.length >0) {
 const uploaded = data.uploads[0];
 return {
 url: uploaded.url,
 name: uploaded.originalFilename || file.name,
 type: detectFileType(file),
 size: file.size,
 };
 }
 throw new Error('No upload data returned');
 } catch (err: any) {
 toast({ title: "Upload failed", description: err.message || "Could not upload file", variant: "destructive" });
 return null;
 } finally {
 setIsUploading(false);
 }
 }, [conversationToJoin, toast, detectFileType]);

 const handleSendMessage = async () =>{
 const hasText = inputMessage.trim().length >0;
 const hasAttachment = !!pendingAttachment;

 if ((!hasText && !hasAttachment) || !isConnected) return;

 if (hasAttachment) {
 const uploaded = await uploadAttachment(pendingAttachment.file);
 if (uploaded) {
 const caption = hasText ? inputMessage.trim() : pendingAttachment.file.name;
 sendMessage(caption, userName, 'support', {
 url: uploaded.url,
 name: uploaded.name,
 type: uploaded.type,
 size: uploaded.size,
 });
 clearPendingAttachment();
 } else {
 return;
 }
 } else {
 sendMessage(inputMessage, userName, 'support');
 }

 setInputMessage("");
 scrollToBottom();
 };

 const handleKeyPress = (e: React.KeyboardEvent) =>{
 if (showSlashMenu && filteredSlashCommands.length >0) {
 if (e.key === "ArrowDown") {
 e.preventDefault();
 setSlashMenuIndex(prev =>(prev + 1) % filteredSlashCommands.length);
 return;
 }
 if (e.key === "ArrowUp") {
 e.preventDefault();
 setSlashMenuIndex(prev =>(prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
 return;
 }
 if (e.key === "Enter") {
 e.preventDefault();
 selectSlashCommand(filteredSlashCommands[slashMenuIndex].name);
 return;
 }
 if (e.key === "Escape") {
 e.preventDefault();
 setShowSlashMenu(false);
 return;
 }
 if (e.key === "Tab") {
 e.preventDefault();
 selectSlashCommand(filteredSlashCommands[slashMenuIndex].name);
 return;
 }
 }
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleSendMessage();
 }
 };

 const handleQuickResponse = (action: string) =>{
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
 navigate('/settings');
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

 const handleMention = (userName: string) =>{
 setInputMessage(prev =>prev + `@${userName} `);
 };

 const sendQuickMessage = (message: string) =>{
 if (message.trim() && isConnected) {
 sendMessage(message, userName, 'support');
 }
 };

 // Handle status change with coffee cup animation
 const handleStatusChange = (newStatus: "online" | "away" | "busy") =>{
 setUserStatus(newStatus);
 setShowCoffeeCup(true);
 sendStatusChange(newStatus);
 
 // Hide coffee cup after animation
 setTimeout(() =>setShowCoffeeCup(false), 2000);
 };


 // Get user type icon - CoAIleague logo ONLY for staff, avatars for users
 const getUserTypeIcon = (userType: string, role: string, userName: string = 'User', platformRole?: string) =>{
 const effectiveRole = platformRole || role;
 
 if (role === 'bot') {
 return (
 <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-blue-500/50">
 <Sparkles size={14} className="text-white" />
 </div>
 );
 }
 
 if (role === 'staff' || ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(effectiveRole)) {
 return (
 <div className="flex items-center justify-center scale-[0.55]">
 <UnifiedBrandLogo size="sm" variant="icon" />
 </div>
 );
 }
 
 // Subscribers - Professional avatar with initials
 if (userType === 'subscriber') {
 const initials = userName.split(' ').map(n =>n[0]).join('').toUpperCase().slice(0, 2);
 return (
 <Avatar className="w-7 h-7 border border-primary/80">
 <AvatarFallback className="bg-muted/50 text-primary text-xs font-bold">
 {initials}
 </AvatarFallback>
 </Avatar>
 );
 }
 
 // Organization users - Professional avatar with initials
 if (userType === 'org_user') {
 const initials = userName.split(' ').map(n =>n[0]).join('').toUpperCase().slice(0, 2);
 return (
 <Avatar className="w-7 h-7 border border-border">
 <AvatarFallback className="bg-muted text-foreground text-xs font-bold">
 {initials}
 </AvatarFallback>
 </Avatar>
 );
 }
 
 // Guests - Simple avatar with question mark
 return (
 <Avatar className="w-7 h-7 border border-border">
 <AvatarFallback className="bg-muted text-muted-foreground text-xs">
 <HelpCircle className="w-3.5 h-3.5" />
 </AvatarFallback>
 </Avatar>
 );
 };

 // Get status indicator - Extra Compact
 const getStatusIndicator = (status: string) =>{
 switch (status) {
 case 'online': return <div className="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse shadow-sm" />;
 case 'away': return <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-sm" />;
 case 'busy': return <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm" />;
 default: return <div className="w-1.5 h-1.5 bg-gray-500 dark:bg-gray-600 rounded-full" />;
 }
 };

 const getRoleDisplay = (role?: string, platformRole?: string) =>{
 const effectiveRole = platformRole || role;
 if (!effectiveRole) return null;
 switch(effectiveRole) {
 case 'root_admin': return 'Admin';
 case 'deputy_admin': return 'Deputy';
 case 'support_manager': return 'Manager';
 case 'sysop': return 'Sysop';
 case 'compliance_officer': return 'Compliance';
 case 'bot': return 'BOT AI';
 case 'staff': return 'Staff';
 default: return null;
 }
 };

 const getRoleIcon = (role: string, platformRole?: string) =>{
 const effectiveRole = platformRole || role;
 const staffRoles = ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'compliance_officer', 'bot', 'staff'];
 
 if (!staffRoles.includes(effectiveRole) && !staffRoles.includes(role)) {
 return null;
 }
 
 const roleText = getRoleDisplay(role, platformRole);
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
 const parseSystemMessage = (message: string) =>{
 // Match pattern like "Name (Role)" and convert to Name with superscript role
 // Updated regex to capture full names including spaces, hyphens, apostrophes
 const rolePattern = /([\w\s'-]+?)\s*\((Admin|Deputy|Assistant|Sysop|Auditor|BOT AI)\)/g;
 const parts: (string | JSX.Element)[] = [];
 let lastIndex = 0;
 let match;
 let key = 0;

 while ((match = rolePattern.exec(message)) !== null) {
 // Add text before the match
 if (match.index >lastIndex) {
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

 return parts.length >0 ? parts : message;
 };

 const getRoleColor = (role: string, platformRole?: string) =>{
 const effectiveRole = platformRole || role;
 switch (effectiveRole) {
 case 'root_admin': return 'text-primary font-bold';
 case 'bot': return 'text-primary font-bold';
 case 'deputy_admin': return 'text-primary font-bold';
 case 'support_manager': return 'text-primary font-bold';
 case 'sysop': return 'text-primary font-bold';
 case 'staff': return 'text-primary font-bold';
 default: return 'text-foreground font-semibold';
 }
 };

 // Get message bubble color - WhatsApp-style layout with theme colors
 // Outgoing = primary tint (right), Incoming = muted (left), Purple = DM/private
 const getMessageBubbleColor = (senderType: string, role: string, isSelf: boolean, isPrivate?: boolean, isAction?: boolean) =>{
 // Private/DM messages - accent tint
 if (isPrivate) {
 return 'bg-accent/80 border border-accent-foreground/20 text-accent-foreground';
 }
 
 // Action messages (commands executed) - secondary styling
 if (isAction) {
 return 'bg-secondary border border-border text-secondary-foreground';
 }
 
 if (isSelf) {
 // YOUR OWN messages - Primary colored bubble (outgoing, right-aligned)
 return 'bg-primary text-primary-foreground';
 }
 
 // Bot/Trinity messages - card with subtle primary tint
 if (role === 'bot' || senderType === 'bot') {
 return 'bg-card border border-primary/20 text-card-foreground';
 }
 
 // Staff messages - elevated card style
 if (role === 'root_admin' || role === 'deputy_admin' || role === 'support_manager' || role === 'sysop') {
 return 'bg-muted border border-border text-foreground';
 }
 
 // Incoming messages - card/muted background
 return 'bg-card border border-border text-card-foreground';
 };

 const isStaff = user && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((user as any).platformRole);
 const userPlatformRole = (user as any)?.platformRole;
 // @ts-expect-error — TS migration: fix in refactoring sprint
 const queueLength = queueData?.length || 0;

 // Role-based permission system
 const hasContextPermission = (requiredRoles: string[]) =>{
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
 const handleQuickReply = (targetUser: any) =>{
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

 const handleInternalNote = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'internal_note', 
 targetUserId: targetUser.id,
 note: `Staff note added to ${targetUser.name}'s ticket`
 });
 toast({ title: "Internal note added", description: "Note visible to staff only" });
 };

 const handleResetPassword = (targetUser: any) =>{
 // Initiate password reset via slash command
 sendQuickMessage(`/resetpassword ${targetUser.id}`);
 toast({ title: "Password Reset Sent" });
 };

 const handleUnlockAccount = (targetUser: any) =>{
 // Send slash command to unlock account
 sendQuickMessage(`/unlock ${targetUser.id}`);
 toast({ title: "Account Unlocked" });
 };

 const handleLockAccount = (targetUser: any) =>{
 // Send slash command that will be processed by websocket handler
 sendQuickMessage(`/lock ${targetUser.id} Security concern - locked by support`);
 toast({ title: "Account Locked", description: "User has been logged out from all sessions" });
 };

 const handleResetEmail = (targetUser: any) =>{
 setResetEmailDialogUser({ userId: targetUser.id, userName: targetUser.name });
 };

 const handleViewSessions = (targetUser: any) =>{
 // Send slash command to view sessions
 sendQuickMessage(`/sessions ${targetUser.id}`);
 toast({ title: "Sessions Viewer", description: `Viewing active sessions for ${targetUser.name}` });
 };

 const handleRevokeSessions = (targetUser: any) =>{
 // Send slash command to revoke sessions
 sendQuickMessage(`/sessions ${targetUser.id} revoke`);
 toast({ title: "Sessions Revoked", description: "User logged out from all devices" });
 };

 const handleVerifyIdentity = (targetUser: any) =>{
 // Send slash command for identity verification
 sendQuickMessage(`/requestinfo ${targetUser.id} identity`);
 toast({ title: "Identity Verification Started" });
 };

 const handleViewDocuments = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'view_documents', 
 targetUserId: targetUser.id 
 });
 toast({ title: "Document viewer opened", description: `Viewing ${targetUser.name}'s submitted documents` });
 };

 const handleEscalate = (targetUser: any) =>{
 // Send slash command to escalate
 sendQuickMessage(`/escalate urgent Issue with ${targetUser.name}`);
 toast({ title: "Ticket escalated", description: "Transferred to Tier 2 support" });
 };

 const handlePriorityTag = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'priority_tag', 
 targetUserId: targetUser.id 
 });
 toast({ title: "Priority flag added", description: `${targetUser.name}'s ticket marked as high priority` });
 };

 const handleFollowUp = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'follow_up', 
 targetUserId: targetUser.id 
 });
 toast({ title: "Follow-up scheduled", description: "Reminder set for 24 hours" });
 };

 const handleEmailSummary = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'email_summary', 
 targetUserId: targetUser.id 
 });
 sendQuickMessage(`@${targetUser.name} I'm sending a summary of our conversation to your email.`);
 toast({ title: "Email Summary Sent" });
 };

 const handleMarkVIP = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'mark_vip', 
 targetUserId: targetUser.id 
 });
 toast({ title: "VIP Status Granted" });
 };

 const handleUserHistory = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'user_history', 
 targetUserId: targetUser.id 
 });
 toast({ title: "History Loaded" });
 };

 const handleIssueWarning = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'issue_warning', 
 targetUserId: targetUser.id 
 });
 sendQuickMessage(`@${targetUser.name} This is a formal warning. Please follow our community guidelines.`);
 toast({ title: "Warning Issued", description: `${targetUser.name}` });
 };

 const handleTempMute = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'temp_mute', 
 targetUserId: targetUser.id,
 duration: 300 
 });
 toast({ title: "User Muted", description: `${targetUser.name} • 5min` });
 };

 const handleBan = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'ban_user', 
 targetUserId: targetUser.id 
 });
 toast({ 
 title: "User Banned", 
 description: `${targetUser.name}`, 
 });
 };

 const handleAnalytics = () =>{
 sendRawMessage({ type: 'analytics' });
 toast({ title: "Analytics Opened" });
 };

 const handleForceReconnect = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'force_reconnect', 
 targetUserId: targetUser.id 
 });
 toast({ title: "Connection Reset" });
 };

 const handleTestMessage = () =>{
 sendRawMessage({ type: 'test_message', timestamp: Date.now() });
 sendQuickMessage(`SYSTEM TEST - Message sent at ${new Date().toLocaleTimeString()}`);
 toast({ title: "Test Message Sent" });
 };

 const handleClearCache = (targetUser: any) =>{
 sendRawMessage({ 
 type: 'clear_cache', 
 targetUserId: targetUser.id 
 });
 toast({ title: "Cache Cleared" });
 };

 // Stateful menu helpers - for context menu toggles
 const toggleSilence = (targetUser: any) =>{
 const isSilencedNow = silencedUsers.has(targetUser.id);
 if (isSilencedNow) {
 // Unmute
 sendRawMessage({ type: 'give_voice', targetUserId: targetUser.id });
 setSilencedUsers(prev =>{
 const next = new Set(prev);
 next.delete(targetUser.id);
 return next;
 });
 toast({ title: "User Unmuted" });
 } else {
 // Open silence dialog for branded reason selection
 setSilenceDialogUser({ userId: targetUser.id, userName: targetUser.name });
 }
 };

 const toggleBan = (targetUser: any) =>{
 const isBannedNow = bannedUsers.has(targetUser.id);
 if (isBannedNow) {
 // Unban
 sendRawMessage({ type: 'unban_user', targetUserId: targetUser.id });
 setBannedUsers(prev =>{
 const next = new Set(prev);
 next.delete(targetUser.id);
 return next;
 });
 toast({ title: "User Unbanned" });
 } else {
 // Ban
 sendRawMessage({ type: 'ban_user', targetUserId: targetUser.id });
 setBannedUsers(prev =>{
 const next = new Set(prev);
 next.add(targetUser.id);
 return next;
 });
 toast({ title: "User Banned", description: `${targetUser.name}` });
 }
 };

 const trackDocumentRequest = (targetUserId: string, requestType: string) =>{
 setDocumentRequests(prev =>{
 const next = new Map(prev);
 const userRequests = next.get(targetUserId) || new Set();
 userRequests.add(requestType);
 next.set(targetUserId, userRequests);
 return next;
 });
 };

 const hasRequestedDocument = (targetUserId: string, requestType: string): boolean =>{
 return documentRequests.get(targetUserId)?.has(requestType) || false;
 };

 // MOBILE-OPTIMIZED CHAT - Full-featured mobile layout with tools
 if (shouldUseMobileLayout) {
 // Show room browser first on mobile (unless URL has a specific conversation, room selected, or roomId prop)
 // Default to true for new sessions without explicit room selection
 // Skip room browser when propRoomId is provided (embedded in Chatrooms page)
 const shouldShowRoomBrowser = showMobileRoomBrowser && !urlConversationId && !mobileSelectedRoom && !propRoomId;
 
 // Use h-full when embedded in another component (via roomId prop), h-screen when standalone
 const mobileContainerHeight = propRoomId ? 'h-full' : 'h-screen';
 
 if (shouldShowRoomBrowser) {
 return (
 <div className={`flex flex-col ${mobileContainerHeight} bg-background`}>
 {/* Mobile Room Browser Header - Trinity branding */}
 <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
 <Button
 size="icon"
 variant="ghost"
 className="text-white hover:bg-card/20"
 onClick={() =>navigate("/dashboard")}
 data-testid="button-back-home"
 aria-label="Back to dashboard"
 >
 <ChevronLeft className="h-5 w-5" />
 </Button>
 <div className="text-center">
  <h1 className="font-bold text-base font-display">Live Chatrooms</h1>
 <p className="text-xs text-white/70">{isStaff ? 'All platform rooms' : 'Your organization'}</p>
 </div>
 <Button
 size="icon"
 variant="ghost"
 className="text-white hover:bg-card/20"
 onClick={() =>navigate("/dashboard")}
 data-testid="button-home"
 aria-label="Go to dashboard"
 >
 <Home className="h-5 w-5" />
 </Button>
 </div>
 
 {/* Room Browser */}
 <div className="flex-1 overflow-auto p-4">
 <LiveRoomBrowser
 compact={true}
 filterByOrg={!isStaff}
 onRoomSelect={(roomId, roomName) =>{
 setMobileSelectedRoom({ id: roomId, name: roomName });
 setShowMobileRoomBrowser(false);
 }}
 />
 </div>
 </div>
 );
 }
 
 // Prepare users list for mobile chat
 const mobileUsers = uniqueUsers.map(u =>{
 let role: 'staff' | 'customer' | 'guest' | 'bot' = 'customer';
 if (u.role === 'bot') {
 role = 'bot';
 } else if (u.role === 'staff' || ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.platformRole || u.role)) {
 role = 'staff';
 } else if (u.role === 'guest') {
 role = 'guest';
 }
 return {
 id: u.id,
 name: u.name,
 role,
 platformRole: u.platformRole || u.role,
 };
 });

 return (
 <div style={{ height: propRoomId ? '100%' : '100dvh' }} className="flex flex-col">
 <UniversalChatLayout
 messages={messages}
 users={mobileUsers}
 currentUser={{
 id: user?.id || '',
 name: userName,
 isStaff: isStaff || false,
 }}
 onSendMessage={(message) =>sendMessage(message, userName, isStaff ? 'support' : 'customer')}
 onCommandExecute={(command) =>{
 if (!isConnected) {
 toast({ title: "Not Connected", description: "Cannot send commands while disconnected", variant: "destructive" });
 return;
 }
 if (command.startsWith('/')) {
 sendMessage(command, userName, isStaff ? 'support' : 'customer');
 } else {
 sendMessage(command, userName, isStaff ? 'support' : 'customer');
 }
 }}
 onKickUser={(userId, reason) =>{
 // Use proper kickUser function with IRC-style command acknowledgment
 kickUser(userId, reason || 'Removed by support staff');
 toast({ title: "User Kicked", description: `User removed from chat` });
 }}
 onSilenceUser={(userId, duration, reason) =>{
 // Use proper silenceUser function with IRC-style command acknowledgment
 silenceUser(userId, duration || 5, reason || 'Muted by support staff');
 toast({ title: "User Silenced", description: `Muted for ${duration || 5} minutes` });
 }}
 onGiveVoice={(userId) =>{
 // Use proper giveVoice function with IRC-style command acknowledgment
 giveVoice(userId);
 toast({ title: "Voice Granted", description: `User can now speak` });
 }}
 onExit={() =>{
 sendRawMessage({ type: 'leave_conversation', userId: user?.id });
 
 if (onBack) {
 onBack();
 } else if (propRoomId) {
 navigate('/chatrooms');
 } else {
 setMobileSelectedRoom(null);
 setShowMobileRoomBrowser(true);
 }
 }}
 isLoading={!isConnected && messages.length === 0}
 roomName={propRoomName || mobileSelectedRoom?.name || 'Support Chat'}
 />
 </div>
 );
 }

 // DESKTOP LAYOUT - Full featured IRC-style chat
 // Use h-full when embedded in another component (via roomId prop), h-screen when standalone
 const containerHeight = propRoomId ? 'h-full' : 'h-screen';
 return (
 <div className={`flex flex-col ${containerHeight} bg-background relative`} role="main" aria-label="Help Desk Chat">
 {/* Seasonal Animated Background */}
 
 {/* CoAIleague Chat Header - Trinity branded */}
 <header className="relative z-50 bg-primary border-b border-primary-foreground/20 flex-shrink-0">
 <div className="flex items-center justify-between px-3 py-2 gap-2">
 {/* Left: Back + Trinity avatar + Room info */}
 <div className="flex items-center gap-3">
 <Button
 onClick={() =>{
 if (onBack) {
 onBack();
 } else {
 navigate(propRoomId ? '/chatrooms' : '/dashboard');
 }
 }}
 variant="ghost"
 size="icon"
 className="h-9 w-9 text-primary-foreground"
 data-testid="button-back-chat"
 aria-label="Back to previous page"
 >
 <ChevronLeft className="w-5 h-5" />
 </Button>
 <Suspense fallback={<div className="w-10 h-10 rounded-full bg-primary-foreground/20" />}>
 <TrinityArrowMark size={40} />
 </Suspense>
 <div>
 <div className="flex items-center gap-2 flex-wrap">
  <h1 className="text-primary-foreground font-semibold text-sm sm:text-base font-display">Trinity Support</h1>
 {ticketNumber && (
 <span
 className="bg-primary-foreground/20 text-primary-foreground text-xs font-mono px-1.5 py-0.5 rounded"
 data-testid="badge-ticket-number"
 title="Your support ticket number"
 >
 {ticketNumber}
 </span>
 )}
 </div>
 <p className="text-primary-foreground/70 text-xs">
 {uniqueUsers.filter(u =>u.role === 'staff' || u.role === 'bot' || CHAT_CONFIG.roles.supportStaff.includes(u.platformRole || u.role)).length} agents online
 </p>
 </div>
 </div>

 {/* Right: Action buttons */}
 <div className="flex items-center gap-1">
 {canManageRooms && conversationToJoin && (
 roomClosed ? (
 <Button
 variant="ghost"
 size="icon"
 className="text-primary-foreground"
 data-testid="button-reopen-room"
 title="Reopen Room"
 aria-label="Reopen Room"
 onClick={() =>reopenRoomMutation.mutate(undefined)}
 disabled={reopenRoomMutation.isPending}
 >
 <Unlock className="w-4 h-4" />
 </Button>
 ) : (
 <Button
 variant="ghost"
 size="icon"
 className="text-primary-foreground"
 data-testid="button-close-room"
 title="Close Room"
 aria-label="Close Room"
 onClick={() =>closeRoomMutation.mutate(undefined)}
 disabled={closeRoomMutation.isPending}
 >
 <Lock className="w-4 h-4" />
 </Button>
 )
 )}
 <Button
 variant="ghost"
 size="icon"
 className="text-primary-foreground"
 data-testid="button-chat-search"
 title="Search messages"
 aria-label="Search messages"
 onClick={() =>setShowChatSearch(prev =>!prev)}
 >
 <SearchIcon className="w-4 h-4" />
 </Button>
 {!isStaff && (
 <Button
 variant="ghost"
 size="icon"
 className="text-primary-foreground"
 data-testid="button-end-chat"
 title="End Chat"
 aria-label="End support chat session"
 onClick={() => setEndChatConfirmOpen(true)}
 >
 <PhoneOff className="w-4 h-4" />
 </Button>
 )}
 <Button
 onClick={() =>navigate('/dashboard')}
 variant="ghost"
 size="icon"
 className="text-primary-foreground"
 data-testid="button-exit-chatroom"
 title="Exit"
 aria-label="Exit chatroom"
 >
 <X className="w-5 h-5" />
 </Button>
 </div>
 </div>

 {/* Status Bar */}
 {CHAT_CONFIG.display.showWaitTime && (
 <div className="bg-primary-foreground/10 px-3 py-1 border-t border-primary-foreground/10">
 <div className="flex items-center justify-center gap-2 text-xs text-primary-foreground/80">
 <Clock className="w-3 h-3" />
 <span> Response time: {CHAT_CONFIG.queue.estimatedWaitTime.min}-{CHAT_CONFIG.queue.estimatedWaitTime.max} min</span>
 </div>
 </div>
 )}
 </header>


 {/* Main Layout - Responsive: Stacked (mobile) vs 3-column (desktop) */}
 <main className="flex flex-col md:flex-row flex-grow overflow-y-auto md:overflow-hidden w-full relative z-10">
 {/* CENTER COLUMN: Chat Area - theme-compliant background */}
 <section className="flex-grow flex flex-col bg-background relative md:border-r border-border shadow-inner min-h-0">
 {/* Progress Header - Only show for escalated tickets with real ticket IDs */}
 {isStaff && urlConversationId && urlConversationId !== MAIN_ROOM_ID && CHAT_CONFIG.display.showProgressHeaderEscalated && (
 <div className="px-4 py-3 border-b border-border bg-muted/50">
 <HelpDeskProgressHeader
 ticketId={urlConversationId}
 fetchLiveData={true}
 />
 </div>
 )}
 
 {showChatSearch && (
 <div className="px-3 py-2 border-b border-border bg-muted/50 flex items-center gap-2" data-testid="chat-search-bar">
 <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
 <input
 type="text"
 value={chatSearchQuery}
 onChange={(e) =>setChatSearchQuery(e.target.value)}
 placeholder="Search in conversation..."
 className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
 data-testid="input-chat-search"
 autoFocus
 />
 {chatSearchQuery && (
 <span className="text-xs text-muted-foreground" data-testid="text-search-count">{searchHits.length} results</span>
 )}
 <Button variant="ghost" size="icon" onClick={() =>{ setShowChatSearch(false); setChatSearchQuery(""); }} data-testid="button-close-search" aria-label="Close search">
  <X className="h-4 w-4" />
 </Button>
 </div>
 )}

 {pinnedMessages.length >0 && (
 <div className="px-3 py-2 border-b border-border bg-yellow-50/50 dark:bg-yellow-950/20 flex items-center gap-2" data-testid="pinned-messages-banner">
 <Pin className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
 <div className="flex-1 min-w-0">
 <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">{pinnedMessages.length} pinned message{pinnedMessages.length >1 ? 's' : ''}</span>
 {pinnedMessages[0] && (
 <p className="text-xs text-muted-foreground truncate">{pinnedMessages[0].message}</p>
 )}
 </div>
 </div>
 )}

 {/* Messages Area - Explicit height for mobile scroll */}
 {/* SIMPLIFIED: Using native overflow-auto to avoid Radix ScrollArea ref thrashing */}
 <div className="flex-1 min-h-0 p-2 sm:p-3 overflow-y-auto relative" ref={scrollContainerRef} role="log" aria-live="polite" aria-label="Chat messages" aria-busy={!isConnected && messages.length === 0}>
 <div className="space-y-0">

 {/* Chat Messages - Modern bubbles with CoAIleague professional styling */}
 {(() =>{
 let lastSenderId: string | null = null;
 let firstUnreadShown = false;
 return messages.map((msg, idx) =>{
 const isSelf = msg.senderId === user?.id;
 const role = (msg as any).role || 'guest';
 const isSystem = msg.senderType === 'system' || msg.isSystemMessage;

 const prevMsg = idx >0 ? messages[idx - 1] : null;
 const showDateDivider = (() =>{
 if (!msg.createdAt) return false;
 if (!prevMsg || !prevMsg.createdAt) return idx === 0;
 return new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
 })();

 const isGrouped = !isSystem && !showDateDivider && lastSenderId === msg.senderId && prevMsg && !(prevMsg.senderType === 'system' || prevMsg.isSystemMessage);

 const showUnreadDivider = !firstUnreadShown && lastReadIndex >= 0 && lastReadIndex < messages.length - 1 && idx === lastReadIndex + 1;
 if (showUnreadDivider) firstUnreadShown = true;

 if (!isSystem) lastSenderId = msg.senderId || null;
 else lastSenderId = null;

 const isSearchHit = msg.id && searchHitIds.has(msg.id);
 
 if (isSystem) {
 return (
 <div key={idx} className="py-0.5">
 {showUnreadDivider && <HDUnreadDivider />}
 {showDateDivider && msg.createdAt && (
 <div className="flex items-center gap-3 my-3 px-2" data-testid={`date-divider-${idx}`}>
 <div className="flex-1 h-px bg-border" />
 <span className="text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{getDateDividerLabel(typeof msg.createdAt === 'string' ? msg.createdAt : msg.createdAt.toISOString())}</span>
 <div className="flex-1 h-px bg-border" />
 </div>
 )}
 <div className="flex justify-center my-1 message-arrive px-2">
 <span className="text-[10px] sm:text-xs font-mono font-bold text-destructive italic bg-destructive/10 px-2 py-0.5 rounded-lg border border-destructive/30 flex items-center gap-1.5 max-w-full text-center break-words">
 <Zap className="w-3 h-3 text-destructive shrink-0" />
 <span className="truncate" dangerouslySetInnerHTML={{ __html: sanitizeMessage(msg.message) }} />
 </span>
 </div>
 </div>
 );
 }

 const actualName = isSelf 
 ? userName
 : (msg.senderName || 'User');
 
 const isPrivate = (msg as any).isPrivateMessage || false;
 const isAction = (msg as any).isActionMessage || (msg as any).messageType === 'action';
 const bubbleColor = getMessageBubbleColor(msg.senderType || 'customer', role, isSelf, isPrivate, isAction);
 const messageReadReceipt = readReceipts.get(msg.id);
 const msgReactions = msg.id ? (reactionsMap[msg.id] || []) : [];
 const parentMessage = (msg as any).parentMessage || null;

 const groupedRadius = isSelf
 ? (isGrouped ? 'rounded-l-lg rounded-r-md' : 'rounded-l-lg rounded-tr-lg rounded-br-sm')
 : (isGrouped ? 'rounded-r-lg rounded-l-md' : 'rounded-r-lg rounded-tl-lg rounded-bl-sm');

 return (
 <div key={idx} className={isGrouped ? 'py-px' : 'py-0.5'}>
 {showUnreadDivider && <HDUnreadDivider />}
 {showDateDivider && msg.createdAt && (
 <div className="flex items-center gap-3 my-3 px-2" data-testid={`date-divider-${idx}`}>
 <div className="flex-1 h-px bg-border" />
 <span className="text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{getDateDividerLabel(typeof msg.createdAt === 'string' ? msg.createdAt : msg.createdAt.toISOString())}</span>
 <div className="flex-1 h-px bg-border" />
 </div>
 )}
 <div 
 className={`flex ${isSelf ? 'justify-end' : 'justify-start'} ${newMessageIdsRef.current.has(msg.id || '') ? 'message-new-arrive message-highlight' : 'message-arrive'} group ${isSearchHit ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
 data-testid={`message-bubble-${idx}`}
 {...(shouldUseMobileLayout ? {
 onTouchStart: (e: ReactTouchEvent<HTMLDivElement>) =>handleTouchStart(e, msg.id || ''),
 onTouchMove: (e: ReactTouchEvent<HTMLDivElement>) =>handleTouchMove(e, msg.id || ''),
 } : {})}
 >
 <div className="relative max-w-[90%] sm:max-w-[80%]">
 {!shouldUseMobileLayout && msg.id && (
 <HDQuickReactionHoverBar
 messageId={msg.id}
 conversationId={conversationToJoin}
 isOwn={isSelf}
 onReply={() =>setReplyingTo({ id: msg.id || '', senderName: actualName, message: msg.message.slice(0, 80) })}
 onMoreActions={() =>{
 if (isSelf) {
 setEditingMessage({ id: msg.id || '', message: msg.message });
 } else if (msg.id) {
 forwardMessageMutation.mutate({ messageId: msg.id, targetConversationId: sessionId });
 }
 }}
 />
 )}
 <div className={`${bubbleColor} shadow-sm p-2 sm:p-2.5 ${groupedRadius} hover:shadow-md transition-all min-w-0`}>
 {!isSelf && !isGrouped && (
 <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 min-w-0 max-w-full">
 <span className={['text-[11px] sm:text-xs font-semibold', isSelf ? 'text-primary-foreground/80' : 'text-primary', 'truncate'].join(' ')}>
 {role === 'bot' ? 'Trinity Support' : actualName.split('(')[0].trim()}
 {getRoleIcon(role)}
 </span>
 </div>
 )}

 {parentMessage && (
 <div className="mb-1 p-1.5 rounded bg-black/5 dark:bg-card/5 border-l-2 border-primary/50 text-[11px] text-muted-foreground" data-testid={`reply-preview-${idx}`}>
 <span className="font-semibold text-primary/80">{parentMessage.senderName}</span>
 <p className="truncate">{parentMessage.message}</p>
 </div>
 )}
 
 {(msg as any).attachmentUrl && (
 <div className="mb-1" data-testid={`attachment-display-${idx}`}>
 <MessageAttachment
 url={(msg as any).attachmentUrl}
 name={(msg as any).attachmentName}
 type={(msg as any).attachmentType}
 />
 </div>
 )}
 
 <div 
 className="text-inherit text-[13px] sm:text-sm leading-snug break-words whitespace-pre-wrap overflow-hidden"
 onClick={(e) =>{
 const target = e.target as HTMLElement;
 if (target.tagName === 'IMG') {
 setLightboxData({ src: (target as HTMLImageElement).src, senderName: msg.senderName || undefined, timestamp: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : msg.createdAt.toISOString()) : undefined, filename: msg.attachmentName || undefined });
 }
 }}
 >
 <HDFormattedMessage text={msg.message} />
 </div>
 
 <div className={['flex items-center justify-end gap-1 mt-0.5', isSelf ? 'text-primary-foreground/70' : 'text-muted-foreground'].join(' ')}>
 {(msg as any).isEdited && (
 <span className="text-[9px] italic" data-testid={`edited-indicator-${idx}`}>(edited)</span>
 )}
 <span className="text-[9px] sm:text-[10px]">
 {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
 </span>
 {isSelf && (
 messageReadReceipt
 ? <CheckCheck className="w-3 h-3 text-blue-500 read-receipt" data-testid={`read-receipt-seen-${idx}`} />
 : <Check className="w-3 h-3 read-receipt" data-testid={`read-receipt-sent-${idx}`} />
 )}
 </div>
 </div>

 {msgReactions.length >0 && (
 <div className="flex flex-wrap gap-1 mt-0.5 px-1" data-testid={`reactions-${idx}`}>
 {msgReactions.map((r: any, ri: number) =>{
 const ReactionIcon = REACTION_ICONS[r.emoji]?.icon;
 return (
 <button
 key={ri}
 className="text-xs bg-muted rounded-full px-1.5 py-0.5 border border-border hover-elevate cursor-pointer flex items-center gap-0.5"
 onClick={() =>msg.id && toggleReactionMutation.mutate({ messageId: msg.id, emoji: r.emoji })}
 data-testid={`reaction-badge-${idx}-${ri}`}
 title={REACTION_ICONS[r.emoji]?.label || r.emoji}
 >
 {ReactionIcon ? <ReactionIcon className="h-3 w-3" />: <span className="text-[10px]">{r.emoji}</span>}
 {r.count >1 && <span className="text-muted-foreground">{r.count}</span>}
 </button>
 );
 })}
 </div>
 )}
 </div>
 </div>
 </div>
 );
 });
 })()}
 
 {typingUserInfo && (
 <HDTypingBubble name={typingUserInfo.name} />
 )}
 
 <div ref={messagesEndRef} />
 </div>
 <HDScrollToBottomFab containerRef={scrollContainerRef} newCount={newMsgCount} />
 </div>

 {replyingTo && (
 <div className="px-3 py-2 border-t border-border bg-muted/60 flex items-center gap-2" data-testid="reply-preview-bar">
 <Reply className="w-4 h-4 text-primary shrink-0" />
 <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
 <span className="text-xs font-semibold text-primary">{replyingTo.senderName}</span>
 <p className="text-xs text-muted-foreground truncate">{replyingTo.message}</p>
 </div>
 <Button variant="ghost" size="icon" onClick={() =>setReplyingTo(null)} data-testid="button-cancel-reply" aria-label="Cancel reply">
  <X className="h-3 w-3" />
 </Button>
 </div>
 )}

 {editingMessage && (
 <div className="px-3 py-2 border-t border-border bg-blue-50/50 dark:bg-blue-950/20 flex items-center gap-2" data-testid="edit-preview-bar">
 <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
 <div className="flex-1 min-w-0">
 <span className="text-xs font-semibold text-blue-700 dark:text-blue-300"> Editing message</span>
 <p className="text-xs text-muted-foreground truncate">{editingMessage.message}</p>
 </div>
 <Button variant="ghost" size="icon" onClick={() =>setEditingMessage(null)} data-testid="button-cancel-edit" aria-label="Cancel edit">
 <X className="w-4 h-4" />
 </Button>
 </div>
 )}

 {/* H005: Star Rating Widget - appears when HelpAI asks for rating */}
 {showRatingWidget && !ratingSubmitted && !isStaff && (
 <div className="border-t border-border bg-card p-3 sm:p-4" data-testid="helpai-rating-widget">
 <div className="flex flex-col items-center gap-2">
 <p className="text-sm font-medium text-foreground"> How would you rate your support experience?</p>
 <div className="flex items-center gap-2" data-testid="star-rating-group">
 {[1, 2, 3, 4, 5].map((star) =>(
 <button
 key={star}
 data-testid={`star-rating-${star}`}
 className="p-1 transition-transform hover:scale-110"
 onClick={() =>handleHelpaiRating(star)}
 onMouseEnter={() =>setRatingHover(star)}
 onMouseLeave={() =>setRatingHover(0)}
 aria-label={`Rate ${star} star${star >1 ? 's' : ''}`}
 >
 <Star
 className={`w-7 h-7 transition-colors ${star <= (ratingHover || helpaiRating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
 />
 </button>
 ))}
 </div>
 <p className="text-xs text-muted-foreground"> Click a star to submit your rating</p>
 </div>
 </div>
 )}
 {ratingSubmitted && helpaiRating >0 && !isStaff && (
 <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-center gap-2" data-testid="rating-submitted-banner">
 <CheckCircle className="w-4 h-4 text-green-600" />
 <span className="text-sm text-muted-foreground"> Thanks for rating your experience: {helpaiRating}/5</span>
 </div>
 )}

 {/* Input Area - Mobile-responsive padding and sizing */}
 <div className="border-t border-border bg-muted p-2 sm:p-3 md:p-4">
 {/* Agent Toolbelt - Only visible to staff, stacked on mobile */}
 {isStaff && (
 <div className="mb-2 sm:mb-3 flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 rounded-md border border-border bg-muted/40 p-2 sm:p-3 backdrop-blur">
 <AgentToolbelt
 ticketId={sessionId}
 selectedUserId={selectedUserId}
 selectedUserName={onlineUsers.find(u =>u.id === selectedUserId)?.name || null}
 onMacroInsert={(macro, targetUserId) =>{
 if (targetUserId) {
 const targetName = onlineUsers.find(u =>u.id === targetUserId)?.name || 'User';
 sendMessage(`@${targetName}: ${macro}`, userName, 'support');
 } else {
 setInputMessage(prev =>prev ? `${prev}\n\n${macro}` : macro);
 }
 }}
 onRequestFile={(type, targetUserId) =>{
 if (targetUserId) {
 const targetName = onlineUsers.find(u =>u.id === targetUserId)?.name || 'User';
 sendMessage(`@${targetName} Please provide: ${type}`, userName, 'support');
 toast({ title: "File Request Sent", description: `Requested ${type} from ${targetName}` });
 } else {
 sendMessage(`Please provide: ${type}`, userName, 'support');
 toast({ title: "File Request Sent", description: `Requested ${type} from customer` });
 }
 }}
 onSendKBLink={(link, targetUserId) =>{
 if (targetUserId) {
 const targetName = onlineUsers.find(u =>u.id === targetUserId)?.name || 'User';
 sendMessage(`@${targetName}: ${link}`, userName, 'support');
 } else {
 setInputMessage(prev =>prev ? `${prev}\n\n${link}` : link);
 }
 }}
 onEscalate={(reason, queue) =>{
 setTicketStatus('escalated');
 sendMessage(`Escalating to ${queue}: ${reason}`, userName, 'system');
 toast({ title: "Ticket Escalated", description: `Sent to ${queue} queue` });
 }}
 onCreateBug={(description) =>{
 toast({ title: "Bug Report Created", description: "Engineering team notified" });
 }}
 className="w-full xs:w-auto"
 />
 <Button
 variant="default"
 size="sm"
 onClick={() =>{
 const statuses: typeof ticketStatus[] = ['assigned', 'investigating', 'waiting_user', 'resolved'];
 const currentIndex = statuses.indexOf(ticketStatus);
 const nextIndex = (currentIndex + 1) % statuses.length;
 setTicketStatus(statuses[nextIndex]);
 toast({ title: "Status Updated", description: `Changed to ${statuses[nextIndex]}` });
 }}
 className="w-full xs:w-auto gap-2"
 data-testid="button-update-status"
 aria-label="Update ticket status"
 >
 <UserCog className="h-4 w-4" />
 Update Status
 </Button>
 </div>
 )}
 
 <div className="flex items-end gap-1.5 sm:gap-2">
 {roomClosed ? (
 <div className="flex-grow p-3 sm:p-3.5 border-2 border-destructive/30 dark:border-destructive/50 rounded-xl sm:rounded-2xl bg-destructive/5 dark:bg-destructive/10 text-foreground text-base" data-testid="banner-room-closed">
 <div className="flex items-center gap-2 mb-1">
 <Lock className="h-4 w-4 text-destructive shrink-0" />
 <p className="font-semibold text-sm"> Room Closed</p>
 </div>
 <p className="text-sm text-muted-foreground"> This room is closed. No new messages can be sent until a manager reopens it.</p>
 {canManageRooms && (
 <Button
 variant="outline"
 size="sm"
 className="mt-2"
 onClick={() =>reopenRoomMutation.mutate(undefined)}
 disabled={reopenRoomMutation.isPending}
 data-testid="button-reopen-room-banner"
 >
 <Unlock className="h-3.5 w-3.5 mr-1.5" />
 Reopen Room
 </Button>
 )}
 </div>
 ) : ticketClosed ? (
 <div className="flex-grow p-3 sm:p-3.5 border-2 border-green-200 dark:border-green-900 rounded-xl sm:rounded-2xl bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100 text-base" data-testid="ticket-closed-banner">
 <p className="font-semibold mb-1 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" /> Session Complete</p>
 <p className="text-sm">{ticketClosedReason || 'Your support session has ended. Thank you!'}</p>
 </div>
 ) : isSilenced && !isInTriage && !justGotVoice ? (
 <div className="flex-grow p-3 sm:p-3.5 border-2 border-amber-200 dark:border-amber-900 rounded-xl sm:rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 text-base">
 <p className="font-semibold mb-1"> Read-Only Mode</p>
 <p className="text-sm"> You are currently in read-only mode. A staff member can grant you voice.</p>
 </div>
 ) : (
 <>
 <div className="relative flex-grow">
 {showSlashMenu && filteredSlashCommands.length >0 && (
 <div
 className="absolute bottom-full left-0 right-0 mb-1 z-50"
 data-testid="slash-command-menu"
 >
 <div className="bg-card border border-border rounded-md shadow-lg max-h-64 overflow-y-auto" role="listbox" aria-label="Slash commands">
 {filteredSlashCommands.map((cmd, index) =>(
 <div
 key={cmd.name}
 role="option"
 aria-selected={index === slashMenuIndex}
 className={cn(
 "flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors",
 index === slashMenuIndex ? "bg-accent text-accent-foreground" : "hover-elevate"
 )}
 onClick={() =>selectSlashCommand(cmd.name)}
 data-testid={`slash-command-item-${cmd.name}`}
 >
 <Badge variant="secondary" className="font-mono text-xs shrink-0 no-default-hover-elevate no-default-active-elevate">/{cmd.name}</Badge>
 <span className="text-sm text-muted-foreground truncate">{cmd.description}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 {pendingAttachment && (
 <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-lg border border-border mb-1" data-testid="attachment-preview">
 {pendingAttachment.type === 'image' && pendingAttachment.previewUrl ? (
 <img src={pendingAttachment.previewUrl} alt="Preview" width={48} height={48} className="h-12 w-12 rounded object-cover" />
 ) : pendingAttachment.type === 'video' ? (
 <FileUp className="h-8 w-8 text-blue-500" />
 ) : (
 <FileText className="h-8 w-8 text-muted-foreground" />
 )}
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate">{pendingAttachment.file.name}</p>
 <p className="text-[10px] text-muted-foreground">{(pendingAttachment.file.size / 1024).toFixed(0)} KB</p>
 </div>
 <Button size="icon" variant="ghost" onClick={clearPendingAttachment} data-testid="button-clear-attachment">
 <XCircle className="h-4 w-4" />
 </Button>
 </div>
 )}
 <div className="flex items-center gap-1">
 <input
 ref={fileInputRef}
 type="file"
 className="hidden"
 accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
 onChange={handleFileSelect}
 data-testid="input-file-upload"
 />
 <Button
 size="icon"
 variant="ghost"
 onClick={() =>fileInputRef.current?.click()}
 disabled={!isConnected || ticketClosed || isUploading}
 data-testid="button-attach-file"
 aria-label="Attach file"
 className="shrink-0"
 >
 <Paperclip className="h-4 w-4" />
 </Button>
 <Input
 value={inputMessage}
 onChange={(e) =>setInputMessage(e.target.value)}
 onKeyDown={handleKeyPress}
 onPaste={(e) =>{
 const items = e.clipboardData?.items;
 if (!items) return;
 for (const item of Array.from(items)) {
 if (item.type.startsWith('image/')) {
 e.preventDefault();
 const file = item.getAsFile();
 if (file) {
 const fileType = detectFileType(file);
 const previewUrl = URL.createObjectURL(file);
 setPendingAttachment(prev =>{
 if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
 return { file, previewUrl, type: fileType };
 });
 }
 return;
 }
 }
 }}
 placeholder={isInTriage ? "Describe your issue to Trinity..." : isGuest ? "Describe your issue..." : "Type message or / for commands..."}
 disabled={!isConnected || ticketClosed}
 className="flex-1 p-2 sm:p-2.5 md:p-3 border-2 border-border rounded-xl sm:rounded-2xl resize-none focus:ring-primary focus:border-primary bg-background text-foreground placeholder:text-muted-foreground text-base"
 data-testid="input-message"
 aria-label="Type a message"
 aria-describedby="chat-status-bar"
 aria-expanded={showSlashMenu}
 aria-haspopup="listbox"
 autoFocus
 />
 </div>
 </div>
 <Button
 onClick={handleSendMessage}
 disabled={!isConnected || (!inputMessage.trim() && !pendingAttachment) || ticketClosed || isUploading}
 variant="default"
 className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-xl sm:rounded-2xl font-semibold shadow-sm transition-all h-auto text-base flex-shrink-0"
 data-testid="button-send"
 aria-label="Send message"
 >
 {isUploading ? (
 <RefreshCw className="w-4 h-4 animate-spin" />
 ) : (
 <Send className="w-4 h-4 sm:mr-1" />
 )}
 <span className="hidden sm:inline">{isUploading ? 'Uploading...' : 'Send'}</span>
 </Button>
 </>
 )}
 </div>
 <div className="mt-2 px-1" data-testid="chat-status-bar" id="chat-status-bar">
 <AnimatedStatusBar
 isSilenced={isSilenced}
 isConnected={isConnected}
 typingUser={typingUserInfo}
 justGotVoice={justGotVoice}
 />
 </div>
 </div>
 </section>

 {/* RIGHT COLUMN: User List or Context Panel - Always mounted, CSS hidden on mobile */}
 {/* VISUAL PERSISTENCE PATTERN: Keep mounted to prevent Radix ScrollArea ref crash */}
 <section className={cn(
 "min-w-[280px] max-w-[320px] w-auto bg-muted border-l border-border flex flex-col flex-shrink-0",
 shouldUseMobileLayout && "hidden"
 )}>
 
 {/* Header with toggle */}
 <div className="px-3 py-2 border-b border-border flex-shrink-0 bg-muted/50">
 <div className="flex items-center gap-1.5">
 {showContextPanel && isStaff ? (
 <>
 <Info className="w-4 h-4 text-primary flex-shrink-0" />
 <h2 className="text-sm font-bold text-foreground">
 Ticket Context
 </h2>
 </>
 ) : (
 <>
 <Users className="w-4 h-4 text-primary flex-shrink-0" />
 <h2 className="text-sm font-bold text-foreground">
 Online Users
 </h2>
 </>
 )}
 {isStaff && (
 <Button
 variant="ghost"
 size="sm"
 className="ml-auto h-5 px-2 text-[9px]"
 onClick={() =>setShowContextPanel(!showContextPanel)}
 data-testid="toggle-context-panel"
 aria-label={showContextPanel ? 'Show online users' : 'Show ticket context'}
 >
 {showContextPanel ? 'Users' : 'Context'}
 </Button>
 )}
 {!showContextPanel && (
 <Badge variant="default" className="ml-auto text-xs px-1.5 py-0 bg-primary text-white" data-testid="text-user-count">
 {uniqueUsers.length}
 </Badge>
 )}
 </div>
 {!showContextPanel && isStaff && (
 <div className="mt-2">
 <Select value={priorityFilter} onValueChange={(value: any) =>setPriorityFilter(value)}>
 <SelectTrigger data-testid="select-priority-filter" className="h-8 text-xs">
 <SelectValue placeholder="Filter by priority" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all"> All Priorities</SelectItem>
 <SelectItem value="low"> Low Priority</SelectItem>
 <SelectItem value="medium"> Medium Priority</SelectItem>
 <SelectItem value="high"> High Priority</SelectItem>
 </SelectContent>
 </Select>
 </div>
 )}
 </div>
 
 {/* Content Area - Context Panel or User List */}
 {/* VISUAL PERSISTENCE PATTERN: Keep both mounted, use CSS to toggle visibility */}
 {/* This prevents Radix ScrollArea ref thrashing crash during unmount */}
 
 {/* Context Panel - Always mounted, CSS toggled */}
 <div className={cn(
 "transition-all duration-200 ease-in-out overflow-hidden",
 showContextPanel && isStaff && selectedUserId 
 ? "flex-grow opacity-100" 
 : "h-0 w-0 opacity-0 overflow-hidden pointer-events-none absolute"
 )}>
 <TicketContextPanel
 user={{
 id: selectedUserId || '',
 name: uniqueUsers.find(u =>u.id === selectedUserId)?.name || "User",
 subscriptionTier: "professional" as const,
 accountCreated: new Date().toISOString().split('T')[0],
 } as any}
 previousTickets={[]}
 suggestedArticles={[]}
 />
 </div>
 
 {/* User List - Always mounted, CSS toggled */}
 {/* SIMPLIFIED: Using native overflow-auto to avoid Radix ScrollArea ref thrashing */}
 <div className={cn(
 "transition-all duration-200 ease-in-out",
 !(showContextPanel && isStaff && selectedUserId)
 ? "flex-grow opacity-100"
 : "h-0 w-0 opacity-0 overflow-hidden pointer-events-none absolute"
 )}>
 <div className="h-full p-2 overflow-y-auto">
 <div className="space-y-1" role="listbox" aria-label="Online users">
 {uniqueUsers.map((u) =>{
 // No IRC prefix - WF logo icon shows authority
 
 return (
 <ContextMenu key={u.id}>
 <ContextMenuTrigger>
 <div 
 className={['flex items-center gap-1.5 p-1.5 rounded-lg cursor-pointer transition-all border', selectedUserId === u.id 
 ? 'bg-muted shadow-sm border-primary/50 ring-1 ring-primary/20' 
 : 'bg-card hover:bg-muted border-border hover:border-primary/30'].join(' ')}
 onClick={() =>setSelectedUserId(u.id)}
 data-testid={`user-${u.id}`}
 role="option"
 aria-selected={selectedUserId === u.id}
 tabIndex={0}
 onKeyDown={(e) =>{ if (e.key === "Enter" || e.key === " ") setSelectedUserId(u.id); }}
 >
 {/* Status Indicator - Extra Compact */}
 <div className="flex-shrink-0">
 {getStatusIndicator(u.status || 'online')}
 </div>
 
 <div className="flex-shrink-0 relative">
 {getUserTypeIcon(u.userType || 'guest', u.role, u.name, u.platformRole)}
 {(u.status === 'online' || u.isOnline) && (
 <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" data-testid={`online-dot-${u.id}`} />
 )}
 </div>
 
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-0.5 flex-wrap">
 <span className={`text-sm font-semibold break-words ${getRoleColor(u.role, u.platformRole)}`}>
 {u.role === 'bot' ? 'Trinity Support' : u.name}
 {getRoleIcon(u.role, u.platformRole)}
 </span>
 </div>
 </div>
 </div>
 </ContextMenuTrigger>
 <ContextMenuContent className="bg-card shadow-lg border-2 border-border w-72 z-50">
 {isStaff && u.role !== 'bot' && (userPlatformRole === 'root_admin' || (u.platformRole || u.role) !== 'root_admin') ? (
 <>
 <div className="px-2 py-1.5 text-sm font-bold text-foreground border-b border-border">
 {u.name}
 </div>
 
 {/* View Profile - Available to Everyone */}
 <ContextMenuItem onClick={() =>{
 setSelectedUserId(u.id);
 setShowUserProfile(true);
 }}>
 <Info className="w-4 h-4 mr-2" />
 View Profile
 </ContextMenuItem>
 
 {/* Quick Actions - Top Level */}
 {hasContextPermission(ALL_STAFF) && (
 <>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'release_spectator', targetUserId: u.id });
 sendQuickMessage(`Hi ${u.name}! My name is ${userName}, I'm here to help you today. What can I assist you with?`);
 }}>
 Welcome
 </ContextMenuItem>
 
 <ContextMenuItem onClick={() =>handleQuickReply(u)}>
 Quick Reply
 </ContextMenuItem>
 </>
 )}
 
 {/* Chat Commands Submenu */}
 {hasContextPermission(ALL_STAFF) && (
 <ContextMenuSub>
 <ContextMenuSubTrigger>
 Chat Commands
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'info', message: 'Please provide more details' });
 }}>
 Request Info
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleInternalNote(u)}>
 Internal Note
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>toggleSilence(u)}>
 {silencedUsers.has(u.id) ? ' Unmute User' : ' Silence User'}
 </ContextMenuItem>
 </ContextMenuSubContent>
 </ContextMenuSub>
 )}
 
 {/* Account Actions Submenu */}
 {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
 <ContextMenuSub>
 <ContextMenuSubTrigger>
 Account Actions
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>handleVerifyIdentity(u)}>
 Verify Identity
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleViewSessions(u)}>
 View Sessions
 </ContextMenuItem>
 {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
 <>
 <ContextMenuSeparator />
 <ContextMenuLabel className="text-xs text-muted-foreground"> Password & Email</ContextMenuLabel>
 <ContextMenuItem onClick={() =>handleResetPassword(u)}>
 Reset Password
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleResetEmail(u)}>
 Reset Email
 </ContextMenuItem>
 <ContextMenuSeparator />
 <ContextMenuLabel className="text-xs text-muted-foreground"> Account Status</ContextMenuLabel>
 <ContextMenuItem onClick={() =>handleUnlockAccount(u)}>
 Unlock Account
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleLockAccount(u)} className="text-red-600">
 Lock Account
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleRevokeSessions(u)} className="text-orange-600">
 Revoke All Sessions
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
 Documents
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'document', message: 'Please upload the document' });
 trackDocumentRequest(u.id, 'document');
 }}>
 {hasRequestedDocument(u.id, 'document') ? ' Already Asked: Document' : ' Request Document'}
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'photo', message: 'Please upload a photo' });
 trackDocumentRequest(u.id, 'photo');
 }}>
 {hasRequestedDocument(u.id, 'photo') ? ' Already Asked: Photo' : ' Request Photo'}
 </ContextMenuItem>
 {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
 <>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'request_secure', targetUserId: u.id, requestType: 'signature', message: 'Please sign the form' });
 trackDocumentRequest(u.id, 'signature');
 }}>
 {hasRequestedDocument(u.id, 'signature') ? ' Already Asked: Signature' : ' Request E-Signature'}
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleViewDocuments(u)}>
 View Uploads
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
 Case Management
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>{
 sendQuickMessage(`@${u.name} Your issue has been resolved! Anything else I can help with?`);
 }}>
 Mark Resolved
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleEscalate(u)}>
 Escalate
 </ContextMenuItem>
 {hasContextPermission(DEPUTY_ASSISTANT_PLUS) && (
 <>
 <ContextMenuItem onClick={() =>{
 sendRawMessage({ type: 'transfer_user', targetUserId: u.id });
 }}>
 Transfer
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleFollowUp(u)}>
 Follow-up
 </ContextMenuItem>
 </>
 )}
 {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
 <ContextMenuItem onClick={() =>handlePriorityTag(u)}>
 Priority Tag
 </ContextMenuItem>
 )}
 </ContextMenuSubContent>
 </ContextMenuSub>
 )}
 
 {/* Advanced Tools Submenu */}
 {hasContextPermission(DEPUTY_ADMIN_PLUS) && (
 <ContextMenuSub>
 <ContextMenuSubTrigger>
 Advanced Tools
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>handleEmailSummary(u)}>
 Email Summary
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleMarkVIP(u)}>
 Mark VIP
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleUserHistory(u)}>
 User History
 </ContextMenuItem>
 </ContextMenuSubContent>
 </ContextMenuSub>
 )}
 
 {/* Moderation Submenu */}
 {hasContextPermission(ADMIN_ONLY) && (
 <ContextMenuSub>
 <ContextMenuSubTrigger className="text-red-600">
 Moderation
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>handleIssueWarning(u)}>
 Issue Warning
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleTempMute(u)}>
 ⏱ Mute 5min
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>setKickDialogUser({ userId: u.id, userName: u.name })} className="text-red-600">
 Kick
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>toggleBan(u)} className="text-red-700 font-bold">
 {bannedUsers.has(u.id) ? ' Unban User' : ' Ban User'}
 </ContextMenuItem>
 </ContextMenuSubContent>
 </ContextMenuSub>
 )}
 
 {/* System Tools Submenu */}
 {hasContextPermission(SYSTEM_ONLY) && (
 <ContextMenuSub>
 <ContextMenuSubTrigger>
 System Tools
 </ContextMenuSubTrigger>
 <ContextMenuSubContent>
 <ContextMenuItem onClick={() =>handleAnalytics()}>
 Analytics
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleForceReconnect(u)}>
 Reconnect
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleTestMessage()}>
 Test Message
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleClearCache(u)}>
 Clear Cache
 </ContextMenuItem>
 </ContextMenuSubContent>
 </ContextMenuSub>
 )}
 </>
 ) : (
 <>
 {isStaff && (
 <ContextMenuItem onClick={() =>{
 setDiagnosticsUserId(u.id);
 setShowDiagnostics(true);
 }} data-testid={`button-view-profile-${u.id}`}>
 <Eye className="w-4 h-4 mr-2" />
 View Profile (AI Diagnostics™)
 </ContextMenuItem>
 )}
 <ContextMenuItem onClick={() =>{
 setSelectedUserId(u.id);
 setShowUserProfile(true);
 }}>
 <Info className="w-4 h-4 mr-2" />
 View Basic Info
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>handleMention(u.name)}>
 <MessageSquare className="w-4 h-4 mr-2" />
 Mention {u.name}
 </ContextMenuItem>
 
 {/* Customer Help Tools - Show when customer clicks on staff */}
 {!isStaff && u.userType === 'staff' && (
 <>
 <ContextMenuSeparator />
 <div className="px-2 py-1 text-xs text-muted-foreground font-medium"> Help Tools</div>
 <ContextMenuItem onClick={() =>{
 sendQuickMessage(`/dm ${u.name} [Private Message]`);
 }}>
 <MessageSquare className="w-4 h-4 mr-2 text-blue-500" />
 Private Message
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>{
 sendQuickMessage(`/screenshot @${u.name}`);
 toast({
 title: "Screenshot Request",
 description: "Use the attachment button to upload a screenshot",
 });
 }}>
 <Camera className="w-4 h-4 mr-2 text-teal-500" />
 Send Screenshot
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>{
 sendQuickMessage(`/verifyme @${u.name} Please verify my account`);
 }}>
 <UserCheck className="w-4 h-4 mr-2 text-green-500" />
 Verify My Account
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>{
 sendQuickMessage(`/help @${u.name} I need assistance`);
 }}>
 <HelpCircle className="w-4 h-4 mr-2 text-purple-500" />
 Request Help
 </ContextMenuItem>
 <ContextMenuItem onClick={() =>{
 setReportIssueDialogUser({ userId: u.id, userName: u.name });
 }}>
 <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
 Report Issue
 </ContextMenuItem>
 </>
 )}
 </>
 )}
 </ContextMenuContent>
 </ContextMenu>
 );
 })}
 </div>
 </div>
 </div>
 </section>
 </main>

 {/* GUEST INTAKE FORM - Collects guest information for support agents */}
 {/* Non-closeable until all required fields are filled - prevents users from entering chat without ticket info */}
 <UniversalModal open={showGuestIntakeForm && !hasCompletedIntake} onOpenChange={(open) =>{
 // Only allow closing if form is complete (prevents accidental disconnect)
 if (!open && !isFormComplete()) {
 // Form incomplete - prevent closing
 toast({
 title: "Information Required",
 description: "Please complete all fields before continuing. We need this info to help you.",
 variant: "destructive",
 });
 return; // Don't close dialog
 }
 if (!open && isFormComplete()) {
 // Form complete - allow closing (user submitted)
 setShowGuestIntakeForm(false);
 }
 }}>
 <UniversalModalContent 
 className="sm:max-w-md" 
 showHomeButton={true}
 homeButtonPath="/pricing"
 isGuest={true}
 // @ts-expect-error — TS migration: fix in refactoring sprint
 onPointerDownOutside={(e: any) =>{
 // Prevent closing by clicking outside dialog if form is incomplete
 if (!isFormComplete()) {
 e.preventDefault();
 }
 }}
 >
 <UniversalModalHeader>
 <UniversalModalTitle> Welcome to CoAIleague Support</UniversalModalTitle>
 <UniversalModalDescription>
 Please provide some information so our support team can better assist you.
 </UniversalModalDescription>
 </UniversalModalHeader>
 <div className="space-y-4">
 <div>
 <Label htmlFor="guest-name" className="text-base font-medium"> Name <span className="text-red-600">*</span></Label>
 <Input
 id="guest-name"
 placeholder="Your name"
 value={guestIntakeData.name}
 onChange={(e) =>{
 const newData = { ...guestIntakeData, name: e.target.value };
 setGuestIntakeData(newData);
 // Real-time sync to session storage (auto-saved by useEffect)
 }}
 className="mt-1"
 required
 data-testid="input-guest-name"
 />
 </div>
 <div>
 <Label htmlFor="guest-email" className="text-base font-medium"> Email <span className="text-red-600">*</span></Label>
 <Input
 id="guest-email"
 type="email"
 placeholder="your@email.com"
 value={guestIntakeData.email}
 onChange={(e) =>{
 const newData = { ...guestIntakeData, email: e.target.value };
 setGuestIntakeData(newData);
 // Real-time sync to session storage (auto-saved by useEffect)
 }}
 className="mt-1"
 required
 pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
 data-testid="input-guest-email"
 />
 </div>
 <div>
 <Label htmlFor="issue-type" className="text-base font-medium"> Issue Type <span className="text-red-600">*</span></Label>
 <Select value={guestIntakeData.issueType} onValueChange={(value) =>{
 const newData = { ...guestIntakeData, issueType: value };
 setGuestIntakeData(newData);
 // Real-time sync to session storage (auto-saved by useEffect)
 }}>
 <SelectTrigger id="issue-type" data-testid="select-issue-type">
 <SelectValue placeholder="Select issue type" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="billing"> Billing & Payments</SelectItem>
 <SelectItem value="technical"> Technical Issue</SelectItem>
 <SelectItem value="account"> Account Help</SelectItem>
 <SelectItem value="feature"> Feature Request</SelectItem>
 <SelectItem value="other"> Other</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label htmlFor="problem-description" className="text-base font-medium"> Describe Your Issue <span className="text-red-600">*</span></Label>
 <Textarea
 id="problem-description"
 placeholder="Tell us what you're experiencing..."
 value={guestIntakeData.problemDescription}
 onChange={(e) =>{
 const newData = { ...guestIntakeData, problemDescription: e.target.value };
 setGuestIntakeData(newData);
 // Real-time sync to session storage (auto-saved by useEffect)
 }}
 className="mt-1 min-h-24 resize-none"
 required
 data-testid="textarea-problem"
 />
 </div>
 </div>
 
 {/* 7-Step Pipeline Visualization */}
 {pipelineState && (
 <div className="border-t pt-3 mt-2">
 <TicketPipelineVisualizer 
 pipelineState={pipelineState} 
 compact={false}
 className="bg-muted/30 rounded-lg"
 />
 </div>
 )}
 
 <UniversalModalFooter>
 <Button
 onClick={() =>{
 // Form is already validated by isFormComplete()
 if (isFormComplete()) {
 // Data is already persisted to session storage - create ticket
 createSupportTicketMutation.mutate();
 } else {
 let errorMsg = "Please fill in all fields to continue.";
 const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
 if (!guestIntakeData.name.trim()) errorMsg = "Please enter your name.";
 else if (!emailRegex.test(guestIntakeData.email)) errorMsg = "Please enter a valid email (must include @ and domain).";
 else if (!guestIntakeData.issueType) errorMsg = "Please select an issue type.";
 else if (!guestIntakeData.problemDescription.trim()) errorMsg = "Please describe your issue.";
 
 toast({
 title: "Missing or Invalid Information",
 description: errorMsg,
 variant: "destructive",
 });
 }
 }}
 disabled={createSupportTicketMutation.isPending || !isFormComplete()}
 className="w-full"
 data-testid="button-submit-intake"
 >
 {createSupportTicketMutation.isPending ? "Creating Ticket..." : "Start Chat"}
 </Button>
 </UniversalModalFooter>
 </UniversalModalContent>
 </UniversalModal>

 {/* Secure Request Dialog - Opens when staff requests secure info from user */}
 {secureRequest && (
 <SecureRequestDialog
 open={!!secureRequest}
 onClose={() =>setSecureRequest(null)}
 requestType={secureRequest.type}
 requestedBy={secureRequest.requestedBy}
 requestMessage={secureRequest.message}
 onSubmit={(data) =>{
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
 onConfirm={(reason) =>{
 if (kickDialogUser) {
 kickUser(kickDialogUser.userId, reason);
 // Don't show success toast immediately - wait for server confirmation
 // Server will broadcast a system message when user is actually removed
 setKickDialogUser(null);
 }
 }}
 onCancel={() =>setKickDialogUser(null)}
 />

 {/* Branded Silence Dialog - Two-step with templated reasons */}
 <SilenceDialog
 open={!!silenceDialogUser}
 userName={silenceDialogUser?.userName || ''}
 onConfirm={(duration, reason) =>{
 if (silenceDialogUser) {
 sendRawMessage({ 
 type: 'silence_user', 
 targetUserId: silenceDialogUser.userId,
 duration: parseInt(duration),
 reason: reason
 });
 setSilencedUsers(prev =>{
 const next = new Set(prev);
 next.add(silenceDialogUser.userId);
 return next;
 });
 toast({ 
 title: "User Silenced", 
 description: `${silenceDialogUser.userName} • ${duration}min • ${reason}`,
 });
 setSilenceDialogUser(null);
 }
 }}
 onCancel={() =>setSilenceDialogUser(null)}
 />

 {/* Reset Email Dialog */}
 <ResetEmailDialog
 open={!!resetEmailDialogUser}
 userName={resetEmailDialogUser?.userName || ''}
 onConfirm={(newEmail) =>{
 if (resetEmailDialogUser) {
 sendQuickMessage(`/resetemail ${resetEmailDialogUser.userId} ${newEmail}`);
 toast({ title: "Email Reset Initiated", description: "Awaiting verification" });
 setResetEmailDialogUser(null);
 }
 }}
 onCancel={() =>setResetEmailDialogUser(null)}
 />

 {/* Report Issue Dialog */}
 <ReportIssueDialog
 open={!!reportIssueDialogUser}
 targetName={reportIssueDialogUser?.userName || ''}
 onConfirm={(issue) =>{
 if (reportIssueDialogUser) {
 sendQuickMessage(`/issue @${reportIssueDialogUser.userName} ${issue}`);
 toast({ title: "Issue Reported", description: "Report submitted to platform support" });
 setReportIssueDialogUser(null);
 }
 }}
 onCancel={() =>setReportIssueDialogUser(null)}
 />

 {/* AI Diagnostics™ - User Diagnostics Panel (Desktop) */}
 <UserDiagnosticsPanel
 userId={diagnosticsUserId}
 open={showDiagnostics}
 onClose={() =>{
 setShowDiagnostics(false);
 setDiagnosticsUserId(null);
 }}
 variant="desktop"
 />

 {/* Tutorial Dialog */}
 {showTutorial && (
 <BrandedConfirmDialog
 open={showTutorial}
 onClose={() =>setShowTutorial(false)}
 title="HelpDesk Tutorial"
 description="Welcome to CoAIleague HelpDesk! Here's how to use the system: 1) Use the command buttons to quickly access features. 2) Type /help to see all available commands. 3) Staff will assist you shortly. 4) Use the chat to describe your issue clearly."
 confirmLabel="Got it!"
 onConfirm={() =>setShowTutorial(false)}
 />
 )}

 {/* Help Command Panel */}
 <HelpCommandPanel
 open={showHelpPanel}
 onClose={() =>setShowHelpPanel(false)}
 />

 {/* Queue Manager Panel */}
 <QueueManagerPanel
 isOpen={showQueuePanel}
 onClose={() =>setShowQueuePanel(false)}
 // @ts-expect-error — TS migration: fix in refactoring sprint
 queueUsers={queueData?.map((q: any) =>({
 id: q.userId,
 name: q.userName,
 type: q.ticketNumber ? 'ticket' : 'chat',
 ticketNumber: q.ticketNumber,
 waitTime: Math.floor((Date.now() - new Date(q.joinedAt).getTime()) / 60000),
 status: q.status === 'silenced' ? 'silenced' : 'waiting',
 position: q.queuePosition,
 }))}
 onUserAction={(userId, action) =>{
 toast({
 title: "Action Executed",
 description: `${action} performed on user ${userId}`,
 });
 }}
 />

 {/* Tutorial Manager Panel */}
 <TutorialManagerPanel
 isOpen={showTutorial}
 onClose={() =>setShowTutorial(false)}
 />

 {/* Priority Manager Panel */}
 <PriorityManagerPanel
 isOpen={showPriorityPanel}
 onClose={() =>setShowPriorityPanel(false)}
 />

 {/* Room Status Dialog - Functional with Select + Textarea + Save - Mobile responsive */}
 <UniversalModal open={showRoomStatus && isStaff} onOpenChange={(open) =>{ if (!open) setShowRoomStatus(false); }}>
 <UniversalModalContent size="md" className="max-h-[calc(100vh-2rem)] overflow-y-auto">
 <UniversalModalHeader>
 <div className="flex items-center gap-3 mb-2">
 <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
 <Shield className="w-5 h-5 text-white" />
 </div>
 <div>
 <UniversalModalTitle> Change Room Status</UniversalModalTitle>
 <UniversalModalDescription>
 Update HelpDesk availability and notify users
 </UniversalModalDescription>
 </div>
 </div>
 </UniversalModalHeader>
 <div className="space-y-4 py-4">
 <div className="space-y-2">
 <Label htmlFor="status-select"> Room Status</Label>
 <Select 
 value={roomStatusControl} 
 onValueChange={(value: "open" | "closed" | "maintenance") =>setRoomStatusControl(value)}
 >
 <SelectTrigger id="status-select" data-testid="select-room-status">
 <SelectValue placeholder="Select status" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="open"> Open - Accepting Support Requests</SelectItem>
 <SelectItem value="closed"> Closed - No Support Available</SelectItem>
 <SelectItem value="maintenance"> Maintenance - System Updates</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="status-message"> Status Message (Optional)</Label>
 <Textarea
 id="status-message"
 data-testid="textarea-status-message"
 placeholder="e.g., 'Back at 9 AM EST' or 'System upgrade in progress'"
 value={roomStatusMessage}
 onChange={(e) =>setRoomStatusMessage(e.target.value)}
 rows={3}
 />
 </div>
 </div>
 <UniversalModalFooter>
 <Button
 variant="outline"
 onClick={() =>setShowRoomStatus(false)}
 data-testid="button-cancel-status"
 >
 Cancel
 </Button>
 <Button
 onClick={() =>{
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
 </UniversalModalFooter>
 </UniversalModalContent>
 </UniversalModal>

 {/* Account Support Panel */}
 <AccountSupportPanel
 isOpen={showAccountPanel}
 onClose={() =>setShowAccountPanel(false)}
 accountInfo={user ? {
 id: user.id,
 name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
 email: user.email,
 status: 'active',
 tier: (user as any).subscriptionTier || 'free'
 } : undefined}
 isStaff={isStaff}
 onAction={(action, data) =>{
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
 onAcknowledge={() =>{
 if (motdData) {
 acknowledgeMOTD.mutate(motdData.id);
 }
 }}
 onClose={() =>{
 if (!motdData?.requiresAcknowledgment) {
 setShowMotd(false);
 }
 }}
 />


 {/* Controls Menu - Slide-Over Panel (Emerald Color Scheme) */}
 <UniversalModal open={showControlsMenu} onOpenChange={setShowControlsMenu}>
 <UniversalModalContent className="w-full sm:max-w-2xl bg-muted border-border">
 <UniversalModalHeader className="border-b border-primary pb-4 mb-4">
 <div className="flex items-center justify-between gap-2">
 <UniversalModalTitle className="text-2xl font-bold text-primary">
 <div className="flex items-center gap-2">
 <Settings className="w-6 h-6 text-primary" />
 Controls & Actions
 </div>
 </UniversalModalTitle>
 <Button
 onClick={() =>setShowControlsMenu(false)}
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 data-testid="button-close-controls"
 >
 <X className="w-5 h-5 text-foreground dark:text-foreground hover:text-primary" />
 </Button>
 </div>
 </UniversalModalHeader>
 
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
 onStatusChange={(status) =>{
 setUserStatus(status);
 handleStatusChange(status);
 }}
 queueLength={queueLength}
 onlineStaffCount={uniqueUsers.filter(u =>u.role === 'staff' || ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(u.platformRole || u.role)).length}
 showCoffeeCup={showCoffeeCup}
 onShowHelp={() =>{
 setShowHelpPanel(true);
 setShowControlsMenu(false);
 }}
 onShowQueue={() =>{
 setShowQueuePanel(true);
 setShowControlsMenu(false);
 }}
 onShowTutorial={() =>{
 setShowTutorial(true);
 setShowControlsMenu(false);
 }}
 onShowPriority={() =>{
 setShowPriorityPanel(true);
 setShowControlsMenu(false);
 }}
 onShowAccount={() =>{
 setShowAccountPanel(true);
 setShowControlsMenu(false);
 }}
 onToggleRoomStatus={() =>{
 setShowRoomStatus(true);
 setShowControlsMenu(false);
 }}
 onToggleAI={async () =>{
 const newState = !aiEnabled;
 setAiEnabled(newState);
 
 // Send toggle to server via WebSocket
 sendRawMessage({
 type: 'ai_toggle',
 aiEnabled: newState,
 userId: user?.id,
 });
 
 toast({
 title: newState ? "Trinity Support Enabled" : "Trinity Support Disabled",
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
 </UniversalModalContent>
 </UniversalModal>

 {/* User Profile/Diagnostics Dialog - Mobile responsive */}
 <UniversalModal open={showUserProfile} onOpenChange={(open) =>{
 setShowUserProfile(open);
 if (!open) setSelectedUserId(null); // Reset selection when dialog closes
 }}>
 <UniversalModalContent size="lg" className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-gradient-to-br from-white via-gray-50 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-950 border-2 border-border dark:border-gray-700 text-foreground dark:text-gray-100 [&>button]:text-muted-foreground dark:text-gray-400 dark:[&>button]:text-gray-400 [&>button]:opacity-100 [&>button]:hover:text-foreground dark:text-gray-100 dark:[&>button]:hover:text-gray-100 [&>button]:focus-visible:ring-2 [&>button]:focus-visible:ring-blue-600 dark:[&>button]:focus-visible:ring-blue-500">
 <UniversalModalHeader>
 <UniversalModalTitle className="flex items-center gap-3 text-xl text-foreground dark:text-gray-100 dark:text-gray-100">
 <UnifiedBrandLogo size="sm" variant="icon" />
 <div className="flex items-center gap-2">
 <Info className="w-5 h-5 text-blue-400" />
 User Profile & Diagnostics
 </div>
 </UniversalModalTitle>
 <UniversalModalDescription className="text-muted-foreground dark:text-gray-400 dark:text-gray-400">
 {isStaff ? 'Complete user information and diagnostics' : 'Basic user information'}
 </UniversalModalDescription>
 </UniversalModalHeader>
 
 <div className="max-h-[70vh] overflow-y-auto pr-2">
 {selectedUserId && userContextIsError ? (
 /* Error state - must be checked BEFORE userContext since errors mean userContext is undefined */
 <div className="text-center py-8">
 <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
 <p className="text-red-600 text-sm font-semibold">
 {(userContextError as any)?.error || (userContextError as any)?.message || 'User information not available'}
 </p>
 {(userContextError as any)?.suggestion && (
 <p className="text-muted-foreground dark:text-gray-400 dark:text-gray-400 text-xs mt-2">{(userContextError as any).suggestion}</p>
 )}
 {selectedUserId && (
 <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg p-3">
 <p className="text-red-700 dark:text-red-300 text-xs">
 <strong> User ID:</strong>{selectedUserId}
 </p>
 </div>
 )}
 {!isStaff && (
 <p className="text-muted-foreground dark:text-gray-400 dark:text-gray-400 text-xs mt-3 italic">
 Full user details are only visible to support staff
 </p>
 )}
 </div>
 ) : selectedUserId && userContext ? (
 <div className="space-y-4">
 {/* Detect simulated/demo users */}
 {(selectedUserId.startsWith('sim-') || selectedUserId.startsWith('demo-')) && userContext.user?.isSimulated ? (
 /* Simulated/Demo user information */
 <div className="space-y-4">
 <div className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 rounded-lg p-4 shadow-md">
 <div className="flex items-center gap-3 mb-3">
 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 shadow-md flex items-center justify-center ring-2 ring-blue-200">
 <Users size={24} className="text-white" />
 </div>
 <div>
 <h3 className="text-foreground dark:text-gray-100 font-bold text-lg">
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
 <div className="flex justify-between gap-2">
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400"> Email:</span>
 <span className="text-foreground dark:text-gray-100 dark:text-gray-100">{userContext.user.email}</span>
 </div>
 <div className="flex justify-between gap-2">
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400"> Role:</span>
 <span className="text-foreground dark:text-gray-100 dark:text-gray-100">{userContext.user.platformRole}</span>
 </div>
 <div className="flex justify-between gap-2">
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400"> User ID:</span>
 <span className="text-foreground dark:text-gray-100 font-mono text-xs">{userContext.user.id}</span>
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
 <h3 className="text-foreground dark:text-gray-100 font-bold text-lg">
 {selectedUserId.startsWith('helpbot') ? 'Trinity Support' : 'System Bot'}
 </h3>
 <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 border-blue-500/30 mt-1">
 Trinity AI System
 </Badge>
 </div>
 </div>
 <p className="text-blue-800 text-sm">
 AI-powered customer support assistant designed to provide instant responses and assistance.
 </p>
 </div>

 <div className="bg-muted/30 dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg p-4">
 <h4 className="text-foreground dark:text-gray-100 font-semibold text-sm mb-3 flex items-center gap-2">
 <Zap className="w-4 h-4 text-blue-400" />
 Capabilities
 </h4>
 <ul className="space-y-2">
 <li className="flex items-start gap-2">
 <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400 text-xs">24/7 instant customer support</span>
 </li>
 <li className="flex items-start gap-2">
 <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400 text-xs"> Automated ticket creation and routing</span>
 </li>
 <li className="flex items-start gap-2">
 <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
 <span className="text-muted-foreground dark:text-gray-400 dark:text-gray-400 text-xs"> Context-aware responses</span>
 </li>
 <li className="flex items-start gap-2">
 <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
 <span className="text-muted-foreground dark:text-gray-400 text-xs"> Human escalation when needed</span>
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
 <div className="bg-muted/30 dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg p-4">
 <h4 className="text-foreground dark:text-gray-100 font-semibold text-sm mb-3 flex items-center gap-2">
 <Info className="w-4 h-4 text-blue-400" />
 User Details
 </h4>
 <div className="space-y-3">
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Full Name</span>
 <span className="text-foreground dark:text-gray-100 text-sm font-medium">
 {userContext.user.firstName} {userContext.user.lastName}
 </span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> User ID</span>
 <span className="text-foreground dark:text-gray-100 font-mono text-xs">{userContext.user.id}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Email</span>
 <span className="text-foreground dark:text-gray-100 text-sm">{userContext.user.email || 'Not Available'}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Platform Role</span>
 <Badge variant="secondary" className="text-xs">
 {userContext.user.platformRole || 'guest'}
 </Badge>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Account Created</span>
 <span className="text-muted-foreground dark:text-gray-400 text-xs">
 {userContext.user.createdAt ? new Date(userContext.user.createdAt).toLocaleDateString() : 'N/A'}
 </span>
 </div>
 </div>
 </div>

 {userContext.workspace && (
 <div className="bg-muted/30 dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg p-4">
 <h4 className="text-foreground dark:text-gray-100 font-semibold text-sm mb-3"> Workspace Info</h4>
 <div className="space-y-3">
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Workspace</span>
 <span className="text-foreground dark:text-gray-100 text-sm">{userContext.workspace.name}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Serial Number</span>
 <span className="text-foreground dark:text-gray-100 font-mono text-xs">{userContext.workspace.serialNumber}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Subscription</span>
 <Badge variant="outline" className="text-xs">
 {userContext.workspace.subscriptionTier || 'Free'}
 </Badge>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Role</span>
 <Badge variant="secondary" className="text-xs">
 {userContext.workspace.role || 'member'}
 </Badge>
 </div>
 </div>
 </div>
 )}

 {userContext.metrics && (
 <div className="bg-muted/30 dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg p-4">
 <h4 className="text-foreground dark:text-gray-100 font-semibold text-sm mb-3"> Support Metrics</h4>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Total Tickets</span>
 <span className="text-foreground dark:text-gray-100 text-lg font-bold">{userContext.metrics.totalTickets || 0}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Active</span>
 <span className="text-blue-600 text-lg font-bold">{userContext.metrics.activeTickets || 0}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Resolved</span>
 <span className="text-blue-600 text-lg font-bold">{userContext.metrics.resolvedTickets || 0}</span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Resolution Rate</span>
 <span className="text-blue-600 text-lg font-bold">{userContext.metrics.resolutionRate || 0}%</span>
 </div>
 </div>
 </div>
 )}

 <Button
 onClick={() =>{
 toast({ 
 title: "Success", 
 description: `Viewing full history for ${userContext.user.firstName} ${userContext.user.lastName}` 
 });
 setShowUserProfile(false);
 }}
 className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-foreground dark:text-gray-100 dark:text-gray-100"
 data-testid="button-user-history"
 >
 <History className="w-4 h-4 mr-2" />
 View Full History
 </Button>
 </>
 ) : (
 /* Limited information for regular users */
 <div className="bg-muted/30 dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg p-4">
 <h4 className="text-foreground dark:text-gray-100 font-semibold text-sm mb-3"> Basic Info</h4>
 <div className="space-y-3">
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Name</span>
 <span className="text-foreground dark:text-gray-100 text-sm">
 {userContext.user.firstName} {userContext.user.lastName}
 </span>
 </div>
 <div>
 <span className="text-muted-foreground dark:text-gray-400 text-xs block mb-1"> Status</span>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
 <span className="text-primary text-sm"> Online</span>
 </div>
 </div>
 </div>
 <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
 <p className="text-primary text-xs">
 <Info className="w-3 h-3 inline mr-1" />
 Full user details are only visible to support staff
 </p>
 </div>
 </div>
 )}
 </div>
 ) : (
 /* User selected but no data available */
 <div className="text-center py-8">
 <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-muted-foreground" />
 <p className="text-muted-foreground dark:text-gray-400 text-sm"> User information unavailable</p>
 </div>
 )}
 </div>
 ) : selectedUserId && userContextIsLoading ? (
 /* Loading state with Trinity branding */
 <div className="text-center py-8 flex flex-col items-center gap-3">
 <Suspense fallback={<div className="w-16 h-16" />}>
 <TrinityArrowMark size={64} />
 </Suspense>
 <p className="text-muted-foreground dark:text-gray-400 text-sm font-medium"> Loading user information...</p>
 </div>
 ) : (
 /* No user selected or query not enabled */
 <div className="text-center py-8">
 <Info className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-muted-foreground" />
 <p className="text-muted-foreground dark:text-gray-400 text-sm"> Select a user to view their information</p>
 </div>
 )}
 </div>
 
 <UniversalModalFooter>
 <Button onClick={() =>setShowUserProfile(false)} variant="outline" className="bg-blue-50 text-foreground dark:text-gray-100 border-border" data-testid="button-close-profile">
 Close
 </Button>
 </UniversalModalFooter>
 </UniversalModalContent>
 </UniversalModal>

 {lightboxData && (
 <div
 className="fixed inset-0 z-[6000] bg-black/90 flex flex-col items-center justify-center cursor-pointer"
 onClick={() =>setLightboxData(null)}
 data-testid="image-lightbox"
 >
 <div className="absolute top-0 left-0 right-0 flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent z-[6001]">
 <div className="flex flex-col gap-0.5 text-white min-w-0">
 {lightboxData.senderName && (
 <span className="text-sm font-semibold truncate" data-testid="text-lightbox-sender">{lightboxData.senderName}</span>
 )}
 <div className="flex items-center gap-2 text-xs text-white/70">
 {lightboxData.timestamp && (
 <span data-testid="text-lightbox-timestamp">
 {new Date(lightboxData.timestamp).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
 </span>
 )}
 {lightboxData.filename && <span className="truncate max-w-[200px]" data-testid="text-lightbox-filename">{lightboxData.filename}</span>}
 </div>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="text-white shrink-0"
 onClick={(e) =>{ e.stopPropagation(); setLightboxData(null); }}
 data-testid="button-close-lightbox"
 >
 <X className="w-6 h-6" />
 </Button>
 </div>
 <img src={lightboxData.src} alt="Preview" width={1200} height={800} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg p-4" onClick={(e) =>e.stopPropagation()} />
 <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 z-[6001]">
 <p className="text-center text-xs text-white/60" data-testid="text-lightbox-proof">
 Sent{lightboxData.senderName ? ` by ${lightboxData.senderName}` : ""}{lightboxData.timestamp ? ` on ${new Date(lightboxData.timestamp).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""} — Proof of Service Record
 </p>
 </div>
 </div>
 )}

 <AlertDialog open={endChatConfirmOpen} onOpenChange={setEndChatConfirmOpen}>
   <AlertDialogContent>
     <AlertDialogHeader>
       <AlertDialogTitle>End Support Chat?</AlertDialogTitle>
       <AlertDialogDescription>
         This will close your ticket and end the support session. You can open a new ticket if you need further assistance.
       </AlertDialogDescription>
     </AlertDialogHeader>
     <AlertDialogFooter>
       <AlertDialogCancel data-testid="button-end-chat-cancel">Cancel</AlertDialogCancel>
       <AlertDialogAction
         data-testid="button-end-chat-confirm"
         onClick={() => {
           setEndChatConfirmOpen(false);
           // @ts-expect-error — TS migration: fix in refactoring sprint
           sendMessage('/quit');
           navigate('/dashboard');
         }}
       >
         End Chat
       </AlertDialogAction>
     </AlertDialogFooter>
   </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

// Default export for backward compatibility
export default HelpDesk;
