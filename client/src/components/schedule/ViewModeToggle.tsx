/**
 * ViewModeToggle - Day/Week/Month view toggle with navigation
 * 
 * @description Compact view mode selector with day/month navigation controls
 * Supports compact mode for inline display in GetSling-style header
 */

import { Button } from '@/components/ui/button';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';

type ViewMode = 'day' | 'week' | 'month';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  selectedDay: Date;
  currentMonth?: Date;
  onViewModeChange: (mode: ViewMode) => void;
  onDayChange: (day: Date) => void;
  onMonthChange?: (month: Date) => void;
  compact?: boolean;
}

export function ViewModeToggle({
  viewMode,
  selectedDay,
  currentMonth,
  onViewModeChange,
  onDayChange,
  onMonthChange,
  compact = false,
}: ViewModeToggleProps) {
  const goToPreviousDay = () => {
    const prev = new Date(selectedDay);
    prev.setDate(prev.getDate() - 1);
    onDayChange(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDay);
    next.setDate(next.getDate() + 1);
    onDayChange(next);
  };

  const goToToday = () => {
    onDayChange(new Date());
  };

  const goToPreviousMonth = () => {
    if (onMonthChange && currentMonth) {
      const prev = new Date(currentMonth);
      prev.setMonth(prev.getMonth() - 1);
      onMonthChange(prev);
    }
  };

  const goToNextMonth = () => {
    if (onMonthChange && currentMonth) {
      const next = new Date(currentMonth);
      next.setMonth(next.getMonth() + 1);
      onMonthChange(next);
    }
  };

  const goToCurrentMonth = () => {
    if (onMonthChange) {
      onMonthChange(new Date());
    }
  };

  const monthDisplay = currentMonth
    ? currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant={viewMode === 'day' ? 'default' : 'ghost'}
            className="px-4 rounded-none border-0"
            onClick={() => onViewModeChange('day')}
            data-testid="button-day-view"
          >
            Day
          </Button>
          <Button
            variant={viewMode === 'week' ? 'default' : 'ghost'}
            className="px-4 rounded-none border-0"
            onClick={() => onViewModeChange('week')}
            data-testid="button-week-view"
          >
            Week
          </Button>
          <Button
            variant={viewMode === 'month' ? 'default' : 'ghost'}
            className="px-4 rounded-none border-0"
            onClick={() => onViewModeChange('month')}
            data-testid="button-month-view"
          >
            Month
          </Button>
        </div>
        
        {viewMode === 'day' && (
          <>
            <Button variant="ghost" size="icon" onClick={goToPreviousDay} data-testid="button-prev-day" aria-label="Previous day">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium whitespace-nowrap min-w-[90px] text-center">
              {selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <Button variant="ghost" size="icon" onClick={goToNextDay} data-testid="button-next-day" aria-label="Next day">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" className="px-4" onClick={goToToday} data-testid="button-today">
              Today
            </Button>
          </>
        )}

        {viewMode === 'month' && currentMonth && (
          <>
            <Button variant="ghost" size="icon" onClick={goToPreviousMonth} data-testid="button-prev-month" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium whitespace-nowrap min-w-[120px] text-center" data-testid="text-current-month">
              {monthDisplay}
            </span>
            <Button variant="ghost" size="icon" onClick={goToNextMonth} data-testid="button-next-month" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" className="px-4" onClick={goToCurrentMonth} data-testid="button-current-month">
              Today
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/30 rounded-lg border mb-2">
      <div className="flex items-center gap-2">
        <Button
          variant={viewMode === 'day' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('day')}
          data-testid="button-day-view"
        >
          <CalendarDays className="w-4 h-4 mr-1" />
          Day
        </Button>
        <Button
          variant={viewMode === 'week' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('week')}
          data-testid="button-week-view"
        >
          <Calendar className="w-4 h-4 mr-1" />
          Week
        </Button>
        <Button
          variant={viewMode === 'month' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('month')}
          data-testid="button-month-view"
        >
          <CalendarRange className="w-4 h-4 mr-1" />
          Month
        </Button>
      </div>
      
      {viewMode === 'day' && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousDay}
            data-testid="button-prev-day"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-medium text-sm min-w-[140px] text-center">
            {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextDay}
            data-testid="button-next-day"
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToToday}
            data-testid="button-today"
          >
            Today
          </Button>
        </div>
      )}

      {viewMode === 'month' && currentMonth && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousMonth}
            data-testid="button-prev-month"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-medium text-sm min-w-[140px] text-center" data-testid="text-current-month">
            {monthDisplay}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            data-testid="button-next-month"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToCurrentMonth}
            data-testid="button-current-month"
          >
            Today
          </Button>
        </div>
      )}
    </div>
  );
}
