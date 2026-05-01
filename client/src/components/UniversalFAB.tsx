/**
 * UniversalFAB
 * ============
 * Single unified floating action button for work actions on all screen sizes.
 *
 * One teal Trinity button, bottom-right. Tap to expand speed-dial:
 *   • Clock In/Out  — shift-aware clock action
 *   • View Schedule — navigates to /schedule
 *   • Request Time Off — navigates to /hr/pto
 *   • PANIC / SOS   — emergency alert (on-shift only)
 */

import { secureFetch } from "@/lib/csrf";
import { X, Clock, CalendarDays, CalendarPlus, AlertTriangle, ShieldAlert, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { markCoreActionPerformed } from "@/lib/pushNotifications";
import { useFABPosition } from "@/hooks/useFABPosition";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface QuickActionItemProps {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  onClick: () => void;
  color?: string;
  isLoading?: boolean;
  testId?: string;
}

interface GeofenceWarning {
  outsideGeofence: boolean;
  distanceMeters: number;
  approvalRequired: boolean;
  message: string;
}

function QuickActionItem({ icon: Icon, label, sublabel, onClick, color = "bg-cyan-600", isLoading, testId }: QuickActionItemProps) {
  return (
    <button
      onClick={() => {
        if ("vibrate" in navigator) navigator.vibrate(10);
        onClick();
      }}
      disabled={isLoading}
      className={cn("fab-action-item text-white", color, isLoading && "opacity-50 cursor-not-allowed")}
      data-testid={testId || `fab-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-center w-5 h-5 rounded bg-white/15 flex-shrink-0">
        <Icon className="w-3 h-3" />
      </div>
      <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

export function UniversalFAB() {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { unified: fabPos } = useFABPosition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsModalOpen(document.body.style.overflow === "hidden" || document.body.classList.contains("overflow-hidden"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);

  const [geofenceWarning, setGeofenceWarning] = useState<GeofenceWarning | null>(null);
  const [geofenceTimeEntryId, setGeofenceTimeEntryId] = useState<string | null>(null);
  const [geofenceReason, setGeofenceReason] = useState("");
  const [geofenceSubmitting, setGeofenceSubmitting] = useState(false);
  const [showLateConfirm, setShowLateConfirm] = useState(false);

  type ShiftEligibility = {
    canClockIn: boolean;
    reason: "ok" | "no_shift" | "too_early" | "late" | "owner_exempt";
    shiftStartTime?: string;
    minutesUntil?: number;
    minutesLate?: number;
  };

  const { data: clockStatus, isLoading: isClockStatusLoading } = useQuery<{
    isClockedIn: boolean;
    activeTimeEntry?: { id: string } | null;
    shiftEligibility?: ShiftEligibility;
  }>({
    queryKey: ["/api/time-entries/status"],
    queryFn: async () => {
      const response = await secureFetch("/api/time-entries/status", { credentials: "include" });
      if (!response.ok) return { isClockedIn: false, activeTimeEntry: null };
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const clockMutation = useMutation({
    mutationFn: async (action: "in" | "out") => {
      if (action === "in") {
        const res = await secureFetch("/api/time-entries/clock-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) {
          const err = new Error(data.message || "Failed to clock in");
          (err as any).code = data.error;
          (err as any).data = data;
          throw err;
        }
        return { action, data };
      } else {
        const entryId = clockStatus?.activeTimeEntry?.id;
        if (!entryId) throw new Error("No active time entry");
        const res = await secureFetch(`/api/time-entries/${entryId}/clock-out`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to clock out");
        return { action, data };
      }
    },
    onSuccess: ({ action, data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/entries"] });
      if (action === "out" && data?.geofenceWarning?.outsideGeofence) {
        setGeofenceWarning(data.geofenceWarning);
        setGeofenceTimeEntryId(data.timeEntry?.id || null);
        setIsExpanded(false);
        return;
      }
      toast({
        title: action === "in" ? "Clocked In" : "Clocked Out",
        description: action === "in" ? "You're now on the clock. Have a great shift!" : "You've clocked out. See you next time!",
      });
      setIsExpanded(false);
    },
    onError: (error) => {
      const code = error?.code;
      if (code === "NO_SHIFT_TODAY") {
        toast({
          title: "Not Scheduled Today",
          description: "You're not scheduled to work today. Contact your supervisor for assistance.",
          variant: "destructive",
        });
        return;
      }
      if (code === "TOO_EARLY_TO_CLOCK_IN") {
        const shiftTime = error?.data?.shiftStartTime
          ? new Date(error.data.shiftStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "your scheduled time";
        const minutesUntil = error?.data?.minutesUntil;
        toast({
          title: "Too Early to Clock In",
          description: `Your shift starts at ${shiftTime}${minutesUntil ? ` (${minutesUntil} min away)` : ""}. Please come back then.`,
          variant: "destructive",
        });
        return;
      }
      if (code === "TIER1_ONBOARDING_INCOMPLETE") {
        const count = error?.data?.pendingCount;
        toast({
          title: "Onboarding Incomplete",
          description: `You have ${count ?? "required"} onboarding task${count !== 1 ? "s" : ""} to complete before clocking in. Visit your onboarding checklist.`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Error", description: error?.message || "Failed to update clock status.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (typeof window !== "undefined" && "visualViewport" in window && window.visualViewport) {
      const vv = window.visualViewport!;
      const handleViewportChange = () => {
        const heightDiff = window.innerHeight - vv.height;
        setKeyboardVisible(heightDiff > 150);
      };
      vv.addEventListener("resize", handleViewportChange);
      return () => vv.removeEventListener("resize", handleViewportChange);
    }
  }, []);

  useEffect(() => { setIsExpanded(false); }, [location]);

  if (!user) return null;
  if (isModalOpen) return null;
  if (keyboardVisible && !isExpanded) return null;

  const isChatRoute =
    location === "/chatrooms" ||
    location.startsWith("/chatrooms/") ||
    location === "/chat" ||
    location.startsWith("/chat/");
  if (isChatRoute) return null;

  const isClockedIn = clockStatus?.isClockedIn ?? false;
  const eligibility = clockStatus?.shiftEligibility;

  const handleClockToggle = () => {
    markCoreActionPerformed();
    if (isClockedIn) { clockMutation.mutate("out"); return; }
    if (eligibility && !eligibility.canClockIn) {
      if (eligibility.reason === "no_shift") {
        toast({ title: "No Shift Today", description: "You are not scheduled to work today.", variant: "destructive" } as any);
      } else if (eligibility.reason === "too_early") {
        const shiftTime = eligibility.shiftStartTime
          ? new Date(eligibility.shiftStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "your scheduled time";
        toast({ title: "Not Yet Time", description: `Your shift starts at ${shiftTime}.`, variant: "destructive" });
      }
      return;
    }
    if (eligibility?.reason === "late") { setShowLateConfirm(true); return; }
    clockMutation.mutate("in");
  };

  const handleGeofenceSubmit = async () => {
    if (!geofenceTimeEntryId || !geofenceReason.trim()) return;
    setGeofenceSubmitting(true);
    try {
      // Readiness Section 9 bug #1 — officer-facing submit endpoint.
      // The old PATCH was manager-role-gated and silently 403'd.
      await apiRequest("POST", `/api/time-entries/geofence-override/${geofenceTimeEntryId}/submit`, { reason: geofenceReason.trim() });
      toast({ title: "Request Submitted", description: "Your location explanation has been sent to your supervisor for approval." });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
    } catch {
      toast({ title: "Submission Failed", description: "Could not submit your explanation. Please contact your supervisor directly.", variant: "destructive" });
    } finally {
      // Always clear modal state — success or failure. User can retry by
      // clocking again if needed; trapping them in the modal is worse UX.
      setGeofenceSubmitting(false);
      setGeofenceWarning(null);
      setGeofenceReason("");
      setGeofenceTimeEntryId(null);
    }
  };

  const clockAction = (() => {
    if (isClockedIn) return { label: "Clock Out", color: "bg-orange-600", testId: "fab-action-clock-toggle" };
    if (!eligibility || isClockStatusLoading) return { label: isClockStatusLoading ? "Checking..." : "Clock In", color: "bg-emerald-600", testId: "fab-action-clock-toggle" };
    if (!eligibility.canClockIn) {
      const isNoShift = eligibility.reason === "no_shift";
      return { label: isNoShift ? "Not Scheduled" : "Shift Not Started", color: "bg-zinc-600", testId: "fab-action-clock-blocked" };
    }
    if (eligibility.reason === "late") return { label: "Clock In Late", color: "bg-amber-600", testId: "fab-action-clock-late" };
    return { label: "Clock In", color: "bg-emerald-600", testId: "fab-action-clock-toggle" };
  })();

  return (
    <>
      {/* Geofence Warning Modal */}
      <Dialog open={!!geofenceWarning} onOpenChange={(open) => { if (!open) { setGeofenceWarning(null); setGeofenceReason(""); } }}>
        <DialogContent data-testid="dialog-geofence-warning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Outside Site Geofence
            </DialogTitle>
            <DialogDescription>
              {geofenceWarning?.message || "You clocked out outside the allowed site boundary. A supervisor must approve your time entry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Please explain why you clocked out from this location:</p>
            <Textarea
              value={geofenceReason}
              onChange={(e) => setGeofenceReason(e.target.value)}
              placeholder="e.g. I was asked to wait at the parking lot exit for client escort..."
              rows={3}
              data-testid="input-geofence-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGeofenceWarning(null); setGeofenceReason(""); }} data-testid="button-geofence-dismiss">Dismiss</Button>
            <Button onClick={handleGeofenceSubmit} disabled={!geofenceReason.trim() || geofenceSubmitting} data-testid="button-geofence-submit">
              {geofenceSubmitting ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Late Clock-In Confirmation Dialog */}
      <Dialog open={showLateConfirm} onOpenChange={(open) => { if (!open) setShowLateConfirm(false); }}>
        <DialogContent data-testid="dialog-late-clockin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Late Clock-In — Approval Required
            </DialogTitle>
            <DialogDescription>
              You are {eligibility?.minutesLate ?? 0} minute{(eligibility?.minutesLate ?? 0) !== 1 ? "s" : ""} late. Clocking in now requires manager approval.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Your manager will be notified immediately and must approve this entry.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLateConfirm(false)} data-testid="button-late-cancel">Cancel</Button>
            <Button
              onClick={() => { setShowLateConfirm(false); clockMutation.mutate("in"); }}
              disabled={clockMutation.isPending}
              className="bg-amber-600 text-white"
              data-testid="button-late-confirm"
            >
              {clockMutation.isPending ? "Clocking In..." : "Clock In (Pending Approval)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unified FAB ── */}
      <div
        className="fixed z-[60]"
        style={{
          right: fabPos.right,
          bottom: fabPos.bottom,
          transition: "bottom 0.35s cubic-bezier(0.4,0,0.2,1), right 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
        data-testid="universal-fab"
      >
        {isExpanded && (
          <>
            <div
              className="fixed inset-0 bg-black/30 fab-backdrop z-30"
              onClick={() => setIsExpanded(false)}
              data-testid="fab-backdrop"
            />
            <div className="absolute bottom-[64px] right-0 flex flex-col items-end gap-2 z-40 fab-menu-enter">

              {/* Clock In/Out */}
              <QuickActionItem
                icon={Clock}
                label={clockAction.label}
                onClick={handleClockToggle}
                color={clockAction.color}
                isLoading={clockMutation.isPending || isClockStatusLoading}
                testId={clockAction.testId}
              />

              {/* View Schedule */}
              <QuickActionItem
                icon={CalendarDays}
                label="View Schedule"
                sublabel="See upcoming shifts"
                onClick={() => { setIsExpanded(false); setLocation("/schedule"); }}
                color="bg-blue-600"
                testId="fab-action-view-schedule"
              />

              {/* Request Time Off */}
              <QuickActionItem
                icon={CalendarPlus}
                label="Request Time Off"
                sublabel="Submit PTO request"
                onClick={() => { setIsExpanded(false); setLocation("/hr/pto"); }}
                color="bg-violet-600"
                testId="fab-action-pto"
              />

              {/* Panic / SOS — always available to on-shift workers */}
              {isClockedIn && (
                <QuickActionItem
                  icon={ShieldAlert}
                  label="PANIC / SOS"
                  sublabel="Emergency alert"
                  onClick={() => { setIsExpanded(false); setLocation("/worker/panic"); }}
                  color="bg-red-600"
                  testId="fab-action-panic"
                />
              )}
            </div>
          </>
        )}

        {/* Main FAB button */}
        <div className="relative">
          <button
            onClick={() => {
              if ("vibrate" in navigator) navigator.vibrate(10);
              setIsExpanded((p) => !p);
            }}
            className="flex items-center justify-center rounded-md transition-all duration-200 ease-out"
            style={{
              width: "var(--fab-size, 56px)",
              height: "var(--fab-size, 56px)",
              background: isExpanded
                ? "hsl(var(--muted))"
                : "linear-gradient(135deg, #059669 0%, #2563EB 100%)",
              boxShadow: isExpanded ? undefined : "0 4px 20px rgba(13,148,136,0.35)",
            }}
            data-testid="fab-toggle"
            aria-label={isExpanded ? "Close quick actions" : "Open quick actions"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <X style={{ width: "var(--fab-icon, 22px)", height: "var(--fab-icon, 22px)" }} className="text-foreground" strokeWidth={2.5} />
            ) : (
              <Clock style={{ width: isMobile ? 28 : 26, height: isMobile ? 28 : 26 }} className="text-white" strokeWidth={2.2} />
            )}
          </button>

        </div>
      </div>
    </>
  );
}
