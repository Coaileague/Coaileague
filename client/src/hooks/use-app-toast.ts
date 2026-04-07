/**
 * USE-APP-TOAST — Single Source of Truth for toast notifications
 *
 * Bridges the UniversalToast system with the legacy useToast API shape.
 * All expansion module pages import from HERE. Edit once → changes all 8.
 *
 * Usage:
 *   const { toast } = useAppToast();
 *   toast({ title: "Saved!", description: "Record saved." });
 *   toast({ title: "Error", description: err.message, variant: "destructive" });
 */
import { useUniversalToast } from "@/components/universal/UniversalToast";

interface AppToastOptions {
  title: string;
  description?: string;
  /** "destructive" maps to error variant; anything else maps to success */
  variant?: "default" | "destructive";
  /** Duration in milliseconds (default: 4000) */
  duration?: number;
}

export function useAppToast() {
  const ut = useUniversalToast();

  const toast = ({ title, description, variant, duration }: AppToastOptions) => {
    const message = description ? `${title}: ${description}` : title;
    const opts = duration ? { duration } : undefined;

    if (variant === "destructive") {
      ut.error(message, opts);
    } else {
      ut.success(message, opts);
    }
  };

  return { toast };
}
