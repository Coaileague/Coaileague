import { MobileNotificationHub } from "@/components/mobile/MobileNotificationHub";
import { useIsMobile } from "@/hooks/use-mobile";
import { Redirect } from "wouter";

export default function MobileHubPage() {
  const isMobile = useIsMobile();
  
  if (!isMobile) {
    return <Redirect to="/dashboard" />;
  }
  
  return <MobileNotificationHub />;
}
