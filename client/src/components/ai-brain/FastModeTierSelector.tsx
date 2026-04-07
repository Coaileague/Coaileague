/**
 * FastModeTierSelector - Select Fast Mode tier with cost preview
 * 
 * Allows users to:
 * - Choose between Fast, Turbo, and Instant tiers
 * - See real-time cost estimates
 * - View tier-specific features and SLA guarantees
 * - Get budget warnings before execution
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { 
  Zap, 
  Rocket, 
  Flame, 
  Clock, 
  Users, 
  Shield, 
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TierData {
  id: string;
  name: string;
  creditMultiplier: number;
  maxAgents: number;
  slaSeconds: number;
  features: string[];
  refundGuarantee: string;
  recommended?: boolean;
}

interface CostEstimate {
  tier: string;
  baseCredits: number;
  multipliedCredits: number;
  estimatedAgents: number;
  estimatedTimeSeconds: number;
  slaGuarantee: number;
  features: string[];
  confidenceScore: number;
  budgetStatus: {
    currentBalance: number;
    afterExecution: number;
    percentageUsed: number;
    warningLevel: 'ok' | 'warning' | 'critical';
  };
  recommendation: string;
}

interface FastModeTierSelectorProps {
  content: string;
  workspaceId: string;
  onTierSelect: (tier: string) => void;
  onExecute?: (tier: string) => void;
  selectedAgents?: string[];
  className?: string;
}

export function FastModeTierSelector({
  content,
  workspaceId,
  onTierSelect,
  onExecute,
  selectedAgents,
  className = ''
}: FastModeTierSelectorProps) {
  const [selectedTier, setSelectedTier] = useState<string>('turbo');

  const { data: tiersData } = useQuery<{ tiers: TierData[] }>({
    queryKey: ['/api/ai-brain/fast-mode/tiers'],
  });

  const { data: estimate, refetch: refetchEstimate } = useQuery<CostEstimate>({
    queryKey: ['/api/ai-brain/fast-mode/estimate', workspaceId, selectedTier, content],
    enabled: !!content && content.length > 0,
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/ai-brain/fast-mode/estimate', {
        content,
        tier: selectedTier,
        selectedAgents
      });
      return res.json();
    }
  });

  useEffect(() => {
    if (content && content.length > 0) {
      refetchEstimate();
    }
  }, [selectedTier, content, refetchEstimate]);

  const handleTierChange = (tier: string) => {
    setSelectedTier(tier);
    onTierSelect(tier);
  };

  const getTierIcon = (tierId: string) => {
    switch (tierId) {
      case 'fast': return <Zap className="h-5 w-5" />;
      case 'turbo': return <Rocket className="h-5 w-5" />;
      case 'instant': return <Flame className="h-5 w-5" />;
      default: return <Zap className="h-5 w-5" />;
    }
  };

  const getTierColor = (tierId: string) => {
    switch (tierId) {
      case 'fast': return 'text-blue-500 border-blue-500/50 bg-blue-500/10';
      case 'turbo': return 'text-amber-500 border-amber-500/50 bg-amber-500/10';
      case 'instant': return 'text-red-500 border-red-500/50 bg-red-500/10';
      default: return 'text-muted-foreground';
    }
  };

  const getBudgetStatusColor = (level: string) => {
    switch (level) {
      case 'ok': return 'text-green-500';
      case 'warning': return 'text-amber-500';
      case 'critical': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const tiers = tiersData?.tiers || [];

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold">Select Fast Mode Tier</h3>
      </div>

      <RadioGroup value={selectedTier} onValueChange={handleTierChange} className="grid grid-cols-3 gap-3">
        {tiers.map(tier => (
          <div key={tier.id} className="relative">
            <RadioGroupItem value={tier.id} id={tier.id} className="peer sr-only" />
            <Label
              htmlFor={tier.id}
              className={`flex flex-col p-4 rounded-lg border cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate ${
                selectedTier === tier.id ? getTierColor(tier.id) : 'border-border'
              }`}
              data-testid={`tier-${tier.id}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {getTierIcon(tier.id)}
                  <span className="font-medium">{tier.name}</span>
                </div>
                {tier.recommended && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                    Best Value
                  </Badge>
                )}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>{tier.creditMultiplier}x credits</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>Up to {tier.maxAgents} agents</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{tier.slaSeconds}s SLA</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  <span>{tier.refundGuarantee}</span>
                </div>
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>

      {estimate && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Cost Estimate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Estimated Cost</p>
                <p className="text-2xl font-bold">{estimate.multipliedCredits} credits</p>
                <p className="text-xs text-muted-foreground">({estimate.baseCredits} base x {(estimate.multipliedCredits / estimate.baseCredits).toFixed(1)}x)</p>
              </div>
              <div>
                <p className="text-muted-foreground">Estimated Time</p>
                <p className="text-2xl font-bold">{estimate.estimatedTimeSeconds}s</p>
                <p className="text-xs text-muted-foreground">SLA: {estimate.slaGuarantee}s max</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Budget Impact</span>
                <span className={getBudgetStatusColor(estimate.budgetStatus.warningLevel)}>
                  {estimate.budgetStatus.currentBalance} → {estimate.budgetStatus.afterExecution} credits
                </span>
              </div>
              <Progress 
                value={Math.min(100, estimate.budgetStatus.percentageUsed)} 
                className={`h-2 ${estimate.budgetStatus.warningLevel === 'critical' ? '[&>div]:bg-destructive' : ''}`}
              />
            </div>

            {estimate.budgetStatus.warningLevel !== 'ok' && (
              <div className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                estimate.budgetStatus.warningLevel === 'critical' 
                  ? 'bg-destructive/10 text-destructive' 
                  : 'bg-amber-500/10 text-amber-600'
              }`}>
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{estimate.recommendation}</p>
              </div>
            )}

            {estimate.budgetStatus.warningLevel === 'ok' && (
              <div className="flex items-start gap-2 p-2 rounded-md text-sm bg-green-500/10 text-green-600">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{estimate.recommendation}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-1 pt-2">
              {estimate.features.map(feature => (
                <Badge key={feature} variant="outline" className="text-xs">
                  {feature.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>

            {onExecute && estimate.budgetStatus.warningLevel !== 'critical' && (
              <Button 
                onClick={() => onExecute(selectedTier)} 
                className="w-full mt-2"
                data-testid="button-execute-fast-mode"
              >
                <Zap className="h-4 w-4 mr-2" />
                Execute with {tiers.find(t => t.id === selectedTier)?.name || selectedTier} Mode
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FastModeTierSelector;
