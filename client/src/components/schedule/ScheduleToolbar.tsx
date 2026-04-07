/**
 * Schedule Toolbar - GetSling-style action bar with core workforce management actions
 * All actions connect to Trinity orchestration for automation
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, ClipboardList, Clock, MessageSquare, BarChart3, 
  Users, Send, Settings, ChevronDown, Bot, Calendar,
  FileText, Download, Mail, Smartphone, Bell
} from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';

interface ScheduleToolbarProps {
  // Core schedule info
  weekStart: Date;
  weekEnd: Date;
  
  // Optional legacy props for backward compatibility
  isManager?: boolean;
  weekDisplay?: string;
  scheduleStats?: {
    totalShifts: number;
    publishedShifts: number;
    draftShifts: number;
    laborCost: number;
  };
  
  // New unified props - these take precedence when provided
  totalShifts?: number;
  publishedShifts?: number;
  draftShifts?: number;
  laborCost?: number;
  
  // Core actions - support both old and new naming
  onCreateShift?: () => void;
  onAddShift?: () => void;
  onWeekChange?: (start: Date, end: Date) => void;
  onPublish?: () => void;
  
  // Panel toggles - support both naming conventions  
  onOpenTasks?: () => void;
  onOpenTimeClock?: () => void;
  onOpenMessages?: () => void;
  onOpenReports?: () => void;
  onOpenAvailability?: () => void;
  onOpenSettings?: () => void;
  onAutoSchedule?: () => void;
  
  // New naming convention
  onShowTasks?: () => void;
  onShowTimeClock?: () => void;
  onShowMessages?: () => void;
  onShowReports?: () => void;
  onShowAvailability?: () => void;
  onShowSettings?: () => void;
  
  // Trinity Insights toggle
  onShowTrinityInsights?: () => void;
  showTrinityInsights?: boolean;
}

export function ScheduleToolbar({
  weekStart,
  weekEnd,
  isManager = true,
  weekDisplay,
  scheduleStats,
  totalShifts,
  publishedShifts,
  draftShifts,
  laborCost,
  onCreateShift,
  onAddShift,
  onWeekChange,
  onPublish,
  onOpenTasks,
  onOpenTimeClock,
  onOpenMessages,
  onOpenReports,
  onOpenAvailability,
  onOpenSettings,
  onAutoSchedule,
  onShowTasks,
  onShowTimeClock,
  onShowMessages,
  onShowReports,
  onShowAvailability,
  onShowSettings,
  onShowTrinityInsights,
  showTrinityInsights,
}: ScheduleToolbarProps) {
  // Resolve props - prefer new naming, fallback to legacy
  const handleCreateShift = onAddShift || onCreateShift;
  const handleTasks = onShowTasks || onOpenTasks;
  const handleTimeClock = onShowTimeClock || onOpenTimeClock;
  const handleMessages = onShowMessages || onOpenMessages;
  const handleReports = onShowReports || onOpenReports;
  const handleAvailability = onShowAvailability || onOpenAvailability;
  const handleSettings = onShowSettings || onOpenSettings;
  
  // Resolve stats - prefer individual props, fallback to scheduleStats object
  const resolvedStats = {
    totalShifts: totalShifts ?? scheduleStats?.totalShifts ?? 0,
    publishedShifts: publishedShifts ?? scheduleStats?.publishedShifts ?? 0,
    draftShifts: draftShifts ?? scheduleStats?.draftShifts ?? 0,
    laborCost: laborCost ?? scheduleStats?.laborCost ?? 0,
  };
  
  // Compute week display if not provided
  const resolvedWeekDisplay = weekDisplay || `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const { toast } = useToast();
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishOptions, setPublishOptions] = useState({
    notifySms: true,
    notifyEmail: true,
    notifyPush: true,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/schedules/publish', {
        weekStartDate: weekStart.toISOString(),
        weekEndDate: weekEnd.toISOString(),
        ...publishOptions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workspace/health'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
      setShowPublishDialog(false);
      toast({
        title: 'Schedule Published',
        description: 'All employees have been notified of their shifts',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Publish Failed',
        description: error.message,
      });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/schedules/unpublish', {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'Schedule Unpublished',
        description: 'Schedule is now in draft mode',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Unpublish Failed',
        description: error.message,
      });
    },
  });

  const isFullyPublished = resolvedStats.totalShifts > 0 && 
    resolvedStats.publishedShifts === resolvedStats.totalShifts;
  const hasDrafts = resolvedStats.draftShifts > 0;

  // SLING-STYLE: Maximum 5 primary actions, rest in "More" dropdown
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-card border-b" data-testid="schedule-toolbar">
        {isManager && (
          <>
            {/* PRIMARY ACTION 1: Create Shift */}
            <Button 
              size="sm" 
              onClick={handleCreateShift}
              data-testid="button-create-shift"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>

            {/* PRIMARY ACTION 2: Publish */}
            <Button
              variant={hasDrafts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPublishDialog(true)}
              data-testid="button-publish"
            >
              <Send className="w-4 h-4 mr-1" />
              {isFullyPublished ? 'Published' : 'Publish'}
              {hasDrafts && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {resolvedStats.draftShifts}
                </Badge>
              )}
            </Button>

            {/* PRIMARY ACTION 3: Trinity Auto-Schedule */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onAutoSchedule}
              data-testid="button-auto-schedule"
            >
              <TrinityIconStatic className="w-4 h-4 mr-1" />
              Auto-Fill
            </Button>

            {/* PRIMARY ACTION 4: Trinity Insights Panel Toggle */}
            {onShowTrinityInsights && (
              <Button
                variant={showTrinityInsights ? "default" : "outline"}
                size="sm"
                onClick={onShowTrinityInsights}
                data-testid="button-trinity-insights"
              >
                <TrinityIconStatic className="w-4 h-4 mr-1" />
                Insights
              </Button>
            )}

            {/* PRIMARY ACTION 5: More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-more-actions">
                  More
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleTasks} data-testid="menu-tasks">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Tasks
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTimeClock} data-testid="menu-time-clock">
                  <Clock className="w-4 h-4 mr-2" />
                  Time Clock
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMessages} data-testid="menu-messages">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Messages
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAvailability} data-testid="menu-availability">
                  <Users className="w-4 h-4 mr-2" />
                  Availability
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleReports} data-testid="menu-reports">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Reports
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReports} data-testid="menu-export">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSettings} data-testid="menu-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <UniversalModal open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <UniversalModalContent size="md">
          <UniversalModalHeader>
            <UniversalModalTitle>Publish Schedule</UniversalModalTitle>
            <UniversalModalDescription>
              Publish schedule for {resolvedWeekDisplay}?
            </UniversalModalDescription>
          </UniversalModalHeader>
          
          <div className="py-4 space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Preview:</strong></p>
              <p>{resolvedStats.totalShifts} shifts</p>
              <p>${resolvedStats.laborCost.toLocaleString()} estimated labor cost</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Notify employees via:</p>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="notify-sms"
                  checked={publishOptions.notifySms}
                  onCheckedChange={(checked) => 
                    setPublishOptions(prev => ({ ...prev, notifySms: !!checked }))
                  }
                />
                <Label htmlFor="notify-sms" className="flex items-center">
                  <Smartphone className="w-4 h-4 mr-2" />
                  SMS
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="notify-email"
                  checked={publishOptions.notifyEmail}
                  onCheckedChange={(checked) => 
                    setPublishOptions(prev => ({ ...prev, notifyEmail: !!checked }))
                  }
                />
                <Label htmlFor="notify-email" className="flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="notify-push"
                  checked={publishOptions.notifyPush}
                  onCheckedChange={(checked) => 
                    setPublishOptions(prev => ({ ...prev, notifyPush: !!checked }))
                  }
                />
                <Label htmlFor="notify-push" className="flex items-center">
                  <Bell className="w-4 h-4 mr-2" />
                  App Push Notification
                </Label>
              </div>
            </div>
          </div>

          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? 'Publishing...' : 'Confirm Publish'}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </>
  );
}
