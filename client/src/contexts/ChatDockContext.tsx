import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface ChatBubbleState {
  bubbleOpen: boolean;
  activeChatRoom: { roomId: string; roomName: string } | null;
  toggleBubble: () => void;
  closeBubble: () => void;
  openChat: (roomId: string, roomName: string) => void;
  closeChat: () => void;
  lastActiveRoomId: string | null;
}

const ChatBubbleContext = createContext<ChatBubbleState | null>(null);

const STORAGE_KEY = "coaileague_chat_bubble";

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<{ roomId: string; roomName: string } | null>(null);
  const [lastActiveRoomId, setLastActiveRoomId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).lastActiveRoomId || null;
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastActiveRoomId }));
    } catch {}
  }, [lastActiveRoomId]);

  const toggleBubble = useCallback(() => {
    setBubbleOpen(prev => !prev);
    setActiveChatRoom(null);
  }, []);

  const closeBubble = useCallback(() => {
    setBubbleOpen(false);
    setActiveChatRoom(null);
  }, []);

  const openChat = useCallback((roomId: string, roomName: string) => {
    setLastActiveRoomId(roomId);
    setActiveChatRoom({ roomId, roomName });
    setBubbleOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setActiveChatRoom(null);
  }, []);

  return (
    <ChatBubbleContext.Provider value={{
      bubbleOpen,
      activeChatRoom,
      toggleBubble,
      closeBubble,
      openChat,
      closeChat,
      lastActiveRoomId,
    }}>
      {children}
    </ChatBubbleContext.Provider>
  );
}

export function useChatDock() {
  const ctx = useContext(ChatBubbleContext);
  if (!ctx) throw new Error("useChatDock must be used within ChatDockProvider");
  return ctx;
}
