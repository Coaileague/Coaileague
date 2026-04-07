/**
 * Phase 48 — Onboarding Progress Ring
 * =====================================
 * SVG ring showing 3-tier completion segments.
 * Tier 1 = gold (blocking), Tier 2 = blue (week 1), Tier 3 = purple (month 1).
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

interface Task {
  tier: number;
  is_required: boolean;
  status: string;
}

interface OnboardingProgressRingProps {
  tasks: Task[];
  size?: number;
  showLegend?: boolean;
  className?: string;
}

const TIER_COLORS = {
  1: { stroke: "#F59E0B", label: "Tier 1 — Before First Shift", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  2: { stroke: "#3B82F6", label: "Tier 2 — First Week",         badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  3: { stroke: "#8B5CF6", label: "Tier 3 — First Month",        badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30" },
};

function computeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function OnboardingProgressRing({
  tasks,
  size = 120,
  showLegend = true,
  className,
}: OnboardingProgressRingProps) {
  const stats = useMemo(() => {
    const tiers = [1, 2, 3] as const;
    return tiers.map((tier) => {
      const tierTasks = tasks.filter((t) => t.tier === tier && t.is_required);
      const done = tierTasks.filter((t) => t.status === "completed" || t.status === "waived").length;
      return { tier, total: tierTasks.length, done };
    });
  }, [tasks]);

  const totalRequired = stats.reduce((s, t) => s + t.total, 0);
  const totalDone = stats.reduce((s, t) => s + t.done, 0);
  const overallPct = totalRequired > 0 ? Math.round((totalDone / totalRequired) * 100) : 0;

  // Ring geometry
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.1;
  const r = (size - strokeWidth * 2) / 2;
  const gap = 4; // degrees gap between tier segments

  // Distribute 360° across tiers proportional to task count
  let currentDeg = 0;
  const segments = stats
    .filter((s) => s.total > 0)
    .map((s) => {
      const totalSegDeg = (s.total / Math.max(totalRequired, 1)) * 360 - gap;
      const doneDeg = (s.done / Math.max(s.total, 1)) * totalSegDeg;
      const seg = {
        tier: s.tier,
        startDeg: currentDeg,
        bgEnd: currentDeg + totalSegDeg,
        fgEnd: currentDeg + doneDeg,
        total: s.total,
        done: s.done,
      };
      currentDeg += totalSegDeg + gap;
      return seg;
    });

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {/* Background track per tier */}
          {segments.map((seg) => (
            <path
              key={`bg-${seg.tier}`}
              d={computeArc(cx, cy, r, seg.startDeg, seg.bgEnd)}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="text-muted/20"
            />
          ))}
          {/* Filled arc per tier */}
          {segments.map((seg) =>
            seg.done > 0 ? (
              <path
                key={`fg-${seg.tier}`}
                d={computeArc(cx, cy, r, seg.startDeg, seg.fgEnd)}
                fill="none"
                stroke={TIER_COLORS[seg.tier as 1 | 2 | 3].stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.4s ease" }}
              />
            ) : null
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums leading-none">{overallPct}%</span>
          <span className="text-xs text-muted-foreground mt-0.5">
            {totalDone}/{totalRequired}
          </span>
        </div>
      </div>

      {showLegend && (
        <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
          {stats.filter((s) => s.total > 0).map((s) => {
            const color = TIER_COLORS[s.tier as 1 | 2 | 3];
            const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
            const allDone = s.done === s.total;
            const Icon = allDone ? CheckCircle : s.tier === 1 ? AlertCircle : Clock;
            return (
              <div key={s.tier} className="flex items-center gap-2 text-xs">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    allDone
                      ? "text-green-500"
                      : s.tier === 1
                      ? "text-amber-500"
                      : "text-muted-foreground"
                  )}
                />
                <div className="flex-1 min-w-0 truncate text-muted-foreground">
                  {color.label.split(" — ")[1]}
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", color.badge)}
                >
                  {s.done}/{s.total}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
