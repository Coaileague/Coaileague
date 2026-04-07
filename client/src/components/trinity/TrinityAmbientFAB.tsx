/**
 * TRINITY AMBIENT FAB — Intercom-style expandable panel
 * ======================================================
 * Trinity's persistent floating presence on every page.
 *
 * Default state: compact branded FAB, bottom-right on mobile and desktop.
 *                Stacks directly BELOW the QuickActions (+) button.
 * Tapped:        Panel expands upward — Trinity avatar, insight message, quick chips,
 *                "Open Trinity" CTA.
 * Dismissed:     Collapses back to FAB smoothly.
 *
 * Rules:
 *   - Mobile: BOTTOM RIGHT (right: 16px). Stacked below the + button.
 *   - Desktop: BOTTOM RIGHT (right: 24px). QuickActions doesn't render on desktop.
 *   - Hidden on: /  /dashboard  /landing
 *   - Hides on scroll down, reappears on scroll up / after 1.2s pause.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Sparkles, X, ArrowRight, CalendarDays, CheckSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { isTrinityAccessAllowed } from "@/config/trinity";
import { useFABPosition } from "@/hooks/useFABPosition";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Routes where the FAB is suppressed entirely ───────────────────────────────
const HIDDEN_ROUTES = ["/", "/dashboard", "/landing"];

// ── Context chip definitions per route ───────────────────────────────────────
interface Chip {
  label: string;
  icon: typeof Sparkles;
  prompt: string;
}

function getContextPanel(path: string): { greeting: string; insight: string; chips: Chip[] } {
  if (path.startsWith("/time-tracking") || path.startsWith("/clock")) {
    return {
      greeting: "Time Tracking",
      insight: "I can review your hours, explain overtime rules, or help if your GPS isn't capturing.",
      chips: [
        { label: "Am I on track?", icon: CheckSquare, prompt: "Am I on track with my hours this pay period?" },
        { label: "Explain overtime", icon: CalendarDays, prompt: "Explain how overtime is calculated on this platform." },
        { label: "GPS not working?", icon: Sparkles, prompt: "My GPS isn't capturing. What should I do?" },
      ],
    };
  }
  if (path.startsWith("/scheduling") || path.startsWith("/schedule")) {
    return {
      greeting: "Schedule",
      insight: "I can check for conflicts, find coverage gaps, and help fill open shifts.",
      chips: [
        { label: "Any conflicts?", icon: CalendarDays, prompt: "Check the schedule for conflicts or coverage gaps this week." },
        { label: "Who is uncovered?", icon: Users, prompt: "Which shifts are uncovered or understaffed right now?" },
        { label: "Explain schedule", icon: Sparkles, prompt: "Explain the current schedule setup and any issues you notice." },
      ],
    };
  }
  if (path.startsWith("/employees") || path.startsWith("/staff") || path.startsWith("/team") || path.startsWith("/my-team")) {
    return {
      greeting: "Team",
      insight: "I can give you a team overview, flag missing certifications, or check scheduling readiness.",
      chips: [
        { label: "Team overview", icon: Users, prompt: "Give me a quick overview of my team — who's active, on shift, any issues." },
        { label: "Missing certs?", icon: CheckSquare, prompt: "Which employees have expiring or missing compliance certifications?" },
        { label: "Scheduling ready?", icon: CalendarDays, prompt: "Who on my team is ready to be scheduled this week?" },
      ],
    };
  }
  if (path.startsWith("/timesheets")) {
    return {
      greeting: "Timesheets",
      insight: "I can find overtime, surface pending approvals, and break down your hours.",
      chips: [
        { label: "Any overtime?", icon: CalendarDays, prompt: "Which employees have overtime this pay period?" },
        { label: "Pending approvals", icon: CheckSquare, prompt: "What timesheets are pending my approval?" },
        { label: "Explain my hours", icon: Sparkles, prompt: "Break down my timesheet for the current pay period." },
      ],
    };
  }
  if (path.startsWith("/payroll")) {
    return {
      greeting: "Payroll",
      insight: "I can walk through calculations, flag anomalies, or tell you when the next run pays out.",
      chips: [
        { label: "How calculated?", icon: Sparkles, prompt: "Walk me through how payroll is being calculated for this period." },
        { label: "When do I get paid?", icon: CalendarDays, prompt: "When is the next payroll run and who gets paid?" },
        { label: "Any anomalies?", icon: CheckSquare, prompt: "Did you notice any anomalies or errors in the current payroll?" },
      ],
    };
  }
  if (path.startsWith("/compliance")) {
    return {
      greeting: "Compliance",
      insight: "I monitor expiring certifications and items that need action from you or your team.",
      chips: [
        { label: "Expiring soon?", icon: CalendarDays, prompt: "What licenses or certifications are expiring in the next 30 days?" },
        { label: "Needs action?", icon: CheckSquare, prompt: "What compliance items need immediate action from me or my team?" },
        { label: "Explain requirement", icon: Sparkles, prompt: "Explain what this compliance requirement means and how to complete it." },
      ],
    };
  }
  if (path.startsWith("/billing") || path.startsWith("/invoices")) {
    return {
      greeting: "Billing",
      insight: "I can explain charges, check invoice status, or flag anything that looks off.",
      chips: [
        { label: "Explain this charge", icon: Sparkles, prompt: "Explain the current billing charges and what they cover." },
        { label: "Next invoice?", icon: CalendarDays, prompt: "When is the next invoice due and for what amount?" },
      ],
    };
  }
  if (path.startsWith("/clients")) {
    return {
      greeting: "Clients",
      insight: "I can give you a client overview or surface any open issues and pending tasks.",
      chips: [
        { label: "Client overview", icon: Users, prompt: "Give me a quick overview of my active clients and their status." },
        { label: "Any issues?", icon: CheckSquare, prompt: "Are there any open issues or pending tasks for my clients?" },
      ],
    };
  }
  return {
    greeting: "Trinity",
    insight: "I can help with scheduling, payroll, compliance, and anything else on this page.",
    chips: [
      { label: "What can you do?", icon: Sparkles, prompt: "What can you help me with on this page and throughout the platform?" },
      { label: "What's urgent?", icon: CheckSquare, prompt: "What urgent items need my attention right now?" },
    ],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrinityAmbientFAB() {
  // ── All hooks must come first — no early returns before this block ──────────
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { openModal, setPendingPrompt } = useTrinityModal();
  const { workspaceRole, platformRole, isLoading } = useWorkspaceAccess();
  const { trinity: fabPos } = useFABPosition();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const panel = getContextPanel(location);

  // ── Scroll hide / reappear ─────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const diff = currentY - lastScrollY.current;

      if (diff > 8 && currentY > 100) {
        setIsHidden(true);
        setIsPanelOpen(false);
      } else if (diff < -8) {
        setIsHidden(false);
      }
      lastScrollY.current = currentY;

      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => setIsHidden(false), 1200);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  // ── Close panel on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!isPanelOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isPanelOpen]);

  // Close panel on route change
  useEffect(() => {
    setIsPanelOpen(false);
  }, [location]);

  const handleFABClick = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate(8);
    setIsPanelOpen((prev) => !prev);
  }, []);

  const handleChipClick = useCallback(
    (chip: Chip) => {
      setIsPanelOpen(false);
      setPendingPrompt(chip.prompt);
      openModal();
    },
    [openModal, setPendingPrompt]
  );

  const handleOpenTrinity = useCallback(() => {
    setIsPanelOpen(false);
    openModal();
  }, [openModal]);

  // ── Guards — after all hooks ──────────────────────────────────────────────
  // On mobile, Trinity is integrated inside MobileQuickActionsFAB speed-dial.
  // Only render the standalone ambient FAB on desktop.
  if (isMobile) return null;
  if (isLoading) return null;
  if (!isTrinityAccessAllowed(workspaceRole, platformRole)) return null;

  const isHiddenRoute = HIDDEN_ROUTES.some(
    (r) => location === r || location.startsWith(r + "/")
  );
  if (isHiddenRoute) return null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const fabSize = 56; // Trinity spec: 56×56 minimum touch target

  // Panel sits directly above the full FAB stack (Intercom style — right side)
  const panelBottom = `calc(${fabPos.bottom} + ${fabSize + 10}px)`;
  const panelHorizontal = { right: "12px" };

  return (
    <>
      {/* ── Expandable panel — Intercom / Drift style ── */}
      {isPanelOpen && (
        <div
          ref={panelRef}
          className="trinity-panel"
          style={{
            position: "fixed",
            zIndex: 9998,
            bottom: panelBottom,
            ...panelHorizontal,
            width: "290px",
            maxWidth: "calc(100vw - 48px)",
            transformOrigin: "bottom right",
          }}
          data-testid="trinity-panel"
        >
          {/* ── Header ── */}
          <div className="trinity-panel-header">
            <div
              className="trinity-panel-avatar"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #0891B2 100%)" }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="trinity-panel-identity">
              <span className="trinity-panel-name">Trinity</span>
              <span className="trinity-panel-status">
                <span className="trinity-panel-dot" />
                AI Copilot · Online
              </span>
            </div>
            <button
              className="trinity-panel-close"
              onClick={() => setIsPanelOpen(false)}
              aria-label="Close Trinity panel"
              data-testid="trinity-panel-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Insight message ── */}
          <p className="trinity-panel-insight">
            {panel.insight}
          </p>

          {/* ── Quick chips — horizontal scroll ── */}
          <div className="trinity-panel-chips" data-testid="trinity-panel-chips">
            {panel.chips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(chip)}
                className="trinity-panel-chip"
                data-testid={`trinity-chip-${i}`}
              >
                <chip.icon className="w-3 h-3 flex-shrink-0" />
                {chip.label}
              </button>
            ))}
          </div>

          {/* ── CTA ── */}
          <button
            onClick={handleOpenTrinity}
            className="trinity-panel-cta"
            data-testid="trinity-panel-open"
          >
            Open Trinity
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── FAB button ── */}
      <button
        className={cn(
          "trinity-fab",
          isHidden && "trinity-fab--hidden",
          isPanelOpen && "trinity-fab--expanded"
        )}
        style={{
          width: fabSize,
          height: fabSize,
          bottom: fabPos.bottom,
          right: fabPos.right ?? "16px",
          transition: "bottom 0.35s cubic-bezier(0.4,0,0.2,1), right 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
        onClick={handleFABClick}
        aria-label="Open Trinity AI Assistant"
        aria-expanded={isPanelOpen}
        data-testid="button-trinity-fab"
      >
        <div
          className={cn(
            "transition-transform duration-200",
            isPanelOpen ? "rotate-45 scale-90" : "rotate-0 scale-100"
          )}
        >
          {isPanelOpen ? (
            <X className="w-5 h-5 text-white" />
          ) : (
            <Sparkles className="w-5 h-5 text-white" />
          )}
        </div>
      </button>
    </>
  );
}
