import { MobileNotificationHub } from "@/components/mobile/MobileNotificationHub";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { useEffect } from "react";

/**
 * Command Center Page - Mobile Only
 * Desktop users access notifications via the bell icon popover in the header.
 * This page is exclusively for mobile GetSling-style notification hub.
 */
export default function CommandCenterPage() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Redirect desktop users to dashboard - they use bell popover for notifications
  useEffect(() => {
    if (!isMobile) {
      setLocation('/dashboard');
    }
  }, [isMobile, setLocation]);

  // Only render for mobile users
  if (!isMobile) {
    return null; // Will redirect
  }

  return <MobileNotificationHub />;
}
