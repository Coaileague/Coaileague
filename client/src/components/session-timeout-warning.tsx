
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

const IDLE_WARNING_MS = 50 * 60 * 1000; // 50 minutes
const IDLE_LOGOUT_MS = 60 * 60 * 1000; // 60 minutes total (10 min warning)

export function SessionTimeoutWarning() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds

  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
    }
    queryClient.clear();
    toast({
      title: "Session expired",
      description: "You have been logged out due to inactivity.",
      variant: "destructive",
    });
    window.location.replace("/login");
  }, [toast, clearTimers]);

  const startTimers = useCallback(() => {
    clearTimers();
    if (!user) return;

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(600);
      
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    }, IDLE_WARNING_MS);

    logoutTimerRef.current = setTimeout(() => {
      handleLogout();
    }, IDLE_LOGOUT_MS);
  }, [user, handleLogout, clearTimers]);

  const resetIdleTimer = useCallback(() => {
    if (!showWarning) {
      startTimers();
    }
  }, [showWarning, startTimers]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll"];
    
    // Debounced reset to avoid excessive timer restarts
    let timeout: NodeJS.Timeout;
    const throttledReset = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(resetIdleTimer, 100);
    };

    events.forEach((event) => window.addEventListener(event, throttledReset));
    startTimers();

    return () => {
      events.forEach((event) => window.removeEventListener(event, throttledReset));
      clearTimers();
      if (timeout) clearTimeout(timeout);
    };
  }, [resetIdleTimer, startTimers, clearTimers]);

  const stayLoggedIn = async () => {
    try {
      await apiRequest("GET", "/api/auth/me");
      setShowWarning(false);
      startTimers();
    } catch (error) {
      console.error("Failed to refresh session:", error);
      handleLogout();
    }
  };

  if (!user || !showWarning) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => !open && stayLoggedIn()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Session Timeout Warning</DialogTitle>
          <DialogDescription>
            Your session will expire in <span className="font-bold text-destructive">{timeString}</span> due to inactivity. 
            Click 'Stay logged in' to continue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            data-testid="button-logout-now"
          >
            Log out
          </Button>
          <Button 
            onClick={stayLoggedIn}
            data-testid="button-stay-logged-in"
          >
            Stay logged in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
