import { apiRequest } from "@/lib/queryClient";

export interface ChatRoomSummary {
  roomId: string;
  name: string;
  lastMessage?: string;
  lastMessageSender?: string;
  lastMessageAt?: string;
  unreadCount: number;
  type?: string;
  bridgeChannelType?: string;
}

export interface IncomingChatMessage {
  roomId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  messageId?: string;
}

type MessageHandler = (message: IncomingChatMessage) => void;
type RoomUpdateHandler = (rooms: Map<string, ChatRoomSummary>) => void;
type UnreadHandler = (roomId: string, count: number) => void;

const RECONCILE_INTERVAL = 120_000;
const RECONCILE_AFTER_RECONNECT_DELAY = 1_500;

class ChatConnectionManager {
  private subscribedRooms: Set<string> = new Set();
  private activeRoomHandlers: Map<string, MessageHandler> = new Map();
  private roomSummaries: Map<string, ChatRoomSummary> = new Map();
  private roomUpdateHandlers: Set<RoomUpdateHandler> = new Set();
  private unreadHandlers: Set<UnreadHandler> = new Set();
  private initialized = false;
  private userId: string | null = null;
  private activeRoomId: string | null = null;
  private markAsReadTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private lastReconcileAt = 0;
  private recentMessageIds: Set<string> = new Set();
  private recentIdCleanupTimer: ReturnType<typeof setInterval> | null = null;

  get totalUnread(): number {
    let total = 0;
    this.roomSummaries.forEach(room => {
      if (room.roomId !== this.activeRoomId) {
        total += room.unreadCount;
      }
    });
    return total;
  }

  async initialize(userId: string) {
    if (this.initialized && this.userId === userId) return;

    if (this.initialized && this.userId !== userId) {
      this.disconnect();
    }

    this.userId = userId;
    this.initialized = true;

    await this.loadRoomList();
    this.startReconciliation();
    this.startVisibilitySync();
    this.startRecentIdCleanup();
  }

  private startReconciliation() {
    this.stopReconciliation();
    this.reconcileTimer = setInterval(() => {
      this.reconcile();
    }, RECONCILE_INTERVAL);
  }

  private stopReconciliation() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private startVisibilitySync() {
    this.stopVisibilitySync();
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - this.lastReconcileAt;
        if (elapsed > 30_000) {
          this.reconcile();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private stopVisibilitySync() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private startRecentIdCleanup() {
    this.stopRecentIdCleanup();
    this.recentIdCleanupTimer = setInterval(() => {
      if (this.recentMessageIds.size > 200) {
        const arr = Array.from(this.recentMessageIds);
        this.recentMessageIds = new Set(arr.slice(arr.length - 100));
      }
    }, 60_000);
  }

  private stopRecentIdCleanup() {
    if (this.recentIdCleanupTimer) {
      clearInterval(this.recentIdCleanupTimer);
      this.recentIdCleanupTimer = null;
    }
  }

  private async reconcile() {
    this.lastReconcileAt = Date.now();
    try {
      const res = await apiRequest("GET", "/api/chat/rooms");
      const data = await res.json();
      const rooms = data.rooms || data || [];

      const serverMap = new Map<string, ChatRoomSummary>();
      rooms.forEach((room) => {
        const roomId = room.roomId || room.id;
        if (!roomId) return;
        serverMap.set(roomId, {
          roomId,
          name: room.name || room.subject || "Chat",
          lastMessage: room.lastMessage,
          lastMessageSender: room.lastMessageSender,
          lastMessageAt: room.lastMessageAt,
          unreadCount: room.unreadCount || 0,
          type: room.type || room.conversationType,
        });
      });

      let changed = false;

      serverMap.forEach((serverRoom, roomId) => {
        const local = this.roomSummaries.get(roomId);
        if (!local) {
          this.roomSummaries.set(roomId, serverRoom);
          this.subscribedRooms.add(roomId);
          changed = true;
          return;
        }

        if (serverRoom.unreadCount !== local.unreadCount) {
          if (roomId === this.activeRoomId) {
            local.unreadCount = 0;
          } else {
            local.unreadCount = serverRoom.unreadCount;
          }
          changed = true;
        }

        if (serverRoom.name && serverRoom.name !== local.name) {
          local.name = serverRoom.name;
          changed = true;
        }

        if (serverRoom.type && serverRoom.type !== local.type) {
          local.type = serverRoom.type;
          changed = true;
        }

        const serverTime = serverRoom.lastMessageAt ? new Date(serverRoom.lastMessageAt).getTime() : 0;
        const localTime = local.lastMessageAt ? new Date(local.lastMessageAt).getTime() : 0;
        if (serverTime > localTime) {
          local.lastMessage = serverRoom.lastMessage;
          local.lastMessageSender = serverRoom.lastMessageSender;
          local.lastMessageAt = serverRoom.lastMessageAt;
          changed = true;
        }
      });

      this.roomSummaries.forEach((_, roomId) => {
        if (!serverMap.has(roomId)) {
          this.roomSummaries.delete(roomId);
          this.subscribedRooms.delete(roomId);
          changed = true;
        }
      });

      if (changed) {
        this.notifyRoomUpdate();
        this.roomSummaries.forEach((room) => {
          if (room.unreadCount > 0) {
            this.notifyUnread(room.roomId, room.unreadCount);
          }
        });
      }
    } catch (e) {
      console.warn("[ChatManager] Reconciliation failed:", e);
    }
  }

  handleWebSocketReconnect() {
    setTimeout(() => {
      this.reconcile();
    }, RECONCILE_AFTER_RECONNECT_DELAY);
  }

  subscribeToRoom(roomId: string) {
    if (this.subscribedRooms.has(roomId)) return;
    this.subscribedRooms.add(roomId);
  }

  handleExternalMessage(data: any) {
    this.handleIncomingMessage(data);
  }

  updateRoomLastMessage(roomId: string, message: string, senderName: string) {
    const summary = this.roomSummaries.get(roomId);
    if (summary) {
      summary.lastMessage = message;
      summary.lastMessageSender = senderName;
      summary.lastMessageAt = new Date().toISOString();
      this.notifyRoomUpdate();
    }
  }

  private handleIncomingMessage(data: any) {
    if (data.type === "chat_message" || data.type === "new_message") {
      const conversationId = data.conversationId || data.roomId;
      if (!conversationId) return;

      const msgId = data.messageId || data.id;
      if (msgId) {
        if (this.recentMessageIds.has(msgId)) return;
        this.recentMessageIds.add(msgId);
      }

      const msg: IncomingChatMessage = {
        roomId: conversationId,
        conversationId,
        senderId: data.senderId || data.userId || "",
        senderName: data.senderName || data.displayName || "Unknown",
        content: data.content || data.message || "",
        timestamp: data.timestamp || new Date().toISOString(),
        messageId: msgId,
      };

      const handler = this.activeRoomHandlers.get(conversationId);
      if (handler) {
        handler(msg);
      }

      const summary = this.roomSummaries.get(conversationId);
      if (summary) {
        summary.lastMessage = msg.content;
        summary.lastMessageSender = msg.senderName;
        summary.lastMessageAt = msg.timestamp;
        if (conversationId !== this.activeRoomId && msg.senderId !== this.userId) {
          summary.unreadCount = (summary.unreadCount || 0) + 1;
          this.notifyUnread(conversationId, summary.unreadCount);
        }
      } else if (conversationId !== this.activeRoomId && data.senderId !== this.userId) {
        this.roomSummaries.set(conversationId, {
          roomId: conversationId,
          name: data.roomName || "Chat",
          lastMessage: msg.content,
          lastMessageSender: msg.senderName,
          lastMessageAt: msg.timestamp,
          unreadCount: 1,
        });
        this.notifyUnread(conversationId, 1);
      }

      this.notifyRoomUpdate();
    }

    if (data.type === "new_chatroom_message") {
      const roomId = data.chatroomId || data.conversationId || data.roomId;
      if (!roomId || roomId === this.activeRoomId) return;

      const summary = this.roomSummaries.get(roomId);
      if (summary) {
        const preview = data.messagePreview || data.content || data.message || '';
        if (preview) {
          summary.lastMessage = typeof preview === 'string' ? preview : '';
          summary.lastMessageSender = data.senderName || 'Unknown';
          summary.lastMessageAt = data.timestamp || new Date().toISOString();
        }
        if (data.senderId !== this.userId) {
          summary.unreadCount = (summary.unreadCount || 0) + 1;
          this.notifyUnread(roomId, summary.unreadCount);
        }
        this.notifyRoomUpdate();
      } else {
        this.roomSummaries.set(roomId, {
          roomId,
          name: data.chatroomName || data.roomName || 'Chat',
          lastMessage: data.messagePreview || '',
          lastMessageSender: data.senderName || 'Unknown',
          lastMessageAt: data.timestamp || new Date().toISOString(),
          unreadCount: 1,
          type: data.type,
        });
        this.notifyUnread(roomId, 1);
        this.notifyRoomUpdate();
      }
    }

    if (data.type === "notification" || data.type === "chat_notification") {
      const roomId = data.conversationId || data.roomId;
      if (roomId && roomId !== this.activeRoomId) {
        const summary = this.roomSummaries.get(roomId);
        if (summary) {
          summary.unreadCount = (summary.unreadCount || 0) + 1;
          this.notifyUnread(roomId, summary.unreadCount);
          this.notifyRoomUpdate();
        }
      }
    }
  }

  setActiveRoom(roomId: string, handler: MessageHandler) {
    this.activeRoomId = roomId;
    this.activeRoomHandlers.set(roomId, handler);
    this.subscribeToRoom(roomId);
    this.markAsRead(roomId);
  }

  clearActiveRoom(roomId: string) {
    this.activeRoomId = null;
    this.activeRoomHandlers.delete(roomId);
  }

  markAsRead(roomId: string) {
    const summary = this.roomSummaries.get(roomId);
    if (summary && summary.unreadCount > 0) {
      summary.unreadCount = 0;
      this.notifyUnread(roomId, 0);
      this.notifyRoomUpdate();
    }

    // Flush any pending mark-as-read timers for rooms the user has left,
    // so switching rooms persists read state immediately for the previous room.
    for (const [pendingRoomId, timer] of this.markAsReadTimers) {
      if (pendingRoomId !== roomId) {
        clearTimeout(timer);
        this.markAsReadTimers.delete(pendingRoomId);
        apiRequest("POST", "/api/chat/mark-as-read", { conversationId: pendingRoomId }).catch(() => {});
      }
    }

    // Debounce the API call for the current room (trailing edge, 500ms).
    const existingTimer = this.markAsReadTimers.get(roomId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      apiRequest("POST", "/api/chat/mark-as-read", { conversationId: roomId }).catch(() => {});
      this.markAsReadTimers.delete(roomId);
    }, 500);
    this.markAsReadTimers.set(roomId, timer);
  }

  getUnreadCount(roomId: string): number {
    return this.roomSummaries.get(roomId)?.unreadCount || 0;
  }

  removeRoom(roomId: string) {
    if (this.roomSummaries.has(roomId)) {
      this.roomSummaries.delete(roomId);
      this.subscribedRooms.delete(roomId);
      if (this.activeRoomId === roomId) {
        this.activeRoomId = null;
        this.activeRoomHandlers.delete(roomId);
      }
      this.notifyRoomUpdate();
    }
  }

  getRoomSummaries(): ChatRoomSummary[] {
    return Array.from(this.roomSummaries.values()).sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  onRoomUpdate(handler: RoomUpdateHandler): () => void {
    this.roomUpdateHandlers.add(handler);
    return () => this.roomUpdateHandlers.delete(handler);
  }

  onUnreadChange(handler: UnreadHandler): () => void {
    this.unreadHandlers.add(handler);
    return () => this.unreadHandlers.delete(handler);
  }

  private notifyRoomUpdate() {
    this.roomUpdateHandlers.forEach((handler) => {
      try {
        handler(this.roomSummaries);
      } catch (e) {}
    });
  }

  private notifyUnread(roomId: string, count: number) {
    this.unreadHandlers.forEach((handler) => {
      try {
        handler(roomId, count);
      } catch (e) {}
    });
  }

  async loadRoomList() {
    try {
      const res = await apiRequest("GET", "/api/chat/rooms");
      const data = await res.json();
      const rooms = data.rooms || data || [];

      const oldTotal = this.totalUnread;

      this.roomSummaries.clear();

      rooms.forEach((room) => {
        const roomId = room.roomId || room.id;
        if (!roomId) return;
        const unreadCount = room.unreadCount || 0;
        this.roomSummaries.set(roomId, {
          roomId,
          name: room.name || room.subject || "Chat",
          lastMessage: room.lastMessage,
          lastMessageSender: room.lastMessageSender,
          lastMessageAt: room.lastMessageAt,
          unreadCount,
          type: room.type || room.conversationType,
        });
        this.subscribedRooms.add(roomId);
      });

      this.lastReconcileAt = Date.now();
      this.notifyRoomUpdate();

      const newTotal = this.totalUnread;
      if (newTotal !== oldTotal) {
        this.roomSummaries.forEach((room) => {
          if (room.unreadCount > 0) {
            this.notifyUnread(room.roomId, room.unreadCount);
          }
        });
      }
    } catch (e) {
      console.warn("[ChatManager] Failed to load room list:", e);
    }
  }

  sendMessage(roomId: string, content: string) {
  }

  disconnect() {
    this.initialized = false;
    this.stopReconciliation();
    this.stopVisibilitySync();
    this.stopRecentIdCleanup();
    this.subscribedRooms.clear();
    this.activeRoomHandlers.clear();
    this.roomSummaries.clear();
    this.roomUpdateHandlers.clear();
    this.unreadHandlers.clear();
    this.recentMessageIds.clear();
  }
}

export const chatManager = new ChatConnectionManager();
