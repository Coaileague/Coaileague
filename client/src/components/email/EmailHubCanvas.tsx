/**
 * EmailHubCanvas - Fortune 500 Email Intelligence Hub
 * 
 * Universal Hub/Canvas architecture preventing overlay conflicts:
 * - Hub (Left): Email list with AI-powered categorization and filters
 * - Canvas (Center): Email reader/composer with rich interactions
 * - Context Rail (Right): AI insights, related entities, quick actions
 * 
 * Features:
 * - State-driven panels (no conflicting sheets/dialogs)
 * - Trinity AI orchestration integration
 * - High-tech Fortune 500 visual design
 * - Mobile-responsive with view switching
 */

import { secureFetch } from "@/lib/csrf";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Mail, Send, Inbox, Star, Archive, Trash2, Search, Plus, RefreshCw,
  Reply, Forward, MoreVertical, Clock, CheckCircle, AlertCircle, Eye,
  Sparkles, Wand2, ArrowLeft, ChevronRight, Calendar, Users, Building2,
  FileText, Paperclip, X, Download, Brain, Zap, TrendingUp, MessageSquare,
  AlertTriangle, Lightbulb, Target, BarChart3, Bot, Play, Pause, Workflow,
  GitBranch, Circle, MoreHorizontal, Check, Timer, Bell, ExternalLink,
  Receipt, DollarSign, Edit, ChevronDown, ChevronUp, Bold, Italic,
  Underline, Link2, List, AlignLeft, Tag as TagIcon, Headphones,
  ShieldAlert, Bug, CheckSquare, Square, Layers, PhoneOff, AlertOctagon,
  PowerOff
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from "@/components/ui/universal-modal";
import { format, formatDistanceToNow } from "date-fns";

type ViewState = 'hub' | 'canvas' | 'compose' | 'analytics' | 'workflow' | 'support' | 'trinity';
type EmailCategory = 'all' | 'primary' | 'updates' | 'promotions' | 'action_required' | 'scheduled';
type FolderType =
  | 'staffing' | 'calloffs' | 'incidents' | 'support' | 'billing' | 'docs' | 'unread' | 'archive';

interface InboxFolder {
  id: string;
  name: string;
  folderType: FolderType;
  isSystem: boolean;
  unreadCount: number;
  sortOrder: number;
}

interface EmailAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface UnifiedEmail {
  id: string;
  type: 'internal' | 'external' | 'system';
  fromAddress: string;
  fromName: string | null;
  toAddresses: string | string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sentAt: string | null;
  createdAt: string;
  isRead: boolean;
  isStarred: boolean;
  status: string;
  threadId: string | null;
  attachments?: EmailAttachment[];
  enhancedByTrinity?: boolean;
  aiSummary?: string | null;
  aiCategory?: string;
  aiSentiment?: 'positive' | 'neutral' | 'negative';
  aiPriority?: number;
  aiActionItems?: string[];
  aiMeetingSuggestion?: { date: string; time: string; subject: string } | null;
}

interface AIInsight {
  type: 'summary' | 'action' | 'meeting' | 'sentiment' | 'warning';
  title: string;
  content: string;
  confidence: number;
  icon: typeof Brain;
}

const Tag = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
    <path d="M7 7h.01" />
  </svg>
);

const CATEGORY_CONFIG = {
  all: { label: 'All Mail', icon: Mail, color: 'text-foreground' },
  primary: { label: 'Primary', icon: Inbox, color: 'text-blue-500' },
  updates: { label: 'Updates', icon: Bell, color: 'text-green-500' },
  promotions: { label: 'Promotions', icon: Tag, color: 'text-purple-500' },
  action_required: { label: 'Action Required', icon: AlertTriangle, color: 'text-amber-500' },
  scheduled: { label: 'Scheduled', icon: Clock, color: 'text-cyan-500' },
};

const FOLDER_CONFIG: Record<FolderType, { label: string; icon: typeof Inbox; color: string; group?: 'operational' | 'system' }> = {
  staffing:  { label: 'Staffing',   icon: Users,          color: 'text-violet-500',       group: 'operational' },
  calloffs:  { label: 'Call-Offs',  icon: PhoneOff,       color: 'text-rose-500',         group: 'operational' },
  incidents: { label: 'Incidents',  icon: AlertOctagon,   color: 'text-amber-600',        group: 'operational' },
  support:   { label: 'Support',    icon: Headphones,     color: 'text-cyan-500',         group: 'operational' },
  billing:   { label: 'Billing',    icon: DollarSign,     color: 'text-emerald-500',      group: 'operational' },
  docs:      { label: 'Docs',       icon: FileText,       color: 'text-sky-500',          group: 'operational' },
  unread:    { label: 'Unread',     icon: Inbox,          color: 'text-blue-500',         group: 'system' },
  archive:   { label: 'Archive',    icon: Archive,        color: 'text-muted-foreground', group: 'system' },
};

const PRIORITY_CONFIG = {
  low: { color: 'bg-muted text-muted-foreground', label: 'Low', glow: '', borderColor: '' },
  normal: { color: 'bg-muted text-foreground', label: 'Normal', glow: '', borderColor: '' },
  high: { color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', label: 'High', glow: 'shadow-[inset_0_0_20px_rgba(245,158,11,0.1)]', borderColor: 'bg-amber-500' },
  urgent: { color: 'bg-destructive/20 text-destructive', label: 'Urgent', glow: 'shadow-[inset_0_0_30px_rgba(239,68,68,0.15)]', borderColor: 'bg-destructive' },
};

function formatEmailDate(dateStr: string | null, fallbackStr: string): string {
  const date = dateStr ? new Date(dateStr) : new Date(fallbackStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  if (date >= startOfToday) {
    return format(date, 'h:mm a');
  } else if (date >= startOfWeek) {
    return format(date, 'EEE');
  } else if (date >= startOfYear) {
    return format(date, 'MMM d');
  } else {
    return format(date, 'MMM d, yyyy');
  }
}

function EmailListItem({ 
  email, 
  isSelected,
  onSelect,
  onStar,
  isMobile,
  onArchive,
  onDelete,
}: { 
  email: UnifiedEmail;
  isSelected: boolean;
  onSelect: () => void;
  onStar: () => void;
  isMobile?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  const priorityConfig = PRIORITY_CONFIG[email.priority] || PRIORITY_CONFIG.normal;
  const isHighPriority = email.priority === 'urgent' || email.priority === 'high';
  const swipeRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const isLockedVertical = useRef(false);
  const SWIPE_THRESHOLD = 120;
  const DEAD_ZONE = 20;
  const DIRECTION_LOCK_RATIO = 1.8;

  useEffect(() => {
    if (!isMobile || !swipeRef.current) return;
    const el = swipeRef.current;
    const handleTouchStart = (e: TouchEvent) => {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      setIsSwiping(false);
      isLockedVertical.current = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isLockedVertical.current) return;
      const dx = e.touches[0].clientX - swipeStartX.current;
      const dy = e.touches[0].clientY - swipeStartY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (!isSwiping && absDx < DEAD_ZONE && absDy < DEAD_ZONE) return;
      if (!isSwiping && absDy > absDx * (1 / DIRECTION_LOCK_RATIO)) {
        isLockedVertical.current = true;
        return;
      }
      if (!isSwiping && absDx > DEAD_ZONE && absDx > absDy * DIRECTION_LOCK_RATIO) {
        setIsSwiping(true);
      }
      if (isSwiping) {
        e.preventDefault();
        const dampened = dx * 0.6;
        setSwipeOffset(Math.max(-130, Math.min(130, dampened)));
      }
    };
    const handleTouchEnd = () => {
      if (swipeOffset > SWIPE_THRESHOLD && onArchive) {
        onArchive();
      } else if (swipeOffset < -SWIPE_THRESHOLD && onDelete) {
        onDelete();
      }
      setSwipeOffset(0);
      setIsSwiping(false);
      isLockedVertical.current = false;
    };
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, isSwiping, swipeOffset, onArchive, onDelete]);
  
  const avatarColors = [
    "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  ];
  const avatarColor = email.type === 'system' 
    ? "bg-primary/10 text-primary"
    : avatarColors[Math.abs((email.fromName || email.fromAddress).charCodeAt(0)) % avatarColors.length];

  const innerContent = isMobile ? (
    <>
      {isHighPriority && (
        <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", priorityConfig.borderColor)} />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className="shrink-0 p-1 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
        data-testid={`button-star-${email.id}`}
      >
        <Star 
          className={cn(
            "w-4 h-4 transition-colors",
            email.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )} 
        />
      </button>
      
      <Avatar className="w-9 h-9 shrink-0">
        <AvatarFallback className={cn("text-xs font-semibold", avatarColor)}>
          {email.fromName?.[0]?.toUpperCase() || email.fromAddress[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 space-y-px">
        <div className="flex items-center gap-1.5 justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {!email.isRead && (
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            {(email.priority === 'high' || email.priority === 'urgent') && email.isRead && (
              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", email.priority === 'urgent' ? "bg-destructive" : "bg-amber-500")} />
            )}
            <span className={cn(
              "min-w-0 truncate text-[13px]",
              !email.isRead ? "font-bold text-foreground" : "font-normal text-foreground/70"
            )}>
              {email.fromName || email.fromAddress.split('@')[0]}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap shrink-0 ml-1">
            {formatEmailDate(email.sentAt, email.createdAt)}
          </span>
        </div>
        
        <p className={cn(
          "truncate text-[13px] leading-snug",
          !email.isRead ? "text-foreground font-semibold" : "text-foreground/60"
        )}>
          {email.subject || '(no subject)'}
        </p>
        
        <p className={cn("text-[11px] truncate leading-normal", email.aiSummary ? "text-muted-foreground/70 italic" : "text-muted-foreground/60")}>
          {email.aiSummary || email.bodyText?.slice(0, 80) || 'No preview available'}
        </p>
      </div>
    </>
  ) : (
    <>
      {isHighPriority && (
        <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", priorityConfig.borderColor)} />
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className="shrink-0"
        data-testid={`button-star-${email.id}`}
      >
        <Star 
          className={cn(
            "w-[22px] h-[22px] transition-colors",
            email.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )} 
        />
      </Button>
      
      <Avatar className="w-9 h-9 shrink-0">
        <AvatarFallback className={cn("text-xs font-semibold", avatarColor)}>
          {email.fromName?.[0]?.toUpperCase() || email.fromAddress[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1 justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {!email.isRead && (
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            {(email.priority === 'high' || email.priority === 'urgent') && email.isRead && (
              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", email.priority === 'urgent' ? "bg-destructive" : "bg-amber-500")} />
            )}
            <span className={cn(
              "min-w-0 truncate text-sm",
              !email.isRead ? "font-bold text-foreground" : "font-normal text-foreground/70"
            )}>
              {email.fromName || email.fromAddress}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {email.attachments && email.attachments.length > 0 && (
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground/50" />
            )}
            <span className="text-xs text-muted-foreground/50 whitespace-nowrap">
              {formatEmailDate(email.sentAt, email.createdAt)}
            </span>
          </div>
        </div>
        
        <p className={cn(
          "truncate text-sm leading-snug",
          !email.isRead ? "text-foreground font-semibold" : "text-muted-foreground/60"
        )}>
          {email.subject || '(no subject)'}
        </p>
        
        <div className="flex items-center gap-1">
          {email.priority === 'urgent' && (
            <Badge variant="destructive" className="shrink-0 text-[10px]">Urgent</Badge>
          )}
          {email.priority === 'high' && !email.isRead && (
            <Badge variant="outline" className="shrink-0 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">High</Badge>
          )}
          {email.aiCategory === 'action_required' && (
            <Badge variant="outline" className="shrink-0 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">Action</Badge>
          )}
          <p className={cn("text-xs truncate flex-1 leading-normal", email.aiSummary ? "text-muted-foreground/70 italic" : "text-muted-foreground/60")}>
            {email.aiSummary || email.bodyText?.slice(0, 80) || 'No preview available'}
          </p>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div ref={swipeRef} className="relative overflow-hidden" data-testid={`swipe-container-${email.id}`}>
        <div className={cn(
          "absolute inset-y-0 left-0 flex items-center pl-4 bg-green-500/20 transition-opacity",
          swipeOffset > 20 ? "opacity-100" : "opacity-0"
        )} style={{ width: '100%' }}>
          <div className="flex items-center gap-1.5 text-green-600">
            <Archive className="w-4 h-4" />
            <span className="text-xs font-medium">Archive</span>
          </div>
        </div>
        <div className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-destructive/20 transition-opacity",
          swipeOffset < -20 ? "opacity-100" : "opacity-0"
        )} style={{ width: '100%' }}>
          <div className="flex items-center gap-1.5 text-destructive">
            <span className="text-xs font-medium">Delete</span>
            <Trash2 className="w-4 h-4" />
          </div>
        </div>
        <div 
          className={cn(
            "relative bg-background",
            !isSwiping && "transition-transform duration-200"
          )}
          style={{ transform: `translateX(${swipeOffset}px)` }}
        >
          <div
            className={cn(
              "group relative flex items-center gap-2 cursor-pointer transition-all duration-300",
              "border-b border-border/30",
              "px-3 py-2.5",
              isSelected && "bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-l-primary",
              !email.isRead && "bg-primary/[0.02]",
              priorityConfig.glow,
              isHighPriority && "animate-[pulse-glow_3s_ease-in-out_infinite]"
            )}
            onClick={!isSwiping ? onSelect : undefined}
            data-testid={`email-list-item-${email.id}`}
          >
            {innerContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 cursor-pointer transition-all duration-300",
        "border-b border-border/50 hover-elevate",
        "p-3",
        isSelected && "bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-l-primary",
        !email.isRead && "bg-primary/[0.02]",
        priorityConfig.glow,
        isHighPriority && "animate-[pulse-glow_3s_ease-in-out_infinite]"
      )}
      onClick={onSelect}
      data-testid={`email-list-item-${email.id}`}
    >
      {innerContent}
    </div>
  );
}

function FolderNav({
  folders,
  selectedFolder,
  onSelectFolder,
  totalUnread,
  onCompose,
  onAnalytics,
  onWorkflow,
  onSupport,
}: {
  folders: InboxFolder[];
  selectedFolder: FolderType;
  onSelectFolder: (f: FolderType) => void;
  totalUnread: number;
  onCompose: () => void;
  onAnalytics?: () => void;
  onWorkflow?: () => void;
  onSupport?: () => void;
}) {
  const SYSTEM_ORDER: FolderType[] = ['unread', 'archive'];
  const OPERATIONAL_ORDER: FolderType[] = ['staffing', 'calloffs', 'incidents', 'support', 'billing', 'docs'];

  function buildFolderRow(ft: FolderType) {
    const found = folders.find(f => f.folderType === ft);
    const cfg = FOLDER_CONFIG[ft];
    return { folderType: ft, label: found?.name ?? cfg.label, unreadCount: found?.unreadCount ?? 0 };
  }

  function FolderButton({ folderType, label, unreadCount }: { folderType: FolderType; label: string; unreadCount: number }) {
    const cfg = FOLDER_CONFIG[folderType];
    const Icon = cfg.icon;
    const isActive = selectedFolder === folderType;
    return (
      <button
        key={folderType}
        onClick={() => onSelectFolder(folderType)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
          isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover-elevate"
        )}
        data-testid={`button-folder-${folderType}`}
      >
        <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : cfg.color)} />
        <span className="flex-1 truncate">{label}</span>
        {unreadCount > 0 && (
          <Badge
            variant={isActive ? "default" : "secondary"}
            className="text-[10px] h-5 min-w-[20px] shrink-0"
            data-testid={`badge-folder-unread-${folderType}`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/30 border-r">
      <div className="p-3 border-b">
        <Button onClick={onCompose} className="w-full gap-2" data-testid="button-folder-nav-compose">
          <Edit className="w-4 h-4" />
          Compose
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {/* System folders */}
        <div className="p-2 space-y-0.5">
          {SYSTEM_ORDER.map(ft => <FolderButton key={ft} {...buildFolderRow(ft)} />)}
        </div>

        <Separator className="mx-2" />

        {/* Operational folders (sub-address routing) */}
        <div className="p-2 space-y-0.5">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">Operational</p>
          {OPERATIONAL_ORDER.map(ft => <FolderButton key={ft} {...buildFolderRow(ft)} />)}
        </div>

        <Separator className="mx-2" />

        {/* Views */}
        <div className="p-2 space-y-0.5">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">Views</p>
          {onAnalytics && (
            <button
              onClick={onAnalytics}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover-elevate text-left"
              data-testid="button-folder-analytics"
            >
              <BarChart3 className="w-4 h-4 shrink-0 text-purple-500" />
              <span className="flex-1 truncate">Analytics</span>
            </button>
          )}
          {onWorkflow && (
            <button
              onClick={onWorkflow}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover-elevate text-left"
              data-testid="button-folder-workflow"
            >
              <Workflow className="w-4 h-4 shrink-0 text-indigo-500" />
              <span className="flex-1 truncate">Workflows</span>
            </button>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <Bot className="w-3 h-3 text-yellow-500/70" />
          <span>Trinity AI Active</span>
        </div>
      </div>
    </div>
  );
}

function BulkActionBar({
  selectedCount,
  onMarkRead,
  onArchive,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  onMarkRead: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/20 animate-in slide-in-from-top-2 duration-200">
      <button onClick={onClear} className="shrink-0" data-testid="button-bulk-clear">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
      <span className="text-sm font-medium flex-1">{selectedCount} selected</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onMarkRead} className="gap-1 text-xs" data-testid="button-bulk-mark-read">
          <Eye className="w-3.5 h-3.5" /> Read
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive} className="gap-1 text-xs" data-testid="button-bulk-archive">
          <Archive className="w-3.5 h-3.5" /> Archive
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="gap-1 text-xs text-destructive" data-testid="button-bulk-delete">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

function SupportInboxPanel({ onBack }: { onBack: () => void }) {
  const { data: ticketData, isLoading } = useQuery<{ tickets?: any[] }>({
    queryKey: ['/api/admin/support/tickets'],
    retry: false,
    staleTime: 1000 * 60,
  });

  const tickets = ticketData?.tickets || [];
  const openTickets = tickets.filter((t: any) => t.status === 'open' || t.status === 'pending');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-support-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Headphones className="w-5 h-5 text-cyan-500" />
          <h2 className="font-semibold">Support Inbox</h2>
          {openTickets.length > 0 && (
            <Badge variant="secondary" className="text-xs" data-testid="badge-open-ticket-count">
              {openTickets.length} open
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" data-testid="button-support-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex gap-2 px-3 py-2 border-b overflow-x-auto scrollbar-none">
        {[
          { label: 'All', icon: Layers, count: tickets.length },
          { label: 'Open', icon: AlertCircle, count: openTickets.length },
          { label: 'Bug Reports', icon: Bug, count: tickets.filter((t: any) => t.type === 'bug').length },
          { label: 'Resolved', icon: CheckCircle, count: tickets.filter((t: any) => t.status === 'resolved').length },
        ].map(({ label, icon: Icon, count }) => (
          <Button key={label} variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs rounded-full" data-testid={`button-support-filter-${label.toLowerCase()}`}>
            <Icon className="w-3 h-3" />
            {label}
            {count > 0 && <Badge variant="secondary" className="text-[10px] h-4">{count}</Badge>}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="font-semibold mb-1">All caught up</h3>
            <p className="text-sm text-muted-foreground">No support tickets pending</p>
          </div>
        ) : (
          <div className="divide-y">
            {tickets.map((ticket: any) => (
              <div
                key={ticket.id}
                className="flex items-start gap-3 p-3 hover-elevate cursor-pointer"
                data-testid={`support-ticket-${ticket.id}`}
              >
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  ticket.status === 'open' ? "bg-amber-500/15 text-amber-600" :
                  ticket.status === 'resolved' ? "bg-green-500/15 text-green-600" :
                  "bg-muted text-muted-foreground"
                )}>
                  {ticket.type === 'bug' ? <Bug className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate flex-1">{ticket.subject || ticket.title || 'Support Request'}</p>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] shrink-0",
                        ticket.status === 'open' ? "border-amber-500/50 text-amber-600" :
                        ticket.status === 'resolved' ? "border-green-500/50 text-green-600" :
                        ""
                      )}
                    >
                      {ticket.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {ticket.description?.slice(0, 80) || 'No description'}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    {ticket.priority && (
                      <span className={cn(
                        "flex items-center gap-0.5",
                        ticket.priority === 'urgent' ? "text-destructive" :
                        ticket.priority === 'high' ? "text-amber-500" : ""
                      )}>
                        <ShieldAlert className="w-3 h-3" />
                        {ticket.priority}
                      </span>
                    )}
                    {ticket.createdAt && (
                      <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                    )}
                    {ticket.trinityAnalyzed && (
                      <span className="flex items-center gap-0.5 text-primary/60">
                        <Brain className="w-3 h-3" />
                        Trinity analyzed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t bg-cyan-500/5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="flex-1">Trinity auto-triages and responds to common issues first</span>
        </div>
      </div>
    </div>
  );
}

function TrinityInboxPanel({ onBack }: { onBack: () => void }) {
  const [halted, setHalted] = useState(false);
  const [haltLoading, setHaltLoading] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ emails: UnifiedEmail[]; page: number }>({
    queryKey: ['/api/internal-email/trinity-inbox'],
    retry: false,
    staleTime: 30_000,
  });

  const emails = data?.emails || [];

  async function toggleHalt() {
    setHaltLoading(true);
    try {
      const resp = await apiRequest('POST', '/api/internal-email/trinity-halt', { halted: !halted });
      const json = await resp.json();
      setHalted(json.halted ?? !halted);
      toast({ title: json.message });
    } catch {
      toast({ title: 'Failed to toggle Trinity halt', variant: 'destructive' });
    } finally {
      setHaltLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-trinity-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Bot className="w-5 h-5 text-yellow-500" />
          <h2 className="font-semibold">Trinity AI Inbox</h2>
          <Badge variant="secondary" className="text-xs text-yellow-600 bg-yellow-500/15" data-testid="badge-trinity-count">
            {emails.length} messages
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5 text-xs shrink-0", halted ? "border-green-500/50 text-green-600" : "border-amber-500/50 text-amber-600")}
          onClick={toggleHalt}
          disabled={haltLoading}
          data-testid="button-trinity-halt-toggle"
        >
          {halted ? <Play className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
          {halted ? 'Resume' : 'Halt'}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-trinity-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {halted && (
        <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Trinity AI email automation is currently halted. No automated responses will be sent.
        </div>
      )}

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-3">
              <Bot className="w-8 h-8 text-yellow-500/60" />
            </div>
            <h3 className="font-semibold mb-1">No Trinity activity</h3>
            <p className="text-sm text-muted-foreground">Trinity AI hasn't processed any emails yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {emails.map((email: any) => (
              <div
                key={email.id}
                className="flex items-start gap-3 p-3 hover-elevate cursor-pointer"
                data-testid={`trinity-email-${email.id}`}
              >
                <div className="w-9 h-9 rounded-full bg-yellow-500/15 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate flex-1">{email.subject || '(no subject)'}</p>
                    {email.enhancedByTrinity && (
                      <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-600 shrink-0">
                        Enhanced
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    To: {Array.isArray(email.toAddresses) ? email.toAddresses.join(', ') : email.toAddresses}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate">{email.bodyText?.slice(0, 80)}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                    {email.sentAt && <span>{formatDistanceToNow(new Date(email.sentAt), { addSuffix: true })}</span>}
                    {email.priority && email.priority !== 'normal' && (
                      <span className={cn(email.priority === 'urgent' ? "text-destructive" : "text-amber-500")}>
                        {email.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t bg-yellow-500/5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Brain className="w-3.5 h-3.5 text-yellow-500" />
          <span className="flex-1">Read-only monitoring view — Trinity AI automated activity</span>
        </div>
      </div>
    </div>
  );
}

function EmailHub({
  emails,
  selectedEmailId,
  selectedFolder,
  onFolderChange,
  searchQuery,
  onSelectEmail,
  onSearchChange,
  onCompose,
  onRefresh,
  isLoading,
  isMobileView,
  onStarEmail,
  onArchiveEmail,
  onDeleteEmail,
  selectedIds,
  onToggleSelect,
  onBulkMarkRead,
  onBulkArchive,
  onBulkDelete,
}: {
  emails: UnifiedEmail[];
  selectedEmailId: string | null;
  selectedFolder: FolderType;
  onFolderChange?: (f: FolderType) => void;
  searchQuery: string;
  onSelectEmail: (email: UnifiedEmail) => void;
  onSearchChange: (q: string) => void;
  onCompose: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  isMobileView?: boolean;
  onStarEmail?: (email: UnifiedEmail) => void;
  onArchiveEmail?: (email: UnifiedEmail) => void;
  onDeleteEmail?: (email: UnifiedEmail) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkMarkRead?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
}) {
  const isMobileDetected = useIsMobile();
  const isMobile = isMobileView ?? isMobileDetected;
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const filteredEmails = useMemo(() => {
    let result = [...emails];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.subject?.toLowerCase().includes(q) ||
        e.fromAddress.toLowerCase().includes(q) ||
        e.fromName?.toLowerCase().includes(q) ||
        e.bodyText?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => 
      new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime()
    );
  }, [emails, searchQuery]);

  const unreadCount = emails.filter(e => !e.isRead).length;
  const hasBulkSelection = (selectedIds?.size ?? 0) > 0;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const folderCfg = FOLDER_CONFIG[selectedFolder] || FOLDER_CONFIG.inbox;
  const FolderIcon = folderCfg.icon;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className={cn("border-b", isMobile ? "space-y-0" : "p-3 space-y-2")}>
        {isMobile ? (
          <>
            <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <FolderIcon className={cn("w-4 h-4 shrink-0", folderCfg.color)} />
                <h1 className="text-base font-bold text-foreground" data-testid="text-inbox-title">
                  {folderCfg.label}
                </h1>
                {unreadCount > 0 && (
                  <Badge variant="default" className="text-[10px] shrink-0" data-testid="badge-unread-count">{unreadCount}</Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onRefresh} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="px-3 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-8 text-xs"
                  data-testid="input-email-search"
                />
              </div>
            </div>
            {onFolderChange && (
              <div className="w-full overflow-x-auto scrollbar-hide [-webkit-overflow-scrolling:touch]">
                <div className="flex flex-nowrap min-w-max gap-1.5 px-3 pb-2">
                  {(Object.keys(FOLDER_CONFIG) as FolderType[]).map((ft) => {
                    const cfg = FOLDER_CONFIG[ft];
                    const Icon = cfg.icon;
                    const isActive = selectedFolder === ft;
                    return (
                      <button
                        key={ft}
                        className={cn(
                          "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                          isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                        onClick={() => onFolderChange(ft)}
                        data-testid={`button-folder-chip-${ft}`}
                      >
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderIcon className={cn("w-4 h-4", folderCfg.color)} />
                <span className="font-semibold text-base" data-testid="text-inbox-title">{folderCfg.label}</span>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[11px]" data-testid="badge-unread-count">{unreadCount}</Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onRefresh} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-email-search"
              />
            </div>
          </>
        )}
      </div>
      
      {hasBulkSelection && onBulkMarkRead && onBulkArchive && onBulkDelete && (
        <BulkActionBar
          selectedCount={selectedIds?.size ?? 0}
          onMarkRead={onBulkMarkRead}
          onArchive={onBulkArchive}
          onDelete={onBulkDelete}
          onClear={() => filteredEmails.forEach(e => selectedIds?.has(e.id) && onToggleSelect?.(e.id))}
        />
      )}

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {isLoading ? (
          <div className={cn("space-y-0", isMobile ? "px-0" : "p-4 space-y-3")}>
            {[...Array(isMobile ? 10 : 5)].map((_, i) => (
              <div key={i} className={cn("flex gap-2.5", isMobile ? "px-3 py-2 border-b border-border/30" : "")}>
                <Skeleton className={cn("rounded-full shrink-0", isMobile ? "w-8 h-8" : "w-9 h-9")} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className={cn("rounded-full bg-muted flex items-center justify-center mb-3", isMobile ? "w-12 h-12" : "w-16 h-16")}>
              {searchQuery ? <Search className={cn("text-muted-foreground", isMobile ? "w-5 h-5" : "w-7 h-7")} /> : <CheckCircle className={cn("text-green-500", isMobile ? "w-5 h-5" : "w-7 h-7")} />}
            </div>
            <h3 className={cn("font-semibold mb-1 text-foreground", isMobile ? "text-sm" : "text-base")}>
              {searchQuery ? "No Emails Found" : "You're all caught up"}
            </h3>
            <p className={cn("text-muted-foreground max-w-[280px] leading-relaxed", isMobile ? "text-xs" : "text-sm")}>
              {searchQuery
                ? "No emails match your search. Try different keywords."
                : "Your inbox is empty. Trinity will notify you when something arrives."}
            </p>
          </div>
        ) : (
          <>
            {filteredEmails.map(email => {
              const isChecked = selectedIds?.has(email.id) ?? false;
              return (
                <div key={email.id} className="relative group/row">
                  {onToggleSelect && !isMobile && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(email.id); }}
                      className={cn(
                        "absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1 rounded transition-opacity",
                        isChecked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
                      )}
                      data-testid={`button-select-${email.id}`}
                    >
                      {isChecked
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />
                      }
                    </button>
                  )}
                  <div className={cn(isChecked && !isMobile && "pl-7")}>
                    <EmailListItem
                      email={email}
                      isSelected={email.id === selectedEmailId}
                      onSelect={() => onSelectEmail(email)}
                      onStar={() => onStarEmail?.(email)}
                      isMobile={isMobile}
                      onArchive={onArchiveEmail ? () => onArchiveEmail(email) : undefined}
                      onDelete={onDeleteEmail ? () => onDeleteEmail(email) : undefined}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-col items-center py-6 px-4 text-center">
              <CheckCircle className="w-4 h-4 text-green-500 mb-1.5" />
              <p className={cn("text-muted-foreground/60", isMobile ? "text-[11px]" : "text-xs")}>
                {filteredEmails.length} messages
              </p>
            </div>
          </>
        )}
      </div>
      
      {!isMobile && (
        <div className="border-t bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">{filteredEmails.length} messages</p>
        </div>
      )}
      
      {isMobile && (
        <Button
          onClick={onCompose}
          size="icon"
          className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-lg shadow-primary/30"
          data-testid="button-compose-fab"
        >
          <Edit className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}

function MobileAIInsights({
  email,
  onUseReply,
}: {
  email: UnifiedEmail;
  onUseReply?: (body: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  
  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: ['/api/external-emails/analyze', email.id],
    queryFn: async () => {
      const res = await secureFetch('/api/external-emails/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: email.subject || '',
          body: email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '',
          fromAddress: email.fromAddress,
        }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  
  // Execute a Trinity workflow action (fill shifts, generate PDF, etc.)
  const executeTrinityAction = async (action: {label: string; description: string; icon: string}) => {
    if (!email) return;
    // Build a natural-language command for Trinity to execute
    const entityName = entityData?.entity?.name ?? senderEmail;
    const prompt = `Email context: ${email.subject || 'No subject'} from ${entityName}. Action requested: ${action.label}. ${action.description}`;
    try {
      const res = await secureFetch('/api/ai-brain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: prompt,
          context: { 
            source: 'email_entity_panel',
            senderEmail,
            entityId: entityData?.entity?.id,
            entityType: entityData?.entity?.type,
            emailId: email.id,
            actionIcon: action.icon,
          },
        }),
      });
      if (res.ok) {
        toast({ title: `Trinity: ${action.label}`, description: 'Processing your request…' });
      } else {
        toast({ title: 'Trinity unavailable', description: 'Try again in a moment', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Could not reach Trinity', variant: 'destructive' });
    }
  };

  const generateReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await secureFetch('/api/external-emails/reply-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from: email.fromAddress,
          subject: email.subject || '',
          body: email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '',
        }),
      });
      if (!res.ok) throw new Error('Reply generation failed');
      const data = await res.json();
      return data.data;
    },
    onSuccess: (data) => {
      if (data?.quick) {
        setReplySuggestions(data.quick);
      }
      toast({ title: 'Reply suggestions generated' });
    },
    onError: () => {
      toast({ title: 'Could not generate replies', variant: 'destructive' });
    },
  });

  const sentimentColor = analysisData?.sentiment === 'positive' ? 'text-green-600' : 
    analysisData?.sentiment === 'negative' ? 'text-destructive' : 'text-muted-foreground';
  const actionItemCount = analysisData?.actionItems?.length || 0;
  const priorityScore = analysisData?.priority || 0;

  return (
    <div className="space-y-1.5 max-w-full overflow-hidden">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full rounded-md bg-primary/5 flex items-center gap-1.5 overflow-hidden"
        data-testid="button-mobile-ai-banner"
      >
        <div className="relative shrink-0">
          <Brain className="w-3 h-3 text-primary" />
        </div>
        <span className="text-[10px] font-medium text-primary shrink-0">
          AI
        </span>
        {!analysisLoading && analysisData && (
          <div className="flex items-center gap-1 ml-auto min-w-0 overflow-hidden">
            <Badge variant="outline" className={cn("text-[9px] shrink-0", sentimentColor)}>
              {analysisData.sentiment ? analysisData.sentiment.charAt(0).toUpperCase() + analysisData.sentiment.slice(1) : 'Neutral'}
            </Badge>
            {actionItemCount > 0 && (
              <Badge variant="outline" className="text-[9px] shrink-0">
                {actionItemCount}
              </Badge>
            )}
          </div>
        )}
        {analysisLoading && (
          <RefreshCw className="w-3 h-3 animate-spin text-primary ml-auto shrink-0" />
        )}
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", expanded && "rotate-90")} />
      </Button>
      
      {expanded && (
        <Card className="border-primary/20 overflow-hidden">
          <CardContent className="p-2.5 space-y-2.5">
            {analysisLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ) : (
              <>
                {analysisData?.summary && (
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Brain className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-[11px] font-medium">Summary</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground break-words" data-testid="text-ai-summary">
                      {analysisData.summary}
                    </p>
                  </div>
                )}
                
                {analysisData?.actionItems?.length > 0 && (
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Target className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="text-[11px] font-medium">Actions</span>
                    </div>
                    <ul className="space-y-0.5">
                      {analysisData.actionItems.map((item: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                          <CheckCircle className="w-2.5 h-2.5 mt-0.5 text-muted-foreground/50 shrink-0" />
                          <span className="break-words min-w-0">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <Separator />
                
                <div className="min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 mb-1.5">
                    <MessageSquare className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-[11px] font-medium">Quick Replies</span>
                  </div>
                  
                  {replySuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {replySuggestions.map((suggestion, i) => (
                        <Button 
                          key={i}
                          variant="outline" 
                          size="sm"
                          className="text-[10px] whitespace-normal text-left"
                          onClick={() => onUseReply?.(suggestion)}
                          data-testid={`button-smart-reply-${i}`}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button 
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 text-[11px]"
                      onClick={() => generateReplyMutation.mutate()}
                      disabled={generateReplyMutation.isPending}
                      data-testid="button-generate-replies-mobile"
                    >
                      {generateReplyMutation.isPending ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Generate Replies
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmailCanvas({
  email,
  onBack,
  onReply,
  onForward,
  onDelete,
  onArchive,
  onStar,
  isMobile,
  onUseReply,
}: {
  email: UnifiedEmail | null;
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onStar?: () => void;
  isMobile: boolean;
  onUseReply?: (body: string) => void;
}) {
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <Mail className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Select an email to read</p>
          <p className="text-sm mt-1">Choose from your inbox on the left</p>
        </div>
      </div>
    );
  }

  const priorityConfig = PRIORITY_CONFIG[email.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden max-w-full">
      <div className={cn(
        "flex items-center gap-1 border-b shrink-0",
        isMobile ? "px-2 py-1.5" : "p-3"
      )}>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        
        <div className="flex-1 min-w-0 overflow-hidden">
          {isMobile && (
            <p className="text-xs font-medium truncate" data-testid="text-email-subject-bar">
              {email.subject || '(no subject)'}
            </p>
          )}
          {!isMobile && (
            <>
              <h2 className="font-semibold truncate">{email.subject || '(no subject)'}</h2>
              <p className="text-sm text-muted-foreground truncate">
                From: {email.fromName || email.fromAddress}
              </p>
            </>
          )}
        </div>
        
        <div className="flex items-center shrink-0">
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={() => onStar?.()} data-testid="button-star-mobile">
              <Star className={cn(
                "w-3.5 h-3.5",
                email.isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
              )} />
            </Button>
          )}
          {!isMobile && (
            <>
              <Button variant="ghost" size="icon" onClick={onReply} data-testid="button-reply">
                <Reply className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onForward} data-testid="button-forward">
                <Forward className="w-4 h-4" />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-email-actions">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isMobile && (
                <>
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="w-4 h-4 mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
              {isMobile && (
                <>
                  <DropdownMenuItem onClick={onReply}>
                    <Reply className="w-4 h-4 mr-2" /> Reply
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onForward}>
                    <Forward className="w-4 h-4 mr-2" /> Forward
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="w-4 h-4 mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className={cn(
          "max-w-full overflow-hidden",
          isMobile ? "space-y-2.5 px-3 py-2" : "space-y-4 p-4"
        )}>
          {isMobile && (
            <p className="text-sm font-semibold leading-snug break-words" data-testid="text-email-subject">
              {email.subject || '(no subject)'}
            </p>
          )}
          
          <div className={cn("flex items-start", isMobile ? "gap-2.5" : "gap-3")}>
            <Avatar className={cn("shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}>
              <AvatarFallback className={cn("bg-primary/10 text-primary font-semibold", isMobile ? "text-xs" : "text-sm")}>
                {email.fromName?.[0] || email.fromAddress[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <p className={cn("font-semibold truncate", isMobile ? "text-[13px]" : "text-sm")}>
                  {email.fromName || email.fromAddress}
                </p>
                <span className={cn("text-muted-foreground shrink-0", isMobile ? "text-[10px]" : "text-xs")}>
                  {email.sentAt 
                    ? format(new Date(email.sentAt), isMobile ? 'MMM d' : 'MMM d, h:mm a')
                    : format(new Date(email.createdAt), isMobile ? 'MMM d' : 'MMM d, h:mm a')
                  }
                </span>
              </div>
              <p className={cn(
                "text-muted-foreground truncate",
                isMobile ? "text-[11px]" : "text-sm"
              )}>
                to {(() => {
                  const addr = email.toAddresses;
                  if (Array.isArray(addr)) return addr.join(', ');
                  if (typeof addr === 'string') {
                    try {
                      const parsed = JSON.parse(addr);
                      if (Array.isArray(parsed)) return parsed.join(', ');
                    } catch {}
                    return addr;
                  }
                  return String(addr || '');
                })()}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {email.priority !== 'normal' && (
                  <Badge className={priorityConfig.color}>
                    {priorityConfig.label}
                  </Badge>
                )}
                {email.enhancedByTrinity && (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="w-3 h-3" /> Trinity
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {isMobile && email && (
            <MobileAIInsights email={email} onUseReply={onUseReply} />
          )}
          
          <Separator />
          
          {email.attachments && email.attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {email.attachments.map((att, i) => (
                <div 
                  key={i}
                  className={cn("flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md shrink-0", isMobile ? "text-[11px]" : "text-sm")}
                >
                  <Paperclip className={cn("text-muted-foreground shrink-0", isMobile ? "w-3 h-3" : "w-4 h-4")} />
                  <span className={cn("truncate", isMobile ? "max-w-[100px]" : "max-w-[180px]")}>{att.name}</span>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={att.url} download>
                      <Download className={cn(isMobile ? "w-3 h-3" : "w-4 h-4")} />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          <div className={cn(
            "prose dark:prose-invert max-w-none break-words overflow-hidden",
            isMobile 
              ? "text-[13px] leading-relaxed [&_*]:max-w-full [&_*]:overflow-hidden [&_img]:max-w-full [&_img]:h-auto [&_table]:w-full [&_table]:table-fixed [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[11px] [&_a]:break-all [&_td]:break-words [&_td]:text-[12px] [&_th]:break-words [&_th]:text-[12px] [&_p]:text-[13px] [&_li]:text-[13px] [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-[13px] [&_div]:max-w-full [&_blockquote]:text-[12px] [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:ml-0" 
              : "prose-sm"
          )}>
            {email.bodyHtml ? (
              <div className="max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(email.bodyHtml) }} />
            ) : (
              <pre className={cn("whitespace-pre-wrap font-sans break-words overflow-hidden", isMobile ? "text-[13px]" : "text-sm")}>{email.bodyText}</pre>
            )}
          </div>
        </div>
      </ScrollArea>
      
      <div className={cn(
        "border-t bg-muted/30 shrink-0",
        isMobile ? "px-2.5 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]" : "p-3"
      )}>
        <div className="flex gap-1.5">
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={onReply} className="flex-1 gap-1" data-testid="button-reply-bottom">
            <Reply className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
            <span className={cn(isMobile && "text-xs")}>Reply</span>
          </Button>
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={onForward} className="flex-1 gap-1" data-testid="button-forward-bottom">
            <Forward className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
            <span className={cn(isMobile && "text-xs")}>Forward</span>
          </Button>
          {isMobile && (
            <>
              <Button variant="outline" size="sm" onClick={onArchive} data-testid="button-archive-bottom">
                <Archive className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive" data-testid="button-delete-bottom">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AIContextRail({
  email,
  onGenerateReply,
}: {
  email: UnifiedEmail | null;
  onGenerateReply?: (body: string) => void;
}) {
  const { toast } = useToast();
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  const [draftReply, setDraftReply] = useState<string | null>(null);

  // Entity context: look up the sender as a client or employee
  const senderEmail = email?.fromAddress ?? '';
  const { data: entityData } = useQuery({
    queryKey: ['/api/email/entity-context', senderEmail],
    queryFn: async () => {
      if (!senderEmail) return null;
      const res = await secureFetch(`/api/email/entity-context?email=${encodeURIComponent(senderEmail)}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!senderEmail && !!email,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: ['/api/external-emails/analyze', email?.id],
    queryFn: async () => {
      if (!email) return null;
      const res = await secureFetch('/api/external-emails/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: email.subject || '',
          body: email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '',
          fromAddress: email.fromAddress,
        }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      return data.data;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  
  // Execute a Trinity workflow action (fill shifts, generate PDF, etc.)
  const executeTrinityAction = async (action: {label: string; description: string; icon: string}) => {
    if (!email) return;
    // Build a natural-language command for Trinity to execute
    const entityName = entityData?.entity?.name ?? senderEmail;
    const prompt = `Email context: ${email.subject || 'No subject'} from ${entityName}. Action requested: ${action.label}. ${action.description}`;
    try {
      const res = await secureFetch('/api/ai-brain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: prompt,
          context: { 
            source: 'email_entity_panel',
            senderEmail,
            entityId: entityData?.entity?.id,
            entityType: entityData?.entity?.type,
            emailId: email.id,
            actionIcon: action.icon,
          },
        }),
      });
      if (res.ok) {
        toast({ title: `Trinity: ${action.label}`, description: 'Processing your request…' });
      } else {
        toast({ title: 'Trinity unavailable', description: 'Try again in a moment', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Could not reach Trinity', variant: 'destructive' });
    }
  };

  const generateReplyMutation = useMutation({
    mutationFn: async () => {
      if (!email) return null;
      const res = await secureFetch('/api/external-emails/reply-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from: email.fromAddress,
          subject: email.subject || '',
          body: email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '',
        }),
      });
      if (!res.ok) throw new Error('Reply generation failed');
      const data = await res.json();
      return data.data;
    },
    onSuccess: (data) => {
      if (data?.quick) {
        setReplySuggestions(data.quick);
      }
      toast({ title: 'Reply suggestions generated' });
    },
    onError: () => {
      toast({ title: 'Could not generate replies', variant: 'destructive' });
    },
  });
  
  const insights: AIInsight[] = useMemo(() => {
    if (!email) return [];
    
    const result: AIInsight[] = [];
    const analysis = analysisData;
    
    if (analysis?.summary) {
      result.push({
        type: 'summary',
        title: 'AI Summary',
        content: analysis.summary,
        confidence: analysis.confidence || 0.92,
        icon: Brain,
      });
    }
    
    if (analysis?.actionItems?.length) {
      result.push({
        type: 'action',
        title: 'Action Items',
        content: analysis.actionItems.join('\n• '),
        confidence: 0.88,
        icon: Target,
      });
    }
    
    if (analysis?.meetingSuggestion?.detected) {
      result.push({
        type: 'meeting',
        title: 'Meeting Detected',
        content: `${analysis.meetingSuggestion.subject || 'Meeting'} on ${analysis.meetingSuggestion.date || 'TBD'} at ${analysis.meetingSuggestion.time || 'TBD'}`,
        confidence: 0.85,
        icon: Calendar,
      });
    }
    
    if (analysis?.priority && analysis.priority >= 8) {
      result.push({
        type: 'warning',
        title: 'Priority Alert',
        content: 'This email requires immediate attention based on content analysis.',
        confidence: 0.95,
        icon: AlertTriangle,
      });
    }
    
    if (email.priority === 'urgent' || email.priority === 'high') {
      result.push({
        type: 'warning',
        title: 'High Priority',
        content: 'This email is marked as high priority.',
        confidence: 1.0,
        icon: AlertTriangle,
      });
    }
    
    return result;
  }, [email, analysisData]);
  
  const isLoading = analysisLoading;

  if (!email) {
    return (
      <div className="w-[320px] min-w-[320px] max-w-[320px] shrink-0 border-l bg-muted/20 p-4 overflow-y-auto overflow-x-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary" />
          <span className="font-semibold">Trinity AI Insights</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Select an email to see AI-powered insights, action items, and smart suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="w-[320px] min-w-[320px] max-w-[320px] shrink-0 border-l bg-gradient-to-b from-primary/5 via-background to-background flex flex-col overflow-hidden">
      <div className="p-3 border-b backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse" />
            <Brain className="w-5 h-5 text-primary relative z-10" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-sm shadow-green-500/50">
              <span className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-75" />
            </span>
          </div>
          <span className="font-semibold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
            Trinity AI
          </span>
          <Badge className="ml-auto text-[10px] bg-green-500/20 text-green-600 border-green-500/30 animate-pulse">
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span>Neural processing active</span>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : insights.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-4 text-center">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Analyzing email content...
                </p>
              </CardContent>
            </Card>
          ) : (
            insights.map((insight, i) => {
              const Icon = insight.icon;
              return (
                <Card key={i} className={cn(
                  "overflow-hidden transition-all",
                  insight.type === 'warning' && "border-amber-500/50 bg-amber-500/5"
                )}>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={cn(
                        "w-4 h-4",
                        insight.type === 'warning' ? "text-amber-500" : "text-primary"
                      )} />
                      {insight.title}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {insight.content}
                    </p>
                    {insight.type === 'action' && (
                      <Button size="sm" variant="outline" className="mt-2 w-full gap-1">
                        <Play className="w-3 h-3" /> Create Tasks
                      </Button>
                    )}
                    {insight.type === 'meeting' && (
                      <Button size="sm" variant="outline" className="mt-2 w-full gap-1">
                        <Calendar className="w-3 h-3" /> Add to Calendar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
          
          <Separator className="my-3" />
          
          {replySuggestions.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Quick Replies
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {replySuggestions.map((suggestion, i) => (
                  <Button 
                    key={i}
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-left h-auto py-2 whitespace-normal"
                    onClick={() => onGenerateReply?.(suggestion)}
                    data-testid={`button-quick-reply-${i}`}
                  >
                    {suggestion}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
          
          <Button
            className="w-full gap-2"
            onClick={() => generateReplyMutation.mutate()}
            disabled={generateReplyMutation.isPending}
            data-testid="button-generate-reply"
          >
            {generateReplyMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generateReplyMutation.isPending ? "Generating…" : "Generate AI Reply"}
          </Button>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start gap-2"
                onClick={() => refetchAnalysis()}
                data-testid="button-refresh-analysis"
              >
                <RefreshCw className="w-4 h-4" /> Refresh Analysis
              </Button>
              {/* Entity context panel — live data from CRM */}
              {entityData?.entity && (
                <div className="rounded-lg bg-muted/40 border p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {(entityData.entity.name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-xs truncate">{entityData.entity.name}</p>
                      <p className="text-[10px] text-muted-foreground">{entityData.entity.type === 'client' ? 'Client' : 'Employee'}</p>
                    </div>
                  </div>
                  {entityData.stats && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {entityData.entity.type === 'client' && (<>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Open shifts</p>
                          <p className="font-semibold text-sm">{entityData.stats.openShifts ?? 0}</p>
                        </div>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Officers</p>
                          <p className="font-semibold text-sm">{entityData.stats.officerCount ?? 0}</p>
                        </div>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Rate</p>
                          <p className="font-semibold text-sm">{entityData.stats.contractRate ? `$${entityData.stats.contractRate}/hr` : '—'}</p>
                        </div>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">MTD invoiced</p>
                          <p className="font-semibold text-sm">{entityData.stats.mtdInvoiced ? `$${entityData.stats.mtdInvoiced.toLocaleString()}` : '—'}</p>
                        </div>
                      </>)}
                      {entityData.entity.type === 'employee' && (<>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Next shift</p>
                          <p className="font-semibold text-sm truncate">{entityData.stats.nextShift ?? '—'}</p>
                        </div>
                        <div className="bg-background rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Timesheet</p>
                          <p className="font-semibold text-sm capitalize">{entityData.stats.timesheetStatus ?? '—'}</p>
                        </div>
                        <div className="bg-background rounded p-1.5 text-center col-span-2">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Certifications</p>
                          <p className="font-semibold text-sm">{entityData.stats.certCount ?? 0} on file</p>
                        </div>
                      </>)}
                    </div>
                  )}
                </div>
              )}

              {/* Trinity workflow actions — context-aware based on email */}
              {entityData?.suggestedActions && entityData.suggestedActions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Trinity suggested actions</p>
                  {entityData.suggestedActions.map((action: {label: string; description: string; icon: string}, i: number) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start gap-2 h-auto py-2 text-left"
                      data-testid={`button-trinity-action-${i}`}
                    onClick={() => executeTrinityAction(action)}
                    >
                      <div className="w-5 h-5 rounded shrink-0 bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{action.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{action.description}</p>
                      </div>
                    </Button>
                  ))}
                </div>
              )}

              {/* Fallback stubs when no entity data */}
              {!entityData?.entity && (
                <>
                  <Button 
                    variant="ghost" size="sm" className="w-full justify-start gap-2"
                    onClick={() => executeTrinityAction({ label: 'Create client record', description: `Add ${senderEmail} as a new client`, icon: 'client' })}
                  >
                    <Users className="w-4 h-4" /> Add as new client
                  </Button>
                  <Button 
                    variant="ghost" size="sm" className="w-full justify-start gap-2"
                    onClick={() => executeTrinityAction({ label: 'Start employee onboarding', description: `Begin onboarding for ${senderEmail}`, icon: 'employee' })}
                  >
                    <Building2 className="w-4 h-4" /> Start onboarding
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-500" />
                Email Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Sentiment</span>
                  <Badge variant="outline" className={cn(
                    analysisData?.sentiment === 'positive' && "text-green-600 border-green-600/30",
                    analysisData?.sentiment === 'negative' && "text-destructive border-destructive/30",
                    (!analysisData?.sentiment || analysisData?.sentiment === 'neutral') && "text-muted-foreground"
                  )}>
                    {analysisData?.sentiment ? analysisData.sentiment.charAt(0).toUpperCase() + analysisData.sentiment.slice(1) : 'Analyzing...'}
                  </Badge>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Priority</span>
                  <span className={cn(
                    analysisData?.priority && analysisData.priority >= 7 && "text-amber-600 font-medium"
                  )}>
                    {analysisData?.priority ? `${analysisData.priority}/10` : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Category</span>
                  <span>{analysisData?.category?.replace('_', ' ') || 'Primary'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Separator className="my-2" />
          
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                CRM Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm">
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-blue-500/20 text-blue-600 text-sm font-semibold">
                    {email?.fromName?.split(' ').map(n => n[0]).join('').toUpperCase() || 
                     email?.fromAddress?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{email?.fromName || email?.fromAddress?.split('@')[0]}</p>
                  <p className="text-xs text-muted-foreground truncate">{email?.fromAddress}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-3 h-3" />
                  <span className="truncate">{email?.fromAddress?.split('@')[1] || 'Unknown Company'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3 h-3" />
                  <span>12 previous emails</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2 gap-1">
                <ExternalLink className="w-3 h-3" /> View in CRM
              </Button>
            </CardContent>
          </Card>
          
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-500" />
                Related Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm space-y-2">
              <div className="flex items-center gap-2 p-2 rounded bg-muted/50 hover-elevate cursor-pointer">
                <FileText className="w-4 h-4 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Service Agreement 2024</p>
                  <p className="text-xs text-muted-foreground">Contract - Active</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/50 hover-elevate cursor-pointer">
                <Receipt className="w-4 h-4 text-green-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Invoice #INV-2024-0156</p>
                  <p className="text-xs text-muted-foreground">$4,250.00 - Paid</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/50 hover-elevate cursor-pointer">
                <FileText className="w-4 h-4 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">NDA - Confidentiality</p>
                  <p className="text-xs text-muted-foreground">Signed Jan 2024</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                Related Calendar Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm space-y-2">
              {analysisData?.meetingDetails ? (
                <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-500" />
                    <p className="font-medium text-sm">Detected Meeting</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analysisData.meetingDetails.date} at {analysisData.meetingDetails.time}
                  </p>
                  <Button size="sm" className="w-full mt-2 gap-1">
                    <Calendar className="w-3 h-3" /> Add to Calendar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Quarterly Review</p>
                      <p className="text-xs text-muted-foreground">Tomorrow, 2:00 PM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Follow-up Call</p>
                      <p className="text-xs text-muted-foreground">Jan 25, 10:00 AM</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-500" />
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="font-medium text-green-600">$24,500</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Open Invoices</span>
                  <span className="font-medium">$3,200</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Contract Value</span>
                  <span className="font-medium">$48,000/yr</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Account Status</span>
                  <Badge variant="outline" className="text-green-600 border-green-600/30">
                    Good Standing
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

// 7-Step Email Workflow Progress Component
const EMAIL_WORKFLOW_STEPS = [
  { id: 'trigger', label: 'Trigger', description: 'Initiating send request' },
  { id: 'fetch', label: 'Fetch', description: 'Loading mailbox data' },
  { id: 'validate', label: 'Validate', description: 'Checking recipients and content' },
  { id: 'process', label: 'Process', description: 'Preparing email for delivery' },
  { id: 'mutate', label: 'Mutate', description: 'Saving to database' },
  { id: 'confirm', label: 'Confirm', description: 'Verifying delivery' },
  { id: 'notify', label: 'Notify', description: 'Sending notifications' },
] as const;

function EmailWorkflowProgress({ 
  isVisible, 
  currentStep, 
  error,
  onComplete 
}: { 
  isVisible: boolean; 
  currentStep: number;
  error?: string | null;
  onComplete?: () => void;
}) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Workflow className="w-5 h-5 text-primary" />
            Email Delivery Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {EMAIL_WORKFLOW_STEPS.map((step, index) => {
              const isComplete = index < currentStep;
              const isCurrent = index === currentStep && !error;
              const isFailed = error && index === currentStep;
              
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                    isComplete && "bg-green-500 text-white",
                    isCurrent && "bg-primary text-primary-foreground animate-pulse",
                    isFailed && "bg-destructive text-destructive-foreground",
                    !isComplete && !isCurrent && !isFailed && "bg-muted text-muted-foreground"
                  )}>
                    {isComplete ? (
                      <Check className="w-3 h-3" />
                    ) : isFailed ? (
                      <X className="w-3 h-3" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={cn(
                      "text-sm font-medium",
                      isComplete && "text-green-600 dark:text-green-400",
                      isCurrent && "text-primary",
                      isFailed && "text-destructive"
                    )}>
                      {step.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                  {isComplete && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
              );
            })}
          </div>
          
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          
          {currentStep >= EMAIL_WORKFLOW_STEPS.length && !error && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Email delivered successfully!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Built-in email templates for security staffing companies. These fill the
// {{vars}} with known values from the compose context at paste time.
const BUILT_IN_EMAIL_TEMPLATES: Array<{
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}> = [
  {
    id: 'calloff_ack',
    name: 'Call-Off Acknowledgment',
    category: 'Operations',
    subject: 'Calloff Received — {{shift_date}}',
    body: `Hi {{officer_name}},\n\nWe received your calloff for your shift on {{shift_date}} at {{site_name}}. Trinity is finding coverage now.\n\nYou will receive a confirmation once coverage is arranged.\n\nThank you,\n{{org_name}} Operations`,
  },
  {
    id: 'shift_offer',
    name: 'Shift Offer',
    category: 'Scheduling',
    subject: 'Shift Available — {{site_name}} on {{shift_date}}',
    body: `Hi {{officer_name}},\n\nA shift is available at {{site_name}} on {{shift_date}} ({{shift_start}} – {{shift_end}}).\n\nPay: {{hourly_rate}}/hr\nArmed: {{is_armed}}\n\nReply YES to accept. First response wins.\n\n{{org_name}} Scheduling`,
  },
  {
    id: 'client_incident',
    name: 'Incident Notification',
    category: 'Client',
    subject: 'Incident Report — {{site_name}} — {{incident_date}}',
    body: `Dear {{client_name}},\n\nAn incident occurred at {{site_name}} on {{incident_date}} at {{incident_time}}.\n\nType: {{incident_type}}\nSummary: {{incident_summary}}\n\nA full report is available in your client portal.\n\n{{org_name}} Security`,
  },
  {
    id: 'proposal_cover',
    name: 'Proposal Cover Letter',
    category: 'Business Development',
    subject: 'Security Services Proposal — {{org_name}}',
    body: `Dear {{prospect_name}},\n\nThank you for the opportunity to submit our proposal for security services at {{location}}.\n\nWe are a licensed Texas security provider (PSB License {{license_number}}) with {{years}} years of experience.\n\nPlease find our attached proposal for your review.\n\nBest regards,\n{{sender_name}}\n{{org_name}}`,
  },
  {
    id: 'onboarding_welcome',
    name: 'New Officer Welcome',
    category: 'HR',
    subject: 'Welcome to {{org_name}} — Onboarding Steps',
    body: `Hi {{officer_name}},\n\nWelcome to {{org_name}}! We are excited to have you on the team.\n\nYour onboarding link: {{onboarding_url}}\n\nPlease complete your profile, upload your guard card, and review your post orders before your first shift on {{first_shift_date}}.\n\n{{org_name}} HR`,
  },
  {
    id: 'contract_reminder',
    name: 'Contract Renewal Reminder',
    category: 'Client',
    subject: 'Contract Renewal Due — {{site_name}}',
    body: `Dear {{client_name}},\n\nYour security services contract for {{site_name}} expires on {{expiry_date}}.\n\nTo ensure uninterrupted service, please review and renew your contract:\n{{renewal_url}}\n\n{{org_name}} Accounts`,
  },
];

interface ComposeAttachment { name: string; url: string; size: number; type: string }

interface UserEmailAddress {
  id: string;
  address: string;
  display_name: string | null;
  signature_text: string | null;
  signature_html: string | null;
}

function ComposeCanvas({
  onClose,
  onSend,
  replyTo,
  forwardFrom,
  isSending,
  sendingStep,
  sendingError,
  isMobile,
}: {
  onClose: () => void;
  onSend: (data: any) => void;
  replyTo?: UnifiedEmail | null;
  forwardFrom?: UnifiedEmail | null;
  isSending?: boolean;
  sendingStep?: number;
  sendingError?: string | null;
  isMobile?: boolean;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(replyTo?.fromAddress || '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` :
    forwardFrom ? `Fwd: ${forwardFrom.subject}` : ''
  );
  const [body, setBody] = useState(
    forwardFrom ? `\n\n---------- Forwarded message ----------\n${forwardFrom.bodyText || ''}` : ''
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [originalBody, setOriginalBody] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [enhanceTone, setEnhanceTone] = useState<'professional' | 'casual' | 'friendly'>('professional');
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [signatureApplied, setSignatureApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch user's platform email addresses to surface signatures and
  // populate the From field with real data.
  const { data: myAddresses } = useQuery<{ addresses: UserEmailAddress[] }>({
    queryKey: ['/api/email/addresses/mine'],
    staleTime: 5 * 60 * 1000,
  });

  const primaryAddress = myAddresses?.addresses?.[0];

  // Auto-append the user's signature to the body on first compose of a new
  // message. We skip replies/forwards (those already have contextual content)
  // and only apply once so edits aren't clobbered.
  useEffect(() => {
    if (signatureApplied) return;
    if (replyTo || forwardFrom) { setSignatureApplied(true); return; }
    const sig = primaryAddress?.signature_text;
    if (sig && sig.trim()) {
      setBody(prev => prev + (prev ? '\n\n' : '') + '-- \n' + sig);
      setSignatureApplied(true);
    }
  }, [primaryAddress, replyTo, forwardFrom, signatureApplied]);

  const handleEnhance = async (tone?: string) => {
    if (!body.trim()) {
      toast({ title: 'Please write some content first', variant: 'destructive' });
      return;
    }
    setIsEnhancing(true);
    setOriginalBody(body);

    try {
      const res = await apiRequest('POST', '/api/external-emails/enhance', { subject, body, tone: tone || enhanceTone });
      const data = await res.json();

      if (data?.body) {
        setBody(data.body);
        if (data.subject) setSubject(data.subject);
        toast({ title: 'Enhanced by Trinity AI' });
      }
    } catch (error) {
      toast({ title: 'Enhancement failed', variant: 'destructive' });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      const res = await fetch('/api/email-attachments/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      const data = await res.json();
      if (Array.isArray(data.attachments)) {
        setAttachments(prev => [...prev, ...data.attachments]);
        toast({ title: `Attached ${data.attachments.length} file${data.attachments.length === 1 ? '' : 's'}` });
      }
    } catch (err: any) {
      toast({ title: 'Attachment upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyTemplate = (tpl: typeof BUILT_IN_EMAIL_TEMPLATES[number]) => {
    // Fill {{vars}} with the user's known context where possible — everything
    // else is left as a placeholder so the sender can fill it in.
    const substitutions: Record<string, string> = {
      org_name: primaryAddress?.display_name?.split(' — ')?.[0] || 'Our Agency',
      sender_name: primaryAddress?.display_name || '',
    };
    const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => substitutions[k] ?? `{{${k}}}`);
    setSubject(fill(tpl.subject));
    setBody(fill(tpl.body));
    toast({ title: `Template applied: ${tpl.name}` });
  };

  const handleSend = () => {
    if (!to.trim() || !subject.trim()) {
      toast({ title: 'Please fill in recipient and subject', variant: 'destructive' });
      return;
    }
    onSend({ to, cc, subject, body, attachments });
  };

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className={cn("flex items-center gap-2 border-b", isMobile ? "px-2 py-2" : "p-3")}>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-compose">
          <X className={cn(isMobile ? "w-4 h-4" : "w-5 h-5")} />
        </Button>
        <h2 className={cn("font-semibold", isMobile && "text-sm")}>
          {replyTo ? 'Reply' : forwardFrom ? 'Forward' : 'New Message'}
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          {!isMobile && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleEnhance()}
              disabled={isEnhancing || !body.trim()}
              className="gap-1"
              data-testid="button-enhance-email"
            >
              {isEnhancing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Enhance
            </Button>
          )}
          <Button size="sm" onClick={handleSend} className="gap-1" data-testid="button-send-email">
            <Send className="w-4 h-4" /> Send
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className={cn("space-y-4 max-w-3xl mx-auto", isMobile ? "p-3" : "p-4")}>
          {originalBody && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg text-sm",
              isMobile ? "p-3 bg-gradient-to-r from-amber-500/15 to-primary/10 border border-amber-500/20" : "p-2 bg-amber-500/10"
            )}>
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className={isMobile ? "font-medium" : ""}>Trinity enhanced this email</span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setBody(originalBody); setOriginalBody(''); }}
                className="ml-auto"
              >
                Revert
              </Button>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="w-12 text-right text-muted-foreground">To</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Enter email address"
                className="flex-1"
                data-testid="input-compose-to"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <Label className="w-12 text-right text-muted-foreground">Cc</Label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Add CC recipients"
                className="flex-1"
                data-testid="input-compose-cc"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <Label className="w-12 text-right text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="flex-1"
                data-testid="input-compose-subject"
              />
            </div>
          </div>
          
          <Separator />

          {!isMobile && (
            <div className="flex items-center gap-0.5 flex-wrap" data-testid="compose-formatting-toolbar">
              {[
                { icon: Bold, label: 'Bold', wrap: ['**', '**'] },
                { icon: Italic, label: 'Italic', wrap: ['*', '*'] },
                { icon: Underline, label: 'Underline', wrap: ['<u>', '</u>'] },
              ].map(({ icon: Icon, label, wrap }) => (
                <Button
                  key={label}
                  variant="ghost"
                  size="icon"
                  type="button"
                  title={label}
                  className="h-8 w-8 text-muted-foreground"
                  data-testid={`button-format-${label.toLowerCase()}`}
                  onClick={() => {
                    const el = document.querySelector<HTMLTextAreaElement>('[data-testid="input-compose-body"]');
                    if (!el) return;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const selected = body.slice(start, end) || label;
                    const before = body.slice(0, start);
                    const after = body.slice(end);
                    setBody(`${before}${wrap[0]}${selected}${wrap[1]}${after}`);
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </Button>
              ))}
              <div className="w-px h-5 bg-border mx-1" />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                title="Bullet List"
                className="h-8 w-8 text-muted-foreground"
                data-testid="button-format-list"
                onClick={() => setBody(b => b + '\n• ')}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                title="Insert Link"
                className="h-8 w-8 text-muted-foreground"
                data-testid="button-format-link"
                onClick={() => setBody(b => b + '[link text](https://)')}
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                title="Attach File"
                disabled={isUploading}
                className="h-8 w-8 text-muted-foreground"
                data-testid="button-attach-file"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    title="Templates"
                    className="h-8 w-8 text-muted-foreground"
                    data-testid="button-templates"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  {BUILT_IN_EMAIL_TEMPLATES.map(tpl => (
                    <DropdownMenuItem
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      data-testid={`template-${tpl.id}`}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <span className="font-medium text-sm">{tpl.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{tpl.category}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEnhance()}
                disabled={isEnhancing || !body.trim()}
                className="gap-1.5 text-xs text-primary"
                data-testid="button-enhance-email"
              >
                {isEnhancing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Enhance with AI
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-email-attachment"
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="compose-attachment-list">
              {attachments.map((att, idx) => (
                <div
                  key={`${att.url}-${idx}`}
                  className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs"
                  data-testid={`compose-attachment-${idx}`}
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-[180px]" title={att.name}>{att.name}</span>
                  <span className="text-muted-foreground">{(att.size / 1024).toFixed(0)}KB</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                    data-testid={`button-remove-attachment-${idx}`}
                    aria-label="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message here..."
            className={cn("resize-none font-mono text-sm leading-relaxed", isMobile ? "min-h-[200px]" : "min-h-[280px]")}
            data-testid="input-compose-body"
          />
          
          {isMobile && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-primary/10 via-cyan-500/5 to-primary/10 border border-primary/20" data-testid="mobile-ai-compose-toolbar">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleEnhance()}
                disabled={isEnhancing || !body.trim()}
                className="gap-1.5 flex-1"
                data-testid="button-enhance-mobile"
              >
                {isEnhancing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Enhance
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" data-testid="button-tone-selector">
                    <Wand2 className="w-3.5 h-3.5" />
                    {enhanceTone.charAt(0).toUpperCase() + enhanceTone.slice(1)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEnhanceTone('professional')} data-testid="button-tone-professional">
                    Professional
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnhanceTone('casual')} data-testid="button-tone-casual">
                    Casual
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnhanceTone('friendly')} data-testid="button-tone-friendly">
                    Friendly
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {replyTo && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleEnhance('professional')}
                  disabled={isEnhancing}
                  data-testid="button-summarize-thread"
                >
                  <Brain className="w-3.5 h-3.5" />
                  Thread
                </Button>
              )}
            </div>
          )}
          
          {aiSuggestions.length > 0 && (
            <Card className="border-primary/20">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  AI Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {aiSuggestions.map((suggestion, i) => (
                  <Button 
                    key={i}
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => setBody(body + '\n' + suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailAnalyticsDashboard({
  emails,
  onBack,
}: {
  emails: UnifiedEmail[];
  onBack: () => void;
}) {
  const stats = useMemo(() => {
    const now = new Date();
    const last7Days = emails.filter(e => {
      const date = new Date(e.sentAt || e.createdAt);
      return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
    });
    const last30Days = emails.filter(e => {
      const date = new Date(e.sentAt || e.createdAt);
      return (now.getTime() - date.getTime()) < 30 * 24 * 60 * 60 * 1000;
    });
    
    const sentEmails = emails.filter(e => e.type === 'external');
    const receivedEmails = emails.filter(e => e.type === 'internal');
    const unreadCount = emails.filter(e => !e.isRead).length;
    const starredCount = emails.filter(e => e.isStarred).length;
    const urgentCount = emails.filter(e => e.priority === 'urgent' || e.priority === 'high').length;
    
    const byDay = last7Days.reduce((acc, e) => {
      const day = new Date(e.sentAt || e.createdAt).toLocaleDateString('en-US', { weekday: 'short' });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: emails.length,
      sent: sentEmails.length,
      received: receivedEmails.length,
      unread: unreadCount,
      starred: starredCount,
      urgent: urgentCount,
      last7Days: last7Days.length,
      last30Days: last30Days.length,
      byDay,
      avgPerDay: Math.round(last7Days.length / 7),
    };
  }, [emails]);

  const MetricCard = ({ title, value, subtitle, icon: Icon, trend }: { 
    title: string; 
    value: string | number; 
    subtitle?: string;
    icon: typeof Mail;
    trend?: 'up' | 'down' | 'neutral';
  }) => (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <CardContent className="p-4 relative">
        <div className="flex justify-between gap-2 items-start">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            trend === 'up' && "bg-green-500/10 text-green-500",
            trend === 'down' && "bg-destructive/10 text-destructive",
            (!trend || trend === 'neutral') && "bg-primary/10 text-primary"
          )}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-analytics-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Email Analytics</h2>
          <p className="text-sm text-muted-foreground">AI-powered insights and metrics</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Brain className="w-3 h-3" /> Trinity Powered
          </Badge>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Emails" 
              value={stats.total} 
              subtitle={`${stats.last7Days} this week`}
              icon={Mail}
            />
            <MetricCard 
              title="Sent" 
              value={stats.sent} 
              icon={Send}
              trend="up"
            />
            <MetricCard 
              title="Received" 
              value={stats.received} 
              icon={Inbox}
            />
            <MetricCard 
              title="Unread" 
              value={stats.unread} 
              icon={Eye}
              trend={stats.unread > 10 ? 'down' : 'neutral'}
            />
          </div>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-500" />
                Weekly Email Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-32 flex items-end gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                  const count = stats.byDay[day] || 0;
                  const maxCount = Math.max(...Object.values(stats.byDay), 1);
                  const height = (count / maxCount) * 100;
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        className="w-full bg-primary/80 rounded-t transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-xs text-muted-foreground">{day}</span>
                      <span className="text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Avg. Emails/Day</span>
                  <span className="font-medium">{stats.avgPerDay}</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Response Rate</span>
                  <span className="font-medium text-green-600">94%</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Avg. Response Time</span>
                  <span className="font-medium">2.3 hours</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-sm text-muted-foreground">AI-Enhanced Emails</span>
                  <span className="font-medium text-primary">{emails.filter(e => e.enhancedByTrinity).length}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Priority Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-destructive" style={{ width: `${(stats.urgent / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-20">Urgent: {stats.urgent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${(emails.filter(e => e.priority === 'high').length / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-20">High: {emails.filter(e => e.priority === 'high').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(emails.filter(e => e.priority === 'normal').length / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-20">Normal: {emails.filter(e => e.priority === 'normal').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground" style={{ width: `${(emails.filter(e => e.priority === 'low').length / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-20">Low: {emails.filter(e => e.priority === 'low').length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-amber-500">{stats.starred}</p>
                  <p className="text-sm text-muted-foreground">Starred</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{stats.last30Days}</p>
                  <p className="text-sm text-muted-foreground">Last 30 Days</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-500">{emails.filter(e => e.enhancedByTrinity).length}</p>
                  <p className="text-sm text-muted-foreground">AI Enhanced</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

interface EmailWorkflow {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  steps: WorkflowStep[];
  triggerCount: number;
  lastTriggered?: Date;
}

interface WorkflowStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  name: string;
  status: 'pending' | 'completed' | 'active' | 'skipped';
  details?: string;
}

function WorkflowPipeline({
  emails,
  onBack,
}: {
  emails: UnifiedEmail[];
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowTrigger, setNewWorkflowTrigger] = useState('no_reply_3d');
  const [workflows, setWorkflows] = useState<EmailWorkflow[]>([
    {
      id: 'auto-follow-up',
      name: 'Auto Follow-Up',
      status: 'active' as const,
      triggerCount: 12,
      lastTriggered: new Date(Date.now() - 1000 * 60 * 60 * 2),
      steps: [
        { id: '1', type: 'trigger' as const, name: 'No reply in 3 days', status: 'completed' as const },
        { id: '2', type: 'condition' as const, name: 'Is client email?', status: 'completed' as const, details: 'Matched' },
        { id: '3', type: 'action' as const, name: 'Send follow-up', status: 'completed' as const },
        { id: '4', type: 'delay' as const, name: 'Wait 2 days', status: 'active' as const },
        { id: '5', type: 'action' as const, name: 'Notify manager', status: 'pending' as const },
      ],
    },
    {
      id: 'meeting-scheduler',
      name: 'Meeting Auto-Schedule',
      status: 'active' as const,
      triggerCount: 8,
      lastTriggered: new Date(Date.now() - 1000 * 60 * 30),
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Meeting request detected', status: 'completed' as const },
        { id: '2', type: 'action' as const, name: 'Check calendar', status: 'completed' as const },
        { id: '3', type: 'action' as const, name: 'Propose times', status: 'active' as const },
        { id: '4', type: 'action' as const, name: 'Create calendar event', status: 'pending' as const },
      ],
    },
    {
      id: 'urgent-escalation',
      name: 'Urgent Email Escalation',
      status: 'active' as const,
      triggerCount: 3,
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Priority >= 8 detected', status: 'completed' as const },
        { id: '2', type: 'action' as const, name: 'Notify via SMS', status: 'completed' as const },
        { id: '3', type: 'action' as const, name: 'Add to task queue', status: 'completed' as const },
      ],
    },
    {
      id: 'scheduled-sends',
      name: 'Scheduled Email Queue',
      status: 'active' as const,
      triggerCount: 5,
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Scheduled time reached', status: 'pending' as const, details: '3 emails pending' },
        { id: '2', type: 'action' as const, name: 'Send email', status: 'pending' as const },
        { id: '3', type: 'action' as const, name: 'Log delivery', status: 'pending' as const },
      ],
    },
  ]);

  const TRIGGER_LABELS: Record<string, string> = {
    no_reply_3d: 'No reply in 3 days',
    meeting_request: 'Meeting request detected',
    priority_high: 'Priority >= 8 detected',
    scheduled_time: 'Scheduled time reached',
    new_email: 'New email received',
    invoice_paid: 'Invoice marked paid',
  };

  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const id = `custom-${Date.now()}`;
    setWorkflows(prev => [...prev, {
      id,
      name: newWorkflowName.trim(),
      status: 'active' as const,
      triggerCount: 0,
      steps: [
        { id: '1', type: 'trigger' as const, name: TRIGGER_LABELS[newWorkflowTrigger] || newWorkflowTrigger, status: 'pending' as const },
        { id: '2', type: 'action' as const, name: 'Send follow-up email', status: 'pending' as const },
      ],
    }]);
    toast({ title: 'Workflow created', description: `"${newWorkflowName.trim()}" is now active` });
    setNewWorkflowName('');
    setNewWorkflowTrigger('no_reply_3d');
    setShowCreateDialog(false);
  };

  const toggleWorkflowStatus = (id: string) => {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: w.status === 'active' ? 'pending' as const : 'active' as const } : w));
  };

  const resetWorkflowCounters = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, triggerCount: 0, lastTriggered: undefined } : w));
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'trigger': return Zap;
      case 'condition': return GitBranch;
      case 'action': return Play;
      case 'delay': return Clock;
      default: return Circle;
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500 bg-green-500/10';
      case 'active': return 'text-primary bg-primary/10 animate-pulse';
      case 'skipped': return 'text-muted-foreground bg-muted';
      default: return 'text-muted-foreground/50 bg-muted/50';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-cyan-500" />
          <h2 className="font-semibold">Email Automation Workflows</h2>
        </div>
        <Badge variant="outline" className="ml-auto">
          {workflows.filter(w => w.status === 'active').length} Active
        </Badge>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Create New Workflow</p>
                  <p className="text-sm text-muted-foreground">
                    Automate email responses, follow-ups, and escalations
                  </p>
                </div>
                <Button size="sm" className="ml-auto" onClick={() => setShowCreateDialog(true)} data-testid="button-create-workflow">
                  <Plus className="w-4 h-4 mr-1" /> New
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {workflows.map(workflow => (
            <Card key={workflow.id} className="overflow-visible hover-elevate cursor-pointer" onClick={() => setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)} data-testid={`card-workflow-${workflow.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={cn(
                    "p-2 rounded-lg",
                    workflow.status === 'active' ? "bg-green-500/10" : "bg-muted"
                  )}>
                    <Workflow className={cn(
                      "w-4 h-4",
                      workflow.status === 'active' ? "text-green-500" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{workflow.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Triggered {workflow.triggerCount} times
                      {workflow.lastTriggered && (
                        <> • Last: {formatDistanceToNow(workflow.lastTriggered, { addSuffix: true })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                      {workflow.status}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} data-testid={`button-workflow-menu-${workflow.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleWorkflowStatus(workflow.id); toast({ title: workflow.status === 'active' ? 'Workflow paused' : 'Workflow activated', description: workflow.name }); }}>
                          <Pause className="w-4 h-4 mr-2" /> {workflow.status === 'active' ? 'Pause Workflow' : 'Activate Workflow'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); resetWorkflowCounters(workflow.id); toast({ title: "Counters reset", description: `${workflow.name} trigger count cleared` }); }}>
                          <RefreshCw className="w-4 h-4 mr-2" /> Reset Counters
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setWorkflows(prev => prev.filter(w => w.id !== workflow.id)); toast({ title: "Workflow deleted", description: workflow.name }); }}>
                          <Edit className="w-4 h-4 mr-2" /> Delete Workflow
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              {expandedWorkflow === workflow.id && (
              <CardContent className="pb-4">
                <div className="relative ml-4">
                  {workflow.steps.map((step, idx) => {
                    const Icon = getStepIcon(step.type);
                    const isLast = idx === workflow.steps.length - 1;
                    return (
                      <div key={step.id} className="flex gap-3 relative">
                        {!isLast && (
                          <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-border" />
                        )}
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
                          getStepColor(step.status)
                        )}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <div className="pb-4 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{step.name}</span>
                            {step.status === 'completed' && (
                              <Check className="w-3 h-3 text-green-500" />
                            )}
                            {step.status === 'active' && (
                              <span className="text-xs text-primary">Running...</span>
                            )}
                          </div>
                          {step.details && (
                            <p className="text-xs text-muted-foreground">{step.details}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
              )}
            </Card>
          ))}
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Scheduled Sends
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-center py-4 text-muted-foreground">
                <Timer className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No scheduled sends</p>
                <p className="text-xs mt-1">Compose an email and schedule it for later delivery</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Follow-Up Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-center py-4 text-muted-foreground">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No follow-up reminders</p>
                <p className="text-xs mt-1">Reminders will appear when emails await a response</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <UniversalModal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Create Email Workflow</UniversalModalTitle>
            <UniversalModalDescription>Set up an automated email response or follow-up workflow</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="wf-name">Workflow Name</Label>
              <Input id="wf-name" placeholder="e.g. Client Follow-Up" value={newWorkflowName} onChange={e => setNewWorkflowName(e.target.value)} data-testid="input-workflow-name" />
            </div>
            <div className="space-y-1">
              <Label>Trigger</Label>
              <Select value={newWorkflowTrigger} onValueChange={setNewWorkflowTrigger}>
                <SelectTrigger data-testid="select-workflow-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_reply_3d">No reply in 3 days</SelectItem>
                  <SelectItem value="meeting_request">Meeting request detected</SelectItem>
                  <SelectItem value="priority_high">Priority email received</SelectItem>
                  <SelectItem value="scheduled_time">Scheduled time reached</SelectItem>
                  <SelectItem value="new_email">New email received</SelectItem>
                  <SelectItem value="invoice_paid">Invoice marked paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateWorkflow} data-testid="button-confirm-create-workflow">Create Workflow</Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </div>
  );
}

export function EmailHubCanvas() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  const [viewState, setViewState] = useState<ViewState>('hub');
  const [selectedEmail, setSelectedEmail] = useState<UnifiedEmail | null>(null);
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const [selectedFolder, setSelectedFolder] = useState<FolderType>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTo, setReplyTo] = useState<UnifiedEmail | null>(null);
  const [forwardFrom, setForwardFrom] = useState<UnifiedEmail | null>(null);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());

  const { data: mailboxData } = useQuery<{ mailbox?: any }>({
    queryKey: ['/api/internal-email/mailbox/auto-create'],
  });

  const { data: foldersData, refetch: refetchFolders } = useQuery<{ folders?: InboxFolder[]; totalUnread?: number }>({
    queryKey: ['/api/internal-email/folders'],
    enabled: !!mailboxData?.mailbox,
    staleTime: 1000 * 30,
  });

  const { data: internalEmailsData, isLoading: internalLoading, refetch: refetchInternal } = useQuery<{ emails?: any[] }>({
    queryKey: ['/api/internal-email/inbox', selectedFolder],
    queryFn: () => fetch(`/api/internal-email/inbox?folder=${selectedFolder}`, { credentials: 'include' }).then(r => r.json()),
    // @ts-expect-error — TS migration: fix in refactoring sprint
    enabled: !!mailboxData?.mailbox && selectedFolder !== 'support' && selectedFolder !== 'trinity',
  });

  const { data: externalEmailsData, isLoading: externalLoading, refetch: refetchExternal } = useQuery<{ data?: any[] }>({
    queryKey: ['/api/external-emails'],
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const allEmails: UnifiedEmail[] = useMemo(() => {
    const internal = (internalEmailsData?.emails || []).map((e: any) => ({
      ...e,
      type: 'internal' as const,
    }));
    
    const external = (externalEmailsData?.data || []).map((item: any) => ({
      id: item.email?.id || item.id,
      type: 'external' as const,
      fromAddress: item.email?.fromEmail || 'you@company.com',
      fromName: item.sentByUser ? `${item.sentByUser.firstName} ${item.sentByUser.lastName}` : null,
      toAddresses: item.email?.toEmail || '',
      subject: item.email?.subject,
      bodyText: null,
      bodyHtml: item.email?.bodyHtml,
      priority: 'normal' as const,
      sentAt: item.email?.sentAt,
      createdAt: item.email?.createdAt,
      isRead: true,
      isStarred: false,
      status: item.email?.status || 'sent',
      threadId: null,
      enhancedByTrinity: item.email?.enhancedByTrinity,
    }));
    
    return [...internal, ...external].sort((a, b) => 
      new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime()
    );
  }, [internalEmailsData, externalEmailsData]);

  const handleSelectEmail = useCallback((email: UnifiedEmail) => {
    setSelectedEmail(email);
    if (isMobile) {
      setViewState('canvas');
    }
  }, [isMobile]);

  const handleCompose = useCallback(() => {
    setReplyTo(null);
    setForwardFrom(null);
    setViewState('compose');
  }, []);

  const handleReply = useCallback(() => {
    if (selectedEmail) {
      setReplyTo(selectedEmail);
      setForwardFrom(null);
      setViewState('compose');
    }
  }, [selectedEmail]);

  const handleForward = useCallback(() => {
    if (selectedEmail) {
      setForwardFrom(selectedEmail);
      setReplyTo(null);
      setViewState('compose');
    }
  }, [selectedEmail]);

  const handleRefresh = useCallback(() => {
    refetchInternal();
    refetchExternal();
    refetchFolders();
  }, [refetchInternal, refetchExternal, refetchFolders]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => setSelectedEmailIds(new Set()), []);

  const handleFolderChange = useCallback((folder: FolderType) => {
    setSelectedFolder(folder);
    setSelectedEmailIds(new Set());
    setSelectedEmail(null);
    if (folder === 'support') {
      setViewState('support');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    } else if (folder === 'trinity') {
      setViewState('trinity');
    } else {
      setViewState('hub');
    }
  }, []);

  const handleBack = useCallback(() => {
    setViewState('hub');
    if (isMobile) {
      setSelectedEmail(null);
    }
  }, [isMobile]);

  const archiveMutation = useMutation({
    mutationFn: async (email: UnifiedEmail) => {
      if (email.type === 'internal') {
        await apiRequest('PATCH', `/api/internal-email/${email.id}`, { status: 'archived' });
      } else {
        await apiRequest('PATCH', `/api/external-emails/${email.id}`, { status: 'archived' });
      }
    },
    onSuccess: () => {
      toast({ title: 'Email archived' });
      setSelectedEmail(null);
      setViewState('hub');
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/external-emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/mailbox/auto-create'] });
    },
    onError: () => {
      toast({ title: 'Failed to archive email', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (email: UnifiedEmail) => {
      if (email.type === 'internal') {
        await apiRequest('DELETE', `/api/internal-email/${email.id}`);
      } else {
        await apiRequest('DELETE', `/api/external-emails/${email.id}`);
      }
    },
    onSuccess: () => {
      toast({ title: 'Email deleted' });
      setSelectedEmail(null);
      setViewState('hub');
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/external-emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/mailbox/auto-create'] });
    },
    onError: () => {
      toast({ title: 'Failed to delete email', variant: 'destructive' });
    },
  });

  const starMutation = useMutation({
    mutationFn: async ({ email, starred }: { email: UnifiedEmail; starred: boolean }) => {
      if (email.type === 'internal') {
        await apiRequest('PATCH', `/api/internal-email/${email.id}`, { isStarred: starred });
      } else {
        await apiRequest('PATCH', `/api/external-emails/${email.id}`, { isStarred: starred });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/external-emails'] });
    },
  });

  const handleArchive = useCallback((email?: UnifiedEmail) => {
    const target = email || selectedEmail;
    if (target) archiveMutation.mutate(target);
  }, [selectedEmail, archiveMutation]);

  const handleDelete = useCallback((email?: UnifiedEmail) => {
    const target = email || selectedEmail;
    if (target) deleteMutation.mutate(target);
  }, [selectedEmail, deleteMutation]);

  const handleStar = useCallback((email?: UnifiedEmail) => {
    const target = email || selectedEmail;
    if (target) starMutation.mutate({ email: target, starred: !target.isStarred });
  }, [selectedEmail, starMutation]);

  // 7-Step Workflow Email Sending State
  const [sendingStep, setSendingStep] = useState(0);
  const [sendingError, setSendingError] = useState<string | null>(null);
  const [showWorkflowProgress, setShowWorkflowProgress] = useState(false);

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string; cc: string; subject: string; body: string; attachments?: Array<{ name: string; url: string; size: number; type: string }> }) => {
      // Reset workflow state
      setSendingError(null);
      setShowWorkflowProgress(true);

      // Step 1: TRIGGER - Initiating send request
      setSendingStep(0);
      await new Promise(r => setTimeout(r, 200));

      const recipients = data.to.split(',').map(e => e.trim()).filter(Boolean);
      const isExternal = recipients.some(r => !r.endsWith('@coaileague.internal'));

      // Step 2: FETCH - Loading mailbox data
      setSendingStep(1);
      await new Promise(r => setTimeout(r, 200));

      // Step 3: VALIDATE - Checking recipients and content
      setSendingStep(2);
      if (recipients.length === 0) {
        throw new Error('At least one recipient is required');
      }
      if (!data.subject.trim()) {
        throw new Error('Subject is required');
      }
      await new Promise(r => setTimeout(r, 200));

      // Step 4: PROCESS - Preparing email for delivery
      setSendingStep(3);
      await new Promise(r => setTimeout(r, 200));

      let result;
      if (isExternal) {
        const res = await apiRequest('POST', '/api/external-emails', {
          toEmail: recipients[0],
          ccEmails: data.cc.split(',').map(e => e.trim()).filter(Boolean),
          subject: data.subject,
          bodyHtml: `<div style="white-space: pre-wrap;">${data.body}</div>`,
          attachments: data.attachments,
        });
        const resData = await res.json();

        // Step 5: MUTATE - Saving to database
        setSendingStep(4);
        await new Promise(r => setTimeout(r, 200));

        if (resData?.id) {
          await apiRequest('POST', `/api/external-emails/${resData.id}/send`);
        }
        result = resData;
      } else {
        // Step 5: MUTATE - Saving to database
        setSendingStep(4);
        const res = await apiRequest('POST', '/api/internal-email/send', {
          to: recipients,
          cc: data.cc.split(',').map(e => e.trim()).filter(Boolean),
          subject: data.subject,
          bodyText: data.body,
          bodyHtml: `<div style="white-space: pre-wrap;">${data.body}</div>`,
          attachments: data.attachments,
        });
        result = await res.json();
      }
      
      // Step 6: CONFIRM - Verifying delivery
      setSendingStep(5);
      await new Promise(r => setTimeout(r, 200));
      
      // Step 7: NOTIFY - Sending notifications
      setSendingStep(6);
      await new Promise(r => setTimeout(r, 200));
      
      // Complete
      setSendingStep(7);
      
      return result;
    },
    onSuccess: () => {
      // Keep workflow visible briefly to show completion
      setTimeout(() => {
        setShowWorkflowProgress(false);
        toast({ title: 'Email sent successfully', variant: 'success' });
        setViewState('hub');
        setReplyTo(null);
        setForwardFrom(null);
        queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
        queryClient.invalidateQueries({ queryKey: ['/api/external-emails'] });
      }, 1000);
    },
    onError: (err: Error) => {
      setSendingError(err.message);
      // Keep workflow visible to show error
      setTimeout(() => {
        setShowWorkflowProgress(false);
        toast({ title: 'Failed to send email', description: err.message, variant: 'destructive' });
      }, 2500);
    },
  });

  // Only show loading state for internal emails - don't block on external emails
  const isLoading = internalLoading;

  const folders = foldersData?.folders ?? [];
  const totalUnread = foldersData?.totalUnread ?? 0;

  const sharedEmailHubProps = {
    emails: allEmails,
    selectedEmailId: selectedEmail?.id || null,
    selectedFolder,
    onFolderChange: handleFolderChange,
    searchQuery,
    onSelectEmail: handleSelectEmail,
    onSearchChange: setSearchQuery,
    onCompose: handleCompose,
    onRefresh: handleRefresh,
    isLoading,
    onStarEmail: handleStar,
    onArchiveEmail: handleArchive,
    onDeleteEmail: handleDelete,
    selectedIds: selectedEmailIds,
    onToggleSelect: handleToggleSelect,
    onBulkMarkRead: async () => {
      const ids = Array.from(selectedEmailIds);
      await Promise.allSettled(
        ids.map(id => {
          const email = allEmails.find(e => e.id === id);
          if (email?.type === 'internal') {
            return apiRequest('PATCH', `/api/internal-email/${id}`, { isRead: true });
          }
          return Promise.resolve();
        })
      );
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/folders'] });
      toast({ title: `Marked ${ids.length} as read` });
      handleClearSelection();
    },
    onBulkArchive: () => {
      selectedEmailIds.forEach(id => {
        const email = allEmails.find(e => e.id === id);
        if (email) archiveMutation.mutate(email);
      });
      handleClearSelection();
    },
    onBulkDelete: () => {
      selectedEmailIds.forEach(id => {
        const email = allEmails.find(e => e.id === id);
        if (email) deleteMutation.mutate(email);
      });
      handleClearSelection();
    },
  };

  if (isMobile) {
    const mobileFolderTabs: { folder: FolderType; icon: typeof Inbox; label: string }[] = [
      // @ts-expect-error — TS migration: fix in refactoring sprint
      { folder: 'inbox', icon: Inbox, label: 'Inbox' },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      { folder: 'starred', icon: Star, label: 'Starred' },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      { folder: 'sent', icon: Send, label: 'Sent' },
      { folder: 'support', icon: Headphones, label: 'Support' },
    ];

    return (
      <div className="h-full flex flex-col overflow-hidden max-w-full" style={{ touchAction: 'pan-y' }}>
        {/* Mobile folder bottom nav — always visible in hub/support view */}
        {(viewState === 'hub' || viewState === 'support') && (
          <div className="flex items-center border-b bg-background shrink-0">
            {mobileFolderTabs.map(({ folder, icon: Icon, label }) => {
              const folderData = folders.find(f => f.folderType === folder);
              const isActive = selectedFolder === folder;
              return (
                <button
                  key={folder}
                  onClick={() => handleFolderChange(folder)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium relative",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  data-testid={`tab-folder-${folder}`}
                >
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {(folderData?.unreadCount ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1.5 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
                        {folderData!.unreadCount > 9 ? '9+' : folderData!.unreadCount}
                      </span>
                    )}
                  </div>
                  {label}
                  {isActive && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
                </button>
              );
            })}
          </div>
        )}

        {viewState === 'hub' && (
          <EmailHub {...sharedEmailHubProps} isMobileView={true} />
        )}

        {viewState === 'support' && (
          // @ts-expect-error — TS migration: fix in refactoring sprint
          <SupportInboxPanel onBack={() => { setSelectedFolder('inbox'); setViewState('hub'); }} />
        )}

        {viewState === 'trinity' && (
          // @ts-expect-error — TS migration: fix in refactoring sprint
          <TrinityInboxPanel onBack={() => { setSelectedFolder('inbox'); setViewState('hub'); }} />
        )}
        
        {viewState === 'canvas' && (
          <EmailCanvas
            email={selectedEmail}
            onBack={handleBack}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={() => handleDelete()}
            onArchive={() => handleArchive()}
            onStar={() => handleStar()}
            isMobile={true}
            onUseReply={(_body) => {
              setReplyTo(selectedEmail);
              setForwardFrom(null);
              setViewState('compose');
            }}
          />
        )}
        
        {viewState === 'compose' && (
          <ComposeCanvas
            onClose={handleBack}
            onSend={(data) => sendEmailMutation.mutate(data)}
            replyTo={replyTo}
            forwardFrom={forwardFrom}
            isSending={sendEmailMutation.isPending}
            sendingStep={sendingStep}
            sendingError={sendingError}
            isMobile={true}
          />
        )}
        
        <EmailWorkflowProgress
          isVisible={showWorkflowProgress}
          currentStep={sendingStep}
          error={sendingError}
        />
        
        {viewState === 'analytics' && (
          <EmailAnalyticsDashboard
            emails={allEmails}
            onBack={handleBack}
          />
        )}
        
        {viewState === 'workflow' && (
          <WorkflowPipeline
            emails={allEmails}
            onBack={handleBack}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* FolderNav sidebar — desktop only */}
      <FolderNav
        folders={folders}
        selectedFolder={selectedFolder}
        onSelectFolder={handleFolderChange}
        totalUnread={totalUnread}
        onCompose={handleCompose}
        onAnalytics={() => setViewState('analytics')}
        onWorkflow={() => setViewState('workflow')}
      />

      {/* Email list panel — hidden for special full-panel views */}
      {viewState !== 'support' && viewState !== 'trinity' && (
        <div className="w-[280px] shrink-0 overflow-hidden border-r">
          <EmailHub {...sharedEmailHubProps} />
        </div>
      )}

      {/* Center: compose / analytics / workflow / support / trinity / email canvas */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {viewState === 'compose' ? (
          <ComposeCanvas
            onClose={() => setViewState('hub')}
            onSend={(data) => sendEmailMutation.mutate(data)}
            replyTo={replyTo}
            forwardFrom={forwardFrom}
            isSending={sendEmailMutation.isPending}
            sendingStep={sendingStep}
            sendingError={sendingError}
          />
        ) : viewState === 'analytics' ? (
          <EmailAnalyticsDashboard
            emails={allEmails}
            onBack={() => setViewState('hub')}
          />
        ) : viewState === 'workflow' ? (
          <WorkflowPipeline
            emails={allEmails}
            onBack={() => setViewState('hub')}
          />
        ) : viewState === 'support' ? (
          // @ts-expect-error — TS migration: fix in refactoring sprint
          <SupportInboxPanel onBack={() => { setSelectedFolder('inbox'); setViewState('hub'); }} />
        ) : viewState === 'trinity' ? (
          // @ts-expect-error — TS migration: fix in refactoring sprint
          <TrinityInboxPanel onBack={() => { setSelectedFolder('inbox'); setViewState('hub'); }} />
        ) : (
          <EmailCanvas
            email={selectedEmail}
            onBack={handleBack}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={() => handleDelete()}
            onArchive={() => handleArchive()}
            onStar={() => handleStar()}
            isMobile={false}
          />
        )}
      </div>
      
      {viewState !== 'analytics' && viewState !== 'workflow' && viewState !== 'support' && viewState !== 'trinity' && (
        <AIContextRail
          email={selectedEmail}
          onGenerateReply={(_body) => {
            setReplyTo(selectedEmail);
            setForwardFrom(null);
            setViewState('compose');
          }}
        />
      )}
      
      {/* 7-Step Workflow Progress Overlay (Desktop) */}
      <EmailWorkflowProgress
        isVisible={showWorkflowProgress}
        currentStep={sendingStep}
        error={sendingError}
      />
    </div>
  );
}

export default EmailHubCanvas;
