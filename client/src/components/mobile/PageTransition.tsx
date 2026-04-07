import { useLocation } from "wouter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [animKey, setAnimKey] = useState(0);
  const prevLocation = useRef(location);

  useEffect(() => {
    if (prevLocation.current !== location) {
      prevLocation.current = location;
      setAnimKey((k) => k + 1);
    }
  }, [location]);

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div key={animKey} className="page-transition-enter h-full min-h-0 flex flex-col">
      {children}
    </div>
  );
}
