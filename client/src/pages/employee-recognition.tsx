/**
 * Employee Recognition - Gamification & Achievements Dashboard
 * 
 * Features:
 * - Customizable badges with categories
 * - Leaderboards for points and achievements
 * - Recognition feed showing recent awards
 * - Badge management for admins
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Trophy, Star, Award, Medal, Crown, Flame, Target, Zap, 
  Heart, Users, Clock, TrendingUp, Gift, Sparkles, Plus,
  ChevronUp, ChevronDown, Minus
} from "lucide-react";

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'attendance' | 'performance' | 'teamwork' | 'learning' | 'milestone' | 'special';
  icon: string;
  pointValue: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  isActive: boolean;
}

interface EmployeeAchievement {
  id: string;
  employeeId: string;
  achievementId: string;
  achievement?: Achievement;
  earnedAt: string;
  awardedBy?: string;
  notes?: string;
}

interface EmployeePoints {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  totalPoints: number;
  currentLevel: number;
  currentStreak: number;
  longestStreak: number;
  achievementCount: number;
}

interface RecognitionFeedItem {
  id: string;
  employeeName: string;
  employeeAvatar?: string;
  achievementName: string;
  achievementIcon: string;
  pointsEarned: number;
  earnedAt: string;
  awardedByName?: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  attendance: Clock,
  performance: TrendingUp,
  teamwork: Users,
  learning: Star,
  milestone: Target,
  special: Gift,
};

const CATEGORY_COLORS: Record<string, string> = {
  attendance: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200',
  performance: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200',
  teamwork: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200',
  learning: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200',
  milestone: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-200',
  special: 'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-200',
};

const RARITY_COLORS: Record<string, string> = {
  common: 'border-gray-400',
  uncommon: 'border-green-500',
  rare: 'border-blue-500',
  epic: 'border-purple-500',
  legendary: 'border-amber-500 shadow-lg shadow-amber-500/20',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export default function EmployeeRecognition() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBadge, setNewBadge] = useState({
    name: '',
    description: '',
    category: 'performance',
    icon: 'trophy',
    pointValue: 100,
    rarity: 'common',
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{ leaderboard: EmployeePoints[] }>({
    queryKey: ['/api/gamification/leaderboard'],
  });

  const { data: achievementsData, isLoading: achievementsLoading } = useQuery<{ achievements: Achievement[] }>({
    queryKey: ['/api/gamification/achievements'],
  });

  const { data: feedData, isLoading: feedLoading } = useQuery<{ feed: RecognitionFeedItem[] }>({
    queryKey: ['/api/gamification/feed'],
    refetchInterval: 30000,
  });

  const createBadgeMutation = useMutation({
    mutationFn: async (badge: typeof newBadge) => {
      const response = await apiRequest('POST', '/api/gamification/achievements', badge);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Badge Created', description: 'New achievement badge has been created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/achievements'] });
      setCreateDialogOpen(false);
      setNewBadge({ name: '', description: '', category: 'performance', icon: 'trophy', pointValue: 100, rarity: 'common' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create badge', variant: 'destructive' });
    },
  });

  const leaderboard = leaderboardData?.leaderboard || [];
  const achievements = achievementsData?.achievements || [];
  const feed = feedData?.feed || [];

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-amber-500" />;
      case 2: return <Medal className="w-6 h-6 text-gray-400" />;
      case 3: return <Medal className="w-6 h-6 text-amber-700" />;
      default: return <span className="w-6 h-6 flex items-center justify-center text-muted-foreground font-medium">{rank}</span>;
    }
  };

  const getRankChange = (change: number) => {
    if (change > 0) return <ChevronUp className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ChevronDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
            <Trophy className="w-8 h-8 text-amber-500" />
            Employee Recognition
          </h1>
          <p className="text-muted-foreground mt-1">
            Celebrate achievements and track performance across your team
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-badge">
              <Plus className="w-4 h-4 mr-2" />
              Create Badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Badge</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Badge Name</Label>
                <Input
                  id="name"
                  value={newBadge.name}
                  onChange={(e) => setNewBadge({ ...newBadge, name: e.target.value })}
                  placeholder="Perfect Attendance"
                  data-testid="input-badge-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newBadge.description}
                  onChange={(e) => setNewBadge({ ...newBadge, description: e.target.value })}
                  placeholder="Awarded for perfect attendance in a month"
                  data-testid="input-badge-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={newBadge.category} onValueChange={(v) => setNewBadge({ ...newBadge, category: v })}>
                    <SelectTrigger data-testid="select-badge-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attendance">Attendance</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="teamwork">Teamwork</SelectItem>
                      <SelectItem value="learning">Learning</SelectItem>
                      <SelectItem value="milestone">Milestone</SelectItem>
                      <SelectItem value="special">Special</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rarity">Rarity</Label>
                  <Select value={newBadge.rarity} onValueChange={(v) => setNewBadge({ ...newBadge, rarity: v })}>
                    <SelectTrigger data-testid="select-badge-rarity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="common">Common</SelectItem>
                      <SelectItem value="uncommon">Uncommon</SelectItem>
                      <SelectItem value="rare">Rare</SelectItem>
                      <SelectItem value="epic">Epic</SelectItem>
                      <SelectItem value="legendary">Legendary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pointValue">Point Value</Label>
                <Input
                  id="pointValue"
                  type="number"
                  value={newBadge.pointValue}
                  onChange={(e) => setNewBadge({ ...newBadge, pointValue: parseInt(e.target.value) || 0 })}
                  data-testid="input-badge-points"
                />
              </div>
              <Button 
                className="w-full" 
                onClick={() => createBadgeMutation.mutate(newBadge)}
                disabled={createBadgeMutation.isPending || !newBadge.name}
                data-testid="button-submit-badge"
              >
                {createBadgeMutation.isPending ? 'Creating...' : 'Create Badge'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">
            <Crown className="w-4 h-4 mr-2" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="badges" data-testid="tab-badges">
            <Award className="w-4 h-4 mr-2" />
            Badges
          </TabsTrigger>
          <TabsTrigger value="feed" data-testid="tab-feed">
            <Sparkles className="w-4 h-4 mr-2" />
            Recognition Feed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Points Leaderboard
                </CardTitle>
                <CardDescription>Top performers based on recognition points</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {leaderboardLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Sparkles className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : leaderboard.length > 0 ? (
                    <div className="space-y-3">
                      {leaderboard.map((employee, index) => (
                        <div 
                          key={employee.id}
                          className={`flex items-center gap-4 p-4 rounded-lg border hover-elevate ${index < 3 ? 'bg-gradient-to-r from-amber-500/10 to-transparent' : ''}`}
                          data-testid={`leaderboard-row-${index}`}
                        >
                          <div className="w-8 flex justify-center">
                            {getRankIcon(index + 1)}
                          </div>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={employee.employeeAvatar} />
                            <AvatarFallback>{employee.employeeName?.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{employee.employeeName}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>Level {employee.currentLevel}</span>
                              <span className="text-xs">|</span>
                              <Flame className="w-3 h-3 text-orange-500" />
                              <span>{employee.currentStreak} day streak</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{employee.totalPoints.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{employee.achievementCount} badges</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <Trophy className="w-8 h-8 mb-2 opacity-50" />
                      <p>No leaderboard data yet</p>
                      <p className="text-sm">Start awarding badges to build the leaderboard</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Streak Leaders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaderboard.slice(0, 5).map((emp, i) => (
                    <div key={emp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">{emp.employeeName?.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate max-w-[120px]">{emp.employeeName}</span>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-orange-500" />
                        {emp.longestStreak}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    This Month's Stars
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaderboard.slice(0, 3).map((emp, i) => (
                    <div key={emp.id} className="flex items-center gap-3 py-2">
                      {getRankIcon(i + 1)}
                      <span className="flex-1 truncate">{emp.employeeName}</span>
                      <span className="font-medium">+{Math.floor(emp.totalPoints * 0.3)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="badges">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {achievementsLoading ? (
              <div className="col-span-full flex items-center justify-center h-32">
                <Sparkles className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : achievements.length > 0 ? (
              achievements.map((achievement) => {
                const CategoryIcon = CATEGORY_ICONS[achievement.category] || Star;
                return (
                  <Card 
                    key={achievement.id} 
                    className={`border-2 ${RARITY_COLORS[achievement.rarity]} hover-elevate`}
                    data-testid={`badge-card-${achievement.id}`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${CATEGORY_COLORS[achievement.category]}`}>
                          <CategoryIcon className="w-8 h-8" />
                        </div>
                        <h3 className="font-semibold">{achievement.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{achievement.description}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="outline" className="text-xs">
                            {RARITY_LABELS[achievement.rarity]}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            <Zap className="w-3 h-3 mr-1" />
                            {achievement.pointValue} pts
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Award className="w-8 h-8 mb-2 opacity-50" />
                <p>No badges created yet</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Badge
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="feed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Recent Recognition
              </CardTitle>
              <CardDescription>Live feed of badges and achievements awarded</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {feedLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Sparkles className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : feed.length > 0 ? (
                  <div className="space-y-4">
                    {feed.map((item) => (
                      <div key={item.id} className="flex items-start gap-4 p-4 rounded-lg border hover-elevate" data-testid={`feed-item-${item.id}`}>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={item.employeeAvatar} />
                          <AvatarFallback>{item.employeeName?.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p>
                            <span className="font-medium">{item.employeeName}</span>
                            <span className="text-muted-foreground"> earned </span>
                            <span className="font-medium text-primary">{item.achievementName}</span>
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              <Zap className="w-3 h-3 mr-1" />
                              +{item.pointsEarned}
                            </Badge>
                            <span>{formatTimeAgo(item.earnedAt)}</span>
                            {item.awardedByName && (
                              <>
                                <span className="text-xs">|</span>
                                <span className="text-xs">by {item.awardedByName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Heart className="w-8 h-8 mb-2 opacity-50" />
                    <p>No recognition yet</p>
                    <p className="text-sm">Award badges to see them here</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
