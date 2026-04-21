/**
 * Worker Dashboard — Homebase-style command center for security guards and field workers
 *
 * Features:
 * - Greeting hero banner with shift status
 * - Live earnings widget with counter animation and progress bar
 * - Quick action strip (horizontal scroll on mobile)
 * - Today's schedule + upcoming shifts
 * - Activity feed from notifications
 * - Desktop: 2-column command center layout
 */

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { markCoreActionPerformed, markCoreActionAndAutoSubscribe } from "@/lib/pushNotifications";
import { PendingOfferBanner } from "@/components/mobile/PendingOfferBanner";
import { requestWakeLock, releaseWakeLock, setupWakeLockReacquire } from "@/lib/wakeLock";
import { format, differenceInMinutes, isToday, isTomorrow } from "date-fns";
import {
  Clock,
  MapPin,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Wifi,
  WifiOff,
  Building2,
  DollarSign,
  TrendingUp,
  FileText,
  ClipboardList,
  Bell,
  User,
  Activity,
  LogIn,
  LogOut,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub/CanvasHubRegistry";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { fetchWithOfflineFallback } from "@/lib/offlineQueue";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftEligibility {
  canClockIn: boolean;
  reason: 'ok' | 'no_shift' | 'too_early' | 'late' | 'owner_exempt';
  shiftStartTime?: string;
  minutesUntil?: number;
  minutesLate?: number;
}

interface ClockStatus {
  isClockedIn: boolean;
  clockInTime?: string;
  currentSiteId?: number;
  currentSiteName?: string;
  totalHoursToday: number;
  shiftEligibility?: ShiftEligibility;
}

interface TodayShift {
  id: number;
  siteName: string;
  siteAddress: string;
  startTime: string;
  endTime: string;
  status: "upcoming" | "active" | "completed";
}

interface UpcomingShift {
  id: number;
  date: string;
  siteName: string;
  startTime: string;
  endTime: string;
}

interface EarningsSummary {
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  hoursWorked: number;
  scheduledHours: number;
  hourlyRate: number;
  earnings: number;
  projectedEarnings: number;
}

interface Notification {
  id: number | string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  read: boolean;
}

interface PendingHandoff {
  id: string;
}

interface AuthUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profileImageUrl?: string;
  workspaceName?: string;
  workspaceRole?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useGreeting(name: string) {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${timeGreeting}, ${name || "there"}`;
}

function useCountUp(target: number, duration: number = 800, enabled: boolean = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased * 100) / 100);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}

function useProgressBar(target: number, delay: number = 200) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(target, 100)), delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return width;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShimmerCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-md overflow-hidden", className)}
      style={{ background: "linear-gradient(90deg, var(--color-bg-secondary) 25%, var(--color-bg-tertiary) 50%, var(--color-bg-secondary) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }}
    />
  );
}

function EarningsCard({ earnings, isLoading }: { earnings: EarningsSummary | undefined; isLoading: boolean }) {
  const rawEarnings = earnings?.earnings ?? 0;
  const rawHours = earnings?.hoursWorked ?? 0;
  const scheduledHours = earnings?.scheduledHours ?? 0;
  const projectedEarnings = earnings?.projectedEarnings ?? 0;
  const progressPct = scheduledHours > 0 ? (rawHours / scheduledHours) * 100 : 0;

  const displayEarnings = useCountUp(rawEarnings, 900, !isLoading);
  const progressWidth = useProgressBar(progressPct, 400);

  const payPeriodLabel = (() => {
    if (!earnings?.payPeriodStart || !earnings?.payPeriodEnd) return "Pay Period";
    const start = format(new Date(earnings.payPeriodStart), "MMM d");
    const end = format(new Date(earnings.payPeriodEnd), "MMM d");
    return `${start} – ${end}`;
  })();

  return (
    <Card className="border-0 overflow-hidden" style={{ background: "var(--color-bg-secondary)" }}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--color-nav-badge-bg)" }}>
              <DollarSign className="w-4 h-4" style={{ color: "var(--color-brand-primary)" }} />
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Earnings</div>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{payPeriodLabel}</div>
            </div>
          </div>
          {earnings?.hourlyRate ? (
            <Badge variant="secondary" className="text-xs">
              ${earnings.hourlyRate.toFixed(2)}/hr
            </Badge>
          ) : null}
        </div>

        {/* Main earnings number */}
        {isLoading ? (
          <ShimmerCard className="h-10 w-36 mb-3" />
        ) : (
          <div className="mb-3">
            <span className="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }} data-testid="text-earnings-amount">
              ${displayEarnings.toFixed(2)}
            </span>
            <span className="text-sm ml-2" style={{ color: "var(--color-text-secondary)" }}>earned</span>
          </div>
        )}

        {/* Hours row */}
        {isLoading ? (
          <ShimmerCard className="h-4 w-48 mb-3" />
        ) : (
          <div className="flex items-center gap-3 mb-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <span data-testid="text-hours-worked">
              <span style={{ color: "var(--color-text-primary)" }} className="font-medium">{rawHours.toFixed(1)}</span> hrs worked
            </span>
            {scheduledHours > 0 && (
              <>
                <span style={{ color: "var(--color-bg-tertiary)" }}>·</span>
                <span>{scheduledHours.toFixed(1)} scheduled</span>
              </>
            )}
          </div>
        )}

        {/* Progress bar */}
        {scheduledHours > 0 && (
          <div className="mb-3">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-tertiary)" }}>
              <div
                className="h-full rounded-full transition-all ease-out"
                style={{ width: `${progressWidth}%`, background: "linear-gradient(90deg, var(--color-brand-primary), var(--color-success))", transitionDuration: "600ms" }}
                data-testid="progress-earnings"
              />
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              <span>{progressPct.toFixed(0)}% of pay period</span>
              {projectedEarnings > 0 && <span>Projected: ${projectedEarnings.toFixed(2)}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShiftStatusCard({ todayShifts, clockStatus, isLoading }: { todayShifts: TodayShift[] | undefined; clockStatus: ClockStatus | undefined; isLoading: boolean }) {
  const activeShift = todayShifts?.find(s => s.status === "active");
  const nextShift = todayShifts?.find(s => s.status === "upcoming");
  const displayShift = activeShift || nextShift;

  return (
    <Card className="border-0 overflow-hidden" style={{ background: "var(--color-bg-secondary)" }}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)" }}>
            <Shield className="w-4 h-4" style={{ color: "var(--color-success)" }} />
          </div>
          <div className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Shift Status</div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <ShimmerCard className="h-5 w-28" />
            <ShimmerCard className="h-4 w-40" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: clockStatus?.isClockedIn ? "var(--color-success)" : "var(--color-text-secondary)" }}
              />
              <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }} data-testid="text-shift-status">
                {clockStatus?.isClockedIn ? "ON SHIFT" : "OFF SHIFT"}
              </span>
            </div>

            {clockStatus?.isClockedIn && clockStatus.currentSiteName && (
              <div className="flex items-center gap-1 text-xs mb-2" style={{ color: "var(--color-brand-primary)" }}>
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{clockStatus.currentSiteName}</span>
              </div>
            )}

            {clockStatus?.isClockedIn && clockStatus.clockInTime && (
              <div className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>
                Since {format(new Date(clockStatus.clockInTime), "h:mm a")}
                {clockStatus.totalHoursToday > 0 && (
                  <span className="ml-2" style={{ color: "var(--color-text-primary)" }}>
                    ({clockStatus.totalHoursToday.toFixed(1)}h)
                  </span>
                )}
              </div>
            )}

            {displayShift && !clockStatus?.isClockedIn && (
              <div className="mt-1">
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {activeShift ? "Current" : "Next"}:
                </div>
                <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {displayShift.siteName}
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {format(new Date(displayShift.startTime), "h:mm a")} – {format(new Date(displayShift.endTime), "h:mm a")}
                </div>
              </div>
            )}

            {!displayShift && !clockStatus?.isClockedIn && (
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No shifts today</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionStrip({ isClockedIn, onClockAction, clockingIn, navigate, onPhotoCapture, eligibility }: {
  isClockedIn: boolean;
  onClockAction: () => void;
  clockingIn: boolean;
  navigate: (path: string) => void;
  onPhotoCapture: () => void;
  eligibility?: ShiftEligibility;
}) {
  const clockIcon = isClockedIn ? LogOut : LogIn;
  const isBlocked = !isClockedIn && eligibility && !eligibility.canClockIn;
  const isLate = !isClockedIn && eligibility?.reason === 'late';

  const clockLabel = isClockedIn
    ? "Clock Out"
    : isBlocked
      ? eligibility?.reason === 'no_shift' ? "Not Scheduled" : "Not Yet"
      : isLate
        ? "Clock In Late"
        : "Clock In";

  const actions = [
    {
      icon: clockIcon,
      label: clockLabel,
      onClick: onClockAction,
      primary: !isBlocked,
      blocked: isBlocked,
      late: isLate,
      testId: "button-quick-clock",
      loading: clockingIn,
    },
    {
      icon: Calendar,
      label: "Schedule",
      onClick: () => navigate("/schedule"),
      primary: false,
      testId: "button-quick-schedule",
    },
    {
      icon: FileText,
      label: "Timesheets",
      onClick: () => navigate("/time-tracking"),
      primary: false,
      testId: "button-quick-timesheets",
    },
    {
      icon: AlertTriangle,
      label: "Report Issue",
      onClick: () => navigate("/worker/incidents"),
      primary: false,
      testId: "button-quick-incident",
    },
    {
      icon: Camera,
      label: "Site Photo",
      onClick: onPhotoCapture,
      primary: false,
      testId: "button-quick-photo",
    },
    {
      icon: FileText,
      label: "DAR",
      onClick: () => navigate("/field-reports"),
      primary: false,
      testId: "button-quick-dar",
    },
    {
      icon: ClipboardList,
      label: "Post Orders",
      onClick: () => navigate("/post-orders"),
      primary: false,
      testId: "button-quick-post-orders",
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
      {actions.map((action: any) => (
        <button
          key={action.testId}
          onClick={action.onClick}
          disabled={action.loading}
          data-testid={action.testId}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-md flex-shrink-0 transition-all active:scale-95",
            "w-20 h-20 text-xs font-medium"
          )}
          style={{
            background: action.blocked
              ? "var(--color-bg-tertiary)"
              : action.late
                ? "linear-gradient(135deg, color-mix(in srgb, var(--color-warning) 12%, transparent), color-mix(in srgb, var(--color-warning) 21%, transparent))"
                : action.primary
                  ? "linear-gradient(135deg, color-mix(in srgb, var(--color-brand-primary) 12%, transparent), color-mix(in srgb, var(--color-brand-primary) 21%, transparent))"
                  : "var(--color-bg-secondary)",
            border: action.blocked
              ? "1px solid var(--color-border-default)"
              : action.late
                ? "1px solid color-mix(in srgb, var(--color-warning) 31%, transparent)"
                : action.primary
                  ? "1px solid color-mix(in srgb, var(--color-brand-primary) 25%, transparent)"
                  : "1px solid var(--color-border-subtle)",
            color: action.blocked
              ? "var(--color-text-disabled)"
              : action.late
                ? "var(--color-warning)"
                : action.primary
                  ? "var(--color-brand-primary)"
                  : "var(--color-text-secondary)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <action.icon
            className={cn("w-5 h-5 shrink-0", action.loading && "animate-spin")}
            style={{ color: action.blocked ? "var(--color-text-disabled)" : action.late ? "var(--color-warning)" : action.primary ? "var(--color-brand-primary)" : "var(--color-text-secondary)" }}
          />
          <span className="text-center leading-tight whitespace-nowrap">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function ActivityFeedItem({ item }: { item: Notification }) {
  const timeLabel = (() => {
    const d = new Date(item.createdAt);
    if (isToday(d)) return format(d, "h:mm a");
    if (isTomorrow(d)) return "Yesterday";
    return format(d, "MMM d");
  })();

  const icon = (() => {
    switch (item.type) {
      case "shift": return Calendar;
      case "time": case "clock": return Clock;
      case "alert": case "warning": return AlertTriangle;
      case "approval": return CheckCircle2;
      default: return Bell;
    }
  })();

  const IconComponent = icon;

  return (
    <div
      className="flex items-start gap-3 py-2.5"
      data-testid={`activity-item-${item.id}`}
      style={{ borderBottom: "1px solid var(--color-bg-tertiary)" }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: "var(--color-bg-tertiary)" }}
      >
        <IconComponent className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{item.title}</div>
        {item.message && (
          <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{item.message}</div>
        )}
      </div>
      <div className="text-xs flex-shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{timeLabel}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkerDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [clockingIn, setClockingIn] = useState(false);
  const [showLateConfirm, setShowLateConfirm] = useState(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Queries
  const { data: authUser } = useQuery<AuthUser>({ queryKey: ["/api/auth/me"] });
  const { data: clockStatus, isLoading: clockLoading } = useQuery<ClockStatus>({
    queryKey: ["/api/time-entries/status"],
    refetchInterval: 30000,
  });
  const { data: todayShifts, isLoading: shiftsLoading } = useQuery<TodayShift[]>({
    queryKey: ["/api/shifts/today"],
  });
  const { data: upcomingShifts } = useQuery<UpcomingShift[]>({
    queryKey: ["/api/shifts/upcoming"],
  });
  const { data: earnings, isLoading: earningsLoading } = useQuery<EarningsSummary>({
    queryKey: ["/api/dashboard/worker-earnings"],
  });
  const { data: notificationsData } = useQuery<{ notifications?: Notification[]; items?: Notification[] } | Notification[]>({
    queryKey: ["/api/notifications"],
  });
  const { data: pendingHandoff } = useQuery<PendingHandoff | null>({
    queryKey: ["/api/shift-handoff/pending"],
    queryFn: () => apiRequest("GET", "/api/shift-handoff/pending").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const notifications: Notification[] = Array.isArray(notificationsData)
    ? notificationsData
    : (notificationsData as any)?.notifications || (notificationsData as any)?.items || [];

  // Clock mutation
  const clockMutation = useMutation({
    mutationFn: async (action: "in" | "out") => {
      setClockingIn(true);
      let location = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          });
          location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
        } catch (_) {}
      }
      const url = `/api/time-entries/${action === "in" ? "clock-in" : "clock-out"}`;
      const idempotencyKey = action === "in" ? crypto.randomUUID() : undefined;
      const body = { timestamp: new Date().toISOString(), location, idempotencyKey };
      const type = action === "in" ? ("clock-in" as const) : ("clock-out" as const);
      const result = await fetchWithOfflineFallback(url, "POST", body, type);
      if (result.queued) return { queued: true, action };
      if (result.response && !result.response.ok) {
        const text = await result.response.text();
        throw new Error(text || "Failed to clock in/out");
      }
      return { queued: false, action };
    },
    onSuccess: (result: any, action) => {
      if (result?.queued) {
        toast({
          title: "Saved Offline",
          description: `Your ${action === "in" ? "clock-in" : "clock-out"} has been queued and will sync when back online.`,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/worker-earnings"] });
        toast({
          title: action === "in" ? "Clocked In" : "Clocked Out",
          description: `Successfully ${action === "in" ? "clocked in" : "clocked out"} at ${format(new Date(), "h:mm a")}`,
        });
      }
      if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to clock in/out", variant: "destructive" });
    },
    onSettled: () => setClockingIn(false),
  });

  // Wake lock
  const wakeLockCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (clockStatus?.isClockedIn) {
      requestWakeLock();
      wakeLockCleanupRef.current = setupWakeLockReacquire();
    } else {
      releaseWakeLock();
      wakeLockCleanupRef.current?.();
      wakeLockCleanupRef.current = null;
    }
    return () => {
      releaseWakeLock();
      wakeLockCleanupRef.current?.();
    };
  }, [clockStatus?.isClockedIn]);

  const handleClockAction = useCallback(() => {
    // Readiness Section 4 — auto-subscribe to push on first clock-in so the
    // officer receives shift alerts + duress responses from day one, instead
    // of waiting for the 7-day engagement window.
    markCoreActionAndAutoSubscribe();
    if (clockStatus?.isClockedIn) {
      clockMutation.mutate("out");
      return;
    }
    const eligibility = clockStatus?.shiftEligibility;
    if (eligibility && !eligibility.canClockIn) {
      if (eligibility.reason === 'no_shift') {
        toast({ title: "No Shift Today", description: "You are not scheduled to work today. Contact your manager or ask Trinity.", variant: "destructive" });
      } else if (eligibility.reason === 'too_early') {
        const shiftTime = eligibility.shiftStartTime
          ? new Date(eligibility.shiftStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'your scheduled time';
        toast({ title: "Shift Has Not Started", description: `Your shift starts at ${shiftTime}. You cannot clock in until then.`, variant: "destructive" });
      }
      return;
    }
    if (eligibility?.reason === 'late') {
      setShowLateConfirm(true);
      return;
    }
    clockMutation.mutate("in");
  }, [clockStatus?.isClockedIn, clockStatus?.shiftEligibility, clockMutation, toast]);

  // Derived state
  const firstName = authUser?.firstName || authUser?.email?.split("@")[0] || "";
  const greeting = useGreeting(firstName);
  const orgName = authUser?.workspaceName || "";
  const roleLabel = authUser?.workspaceRole
    ? authUser.workspaceRole.charAt(0).toUpperCase() + authUser.workspaceRole.slice(1)
    : "Employee";
  const currentDate = format(new Date(), "EEEE, MMMM d");
  const nextShift = todayShifts?.find(s => s.status === "upcoming") || upcomingShifts?.[0];
  const activeShiftId = todayShifts?.find(s => s.status === "active")?.id;

  const handlePhotoCapture = useCallback(async (file: File) => {
    if (!activeShiftId) {
      toast({
        title: "No active shift",
        description: "Clock in to submit proof photos.",
      });
      return;
    }

    try {
      const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(position.coords),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 5000 },
        );
      });

      const uploadFormData = new FormData();
      uploadFormData.append("files", file);
      if (coords) {
        uploadFormData.append("gpsLat", String(coords.latitude));
        uploadFormData.append("gpsLng", String(coords.longitude));
        uploadFormData.append("gpsAccuracy", String(coords.accuracy));
      }

      const uploadResponse = await fetch("/api/chat/upload", {
        method: "POST",
        credentials: "include",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Photo upload failed");
      }

      const uploadPayload = await uploadResponse.json();
      const photoUrl = uploadPayload?.uploads?.[0]?.url;
      if (!photoUrl) {
        throw new Error("Missing uploaded photo URL");
      }

      await apiRequest("POST", `/api/shifts/${activeShiftId}/proof-of-service`, {
        photoUrl,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        capturedAt: new Date().toISOString(),
      });

      toast({
        title: "Photo submitted",
        description: "Proof of service recorded.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not submit proof photo.";
      toast({
        title: "Photo submission failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [activeShiftId, toast]);

  const handleQuickPhotoClick = useCallback(() => {
    photoInputRef.current?.click();
  }, []);

  const handleQuickPhotoFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handlePhotoCapture(file);
    event.target.value = "";
  }, [handlePhotoCapture]);

  // Page config
  const pageConfig: CanvasPageConfig = {
    id: "worker-dashboard",
    title: "Dashboard",
    subtitle: currentDate,
    category: "dashboard",
    showHeader: false,
    enablePullToRefresh: true,
    onRefresh: () => queryClient.invalidateQueries(),
    withBottomNav: true,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Inline shimmer keyframe */}
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>

      <div style={{ background: "var(--color-bg-primary)", minHeight: "100%" }}>

        {/* ── Status Bar ────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2 gap-2"
          style={{ borderBottom: "1px solid var(--color-bg-tertiary)" }}
        >
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5" style={{ color: "var(--color-success)" }} />
            ) : (
              <WifiOff className="w-3.5 h-3.5" style={{ color: "var(--color-danger)" }} />
            )}
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {isOnline ? "Online" : "Offline Mode"}
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{currentDate}</span>
        </div>

        {/* ── Main Scroll Area ───────────────────────── */}
        <div className="px-4 py-4 space-y-4 max-w-5xl mx-auto">

          {/* Readiness Section 27 #1 — panic-link shortcut, always visible
              while the officer is clocked-in. Red strip. Impossible to miss. */}
          {clockStatus?.isClockedIn && (
            <button
              type="button"
              onClick={() => setLocation("/worker/panic")}
              className="w-full rounded-md border-2 border-red-700 bg-red-600 hover:bg-red-700 text-white px-4 py-3 font-semibold text-sm flex items-center justify-between gap-3 shadow"
              data-testid="worker-dashboard-panic-link"
              aria-label="Go to panic / SOS page"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Emergency SOS — tap for panic page
              </span>
              <span className="text-xs uppercase tracking-wider opacity-80">Press & hold to send</span>
            </button>
          )}

          {/* Readiness Section 15 — pending shift offers (visible only when ≥1) */}
          <PendingOfferBanner />

          {pendingHandoff?.id && (
            <Card className="border-amber-500/50 bg-amber-950/20 mb-1">
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-400">Handoff Pending</p>
                  <p className="text-xs text-muted-foreground">
                    Review notes from the outgoing officer
                  </p>
                </div>
                <Button size="sm" onClick={() => setLocation(`/shift-handoff/${pendingHandoff.id}`)}>
                  Review
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Readiness Section 27 #4 — Guard tour check-in link (only while on shift) */}
          {clockStatus?.isClockedIn && (
            <button
              type="button"
              onClick={() => setLocation("/worker/guard-tour/scan")}
              className="w-full rounded-md border px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-2 hover:bg-muted/50"
              data-testid="worker-dashboard-guard-tour-link"
              aria-label="Open guard tour scanner"
            >
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Guard Tour — scan next checkpoint
              </span>
              <span className="text-xs text-muted-foreground">Open scanner →</span>
            </button>
          )}

          {/* ── Block 1: Greeting Hero Banner ─────────── */}
          <div
            className="rounded-md p-5 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-overlay) 50%, var(--color-bg-secondary) 100%)", border: "1px solid var(--color-border-subtle)" }}
            data-testid="section-greeting-hero"
          >
            {/* Subtle glow */}
            <div
              className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-brand-primary) 8%, transparent) 0%, transparent 70%)", transform: "translate(20%, -20%)" }}
            />

            <div className="flex items-start gap-3 relative">
              <Avatar className="w-12 h-12 border-2" style={{ borderColor: "color-mix(in srgb, var(--color-brand-primary) 25%, transparent)" }}>
                <AvatarImage src={authUser?.profileImageUrl} alt={authUser?.firstName || "User"} />
                <AvatarFallback style={{ background: "var(--color-bg-tertiary)", color: "var(--color-brand-primary)" }}>
                  {firstName ? firstName[0].toUpperCase() : <User className="w-5 h-5" />}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold leading-tight" style={{ color: "var(--color-text-primary)" }} data-testid="text-greeting">
                  {greeting}
                </h1>
                {orgName && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{orgName}</div>
                )}
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{roleLabel}</div>
              </div>
            </div>

            {/* Shift status line */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: clockStatus?.isClockedIn ? "color-mix(in srgb, var(--color-success) 15%, transparent)" : "color-mix(in srgb, var(--color-text-secondary) 10%, transparent)",
                  border: clockStatus?.isClockedIn ? "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)" : "1px solid color-mix(in srgb, var(--color-text-secondary) 20%, transparent)",
                  color: clockStatus?.isClockedIn ? "var(--color-success)" : "var(--color-text-secondary)",
                }}
                data-testid="badge-shift-status"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: clockStatus?.isClockedIn ? "var(--color-success)" : "var(--color-text-secondary)" }}
                />
                {clockStatus?.isClockedIn ? "ON SHIFT" : "OFF SHIFT"}
              </div>

              {nextShift && !clockStatus?.isClockedIn && (
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  Next: <span style={{ color: "var(--color-text-primary)" }}>
                    {isToday(new Date(nextShift.startTime))
                      ? `Today @ ${format(new Date(nextShift.startTime), "h:mm a")}`
                      : isTomorrow(new Date(nextShift.startTime))
                        ? `Tomorrow @ ${format(new Date(nextShift.startTime), "h:mm a")}`
                        : format(new Date(nextShift.startTime), "EEE, MMM d @ h:mm a")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Block 2: Earnings + Shift Status (responsive side-by-side on desktop) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EarningsCard earnings={earnings} isLoading={earningsLoading} />
            <ShiftStatusCard todayShifts={todayShifts} clockStatus={clockStatus} isLoading={clockLoading || shiftsLoading} />
          </div>

          {/* ── Block 3: Quick Action Strip ───────────── */}
          <div data-testid="section-quick-actions">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-secondary)" }}>
              Quick Actions
            </h2>
            <QuickActionStrip
              isClockedIn={!!clockStatus?.isClockedIn}
              onClockAction={handleClockAction}
              clockingIn={clockingIn}
              navigate={setLocation}
              onPhotoCapture={handleQuickPhotoClick}
              eligibility={clockStatus?.shiftEligibility}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleQuickPhotoFileSelect}
              className="hidden"
              data-testid="input-quick-photo-upload"
            />
          </div>

          {/* ── Block 4: Today's Schedule ─────────────── */}
          <div data-testid="section-today-schedule">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
                Today's Schedule
              </h2>
              <button
                onClick={() => setLocation("/schedule")}
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--color-brand-primary)" }}
                data-testid="button-view-schedule"
              >
                View All <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {shiftsLoading ? (
              <div className="space-y-2">
                <ShimmerCard className="h-16 w-full" />
                <ShimmerCard className="h-16 w-full" />
              </div>
            ) : todayShifts && todayShifts.length > 0 ? (
              <div className="space-y-2">
                {todayShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="rounded-md p-3"
                    data-testid={`shift-card-${shift.id}`}
                    style={{
                      background: shift.status === "active"
                        ? "color-mix(in srgb, var(--color-brand-primary) 8%, transparent)"
                        : shift.status === "completed"
                          ? "color-mix(in srgb, var(--color-success) 8%, transparent)"
                          : "var(--color-bg-secondary)",
                      border: shift.status === "active"
                        ? "1px solid color-mix(in srgb, var(--color-brand-primary) 25%, transparent)"
                        : shift.status === "completed"
                          ? "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)"
                          : "1px solid var(--color-bg-tertiary)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{shift.siteName}</div>
                        <div className="text-xs flex items-center gap-1 mt-1" style={{ color: "var(--color-text-secondary)" }}>
                          <Clock className="w-3 h-3 shrink-0" />
                          {format(new Date(shift.startTime), "h:mm a")} – {format(new Date(shift.endTime), "h:mm a")}
                        </div>
                        {shift.siteAddress && (
                          <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{shift.siteAddress}</span>
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="flex-shrink-0 text-xs"
                        style={{
                          background: shift.status === "active"
                            ? "var(--color-nav-badge-bg)"
                            : shift.status === "completed"
                              ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                              : "color-mix(in srgb, var(--color-text-secondary) 15%, transparent)",
                          color: shift.status === "active"
                            ? "var(--color-brand-primary)"
                            : shift.status === "completed"
                              ? "var(--color-success)"
                              : "var(--color-text-secondary)",
                          border: "none",
                        }}
                      >
                        {shift.status === "active" ? "Active" : shift.status === "completed" ? "Done" : "Upcoming"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-md p-6 text-center"
                style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-bg-tertiary)" }}
              >
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--color-text-secondary)" }} />
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No shifts scheduled today</p>
              </div>
            )}
          </div>

          {/* ── Block 5: Upcoming Shifts ──────────────── */}
          {upcomingShifts && upcomingShifts.length > 0 && (
            <div data-testid="section-upcoming-shifts">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-secondary)" }}>
                Coming Up
              </h2>
              <div
                className="rounded-md overflow-hidden"
                style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-bg-tertiary)" }}
              >
                {upcomingShifts.slice(0, 4).map((shift, idx) => (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                    data-testid={`upcoming-shift-${shift.id}`}
                    style={{
                      borderBottom: idx < Math.min(upcomingShifts.length, 4) - 1 ? "1px solid var(--color-bg-tertiary)" : "none",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{shift.siteName}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {isTomorrow(new Date(shift.startTime))
                          ? "Tomorrow"
                          : format(new Date(shift.startTime), "EEE, MMM d")}
                        {" · "}
                        {format(new Date(shift.startTime), "h:mm a")}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-text-secondary)" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Block 6: Activity Feed ────────────────── */}
          <div data-testid="section-activity-feed">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-secondary)" }}>
              Recent Activity
            </h2>
            {notifications.length > 0 ? (
              <div
                className="rounded-md px-4"
                style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-bg-tertiary)" }}
              >
                {notifications.slice(0, 8).map((item) => (
                  <ActivityFeedItem key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div
                className="rounded-md p-6 text-center"
                style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-bg-tertiary)" }}
              >
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--color-text-secondary)" }} />
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No recent activity</p>
              </div>
            )}
          </div>

          {/* Bottom padding for nav bar */}
          <div className="h-[calc(5rem+env(safe-area-inset-bottom,0px))]" />
        </div>
      </div>

      {/* Late Clock-In Confirmation Dialog */}
      <Dialog open={showLateConfirm} onOpenChange={(open) => { if (!open) setShowLateConfirm(false); }}>
        <DialogContent data-testid="dialog-late-clockin-dash">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Late Clock-In — Approval Required
            </DialogTitle>
            <DialogDescription>
              You are {clockStatus?.shiftEligibility?.minutesLate ?? 0} minute{(clockStatus?.shiftEligibility?.minutesLate ?? 0) !== 1 ? 's' : ''} late for your shift. Your manager will be notified and must approve this entry before it counts toward your pay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLateConfirm(false)} data-testid="button-late-cancel-dash">
              Cancel
            </Button>
            <Button
              onClick={() => { setShowLateConfirm(false); clockMutation.mutate("in"); }}
              disabled={clockingIn}
              data-testid="button-late-confirm-dash"
              className="bg-warning text-white border-0"
            >
              {clockingIn ? 'Clocking In...' : 'Clock In (Pending Approval)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasHubPage>
  );
}
