/**
 * MobileResponsiveSheet — Canvas Hub wrapper around shadcn Sheet.
 * Provides a bottom sheet with drag indicator and proper layer management.
 */
import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  maxHeight?: string;
  showDragIndicator?: boolean;
  showCloseButton?: boolean;
  children: React.ReactNode;
}

export function MobileResponsiveSheet({
  open,
  onOpenChange,
  side = "bottom",
  className,
  maxHeight,
  showDragIndicator = true,
  showCloseButton = true,
  children,
}: MobileResponsiveSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn("p-0 flex flex-col", className)}
        style={maxHeight ? { maxHeight } : null}
        showCloseButton={showCloseButton}
      >
        {showDragIndicator && (
          <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {children}
      </SheetContent>
    </Sheet>
  );
}
