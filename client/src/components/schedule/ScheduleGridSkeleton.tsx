interface ScheduleGridSkeletonProps {
  viewMode: 'day' | 'week' | 'month';
  rowCount?: number;
}

export function ScheduleGridSkeleton({ viewMode, rowCount = 8 }: ScheduleGridSkeletonProps) {
  if (viewMode === 'week') {
    return <WeekSkeletonGrid rowCount={rowCount} />;
  }
  return <DaySkeletonGrid rowCount={rowCount} />;
}

function WeekSkeletonGrid({ rowCount }: { rowCount: number }) {
  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  return (
    <div className="flex-1 overflow-hidden" data-testid="schedule-grid-skeleton">
      <div className="flex items-center justify-center py-2 border-b bg-blue-50/50 dark:bg-blue-900/20">
        <div className="h-4 bg-muted rounded w-40 animate-pulse" />
      </div>

      <div className="flex sticky top-0 bg-slate-100/95 dark:bg-slate-800/95 z-20 border-b">
        <div className="w-[200px] min-w-[200px] p-3 border-r flex-shrink-0" />
        {dayLabels.map((label, i) => (
          <div key={i} className="flex-1 min-w-[110px] text-center py-2.5 border-r last:border-r-0">
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="h-5 bg-muted rounded w-6 mx-auto mt-1 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Unassigned Shifts Section - Green */}
      <div className="flex border-b-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20">
        <div className="w-[200px] min-w-[200px] px-3 py-2.5 border-r flex-shrink-0 bg-emerald-50 dark:bg-emerald-900/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-200/60 animate-pulse" />
            <div className="space-y-1">
              <div className="h-3 bg-emerald-200/50 rounded w-24 animate-pulse" />
              <div className="h-2 bg-emerald-200/30 rounded w-12 animate-pulse" />
            </div>
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[110px] p-1.5 border-r last:border-r-0 min-h-[60px]">
            {getRandomShiftPattern(0, i) && (
              <div className="h-10 bg-emerald-200/40 dark:bg-emerald-700/30 rounded-md animate-pulse border-2 border-dashed border-emerald-300/40" />
            )}
          </div>
        ))}
      </div>

      {/* Scheduled Shifts Label */}
      <div className="flex items-center px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/60">
        <div className="w-[200px] min-w-[200px] flex items-center gap-2 flex-shrink-0">
          <div className="h-2.5 bg-muted rounded w-28 animate-pulse" />
        </div>
      </div>

      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <div key={rowIndex} className={`flex border-b ${rowIndex % 2 === 0 ? 'bg-white/70 dark:bg-slate-900/50' : 'bg-slate-50/80 dark:bg-slate-800/40'}`}
          style={{ minHeight: getRandomShiftPattern(rowIndex + 2, 4) ? '110px' : '64px' }}
        >
          <div className="w-[200px] min-w-[200px] px-3 py-2.5 border-r flex-shrink-0 bg-slate-50/90 dark:bg-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-24 animate-pulse" />
                <div className="h-2.5 bg-muted rounded w-16 animate-pulse" />
              </div>
            </div>
          </div>
          {Array.from({ length: 7 }).map((_, colIndex) => (
            <div key={colIndex} className="flex-1 min-w-[110px] p-1.5 border-r last:border-r-0">
              {getRandomShiftPattern(rowIndex + 1, colIndex) && (
                <div className="space-y-1">
                  <div className="h-12 bg-muted rounded-md animate-pulse skeleton-shimmer" />
                  {getRandomShiftPattern(rowIndex + 2, colIndex + 3) && (
                    <div className="h-12 bg-muted rounded-md animate-pulse skeleton-shimmer" />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DaySkeletonGrid({ rowCount }: { rowCount: number }) {
  const columnLabels = Array.from({ length: 24 }, (_, i) => {
    const hour = i % 12 || 12;
    const period = i < 12 ? 'a' : 'p';
    return `${hour}${period}`;
  });

  return (
    <div className="flex-1 overflow-hidden" data-testid="schedule-grid-skeleton">
      <div className="flex sticky top-0 bg-card z-20 border-b">
        <div className="w-[160px] min-w-[160px] flex-shrink-0 p-3 border-r">
          <div className="h-4 bg-muted rounded w-20 animate-pulse" />
        </div>
        <div className="flex flex-1">
          {columnLabels.map((label, i) => (
            <div key={i} className="flex-1 p-2 text-center text-[10px] text-muted-foreground border-r last:border-r-0">
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Unassigned Shifts - Green */}
      <div className="flex border-b-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/15">
        <div className="w-[160px] min-w-[160px] flex-shrink-0 p-3 border-r bg-emerald-50/80 dark:bg-emerald-900/30">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-emerald-200/50 animate-pulse" />
            <div className="space-y-1">
              <div className="h-3 bg-emerald-200/50 rounded w-16 animate-pulse" />
              <div className="h-2 bg-emerald-200/30 rounded w-10 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 relative min-h-[64px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-emerald-200/40 last:border-r-0" />
          ))}
          {getRandomShiftPattern(0, 2) && (
            <div
              className="absolute top-1 bottom-1 bg-emerald-200/40 dark:bg-emerald-700/30 rounded-lg animate-pulse border-2 border-dashed border-emerald-300/40"
              style={{ left: '35%', width: '25%' }}
            />
          )}
        </div>
      </div>

      {/* Scheduled Shifts Label */}
      <div className="flex items-center px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/60">
        <div className="w-[160px] min-w-[160px] flex items-center gap-2 flex-shrink-0">
          <div className="h-2.5 bg-muted rounded w-28 animate-pulse" />
        </div>
      </div>

      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <div key={rowIndex} className={`flex border-b ${rowIndex % 2 === 0 ? 'bg-white/70 dark:bg-slate-900/50' : 'bg-slate-50/80 dark:bg-slate-800/40'}`}
          style={{ minHeight: getRandomShiftPattern(rowIndex, 3) ? '120px' : '72px' }}
        >
          <div className="w-[160px] min-w-[160px] flex-shrink-0 px-3 py-2.5 border-r bg-slate-50/90 dark:bg-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-24 animate-pulse" />
                <div className="h-2.5 bg-muted rounded w-16 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex flex-1 relative">
            {Array.from({ length: 24 }).map((_, colIndex) => (
              <div key={colIndex} className="flex-1 border-r last:border-r-0" />
            ))}
            {getRandomShiftPattern(rowIndex, 0) && (
              <div
                className="absolute top-1 bg-muted rounded-lg animate-pulse skeleton-shimmer"
                style={{
                  left: `${getRandomOffset(rowIndex, 0) + 10}%`,
                  width: `${getRandomWidth(rowIndex, 0) / 3}%`,
                  height: getRandomShiftPattern(rowIndex, 3) ? 'calc(50% - 6px)' : 'calc(100% - 8px)',
                }}
              />
            )}
            {getRandomShiftPattern(rowIndex, 3) && getRandomShiftPattern(rowIndex, 0) && (
              <div
                className="absolute bottom-1 bg-muted rounded-lg animate-pulse skeleton-shimmer"
                style={{
                  left: `${getRandomOffset(rowIndex, 2) + 40}%`,
                  width: `${getRandomWidth(rowIndex, 2) / 4}%`,
                  height: 'calc(50% - 6px)',
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function getRandomShiftPattern(row: number, col: number): boolean {
  const seed = (row * 31 + col * 17) % 100;
  return seed < 35;
}

function getRandomWidth(row: number, col: number): number {
  const seed = (row * 13 + col * 7) % 100;
  return 50 + (seed % 50);
}

function getRandomOffset(row: number, col: number): number {
  const seed = (row * 23 + col * 11) % 100;
  return seed % 20;
}
