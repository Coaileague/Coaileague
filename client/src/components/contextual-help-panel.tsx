import { useState } from "react";
import { X, HelpCircle, Lightbulb, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HelpItem {
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
}

interface ContextualHelpPanelProps {
  title: string;
  items: HelpItem[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function ContextualHelpPanel({
  title,
  items,
  isOpen = false,
  onOpenChange,
  className,
}: ContextualHelpPanelProps) {
  const [localOpen, setLocalOpen] = useState(isOpen);
  const open = onOpenChange ? isOpen : localOpen;
  const setOpen = onOpenChange ? onOpenChange : setLocalOpen;

  return (
    <div
      className={cn(
        "fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-card border-l border-border shadow-lg transition-transform duration-200 z-40",
        open ? "translate-x-0" : "translate-x-full",
        className
      )}
      data-testid="contextual-help-panel"
    >
      <div className="h-full overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            data-testid="button-close-help"
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tips available</p>
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={index}
                className="p-3 rounded-md bg-muted/50 space-y-2"
                data-testid={`help-item-${index}`}
              >
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <h4 className="font-medium text-sm">{item.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                {item.actionLabel && item.actionUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(item.actionUrl, "_blank")}
                    className="h-7 text-xs"
                    data-testid={`help-action-${index}`}
                  >
                    {item.actionLabel}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border text-center text-xs text-muted-foreground">
          <p>Need more help? <a href="/support" className="text-primary hover:underline">Contact support</a></p>
        </div>
      </div>

      {/* Toggle Button (when closed) */}
      {!open && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 h-10 w-10 rounded-full shadow-lg z-40"
          data-testid="button-open-help"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
