/**
 * DayTabs - Horizontal scrolling day selector
 */

import { format, addDays, isSameDay } from 'date-fns';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DayTabsProps {
  weekStart: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export function DayTabs({ weekStart, selectedDate, onSelectDate }: DayTabsProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <ScrollArea className="w-full whitespace-nowrap border-b bg-background">
      <div className="flex gap-2 px-4 py-3">
        {days.map((day, index) => {
          const isActive = isSameDay(day, selectedDate);
          return (
            <button
              key={index}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex-shrink-0 px-5 py-3 rounded-md text-center transition-all border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-card-foreground border-border hover-elevate active-elevate-2"
              )}
              data-testid={`day-tab-${index}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-1">
                {format(day, 'EEE')}
              </div>
              <div className="text-lg font-bold">
                {format(day, 'd')}
              </div>
            </button>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
