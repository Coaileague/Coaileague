/**
 * TrinitySessionContext — shared active-chat session for header surfacing.
 *
 * The TrinityThoughtBar in the universal header polls a thought stream
 * endpoint for the *active* Trinity session. Without knowing which
 * session is active, the bar defaults to the most recent thoughts.
 *
 * When ChatDock opens a specific room, it calls setActiveSessionId(roomId)
 * so the header bar streams phases for THAT session. On unmount, ChatDock
 * clears it. One bar, always in the header, always context-aware.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TrinitySessionContextValue {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

const TrinitySessionContext = createContext<TrinitySessionContextValue>({
  activeSessionId: null,
  setActiveSessionId: () => {},
});

export function TrinitySessionProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
  }, []);
  return (
    <TrinitySessionContext.Provider value={{ activeSessionId, setActiveSessionId }}>
      {children}
    </TrinitySessionContext.Provider>
  );
}

export function useTrinitySession(): TrinitySessionContextValue {
  return useContext(TrinitySessionContext);
}
