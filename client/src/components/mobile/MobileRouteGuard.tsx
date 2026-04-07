import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { isDesktopOnlyRoute } from "@/config/mobileConfig";

interface MobileRouteGuardProps {
  children: ReactNode;
}

export function MobileRouteGuard({ children }: MobileRouteGuardProps) {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  
  useEffect(() => {
    if (isMobile && isDesktopOnlyRoute(location)) {
      setLocation("/dashboard");
    }
  }, [isMobile, location, setLocation]);
  
  if (isMobile && isDesktopOnlyRoute(location)) {
    return null;
  }
  
  return <>{children}</>;
}
