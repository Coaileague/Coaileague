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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        ...publishOptions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/week/stats'] });
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

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" data-testid="schedule-toolbar">
        {isManager && (
          <>
            <Button 
              size="sm" 
              onClick={handleCreateShift}
              data-testid="button-create-shift"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Shift
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTasks}
              data-testid="button-tasks"
            >
              <ClipboardList className="w-4 h-4 mr-1" />
              Tasks
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTimeClock}
              data-testid="button-time-clock"
            >
              <Clock className="w-4 h-4 mr-1" />
              Time Clock
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleMessages}
              data-testid="button-messages"
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Messages
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-reports">
                  <BarChart3 className="w-4 h-4 mr-1" />
                  Reports
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleReports} data-testid="menu-labor-cost">
                  <FileText className="w-4 h-4 mr-2" />
                  Labor Cost Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReports} data-testid="menu-hours-summary">
                  <Clock className="w-4 h-4 mr-2" />
                  Hours Worked Summary
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReports} data-testid="menu-adherence">
                  <Users className="w-4 h-4 mr-2" />
                  Schedule Adherence
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleReports} data-testid="menu-export">
                  <Download className="w-4 h-4 mr-2" />
                  Export to Excel/PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAvailability}
              data-testid="button-availability"
            >
              <Users className="w-4 h-4 mr-1" />
              Availability
            </Button>

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

            <Button 
              variant="outline" 
              size="sm" 
              onClick={onAutoSchedule}
              className="text-primary"
              data-testid="button-auto-schedule"
            >
              <TrinityIconStatic className="w-4 h-4 mr-1" />
              Auto-Schedule
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSettings}
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            {/* Trinity Insights Toggle */}
            {onShowTrinityInsights && (
              <Button
                variant={showTrinityInsights ? "default" : "outline"}
                size="sm"
                onClick={onShowTrinityInsights}
                className={showTrinityInsights ? "bg-gradient-to-r from-[#00BFFF] to-[#FFD700] text-white" : ""}
                data-testid="button-trinity-insights"
              >
                <TrinityIconStatic className="w-4 h-4 mr-1" />
                Trinity Insights
              </Button>
            )}
          </>
        )}
      </div>

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Publish Schedule</DialogTitle>
            <DialogDescription>
              Publish schedule for {resolvedWeekDisplay}?
            </DialogDescription>
          </DialogHeader>
          
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? 'Publishing...' : 'Confirm Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
