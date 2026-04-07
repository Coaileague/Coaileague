import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { shouldShowPushPrompt } from "@/lib/pushNotifications";

const DISMISS_KEY = "coaileague-push-prompt-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function PushNotificationPrompt() {
  const isMobile = useIsMobile();
  const { isSupported, permission, isSubscribed, subscribe, isLoading } = usePushNotifications();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!isSupported || permission === "denied" || isSubscribed) {
      setDismissed(true);
      return;
    }
    if (!shouldShowPushPrompt()) {
      setDismissed(true);
      return;
    }
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (Date.now() - ts < DISMISS_DURATION_MS) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
  }, [isSupported, permission, isSubscribed]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  const handleEnable = async () => {
    await subscribe();
    setDismissed(true);
  };

  if (dismissed || !isSupported || isSubscribed || permission === "denied") {
    return null;
  }

  return (
    <Card className={cn(
      "border-primary/20 bg-primary/5",
      isMobile ? "mx-3 mt-2 mb-1" : "mx-2 mt-2"
    )}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" data-testid="text-push-prompt-title">
              Stay in the loop
            </p>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-push-prompt-desc">
              Get instant alerts for shifts, approvals, and important updates even when the app is closed.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={isLoading}
                data-testid="button-enable-push"
              >
                {isLoading ? "Enabling..." : "Enable Notifications"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                data-testid="button-dismiss-push"
              >
                Not now
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={handleDismiss}
            data-testid="button-close-push-prompt"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
