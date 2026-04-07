import { MobileNotificationHub } from "@/components/mobile/MobileNotificationHub";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useIsMobile } from "@/hooks/use-mobile";
import { Redirect } from "wouter";

export default function MobileHubPage() {
  const isMobile = useIsMobile();
  
  if (!isMobile) {
    return <Redirect to="/dashboard" />;
  }

  const pageConfig: CanvasPageConfig = {
    id: 'mobile-hub',
    title: 'Notifications',
    category: 'operations',
    withBottomNav: true,
    showHeader: false, // MobileNotificationHub has its own header
  };
  
  return (
    <CanvasHubPage config={pageConfig}>
      <MobileNotificationHub />
    </CanvasHubPage>
  );
}
