import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Database } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

interface AISystemStatus {
  success: boolean;
  status: {
    primaryProvider: string;
    activeProvider: string;
    mode: 'normal' | 'degraded' | 'emergency';
    isHealthy: boolean;
    isDegraded: boolean;
    isEmergency: boolean;
  };
  message: string;
}

export function AISystemStatusBanner() {
  const { dbDegraded } = useAuth();

  const { data, isLoading, error } = useQuery<AISystemStatus>({
    queryKey: ['/api/ai-brain/system-status'],
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  // DB degraded takes priority over AI status
  if (dbDegraded) {
    return (
      <Alert
        data-testid="banner-db-degraded"
        className="rounded-none border-x-0 border-t-0 py-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
      >
        <div className="flex items-center gap-2 max-w-screen-xl mx-auto">
          <Database className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <AlertDescription
            data-testid="text-db-degraded-message"
            className="text-sm text-amber-700 dark:text-amber-300"
          >
            Database is warming up — some data may be temporarily unavailable. Refreshing automatically.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  if (isLoading || !data || error) return null;
  if (data.status.mode === 'normal') return null;

  const isEmergency = data.status.mode === 'emergency';

  return (
    <Alert 
      data-testid="banner-ai-status"
      className={`rounded-none border-x-0 border-t-0 py-2 ${
        isEmergency 
          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' 
          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
      }`}
    >
      <div className="flex items-center gap-2 max-w-screen-xl mx-auto">
        {isEmergency ? (
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
        <AlertDescription 
          data-testid="text-ai-status-message"
          className={`text-sm ${
            isEmergency 
              ? 'text-red-700 dark:text-red-300' 
              : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          {isEmergency 
            ? 'AI is running in limited mode. Some features may be unavailable.' 
            : `AI is running on backup systems (${data.status.activeProvider}). All features remain available.`}
        </AlertDescription>
      </div>
    </Alert>
  );
}
