/**
 * IsolatedScheduleToolbar - Memoized toolbar with isolated render cycle
 * 
 * ARCHITECTURE: This component receives only callbacks and primitive values.
 * It does NOT depend on shift data queries directly.
 * When data changes in the parent, this component only re-renders if its
 * specific props change (checked via React.memo).
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Plus, Menu, Filter, ChevronDown, Wand2, 
  ToggleLeft, ToggleRight, Sparkles, Loader2, X, Users, MapPin, CopyPlus
} from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import { ViewModeToggle } from './ViewModeToggle';

type ViewMode = 'day' | 'week' | 'month';

export interface IsolatedScheduleToolbarProps {
  isManager: boolean;
  draftShiftsCount: number;
  openShiftsCount: number;
  automationEnabled: boolean;

  isAutoFilling: boolean;
  isTogglingAutomation: boolean;
  isOptimizing?: boolean;
  isGenerating?: boolean;

  viewMode: ViewMode;
  selectedDay: Date;
  currentMonth?: Date;

  sidebarCollapsed: boolean;

  workspaceId?: string;

  onToggleSidebar: () => void;
  onCreateShift: () => void;
  onPublish: () => void;
  onAutoFill: () => void;
  onOptimizeSchedule?: () => void;
  onFullGenerate?: () => void;
  onToggleAutomation: () => void;
  onOpenTrinityInsights: () => void;
  onOpenTrinityChat?: () => void;
  onOpenEmployeeFilters: () => void;
  onOpenLocationFilters: () => void;
  onClearFilters: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onDayChange: (day: Date) => void;
  onMonthChange?: (month: Date) => void;
  onCopyPreviousWeek?: () => void;
}

function ScheduleToolbarComponent({
  isManager,
  draftShiftsCount,
  openShiftsCount,
  automationEnabled,
  isOptimizing = false,
  isGenerating = false,
  isAutoFilling,
  isTogglingAutomation,
  viewMode,
  selectedDay,
  currentMonth,
  sidebarCollapsed,
  workspaceId,
  onToggleSidebar,
  onCreateShift,
  onPublish,
  onAutoFill,
  onOptimizeSchedule,
  onFullGenerate,
  onToggleAutomation,
  onOpenTrinityInsights,
  onOpenTrinityChat,
  onOpenEmployeeFilters,
  onOpenLocationFilters,
  onClearFilters,
  onViewModeChange,
  onDayChange,
  onMonthChange,
  onCopyPreviousWeek,
}: IsolatedScheduleToolbarProps) {
  return (
    <div 
      className="flex items-center h-12 px-2 border-b bg-card gap-2" 
      data-testid="schedule-toolbar"
    >
      {/* Left: Sidebar toggle + Action buttons */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        data-testid="button-toggle-sidebar"
      >
        <Menu className="h-4 w-4" />
      </Button>
      
      {isManager && (
        <>
          <Button 
            size="sm"
            onClick={onCreateShift}
            data-testid="button-create-shift"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
          
          <Button 
            size="sm"
            variant="outline"
            onClick={onPublish}
            data-testid="button-publish"
          >
            Publish
            {draftShiftsCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 text-xs">
                {draftShiftsCount}
              </Badge>
            )}
          </Button>

          {onCopyPreviousWeek && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={onCopyPreviousWeek}
              data-testid="button-copy-previous-week"
            >
              <CopyPlus className="w-4 h-4" />
              Copy Previous Week
            </Button>
          )}
          
          {/* INLINE Auto-Fill Button */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={onAutoFill}
            disabled={isAutoFilling || openShiftsCount === 0}
            data-testid="button-auto-fill-inline"
          >
            {isAutoFilling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <TrinityIconStatic size={14} />
            )}
            {isAutoFilling ? 'Filling...' : 'Auto-Fill'}
            {openShiftsCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 text-xs">
                {openShiftsCount}
              </Badge>
            )}
          </Button>
          
          {/* Trinity AI Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1" data-testid="dropdown-trinity">
                <TrinityIconStatic size={14} />
                Trinity
                <ChevronDown className="w-3 h-3" />
                {openShiftsCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 text-xs">
                    {openShiftsCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <TrinityIconStatic size={16} />
                Trinity AI Scheduling
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onAutoFill}
                disabled={isAutoFilling || isOptimizing || isGenerating || openShiftsCount === 0}
                data-testid="button-auto-fill"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                {isAutoFilling ? 'Filling...' : 'Fill Open Shifts'}
                {openShiftsCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">{openShiftsCount}</Badge>
                )}
              </DropdownMenuItem>
              {onOptimizeSchedule && (
                <DropdownMenuItem
                  onClick={onOptimizeSchedule}
                  disabled={isAutoFilling || isOptimizing || isGenerating}
                  data-testid="button-optimize-schedule"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isOptimizing ? 'Optimizing...' : 'Optimize Schedule'}
                </DropdownMenuItem>
              )}
              {onFullGenerate && (
                <DropdownMenuItem
                  onClick={onFullGenerate}
                  disabled={isAutoFilling || isOptimizing || isGenerating}
                  data-testid="button-full-generate"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {isGenerating ? 'Generating...' : 'Full Generate Week'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onToggleAutomation}
                disabled={isTogglingAutomation}
                data-testid="button-auto-schedule"
              >
                {automationEnabled ? (
                  <ToggleRight className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <ToggleLeft className="w-4 h-4 mr-2" />
                )}
                {isTogglingAutomation
                  ? 'Toggling...'
                  : automationEnabled
                    ? 'Auto-Schedule: ON'
                    : 'Enable Auto-Schedule'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenTrinityInsights}>
                <Sparkles className="w-4 h-4 mr-2" />
                Trinity Insights
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Filters Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1" data-testid="dropdown-filters">
                <Filter className="w-4 h-4" />
                Filters
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>View Filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenEmployeeFilters}>
                <Users className="w-4 h-4 mr-2" />
                Employee Filters
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLocationFilters}>
                <MapPin className="w-4 h-4 mr-2" />
                Location Filters
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear All Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      
      {/* Spacer */}
      <div className="flex-1" />

      {/* Trinity Chat — always visible for quick access */}
      {onOpenTrinityChat && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onOpenTrinityChat}
          data-testid="button-schedule-trinity-chat"
          title="Ask Trinity"
        >
          <TrinityIconStatic size={16} />
        </Button>
      )}
      
      {/* Right: View mode + date navigation */}
      <ViewModeToggle
        viewMode={viewMode}
        selectedDay={selectedDay}
        currentMonth={currentMonth}
        onViewModeChange={onViewModeChange}
        onDayChange={onDayChange}
        onMonthChange={onMonthChange}
        compact={true}
      />
    </div>
  );
}

// React.memo prevents re-render if props haven't changed
// This is the key to preventing toolbar flicker during data updates
export const IsolatedScheduleToolbar = React.memo(ScheduleToolbarComponent);
