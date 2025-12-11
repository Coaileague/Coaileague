import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, BellRing, Send, Smartphone, AlertCircle, CheckCircle } from "lucide-react";

export function PushNotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    subscriptions,
    isLoading,
    subscribe,
    unsubscribe,
    sendTest,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Push notifications are not supported in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>Try using a modern browser like Chrome, Firefox, or Edge.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Push Notifications</CardTitle>
          </div>
          <Badge variant={isSubscribed ? "default" : "secondary"}>
            {isSubscribed ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </>
            ) : (
              <>
                <BellOff className="h-3 w-3 mr-1" />
                Inactive
              </>
            )}
          </Badge>
        </div>
        <CardDescription>
          Receive instant notifications for urgent alerts, shift reminders, and approval requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Push Notifications</Label>
            <p className="text-sm text-muted-foreground">
              {permission === "denied"
                ? "Permission blocked. Enable in browser settings."
                : isSubscribed
                ? "You're receiving push notifications on this device."
                : "Turn on to receive important alerts."}
            </p>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={(checked) => {
              if (checked) {
                subscribe();
              } else {
                unsubscribe();
              }
            }}
            disabled={isLoading || permission === "denied"}
            data-testid="switch-push-notifications"
          />
        </div>

        {permission === "denied" && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              Notifications are blocked. Please allow notifications in your browser settings and refresh the page.
            </span>
          </div>
        )}

        {isSubscribed && subscriptions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Active Devices</Label>
            <div className="space-y-2">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span>{sub.platform || "Unknown Device"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isSubscribed && (
          <Button
            variant="outline"
            size="sm"
            onClick={sendTest}
            disabled={isLoading}
            className="gap-2"
            data-testid="button-test-push"
          >
            <Send className="h-4 w-4" />
            Send Test Notification
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PushNotificationBanner() {
  const { isSupported, permission, isSubscribed, subscribe, isLoading } = usePushNotifications();

  if (!isSupported || permission === "denied" || isSubscribed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg mb-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-medium">Enable Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Get instant alerts for shifts, approvals, and urgent updates.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={subscribe} disabled={isLoading} data-testid="button-enable-push">
        Enable
      </Button>
    </div>
  );
}
