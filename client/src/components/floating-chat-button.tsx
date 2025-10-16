import { MessageSquare } from "lucide-react";
import { useLocation } from "wouter";

export function FloatingChatButton() {
  const [location, setLocation] = useLocation();
  
  // Don't show on the live chat page itself
  if (location === "/live-chat") {
    return null;
  }

  return (
    <button
      onClick={() => setLocation("/live-chat")}
      data-testid="button-floating-chat"
      className="fixed bottom-6 right-6 z-50 group"
      aria-label="Open Live Support"
    >
      <div className="relative flex items-center gap-3 bg-[hsl(var(--cad-surface-elevated))] border border-[hsl(var(--cad-border-strong))] rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all duration-300 hover-elevate">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        
        {/* Text Label */}
        <div className="flex flex-col items-start pr-1 hidden sm:block">
          <span className="text-xs font-semibold text-[hsl(var(--cad-text-primary))] whitespace-nowrap">Live Support</span>
          <span className="text-[10px] text-[hsl(var(--cad-text-tertiary))] whitespace-nowrap">We're here to help</span>
        </div>
        
        {/* Online indicator */}
        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
      </div>
    </button>
  );
}
