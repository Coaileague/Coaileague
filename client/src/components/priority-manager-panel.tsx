/**
 * Priority Manager Panel - VIP and tier-based user prioritization
 * Shows who gets help first based on subscription tier and VIP status
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Crown, Star, Sparkles, TrendingUp, Users, Clock,
  Award, Zap, ArrowUp, ArrowRight, Shield
} from "lucide-react";

interface PriorityUser {
  id: string;
  name: string;
  email: string;
  tier: 'elite' | 'enterprise' | 'professional' | 'free';
  vipStatus: boolean;
  priorityScore: number;
  waitTime: number;
  reason: string;
  avatar?: string;
}

interface PriorityManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PriorityManagerPanel({ isOpen, onClose }: PriorityManagerPanelProps) {
  
  const mockPriorityUsers: PriorityUser[] = [
    {
      id: '1',
      name: 'Victoria Sterling',
      email: 'victoria@enterprise.com',
      tier: 'elite',
      vipStatus: true,
      priorityScore: 100,
      waitTime: 0,
      reason: 'Elite tier + VIP status + Critical issue',
    },
    {
      id: '2',
      name: 'Marcus Chen',
      email: 'mchen@bigcorp.com',
      tier: 'enterprise',
      vipStatus: true,
      priorityScore: 95,
      waitTime: 2,
      reason: 'Enterprise tier + VIP flag',
    },
    {
      id: '3',
      name: 'Rachel Foster',
      email: 'rfoster@company.net',
      tier: 'enterprise',
      vipStatus: false,
      priorityScore: 85,
      waitTime: 5,
      reason: 'Enterprise tier subscriber',
    },
    {
      id: '4',
      name: 'David Park',
      email: 'dpark@business.io',
      tier: 'professional',
      vipStatus: true,
      priorityScore: 75,
      waitTime: 8,
      reason: 'Professional tier + VIP status',
    },
    {
      id: '5',
      name: 'Sarah Mitchell',
      email: 'sarah@startup.com',
      tier: 'professional',
      vipStatus: false,
      priorityScore: 60,
      waitTime: 12,
      reason: 'Professional subscriber',
    },
    {
      id: '6',
      name: 'Tom Anderson',
      email: 'tom@email.com',
      tier: 'free',
      vipStatus: false,
      priorityScore: 30,
      waitTime: 25,
      reason: 'Free tier - standard queue',
    },
  ];

  const getTierInfo = (tier: PriorityUser['tier']) => {
    const tiers = {
      elite: {
        color: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black',
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
        color: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
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
    if (score >= 75) return 'text-amber-600 dark:text-amber-400';
    if (score >= 50) return 'text-blue-600 dark:text-blue-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Priority Queue Manager
          </DialogTitle>
          <DialogDescription>
            VIP and tier-based user prioritization - who gets help first
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4">
          {/* Priority Tiers Legend */}
          <div className="col-span-12">
            <div className="grid grid-cols-4 gap-3">
              {(['elite', 'enterprise', 'professional', 'free'] as const).map((tier) => {
                const info = getTierInfo(tier);
                const TierIcon = info.icon;
                const count = mockPriorityUsers.filter(u => u.tier === tier).length;
                
                return (
                  <Card key={tier} className="overflow-hidden">
                    <div className={`p-3 ${info.color}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TierIcon className="w-4 h-4" />
                          <span className="font-bold text-sm uppercase">{tier}</span>
                        </div>
                        <Badge variant="secondary" className="bg-white/20 text-inherit border-0">
                          {count}
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
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {mockPriorityUsers.map((user, index) => {
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
                                  <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-amber-400" />
                                )}
                              </div>
                            </div>

                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-sm truncate">{user.name}</h3>
                                {user.vipStatus && (
                                  <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 text-[10px] px-1.5 py-0">
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
                    <ArrowUp className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
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
            {mockPriorityUsers.length} users in priority queue
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
