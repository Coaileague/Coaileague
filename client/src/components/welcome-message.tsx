import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

export function WelcomeMessage() {
  const { user } = useAuth();
  
  const { data: workspace } = useQuery<{ name?: string }>({ 
    queryKey: ['/api/workspace'] 
  });

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const workspaceName = workspace?.name || 'AutoForce™';

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary/10 to-green-500/10 border border-primary/20"
      data-testid="welcome-message"
    >
      <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-accent text-white shrink-0">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="hidden md:flex flex-col min-w-0">
        <span className="text-xs font-semibold text-foreground truncate">
          {getTimeBasedGreeting()}, {firstName}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          {workspaceName}
        </span>
      </div>
      <div className="md:hidden flex items-center">
        <span className="text-xs font-semibold text-foreground">
          {firstName}
        </span>
      </div>
    </div>
  );
}
