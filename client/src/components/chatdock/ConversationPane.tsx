/**
 * ConversationPane (C2 — code-split conversation view)
 *
 * Lazy-loaded chunk that owns the message list, composer, info panel,
 * action menus, lightbox, and every sub-component used while a single
 * conversation is open. The bubble shell in ChatDock.tsx no longer
 * has to parse this code path — first paint of the FAB / room list
 * doesn't pay the parse cost for the conversation pane.
 *
 * Public surface: <InlineChatView roomId={...} roomName={...} />
 * The shell wraps it with React.lazy + Suspense.
 *
 * Everything in this file is intentionally self-contained except for
 * the very small set of helpers in chatdock-helpers.ts (currently just
 * useMobileKeyboardOffset) which the bubble shell also needs.
 */
import React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, type TouchEvent as ReactTouchEvent } from "react";
import { StatusBadge } from '@/components/ui/status-badge';
import { createPortal } from "react-dom";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useChatViewState } from "./useChatViewState";
import { useMessageActions, useRoomActions, useUserActions } from "./useChatActions";
import { useChatRoomSummaries, useChatUnreadTotal, useRoomTypingUser } from "@/hooks/useChatManager";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { X, ArrowLeft, Send, Search, Users, MessageCircle, MessageSquare, ChevronRight, Loader2, WifiOff, Plus, MoreVertical, Paperclip, Image, Video, Mic, UserPlus, LogOut, Eye, EyeOff, VolumeX, Volume2, Trash2, Ban, Shield, Crown, Info, Settings, Check, CheckCheck, FileText, Reply, Pencil, Forward, Pin, SmilePlus, ExternalLink, XCircle, ArrowDown, ThumbsUp, Heart, Laugh, Frown, Flame, Headphones, Calendar, Phone, Mail, AlertCircle, MapPin, Download, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { chatManager } from "@/services/chatConnectionManager";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { useTrinitySession } from "@/contexts/TrinitySessionContext";
import { useMobileKeyboardOffset } from "./chatdock-helpers";
import type { LightboxData } from "./useChatViewState";

function RoomInfoPanel({
  roomId,
  roomName,
  onBack,
  liveUsers = [],
}: {
  roomId: string;
  roomName: string;
  onBack: () => void;
  liveUsers?: Array<{ id: string; name: string; role: string; status: string; userType: string; isBot?: boolean }>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const participantsQuery = useQuery({
    queryKey: ["/api/chat/manage/rooms", roomId, "participants"],
    queryFn: () => fetch(`/api/chat/manage/rooms/${roomId}/participants`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const updateRole = useMutation({
    mutationFn: ({ participantId, role }: { participantId: string; role: string }) =>
      apiRequest("POST", `/api/chat/manage/rooms/${roomId}/update-role`, { participantId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
      toast({ title: "Role updated" });
    },
  });

  const transferOwnership = useMutation({
    mutationFn: (newOwnerId: string) =>
      apiRequest("POST", `/api/chat/manage/rooms/${roomId}/transfer-ownership`, { newOwnerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
      toast({ title: "Ownership transferred" });
    },
  });

  // C1: block / unblock now flow through useUserActions; participants
  // cache + toast are layered here.
  const userActions = useUserActions();
  const blockUser = {
    ...userActions.blockUser,
    mutate: (blockedUserId: string) => userActions.blockUser.mutate(blockedUserId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
        chatManager.loadRoomList();
        toast({ title: "User blocked" });
      },
    }),
  };
  const unblockUser = {
    ...userActions.unblockUser,
    mutate: (blockedUserId: string) => userActions.unblockUser.mutate(blockedUserId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
        chatManager.loadRoomList();
        toast({ title: "User unblocked" });
      },
    }),
  };

  const dbParticipants = participantsQuery.data?.participants || [];
  // Use live WebSocket users as the authoritative source when available;
  // fall back to DB participants for persisted group rooms.
  const useLive = liveUsers.length > 0;
  const displayCount = useLive ? liveUsers.length : dbParticipants.length;
  const currentUserParticipant = dbParticipants.find((p: unknown) => p.participantId === user?.id);
  const isOwnerOrAdmin = currentUserParticipant && ["owner", "admin"].includes(currentUserParticipant.participantRole);

  return (
    <div className="flex flex-col h-full">
      <div className="chatdock-chat-header flex items-center gap-2 px-2.5 py-2" data-drag-region>
        <Button size="icon" variant="ghost" className="flex-shrink-0 text-white/80" onClick={onBack} data-testid="button-info-back" aria-label="Back to chat">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
          <Info className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-semibold truncate text-white">{roomName}</h3>
      </div>

      <div className="px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Members ({displayCount})
          </span>
          {useLive && (
            <Badge variant="secondary" className="text-[9px] px-1 gap-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-scroll="styled">
        {participantsQuery.isLoading && !useLive && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {/* Live users (from WebSocket) — shown when connection is active */}
        {useLive && liveUsers.map((u) => {
          const isBot = u.isBot || u.userType === 'bot' || u.role === 'bot';
          return (
            <div key={u.id} className="flex items-center gap-2 px-3 py-2" data-testid={`live-member-${u.id}`}>
              <div className="relative flex-shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={['text-xs font-semibold', isBot ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-white' : 'bg-primary/10 text-primary'].join(' ')}>
                    {(u.name || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border border-card ${isBot ? 'bg-blue-400 animate-pulse' : 'bg-emerald-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{u.name}</span>
                  {isBot && <Badge variant="secondary" className="text-[9px] px-1">Bot</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{isBot ? (u.id === 'helpai-bot' || u.name === 'HelpAI' ? 'HelpAI' : 'Trinity') : (u.role || 'Member')}</p>
              </div>
            </div>
          );
        })}

        {/* DB participants (group rooms with persisted membership) */}
        {!useLive && dbParticipants.map((p: unknown) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                {(p.participantName || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium truncate">{p.participantName}</span>
                {p.participantRole === "owner" && <Badge variant="default" className="text-[9px] px-1">Owner</Badge>}
                {p.participantRole === "admin" && <Badge variant="secondary" className="text-[9px] px-1">Mod</Badge>}
              </div>
            </div>
            {isOwnerOrAdmin && p.participantId !== user?.id && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {currentUserParticipant?.participantRole === "owner" && p.participantRole !== "admin" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => updateRole.mutate({ participantId: p.participantId, role: "admin" })}
                    data-testid={`button-promote-${p.participantId}`}
                    aria-label="Make moderator"
                  >
                    <Shield className="h-3 w-3" />
                  </Button>
                )}
                {currentUserParticipant?.participantRole === "owner" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => transferOwnership.mutate(p.participantId)}
                    data-testid={`button-transfer-${p.participantId}`}
                    aria-label="Transfer ownership"
                  >
                    <Crown className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => blockUser.mutate(p.participantId)}
                  data-testid={`button-block-${p.participantId}`}
                  aria-label="Block user"
                >
                  <Ban className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {!useLive && !participantsQuery.isLoading && dbParticipants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No members yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Members appear here when they join the conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Real emoji reactions — professional set (no entertainment fluff)
const QUICK_REACTIONS = [
  { key: "👍", emoji: "👍", icon: ThumbsUp, label: "Like" },
  { key: "❤️", emoji: "❤️", icon: Heart, label: "Love" },
  { key: "😂", emoji: "😂", icon: Laugh, label: "Haha" },
  { key: "✅", emoji: "✅", icon: Check, label: "Acknowledged" },
  { key: "👀", emoji: "👀", icon: Eye, label: "Seen" },
  { key: "🔥", emoji: "🔥", icon: Flame, label: "Urgent" },
  { key: "⚠️", emoji: "⚠️", icon: AlertCircle, label: "Attention" },
  { key: "🎯", emoji: "🎯", icon: Check, label: "On it" },
];

function ReactionBadges({
  messageId,
  reactions,
  conversationId,
}: {
  messageId: string;
  reactions: { emoji: string; count: number; users: { id: string; name: string }[]; hasReacted: boolean }[];
  conversationId: string;
}) {
  const { toggleReaction } = useMessageActions(messageId, conversationId);

  if (!reactions || reactions.length === 0) return null;

  const getReactionIcon = (key: string) => {
    const found = QUICK_REACTIONS.find(qr => qr.key === key);
    if (found) return found;
    return null;
  };

  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5 px-1" data-testid={`reactions-${messageId}`}>
      {reactions.map((r) => {
        const reactionDef = getReactionIcon(r.emoji);
        const IconComp = reactionDef?.icon;
        return (
          <button
            key={r.emoji}
            onClick={(e) => { e.stopPropagation(); haptics.light(); toggleReaction.mutate(r.emoji); }}
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded-full border transition-colors",
              r.hasReacted
                ? "bg-primary/15 border-primary/30 text-primary"
                : "bg-muted border-border text-foreground/70"
            )}
            title={r.users.map(u => u.name).join(", ")}
            data-testid={`reaction-badge-${r.emoji}-${messageId}`}
          >
            <span className="text-[11px] leading-none">{r.emoji}</span>
            <span>{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function MessageActions({
  messageId,
  isOwn,
  onClose,
  onReply,
  onEdit,
  onForward,
  conversationId,
}: {
  messageId: string;
  isOwn: boolean;
  onClose: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onForward?: () => void;
  conversationId: string;
}) {
  const { toast } = useToast();
  const [showMore, setShowMore] = useState(false);

  // C1: useMessageActions consolidates these four mutations behind one
  // typed surface. Toast + onClose still belong here because they are
  // UI-side effects specific to this menu (the hook is intentionally
  // UI-agnostic so other consumers can decide their own toast behaviour).
  const actions = useMessageActions(messageId, conversationId, { onAfter: onClose });
  const deleteForMe = {
    ...actions.deleteForMe,
    mutate: () => actions.deleteForMe.mutate(undefined, {
      onSuccess: () => toast({ title: "Message hidden for you" }),
    }),
  };
  const deleteForEveryone = {
    ...actions.deleteForEveryone,
    mutate: () => actions.deleteForEveryone.mutate(undefined, {
      onSuccess: () => toast({ title: "Message deleted for everyone" }),
    }),
  };
  const pinMessage = {
    ...actions.pinMessage,
    mutate: () => actions.pinMessage.mutate(undefined, {
      onSuccess: async (res: unknown) => {
        try {
          const data = typeof res?.json === 'function' ? await res.json() : res;
          toast({ title: data?.pinned ? "Message pinned" : "Message unpinned" });
        } catch {
          toast({ title: "Pin updated" });
        }
      },
    }),
  };
  const { toggleReaction } = actions;

  if (showMore) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-[1600]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
        <div className="fixed inset-x-0 bottom-0 z-[1601] bg-card border-t border-border rounded-t-md shadow-sm animate-in slide-in-from-bottom-4 duration-150" data-testid={`menu-msg-more-${messageId}`}>
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-2 mb-1" />
          <div className="px-2 pb-2 pt-1 space-y-0.5">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover-elevate active-elevate-2 text-left rounded-lg" onClick={(e) => { e.stopPropagation(); pinMessage.mutate(); }} data-testid={`button-pin-${messageId}`}>
              <Pin className="h-4 w-4 text-muted-foreground" /> Pin message
            </button>
            {onForward && (
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover-elevate active-elevate-2 text-left rounded-lg" onClick={() => { onForward(); onClose(); }} data-testid={`button-forward-${messageId}`}>
                <Forward className="h-4 w-4 text-muted-foreground" /> Forward
              </button>
            )}
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover-elevate active-elevate-2 text-left rounded-lg" onClick={() => deleteForMe.mutate()}>
              <EyeOff className="h-4 w-4 text-muted-foreground" /> Delete for me
            </button>
            {isOwn && (
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover-elevate active-elevate-2 text-left rounded-lg text-destructive" onClick={() => deleteForEveryone.mutate()}>
                <Trash2 className="h-4 w-4" /> Delete for everyone
              </button>
            )}
          </div>
          <div className="pb-safe" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[1600]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="fixed inset-x-0 bottom-0 z-[1601] bg-card border-t border-border rounded-t-md shadow-sm animate-in slide-in-from-bottom-4 duration-150" data-testid={`menu-msg-${messageId}`}>
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-2 mb-1" />
        <div className="flex items-center justify-center gap-1 px-2 py-1 overflow-x-auto" data-testid={`reaction-bar-${messageId}`}>
          {QUICK_REACTIONS.map((r) => (
            <button
              key={r.key}
              className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-full hover-elevate"
              onClick={(e) => { e.stopPropagation(); haptics.light(); toggleReaction.mutate(r.key); }}
              data-testid={`reaction-${r.key}-${messageId}`}
              aria-label={r.label}
            >
              <r.icon className="h-5 w-5" />
            </button>
          ))}
          <button
            className="p-1.5 text-muted-foreground rounded-full hover-elevate"
            onClick={(e) => { e.stopPropagation(); }}
            data-testid={`reaction-more-${messageId}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="border-t border-border" />
        <div className="flex items-stretch justify-around px-2 py-1.5">
          {onReply && (
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover-elevate active-elevate-2"
              onClick={() => { onReply(); onClose(); }}
              data-testid={`button-reply-${messageId}`}
            >
              <Reply className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Reply</span>
            </button>
          )}
          {isOwn && onEdit && (
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover-elevate active-elevate-2"
              onClick={() => { onEdit(); onClose(); }}
              data-testid={`button-edit-${messageId}`}
            >
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Edit</span>
            </button>
          )}
          {onForward && (
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover-elevate active-elevate-2"
              onClick={() => { onForward(); onClose(); }}
              data-testid={`button-forward-${messageId}`}
            >
              <Forward className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Forward</span>
            </button>
          )}
          <button
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover-elevate active-elevate-2"
            onClick={(e) => { e.stopPropagation(); setShowMore(true); }}
            data-testid={`button-more-${messageId}`}
          >
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">More</span>
          </button>
        </div>
        <div className="pb-safe" />
      </div>
    </>
  );
}

function ForwardDialog({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const rawRooms = useChatRoomSummaries();
  const rooms = rawRooms ?? [];
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  // C1: forward via the canonical hook; the dialog still owns the toast.
  // conversationId is unused for forward (the URL only needs messageId), but
  // the hook signature requires it so we pass an empty string. See
  // useMessageActions JSDoc.
  const baseForward = useMessageActions(messageId, '').forwardMessage;
  const forwardMutation = {
    ...baseForward,
    mutate: (targetConversationId: string) => baseForward.mutate(targetConversationId, {
      onSuccess: () => { toast({ title: "Message forwarded" }); onClose(); },
      onError: () => { toast({ title: "Failed to forward", variant: "destructive" }); },
    }),
  };

  const filtered = search
    ? rooms.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rooms;

  return (
    <div className="absolute inset-0 bg-card z-50 flex flex-col" data-testid="forward-dialog" role="dialog" aria-label="Forward message">
      <div className="flex items-center gap-2 px-2 py-2 border-b">
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-forward-back" aria-label="Cancel forward">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">Forward to...</span>
      </div>
      <div className="px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            data-testid="input-forward-search"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1" data-scroll="styled">
        {filtered.map((room) => (
          <button
            key={room.roomId}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover-elevate active-elevate-2 text-left rounded-lg"
            onClick={() => forwardMutation.mutate(room.roomId)}
            disabled={forwardMutation.isPending}
            data-testid={`forward-room-${room.roomId}`}
          >
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                {room.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm truncate">{room.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// LightboxData is owned by useChatViewState (C3) so the reducer can manage
// it as part of the exclusive-overlay set. Re-exporting here as a type
// alias keeps existing call sites that reference `LightboxData` valid.
export type { LightboxData };

function ImageLightbox({
  data,
  onClose,
}: {
  data: LightboxData;
  onClose: () => void;
}) {
  const formattedTime = data.timestamp
    ? new Date(data.timestamp).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : null;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = data.src;
    link.download = data.filename || "shift-photo.jpg";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[6000] flex flex-col items-center justify-center"
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent z-[6001]">
        <div className="flex flex-col gap-0.5 text-white min-w-0">
          {data.senderName && (
            <span className="text-sm font-semibold truncate" data-testid="text-lightbox-sender">{data.senderName}</span>
          )}
          <div className="flex items-center gap-2 text-xs text-white/70">
            {formattedTime && <span data-testid="text-lightbox-timestamp">{formattedTime}</span>}
            {data.filename && <span className="truncate max-w-[200px]" data-testid="text-lightbox-filename">{data.filename}</span>}
          </div>
          {data.gpsAddress && (
            <div className="flex items-center gap-1 text-xs text-emerald-400 mt-0.5" data-testid="text-lightbox-gps">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[260px]">{data.gpsAddress}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={handleDownload}
            data-testid="button-lightbox-download"
            title="Download photo"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={onClose}
            data-testid="button-lightbox-close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <img
        src={data.src}
        alt="Full size preview"
        className="max-w-full max-h-[85vh] object-contain rounded-lg p-4"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 z-[6001]">
        {data.gpsAddress && (
          <div className="flex items-center justify-center gap-1 mb-1">
            <MapPin className="h-3 w-3 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">{data.gpsAddress}</span>
          </div>
        )}
        <p className="text-center text-xs text-white/60" data-testid="text-lightbox-proof">
          Sent{data.senderName ? ` by ${data.senderName}` : ""}{formattedTime ? ` on ${formattedTime}` : ""} — Proof of Service Record
        </p>
      </div>
    </div>
  );
}

function LinkPreview({ url }: { url: string }) {
  const { data } = useQuery({
    queryKey: ["/api/chat/manage/link-preview", url],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/chat/manage/link-preview", { url });
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (!data?.preview) return null;

  const p = data.preview;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-1.5 border border-border rounded-lg overflow-hidden bg-muted/30 hover:bg-muted/50 transition-colors max-w-full"
      data-testid="link-preview"
    >
      {p.image && (
        <img src={p.image} alt="" width={400} height={96} className="w-full h-24 object-cover" loading="lazy" />
      )}
      <div className="p-2">
        {p.siteName && <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{p.siteName}</span>}
        <p className="text-xs font-medium line-clamp-1">{p.title}</p>
        {p.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
      </div>
    </a>
  );
}

function DateDivider({ date }: { date: Date }) {
  const now = new Date();
  const d = new Date(date);
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const label = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : null });

  // chatdock-date-divider applies sticky positioning so the date pill rides
  // along the top of the scroll viewport like iMessage / Messenger.
  return (
    <div className="chatdock-date-divider" data-testid="date-divider">
      <span>{label}</span>
    </div>
  );
}

function QuotedMessage({ parentMessage, compact }: { parentMessage: { senderName: string; message: string }; compact?: boolean }) {
  const truncatedMsg = parentMessage.message.length > 80 ? parentMessage.message.slice(0, 80) + "..." : parentMessage.message;
  return (
    <div className={cn(
      "border-l-2 border-primary/50 pl-2 mb-1 rounded-r-sm",
      compact ? "py-0.5" : "py-1"
    )} data-testid="quoted-message">
      <span className="text-[10px] font-semibold text-primary block">{parentMessage.senderName}</span>
      <span className="text-[10px] text-muted-foreground line-clamp-1">{truncatedMsg}</span>
    </div>
  );
}

function TypingBubble({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-1.5 py-1" data-testid="typing-indicator">
      <div className="flex items-center gap-2 px-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] text-white font-bold">{(name || "?").slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="bg-muted rounded-md rounded-bl-sm px-4 py-2.5 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 chatdock-typing-dot" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 chatdock-typing-dot" style={{ animationDelay: "200ms" }} />
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 chatdock-typing-dot" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
}

function FormattedMessage({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const tokens: { type: "text" | "bold" | "italic" | "code" | "link"; content: string; href?: string }[] = [];
    const regex = /(\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*([^*]+)\*|`([^`]+)`|(https?:\/\/[^\s<>[\]()]+))/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
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
    return tokens.length > 0 ? tokens : [{ type: "text" as const, content: text }];
  }, [text]);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        switch (part.type) {
          case "bold": return <strong key={i}>{part.content}</strong>;
          case "italic": return <em key={i}>{part.content}</em>;
          case "code": return <code key={i} className="px-1 py-0.5 bg-black/10 dark:bg-white/10 rounded text-[12px] font-mono">{part.content}</code>;
          case "link": return <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="underline break-all">{part.content}</a>;
          default: return <span key={i}>{part.content}</span>;
        }
      })}
    </span>
  );
}

function QuickReactionHoverBar({
  messageId,
  conversationId,
  isOwn,
  onReply,
  onMoreActions,
}: {
  messageId: string;
  conversationId: string;
  isOwn: boolean;
  onReply: () => void;
  onMoreActions: () => void;
}) {
  const { toggleReaction } = useMessageActions(messageId, conversationId);

  return (
    <div
      className={cn(
        "absolute -top-7 flex items-center gap-0.5 bg-card border border-border rounded-full shadow-sm px-1 py-0.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity",
        isOwn ? "right-0" : "left-0"
      )}
      data-testid={`quick-react-bar-${messageId}`}
    >
      {QUICK_REACTIONS.slice(0, 4).map((r) => (
        <button
          key={r.key}
          className="p-0.5 text-muted-foreground hover:text-primary transition-colors leading-none"
          onClick={(e) => { e.stopPropagation(); haptics.light(); toggleReaction.mutate(r.key); }}
          data-testid={`quick-react-${r.key}-${messageId}`}
          aria-label={r.label}
        >
          <r.icon className="h-3.5 w-3.5" />
        </button>
      ))}
      <button
        className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); onReply(); }}
        data-testid={`quick-reply-${messageId}`}
      >
        <Reply className="h-3 w-3" />
      </button>
      <button
        className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); onMoreActions(); }}
        data-testid={`quick-more-${messageId}`}
      >
        <MoreVertical className="h-3 w-3" />
      </button>
    </div>
  );
}

function ScrollToBottomFab({ containerRef, newCount }: { containerRef: React.RefObject<HTMLDivElement | null>; newCount: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(distFromBottom > 150);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  if (!show) return null;

  return (
    <button
      className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border/50 rounded-full shadow-sm p-2 z-30 flex items-center gap-1.5 hover-elevate active-elevate-2"
      onClick={() => containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })}
      data-testid="button-scroll-bottom"
    >
      <ArrowDown className="h-4 w-4 text-primary" />
      {newCount > 0 && (
        <Badge variant="destructive" className="text-[9px] px-1 no-default-hover-elevate no-default-active-elevate">{newCount}</Badge>
      )}
    </button>
  );
}

function UnreadDivider() {
  return (
    <div className="flex items-center gap-2 py-1.5" data-testid="unread-divider">
      <div className="flex-1 h-px bg-destructive/40" />
      <span className="text-[10px] text-destructive font-medium px-1.5">New Messages</span>
      <div className="flex-1 h-px bg-destructive/40" />
    </div>
  );
}

function getChannelIcon(channelType: string) {
  switch (channelType) {
    case "sms": return Phone;
    case "whatsapp": return MessageCircle;
    case "email": return Mail;
    case "messenger": return MessageCircle;
    default: return null;
  }
}

function getChannelColor(channelType: string) {
  switch (channelType) {
    case "sms": return "text-blue-500";
    case "whatsapp": return "text-green-500";
    case "email": return "text-orange-500";
    case "messenger": return "text-indigo-500";
    default: return "text-muted-foreground";
  }
}


function ChannelIndicator({ channelType }: { channelType: string }) {
  const Icon = getChannelIcon(channelType);
  if (!Icon) return null;
  return (
    <Icon className={cn("h-3 w-3 flex-shrink-0", getChannelColor(channelType))} data-testid={`icon-channel-${channelType}`} />
  );
}

function DeliveryStatusIndicator({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" data-testid="delivery-status-sent" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-primary" data-testid="delivery-status-delivered" />;
    case "failed":
      return <AlertCircle className="h-3 w-3 text-destructive" data-testid="delivery-status-failed" />;
    case "pending":
      return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" data-testid="delivery-status-pending" />;
    default:
      return null;
  }
}

/**
 * VoicePlayer (B6) — Messenger/WhatsApp-style voice-message player.
 * Tap-to-play, progress bar that scrubs on click, monotonic time readout.
 * No extra deps — uses native <audio> + a CSS-driven fill.
 */
function VoicePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      if (a.duration && Number.isFinite(a.duration)) {
        setProgress((a.currentTime / a.duration) * 100);
      }
    };
    const onLoaded = () => {
      if (a.duration && Number.isFinite(a.duration)) setDuration(a.duration);
    };
    const onEnd = () => { setIsPlaying(false); setProgress(0); setCurrent(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { void a.play(); setIsPlaying(true); haptics.light(); }
    else { a.pause(); setIsPlaying(false); }
  };

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = a.duration * ratio;
    setProgress(ratio * 100);
    setCurrent(a.currentTime);
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  return (
    <div className="chatdock-voice" data-testid="chatdock-voice">
      <button
        type="button"
        onClick={toggle}
        className="chatdock-tap inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#1877f2] text-white"
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="chatdock-voice-bar" onClick={scrub} role="slider" aria-label="Voice message progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="chatdock-voice-bar-fill"
          style={{ ['--chatdock-voice-progress']: `${progress}%` }}
        />
      </div>
      <span className="chatdock-voice-time">{fmt(current)}{duration > 0 ? ` / ${fmt(duration)}` : ''}</span>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}

/**
 * Room-list preview line (B5).  Sub-component because hooks can't run inside
 * a callback inside renderRoomItem.  Subscribes to live typing pings so the
 * preview swaps to "Maya is typing…" with a subtle pulse — same trick
 * Messenger uses to make the room list feel alive.
 */
export function InlineChatView({ roomId, roomName }: { roomId: string; roomName: string }) {
  const { closeChat, openChat } = useChatDock();
  const { user } = useAuth();
  const { setActiveSessionId } = useTrinitySession();
  useEffect(() => {
    setActiveSessionId(roomId);
    return () => setActiveSessionId(null);
  }, [roomId, setActiveSessionId]);
  const [input, setInput] = useState("");
  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<number>(-1);
  // Overlay/dialog state — single source of truth via useChatViewState (C3).
  // The hook returns the same setter API the dock has always used, but its
  // reducer enforces "at most one exclusive overlay open at a time", which
  // prevents the "two overlays open at once" class of bug we previously had
  // when the user could pop the attachment sheet over an active reply
  // composer. Composition between the search bar + reply/edit composer is
  // still allowed because they're different UI lanes.
  const {
    showInfo, setShowInfo,
    showAttach, setShowAttach,
    activeMessageMenu, setActiveMessageMenu,
    replyingTo, setReplyingTo,
    editingMessage, setEditingMessage,
    forwardingMessageId, setForwardingMessageId,
    lightboxData, setLightboxData,
    showChatSearch, setShowChatSearch,
  } = useChatViewState();
  const [chatSearch, setChatSearch] = useState("");
  // B4 — pull-to-load-history loading state
  const [historyLoading, setHistoryLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Composer is a textarea (auto-grow + monospace switch) — was an Input.
  // Keeping the union type so existing inputRef.current?.focus() callsites work.
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const keyboardOffset = useMobileKeyboardOffset();
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [lastReadIndex, setLastReadIndex] = useState(-1);
  const touchStartRef = useRef<{ x: number; y: number; msgId: string | null }>({ x: 0, y: 0, msgId: null });
  const lastTapRef = useRef<{ msgId: string; time: number }>({ msgId: "", time: 0 });
  const [swipeReplyId, setSwipeReplyId] = useState<string | null>(null);
  // B3 — live swipe translation per message. We keep one entry at a time so
  // the dragged row applies translateX(...) and reveals the reply hint past
  // the 32px threshold; on release the row either snaps back or commits the
  // reply.
  const [activeSwipe, setActiveSwipe] = useState<{ msgId: string; dx: number; reached: boolean } | null>(null);
  const SWIPE_REPLY_THRESHOLD = 56;
  const SWIPE_HINT_THRESHOLD = 32;
  const seenMessageIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const newMessageIds = useRef<Set<string>>(new Set());

  const userName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "User";
  const autoRetryCount = useRef(0);

  const {
    messages: wsMessages,
    sendMessage,
    sendRawMessage,
    loadOlderMessages,
    isConnected,
    error: wsError,
    isInTriage,
    typingUserInfo,
    reconnect,
    readReceipts,
    onlineUsers,
  } = useChatroomWebSocket(user?.id, userName, roomId);

  useEffect(() => {
    if (wsError === "Conversation not found" && autoRetryCount.current < 3) {
      const timer = setTimeout(() => {
        autoRetryCount.current++;
        reconnect?.();
      }, 1500 * (autoRetryCount.current + 1));
      return () => clearTimeout(timer);
    }
    if (isConnected) autoRetryCount.current = 0;
  }, [wsError, isConnected, reconnect]);

  const { data: reactionsData } = useQuery({
    queryKey: ['/api/chat/manage/conversations', roomId, 'reactions'],
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
    enabled: wsMessages.length > 0,
    queryFn: () => apiFetch(`/api/chat/manage/conversations/${roomId}/reactions`, AnyResponse),
  });

  const { data: pinnedData } = useQuery({
    queryKey: ['/api/chat/manage/conversations', roomId, 'pinned'],
    staleTime: 1000 * 60,
    queryFn: () => apiFetch(`/api/chat/manage/conversations/${roomId}/pinned`, AnyResponse),
  });

  const { data: searchResults } = useQuery({
    queryKey: [`/api/chat/manage/conversations/${roomId}/search`, { q: chatSearch }],
    enabled: chatSearch.length >= 2,
    staleTime: 1000 * 10,
    queryFn: () => apiFetch(`/api/chat/manage/conversations/${roomId}/search?q=${encodeURIComponent(chatSearch)}`, AnyResponse),
  });

  const editMutation = useMutation({
    mutationFn: ({ messageId, message }: { messageId: string; message: string }) =>
      apiRequest("PATCH", `/api/chat/manage/messages/${messageId}/edit`, { message }),
    onSuccess: () => {
      toast({ title: "Message edited" });
      setEditingMessage(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Edit failed", description: error.message, variant: "destructive" });
    },
  });

  const reactionsMap = (reactionsData as Record<string,unknown>)?.reactions || {};
  const pinnedMessages = (pinnedData as Record<string,unknown>)?.messages || [];
  const searchHits = (searchResults as Record<string,unknown>)?.messages || [];
  const searchHitIds = new Set(searchHits.map((m: unknown) => m.id));

  const parentMessageCache = useMemo(() => {
    const cache: Record<string, { senderName: string; message: string }> = {};
    for (const msg of wsMessages) {
      cache[msg.id] = { senderName: msg.senderName || "Unknown", message: msg.message || "" };
    }
    return cache;
  }, [wsMessages]);

  useEffect(() => {
    chatManager.markAsRead(roomId);
    seenMessageIds.current.clear();
    newMessageIds.current.clear();
    initialLoadDone.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!initialLoadDone.current) {
      if (wsMessages.length > 0) {
        wsMessages.forEach(m => seenMessageIds.current.add(m.id));
        initialLoadDone.current = true;
      }
    } else {
      const freshIds = new Set<string>();
      for (const m of wsMessages) {
        if (!seenMessageIds.current.has(m.id)) {
          freshIds.add(m.id);
          seenMessageIds.current.add(m.id);
        }
      }
      if (freshIds.size > 0) {
        freshIds.forEach(id => newMessageIds.current.add(id));
        const timer = setTimeout(() => {
          freshIds.forEach(id => newMessageIds.current.delete(id));
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [wsMessages]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    const isNearBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight) < 150 : true;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setNewMsgCount(0);
      setLastReadIndex(wsMessages.length - 1);
    } else {
      const newCount = wsMessages.length - 1 - lastReadIndex;
      if (newCount > 0) setNewMsgCount(newCount);
    }
    if (wsMessages.length > 0) chatManager.markAsRead(roomId);
  }, [wsMessages, roomId, lastReadIndex]);

  useEffect(() => {
    if (isMobile && keyboardOffset > 0) {
      const el = scrollContainerRef.current;
      const isNearBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight) < 200 : true;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        });
      }
    }
  }, [keyboardOffset, isMobile]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < 100) {
        setNewMsgCount(0);
        setLastReadIndex(wsMessages.length - 1);
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [wsMessages.length]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleClick = () => { setActiveMessageMenu(null); setShowAttach(false); };
    if (activeMessageMenu || showAttach) window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [activeMessageMenu, showAttach]);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback((e: ReactTouchEvent, msgId: string) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, msgId };
    setSwipeReplyId(null);
    setActiveSwipe(null);
    longPressTimerRef.current = setTimeout(() => {
      setActiveMessageMenu(msgId);
      longPressTimerRef.current = null;
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (!touchStartRef.current.msgId) return;
    const rawDx = e.touches[0].clientX - touchStartRef.current.x;
    const dx = Math.max(0, rawDx); // only swipe right
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (Math.abs(rawDx) > 10 || dy > 10) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    // Vertical scroll wins — abort swipe.
    if (dy > 16 && dy > dx) {
      if (activeSwipe) setActiveSwipe(null);
      touchStartRef.current = { x: 0, y: 0, msgId: null };
      return;
    }
    if (dx > 4) {
      // Apply rubber-banding past the threshold for a Messenger-feel.
      const damped = dx <= SWIPE_REPLY_THRESHOLD ? dx : SWIPE_REPLY_THRESHOLD + (dx - SWIPE_REPLY_THRESHOLD) * 0.3;
      const reached = dx >= SWIPE_HINT_THRESHOLD;
      const wasReached = !!activeSwipe?.reached;
      setActiveSwipe({ msgId: touchStartRef.current.msgId!, dx: damped, reached });
      // Haptic tick the moment we cross the hint threshold (Messenger trick).
      if (reached && !wasReached) {
        haptics.light();
      }
    }
  }, [activeSwipe]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    const swipe = activeSwipe;
    if (swipe) {
      const committed = swipe.dx >= SWIPE_REPLY_THRESHOLD;
      setActiveSwipe(null);
      if (committed) {
        // Defer to setSwipeReplyId so the existing replyingTo wiring at line ~2122 picks it up.
        setSwipeReplyId(swipe.msgId);
        haptics.medium();
      }
    }
    touchStartRef.current = { x: 0, y: 0, msgId: null };
  }, [activeSwipe]);

  const handleDoubleTap = useCallback((msgId: string) => {
    const now = Date.now();
    if (lastTapRef.current.msgId === msgId && now - lastTapRef.current.time < 300) {
      apiRequest("POST", `/api/chat/manage/messages/${msgId}/reactions`, { emoji: "\u{2764}\u{FE0F}" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', roomId, 'reactions'] });
      }).catch((err) => {
        console.error('Reaction failed:', err);
      });
      lastTapRef.current = { msgId: "", time: 0 };
    } else {
      lastTapRef.current = { msgId, time: now };
    }
  }, [roomId]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !isConnected) return;

    // Native-feel send confirmation: haptic + brief send-button pop animation.
    haptics.light();
    const sendBtn = document.querySelector<HTMLElement>(`[data-testid="button-send-msg-${roomId}"]`);
    if (sendBtn) {
      sendBtn.classList.remove("chatdock-send-pop");
      // Force reflow so the same animation can replay if you spam Send.
      void sendBtn.offsetWidth;
      sendBtn.classList.add("chatdock-send-pop");
      setTimeout(() => sendBtn.classList.remove("chatdock-send-pop"), 280);
    }

    if (editingMessage) {
      editMutation.mutate({ messageId: editingMessage.id, message: text });
      setInput("");
      inputRef.current?.focus();
      return;
    }

    setInput("");
    if (replyingTo) {
      sendRawMessage({
        type: "send_message",
        message: text,
        userName,
        role: "support",
        parentMessageId: replyingTo.id,
      });
      setReplyingTo(null);
    } else {
      sendMessage(text, userName, "support");
    }
    chatManager.updateRoomLastMessage(roomId, text, userName);

    // @Trinity / @HelpAI mention triggers AI response
    if (text.includes('@Trinity') || text.includes('@trinity')) {
      fetch('/api/ai-brain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text.replace(/@Trinity/gi, '').trim(),
          context: { source: 'chatdock', roomId, mode: 'operational' },
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.response) {
            // Trinity reacts ✅ to confirm she processed the message
            fetch(`/api/chat/manage/messages/${roomId}/trinity-react`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ emoji: '✅', source: 'trinity_auto' }),
            }).catch(() => null);
            sendMessage(`🟣 **Trinity:** ${data.response}`, 'Trinity', 'bot');
          }
        })
        .catch(() => null);
    }
    if (text.includes('@HelpAI') || text.includes('@helpai')) {
      fetch('/api/helpai/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text.replace(/@HelpAI/gi, '').trim(), roomId }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.response) {
            sendMessage(`⭐ **HelpAI:** ${data.response}`, 'HelpAI', 'bot');
          }
        })
        .catch(() => null);
    }
    inputRef.current?.focus();
  }, [input, isConnected, sendMessage, sendRawMessage, userName, replyingTo, editingMessage, editMutation]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("conversationId", roomId);

    // Capture GPS coordinates before uploading (non-blocking with 4s timeout)
    let capturedGpsAddress: string | null = null;
    try {
      const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }
        const timer = setTimeout(() => resolve(null), 4000);
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(timer); resolve(pos.coords); },
          () => { clearTimeout(timer); resolve(null); },
          { timeout: 4000, maximumAge: 30000 }
        );
      });
      if (coords) {
        formData.append("gpsLat", String(coords.latitude));
        formData.append("gpsLng", String(coords.longitude));
        formData.append("gpsAccuracy", String(coords.accuracy));
        capturedGpsAddress = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
      }
    } catch {
      // GPS capture failure is non-fatal
    }

    try {
      const response = await fetch("/api/chat/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      // Use GPS address from server response (may have been reverse-geocoded) or fallback to client coords
      const gpsAddr = data.gpsAddress || capturedGpsAddress;
      if (data.uploads && data.uploads.length > 0) {
        for (const upload of data.uploads) {
          if (upload.mimeType?.startsWith("image/")) {
            const locSuffix = gpsAddr ? ` @ ${gpsAddr}` : "";
            sendMessage(`[Shared an image${locSuffix}](${upload.url || upload.storageUrl})`, userName, "support");
          } else if (upload.mimeType?.startsWith("video/")) {
            sendMessage(`[Shared a video](${upload.url || upload.storageUrl})`, userName, "support");
          } else if (upload.mimeType?.startsWith("audio/")) {
            sendMessage(`[Shared audio](${upload.url || upload.storageUrl})`, userName, "support");
          } else {
            sendMessage(`[Shared a file: ${upload.originalFilename}](${upload.url || upload.storageUrl})`, userName, "support");
          }
        }
      }
      toast({ title: `${files.length} file(s) uploaded` });
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setShowAttach(false);
  }, [roomId, sendMessage, userName, toast]);

  // ── Voice Recording ────────────────────────────────────────────────────────
  // Hold-to-record microphone button. Uses MediaRecorder → uploads via
  // handleFileUpload → ChatServerHub transcribes via OpenAI Whisper and
  // feeds the transcript to HelpAI/Trinity for command handling.
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const startVoiceRecording = useCallback(async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        try {
          const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
          stream.getTracks().forEach((t) => t.stop());
          if (blob.size === 0) return;
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          await handleFileUpload(dt.files);
        } catch (err) {
          toast({ title: "Voice upload failed", variant: "destructive" });
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }, [isRecording, handleFileUpload, toast]);

  const stopVoiceRecording = useCallback(() => {
    try {
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current?.stop();
    } catch { /* no-op */ }
    setIsRecording(false);
  }, []);

  useEffect(() => {
    if (swipeReplyId) {
      const msg = wsMessages.find(m => m.id === swipeReplyId);
      if (msg) {
        setReplyingTo({ id: msg.id, senderName: msg.senderName || "Unknown", message: msg.message || "" });
        inputRef.current?.focus();
      }
      setSwipeReplyId(null);
    }
  }, [swipeReplyId, wsMessages]);

  const extractUrls = useCallback((text: string): string[] => {
    const urlRegex = /https?:\/\/[^\s<>[\]()]+/g;
    return text.match(urlRegex) || [];
  }, []);

  if (showInfo) {
    return <RoomInfoPanel roomId={roomId} roomName={roomName} onBack={() => setShowInfo(false)} liveUsers={onlineUsers} />;
  }

  if (forwardingMessageId) {
    return <ForwardDialog messageId={forwardingMessageId} onClose={() => setForwardingMessageId(null)} />;
  }

  let lastDateStr = "";
  let lastSenderId = "";
  let firstUnreadShown = false;

  return (
    <div className="flex flex-col h-full" role="region" aria-label={`Conversation: ${roomName}`}>
      <div className="chatdock-chat-header flex items-center gap-2 px-2.5 py-2 flex-shrink-0" data-drag-region>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white flex-shrink-0"
          onClick={closeChat}
          data-testid="button-chat-back"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="relative flex-shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs bg-white/20 text-white font-bold backdrop-blur-sm">
              {roomName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {onlineUsers.length > 0 && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#1877f2] rounded-full" />
          )}
        </div>
        <div className="flex-1 min-w-0" onClick={() => setShowInfo(true)} role="button" tabIndex={0} aria-label="Room info">
          <span className="text-[14px] font-bold truncate block leading-tight text-white">{roomName}</span>
          {!isConnected ? (
            <span className="text-[10px] text-white/60 flex items-center gap-1 leading-none">
              <WifiOff className="h-2.5 w-2.5" /> Connecting...
            </span>
          ) : onlineUsers.length > 0 ? (
            <span className="text-[10px] text-emerald-300 leading-none">Active now</span>
          ) : (
            <span className="text-[10px] text-white/50 leading-none">Tap for info</span>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white" onClick={() => setShowChatSearch(!showChatSearch)} data-testid="button-chat-search" aria-label="Search in chat">
          <Search className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white" onClick={() => setShowInfo(true)} data-testid="button-room-info" aria-label="Room info">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      {showChatSearch && (
        <div className="px-2 py-1.5 border-b border-border/30 bg-card flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
            <Input
              placeholder="Search in conversation..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="pl-8 pr-7 text-xs h-7 rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
              autoFocus
              data-testid="input-chat-search"
            />
            {chatSearch.length >= 2 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-medium">{searchHits.length}</span>
            )}
          </div>
          <button className="flex-shrink-0 p-1 rounded-full hover-elevate text-muted-foreground" onClick={() => { setShowChatSearch(false); setChatSearch(""); }} data-testid="button-close-search" aria-label="Close search">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="px-2 py-0.5 border-b bg-accent/10 flex items-center gap-1 cursor-pointer" data-testid="pinned-banner">
          <Pin className="h-2.5 w-2.5 text-primary flex-shrink-0" />
          <span className="text-[10px] text-foreground truncate flex-1">
            {pinnedMessages[0].senderName}: {pinnedMessages[0].message.slice(0, 40)}
          </span>
          <span className="text-[9px] text-muted-foreground">{pinnedMessages.length}</span>
        </div>
      )}

      {wsError && (
        <div className="px-3 py-1.5 bg-red-900/80 border-b border-red-700/40 text-red-200 text-xs flex items-center justify-between gap-2">
          <span className="truncate">{wsError === "Conversation not found" ? "Connecting to conversation..." : wsError}</span>
          <Button size="sm" variant="ghost" onClick={reconnect} className="flex-shrink-0 text-xs text-red-200 hover:text-white" data-testid="button-chat-retry">
            {wsError === "Conversation not found" ? "Reconnect" : "Retry"}
          </Button>
        </div>
      )}

      {/* Trinity thought bar moved into universal header via TrinitySessionContext.
          The header bar reads activeSessionId (set by this InlineChatView's effect)
          and polls the thought-stream endpoint for THIS room's phases. One bar,
          always visible, always context-aware. */}

      <div
        className="chatdock-scroll-pane flex-1 overflow-y-auto px-2.5 py-1.5 space-y-px relative chatdock-chat-bg"
        data-scroll="styled"
        ref={scrollContainerRef}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        onScroll={(e) => {
          // B4: pull-to-load-history. Fires once when the user reaches the
          // top of the message list and the WS hook still has a `loadOlder`
          // capability advertised. We pre-anchor the scroll position so the
          // viewport doesn't jump when older messages prepend.
          const el = e.currentTarget;
          if (el.scrollTop <= 8 && wsMessages.length >= 50 && !historyLoading && loadOlderMessages) {
            setHistoryLoading(true);
            const prevHeight = el.scrollHeight;
            loadOlderMessages().finally(() => {
              setHistoryLoading(false);
              requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                  const newHeight = scrollContainerRef.current.scrollHeight;
                  scrollContainerRef.current.scrollTop = newHeight - prevHeight;
                }
              });
            });
          }
        }}
      >
        {historyLoading && (
          <div className="chatdock-loading-history-spinner" data-testid="chatdock-history-loading">
            <Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading earlier messages…
          </div>
        )}
        {wsMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            {isConnected ? (
              <>
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full chatdock-empty-ring" />
                  <div className="absolute inset-[3px] rounded-full bg-background flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-600/10 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-primary/50" />
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">Start the conversation</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Say hello to {roomName}</p>
                </div>
              </>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Connecting to chat...
              </span>
            )}
          </div>
        ) : (
          // Performance: render only the latest 200 messages in large rooms
          // Scroll-to-top will load earlier history (future: intersection observer)
          (wsMessages.length > 200 ? wsMessages.slice(-200) : wsMessages).map((msg, idx) => {
            const msgContent = msg.message || "";
            const isOwn = msg.senderId === user?.id;
            const isSystem = msg.isSystemMessage || msg.senderType === "system";
            const isBot = msg.senderType === "bot" || msg.senderId === "ai-bot" || msg.senderId === "helpai";
            const isDeletedForAll = (msg as Record<string, unknown>).isDeletedForEveryone;
            const msgReactions = reactionsMap[msg.id] || [];
            const readReceipt = readReceipts.get(msg.id);
            const isHighlighted = chatSearch && searchHitIds.has(msg.id);
            const parentMsg = msg.parentMessageId ? parentMessageCache[msg.parentMessageId] : null;
            const urls = !isSystem && !isDeletedForAll ? extractUrls(msgContent) : [];

            const isSameAsPrev = msg.senderId === lastSenderId && !isSystem;
            const isGrouped = isSameAsPrev && idx > 0;

            let showDateDivider = false;
            if (msg.createdAt) {
              const dateStr = new Date(msg.createdAt).toDateString();
              if (dateStr !== lastDateStr) {
                showDateDivider = idx > 0;
                lastDateStr = dateStr;
              }
            }
            if (showDateDivider) lastSenderId = "";
            lastSenderId = isSystem ? "" : (msg.senderId || "");

            let showUnreadDivider = false;
            if (!firstUnreadShown && lastReadIndex >= 0 && lastReadIndex < wsMessages.length - 1 && idx === lastReadIndex + 1) {
              showUnreadDivider = true;
              firstUnreadShown = true;
            }

            if (isSystem) {
              return (
                <div key={msg.id}>
                  {showDateDivider && msg.createdAt && <DateDivider date={new Date(msg.createdAt)} />}
                  {showUnreadDivider && <UnreadDivider />}
                  <div className="text-center py-1" data-testid={`chat-msg-${msg.id}`}>
                    <span className="text-[11px] text-muted-foreground italic">{msgContent}</span>
                  </div>
                </div>
              );
            }

            const isMediaMessage = msgContent.match(/^\[(Shared an? (?:image|video|audio|file)[^\]]*)\]\(([^)]+)\)$/);

            const isNewMessage = newMessageIds.current.has(msg.id);

            return (
              <div key={msg.id}>
                {showDateDivider && msg.createdAt && <DateDivider date={new Date(msg.createdAt)} />}
                {showUnreadDivider && <UnreadDivider />}
                <div
                  className={cn(
                    "chatdock-swipe-row flex flex-col relative group",
                    isGrouped ? "py-px" : "py-0.5",
                    isOwn ? "items-end" : "items-start",
                    isHighlighted && "bg-primary/5 rounded-lg -mx-1 px-1",
                    isNewMessage && "animate-in fade-in slide-in-from-bottom-2 duration-200",
                  )}
                  data-testid={`chat-msg-${msg.id}`}
                  data-swiping={activeSwipe?.msgId === msg.id ? "true" : "false"}
                  data-swipe-reached={activeSwipe?.msgId === msg.id && activeSwipe.reached ? "true" : "false"}
                  style={activeSwipe?.msgId === msg.id ? { transform: `translateX(${activeSwipe.dx}px)` } : null}
                  onTouchStart={isMobile ? (e) => handleTouchStart(e, msg.id) : null}
                  onTouchMove={isMobile ? handleTouchMove : null}
                  onTouchEnd={isMobile ? handleTouchEnd : null}
                  onTouchCancel={isMobile ? handleTouchEnd : null}
                  onClick={isMobile ? () => handleDoubleTap(msg.id) : null}
                >
                  {/* B3: swipe-to-reply hint icon — fades in when the swipe
                       crosses the hint threshold, before the commit threshold. */}
                  <span className="chatdock-swipe-reply-hint inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1877f2]/15 text-[#1877f2]" aria-hidden="true">
                    <Reply className="h-4 w-4" />
                  </span>
                  {!isOwn && !isGrouped && (
                    <span className="text-[10px] font-medium text-muted-foreground mb-0.5 px-2 inline-flex items-center gap-1">
                      {isBot
                        ? (msg.senderId === 'helpai-bot' || msg.senderName === 'HelpAI'
                            ? <>
                                <span className="text-amber-500 font-semibold">HelpAI</span>
                                <span className="chatdock-ai-chip" data-bot="helpai" aria-label="HelpAI is the AI field manager">Field Manager</span>
                              </>
                            : <>
                                <span className="text-violet-500 font-semibold">{msg.senderName || 'Trinity'}</span>
                                <span className="chatdock-ai-chip" data-bot="trinity" aria-label="Trinity is the AI senior assistant">Senior</span>
                              </>)
                        : (msg.senderName || "Unknown")}
                      {(msg as Record<string, unknown>).bridgeChannelType && (
                        <ChannelIndicator channelType={(msg as Record<string, unknown>).bridgeChannelType} />
                      )}
                    </span>
                  )}
                  <div className="relative max-w-[85%]">
                    {!isDeletedForAll && !isSystem && !isMobile && (
                      <QuickReactionHoverBar
                        messageId={msg.id}
                        conversationId={roomId}
                        isOwn={isOwn}
                        onReply={() => setReplyingTo({ id: msg.id, senderName: msg.senderName || "Unknown", message: msgContent })}
                        onMoreActions={() => setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id)}
                      />
                    )}
                    <div
                      className={cn(
                        "px-3.5 py-2 text-[13px] break-words leading-relaxed",
                        isDeletedForAll ? "italic opacity-50" : "",
                        isOwn
                          ? cn(isGrouped ? "chat-bubble-grouped-own" : "chat-bubble-own", "chatdock-bubble-mine")
                          : isBot
                            ? cn(
                                isGrouped ? "chat-bubble-grouped-other chat-bubble-helpai" : "chat-bubble-other chat-bubble-helpai",
                                "chatdock-bubble-theirs",
                                "chatdock-ai-bubble",
                              )
                            : cn(isGrouped ? "chat-bubble-grouped-other" : "chat-bubble-other", "chatdock-bubble-theirs"),
                        // iMessage-style tail on the FIRST and LAST message in a sender run.
                        // The check below uses the same `isGrouped` signal: a group-end is the
                        // last item of a continuous sender run (next msg is different sender).
                        !isGrouped && "chatdock-bubble-tail-start",
                        // Compute end-of-run: this is the last message OR the next has a different sender.
                        ((idx === wsMessages.length - 1) || (wsMessages[idx + 1] && wsMessages[idx + 1].senderId !== msg.senderId)) && "chatdock-bubble-tail-end",
                      )}
                      data-bot={isBot ? (msg.senderId === 'helpai-bot' || msg.senderName === 'HelpAI' ? 'helpai' : 'trinity') : null}
                    >
                      {parentMsg && <QuotedMessage parentMessage={parentMsg} compact />}
                      {isDeletedForAll ? (
                        <span className="flex items-center gap-1"><Ban className="h-3 w-3" /> This message was deleted</span>
                      ) : isMediaMessage ? (
                        <div>
                          {isMediaMessage[1].includes("image") && (() => {
                            const atIdx = isMediaMessage[1].indexOf(" @ ");
                            const imgGpsAddress = atIdx !== -1 ? isMediaMessage[1].slice(atIdx + 3).trim() : null;
                            const ts = msg.createdAt ? (msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt)) : null;
                            const timeLabel = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                            return (
                              <div>
                                <div className="chat-img-card group/img">
                                  <img
                                    src={isMediaMessage[2]}
                                    alt="Shared image"
                                    loading="lazy"
                                    onClick={() => setLightboxData({ src: isMediaMessage[2], senderName: msg.senderName || null, timestamp: ts, filename: msg.attachmentName || null, gpsAddress: imgGpsAddress || null })}
                                    className="cursor-pointer"
                                    data-testid={`img-preview-${msg.id}`}
                                  />
                                  <div className="chat-img-card__overlay">
                                    {imgGpsAddress && <MapPin className="h-3 w-3 text-emerald-300 flex-shrink-0" />}
                                    <span className="text-white text-[9px] font-medium">{timeLabel}</span>
                                    {isOwn && (
                                      readReceipt
                                        ? <CheckCheck className="h-3 w-3 text-blue-300" />
                                        : <Check className="h-3 w-3 text-white/70" />
                                    )}
                                  </div>
                                  <div className="chat-img-card__actions">
                                    <button
                                      className="bg-black/70 text-white rounded-full p-1.5 flex items-center"
                                      onClick={(e) => { e.stopPropagation(); const a = document.createElement("a"); a.href = isMediaMessage[2]; a.download = msg.attachmentName || "photo.jpg"; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
                                      data-testid={`button-download-${msg.id}`}
                                      title="Download"
                                    >
                                      <Download className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                                {imgGpsAddress && (
                                  <div className="flex items-center gap-0.5 mt-1 text-[10px] text-emerald-600 dark:text-emerald-400" data-testid={`text-gps-${msg.id}`}>
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[200px]">{imgGpsAddress}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {isMediaMessage[1].includes("video") && (
                            <video src={isMediaMessage[2]} controls className="max-w-full rounded-lg max-h-48" />
                          )}
                          {isMediaMessage[1].includes("audio") && (
                            <VoicePlayer src={isMediaMessage[2]} />
                          )}
                          {isMediaMessage[1].includes("file") && (
                            <a href={isMediaMessage[2]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline text-xs">
                              <FileText className="h-3 w-3" /> {msg.attachmentName || isMediaMessage[1]}
                            </a>
                          )}
                          {msg.message && msg.message !== "[image]" && msg.message !== "[file]" && msg.message !== "[video]" && msg.message !== "[audio]" && (
                            <p className="text-[13px] mt-1"><FormattedMessage text={msg.message} /></p>
                          )}
                        </div>
                      ) : (
                        <FormattedMessage text={msgContent} />
                      )}
                      {msg.isEdited && (
                        <span className={cn("text-[9px] ml-1", isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>(edited)</span>
                      )}
                    </div>

                    {!isDeletedForAll && urls.length > 0 && !isMediaMessage && (
                      <LinkPreview url={urls[0]} />
                    )}

                    <ReactionBadges messageId={msg.id} reactions={msgReactions} conversationId={roomId} />

                    {!isDeletedForAll && !isSystem && !isMobile && (
                      <button
                        className={cn(
                          "absolute -top-1 bg-card border border-border rounded-full p-0.5 shadow-sm transition-opacity",
                          "opacity-0 group-hover:opacity-100",
                          isOwn ? "-left-1" : "-right-1"
                        )}
                        style={{ visibility: activeMessageMenu === msg.id ? "visible" : null }}
                        onClick={(e) => { e.stopPropagation(); setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id); }}
                        data-testid={`button-msg-menu-${msg.id}`}
                      >
                        <MoreVertical className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}

                    {activeMessageMenu === msg.id && (
                      <MessageActions
                        messageId={msg.id}
                        isOwn={isOwn}
                        conversationId={roomId}
                        onClose={() => setActiveMessageMenu(null)}
                        onReply={() => setReplyingTo({ id: msg.id, senderName: msg.senderName || "Unknown", message: msgContent })}
                        onEdit={isOwn ? () => { setEditingMessage({ id: msg.id, message: msgContent }); setInput(msgContent); } : null}
                        onForward={() => setForwardingMessageId(msg.id)}
                      />
                    )}
                  </div>
                  {!isGrouped && (
                    <div className="flex items-center gap-1 mt-0.5 px-2">
                      {msg.createdAt && (
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {(msg as Record<string, unknown>).bridgeChannelType && (
                        <ChannelIndicator channelType={(msg as Record<string, unknown>).bridgeChannelType} />
                      )}
                      {isOwn && (msg as Record<string, unknown>).bridgeDeliveryStatus ? (
                        <DeliveryStatusIndicator status={(msg as Record<string, unknown>).bridgeDeliveryStatus} />
                      ) : isOwn && (() => {
                        // Read-receipt ladder (B1):
                        //   read       — recipient acknowledged the message
                        //   delivered  — server persisted, recipient online but hasn't read yet
                        //   sent       — server persisted, recipient offline / no socket
                        const recipientOnline = onlineUsers.some(u => u.id !== user?.id);
                        const state: 'sent' | 'delivered' | 'read' =
                          readReceipt ? 'read' : recipientOnline ? 'delivered' : 'sent';
                        const Icon = state === 'sent' ? Check : CheckCheck;
                        return (
                          <span
                            className="chatdock-receipt inline-flex"
                            data-state={state}
                            data-testid={`receipt-${state}-${msg.id}`}
                            aria-label={`Message ${state}`}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {typingUserInfo && <TypingBubble name={typingUserInfo.name} />}
        <div ref={messagesEndRef} />
        <ScrollToBottomFab containerRef={scrollContainerRef} newCount={newMsgCount} />
      </div>

      {isInTriage && (
        <div className="px-2 py-0.5 border-t bg-accent/20 text-[10px] text-muted-foreground text-center">
          HelpAI is assisting. Staff will join if needed.
        </div>
      )}

      {replyingTo && (
        <div className="px-2 py-1 border-t bg-muted/50 flex items-center gap-1.5" data-testid="reply-preview">
          <Reply className="h-3 w-3 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold text-primary">{replyingTo.senderName}: </span>
            <span className="text-[10px] text-muted-foreground truncate">{replyingTo.message.slice(0, 50)}</span>
          </div>
          <button className="flex-shrink-0 p-0.5 rounded text-muted-foreground" onClick={() => setReplyingTo(null)} data-testid="button-cancel-reply" aria-label="Cancel reply">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {editingMessage && (
        <div className="px-2 py-1 border-t bg-accent/20 flex items-center gap-1.5" data-testid="edit-preview">
          <Pencil className="h-3 w-3 text-primary flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground flex-1">Editing message</span>
          <button className="flex-shrink-0 p-0.5 rounded text-muted-foreground" onClick={() => { setEditingMessage(null); setInput(""); }} data-testid="button-cancel-edit" aria-label="Cancel edit">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
        data-testid="input-file-upload"
      />

      <div className="chatdock-input-bar chatdock-safe-area-bottom">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full flex-shrink-0 text-[#1877f2]/80 hover:bg-[#1877f2]/10 hover:text-[#1877f2]"
              onClick={(e) => { e.stopPropagation(); setShowAttach(!showAttach); }}
              disabled={!isConnected}
              data-testid="button-attach-file"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {showAttach && (
              <div className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-md shadow-sm py-2 min-w-[180px] z-50 animate-in slide-in-from-bottom-2 fade-in duration-150" data-testid="menu-attach">
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover-elevate active-elevate-2 text-left"
                  onClick={() => { fileInputRef.current!.accept = "image/*"; fileInputRef.current!.click(); }}
                  data-testid="button-attach-image"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Image className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="font-medium">Photo</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover-elevate active-elevate-2 text-left"
                  onClick={() => { fileInputRef.current!.accept = "video/*"; fileInputRef.current!.click(); }}
                  data-testid="button-attach-video"
                >
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <Video className="h-4 w-4 text-red-500" />
                  </div>
                  <span className="font-medium">Video</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover-elevate active-elevate-2 text-left"
                  onClick={() => { fileInputRef.current!.accept = "audio/*"; fileInputRef.current!.click(); }}
                  data-testid="button-attach-audio"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <Mic className="h-4 w-4 text-orange-500" />
                  </div>
                  <span className="font-medium">Audio</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover-elevate active-elevate-2 text-left"
                  onClick={() => { fileInputRef.current!.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"; fileInputRef.current!.click(); }}
                  data-testid="button-attach-document"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="font-medium">Document</span>
                </button>
              </div>
            )}
          </div>
          {/* @mention picker — WhatsApp style */}
          {mentionQuery !== null && (() => {
            const BOT_MENTIONS = [
              { id: '@Trinity', name: 'Trinity', role: 'AI Brain', badge: 'AI', color: 'hsl(271 81% 56%)' },
              { id: '@HelpAI', name: 'HelpAI', role: 'Field Supervisor', badge: 'BOT', color: 'hsl(38 92% 50%)' },
            ];
            const memberMentions = (dbParticipants ?? []).map((m: { firstName?: string; lastName?: string; workspaceRole?: string }) => ({
              id: `@${m.firstName ?? ''}${m.lastName ?? ''}`,
              name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
              role: m.workspaceRole || 'Member',
              badge: null as string | null,
              color: null as string | null,
            }));
            const allMentions = [...BOT_MENTIONS, ...memberMentions];
            const filtered = allMentions.filter(item => item.name.toLowerCase().includes(mentionQuery ?? '')).slice(0, 6);
            return (
              <div className="absolute bottom-full left-12 right-12 mb-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in slide-in-from-bottom-1 fade-in duration-150" data-testid="mention-picker">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matches for @{mentionQuery}</div>
                ) : filtered.map(item => (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors text-sm"
                    data-testid={`mention-option-${item.id}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const before = input.slice(0, mentionAnchor);
                      const after = input.slice(mentionAnchor + (mentionQuery?.length ?? 0) + 1);
                      setInput(`${before}${item.id} ${after}`);
                      setMentionQuery(null);
                      setMentionAnchor(-1);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: item.color ?? 'hsl(var(--primary))' }}
                    >
                      {item.badge ?? item.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{item.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={input}
            rows={1}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              // Auto-grow: reset and re-measure so the textarea expands up
              // to the CSS max-height (then scrolls), giving a Messenger-style
              // composer that grows with the text.
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 144)}px`;
              // Detect @mention trigger
              const cursor = (e.target as HTMLInputElement).selectionStart ?? val.length;
              const before = val.slice(0, cursor);
              const mentionMatch = before.match(/@([\w]*)$/);
              if (mentionMatch) {
                setMentionQuery(mentionMatch[1].toLowerCase());
                setMentionAnchor(cursor - mentionMatch[0].length);
              } else {
                setMentionQuery(null);
                setMentionAnchor(-1);
              }
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter inserts newline (Slack/Messenger convention).
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              if (e.key === "Escape") { setReplyingTo(null); setEditingMessage(null); setInput(""); }
            }}
            placeholder={editingMessage ? "Edit message..." : replyingTo ? `↩ Reply to ${replyingTo.senderName}...` : isConnected ? "Message (@ to mention, Shift+Enter for newline)..." : "Connecting..."}
            disabled={!isConnected}
            // chatdock-composer-textarea: caps height + monospace switch on code blocks.
            // The data-mode attribute flips font-family when the content contains a
            // ```code``` block so users get instant visual feedback on formatting.
            className="chatdock-composer-textarea text-sm flex-1 min-h-10 rounded-2xl bg-muted/60 border-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1877f2]/40 px-4 py-2 leading-relaxed"
            data-mode={input.includes('```') ? 'code' : 'text'}
            data-testid={`input-chat-msg-${roomId}`}
          />
          {!input.trim() && !editingMessage && (
            <VoiceRecordButton
              roomId={roomId}
              isConnected={isConnected}
              isRecording={isRecording}
              onStart={startVoiceRecording}
              onStop={stopVoiceRecording}
            />
          )}
          <div className="flex-shrink-0">
            <Button
              size="icon"
              className={cn(
                "h-10 w-10 rounded-full transition-all duration-200",
                input.trim() && isConnected
                  ? "chatdock-send-active"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              onClick={handleSend}
              disabled={!input.trim() || !isConnected}
              data-testid={`button-send-msg-${roomId}`}
              aria-label={editingMessage ? "Save edit" : "Send message"}
            >
              {editingMessage ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {lightboxData && createPortal(
        <ImageLightbox data={lightboxData} onClose={() => setLightboxData(null)} />,
        document.body
      )}
    </div>
  );
}
function VoiceRecordButton({
  roomId,
  isConnected,
  isRecording,
  onStart,
  onStop,
}: {
  roomId: string;
  isConnected: boolean;
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex-shrink-0">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onStart(); }}
        onMouseUp={onStop}
        onMouseLeave={() => { if (isRecording) onStop(); }}
        onTouchStart={(e) => { e.preventDefault(); onStart(); }}
        onTouchEnd={onStop}
        disabled={!isConnected}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
          isRecording
            ? "bg-red-500 text-white animate-pulse"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        )}
        data-testid={`button-voice-record-${roomId}`}
        aria-label={isRecording ? "Release to send voice message" : "Hold to record voice"}
        title={isRecording ? "Release to send" : "Hold to record"}
      >
        <Mic className="h-4 w-4" />
      </button>
    </div>
  );
}

