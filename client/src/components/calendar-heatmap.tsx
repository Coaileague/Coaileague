/**
 * Calendar Heat Map Component
 * 
 * Interactive visualization showing staffing intensity across days and hours
 * Features:
 * - 7x24 grid (days of week x hours)
 * - Color gradient from light to dark based on intensity
 * - Hover tooltips with exact counts
 * - Click to drill down to specific shifts
 * - AI-powered staffing recommendations
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Clock, Users, Calendar, TrendingUp, AlertTriangle, 
  Lightbulb, ChevronDown, Info, Target, Zap, Brain
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
// @ts-expect-error — TS migration: fix in refactoring sprint
import { ScrollArea, ScrollAreaViewport, ScrollBar } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  value: number;
  shiftCount: number;
  employeeCount: number;
  hoursWorked: number;
}

interface HeatmapData {
  grid: HeatmapCell[][];
  maxValue: number;
  minValue: number;
  totalShifts: number;
  peakHours: { dayOfWeek: number; hour: number; value: number }[];
  quietPeriods: { dayOfWeek: number; hour: number; value: number }[];
  averageStaffPerSlot: number;
}

interface StaffingRecommendation {
  dayOfWeek: number;
  hour: number;
  currentLevel: number;
  recommendedLevel: number;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface AIStaffingAnalysis {
  recommendations: StaffingRecommendation[];
  understaffedPeriods: { dayOfWeek: number; hour: number; gap: number }[];
  overstaffedPeriods: { dayOfWeek: number; hour: number; excess: number }[];
  insights: string[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => 
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
);

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
];

function getHeatColor(value: number, maxValue: number): string {
  if (value === 0 || maxValue === 0) return 'bg-muted/30';
  
  const intensity = Math.min(value / maxValue, 1);
  
  if (intensity < 0.2) return 'bg-cyan-100 dark:bg-cyan-950/40';
  if (intensity < 0.4) return 'bg-cyan-200 dark:bg-cyan-900/50';
  if (intensity < 0.6) return 'bg-cyan-400 dark:bg-cyan-700/60';
  if (intensity < 0.8) return 'bg-cyan-500 dark:bg-cyan-600/70';
  return 'bg-cyan-600 dark:bg-cyan-500/80';
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/30';
    case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
    default: return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
  }
}

interface HeatmapCellProps {
  cell: HeatmapCell;
  maxValue: number;
  onClick?: () => void;
  isSelected?: boolean;
}

function HeatmapCellComponent({ cell, maxValue, onClick, isSelected }: HeatmapCellProps) {
  const colorClass = getHeatColor(cell.value, maxValue);
  
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "w-full h-8 sm:h-10 rounded-sm transition-all duration-150 flex items-center justify-center text-xs font-medium",
              colorClass,
              isSelected && "ring-2 ring-primary ring-offset-1",
              cell.value > 0 && "hover:opacity-80 cursor-pointer",
              cell.value === 0 && "cursor-default"
            )}
            data-testid={`heatmap-cell-${cell.dayOfWeek}-${cell.hour}`}
          >
            {cell.value > 0 && (
              <span className={cn(
                "text-[10px] sm:text-xs",
                cell.value / maxValue > 0.5 ? "text-white" : "text-foreground"
              )}>
                {cell.value}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">
              {DAY_NAMES_FULL[cell.dayOfWeek]} at {HOUR_LABELS[cell.hour]}
            </p>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {cell.employeeCount} employee{cell.employeeCount !== 1 ? 's' : ''}
              </p>
              <p className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {cell.shiftCount} shift{cell.shiftCount !== 1 ? 's' : ''}
              </p>
              <p className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {cell.hoursWorked.toFixed(1)} hours worked
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HeatmapLegend({ maxValue }: { maxValue: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Less</span>
      <div className="flex gap-0.5">
        <div className="w-4 h-4 rounded-sm bg-muted/30" />
        <div className="w-4 h-4 rounded-sm bg-cyan-100 dark:bg-cyan-950/40" />
        <div className="w-4 h-4 rounded-sm bg-cyan-200 dark:bg-cyan-900/50" />
        <div className="w-4 h-4 rounded-sm bg-cyan-400 dark:bg-cyan-700/60" />
        <div className="w-4 h-4 rounded-sm bg-cyan-500 dark:bg-cyan-600/70" />
        <div className="w-4 h-4 rounded-sm bg-cyan-600 dark:bg-cyan-500/80" />
      </div>
      <span>More</span>
      {maxValue > 0 && (
        <span className="ml-2 text-muted-foreground">
          (max: {maxValue})
        </span>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-25 gap-0.5">
        {Array.from({ length: 7 * 25 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-sm" />
        ))}
      </div>
    </div>
  );
}

interface CalendarHeatmapProps {
  className?: string;
  onCellClick?: (dayOfWeek: number, hour: number) => void;
  showAIInsights?: boolean;
}

export function CalendarHeatmap({ className, onCellClick, showAIInsights = true }: CalendarHeatmapProps) {
  const [period, setPeriod] = useState('last_30_days');
  const [selectedCell, setSelectedCell] = useState<{ day: number; hour: number } | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  const { data: heatmapData, isLoading: heatmapLoading } = useQuery<{ success: boolean; data: HeatmapData }>({
    queryKey: ['/api/analytics/heatmap', period],
  });

  const { data: aiAnalysis, isLoading: aiLoading } = useQuery<{ success: boolean; data: AIStaffingAnalysis }>({
    queryKey: ['/api/analytics/heatmap/ai-analysis', period],
    enabled: showAIInsights,
  });

  const data = heatmapData?.data;
  const analysis = aiAnalysis?.data;

  const handleCellClick = (dayOfWeek: number, hour: number) => {
    setSelectedCell(prev => 
      prev?.day === dayOfWeek && prev?.hour === hour ? null : { day: dayOfWeek, hour }
    );
    onCellClick?.(dayOfWeek, hour);
  };

  const peakHoursDisplay = useMemo(() => {
    if (!data?.peakHours) return [];
    return data.peakHours.slice(0, 5).map(p => ({
      ...p,
      label: `${DAY_NAMES[p.dayOfWeek]} ${HOUR_LABELS[p.hour]}`
    }));
  }, [data?.peakHours]);

  if (heatmapLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Staffing Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No shift data available for the selected period</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Staffing Heat Map
            </CardTitle>
            <CardDescription className="mt-1">
              Visualize when your workforce is busiest
            </CardDescription>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]" data-testid="select-heatmap-period">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total Shifts:</span>
            <span className="font-semibold">{data.totalShifts}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Avg Staff/Slot:</span>
            <span className="font-semibold">{data.averageStaffPerSlot.toFixed(1)}</span>
          </div>
          {peakHoursDisplay.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-cyan-500" />
              <span className="text-muted-foreground">Peak:</span>
              <span className="font-semibold">{peakHoursDisplay[0]?.label}</span>
            </div>
          )}
        </div>

        <ScrollArea className="w-full">
          <div className="min-w-[600px]">
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'auto repeat(24, minmax(28px, 1fr))' }}>
              <div className="h-6" />
              {HOUR_LABELS.map((label, i) => (
                <div 
                  key={i} 
                  className="h-6 flex items-center justify-center text-[10px] sm:text-xs text-muted-foreground"
                >
                  {i % 2 === 0 ? label : ''}
                </div>
              ))}
              
              {data.grid.map((row, dayIndex) => (
                <>
                  <div 
                    key={`day-${dayIndex}`}
                    className="h-8 sm:h-10 flex items-center pr-2 text-xs sm:text-sm font-medium text-muted-foreground"
                  >
                    {DAY_NAMES[dayIndex]}
                  </div>
                  {row.map((cell, hourIndex) => (
                    <HeatmapCellComponent
                      key={`${dayIndex}-${hourIndex}`}
                      cell={cell}
                      maxValue={data.maxValue}
                      onClick={() => handleCellClick(dayIndex, hourIndex)}
                      isSelected={selectedCell?.day === dayIndex && selectedCell?.hour === hourIndex}
                    />
                  ))}
                </>
              ))}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <HeatmapLegend maxValue={data.maxValue} />
          {showAIInsights && analysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInsights(!showInsights)}
              className="gap-2"
              data-testid="button-toggle-ai-insights"
            >
              <Brain className="w-4 h-4" />
              AI Insights
              <ChevronDown className={cn("w-4 h-4 transition-transform", showInsights && "rotate-180")} />
            </Button>
          )}
        </div>

        {showAIInsights && showInsights && analysis && (
          <Collapsible open={showInsights}>
            <CollapsibleContent className="space-y-4 pt-4 border-t">
              {analysis.insights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 text-sm">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    Key Insights
                  </h4>
                  <div className="grid gap-2">
                    {analysis.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground p-2 bg-muted/30 rounded-md">
                        <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 text-sm">
                    <Zap className="w-4 h-4 text-cyan-500" />
                    Staffing Recommendations
                  </h4>
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                    {analysis.recommendations.slice(0, 10).map((rec, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-md border text-sm",
                          getPriorityColor(rec.priority)
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-medium">
                            {DAY_NAMES_FULL[rec.dayOfWeek]} at {HOUR_LABELS[rec.hour]}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm opacity-80">{rec.reason}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <span>Current: {rec.currentLevel}</span>
                          <span>Recommended: {rec.recommendedLevel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.understaffedPeriods.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-md border border-red-500/30">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-red-600">
                      {analysis.understaffedPeriods.length} understaffed time slots detected
                    </span>
                    <span className="text-muted-foreground ml-1">
                      Consider adding more coverage during these periods
                    </span>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

export function CompactHeatmap({ className }: { className?: string }) {
  const { data: heatmapData, isLoading } = useQuery<{ success: boolean; data: HeatmapData }>({
    queryKey: ['/api/analytics/heatmap', 'this_week'],
  });

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const data = heatmapData?.data;
  if (!data) return null;

  const dailyTotals = data.grid.map((row, dayIndex) => ({
    day: DAY_NAMES[dayIndex],
    total: row.reduce((sum, cell) => sum + cell.value, 0)
  }));

  const maxDaily = Math.max(...dailyTotals.map(d => d.total));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground mb-1">
        <span>Weekly Activity</span>
        <span>{data.totalShifts} shifts</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dailyTotals.map((day, i) => (
          <TooltipProvider key={i} delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-12 rounded-md flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity",
                    getHeatColor(day.total, maxDaily)
                  )}
                  data-testid={`compact-heatmap-${i}`}
                >
                  <span className={cn(
                    "text-[10px] font-medium",
                    day.total / maxDaily > 0.5 ? "text-white" : "text-muted-foreground"
                  )}>
                    {day.day}
                  </span>
                  <span className={cn(
                    "text-xs font-bold",
                    day.total / maxDaily > 0.5 ? "text-white" : "text-foreground"
                  )}>
                    {day.total}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{DAY_NAMES_FULL[i]}: {day.total} staff hours</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
}

export default CalendarHeatmap;
