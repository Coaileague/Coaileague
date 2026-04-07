/**
 * AcknowledgmentField — Scrollable legal text with scroll-to-bottom gating.
 * User must scroll to bottom before the checkbox enables.
 */
import { useRef, useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollText, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AcknowledgmentFieldProps {
  id: string;
  legalText: string;
  acknowledgmentText: string;
  requireScrollToRead?: boolean;
  value?: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
}

export function AcknowledgmentField({
  id,
  legalText,
  acknowledgmentText,
  requireScrollToRead = false,
  value = false,
  onChange,
  error,
  disabled = false,
}: AcknowledgmentFieldProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(!requireScrollToRead);

  useEffect(() => {
    if (!requireScrollToRead) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      if (atBottom) setScrolledToBottom(true);
    };
    el.addEventListener("scroll", check);
    check();
    return () => el.removeEventListener("scroll", check);
  }, [requireScrollToRead]);

  const canCheck = !requireScrollToRead || scrolledToBottom;

  return (
    <div className="space-y-3" data-testid={`field-acknowledgment-${id}`}>
      {legalText && (
        <div className="relative">
          <div
            ref={scrollRef}
            className="rounded-md border border-border bg-muted/20 p-4 text-sm text-foreground leading-relaxed overflow-y-auto max-h-48 whitespace-pre-wrap"
            data-testid={`text-legal-${id}`}
          >
            {legalText}
          </div>
          {requireScrollToRead && !scrolledToBottom && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted/80 to-transparent rounded-b-md flex items-end justify-center pb-2 pointer-events-none">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ScrollText className="w-3 h-3" />
                Scroll to read
              </span>
            </div>
          )}
          {requireScrollToRead && scrolledToBottom && (
            <div className="absolute bottom-2 right-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          )}
        </div>
      )}

      <div className={cn(
        "flex items-start gap-3 p-3 rounded-md border transition-colors",
        canCheck ? "border-border" : "border-border/40 opacity-60",
        value ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700" : ""
      )}>
        <Checkbox
          id={`ack-${id}`}
          checked={value}
          onCheckedChange={(checked) => onChange(!!checked)}
          disabled={!canCheck || disabled}
          className="mt-0.5 min-w-[18px] min-h-[18px]"
          data-testid={`checkbox-acknowledgment-${id}`}
        />
        <Label
          htmlFor={`ack-${id}`}
          className={cn(
            "text-sm leading-relaxed cursor-pointer",
            !canCheck ? "cursor-not-allowed text-muted-foreground" : "text-foreground"
          )}
        >
          {acknowledgmentText}
          {requireScrollToRead && !scrolledToBottom && (
            <span className="text-muted-foreground text-xs block mt-1">(Scroll through the text above to enable this checkbox)</span>
          )}
        </Label>
      </div>

      {error && (
        <p className="text-xs text-destructive" data-testid={`error-acknowledgment-${id}`}>{error}</p>
      )}
    </div>
  );
}
