/**
 * MobileNotificationSheet - Bell icon that opens MobileNotificationHub in a Sheet
 * This is the unified mobile notification system accessible from the top header
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MobileNotificationHub } from "./MobileNotificationHub";

interface NotificationsData {
  userNotifications: any[];
  platformUpdates: any[];
  totalUnread: number;
  unreadCount?: number;
}

export function MobileNotificationSheet() {
  const [open, setOpen] = useState(false);
  
  const { data: notificationsData } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    refetchInterval: 30000,
  });
  
  const unreadCount = notificationsData?.totalUnread ?? notificationsData?.unreadCount ?? 0;
  
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        data-testid="button-mobile-notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
            data-testid="badge-notification-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] rounded-t-2xl p-0 overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <SheetTitle className="sr-only">Notifications</SheetTitle>
          <MobileNotificationHub onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
