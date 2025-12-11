import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Clock, DollarSign, Calendar, Users, TrendingUp, 
  GripVertical, Settings2, Sparkles, Trophy, Target,
  Zap, CheckCircle2, AlertCircle, ArrowUp, ArrowDown,
  Star, Flame, Award, Medal, Crown, Timer, FileText,
  ChevronRight, Eye, EyeOff, Plus, RefreshCw, Brain,
  Lightbulb, ThumbsUp, LayoutGrid, Maximize2, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "framer-motion";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryClient } from "@/lib/queryClient";

// Widget Types
interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'list' | 'ai-insight' | 'gamification';
  title: string;
  description: string;
  icon: string;
  size: 'sm' | 'md' | 'lg' | 'xl';
  enabled: boolean;
  order: number;
  category: 'analytics' | 'scheduling' | 'finance' | 'engagement' | 'ai';
}

interface MetricData {
  totalHoursTracked: number;
  hoursThisWeek: number;
  hoursTrend: number;
  pendingInvoices: number;
  invoiceTotal: number;
  invoiceTrend: number;
  upcomingShifts: number;
  shiftsToday: number;
  activeEmployees: number;
  employeeTrend: number;
}

interface AIScheduleSuggestion {
  id: string;
  type: 'optimization' | 'conflict' | 'coverage' | 'efficiency';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  savings?: string;
  confidence: number;
  actionable: boolean;
}

interface GamificationStats {
  points: number;
  level: number;
  streak: number;
  rank: number;
  totalUsers: number;
  badges: Badge[];
  recentAchievements: Achievement[];
}

interface Badge {
  id: string;
  name: string;
  icon: string;
  earned: boolean;
  progress: number;
  description: string;
}

interface Achievement {
  id: string;
  title: string;
  earnedAt: string;
  points: number;
}

// Storage key for widget config
const WIDGET_CONFIG_KEY = 'enhanced_dashboard_widgets';

// Default widgets configuration
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'hours-tracked', type: 'metric', title: 'Hours Tracked', description: 'Total hours this period', icon: 'clock', size: 'md', enabled: true, order: 1, category: 'analytics' },
  { id: 'pending-invoices', type: 'metric', title: 'Pending Invoices', description: 'Awaiting payment', icon: 'dollar', size: 'md', enabled: true, order: 2, category: 'finance' },
  { id: 'upcoming-shifts', type: 'metric', title: 'Upcoming Shifts', description: 'Next 7 days', icon: 'calendar', size: 'md', enabled: true, order: 3, category: 'scheduling' },
  { id: 'active-team', type: 'metric', title: 'Active Team', description: 'Currently working', icon: 'users', size: 'md', enabled: true, order: 4, category: 'analytics' },
  { id: 'ai-suggestions', type: 'ai-insight', title: 'AI Schedule Optimizer', description: 'Smart recommendations', icon: 'brain', size: 'lg', enabled: true, order: 5, category: 'ai' },
  { id: 'engagement-stats', type: 'gamification', title: 'Your Progress', description: 'Points & achievements', icon: 'trophy', size: 'lg', enabled: true, order: 6, category: 'engagement' },
  { id: 'leaderboard', type: 'list', title: 'Team Leaderboard', description: 'Top performers', icon: 'medal', size: 'md', enabled: true, order: 7, category: 'engagement' },
  { id: 'quick-actions', type: 'list', title: 'Quick Actions', description: 'Common tasks', icon: 'zap', size: 'sm', enabled: true, order: 8, category: 'analytics' },
];

// Icon mapping
const ICONS: Record<string, typeof Clock> = {
  clock: Clock,
  dollar: DollarSign,
  calendar: Calendar,
  users: Users,
  trending: TrendingUp,
  brain: Brain,
  trophy: Trophy,
  medal: Medal,
  zap: Zap,
  target: Target,
  star: Star,
  flame: Flame,
  award: Award,
  crown: Crown,
};

// Load saved widget config
function loadWidgetConfig(): DashboardWidget[] {
  try {
    const saved = localStorage.getItem(WIDGET_CONFIG_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      return DEFAULT_WIDGETS.map(w => ({
        ...w,
        enabled: config[w.id]?.enabled ?? w.enabled,
        order: config[w.id]?.order ?? w.order,
      })).sort((a, b) => a.order - b.order);
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

// Save widget config
function saveWidgetConfig(widgets: DashboardWidget[]) {
  const config = widgets.reduce((acc, w, i) => ({
    ...acc,
    [w.id]: { enabled: w.enabled, order: i + 1 }
  }), {});
  localStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(config));
}

// Sortable Widget Item
function SortableWidget({ 
  widget, 
  children, 
  isEditMode 
}: { 
  widget: DashboardWidget; 
  children: React.ReactNode;
  isEditMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sizeClasses = {
    sm: 'col-span-1',
    md: 'col-span-1 md:col-span-2',
    lg: 'col-span-1 md:col-span-2 lg:col-span-3',
    xl: 'col-span-1 md:col-span-2 lg:col-span-4',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        sizeClasses[widget.size],
        'relative group',
        isDragging && 'z-50'
      )}
      data-testid={`widget-${widget.id}`}
    >
      {isEditMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-2 -left-2 z-10 p-1.5 rounded-full bg-primary text-primary-foreground cursor-grab active:cursor-grabbing shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {children}
    </div>
  );
}

// Metric Widget Component
function MetricWidget({ 
  title, 
  value, 
  subtitle,
  trend,
  icon: IconName,
  loading = false,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  const Icon = ICONS[IconName] || Clock;
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-4 md:p-6">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "h-full hover-elevate transition-all duration-200",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trend.value >= 0 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {trend.value >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-2xl md:text-3xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// AI Suggestions Widget
function AIScheduleSuggestionsWidget({ loading = false }: { loading?: boolean }) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<AIScheduleSuggestion | null>(null);
  const isMobile = useIsMobile();

  const { data: suggestions, isLoading, refetch } = useQuery<{ suggestions: AIScheduleSuggestion[] }>({
    queryKey: ['/api/ai/scheduling', 'suggestions'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const applySuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      return apiPost('/api/ai/scheduling/apply-suggestion', { suggestionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/scheduling/suggestions'] });
      setSelectedSuggestion(null);
    },
  });

  // Mock data for demo
  const mockSuggestions: AIScheduleSuggestion[] = [
    {
      id: '1',
      type: 'optimization',
      title: 'Optimize Monday Coverage',
      description: 'Based on historical data, you could reduce staffing by 15% during 2-4 PM without impacting service.',
      impact: 'high',
      savings: '$240/week',
      confidence: 92,
      actionable: true,
    },
    {
      id: '2',
      type: 'conflict',
      title: 'Shift Conflict Detected',
      description: 'Sarah J. is scheduled for overlapping shifts on Dec 15th. Consider reassigning the afternoon shift.',
      impact: 'high',
      confidence: 100,
      actionable: true,
    },
    {
      id: '3',
      type: 'coverage',
      title: 'Weekend Gap Alert',
      description: 'Saturday evening shift is understaffed. 3 employees with availability could fill this gap.',
      impact: 'medium',
      confidence: 85,
      actionable: true,
    },
  ];

  const displaySuggestions = suggestions?.suggestions || mockSuggestions;

  if (loading || isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Schedule Optimizer</CardTitle>
              <CardDescription>Smart recommendations to improve efficiency</CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()}
            data-testid="button-refresh-ai-suggestions"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence mode="popLayout">
          {displaySuggestions.map((suggestion, index) => (
            <motion.div
              key={suggestion.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.1 }}
            >
              <div
                className={cn(
                  "p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer",
                  "hover:border-primary/50 hover:shadow-md",
                  suggestion.impact === 'high' && "border-l-4 border-l-amber-500",
                  suggestion.impact === 'medium' && "border-l-4 border-l-blue-500",
                  suggestion.impact === 'low' && "border-l-4 border-l-gray-400"
                )}
                onClick={() => setSelectedSuggestion(suggestion)}
                data-testid={`card-ai-suggestion-${suggestion.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <span className="font-medium text-sm truncate">{suggestion.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {suggestion.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {suggestion.savings && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {suggestion.savings}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {suggestion.confidence}% confidence
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>

      {/* Suggestion Detail Dialog */}
      <Dialog open={!!selectedSuggestion} onOpenChange={() => setSelectedSuggestion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {selectedSuggestion?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {selectedSuggestion?.description}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <div className="flex items-center gap-2">
                  <Progress value={selectedSuggestion?.confidence || 0} className="h-2" />
                  <span className="text-sm font-medium">{selectedSuggestion?.confidence}%</span>
                </div>
              </div>
              {selectedSuggestion?.savings && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Estimated Savings</p>
                  <p className="text-lg font-bold text-green-600">{selectedSuggestion.savings}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setSelectedSuggestion(null)}
            >
              Dismiss
            </Button>
            {selectedSuggestion?.actionable && (
              <Button 
                className="flex-1 gap-2"
                onClick={() => selectedSuggestion && applySuggestion.mutate(selectedSuggestion.id)}
                disabled={applySuggestion.isPending}
                data-testid="button-apply-suggestion"
              >
                <ThumbsUp className="h-4 w-4" />
                Apply Suggestion
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Gamification Stats Widget
function GamificationWidget({ loading = false }: { loading?: boolean }) {
  const { data: stats, isLoading } = useQuery<GamificationStats>({
    queryKey: ['/api/gamification/enhanced', 'stats'],
    staleTime: 60 * 1000,
  });

  // Mock data for demo
  const mockStats: GamificationStats = {
    points: 2450,
    level: 12,
    streak: 7,
    rank: 3,
    totalUsers: 25,
    badges: [
      { id: '1', name: 'Early Bird', icon: 'star', earned: true, progress: 100, description: 'Clock in before 8 AM for 5 days' },
      { id: '2', name: 'Time Master', icon: 'clock', earned: true, progress: 100, description: 'Track 40+ hours in a week' },
      { id: '3', name: 'Team Player', icon: 'users', earned: false, progress: 75, description: 'Help 10 coworkers with shifts' },
      { id: '4', name: 'Perfect Week', icon: 'trophy', earned: false, progress: 60, description: 'No missed shifts in a week' },
    ],
    recentAchievements: [
      { id: '1', title: 'Completed 100 hours', earnedAt: '2 days ago', points: 50 },
      { id: '2', title: '7 Day Streak!', earnedAt: 'Today', points: 100 },
    ],
  };

  const displayStats = stats || mockStats;

  if (loading || isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="p-6">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-20 w-full mb-4" />
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-12 w-12 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Your Progress</CardTitle>
              <CardDescription>Level {displayStats.level} Champion</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
              {displayStats.streak} day streak
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Points & Level */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{displayStats.level}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-background shadow">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Total Points</p>
            <p className="text-2xl font-bold">{displayStats.points.toLocaleString()}</p>
            <div className="mt-1">
              <Progress value={65} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">350 points to Level {displayStats.level + 1}</p>
            </div>
          </div>
        </div>

        {/* Rank */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium">Team Ranking</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">#{displayStats.rank}</span>
            <span className="text-sm text-muted-foreground">of {displayStats.totalUsers}</span>
          </div>
        </div>

        {/* Badges */}
        <div>
          <p className="text-sm font-medium mb-3">Badges</p>
          <div className="grid grid-cols-4 gap-3">
            {displayStats.badges.map((badge) => {
              const BadgeIcon = ICONS[badge.icon] || Star;
              return (
                <div
                  key={badge.id}
                  className={cn(
                    "relative flex flex-col items-center p-2 rounded-lg transition-all",
                    badge.earned 
                      ? "bg-primary/10" 
                      : "bg-muted/50 opacity-60"
                  )}
                  title={badge.description}
                  data-testid={`badge-${badge.id}`}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    badge.earned 
                      ? "bg-gradient-to-br from-amber-400 to-orange-500" 
                      : "bg-muted"
                  )}>
                    <BadgeIcon className={cn(
                      "h-5 w-5",
                      badge.earned ? "text-white" : "text-muted-foreground"
                    )} />
                  </div>
                  <span className="text-[10px] font-medium mt-1 text-center leading-tight">
                    {badge.name}
                  </span>
                  {!badge.earned && badge.progress > 0 && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8">
                      <Progress value={badge.progress} className="h-1" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Achievements */}
        {displayStats.recentAchievements.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Recent Achievements</p>
            <div className="space-y-2">
              {displayStats.recentAchievements.slice(0, 2).map((achievement) => (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-900/20"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{achievement.title}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    +{achievement.points}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Leaderboard Widget
function LeaderboardWidget({ loading = false }: { loading?: boolean }) {
  const { data: leaderboard, isLoading } = useQuery<{ users: any[] }>({
    queryKey: ['/api/gamification/enhanced', 'leaderboard'],
    staleTime: 60 * 1000,
  });

  const mockLeaderboard = [
    { id: '1', name: 'Sarah Johnson', points: 3200, rank: 1, avatar: null, trend: 'up' },
    { id: '2', name: 'Mike Chen', points: 2890, rank: 2, avatar: null, trend: 'same' },
    { id: '3', name: 'You', points: 2450, rank: 3, avatar: null, trend: 'up', isCurrentUser: true },
    { id: '4', name: 'Emma Wilson', points: 2100, rank: 4, avatar: null, trend: 'down' },
    { id: '5', name: 'James Brown', points: 1950, rank: 5, avatar: null, trend: 'up' },
  ];

  const displayLeaderboard = leaderboard?.users || mockLeaderboard;

  if (loading || isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <Medal className="h-4 w-4 text-white" />
          </div>
          <CardTitle className="text-base">Team Leaderboard</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayLeaderboard.map((user: any, index: number) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg transition-colors",
              user.isCurrentUser 
                ? "bg-primary/10 border border-primary/20" 
                : "hover:bg-muted/50"
            )}
            data-testid={`leaderboard-row-${user.rank}`}
          >
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
              user.rank === 1 && "bg-gradient-to-br from-amber-400 to-yellow-500 text-white",
              user.rank === 2 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800",
              user.rank === 3 && "bg-gradient-to-br from-amber-600 to-amber-700 text-white",
              user.rank > 3 && "bg-muted text-muted-foreground"
            )}>
              {user.rank === 1 ? <Crown className="h-4 w-4" /> : user.rank}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                user.isCurrentUser && "text-primary"
              )}>
                {user.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold">{user.points.toLocaleString()}</span>
              {user.trend === 'up' && <ArrowUp className="h-3 w-3 text-green-500" />}
              {user.trend === 'down' && <ArrowDown className="h-3 w-3 text-red-500" />}
            </div>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

// Quick Actions Widget
function QuickActionsWidget() {
  const actions = [
    { id: 'clock-in', label: 'Clock In', icon: Timer, color: 'bg-green-500' },
    { id: 'request-pto', label: 'Request PTO', icon: Calendar, color: 'bg-blue-500' },
    { id: 'view-schedule', label: 'My Schedule', icon: Clock, color: 'bg-purple-500' },
    { id: 'submit-timesheet', label: 'Submit Timesheet', icon: FileText, color: 'bg-orange-500' },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto py-3 flex-col gap-2 hover-elevate"
              data-testid={`button-action-${action.id}`}
            >
              <div className={cn("p-2 rounded-lg", action.color)}>
                <action.icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Widget Customizer Sheet
function WidgetCustomizer({
  widgets,
  onToggle,
  onReorder,
}: {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onReorder: (widgets: DashboardWidget[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const enabledWidgets = widgets.filter(w => w.enabled);
  const disabledWidgets = widgets.filter(w => !w.enabled);

  const content = (
    <div className="space-y-6 py-4">
      {/* Enabled Widgets */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-green-500" />
          Visible Widgets ({enabledWidgets.length})
        </h4>
        <div className="space-y-2">
          {enabledWidgets.map((widget) => {
            const Icon = ICONS[widget.icon] || Star;
            return (
              <div
                key={widget.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{widget.title}</p>
                    <p className="text-xs text-muted-foreground">{widget.description}</p>
                  </div>
                </div>
                <Switch
                  checked={widget.enabled}
                  onCheckedChange={() => onToggle(widget.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Widgets */}
      {disabledWidgets.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            Available Widgets ({disabledWidgets.length})
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {disabledWidgets.map((widget) => {
              const Icon = ICONS[widget.icon] || Star;
              return (
                <div
                  key={widget.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-dashed hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onToggle(widget.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{widget.title}</p>
                      <p className="text-xs text-muted-foreground">{widget.category}</p>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-customize-dashboard">
            <LayoutGrid className="h-4 w-4" />
            Customize
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Customize Dashboard
            </SheetTitle>
            <SheetDescription>
              Toggle widgets on/off and drag to reorder
            </SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-customize-dashboard">
          <LayoutGrid className="h-4 w-4" />
          Customize Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Dashboard Widgets
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// Main Enhanced Dashboard Component
export function EnhancedDashboard() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Load saved config on mount
  useEffect(() => {
    setWidgets(loadWidgetConfig());
  }, []);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch metrics data from backend
  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricData>({
    queryKey: ['/api/dashboard', 'metrics'],
    staleTime: 30 * 1000,
  });

  // Fallback metrics when API is loading or returns no data
  const displayMetrics: MetricData = metrics || {
    totalHoursTracked: 1284,
    hoursThisWeek: 156,
    hoursTrend: 12,
    pendingInvoices: 8,
    invoiceTotal: 24500,
    invoiceTrend: -5,
    upcomingShifts: 23,
    shiftsToday: 6,
    activeEmployees: 18,
    employeeTrend: 8,
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        saveWidgetConfig(newItems);
        return newItems;
      });
    }
  };

  const handleToggleWidget = (id: string) => {
    setWidgets((prev) => {
      const newWidgets = prev.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled } : w
      );
      saveWidgetConfig(newWidgets);
      return newWidgets;
    });
  };

  const enabledWidgets = widgets.filter((w) => w.enabled);

  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.id) {
      case 'hours-tracked':
        return (
          <MetricWidget
            title="Hours Tracked"
            value={displayMetrics.hoursThisWeek}
            subtitle="This week"
            trend={{ value: displayMetrics.hoursTrend, label: 'vs last week' }}
            icon="clock"
            loading={metricsLoading}
          />
        );
      case 'pending-invoices':
        return (
          <MetricWidget
            title="Pending Invoices"
            value={displayMetrics.pendingInvoices}
            subtitle={`$${displayMetrics.invoiceTotal.toLocaleString()} total`}
            trend={{ value: displayMetrics.invoiceTrend, label: 'vs last month' }}
            icon="dollar"
            loading={metricsLoading}
          />
        );
      case 'upcoming-shifts':
        return (
          <MetricWidget
            title="Upcoming Shifts"
            value={displayMetrics.upcomingShifts}
            subtitle={`${displayMetrics.shiftsToday} today`}
            icon="calendar"
            loading={metricsLoading}
          />
        );
      case 'active-team':
        return (
          <MetricWidget
            title="Active Team"
            value={displayMetrics.activeEmployees}
            subtitle="Currently clocked in"
            trend={{ value: displayMetrics.employeeTrend, label: 'vs yesterday' }}
            icon="users"
            loading={metricsLoading}
          />
        );
      case 'ai-suggestions':
        return <AIScheduleSuggestionsWidget />;
      case 'engagement-stats':
        return <GamificationWidget />;
      case 'leaderboard':
        return <LeaderboardWidget />;
      case 'quick-actions':
        return <QuickActionsWidget />;
      default:
        return (
          <Card className="h-full p-4">
            <p className="text-muted-foreground">{widget.title}</p>
          </Card>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Your personalized overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(!isEditMode)}
            className="gap-2"
            data-testid="button-toggle-edit-mode"
          >
            {isEditMode ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Done Editing
              </>
            ) : (
              <>
                <GripVertical className="h-4 w-4" />
                Reorder
              </>
            )}
          </Button>
          <WidgetCustomizer
            widgets={widgets}
            onToggle={handleToggleWidget}
            onReorder={setWidgets}
          />
        </div>
      </div>

      {/* Drag and Drop Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={enabledWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {enabledWidgets.map((widget) => (
              <SortableWidget key={widget.id} widget={widget} isEditMode={isEditMode}>
                {renderWidget(widget)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 scale-105">
              {renderWidget(enabledWidgets.find((w) => w.id === activeId)!)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Empty State */}
      {enabledWidgets.length === 0 && (
        <div className="text-center py-12">
          <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No widgets visible</h3>
          <p className="text-muted-foreground mb-4">
            Add widgets to your dashboard to see your key metrics
          </p>
          <WidgetCustomizer
            widgets={widgets}
            onToggle={handleToggleWidget}
            onReorder={setWidgets}
          />
        </div>
      )}
    </div>
  );
}

export { MetricWidget, AIScheduleSuggestionsWidget, GamificationWidget, LeaderboardWidget, QuickActionsWidget };
