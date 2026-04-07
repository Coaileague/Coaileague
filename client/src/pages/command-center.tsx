import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

/**
 * Command Center Page - Redirect to proper notification access
 * 
 * Mobile users: Redirected to dashboard - notifications accessed via bell icon in header
 * Desktop users: Redirected to dashboard - notifications accessed via bell popover in header
 * 
 * This page now serves as a redirect since we unified notification access
 * through the header bell icon for all users.
 */
export default function CommandCenterPage() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Redirect all users to dashboard - notifications accessed via bell icon in header
  useEffect(() => {
    // Small delay to show the message before redirecting
    const timer = setTimeout(() => {
      setLocation('/dashboard');
    }, 2000);
    return () => clearTimeout(timer);
  }, [setLocation]);

  const pageConfig: CanvasPageConfig = {
    id: 'command-center',
    title: 'Notifications Moved',
    subtitle: 'Redirecting to dashboard...',
    category: 'operations',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <Bell className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground max-w-sm">
          {isMobile 
            ? "Tap the bell icon in the top header to access your notifications."
            : "Click the bell icon in the header to access your notifications."
          }
        </p>
      </div>
    </CanvasHubPage>
  );
}
