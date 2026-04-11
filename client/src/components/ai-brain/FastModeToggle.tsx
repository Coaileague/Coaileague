/**
 * FastModeToggle - Global Fast Mode toggle component
 * 
 * Provides a consistent Fast Mode toggle UI that can be used across:
 * - Trinity Chat
 * - Workboard Dashboard
 * - Notification Center
 * - Voice Commands
 * 
 * Shows current token usage status and Fast Mode benefits
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Zap, Info, TrendingUp, Clock, Users, Sparkles } from 'lucide-react';

interface FastModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  workspaceId?: string;
  compact?: boolean;
  showCredits?: boolean;
  showBenefits?: boolean;
  className?: string;
}

export function FastModeToggle({
  enabled,
  onToggle,
  workspaceId,
  compact = false,
  showCredits = true,
  showBenefits = false,
  className = ''
}: FastModeToggleProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Fetch token status if workspaceId provided
  const { data: tokenData } = useQuery<{ balance: number; tokensUsed?: number; isWarning?: boolean }>({
    queryKey: ['/api/billing/trinity-credits/status'],
    enabled: !!workspaceId && showCredits,
  });
  
  // Fetch fast mode value comparison
  const { data: valueComparison } = useQuery<FastModeBenefitsPanelProps['valueComparison']>({
    queryKey: ['/api/ai-brain/fast-mode/value', workspaceId],
    enabled: !!workspaceId && showBenefits,
  });
  
  const isWarning = tokenData?.isWarning ?? false;
  
  const handleToggle = useCallback((checked: boolean) => {
    onToggle(checked);
  }, [onToggle]);
  
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`flex items-center gap-2 px-2 py-1 rounded-full transition-colors cursor-pointer ${
              enabled ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-muted hover-elevate'
            } ${className}`}
            onClick={() => handleToggle(!enabled)}
            data-testid="container-fast-mode-compact"
          >
            <Zap className={`h-3 w-3 ${enabled ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-medium ${enabled ? 'text-amber-500' : 'text-muted-foreground'}`}>
              Fast
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              className="scale-75"
              data-testid="switch-fast-mode-compact"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">
            <p className="font-medium">Trinity Fast Mode</p>
            <p className="text-muted-foreground">Faster with parallel agents</p>
            {showCredits && isWarning && (
              <p className="mt-1 text-yellow-500">Token usage at 80%+ this month</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className={`${className}`}>
      <div className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-colors ${
        enabled ? 'bg-amber-500/10 border-amber-500/50' : 'bg-muted/50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${enabled ? 'bg-amber-500/20' : 'bg-muted'}`}>
            <Zap className={`h-4 w-4 ${enabled ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="fast-mode-toggle" className="text-sm font-medium cursor-pointer">
                Trinity Fast Mode
              </Label>
              {enabled && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                  2× Token Rate
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Parallel agents, priority queue, guaranteed SLA
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {showCredits && isWarning && (
            <Badge 
              variant="outline"
              className="text-xs border-yellow-500 text-yellow-600"
              data-testid="badge-credit-balance"
            >
              80%+ used
            </Badge>
          )}
          
          <Popover open={showDetails} onOpenChange={setShowDetails}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-fast-mode-info">
                <Info className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <FastModeBenefitsPanel valueComparison={valueComparison} />
            </PopoverContent>
          </Popover>
          
          <Switch
            id="fast-mode-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={!hasEnoughCredits && !enabled}
            data-testid="switch-fast-mode"
          />
        </div>
      </div>
    </div>
  );
}

interface FastModeBenefitsPanelProps {
  valueComparison?: {
    normalMode: {
      avgExecutionTime: number;
      parallelAgents: number;
      cacheEnabled: boolean;
      proactiveInsights: boolean;
    };
    fastMode: {
      avgExecutionTime: number;
      parallelAgents: number;
      cacheEnabled: boolean;
      proactiveInsights: boolean;
      slaGuarantee: number;
      creditMultiplier: number;
    };
    recentStats: {
      fastModeTasksCompleted: number;
      avgTimeSaved: number;
    };
  };
}

function FastModeBenefitsPanel({ valueComparison }: FastModeBenefitsPanelProps) {
  const benefits = [
    {
      icon: Users,
      title: 'Parallel Agents',
      normal: '1 agent',
      fast: `${valueComparison?.fastMode.parallelAgents || 4} agents`,
      highlight: true
    },
    {
      icon: Clock,
      title: 'Avg. Response Time',
      normal: `~${valueComparison?.normalMode.avgExecutionTime || 25}s`,
      fast: `~${valueComparison?.fastMode.avgExecutionTime || 10}s`,
      highlight: true
    },
    {
      icon: TrendingUp,
      title: 'Priority Queue',
      normal: 'Standard',
      fast: 'Priority Boost',
      highlight: false
    },
    {
      icon: Sparkles,
      title: 'Proactive Insights',
      normal: 'No',
      fast: 'Yes',
      highlight: false
    }
  ];
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h4 className="font-semibold text-sm">Fast Mode Benefits</h4>
      </div>
      
      <div className="space-y-2">
        {benefits.map((benefit, index) => (
          <div 
            key={benefit.title}
            className="flex items-center justify-between gap-1 text-xs py-1 border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <benefit.icon className="h-3 w-3 text-muted-foreground" />
              <span>{benefit.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground line-through">{benefit.normal}</span>
              <span className={benefit.highlight ? 'text-amber-500 font-medium' : 'text-foreground'}>
                {benefit.fast}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {valueComparison?.recentStats && valueComparison.recentStats.fastModeTasksCompleted > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            You've completed <span className="text-foreground font-medium">{valueComparison.recentStats.fastModeTasksCompleted}</span> fast mode tasks,
            saving an average of <span className="text-amber-500 font-medium">{valueComparison.recentStats.avgTimeSaved}s</span> per task.
          </p>
        </div>
      )}
      
      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          Fast Mode completes tasks 60% faster with multiple AI agents working in parallel.
        </p>
      </div>
    </div>
  );
}

export default FastModeToggle;
