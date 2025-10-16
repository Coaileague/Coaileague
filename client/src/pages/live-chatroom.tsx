import { useState, useEffect } from "react";
import HelpDeskCab from "./HelpDeskCab";
import HelpDesk5 from "./HelpDesk5";

// Device detection wrapper that loads correct chat interface
export default function LiveChatroom() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Detect mobile device
    const checkDevice = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileDevice || isSmallScreen);
      setIsLoading(false);
    };

    checkDevice();

    // Re-check on resize
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isSmallScreen || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return isMobile ? <HelpDesk5 /> : <HelpDeskCab />;
}
