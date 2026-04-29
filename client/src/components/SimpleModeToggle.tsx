import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, Sparkles } from 'lucide-react';
import { useSimpleMode } from '@/contexts/SimpleModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SimpleModeToggleProps {
  variant?: 'default' | 'compact' | 'labeled' | 'icon';
  className?: string;
}

export function SimpleModeToggle({ variant = 'default', className }: SimpleModeToggleProps) {
  const { isSimpleMode, toggleSimpleMode, isLoading } = useSimpleMode();
  const isMobile = useIsMobile();

  // Icon-only variant - perfect for mobile headers
  if (variant === 'icon') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSimpleMode}
        disabled={isLoading}
        className={cn(
          "h-8 w-8 flex-shrink-0 transition-all duration-200",
          isSimpleMode 
            ? "text-primary bg-primary/10 ring-1 ring-primary/30" 
            : "text-muted-foreground hover:text-foreground",
          className
        )}
        data-testid="button-simple-mode-toggle"
        title={isSimpleMode ? "Switch to Pro View" : "Switch to Easy View"}
        aria-pressed={isSimpleMode}
      >
        {isSimpleMode ? (
          <Eye className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </Button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={toggleSimpleMode}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
          isSimpleMode 
            ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/50" 
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          className
        )}
        data-testid="button-simple-mode-toggle"
        title={isSimpleMode ? "Switch to Advanced View" : "Switch to Easy View"}
        aria-pressed={isSimpleMode}
      >
        {isSimpleMode ? (
          <>
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Easy</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Pro</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'labeled') {
    return (
      <div className={cn("flex items-center justify-between gap-4 p-4 rounded-lg border bg-card transition-all", isSimpleMode ? "border-primary/50 bg-primary/5" : "border-border", className)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-all duration-200",
            isSimpleMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {isSimpleMode ? (
              <Eye className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div>
            <Label htmlFor="simple-mode-switch" className="text-base font-medium cursor-pointer">
              Easy View Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              {isSimpleMode 
                ? "Showing simplified interface with essential controls" 
                : "Showing full interface with all features and data"}
            </p>
          </div>
        </div>
        <Switch
          id="simple-mode-switch"
          checked={isSimpleMode}
          onCheckedChange={toggleSimpleMode}
          disabled={isLoading}
          data-testid="switch-simple-mode"
          aria-label={isSimpleMode ? "Disable Easy View" : "Enable Easy View"}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 flex-shrink-0 transition-all duration-200", isSimpleMode && "ring-1 ring-primary/30 px-1 rounded", className)}>
      <Switch
        id="simple-mode"
        checked={isSimpleMode}
        onCheckedChange={toggleSimpleMode}
        disabled={isLoading}
        data-testid="switch-simple-mode"
        aria-label={isSimpleMode ? "Disable Easy View" : "Enable Easy View"}
      />
      <Label htmlFor="simple-mode" className={cn("text-xs sm:text-sm cursor-pointer whitespace-nowrap hidden sm:inline transition-colors duration-200", isSimpleMode && "text-primary font-medium")}>
        Easy View
      </Label>
    </div>
  );
}
