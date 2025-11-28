import { AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { navConfig } from "@/config/navigationConfig";

export function DemoBanner() {
  const { user } = useAuth();
  
  // Only show banner for demo user
  if (!user || user.email !== "demo@coaileague.com") {
    return null;
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-6 py-4 shrink-0" data-testid="banner-demo-mode">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-medium text-sm">CoAIleague Demo Mode</span>
            <span className="text-xs text-muted-foreground">
              You're exploring a fully interactive CoAIleague demo. Data resets every 24 hours.
            </span>
          </div>
        </div>
        <Button 
          size="sm" 
          onClick={() => window.location.href = navConfig.auth.login}
          data-testid="button-demo-signup"
        >
          Sign Up for Free
        </Button>
      </div>
    </div>
  );
}
