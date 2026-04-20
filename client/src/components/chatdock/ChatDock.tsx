import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useChatRoomSummaries, useChatUnreadTotal } from "@/hooks/useChatManager";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import {
  X, ArrowLeft, Send, Search, Users, MessageCircle, MessageSquare,
  ChevronRight, Loader2, WifiOff, Plus, MoreVertical, Paperclip,
  Image, Video, Mic, UserPlus, LogOut, EyeOff, VolumeX, Volume2,
  Trash2, Ban, Shield, Crown, Info, Settings, Check, CheckCheck, FileText,
  Reply, Pencil, Forward, Pin, SmilePlus, ExternalLink, XCircle,
  ArrowDown, ThumbsUp, Heart, Laugh, Frown, Star, Flame, Headphones, Calendar,
  Phone, Mail, AlertCircle, MapPin, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MobileResponsiveSheet } from "@/components/canvas-hub";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { chatManager } from "@/services/chatConnectionManager";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { TrinityThoughtBar } from "./TrinityThoughtBar";

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

    const handleOrientation = () => setTimeout(handleWindowResize, 200);

    if (vv) {
      vv.addEventListener("resize", handleVVResize);
    }
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      if (vv) vv.removeEventListener("resize", handleVVResize);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  return stableHeight;
}

function useMobileKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    if (!vv) {
      const handleFocus = (e: FocusEvent) => {
        const t = e.target as HTMLElement;
        if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") {
          setOffset(Math.round(window.innerHeight * 0.4));
        }
      };
      const handleBlur = () => setOffset(0);
      document.addEventListener("focusin", handleFocus);
      document.addEventListener("focusout", handleBlur);
      return () => {
        document.removeEventListener("focusin", handleFocus);
        document.removeEventListener("focusout", handleBlur);
      };
    }

    const update = () => {
      const keyboardHeight = window.innerHeight - vv.height;
      const viewportOffset = vv.offsetTop || 0;
      const totalOffset = keyboardHeight + viewportOffset;
      setOffset(totalOffset > 80 ? totalOffset : 0);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
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

  const hideConvo = useMutation({
    mutationFn: () => apiRequest("POST", `/api/chat/manage/conversations/${roomId}/hide`),
    onSuccess: () => {
      chatManager.removeRoom(roomId);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      toast({ title: "Conversation archived", description: "You can rejoin anytime" });
      onClose();
      onLeaveSuccess?.();
    },
  });

  const leaveConvo = useMutation({
    mutationFn: () => apiRequest("POST", `/api/chat/manage/conversations/${roomId}/leave`),
    onSuccess: () => {
      chatManager.removeRoom(roomId);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      toast({ title: "Left conversation", description: `You have left "${roomName}"` });
      onClose();
      onLeaveSuccess?.();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to leave conversation", variant: "destructive" });
    },
  });

  const muteConvo = useMutation({
    mutationFn: (muted: boolean) => apiRequest("POST", `/api/chat/manage/conversations/${roomId}/mute`, { muted }),
    onSuccess: () => {
      chatManager.loadRoomList();
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      toast({ title: "Notifications muted" });
      onClose();
    },
  });

  const isDM = roomType === 'dm_user' || roomType === 'dm_bot' || roomType === 'dm_support' || roomType === 'direct' || roomType === 'dm';

  return (
    <MobileResponsiveSheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={roomName || "Conversation"}
      titleIcon={
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center shadow-sm shrink-0",
          isDM
            ? "bg-gradient-to-br from-blue-500 to-cyan-600"
            : "bg-gradient-to-br from-violet-500 to-purple-600"
        )}>
          {isDM
            ? <MessageSquare className="w-3.5 h-3.5 text-white" />
            : <Users className="w-3.5 h-3.5 text-white" />
          }
        </div>
      }
      subtitle="Conversation options"
      side="bottom"
      headerGradient={true}
      heightPreset="compact"
      showDragIndicator={true}
    >
      <div className="flex flex-col gap-2 px-1 pb-2" data-testid={`menu-convo-${roomId}`}>
        {!confirmLeave ? (
          <>
            <Button
              variant="outline"
              className="h-auto flex flex-row items-center justify-start p-3.5 gap-3 w-full"
              onClick={() => muteConvo.mutate(true)}
              data-testid={`button-mute-${roomId}`}
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-sm">Mute notifications</div>
                <div className="text-xs text-muted-foreground">Stop alerts from this conversation</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex flex-row items-center justify-start p-3.5 gap-3 w-full"
              onClick={() => hideConvo.mutate()}
              data-testid={`button-hide-${roomId}`}
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-sm">Archive</div>
                <div className="text-xs text-muted-foreground">Hide from list — you can rejoin anytime</div>
              </div>
            </Button>
            <div className="border-t border-border my-1" />
            <Button
              variant="outline"
              className="h-auto flex flex-row items-center justify-start p-3.5 gap-3 w-full border-destructive/30 bg-destructive/5 dark:bg-destructive/10"
              onClick={() => setConfirmLeave(true)}
              data-testid={`button-leave-${roomId}`}
            >
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <LogOut className="h-5 w-5 text-destructive" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-sm text-destructive">Leave conversation</div>
                <div className="text-xs text-destructive/70">Permanently remove yourself</div>
              </div>
            </Button>
          </>
        ) : (
          <div className="space-y-3 py-2">
            <div className="text-center space-y-1">
              <p className="font-semibold text-sm">Leave this conversation?</p>
              <p className="text-xs text-muted-foreground">You will be removed from <strong>"{roomName}"</strong> and won't receive new messages.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmLeave(false)} data-testid="button-cancel-leave">
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => leaveConvo.mutate()} disabled={leaveConvo.isPending} data-testid="button-confirm-leave">
                {leaveConvo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Leave"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </MobileResponsiveSheet>
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
                "w-full flex items-center gap-2.5 px-3 py-2.5 hover-elevate active-elevate-2 text-left rounded-lg transition-colors",
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

  const blockUser = useMutation({
    mutationFn: (blockedUserId: string) =>
      apiRequest("POST", "/api/chat/manage/block", { blockedUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
      chatManager.loadRoomList();
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      toast({ title: "User blocked" });
    },
  });

  const unblockUser = useMutation({
    mutationFn: (blockedUserId: string) =>
      apiRequest("POST", "/api/chat/manage/unblock", { blockedUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/manage/rooms", roomId, "participants"] });
      chatManager.loadRoomList();
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      toast({ title: "User unblocked" });
    },
  });

  const dbParticipants = participantsQuery.data?.participants || [];
  // Use live WebSocket users as the authoritative source when available;
  // fall back to DB participants for persisted group rooms.
  const useLive = liveUsers.length > 0;
  const displayCount = useLive ? liveUsers.length : dbParticipants.length;
  const currentUserParticipant = dbParticipants.find((p: any) => p.participantId === user?.id);
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
                  <AvatarFallback className={`text-xs font-semibold ${isBot ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-white' : 'bg-primary/10 text-primary'}`}>
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
                <p className="text-xs text-muted-foreground truncate">{isBot ? 'AI Assistant' : (u.role || 'Member')}</p>
              </div>
            </div>
          );
        })}

        {/* DB participants (group rooms with persisted membership) */}
        {!useLive && dbParticipants.map((p: any) => (
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

const QUICK_REACTIONS = [
  { key: "thumbsup", icon: ThumbsUp, label: "Like" },
  { key: "heart", icon: Heart, label: "Love" },
  { key: "laugh", icon: Laugh, label: "Haha" },
  { key: "star", icon: Star, label: "Star" },
  { key: "flame", icon: Flame, label: "Fire" },
  { key: "frown", icon: Frown, label: "Sad" },
];

function EmojiReactionBar({
  messageId,
  conversationId,
  onClose,
}: {
  messageId: string;
  conversationId: string;
  onClose: () => void;
}) {
  const toggleReaction = useMutation({
    mutationFn: (emoji: string) => apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'reactions'] });
      onClose();
    },
  });

  return (
    <div className="flex items-center gap-0.5 bg-card border border-border rounded-full shadow-sm px-1.5 py-0.5 z-50" data-testid={`reaction-bar-${messageId}`}>
      {QUICK_REACTIONS.map((r) => (
        <button
          key={r.key}
          className="p-0.5 text-foreground/70 hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); toggleReaction.mutate(r.key); }}
          data-testid={`reaction-${r.key}-${messageId}`}
          aria-label={r.label}
        >
          <r.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function ReactionBadges({
  messageId,
  reactions,
  conversationId,
}: {
  messageId: string;
  reactions: { emoji: string; count: number; users: { id: string; name: string }[]; hasReacted: boolean }[];
  conversationId: string;
}) {
  const toggleReaction = useMutation({
    mutationFn: (emoji: string) => apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'reactions'] });
    },
  });

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
            onClick={(e) => { e.stopPropagation(); toggleReaction.mutate(r.emoji); }}
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded-full border transition-colors",
              r.hasReacted
                ? "bg-primary/15 border-primary/30 text-primary"
                : "bg-muted border-border text-foreground/70"
            )}
            title={r.users.map(u => u.name).join(", ")}
            data-testid={`reaction-badge-${r.emoji}-${messageId}`}
          >
            {IconComp ? <IconComp className="h-3 w-3" /> : <span>{r.emoji}</span>}
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

  const deleteForMe = useMutation({
    mutationFn: () => apiRequest("POST", `/api/chat/manage/messages/${messageId}/delete-for-me`),
    onSuccess: () => { toast({ title: "Message hidden for you" }); onClose(); },
  });

  const deleteForEveryone = useMutation({
    mutationFn: () => apiRequest("POST", `/api/chat/manage/messages/${messageId}/delete-for-everyone`),
    onSuccess: () => { toast({ title: "Message deleted for everyone" }); onClose(); },
  });

  const pinMessage = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/chat/manage/messages/${messageId}/pin`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.pinned ? "Message pinned" : "Message unpinned" });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'pinned'] });
      onClose();
    },
  });

  const toggleReaction = useMutation({
    mutationFn: (emoji: string) => apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'reactions'] });
      onClose();
    },
  });

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
              onClick={(e) => { e.stopPropagation(); toggleReaction.mutate(r.key); }}
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

  const forwardMutation = useMutation({
    mutationFn: (targetConversationId: string) =>
      apiRequest("POST", `/api/chat/manage/messages/${messageId}/forward`, { targetConversationId }),
    onSuccess: () => {
      toast({ title: "Message forwarded" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to forward", variant: "destructive" });
    },
  });

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

interface LightboxData {
  src: string;
  senderName?: string;
  timestamp?: string;
  filename?: string;
  gpsAddress?: string;
}

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

  const label = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });

  return (
    <div className="flex items-center justify-center py-2.5" data-testid="date-divider">
      <span className="text-[10px] text-muted-foreground font-medium px-3 py-0.5 rounded-full bg-muted/60 border border-border/30">{label}</span>
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
  const toggleReaction = useMutation({
    mutationFn: (emoji: string) => apiRequest("POST", `/api/chat/manage/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/manage/conversations', conversationId, 'reactions'] });
    },
  });

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
          onClick={(e) => { e.stopPropagation(); toggleReaction.mutate(r.key); }}
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

function getChannelBadgeColor(channelType: string) {
  switch (channelType) {
    case "sms": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "whatsapp": return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "email": return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    case "messenger": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function ChannelBadge({ channelType }: { channelType: string }) {
  const Icon = getChannelIcon(channelType);
  if (!Icon) return null;
  const label = channelType === "sms" ? "SMS" : channelType === "whatsapp" ? "WhatsApp" : channelType === "email" ? "Email" : channelType.charAt(0).toUpperCase() + channelType.slice(1);
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[9px] font-medium", getChannelBadgeColor(channelType))}
      data-testid={`badge-channel-${channelType}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
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
          onClick={() => { if (!longPressTriggered.current) onSelectRoom(room.roomId, room.name); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectRoom(room.roomId, room.name); }}
          onTouchStart={(e) => handleLongPressStart(room.roomId, e)}
          onTouchMove={handleLongPressMove}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressCancel}
          onContextMenu={(e) => { e.preventDefault(); setActionMenuRoom(room.roomId); }}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 hover-elevate active-elevate-2 transition-colors text-left cursor-pointer",
            hasUnread && "bg-primary/[0.04] dark:bg-primary/[0.08]",
            isSupport && "border-b border-border/30"
          )}
          aria-label={`${room.name}${hasUnread ? `, ${room.unreadCount} unread messages` : ""}${room.lastMessage ? `, last message: ${room.lastMessage}` : ""}`}
          data-testid={`chat-bubble-room-${room.roomId}`}
        >
          <div className="relative flex-shrink-0">
            <div className={isDM ? "chatdock-avatar-ring" : "chatdock-avatar-ring-group"}>
              <Avatar className="h-9 w-9">
                <AvatarFallback className={cn(
                  "text-xs font-bold",
                  isSupport ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
                    : isShift ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
                    : isDM ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
                    : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                )}>
                  {isSupport ? <Headphones className="h-4 w-4" />
                    : isShift ? <Calendar className="h-4 w-4" />
                    : isDM ? room.name.slice(0, 2).toUpperCase()
                    : <Users className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </div>
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border border-card rounded-full z-10" data-testid={`status-online-${room.roomId}`}>
                <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-40" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className={cn(
                  "text-[13px] truncate min-w-0",
                  hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
                )}>{room.name}</span>
                {(room as any).bridgeChannelType && (
                  <ChannelBadge channelType={(room as any).bridgeChannelType} />
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {room.lastMessageAt && (
                  <span className={cn(
                    "text-[11px] whitespace-nowrap",
                    hasUnread ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {smartTimestamp(room.lastMessageAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                "text-[12px] truncate flex-1 min-w-0 leading-snug flex items-center gap-1",
                hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"
              )}>
                {(() => {
                  const preview = getLastMsgPreview(room.lastMessage);
                  const prefix = room.lastMessageSender ? `${room.lastMessageSender}: ` : "";
                  if (preview.isMedia) {
                    return <>
                      {prefix && <span className="truncate">{prefix}</span>}
                      {preview.mediaType === "image" && <Image className="h-3 w-3 flex-shrink-0 text-primary/60" />}
                      {preview.mediaType === "video" && <Video className="h-3 w-3 flex-shrink-0 text-primary/60" />}
                      {preview.mediaType === "audio" && <Mic className="h-3 w-3 flex-shrink-0 text-primary/60" />}
                      {preview.mediaType === "file" && <FileText className="h-3 w-3 flex-shrink-0 text-primary/60" />}
                      <span className="truncate">{preview.text}</span>
                    </>;
                  }
                  return prefix
                    ? <><span className="truncate">{prefix}{preview.text}</span></>
                    : <span className="truncate">{preview.text || (isSupport ? "Tap to get help from HelpAI" : "No messages yet")}</span>;
                })()}
              </span>
              {hasUnread && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-0.5 flex-shrink-0" data-testid={`badge-unread-${room.roomId}`}>
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
      <div className="chatdock-header-gradient flex items-center justify-between gap-1 px-2 py-1 flex-shrink-0" data-drag-region>
        <div className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4 text-white/90 flex-shrink-0" />
          <h3 className="text-[13px] font-bold tracking-tight whitespace-nowrap text-white leading-none" data-testid="text-messages-title">Messages</h3>
        </div>
        <div className="flex items-center gap-0">
          <Button size="icon" variant="ghost" className="text-white/80" onClick={() => setShowNewConvo(true)} data-testid="button-new-conversation" aria-label="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
          {!isFullPage && (
            <>
              <Button size="icon" variant="ghost" className="text-white/80" onClick={() => { closeBubble(); setLocation("/chatrooms"); }} data-testid="button-chat-bubble-fullscreen" aria-label="Open full chat page">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="text-white/80" onClick={closeBubble} data-testid="button-chat-bubble-close" aria-label="Close messages">
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-2 py-1 bg-card border-b border-border/30 space-y-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-7 rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            data-testid="input-chat-bubble-search"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap" data-testid="filter-chat-type">
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
                "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover-elevate"
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

function InlineChatView({ roomId, roomName }: { roomId: string; roomName: string }) {
  const { closeChat, openChat } = useChatDock();
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; message: string } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; message: string } | null>(null);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);
  const [lightboxData, setLightboxData] = useState<LightboxData | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [showChatSearch, setShowChatSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const keyboardOffset = useMobileKeyboardOffset();
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [lastReadIndex, setLastReadIndex] = useState(-1);
  const touchStartRef = useRef<{ x: number; y: number; msgId: string | null }>({ x: 0, y: 0, msgId: null });
  const lastTapRef = useRef<{ msgId: string; time: number }>({ msgId: "", time: 0 });
  const [swipeReplyId, setSwipeReplyId] = useState<string | null>(null);
  const seenMessageIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const newMessageIds = useRef<Set<string>>(new Set());

  const userName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "User";
  const autoRetryCount = useRef(0);

  const {
    messages: wsMessages,
    sendMessage,
    sendRawMessage,
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
    onError: (error: any) => {
      toast({ title: "Edit failed", description: error.message, variant: "destructive" });
    },
  });

  const reactionsMap = (reactionsData as any)?.reactions || {};
  const pinnedMessages = (pinnedData as any)?.messages || [];
  const searchHits = (searchResults as any)?.messages || [];
  const searchHitIds = new Set(searchHits.map((m: any) => m.id));

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
    longPressTimerRef.current = setTimeout(() => {
      setActiveMessageMenu(msgId);
      longPressTimerRef.current = null;
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (!touchStartRef.current.msgId) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (Math.abs(dx) > 10 || dy > 10) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    if (dx > 60 && dy < 30) {
      setSwipeReplyId(touchStartRef.current.msgId);
      touchStartRef.current = { x: 0, y: 0, msgId: null };
    }
  }, []);

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
      <div className="chatdock-chat-header flex items-center gap-1.5 px-1.5 py-1 flex-shrink-0" data-drag-region>
        <Button
          size="icon"
          variant="ghost"
          className="text-white/80"
          onClick={closeChat}
          data-testid="button-chat-back"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarFallback className="text-[9px] bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold">
            {roomName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0" onClick={() => setShowInfo(true)} role="button" tabIndex={0}>
          <span className="text-[13px] font-semibold truncate block leading-tight text-white">{roomName}</span>
          {!isConnected ? (
            <span className="text-[9px] text-white/60 flex items-center gap-1 leading-none">
              <WifiOff className="h-2.5 w-2.5" /> Connecting...
            </span>
          ) : onlineUsers.length > 0 ? (
            <span className="text-[9px] text-green-300 leading-none flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
              Active now
            </span>
          ) : null}
        </div>
        <Button size="icon" variant="ghost" className="text-white/80" onClick={() => setShowChatSearch(!showChatSearch)} data-testid="button-chat-search" aria-label="Search in chat">
          <Search className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="text-white/80" onClick={() => setShowInfo(true)} data-testid="button-room-info" aria-label="Room info">
          <MoreVertical className="h-3.5 w-3.5" />
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

      <TrinityThoughtBar priority={wsError ? "high" : "normal"} sessionId={roomId} />

      <div className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-px relative chatdock-chat-bg" data-scroll="styled" ref={scrollContainerRef} role="log" aria-live="polite" aria-label="Chat messages">
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
          wsMessages.map((msg, idx) => {
            const msgContent = msg.message || "";
            const isOwn = msg.senderId === user?.id;
            const isSystem = msg.isSystemMessage || msg.senderType === "system";
            const isBot = msg.senderType === "bot" || msg.senderId === "ai-bot" || msg.senderId === "helpai";
            const isDeletedForAll = (msg as any).isDeletedForEveryone;
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
                    "flex flex-col relative group",
                    isGrouped ? "py-px" : "py-0.5",
                    isOwn ? "items-end" : "items-start",
                    isHighlighted && "bg-primary/5 rounded-lg -mx-1 px-1",
                    isNewMessage && "animate-in fade-in slide-in-from-bottom-2 duration-200"
                  )}
                  data-testid={`chat-msg-${msg.id}`}
                  onTouchStart={isMobile ? (e) => handleTouchStart(e, msg.id) : undefined}
                  onTouchMove={isMobile ? handleTouchMove : undefined}
                  onTouchEnd={isMobile ? () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } } : undefined}
                  onClick={isMobile ? () => handleDoubleTap(msg.id) : undefined}
                >
                  {!isOwn && !isGrouped && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 px-2 inline-flex items-center gap-1">
                      {isBot ? "Trinity" : (msg.senderName || "Unknown")}
                      {(msg as any).bridgeChannelType && (
                        <ChannelIndicator channelType={(msg as any).bridgeChannelType} />
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
                          ? cn("bg-primary text-primary-foreground", isGrouped ? "chat-bubble-grouped-own" : "chat-bubble-own")
                          : isBot
                            ? cn("bg-accent/80 text-accent-foreground", isGrouped ? "chat-bubble-grouped-other" : "chat-bubble-other")
                            : cn("bg-muted text-foreground", isGrouped ? "chat-bubble-grouped-other" : "chat-bubble-other")
                      )}
                    >
                      {parentMsg && <QuotedMessage parentMessage={parentMsg} compact />}
                      {isDeletedForAll ? (
                        <span className="flex items-center gap-1"><Ban className="h-3 w-3" /> This message was deleted</span>
                      ) : isMediaMessage ? (
                        <div>
                          {isMediaMessage[1].includes("image") && (() => {
                            const atIdx = isMediaMessage[1].indexOf(" @ ");
                            const imgGpsAddress = atIdx !== -1 ? isMediaMessage[1].slice(atIdx + 3).trim() : null;
                            const ts = msg.createdAt ? (msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt)) : undefined;
                            const timeLabel = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                            return (
                              <div>
                                <div className="chat-img-card group/img">
                                  <img
                                    src={isMediaMessage[2]}
                                    alt="Shared image"
                                    loading="lazy"
                                    onClick={() => setLightboxData({ src: isMediaMessage[2], senderName: msg.senderName || undefined, timestamp: ts, filename: msg.attachmentName || undefined, gpsAddress: imgGpsAddress || undefined })}
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
                            <audio src={isMediaMessage[2]} controls className="max-w-full" />
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
                        style={{ visibility: activeMessageMenu === msg.id ? "visible" : undefined }}
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
                        onEdit={isOwn ? () => { setEditingMessage({ id: msg.id, message: msgContent }); setInput(msgContent); } : undefined}
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
                      {(msg as any).bridgeChannelType && (
                        <ChannelIndicator channelType={(msg as any).bridgeChannelType} />
                      )}
                      {isOwn && (msg as any).bridgeDeliveryStatus ? (
                        <DeliveryStatusIndicator status={(msg as any).bridgeDeliveryStatus} />
                      ) : isOwn && (
                        readReceipt ? (
                          <CheckCheck className="h-3 w-3 text-primary" data-testid={`read-receipt-${msg.id}`} />
                        ) : (
                          <Check className="h-3 w-3 text-muted-foreground" data-testid={`sent-receipt-${msg.id}`} />
                        )
                      )}
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

      <div
        className="border-t border-border/30 chatdock-input-bar px-2 py-1.5"
      >
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="flex-shrink-0 text-primary/70"
              onClick={(e) => { e.stopPropagation(); setShowAttach(!showAttach); }}
              disabled={!isConnected}
              data-testid="button-attach-file"
              aria-label="Attach file"
            >
              <Paperclip className="h-4.5 w-4.5" />
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
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === "Escape") { setReplyingTo(null); setEditingMessage(null); setInput(""); } }}
            placeholder={editingMessage ? "Edit your message..." : replyingTo ? `Reply to ${replyingTo.senderName}...` : isConnected ? "Type a message..." : "Connecting..."}
            disabled={!isConnected}
            className="text-sm flex-1 h-9 rounded-full bg-muted/50 border border-border/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/30"
            data-testid={`input-chat-msg-${roomId}`}
          />
          <div className="flex-shrink-0">
            <Button
              size="icon"
              variant={input.trim() && isConnected ? "default" : "ghost"}
              className={cn(
                "rounded-full transition-all duration-200",
                input.trim() && isConnected
                  ? "chatdock-send-active shadow-sm shadow-cyan-500/20"
                  : "text-muted-foreground"
              )}
              onClick={handleSend}
              disabled={!input.trim() || !isConnected}
              data-testid={`button-send-msg-${roomId}`}
              aria-label={editingMessage ? "Save edit" : "Send message"}
            >
              {editingMessage ? <Check className="h-4.5 w-4.5" /> : <Send className="h-4.5 w-4.5" />}
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
      const popupW = 380;
      const popupH = activeChatRoom ? 580 : Math.min(600, window.innerHeight * 0.75);
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
    ? <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
    : <ConversationList onSelectRoom={(id, name) => openChat(id, name)} />;

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[9998] bg-card flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
        "fixed w-[380px] z-[1031] bg-card border border-border rounded-md shadow-sm flex flex-col overflow-hidden",
        !hasAnimated && "animate-in slide-in-from-bottom-2 fade-in duration-200",
        isDragging && "select-none"
      )}
      style={{
        height: activeChatRoom ? "580px" : "min(600px, 75vh)",
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
        onClick={toggleBubble}
        aria-label={bubbleOpen ? "Close chat" : "Open chat"}
        className="relative w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {bubbleOpen
          ? <X className="h-5 w-5" />
          : <MessageCircle className="h-5 w-5" />
        }
        {!bubbleOpen && unreadTotal > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 pointer-events-none"
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
          <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
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
          <InlineChatView roomId={activeChatRoom.roomId} roomName={activeChatRoom.roomName} />
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
