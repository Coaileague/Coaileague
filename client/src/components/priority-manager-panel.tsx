/**
 * Priority Manager Panel - VIP and tier-based user prioritization
 * Shows who gets help first based on subscription tier and VIP status
 * Uses REAL data from support tickets and workspace subscriptions
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Crown, Star, Sparkles, TrendingUp, Users, Clock,
  Award, Zap, ArrowUp, ArrowRight, Shield, AlertCircle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface PriorityUser {
  id: string;
  name: string;
  email: string;
  tier: 'elite' | 'enterprise' | 'professional' | 'free';
  vipStatus: boolean;
  priorityScore: number;
  waitTime: number;
  reason: string;
  ticketId?: string;
  avatar?: string;
}

interface PriorityManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PriorityManagerPanel({ isOpen, onClose }: PriorityManagerPanelProps) {
  
  const { data: queueData, isLoading, error } = useQuery<{ users: PriorityUser[], tierCounts: Record<string, number> }>({
    queryKey: ['/api/support/priority-queue'],
    enabled: isOpen,
    refetchInterval: 30000,
  });

  const priorityUsers = queueData?.users || [];
  const tierCounts = queueData?.tierCounts || { elite: 0, enterprise: 0, professional: 0, free: 0 };

  const getTierInfo = (tier: PriorityUser['tier']) => {
    const tiers = {
      elite: {
        color: 'bg-gradient-to-r from-blue-400 to-blue-500 text-white',
        icon: Crown,
        priority: 'CRITICAL',
        sla: '< 2 min'
      },
      enterprise: {
        color: 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white',
        icon: Star,
        priority: 'HIGH',
        sla: '< 5 min'
      },
      professional: {
        color: 'bg-gradient-to-r from-blue-500 to-accent text-white',
        icon: TrendingUp,
        priority: 'MEDIUM',
        sla: '< 15 min'
      },
      free: {
        color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
        icon: Users,
        priority: 'STANDARD',
        sla: '< 30 min'
      }
    };
    return tiers[tier];
  };

  const getPriorityColor = (score: number) => {
    if (score >= 90) return 'text-red-600 dark:text-red-400';
    if (score >= 75) return 'text-blue-600 dark:text-blue-400';
    if (score >= 50) return 'text-blue-600 dark:text-blue-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="full" className="max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-blue-500" />
            Priority Queue Manager
          </DialogTitle>
          <DialogDescription>
            VIP and tier-based user prioritization - who gets help first
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4 flex-1 overflow-y-auto">
          {/* Priority Tiers Legend */}
          <div className="col-span-12">
            <div className="grid grid-cols-4 gap-3">
              {(['elite', 'enterprise', 'professional', 'free'] as const).map((tier) => {
                const info = getTierInfo(tier);
                const TierIcon = info.icon;
                const count = tierCounts[tier] || 0;
                
                return (
                  <Card key={tier} className="overflow-hidden">
                    <div className={`p-3 ${info.color}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TierIcon className="w-4 h-4" />
                          <span className="font-bold text-sm uppercase">{tier}</span>
                        </div>
                        <Badge variant="secondary" className="bg-white/20 text-inherit border-0">
                          {isLoading ? <Skeleton className="h-4 w-4" /> : count}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs opacity-90">
                        <span>{info.priority}</span>
                        <span>SLA: {info.sla}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Priority Queue List */}
          <div className="col-span-12">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Priority Queue Order</CardTitle>
                  <Badge variant="outline" className="font-normal">
                    <Clock className="w-3 h-3 mr-1" />
                    Real-time sorting
                  </Badge>
                </div>
                <CardDescription>
                  Users are automatically sorted by tier, VIP status, and wait time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[50vh]">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-12 w-12 rounded-lg" />
                            <div className="flex-1">
                              <Skeleton className="h-4 w-32 mb-2" />
                              <Skeleton className="h-3 w-48" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      <p className="text-sm">Failed to load priority queue</p>
                    </div>
                  ) : priorityUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Users className="w-8 h-8 mb-2" />
                      <p className="text-sm">No users currently waiting in queue</p>
                      <p className="text-xs mt-1">Queue updates in real-time when support requests arrive</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {priorityUsers.map((user, index) => {
                        const tierInfo = getTierInfo(user.tier);
                        const TierIcon = tierInfo.icon;
                        
                        return (
                          <div
                            key={user.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover-elevate active-elevate-2 transition-all"
                            data-testid={`priority-user-${user.id}`}
                          >
                            <div className="flex items-center gap-4">
                              {/* Position */}
                              <div className="flex-shrink-0 flex flex-col items-center">
                                <div className={`text-2xl font-bold ${getPriorityColor(user.priorityScore)}`}>
                                  #{index + 1}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {user.priorityScore}
                                </div>
                              </div>

                              {/* Tier Badge */}
                              <div className="flex-shrink-0">
                                <div className={`w-12 h-12 rounded-lg ${tierInfo.color} flex items-center justify-center relative`}>
                                  <TierIcon className="w-6 h-6" />
                                  {user.vipStatus && (
                                    <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-blue-400" />
                                  )}
                                </div>
                              </div>

                              {/* User Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-sm truncate">{user.name}</h3>
                                  {user.vipStatus && (
                                    <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100 text-[10px] px-1.5 py-0">
                                      VIP
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                <p className="text-xs text-muted-foreground mt-1">{user.reason}</p>
                              </div>

                              {/* Wait Time & SLA */}
                              <div className="flex-shrink-0 text-right">
                                <div className="flex items-center gap-1 justify-end mb-1">
                                  <Clock className="w-3 h-3" />
                                  <span className="text-sm font-medium">{user.waitTime}m</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  SLA: {tierInfo.sla}
                                </div>
                                {user.waitTime > parseInt(tierInfo.sla.match(/\d+/)?.[0] || '30') && (
                                  <Badge variant="destructive" className="text-[10px] mt-1">
                                    SLA breach
                                  </Badge>
                                )}
                              </div>

                              {/* Action */}
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-shrink-0"
                                data-testid={`action-help-${user.id}`}
                              >
                                <Zap className="w-3.5 h-3.5 mr-1" />
                                Help Now
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Priority Rules */}
          <div className="col-span-12">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Priority Calculation Rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <ArrowUp className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Tier Weight</p>
                      <p className="text-muted-foreground">Elite: 50pts, Enterprise: 40pts, Pro: 25pts, Free: 10pts</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">VIP Bonus</p>
                      <p className="text-muted-foreground">+25 priority points for flagged VIP users</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Wait Time</p>
                      <p className="text-muted-foreground">+1 point per minute waiting (max +25pts)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-muted-foreground">
            {priorityUsers.length} users in priority queue
          </div>
          <Button size="sm" variant="outline" onClick={onClose} data-testid="button-close-priority">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
