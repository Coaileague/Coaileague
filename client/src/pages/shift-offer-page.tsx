import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ShiftOfferSheet } from "@/components/ShiftOfferSheet";
import { Loader2 } from "lucide-react";

/**
 * ShiftOfferPage — renders as a route at /shifts/offers/:offerId
 * Opens the ShiftOfferSheet bottom drawer immediately on mount,
 * then redirects back on close.
 */
export default function ShiftOfferPage() {
  const { offerId } = useParams<{ offerId: string }>();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (offerId) {
      // Small delay so the page renders before the sheet animation fires
      const t = setTimeout(() => setOpen(true), 80);
      return () => clearTimeout(t);
    }
  }, [offerId]);

  function handleClose(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Go back to dashboard after close
      setLocation("/dashboard");
    }
  }

  if (!offerId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No offer specified.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      {!open && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading offer details...
        </div>
      )}
      <ShiftOfferSheet
        offerId={offerId}
        open={open}
        onOpenChange={handleClose}
      />
    </div>
  );
}
