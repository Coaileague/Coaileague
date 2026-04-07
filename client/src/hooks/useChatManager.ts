import { useState, useEffect, useCallback, useRef } from "react";
import { chatManager, type ChatRoomSummary, type IncomingChatMessage } from "@/services/chatConnectionManager";
import { useWebSocketBus } from "@/providers/WebSocketProvider";

export function useChatManagerInit(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    chatManager.initialize(userId);
    return () => {};
  }, [userId]);
}

export function useChatUnreadTotal(): number {
  const [total, setTotal] = useState(() => chatManager.totalUnread);

  useEffect(() => {
    const updateTotal = () => {
      const newTotal = chatManager.totalUnread;
      setTotal(prev => prev !== newTotal ? newTotal : prev);
    };

    updateTotal();

    const unsub = chatManager.onUnreadChange(() => {
      updateTotal();
    });

    const roomUnsub = chatManager.onRoomUpdate(() => {
      updateTotal();
    });

    return () => {
      unsub();
      roomUnsub();
    };
  }, []);

  return total;
}

export function useChatRoomUnread(roomId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(chatManager.getUnreadCount(roomId));

    const unsub = chatManager.onUnreadChange((changedRoomId, newCount) => {
      if (changedRoomId === roomId) {
        setCount(newCount);
      }
    });

    return unsub;
  }, [roomId]);

  return count;
}

export function useChatRoomSummaries(): ChatRoomSummary[] {
  const [summaries, setSummaries] = useState<ChatRoomSummary[]>([]);

  useEffect(() => {
    setSummaries(chatManager.getRoomSummaries());

    const unsub = chatManager.onRoomUpdate(() => {
      setSummaries(chatManager.getRoomSummaries());
    });

    return unsub;
  }, []);

  return summaries;
}

export function useActiveRoom(roomId: string | null, onMessage?: (msg: IncomingChatMessage) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!roomId) return;

    chatManager.setActiveRoom(roomId, (msg) => {
      handlerRef.current?.(msg);
    });

    return () => {
      chatManager.clearActiveRoom(roomId);
    };
  }, [roomId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (roomId) {
        chatManager.sendMessage(roomId, content);
      }
    },
    [roomId]
  );

  return { sendMessage };
}

export function useChatManagerWebSocketBridge() {
  const bus = useWebSocketBus();

  useEffect(() => {
    if (!bus) return;

    const unsubs: (() => void)[] = [];

    unsubs.push(bus.subscribe('__ws_connected', () => {
      chatManager.handleWebSocketReconnect();
    }));

    const liveMessageTypes = ['new_message', 'chat_message', 'private_message'];

    unsubs.push(bus.subscribeAll((data: any) => {
      if (liveMessageTypes.includes(data.type)) {
        const conversationId = data.conversationId || data.message?.conversationId || data.roomId || data.chatroomId;
        if (!conversationId) return;

        const messageContent = data.message?.message || data.content || data.message || data.messagePreview || '';
        const senderName = data.message?.senderName || data.senderName || data.displayName || 'Unknown';
        const senderId = data.message?.senderId || data.senderId || data.userId || '';
        const msgId = data.message?.id || data.messageId || data.id;

        chatManager.handleExternalMessage({
          type: 'new_message',
          conversationId,
          senderId,
          senderName,
          content: typeof messageContent === 'string' ? messageContent : '',
          message: typeof messageContent === 'string' ? messageContent : '',
          timestamp: data.message?.timestamp || data.timestamp || new Date().toISOString(),
          messageId: msgId,
          roomName: data.roomName || data.chatroomName,
        });
        return;
      }

      if (data.type === 'new_chatroom_message') {
        chatManager.handleExternalMessage({
          type: 'new_chatroom_message',
          chatroomId: data.chatroomId,
          chatroomName: data.chatroomName,
          senderName: data.senderName,
          messagePreview: data.messagePreview,
          timestamp: data.timestamp,
          senderId: data.senderId,
        });
        return;
      }

      if (data.type === 'user_added_to_chatroom' || data.type === 'chatroom_invitation') {
        chatManager.loadRoomList();
        return;
      }

      if (data.type === 'room_status_changed') {
        chatManager.loadRoomList();
        return;
      }

      if (data.type === 'room_deleted') {
        chatManager.loadRoomList();
        return;
      }
    }));

    return () => {
      unsubs.forEach(u => u());
    };
  }, [bus]);
}
