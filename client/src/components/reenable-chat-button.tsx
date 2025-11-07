import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export function ReenableChatButton() {
  const [isChatClosed, setIsChatClosed] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    // Check if chat button is closed
    const checkChatStatus = () => {
      const closedState = localStorage.getItem('chat-button-closed');
      setIsChatClosed(closedState === 'true');
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
  };

  // Don't show on chat pages
  if (location === "/live-chat" || location === "/mobile-chat" || location === "/modern-mobile-chat" || location === "/helpdesk5") {
    return null;
  }

  // Only show if chat is closed
  if (!isChatClosed) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-500"
      data-testid="container-reenable-chat"
    >
      <Button
        variant="default"
        size="default"
        onClick={handleReenableChat}
        className="shadow-lg hover:shadow-xl transition-all duration-300 bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
        data-testid="button-reenable-chat"
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Show Live Support
      </Button>
    </div>
  );
}
