import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Trophy, Star, Zap, Target, Award, Crown, 
  Flame, Rocket, Shield, Clock, Users, Calendar,
  CheckCircle2, Lock, Sparkles
} from "lucide-react";

interface FeatureBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  feature: string;
  requirement: string;
  progress: number;
  maxProgress: number;
  isUnlocked: boolean;
  unlockedAt?: string;
  xpReward: number;
}

const BADGE_ICONS: Record<string, React.ReactNode> = {
  trophy: <Trophy className="h-6 w-6" />,
  star: <Star className="h-6 w-6" />,
  zap: <Zap className="h-6 w-6" />,
  target: <Target className="h-6 w-6" />,
  award: <Award className="h-6 w-6" />,
  crown: <Crown className="h-6 w-6" />,
  flame: <Flame className="h-6 w-6" />,
  rocket: <Rocket className="h-6 w-6" />,
  shield: <Shield className="h-6 w-6" />,
  clock: <Clock className="h-6 w-6" />,
  users: <Users className="h-6 w-6" />,
  calendar: <Calendar className="h-6 w-6" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  beginner: 'from-green-500 to-emerald-500',
  intermediate: 'from-blue-500 to-cyan-500',
  advanced: 'from-purple-500 to-pink-500',
  expert: 'from-amber-500 to-orange-500',
};

const DEFAULT_BADGES: FeatureBadge[] = [
  { id: 'first-clock', name: 'First Clock-In', description: 'Complete your first clock-in', icon: 'clock', category: 'beginner', feature: 'time-tracking', requirement: 'Clock in once', progress: 1, maxProgress: 1, isUnlocked: true, xpReward: 50 },
  { id: 'schedule-master', name: 'Schedule Master', description: 'View your schedule 5 times', icon: 'calendar', category: 'beginner', feature: 'scheduling', requirement: 'View schedule 5 times', progress: 3, maxProgress: 5, isUnlocked: false, xpReward: 100 },
  { id: 'team-player', name: 'Team Player', description: 'Complete 10 shifts', icon: 'users', category: 'intermediate', feature: 'shifts', requirement: 'Complete 10 shifts', progress: 7, maxProgress: 10, isUnlocked: false, xpReward: 200 },
  { id: 'early-bird', name: 'Early Bird', description: 'Clock in on time 5 days in a row', icon: 'zap', category: 'intermediate', feature: 'time-tracking', requirement: '5-day streak', progress: 2, maxProgress: 5, isUnlocked: false, xpReward: 150 },
  { id: 'power-user', name: 'Power User', description: 'Use all platform features', icon: 'rocket', category: 'advanced', feature: 'platform', requirement: 'Use all features', progress: 6, maxProgress: 10, isUnlocked: false, xpReward: 500 },
  { id: 'champion', name: 'Champion', description: 'Top performer of the month', icon: 'trophy', category: 'expert', feature: 'performance', requirement: 'Be top performer', progress: 0, maxProgress: 1, isUnlocked: false, xpReward: 1000 },
];

const BADGE_STORAGE_KEY = 'feature_adoption_badges';

function getStoredBadgeProgress(): Record<string, { progress: number; isUnlocked: boolean }> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(BADGE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

interface FeatureAdoptionBadgesProps {
  userId?: number;
  compact?: boolean;
}

export function FeatureAdoptionBadges({ userId, compact = false }: FeatureAdoptionBadgesProps) {
  const [badges, setBadges] = useState<FeatureBadge[]>(DEFAULT_BADGES);
  
  useEffect(() => {
    const stored = getStoredBadgeProgress();
    setBadges(DEFAULT_BADGES.map(b => ({
      ...b,
      progress: stored[b.id]?.progress ?? b.progress,
      isUnlocked: stored[b.id]?.isUnlocked ?? b.isUnlocked,
    })));
  }, []);

  const totalXP = badges.filter(b => b.isUnlocked).reduce((sum, b) => sum + b.xpReward, 0);
  const level = Math.floor(totalXP / 1000) + 1;
  
  const unlockedBadges = badges.filter(b => b.isUnlocked);
  const lockedBadges = badges.filter(b => !b.isUnlocked);
  const nextToUnlock = lockedBadges.sort((a, b) => (b.progress / b.maxProgress) - (a.progress / a.maxProgress))[0];

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500">
            <Trophy className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">Level {level}</p>
            <p className="text-xs text-muted-foreground">{totalXP} XP</p>
          </div>
        </div>
        <div className="flex -space-x-2">
          {unlockedBadges.slice(0, 3).map((badge) => (
            <div
              key={badge.id}
              className={`h-8 w-8 rounded-full bg-gradient-to-r ${CATEGORY_COLORS[badge.category]} flex items-center justify-center text-white border-2 border-background`}
              title={badge.name}
            >
              {BADGE_ICONS[badge.icon] || <Star className="h-4 w-4" />}
            </div>
          ))}
          {unlockedBadges.length > 3 && (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
              +{unlockedBadges.length - 3}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="p-6" data-testid="feature-adoption-badges">
      {/* Header with Level and XP */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse-glow">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Feature Adoption</h3>
            <p className="text-sm text-muted-foreground">Level {level} • {totalXP} XP</p>
          </div>
        </div>
        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
          {unlockedBadges.length}/{badges.length} Badges
        </Badge>
      </div>

      {/* Progress to Next Level */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Progress to Level {level + 1}</span>
          <span className="font-medium">{totalXP % 1000} / 1000 XP</span>
        </div>
        <Progress value={(totalXP % 1000) / 10} className="h-2" />
      </div>

      {/* Next Badge to Unlock */}
      {nextToUnlock && (
        <div className="mb-6 p-4 rounded-xl bg-muted/50 border border-dashed">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl bg-gradient-to-r ${CATEGORY_COLORS[nextToUnlock.category]} opacity-50`}>
              {BADGE_ICONS[nextToUnlock.icon] || <Star className="h-6 w-6 text-white" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{nextToUnlock.name}</p>
                <Badge variant="outline" className="text-xs">
                  +{nextToUnlock.xpReward} XP
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{nextToUnlock.requirement}</p>
              <Progress 
                value={(nextToUnlock.progress / nextToUnlock.maxProgress) * 100} 
                className="h-1.5 mt-2" 
              />
            </div>
          </div>
        </div>
      )}

      {/* Unlocked Badges Grid */}
      {unlockedBadges.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Unlocked ({unlockedBadges.length})
          </h4>
          <div className="grid grid-cols-4 gap-3">
            {unlockedBadges.map((badge) => (
              <div
                key={badge.id}
                className="group relative flex flex-col items-center p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                title={`${badge.name}: ${badge.description}`}
              >
                <div className={`p-3 rounded-xl bg-gradient-to-r ${CATEGORY_COLORS[badge.category]} mb-2 group-hover:scale-110 transition-transform`}>
                  {BADGE_ICONS[badge.icon] || <Star className="h-5 w-5 text-white" />}
                </div>
                <span className="text-xs font-medium text-center line-clamp-1">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Badges */}
      {lockedBadges.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Locked ({lockedBadges.length})
          </h4>
          <div className="grid grid-cols-4 gap-3">
            {lockedBadges.slice(0, 8).map((badge) => (
              <div
                key={badge.id}
                className="flex flex-col items-center p-3 rounded-xl opacity-50"
                title={`${badge.name}: ${badge.requirement}`}
              >
                <div className="p-3 rounded-xl bg-muted mb-2">
                  {BADGE_ICONS[badge.icon] || <Star className="h-5 w-5" />}
                </div>
                <span className="text-xs text-center line-clamp-1">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function BadgeUnlockedNotification({ badge }: { badge: FeatureBadge }) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] animate-success-pop" data-testid="badge-unlocked-notification">
      <Card className="p-4 w-80 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30">
        <div className="flex items-start gap-3">
          <div className={`p-3 rounded-xl bg-gradient-to-r ${CATEGORY_COLORS[badge.category]} animate-pulse-glow`}>
            {BADGE_ICONS[badge.icon] || <Star className="h-6 w-6 text-white" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-amber-500 animate-sparkles-combined" />
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Badge Unlocked!</span>
            </div>
            <p className="font-medium">{badge.name}</p>
            <p className="text-sm text-muted-foreground">{badge.description}</p>
            <Badge className="mt-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              +{badge.xpReward} XP
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
