import { useState, useEffect } from "react";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionStatusBanner() {
  const isOnline = useConnectionStatus();
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const [prevIsOnline, setPrevIsOnline] = useState(isOnline);

  useEffect(() => {
    if (isOnline && !prevIsOnline) {
      setShowOnlineBanner(true);
      const timer = setTimeout(() => {
        setShowOnlineBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setPrevIsOnline(isOnline);
  }, [isOnline, prevIsOnline]);

  if (!isOnline) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 font-medium"
        data-testid="banner-offline"
      >
        <WifiOff className="h-4 w-4" />
        <span>No internet connection. Changes won't be saved.</span>
      </div>
    );
  }

  if (showOnlineBanner) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white px-4 py-2 flex items-center justify-center gap-2 font-medium transition-all duration-300"
        data-testid="banner-online"
      >
        <Wifi className="h-4 w-4" />
        <span>You're back online</span>
      </div>
    );
  }

  return null;
}
