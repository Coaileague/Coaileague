
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, WifiOff, Loader2 } from "lucide-react";

export function StatusIndicators() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Connection Status */}
      {!isOnline && (
        <Badge variant="destructive" className="gap-1">
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Offline</span>
        </Badge>
      )}

      {/* Sync Status */}
      {isOnline && syncStatus === 'syncing' && (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Syncing...</span>
        </Badge>
      )}

      {isOnline && syncStatus === 'synced' && (
        <Badge variant="outline" className="gap-1 border-green-500/50 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          <span className="hidden sm:inline">Synced</span>
        </Badge>
      )}

      {syncStatus === 'error' && (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          <span className="hidden sm:inline">Sync Error</span>
        </Badge>
      )}
    </div>
  );
}
