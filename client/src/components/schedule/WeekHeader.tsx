/**
 * WeekHeader - Week navigation and stats cards
 * Mobile-first design with horizontal scrolling stats
 */

import { ChevronLeft, ChevronRight, Calendar, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { format, addDays } from 'date-fns';

interface WeekStats {
  totalHours: number;
  totalCost: number;
  overtimeHours: number;
  openShifts: number;
}

interface WeekHeaderProps {
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  stats: WeekStats | null;
  isLoadingStats: boolean;
}

export function WeekHeader({ weekStart, onPreviousWeek, onNextWeek, stats, isLoadingStats }: WeekHeaderProps) {
  const weekEnd = addDays(weekStart, 6);
  const weekDisplay = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`;

  return (
    <div className="bg-background border-b sticky top-0 z-50">
      {/* Week Navigation */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreviousWeek}
          data-testid="button-previous-week"
          className="flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-center flex-1">
          {weekDisplay}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onNextWeek}
          data-testid="button-next-week"
          className="flex-shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Cards - Horizontal Scroll */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 px-4 pb-4">
          <StatCard
            label="Hours"
            value={isLoadingStats ? "..." : stats?.totalHours.toFixed(1) || "0"}
            icon={<Clock className="h-4 w-4" />}
            testId="stat-hours"
          />
          <StatCard
            label="Cost"
            value={isLoadingStats ? "..." : `$${(stats?.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
            icon={<DollarSign className="h-4 w-4" />}
            variant="success"
            subtext={stats ? `${Math.round((stats.totalCost / 15000) * 100)}% of budget` : undefined}
            testId="stat-cost"
          />
          <StatCard
            label="Overtime"
            value={isLoadingStats ? "..." : stats?.overtimeHours.toFixed(1) || "0"}
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={stats && stats.overtimeHours > 0 ? "warning" : "default"}
            subtext="hrs"
            testId="stat-overtime"
          />
          <StatCard
            label="Open"
            value={isLoadingStats ? "..." : String(stats?.openShifts || 0)}
            icon={<Calendar className="h-4 w-4" />}
            variant={stats && stats.openShifts > 0 ? "danger" : "default"}
            subtext="shifts"
            testId="stat-open-shifts"
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  subtext?: string;
  testId?: string;
}

function StatCard({ label, value, icon, variant = 'default', subtext, testId }: StatCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  };

  return (
    <Card className="flex-shrink-0 w-36 p-4" data-testid={testId}>
      <div className="flex items-center gap-2 mb-2">
        <div className={variantStyles[variant]}>{icon}</div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
      </div>
      <div className={`text-2xl font-bold ${variantStyles[variant]}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
      )}
    </Card>
  );
}
