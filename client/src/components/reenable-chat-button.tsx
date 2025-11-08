import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export function ReenableChatButton() {
  const [isChatClosed, setIsChatClosed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    // Check if chat button is closed
    const checkChatStatus = () => {
      const closedState = localStorage.getItem('chat-button-closed');
      setIsChatClosed(closedState === 'true');
      
      // Check minimized state
      const minimizedState = localStorage.getItem('chat-bubble-minimized');
      setIsMinimized(minimizedState === 'true');
    };

    checkChatStatus();

    // Listen for changes to localStorage (cross-tab sync)
    window.addEventListener('storage', checkChatStatus);
    
    // Listen for custom event when chat is closed (same-tab)
    window.addEventListener('chat-button-closed', checkChatStatus);
    
    return () => {
      window.removeEventListener('storage', checkChatStatus);
      window.removeEventListener('chat-button-closed', checkChatStatus);
    };
  }, []);

  const handleReenableChat = () => {
    // Dispatch custom event to re-enable chat button
    window.dispatchEvent(new Event('reenable-chat-button'));
    setIsChatClosed(false);
    setIsMinimized(false);
    localStorage.removeItem('chat-bubble-minimized');
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    localStorage.setItem('chat-bubble-minimized', 'true');
  };

  const handleExpand = () => {
    setIsMinimized(false);
    localStorage.removeItem('chat-bubble-minimized');
  };

  // Don't show on chat pages
  if (location === "/chat" || location === "/mobile-chat") {
    return null;
  }

  // Only show if chat is closed
  if (!isChatClosed) {
    return null;
  }

  // Minimized state: small floating icon on the right side
  if (isMinimized) {
    return (
      <button
        onClick={handleExpand}
        className="fixed bottom-20 md:bottom-6 right-4 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-lg hover:shadow-2xl hover:scale-110 transition-all duration-300 flex items-center justify-center border-2 border-primary/80/30 animate-in slide-in-from-right-5 fade-in"
        data-testid="button-expand-chat"
        aria-label="Expand live support"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  // Expanded state: elegant bubble with message
  return (
    <div 
      className="fixed bottom-20 md:bottom-6 right-4 z-50 animate-in slide-in-from-right-5 fade-in duration-500"
      data-testid="container-reenable-chat"
    >
      <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-sm border border-primary/30 rounded-2xl shadow-2xl p-4 max-w-[280px] md:max-w-sm">
        {/* Close/Minimize button - Larger touch target for accessibility */}
        <button
          onClick={handleMinimize}
          className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-slate-800 border-2 border-primary/30 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center justify-center shadow-lg mobile-touch-target"
          data-testid="button-minimize-chat"
          aria-label="Minimize"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-1">Need Help?</p>
            <p className="text-xs text-slate-300 mb-3 leading-relaxed">Connect with our AutoForce™ support team</p>
            <Button
              onClick={handleReenableChat}
              size="sm"
              className="w-full bg-primary hover:bg-muted/30 text-white border-primary/30 shadow-md"
              data-testid="button-reenable-chat"
            >
              <MessageSquare className="h-3 w-3 mr-2" />
              Start Live Chat
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
