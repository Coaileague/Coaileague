import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, lazy, Suspense, type TouchEvent as ReactTouchEvent } from "react";
import { StatusBadge } from '@/components/ui/status-badge';
import { createPortal } from "react-dom";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useChatViewState } from "./useChatViewState";
import { useMessageActions, useRoomActions, useUserActions } from "./useChatActions";
import { useChatRoomSummaries, useChatUnreadTotal, useRoomTypingUser } from "@/hooks/useChatManager";
import { useMobileKeyboardOffset } from "./chatdock-helpers";
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
import { chatManager } from "@/services/chatConnectionManager";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// C2 — code-split conversation pane.  The bubble shell (this file) ships
// without the message-list / composer / lightbox / action-menu code; it
// loads only when a room is opened.  React.lazy() returns a dynamic chunk
// the bundler emits as a separate file.
const InlineChatView = lazy(() =>
  import("./ConversationPane").then(m => ({ default: m.InlineChatView })),
);

// Tiny inline fallback shown for the brief moment while the conversation
// pane chunk downloads. Keeps the dock from flashing empty.
function PaneLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full w-full text-muted-foreground" data-testid="chatdock-pane-loading">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      <span className="text-sm">Opening conversation…</span>
    </div>
  );
}

function smartTimestamp(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);
  if (date >= startOfToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function getLastMsgPreview(msg: string | null | undefined): { isMedia: boolean; mediaType: "image" | "video" | "audio" | "file" | null; text: string } {
  if (!msg) return { isMedia: false, mediaType: null, text: "" };
  if (/\[Shared an image/i.test(msg)) return { isMedia: true, mediaType: "image", text: "Photo" };
  if (/\[Shared a video/i.test(msg)) return { isMedia: true, mediaType: "video", text: "Video" };
  if (/\[Shared audio/i.test(msg)) return { isMedia: true, mediaType: "audio", text: "Voice message" };
  if (/\[Shared a file/i.test(msg)) return { isMedia: true, mediaType: "file", text: "File" };
  return { isMedia: false, mediaType: null, text: msg };
}

function useStableViewportHeight() {
  const [stableHeight, setStableHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  const lastKnownFullHeight = useRef<number>(
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastKnownFullHeight.current = window.innerHeight;
    setStableHeight(window.innerHeight);

    const vv = window.visualViewport;

    const handleVVResize = () => {
      if (!vv) return;
      const keyboardOpen = lastKnownFullHeight.current - vv.height > 100;
      if (!keyboardOpen) {
        lastKnownFullHeight.current = vv.height;
        setStableHeight(vv.height);
      }
    };

    const handleWindowResize = () => {
      const vvHeight = vv?.height ?? window.innerHeight;
      const keyboardOpen = vv ? (lastKnownFullHeight.current - vvHeight > 100) : false;
      if (!keyboardOpen) {
        lastKnownFullHeight.current = window.innerHeight;
        setStableHeight(window.innerHeight);
      }
    };

    let orientationTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOrientation = () => {
      if (orientationTimer) clearTimeout(orientationTimer);
      orientationTimer = setTimeout(handleWindowResize, 200);
    };

    if (vv) {
      vv.addEventListener("resize", handleVVResize);
    }
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      if (orientationTimer) clearTimeout(orientationTimer);
      if (vv) vv.removeEventListener("resize", handleVVResize);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  return stableHeight;
}


function ConversationActions({
  open,
  roomId,
  roomName,
  roomType,
  onClose,
  onLeaveSuccess,
}: {
  open: boolean;
  roomId: string;
  roomName: string;
  roomType: string;
  onClose: () => void;
  onLeaveSuccess?: () => void;
}) {
  const { toast } = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!open) setConfirmLeave(false);
  }, [open]);

  // C1: useRoomActions provides the canonical mutation + cache-invalidation
  // pattern. Component-specific side effects (toast copy, chatManager.removeRoom,
  // onLeaveSuccess) are layered on via the per-mutate onSuccess hook so the
  // shared hook stays UI-agnostic.
  const roomActions = useRoomActions(roomId, { onAfter: onClose });
  const hideConvo = {
    ...roomActions.hideConvo,
    mutate: () => roomActions.hideConvo.mutate(undefined, {
      onSuccess: () => {
        chatManager.removeRoom(roomId);
        toast({ title: "Conversation archived", description: "You can rejoin anytime" });
        onLeaveSuccess?.();
      },
    }),
  };
  const leaveConvo = {
    ...roomActions.leaveConvo,
    mutate: () => roomActions.leaveConvo.mutate(undefined, {
      onSuccess: () => {
        chatManager.removeRoom(roomId);
        toast({ title: "Left conversation", description: `You have left "${roomName}"` });
        onLeaveSuccess?.();
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error.message || "Failed to leave conversation", variant: "destructive" });
      },
    }),
  };
  const muteConvo = {
    ...roomActions.muteConvo,
    mutate: (muted: boolean) => roomActions.muteConvo.mutate(muted, {
      onSuccess: () => {
        chatManager.loadRoomList();
        toast({ title: muted ? "Notifications muted" : "Notifications unmuted" });
      },
    }),
  };

  const isDM = roomType === 'dm_user' || roomType === 'dm_bot' || roomType === 'dm_support' || roomType === 'direct' || roomType === 'dm';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-t-xl w-full max-w-md p-4 space-y-2" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-medium text-center text-muted-foreground pb-1 border-b">{roomName}</div>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
          onClick={() => { hideConvo.mutate(); }}>Archive conversation</button>
        {!isDM && (
          <button className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm text-destructive"
            onClick={() => { if (confirmLeave) { leaveConvo.mutate(); } else { setConfirmLeave(true); } }}>
            {confirmLeave ? 'Tap again to confirm leave' : 'Leave conversation'}
          </button>
        )}
        <button className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
          onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function NewConversationView({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string, name: string) => void }) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"dm" | "room">("dm");
  const [roomName, setRoomName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const { toast } = useToast();

  const searchQuery = useQuery({
    queryKey: ["/api/chat/manage/users/search", search],
    queryFn: () => fetch(`/api/chat/manage/users/search?q=${encodeURIComponent(search)}`, { credentials: "include" }).then(r => r.json()),
    enabled: search.length >= 2,
  });

  const createDM = useMutation({
    mutationFn: async (recipient: { id: string; name: string }) => {
      const res = await apiRequest("POST", "/api/chat/manage/dm/create", { recipientId: recipient.id });
      const data = await res.json();
      return { ...data, recipientName: recipient.name };
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      await chatManager.loadRoomList();
      onCreated(data.conversationId, data.recipientName || "Direct Message");
    },
    onError: () => toast({ title: "Failed to create conversation", variant: "destructive" }),
  });

  const createRoom = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/manage/rooms/create", {
        name: roomName.trim(),
        participantIds: selectedUsers.map((u) => u.id),
      });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      await chatManager.loadRoomList();
      onCreated(data.conversationId, roomName.trim());
    },
    onError: (error: any) => {
      let message = "Failed to create room";
      try {
        // ApiError.message is "{status}: {body}" — extract JSON body from the suffix
        const raw = error?.message || '';
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          const body = JSON.parse(raw.slice(jsonStart));
          if (body?.code === 'RESERVED_ROOM_NAME') {
            message = body.error || "That room name is reserved. Please choose a different name.";
          } else if (body?.error) {
            message = body.error;
          }
        }
      } catch (_) {}
      toast({ title: message, variant: "destructive" });
    },
  });

  const users = searchQuery.data?.users || [];

  return (
    <div className="flex flex-col h-full">
      <div className="chatdock-header-gradient flex items-center gap-2 px-2.5 py-2" data-drag-region>
        <Button size="icon" variant="ghost" className="flex-shrink-0 text-white/80" onClick={onBack} data-testid="button-new-convo-back" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
          <UserPlus className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold tracking-tight text-white">New Conversation</h3>
      </div>

      <div className="px-2.5 py-2 bg-card border-b border-border/30">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={mode === "dm" ? "default" : "outline"}
            onClick={() => setMode("dm")}
            data-testid="button-mode-dm"
            className={cn(
              "flex-1 text-xs rounded-full",
              mode === "dm" && "bg-gradient-to-r from-cyan-500 to-blue-600 border-0 text-white shadow-sm shadow-cyan-500/20"
            )}
          >
            <MessageCircle className="h-3 w-3 mr-1" /> Message
          </Button>
          <Button
            size="sm"
            variant={mode === "room" ? "default" : "outline"}
            onClick={() => setMode("room")}
            data-testid="button-mode-room"
            className={cn(
              "flex-1 text-xs rounded-full",
              mode === "room" && "bg-gradient-to-r from-violet-500 to-purple-600 border-0 text-white shadow-sm shadow-violet-500/20"
            )}
          >
            <Users className="h-3 w-3 mr-1" /> Group
          </Button>
        </div>
      </div>

      {mode === "room" && (
        <div className="px-2.5 py-2 bg-card/50 border-b border-border/20">
          <Input
            placeholder="Room name..."
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="text-sm rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            data-testid="input-room-name"
          />
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedUsers.map((u) => (
                <Badge key={u.id} variant="secondary" className="text-[10px] gap-1 rounded-full">
                  {u.name}
                  <button onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id));
                  }} data-testid={`button-remove-user-${u.id}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-2.5 py-1.5 bg-card border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8 rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            data-testid="input-search-people"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pt-1" data-scroll="styled">
        {(createDM.isPending || createRoom.isPending) && (
          <div className="flex items-center justify-center gap-2 p-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Creating conversation...</span>
          </div>
        )}
        {searchQuery.isLoading && search.length >= 2 && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {users.map((u: any) => {
          const isSelected = selectedUsers.find((s) => s.id === u.id);
          return (
            <button
              key={u.id}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl transition-all duration-150 hover:bg-muted/70",
                isSelected && "bg-primary/[0.06] dark:bg-primary/[0.10]"
              )}
              onClick={() => {
                if (mode === "dm") {
                  createDM.mutate({ id: u.id, name: u.name });
                } else {
                  if (!isSelected) {
                    setSelectedUsers((prev) => [...prev, { id: u.id, name: u.name }]);
                  } else {
                    setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id));
                  }
                }
              }}
              disabled={createDM.isPending}
              data-testid={`button-user-${u.id}`}
            >
              <div className="chatdock-avatar-ring">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                    {(u.name || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium truncate block">{u.name}</span>
                <span className="text-[11px] text-muted-foreground truncate block">{u.email}</span>
              </div>
              {mode === "dm" && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
              )}
              {mode === "room" && isSelected && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          );
        })}
        {search.length < 2 && users.length === 0 && !searchQuery.isLoading && (
          <div className="flex flex-col items-center justify-center px-6 py-10">
            <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <Search className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-xs text-muted-foreground text-center">Type at least 2 characters to search for people</p>
          </div>
        )}
        {search.length >= 2 && !searchQuery.isLoading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-10">
            <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <Users className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-xs text-muted-foreground text-center">No people found for &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </div>

      {mode === "room" && roomName.trim() && selectedUsers.length > 0 && (
        <div className="border-t border-border/30 p-2.5 bg-card">
          <Button
            className="w-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 border-0 text-white shadow-sm shadow-violet-500/20"
            size="sm"
            onClick={() => createRoom.mutate()}
            disabled={createRoom.isPending}
            data-testid="button-create-room"
          >
            {createRoom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Create Room ({selectedUsers.length} {selectedUsers.length === 1 ? 'member' : 'members'})
          </Button>
        </div>
      )}
    </div>
  );
}

function RoomPreviewLine({
  room,
  hasUnread,
  isSupport,
}: {
  room: { roomId: string; lastMessage?: string; lastMessageSender?: string };
  hasUnread: boolean;
  isSupport: boolean;
}) {
  const typingUser = useRoomTypingUser(room.roomId);
  return (
    <span className={cn(
      "text-[12px] truncate flex-1 min-w-0 leading-snug flex items-center gap-1",
      hasUnread ? "text-foreground/75 font-medium" : "text-muted-foreground",
    )}>
      {typingUser ? (
        <span className="chatdock-list-typing italic text-[#1877f2]" data-testid={`room-typing-${room.roomId}`}>
          {typingUser} is typing…
        </span>
      ) : (() => {
        const preview = getLastMsgPreview(room.lastMessage);
        const prefix = room.lastMessageSender ? `${room.lastMessageSender}: ` : "";
        if (preview.isMedia) {
          return <>
            {prefix && <span className="truncate">{prefix}</span>}
            {preview.mediaType === "image" && <Image className="h-3 w-3 flex-shrink-0 text-[#1877f2]/60" />}
            {preview.mediaType === "video" && <Video className="h-3 w-3 flex-shrink-0 text-[#1877f2]/60" />}
            {preview.mediaType === "audio" && <Mic className="h-3 w-3 flex-shrink-0 text-[#1877f2]/60" />}
            {preview.mediaType === "file" && <FileText className="h-3 w-3 flex-shrink-0 text-[#1877f2]/60" />}
            <span className="truncate">{preview.text}</span>
          </>;
        }
        return prefix
          ? <><span className="truncate">{prefix}{preview.text}</span></>
          : <span className="truncate">{preview.text || (isSupport ? "Tap to get help from HelpAI" : "No messages yet")}</span>;
      })()}
    </span>
  );
}

function ConversationList({ onSelectRoom, isFullPage }: { onSelectRoom: (roomId: string, roomName: string) => void; isFullPage?: boolean }) {
  const rawRooms = useChatRoomSummaries();
  const rooms = rawRooms ?? [];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "dms" | "chatrooms" | "shift" | "support">("all");
  const [, setLocation] = useLocation();
  const { closeBubble } = useChatDock();
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [actionMenuRoom, setActionMenuRoom] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleLongPressStart = useCallback((roomId: string, e: React.TouchEvent) => {
    longPressTriggered.current = false;
    longPressStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      longPressStartPos.current = null;
      // Confirm the long-press fired with a slightly stronger haptic — same
      // feedback Messenger gives when the reaction bar pops out.
      haptics.medium();
      setActionMenuRoom(roomId);
    }, 650);
  }, []);

  const handleLongPressMove = useCallback((e: React.TouchEvent) => {
    if (!longPressStartPos.current || !longPressTimer.current) return;
    const dx = Math.abs(e.touches[0].clientX - longPressStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - longPressStartPos.current.y);
    if (dx > 8 || dy > 8) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      longPressStartPos.current = null;
    }
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStartPos.current = null;
  }, []);

  const handleLongPressCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStartPos.current = null;
  }, []);

  if (showNewConvo) {
    return (
      <NewConversationView
        onBack={() => setShowNewConvo(false)}
        onCreated={(id, name) => {
          setShowNewConvo(false);
          onSelectRoom(id, name);
        }}
      />
    );
  }

  const isDMType = (t: string | undefined) => t === 'dm_user' || t === 'dm_bot' || t === 'dm_support' || t === 'direct' || t === 'dm';
  const isChatroomType = (t: string | undefined) => t === 'work' || t === 'org' || t === 'open_chat' || t === 'shift' || t === 'shift_chat' || t === 'meeting' || t === 'platform';
  const isShiftType = (t: string | undefined) => t === 'shift' || t === 'shift_chat';
  const isSupportType = (t: string | undefined) => t === 'support' || t === 'dm_support';

  const filtered = rooms
    .filter(r => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      const t = r.type;
      if (filter === "dms") return isDMType(t);
      if (filter === "chatrooms") return isChatroomType(t);
      if (filter === "shift") return isShiftType(t);
      if (filter === "support") return isSupportType(t);
      return true;
    })
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

  const renderRoomItem = (room: typeof rooms[0]) => {
    const hasUnread = room.unreadCount > 0;
    const isOnline = (room as any).isOnline;
    const isDM = isDMType(room.type);
    const isSupport = isSupportType(room.type);
    const isShift = isShiftType(room.type);
    return (
      <div key={room.roomId} className={cn("relative chatdock-room-item", hasUnread && "chatdock-room-item--unread")} role="option" aria-selected={false}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (longPressTriggered.current) return;
            haptics.light();
            onSelectRoom(room.roomId, room.name);
          }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectRoom(room.roomId, room.name); }}
          onTouchStart={(e) => handleLongPressStart(room.roomId, e)}
          onTouchMove={handleLongPressMove}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressCancel}
          onContextMenu={(e) => { e.preventDefault(); haptics.medium(); setActionMenuRoom(room.roomId); }}
          className={cn(
            "chatdock-row-press w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left cursor-pointer rounded-xl",
            hasUnread && "bg-blue-500/[0.06] dark:bg-blue-500/[0.1]",
            isSupport && "border-b border-border/30"
          )}
          aria-label={`${room.name}${hasUnread ? `, ${room.unreadCount} unread messages` : ""}${room.lastMessage ? `, last message: ${room.lastMessage}` : ""}`}
          data-testid={`chat-bubble-room-${room.roomId}`}
        >
          <div className="relative flex-shrink-0">
            <div className={isDM ? "chatdock-avatar-ring" : "chatdock-avatar-ring-group"}>
              <Avatar className="h-11 w-11">
                <AvatarFallback className={cn(
                  "text-sm font-bold",
                  isSupport ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
                    : isShift ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
                    : isDM ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white"
                    : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                )}>
                  {isSupport ? <Headphones className="h-5 w-5" />
                    : isShift ? <Calendar className="h-5 w-5" />
                    : isDM ? room.name.slice(0, 2).toUpperCase()
                    : <Users className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
            </div>
            {isOnline && (
              <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-card rounded-full z-10">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className={cn(
                "text-[14px] truncate min-w-0",
                hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground/90"
              )}>{room.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {room.lastMessageAt && (
                  <span className={cn(
                    "text-[11px] whitespace-nowrap",
                    hasUnread ? "text-[#1877f2] font-semibold" : "text-muted-foreground"
                  )}>
                    {smartTimestamp(room.lastMessageAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <RoomPreviewLine room={room} hasUnread={hasUnread} isSupport={isSupport} />
              {hasUnread && (
                <span className="chatdock-unread-badge" data-testid={`badge-unread-${room.roomId}`}>
                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="chatdock-header-gradient flex items-center justify-between gap-1 px-3 py-2.5 flex-shrink-0" data-drag-region>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 shadow-inner">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-[15px] font-bold tracking-tight whitespace-nowrap text-white leading-none" data-testid="text-messages-title">Messages</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white" onClick={() => setShowNewConvo(true)} data-testid="button-new-conversation" aria-label="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
          {!isFullPage && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white" onClick={() => { closeBubble(); setLocation("/chatrooms"); }} data-testid="button-chat-bubble-fullscreen" aria-label="Open full chat page">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white" onClick={closeBubble} data-testid="button-chat-bubble-close" aria-label="Close messages">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-3 pt-2 pb-1.5 bg-card border-b border-border/40 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm h-9 rounded-full bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-blue-500/40 placeholder:text-muted-foreground/50"
            data-testid="input-chat-bubble-search"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap pb-0.5" data-testid="filter-chat-type">
          {([
            { id: "all", label: "All", Icon: MessageCircle },
            { id: "dms", label: "DMs", Icon: MessageSquare },
            { id: "chatrooms", label: "Rooms", Icon: Users },
            { id: "shift", label: "Shift", Icon: Calendar },
            { id: "support", label: "Support", Icon: Headphones },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all",
                filter === f.id
                  ? "bg-[#1877f2] text-white shadow-sm shadow-blue-500/30"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted"
              )}
              data-testid={`button-filter-${f.id}`}
            >
              <f.Icon className="h-2.5 w-2.5 flex-shrink-0" />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-scroll="styled" role="listbox" aria-label="Conversations">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-8">
            <div className="relative w-16 h-16 mb-3">
              <div className="absolute inset-0 rounded-full chatdock-empty-ring" />
              <div className="absolute inset-[3px] rounded-full bg-background flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-600/15 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-primary/60" />
                </div>
              </div>
            </div>
            <p className="text-sm font-medium text-foreground/80 mb-0.5">{search ? "No results" : "No conversations yet"}</p>
            <p className="text-xs text-muted-foreground mb-3 text-center max-w-[200px]">
              {search ? "Try a different search term" : "Start a conversation with your team or clients"}
            </p>
            {!search && (
              <Button variant="default" onClick={() => setShowNewConvo(true)} data-testid="button-start-convo" className="rounded-full px-5 bg-gradient-to-r from-cyan-500 to-blue-600 border-0 text-white shadow-sm shadow-cyan-500/20">
                <Plus className="h-4 w-4 mr-1.5" /> New conversation
              </Button>
            )}
          </div>
        ) : (
          <>{filtered.map(renderRoomItem)}</>
        )}
      </div>
      <ConversationActions
        open={!!actionMenuRoom}
        roomId={actionMenuRoom ?? ""}
        roomName={rooms.find(r => r.roomId === actionMenuRoom)?.name ?? ""}
        roomType={rooms.find(r => r.roomId === actionMenuRoom)?.type ?? ""}
        onClose={() => setActionMenuRoom(null)}
        onLeaveSuccess={() => setActionMenuRoom(null)}
      />
    </div>
  );
}


function BubblePopup() {
  const { bubbleOpen, activeChatRoom, openChat, closeBubble } = useChatDock();
  const isMobile = useIsMobile();
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [hasAnimated, setHasAnimated] = useState(false);
  const stableHeight = useStableViewportHeight();
  const keyboardOffset = useMobileKeyboardOffset();

  useEffect(() => {
    if (!bubbleOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBubble();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bubbleOpen, closeBubble]);

  useEffect(() => {
    const handleSelectRoom = (e: Event) => {
      const { roomId, roomName } = (e as CustomEvent).detail || {};
      if (roomId && roomName) openChat(roomId, roomName);
    };
    window.addEventListener("chatdock-select-room", handleSelectRoom);
    return () => window.removeEventListener("chatdock-select-room", handleSelectRoom);
  }, [openChat]);

  useEffect(() => {
    if (bubbleOpen && !isMobile) {
      const popupW = 440;
      const popupH = activeChatRoom ? 600 : Math.min(620, window.innerHeight * 0.78);
      setPosition({
        x: window.innerWidth - popupW - 16,
        y: window.innerHeight - popupH - 72,
      });
      setHasAnimated(false);
      const raf = requestAnimationFrame(() => setHasAnimated(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setPosition(null);
    }
  }, [bubbleOpen, isMobile, activeChatRoom]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [data-scroll]")) return;
    const header = target.closest("[data-drag-region]");
    if (!header) return;
    if (!position) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 100, newX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, newY)),
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!bubbleOpen) return null;

  const content = activeChatRoom
    ? (
        <Suspense fallback={<PaneLoadingFallback />}>
          <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
        </Suspense>
      )
    : <ConversationList onSelectRoom={(id, name) => openChat(id, name)} />;

  if (isMobile) {
    const mobileHeight = stableHeight > 0 ? `${stableHeight}px` : "100dvh";
    const mobileBottomInset = keyboardOffset > 0
      ? `calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px)`
      : "env(safe-area-inset-bottom, 0px)";

    return (
      <div
        className="fixed inset-0 z-[9998] bg-card flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        style={{
          height: mobileHeight,
          maxHeight: mobileHeight,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: mobileBottomInset,
          overflow: "hidden",
        }}
        data-testid="chat-bubble-popup-mobile"
        role="dialog"
        aria-label="Chat"
      >
        {content}
      </div>
    );
  }

  if (!position) return null;

  return (
    <div
      ref={popupRef}
      className={cn(
        "fixed w-[440px] z-[1031] bg-card flex flex-col overflow-hidden",
        !hasAnimated && "animate-in slide-in-from-bottom-3 fade-in duration-250",
        isDragging && "select-none"
      )}
      style={{
        height: activeChatRoom ? "600px" : "min(620px, 78vh)",
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? "grabbing" : undefined,
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
      data-testid="chat-bubble-popup-desktop"
      role="dialog"
      aria-label="Chat"
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  );
}

/**
 * DesktopChatFAB
 * ==============
 * A persistent floating chat trigger button for desktop screens.
 * Hidden on mobile (mobile uses UniversalFAB). Positioned bottom-right,
 * shows unread count badge, toggles the BubblePopup panel.
 */
function DesktopChatFAB() {
  const { toggleBubble, bubbleOpen } = useChatDock();
  const unreadTotal = useChatUnreadTotal();

  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-[1031]" data-testid="desktop-chat-fab">
      <button
        onClick={() => { haptics.light(); toggleBubble(); }}
        aria-label={bubbleOpen ? "Close chat" : "Open chat"}
        className="chatdock-tap relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{
          background: bubbleOpen
            ? 'linear-gradient(135deg, #374151, #1f2937)'
            : 'linear-gradient(135deg, #1877f2 0%, #0a5fd6 100%)',
          boxShadow: bubbleOpen
            ? '0 4px 16px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(24,119,242,0.45), 0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        {bubbleOpen
          ? <X className="h-6 w-6 text-white" />
          : <MessageCircle className="h-6 w-6 text-white" />
        }
        {!bubbleOpen && unreadTotal > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[20px] h-[20px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none shadow-md"
            data-testid="badge-desktop-chat-unread"
          >
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * UnifiedChatBubble
 * =================
 * Renders both the desktop floating FAB trigger button (DesktopChatFAB)
 * and the BubblePopup panel via a portal. On mobile, the FAB is hidden —
 * mobile uses UniversalFAB instead.
 */

export function UnifiedChatBubble() {
  const { closeBubble } = useChatDock();
  const [location] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    closeBubble();
  }, [location, closeBubble]);

  if (!user) return null;

  const isChatRoute =
    location === "/chatrooms" ||
    location.startsWith("/chatrooms/") ||
    location === "/chat" ||
    location.startsWith("/chat/");
  if (isChatRoute) return null;

  return createPortal(
    <>
      <DesktopChatFAB />
      <BubblePopup />
    </>,
    document.body
  );
}

export function ChatFullPage({ autoOpenSupportRoom }: { autoOpenSupportRoom?: boolean } = {}) {
  const { activeChatRoom, openChat, closeChat } = useChatDock();
  const isMobile = useIsMobile();
  const rawRooms = useChatRoomSummaries();

  useEffect(() => {
    if (autoOpenSupportRoom && !activeChatRoom && rawRooms && rawRooms.length > 0) {
      // Specifically target the Help Desk room (HelpAI bot), not general support rooms
      const helpDeskRoom = rawRooms.find(r =>
        // @ts-expect-error — TS migration: fix in refactoring sprint
        r.type === "support" && (r.slug === 'helpdesk' || r.name === 'Help Desk')
      ) || rawRooms.find(r => r.type === "support");
      if (helpDeskRoom) {
        openChat(helpDeskRoom.roomId, helpDeskRoom.name);
      }
    }
  }, [autoOpenSupportRoom, activeChatRoom, rawRooms, openChat]);

  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full bg-card" data-testid="chat-full-page-mobile">
        {activeChatRoom ? (
          <Suspense fallback={<PaneLoadingFallback />}>
            <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
          </Suspense>
        ) : (
          <ConversationList onSelectRoom={(id, name) => openChat(id, name)} isFullPage />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background" data-testid="chat-full-page">
      <div className="w-[350px] flex-shrink-0 border-r border-border flex flex-col bg-card">
        <ConversationList onSelectRoom={(id, name) => openChat(id, name)} isFullPage />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {activeChatRoom ? (
          <Suspense fallback={<PaneLoadingFallback />}>
            <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
          </Suspense>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-600/15 flex items-center justify-center">
              <MessageCircle className="h-10 w-10 text-primary/40" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground/70" data-testid="text-select-conversation">Select a conversation</p>
              <p className="text-sm text-muted-foreground mt-1">Choose from your existing conversations or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopChatDock() {
  return null;
}
