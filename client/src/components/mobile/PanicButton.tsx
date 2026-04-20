/**
 * Panic Button — Readiness Section 10
 * =====================================
 * Mobile field-app panic/duress trigger. Flagged as MISS in Section 4
 * of STATEWIDE_READINESS_AUDIT.md; the server endpoint (POST /api/safety/panic)
 * was already wired and Trinity-subscribed, but no mobile UI surfaced it.
 *
 * UX contract (deliberately ungentle):
 *   - Single large red button. Press-and-hold 2 seconds to arm
 *     (prevents pocket-dialing).
 *   - Captures GPS position in the background while held.
 *   - On fire: vibration duress pattern, POST to server, irrevocable
 *     toast showing alert number.
 *   - Failure is surfaced explicitly — officer needs to know the alert
 *     didn't go out. No silent swallow.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import haptics from "@/lib/haptics";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const ARM_DURATION_MS = 2000;

interface PanicButtonProps {
  employeeName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  className?: string;
}

export function PanicButton({
  employeeName,
  siteId,
  siteName,
  className,
}: PanicButtonProps): JSX.Element {
  const { toast } = useToast();
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [firing, setFiring] = useState(false);
  const [lastAlertNumber, setLastAlertNumber] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const coordsRef = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const captureCoords = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { coordsRef.current = pos.coords; },
      () => { /* silent — panic must still fire without GPS */ },
      { enableHighAccuracy: true, timeout: 1500, maximumAge: 5000 },
    );
  }, []);

  const fire = useCallback(async () => {
    if (firing) return;
    setFiring(true);
    haptics.duress();
    try {
      const coords = coordsRef.current;
      const nameForServer =
        employeeName ||
        (user as any)?.fullName ||
        (user as any)?.email ||
        "Unknown Officer";
      const { fetchWithOfflineFallback } = await import("@/lib/offlineQueue");
      const result = await fetchWithOfflineFallback("/api/safety/panic", "POST", {
        employeeName: nameForServer,
        employeeId: (user as any)?.employeeId || null,
        siteId: siteId || null,
        siteName: siteName || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        locationAccuracy: coords?.accuracy ?? null,
      }, "panic_alert");

      if (result.queued) {
        toast({
          title: "Saved Offline",
          description: "Your panic alert was queued and will auto-send when connection returns.",
        });
        return;
      }

      if (result.response && !result.response.ok) {
        const text = await result.response.text();
        throw new Error(text || "Failed to send panic alert");
      }

      const alert = result.response ? await result.response.json() : null;
      const alertNumber = (alert as any)?.alert_number || (alert as any)?.alertNumber || null;
      setLastAlertNumber(alertNumber);
      toast({
        title: alertNumber ? `Alert sent — ${alertNumber}` : "Alert sent",
        description: "Supervisors and Trinity are responding. Stay safe.",
      });
    } catch (err) {
      toast({
        title: "Alert failed",
        description: "Could not reach dispatch. Call 911 if you are in immediate danger.",
        variant: "destructive",
      });
    } finally {
      setFiring(false);
      setProgress(0);
      startedAtRef.current = null;
    }
  }, [firing, toast, employeeName, siteId, siteName, user]);

  const startHold = useCallback(() => {
    if (firing) return;
    captureCoords();
    startedAtRef.current = Date.now();
    setProgress(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const started = startedAtRef.current;
      if (!started) return;
      const pct = Math.min(100, ((Date.now() - started) / ARM_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        fire();
      }
    }, 50);
  }, [captureCoords, fire, firing]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (!firing) {
      startedAtRef.current = null;
      setProgress(0);
    }
  }, [firing]);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        data-testid="mobile-panic-button"
        aria-label="Panic / SOS — press and hold 2 seconds to send alert"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        disabled={firing}
        className={cn(
          "relative overflow-hidden select-none touch-none",
          "h-28 w-28 rounded-full border-4 border-red-800 bg-red-600",
          "shadow-lg active:scale-95 transition-transform",
          "flex items-center justify-center",
          firing && "opacity-80 cursor-wait",
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-red-900/60"
          style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
        />
        <div className="relative z-10 flex flex-col items-center text-white">
          {firing ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : progress >= 100 ? (
            <Shield className="h-8 w-8" />
          ) : (
            <AlertTriangle className="h-8 w-8" />
          )}
          <span className="text-sm font-bold tracking-wide">
            {firing ? "SENDING" : progress > 0 ? "HOLD" : "SOS"}
          </span>
        </div>
      </button>
      <p className="text-xs text-center text-muted-foreground max-w-[14rem]">
        Press and hold for 2 seconds to send an emergency alert to your
        supervisor and dispatch.
      </p>
      {lastAlertNumber && (
        <p className="text-xs text-red-700 font-semibold" data-testid="panic-last-alert">
          Last alert: {lastAlertNumber}
        </p>
      )}
    </div>
  );
}

export default PanicButton;
