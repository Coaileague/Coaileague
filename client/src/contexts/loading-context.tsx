import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface PendingRequest {
  id: string;
  startTime: number;
  endpoint: string;
}

interface LoadingContextType {
  pendingRequests: PendingRequest[];
  addRequest: (id: string, endpoint: string) => void;
  removeRequest: (id: string) => void;
  isLoading: boolean;
  progress: number;
  averageLoadTime: number;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<{ time: number }[]>([]);

  const addRequest = useCallback((id: string, endpoint: string) => {
    setPendingRequests((prev) => [...prev, { id, endpoint, startTime: Date.now() }]);
  }, []);

  const removeRequest = useCallback((id: string) => {
    setPendingRequests((prev) => {
      const request = prev.find((r) => r.id === id);
      if (request) {
        const loadTime = Date.now() - request.startTime;
        setCompletedRequests((completed) => [...completed.slice(-19), { time: loadTime }]); // Keep last 20
      }
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const isLoading = pendingRequests.length > 0;

  // Calculate average load time from completed requests
  const averageLoadTime =
    completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => sum + r.time, 0) / completedRequests.length
      : 1000;

  // Calculate progress based on how long requests have been pending
  const progress =
    pendingRequests.length > 0
      ? Math.min(
          (pendingRequests.reduce((sum, r) => sum + (Date.now() - r.startTime), 0) /
            (pendingRequests.length * averageLoadTime)) *
            100,
          95 // Cap at 95% until complete
        )
      : 0;

  return (
    <LoadingContext.Provider
      value={{
        pendingRequests,
        addRequest,
        removeRequest,
        isLoading,
        progress: Math.round(progress),
        averageLoadTime,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useGlobalLoading must be used within LoadingProvider");
  }
  return context;
}
