/**
 * FastModeSuccessDigest - Post-execution success summary
 * 
 * Shows users actionable insights after Fast Mode execution:
 * - Execution time vs SLA
 * - Agent performance summary
 * - Proactive insights
 * - Recommended next actions
 * - Quality score
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Shield,
  Database
} from 'lucide-react';
import { motion } from 'framer-motion';

interface AgentSummary {
  name: string;
  status: 'success' | 'failed' | 'cached';
  confidence: number;
  insight?: string;
}

interface NextAction {
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface SuccessDigestData {
  taskId: string;
  executionTimeMs: number;
  slaMet: boolean;
  slaTarget: number;
  timeSavedVsNormal: number;
  creditsUsed: number;
  creditsSavedFromCache: number;
  agentsSummary: AgentSummary[];
  proactiveInsights: string[];
  recommendations: string[];
  nextActions: NextAction[];
  qualityScore: number;
}

interface FastModeSuccessDigestProps {
  digest: SuccessDigestData;
  onDismiss?: () => void;
  onActionClick?: (action: string) => void;
  className?: string;
}

export function FastModeSuccessDigest({
  digest,
  onDismiss,
  onActionClick,
  className = ''
}: FastModeSuccessDigestProps) {
  const getStatusIcon = (status: AgentSummary['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'cached': return <Database className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusLabel = (status: AgentSummary['status']) => {
    switch (status) {
      case 'success': return 'Success';
      case 'failed': return 'Failed';
      case 'cached': return 'Cached';
    }
  };

  const getPriorityColor = (priority: NextAction['priority']) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'medium': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'low': return 'bg-muted text-muted-foreground border-muted-foreground/30';
    }
  };

  const executionSeconds = (digest.executionTimeMs / 1000).toFixed(1);
  const timeSavedSeconds = Math.round(digest.timeSavedVsNormal / 1000);
  const successCount = digest.agentsSummary.filter(a => a.status === 'success').length;
  const cachedCount = digest.agentsSummary.filter(a => a.status === 'cached').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className={`border ${digest.slaMet ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Fast Mode Complete
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={digest.slaMet 
                  ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                }
              >
                {digest.slaMet ? 'SLA Met' : 'SLA Exceeded'}
              </Badge>
              <Badge variant="outline" className="bg-primary/10">
                Quality: {digest.qualityScore}/100
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <Clock className="h-3 w-3" />
                Time
              </div>
              <p className="text-lg font-bold">{executionSeconds}s</p>
              <p className="text-xs text-muted-foreground">of {digest.slaTarget}s SLA</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3 w-3" />
                Saved
              </div>
              <p className="text-lg font-bold text-green-500">{timeSavedSeconds}s</p>
              <p className="text-xs text-muted-foreground">vs normal mode</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <Zap className="h-3 w-3" />
                Credits
              </div>
              <p className="text-lg font-bold">{digest.creditsUsed}</p>
              {digest.creditsSavedFromCache > 0 && (
                <p className="text-xs text-green-500">+{digest.creditsSavedFromCache} saved</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <Shield className="h-3 w-3" />
                Agents
              </div>
              <p className="text-lg font-bold">{successCount + cachedCount}/{digest.agentsSummary.length}</p>
              <p className="text-xs text-muted-foreground">successful</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Agent Performance</p>
            <div className="grid grid-cols-2 gap-2">
              {digest.agentsSummary.map((agent, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 p-2 rounded-md border bg-background/50"
                  data-testid={`agent-result-${index}`}
                >
                  {getStatusIcon(agent.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{getStatusLabel(agent.status)}</Badge>
                      <span className="text-xs text-muted-foreground">{Math.round(agent.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {digest.proactiveInsights.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Insights
              </div>
              <div className="space-y-1">
                {digest.proactiveInsights.map((insight, index) => (
                  <p key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 mt-1 text-green-500 flex-shrink-0" />
                    {insight}
                  </p>
                ))}
              </div>
            </div>
          )}

          {digest.recommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Recommendations</p>
              <div className="space-y-1">
                {digest.recommendations.map((rec, index) => (
                  <p key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-amber-500 flex-shrink-0" />
                    {rec}
                  </p>
                ))}
              </div>
            </div>
          )}

          {digest.nextActions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested Next Actions</p>
              <div className="space-y-2">
                {digest.nextActions.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className={`w-full justify-between gap-2 ${getPriorityColor(action.priority)}`}
                    onClick={() => onActionClick?.(action.action)}
                    data-testid={`action-${action.action}`}
                  >
                    <span className="text-left truncate">{action.description}</span>
                    <ArrowRight className="h-4 w-4 flex-shrink-0" />
                  </Button>
                ))}
              </div>
            </div>
          )}

          {onDismiss && (
            <Button variant="ghost" className="w-full" onClick={onDismiss} data-testid="button-dismiss-digest">
              Dismiss
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default FastModeSuccessDigest;
