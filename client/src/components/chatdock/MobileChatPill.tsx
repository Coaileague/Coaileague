import { useState, useEffect, useRef } from "react";
import { MessageCircle, ChevronUp, Camera, FileText, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useChatUnreadTotal, useChatRoomSummaries } from "@/hooks/useChatManager";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

function getMediaLabel(msg: string | null | undefined): { icon: typeof Camera | null; label: string } | null {
  if (!msg) return null;
  if (/\[Shared an image/i.test(msg)) return { icon: Camera, label: "Photo" };
  if (/\[Shared a video/i.test(msg)) return { icon: Camera, label: "Video" };
  if (/\[Shared audio/i.test(msg)) return { icon: Mic, label: "Voice message" };
  if (/\[Shared a file/i.test(msg)) return { icon: FileText, label: "File" };
  return null;
}

export function MobileChatPill() {
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const { toggleBubble } = useChatDock();
  const totalUnread = useChatUnreadTotal();
  const rooms = useChatRoomSummaries();
  const [expanded, setExpanded] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  const isChatRoute =
    location === "/chatrooms" ||
    location.startsWith("/chatrooms/") ||
    location === "/chat" ||
    location.startsWith("/chat/");

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  useEffect(() => { setExpanded(false); }, [location]);

  if (!isMobile || isChatRoute) return null;

  const recentRooms = [...rooms]
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, 4);

  return (
    <div
      ref={pillRef}
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
      style={{ bottom: "calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      {expanded && recentRooms.length > 0 && (
        <div className="mb-2 w-72 rounded-md shadow-sm border border-border/30 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ background: "var(--card, hsl(var(--card)))" }}
          data-testid="mobile-chat-pill-preview"
        >
          <div className="chatdock-header-gradient px-3 py-2 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-white flex-shrink-0" />
            <span className="text-[13px] font-bold text-white flex-1">Messages</span>
            {totalUnread > 0 && (
              <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>
          <div className="divide-y divide-border/20">
            {recentRooms.map(room => {
              const mediaLabel = getMediaLabel(room.lastMessage);
              const isDM = ["dm_user", "dm_bot", "dm_support", "direct", "dm"].includes(room.type || "");
              const hasUnread = room.unreadCount > 0;
              return (
                <button
                  key={room.roomId}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover-elevate active-elevate-2 text-left"
                  onClick={() => { setExpanded(false); toggleBubble(); window.dispatchEvent(new CustomEvent("chatdock-select-room", { detail: { roomId: room.roomId, roomName: room.name } })); }}
                  data-testid={`mobile-pill-room-${room.roomId}`}
                >
                  <div className={isDM ? "chatdock-avatar-ring" : "chatdock-avatar-ring-group"}>
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-xs font-bold",
                        isDM ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
                          : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                      )}>
                        {isDM ? room.name.slice(0, 2).toUpperCase() : room.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-[13px] truncate", hasUnread ? "font-bold text-foreground" : "font-medium text-foreground")}>
                        {room.name}
                      </span>
                      {room.lastMessageAt && (
                        <span className={cn("text-[11px] whitespace-nowrap flex-shrink-0", hasUnread ? "text-primary font-medium" : "text-muted-foreground")}>
                          {smartTimestamp(room.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {mediaLabel ? (
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground truncate">
                          {mediaLabel.icon && <mediaLabel.icon className="h-3 w-3 flex-shrink-0 text-primary/60" />}
                          <span>{mediaLabel.label}</span>
                        </span>
                      ) : (
                        <span className={cn("text-[12px] truncate", hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground")}>
                          {room.lastMessage || "No messages yet"}
                        </span>
                      )}
                      {hasUnread && (
                        <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                          {room.unreadCount > 99 ? "99+" : room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            className="w-full py-2.5 text-[12px] font-semibold text-primary border-t border-border/20 hover-elevate active-elevate-2"
            onClick={() => { setExpanded(false); toggleBubble(); }}
            data-testid="mobile-pill-open-all"
          >
            Open All Messages
          </button>
        </div>
      )}

      <button
        onClick={() => {
          if ("vibrate" in navigator) navigator.vibrate(8);
          setExpanded(p => !p);
        }}
        className={cn(
          "relative flex items-center gap-2 rounded-full shadow-sm text-white transition-all duration-200",
          "px-4 h-11",
          expanded ? "pr-3" : ""
        )}
        style={{
          background: expanded
            ? "hsl(var(--muted))"
            : totalUnread > 0
              ? "linear-gradient(135deg, #0891b2 0%, #2563eb 100%)"
              : "linear-gradient(135deg, #0891b2 0%, #2563eb 100%)",
          boxShadow: expanded ? undefined : "0 4px 20px rgba(8,145,178,0.35)",
          color: expanded ? "hsl(var(--foreground))" : "white",
        }}
        data-testid="mobile-chat-pill-toggle"
        aria-label={expanded ? "Close messages preview" : "Open messages"}
        aria-expanded={expanded}
      >
        <MessageCircle
          className="h-5 w-5 flex-shrink-0"
          style={{ color: expanded ? "hsl(var(--foreground))" : "white" }}
        />
        <span className="text-[13px] font-bold leading-none">
          {totalUnread > 0 ? `${totalUnread > 99 ? "99+" : totalUnread} Messages` : "Messages"}
        </span>
        <ChevronUp
          className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded ? "rotate-0" : "rotate-180")}
          style={{ color: expanded ? "hsl(var(--foreground))" : "white" }}
        />
        {totalUnread > 0 && !expanded && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none"
            style={{ boxShadow: "0 0 6px rgba(239,68,68,0.5)" }}
            data-testid="mobile-pill-unread-badge"
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
