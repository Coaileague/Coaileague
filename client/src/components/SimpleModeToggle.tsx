import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, Sparkles } from 'lucide-react';
import { useSimpleMode } from '@/contexts/SimpleModeContext';
import { cn } from '@/lib/utils';

interface SimpleModeToggleProps {
  variant?: 'default' | 'compact' | 'labeled';
  className?: string;
}

export function SimpleModeToggle({ variant = 'default', className }: SimpleModeToggleProps) {
  const { isSimpleMode, toggleSimpleMode, isLoading } = useSimpleMode();

  if (variant === 'compact') {
    return (
      <button
        onClick={toggleSimpleMode}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors",
          isSimpleMode 
            ? "bg-primary/10 text-primary" 
            : "bg-muted text-muted-foreground hover-elevate",
          className
        )}
        data-testid="button-simple-mode-toggle"
        title={isSimpleMode ? "Switch to Advanced View" : "Switch to Easy View"}
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
      <div className={cn("flex items-center justify-between gap-4 p-4 rounded-lg border bg-card", className)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isSimpleMode ? "bg-primary/10" : "bg-muted"
          )}>
            {isSimpleMode ? (
              <Eye className="h-5 w-5 text-primary" />
            ) : (
              <Sparkles className="h-5 w-5 text-muted-foreground" />
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
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Switch
        id="simple-mode"
        checked={isSimpleMode}
        onCheckedChange={toggleSimpleMode}
        disabled={isLoading}
        data-testid="switch-simple-mode"
      />
      <Label htmlFor="simple-mode" className="text-sm cursor-pointer">
        Easy View
      </Label>
    </div>
  );
}
