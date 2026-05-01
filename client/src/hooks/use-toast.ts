/**
 * USE-TOAST — Universal toast bridge
 *
 * ONE EDIT HERE → changes ALL 148 pages that call `const { toast } = useToast()`.
 *
 * Routes all toast calls through UniversalToast (single source of truth).
 * The legacy Shadcn Toaster component will render an empty list and is a no-op.
 *
 * Variant mapping:
 *   "destructive"  → error toast  (red icon)
 *   "warning"      → warning toast (amber icon)
 *   "info"         → info toast   (blue icon)
 *   anything else  → success toast (green icon)
 *
 * Usage (unchanged from legacy):
 *   const { toast } = useToast();
 *   toast({ title: "Saved", description: "Changes applied." });
 *   toast({ title: "Error", description: err.message, variant: "destructive" });
 */
import { useUniversalToast } from "@/components/universal/UniversalToast";

interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "warning" | "info" | "success";
  duration?: number;
  /**
   * Optional inline action button (e.g. "Undo"). The underlying
   * UniversalToast renders the label and invokes onClick before dismissing.
   * Pass `{ label, onClick }` — anything else (including legacy Shadcn
   * ToastAction elements) is ignored for backwards compatibility.
   */
  action?: { label: string; onClick: () => void } | unknown;
}

function buildMessage(title: string, description?: string): string {
  if (description) return `${title}: ${description}`;
  return title;
}

export function useToast() {
  const ut = useUniversalToast();

  const toast = ({ title, description, variant, duration, action }: ToastOptions) => {
    const msg = buildMessage(title, description);
    const validAction =
      action && typeof action === 'object' &&
      'label' in (action as any) && 'onClick' in (action as any)
        ? (action as { label: string; onClick: () => void })
        : undefined;
    const opts = (duration || validAction)
      ? { ...(duration ? { duration } : {}), ...(validAction ? { action: validAction } : {}) }
      : undefined;

    if (variant === "destructive") {
      ut.error(msg, opts);
    } else if (variant === "warning") {
      ut.warning(msg, opts);
    } else if (variant === "info") {
      ut.info(msg, opts);
    } else {
      ut.success(msg, opts);
    }
  };

  // Return empty toasts array so the legacy Shadcn <Toaster /> gracefully renders nothing
  return {
    toast,
    toasts: [] as any[],
    dismiss: (_id?: string) => {},
  };
}

// Standalone toast (no-op outside React tree — use useToast inside components)
export const toast = (opts: ToastOptions) => {
  console.warn("[toast] Called outside React tree — use `const { toast } = useToast()` inside a component.");
};

// Type aliases kept for any pages that import types from this module
export type { ToastOptions as ToastProps };
