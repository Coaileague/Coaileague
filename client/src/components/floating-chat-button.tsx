import { useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function FloatingChatButton() {
  const [location, setLocation] = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  
  // Don't show on the live chat page itself
  if (location === "/live-chat") {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
      {/* Label that appears on hover */}
      {isHovered && (
        <div className="animate-in slide-in-from-right-2 fade-in duration-200 bg-[hsl(var(--cad-purple))] text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm whitespace-nowrap flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Need Help? Chat with us!
        </div>
      )}
      
      <Button
        onClick={() => setLocation("/live-chat")}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        size="lg"
        data-testid="button-floating-chat"
        className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-[hsl(var(--cad-purple))] hover:bg-[hsl(var(--cad-purple))]/90 text-white border-2 border-[hsl(var(--cad-purple-light))]"
        style={{
          transform: isHovered ? "scale(1.1)" : "scale(1)",
        }}
      >
        <MessageSquare className="h-6 w-6 relative z-10" />
        <span className="sr-only">Open Live Chat</span>
        
        {/* Pulse animation ring */}
        <span className="absolute inset-0 rounded-full bg-[hsl(var(--cad-purple))] opacity-75 animate-ping" />
      </Button>
    </div>
  );
}
