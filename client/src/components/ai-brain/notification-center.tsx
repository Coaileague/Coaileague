import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Trash2, CheckCircle } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  read: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  userId: string;
  workspaceId: string;
}

export function NotificationCenter({ userId, workspaceId }: NotificationCenterProps) {
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const { toast } = useToast();

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ["/api/notifications/user", userId, filter],
    queryFn: async () => {
      const response = await fetch(
        `/api/notifications/user/${userId}?unreadOnly=${filter === "unread"}&limit=20`
      );
      const result = await response.json();
      return result.data || [];
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest("POST", `/api/notifications/${notificationId}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/user", userId] });
      toast({ title: "Marked as read" });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "warning":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </div>
          <Badge variant="outline">
            {notifications?.filter((n: Notification) => !n.read).length || 0} unread
          </Badge>
        </CardTitle>
        <CardDescription>Stay updated with AI Brain automation events</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
            data-testid="button-filter-unread"
          >
            Unread
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            data-testid="button-filter-all"
          >
            All
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : notifications?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No notifications</p>
        ) : (
          <div className="space-y-2">
            {notifications?.map((notif: Notification) => (
              <div
                key={notif.id}
                className={`p-3 border rounded-lg space-y-2 ${!notif.read ? "bg-muted" : ""}`}
                data-testid={`notification-${notif.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{notif.title}</p>
                      <Badge
                        variant={getSeverityColor(notif.severity) as any}
                        className="text-xs"
                      >
                        {notif.severity}
                      </Badge>
                      {!notif.read && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {!notif.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markReadMutation.mutate(notif.id)}
                      disabled={markReadMutation.isPending}
                      data-testid={`button-mark-read-${notif.id}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
