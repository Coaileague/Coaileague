/**
 * PaydayWidget — Universal earnings card shared between desktop and mobile
 * Syncs with /api/dashboard/worker-earnings, same data as the worker dashboard.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign, TrendingUp, ChevronRight, Clock, CalendarDays, Banknote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format } from "date-fns";

interface EarningsSummary {
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  hoursWorked: number;
  scheduledHours: number;
  hourlyRate: number;
  earnings: number;
  projectedEarnings: number;
}

function useCountUp(target: number, duration = 900, enabled = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || target === 0) { setValue(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased * 100) / 100);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, enabled]);
  return value;
}

function useProgressBar(target: number, delay = 400) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(target, 100)), delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return w;
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={`rounded animate-pulse bg-muted ${className ?? ""}`}
    />
  );
}

interface PaydayWidgetProps {
  compact?: boolean;
}

const EST_TAX_RATE = 0.25;

export function PaydayWidget({ compact = false }: PaydayWidgetProps) {
  const { user } = useAuth();
  const { data: earnings, isLoading } = useQuery<EarningsSummary>({
    queryKey: ["/api/dashboard/worker-earnings"],
    staleTime: 2 * 60 * 1000,
    enabled: !!user?.id,
  });

  const rawEarnings = earnings?.earnings ?? 0;
  const rawHours = earnings?.hoursWorked ?? 0;
  const scheduledHours = earnings?.scheduledHours ?? 0;
  const projectedEarnings = earnings?.projectedEarnings ?? 0;
  const hourlyRate = earnings?.hourlyRate ?? 0;

  const displayEarnings = useCountUp(rawEarnings, 900, !isLoading);

  const estimatedNet = rawEarnings * (1 - EST_TAX_RATE);
  const displayNet = useCountUp(estimatedNet, 900, !isLoading);

  const periodInfo = (() => {
    if (!earnings?.payPeriodStart || !earnings?.payPeriodEnd) return null;
    const start = new Date(earnings.payPeriodStart);
    const end = new Date(earnings.payPeriodEnd);
    const now = new Date();
    const totalMs = end.getTime() - start.getTime();
    if (totalMs <= 0) return null;
    const elapsedMs = now.getTime() - start.getTime();
    const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)));
    const remaining = Math.max(0, totalDays - elapsedDays);
    const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
    const label = `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
    return { totalDays, elapsedDays, remaining, progressPct, label };
  })();

  const periodProgressWidth = useProgressBar(periodInfo?.progressPct ?? 0, 500);
  const hoursProgressPct = scheduledHours > 0 ? (rawHours / scheduledHours) * 100 : 0;
  const hoursProgressWidth = useProgressBar(hoursProgressPct, 600);

  return (
    <Card className="border border-border bg-card overflow-hidden" data-testid="card-payday-widget">
      <CardContent className={compact ? "p-4" : "p-5"}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #2563EB22, #7C3AED22)" }}
            >
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Earnings</p>
              <p className="text-xs text-muted-foreground">{periodInfo?.label ?? "Current Pay Period"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {periodInfo && (
              <Badge
                variant="secondary"
                className="text-xs shrink-0 gap-1"
                data-testid="badge-days-until-payday"
              >
                <CalendarDays className="w-3 h-3" />
                {periodInfo.remaining} day{periodInfo.remaining !== 1 ? "s" : ""} to payday
              </Badge>
            )}
            {hourlyRate > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-hourly-rate">
                ${hourlyRate.toFixed(2)}/hr
              </Badge>
            )}
          </div>
        </div>

        {/* Gross & Net pay row */}
        {isLoading ? (
          <SkeletonLine className="h-10 w-full mb-3" />
        ) : (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Banknote className="w-3 h-3" />
                Gross Pay
              </p>
              <span
                className="text-3xl font-bold tracking-tight text-foreground"
                data-testid="text-payday-earnings"
              >
                ${displayEarnings.toFixed(2)}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Est. Net Pay
              </p>
              <span
                className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400"
                data-testid="text-payday-net"
              >
                ${displayNet.toFixed(2)}
              </span>
              <p className="text-[10px] text-muted-foreground">est. ~{(EST_TAX_RATE * 100).toFixed(0)}% effective tax</p>
            </div>
          </div>
        )}

        {/* Hours row */}
        {isLoading ? (
          <SkeletonLine className="h-4 w-52 mb-3 mt-2" />
        ) : (
          <div className="flex items-center gap-3 mb-3 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span data-testid="text-payday-hours">
              <span className="font-semibold text-foreground">{rawHours.toFixed(1)}</span> hrs worked
            </span>
            {scheduledHours > 0 && (
              <>
                <span className="text-border">·</span>
                <span>{scheduledHours.toFixed(1)} scheduled</span>
              </>
            )}
          </div>
        )}

        {/* Pay Period Progress */}
        {periodInfo && !isLoading && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium">Pay Period Progress</span>
              <span>{periodInfo.progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-muted">
              <div
                className="h-full rounded-full transition-all ease-out"
                style={{
                  width: `${periodProgressWidth}%`,
                  background: "linear-gradient(90deg, #2563EB, #7C3AED)",
                  transitionDuration: "700ms",
                }}
                data-testid="progress-pay-period"
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Day {periodInfo.elapsedDays} of {periodInfo.totalDays}</span>
              <span>{periodInfo.remaining} day{periodInfo.remaining !== 1 ? "s" : ""} remaining</span>
            </div>
          </div>
        )}

        {/* Hours Progress */}
        {(isLoading || scheduledHours > 0) && (
          <div className="mb-4">
            {isLoading ? (
              <SkeletonLine className="h-2 w-full mb-1.5 rounded-full" />
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span className="font-medium">Hours Completion</span>
                  <span>{hoursProgressPct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-muted">
                  <div
                    className="h-full rounded-full transition-all ease-out"
                    style={{
                      width: `${hoursProgressWidth}%`,
                      background: hoursProgressPct >= 100
                        ? "linear-gradient(90deg, #16a34a, #22c55e)"
                        : "linear-gradient(90deg, #f59e0b, #eab308)",
                      transitionDuration: "700ms",
                    }}
                    data-testid="progress-payday"
                  />
                </div>
                {projectedEarnings > 0 && (
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-1.5">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Projected gross
                    </span>
                    <span className="font-medium text-foreground">
                      ${projectedEarnings.toFixed(2)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Link to full dashboard */}
        <Link href="/worker-dashboard">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-primary font-medium"
            data-testid="button-view-earnings-details"
          >
            View earnings details
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
