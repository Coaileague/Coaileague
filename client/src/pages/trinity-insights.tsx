/**
 * Trinity Insights - Collect all Trinity messages and interactions
 * 
 * A dedicated page where users can:
 * - Review all Trinity's messages and insights
 * - See what Trinity has been working on
 * - Get business recommendations
 * - Link to relevant actions/features
 * - Trigger manual proactive scans
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, ArrowRight, Zap, RefreshCw, Check, AlertTriangle, Lightbulb, Trophy, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import TrinityRedesign from '@/components/trinity-redesign';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

interface TrinityInsight {
  id: string;
  workspaceId: string;
  userId?: string;
  type: 'advice' | 'alert' | 'recommendation' | 'achievement' | 'insight';
  category: string;
  title: string;
  message: string;
  rationale?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actionUrl?: string;
  actionLabel?: string;
  isRead: boolean;
  createdAt: string;
  expiresAt?: string;
}

interface TrinityStatus {
  available: boolean;
  features: {
    preActionReasoning: boolean;
    postActionAnalysis: boolean;
    proactiveScanning: boolean;
    insightPersistence: boolean;
  };
}

export default function TrinityInsights() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { data: insightsData, isLoading, refetch } = useQuery<{ insights: TrinityInsight[] }>({
    queryKey: ['/api/trinity/insights'],
    refetchInterval: 30000,
  });

  const { data: statusData } = useQuery<TrinityStatus>({
    queryKey: ['/api/trinity/status'],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/trinity/scan', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Scan Complete',
        description: `Found ${data.insights?.length || 0} new insights`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/insights'] });
    },
    onError: () => {
      toast({
        title: 'Scan Failed',
        description: 'Could not complete proactive scan',
        variant: 'destructive',
      });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiRequest('POST', `/api/trinity/insights/${insightId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/insights'] });
    },
  });

  const insights = insightsData?.insights || [];
  const filteredInsights = selectedType 
    ? insights.filter(i => i.type === selectedType)
    : insights;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'advice': return <Lightbulb className="w-4 h-4" />;
      case 'alert': return <AlertTriangle className="w-4 h-4" />;
      case 'recommendation': return <Brain className="w-4 h-4" />;
      case 'achievement': return <Trophy className="w-4 h-4" />;
      case 'insight': return <Sparkles className="w-4 h-4" />;
      default: return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'advice': return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200';
      case 'alert': return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200';
      case 'recommendation': return 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200';
      case 'achievement': return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200';
      case 'insight': return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200';
      default: return 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-200';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'border-red-500';
      case 'high': return 'border-orange-500';
      case 'medium': return 'border-yellow-500';
      case 'low': return 'border-green-500';
      default: return 'border-gray-300';
    }
  };

  const typeLabels: Record<string, string> = {
    advice: 'Advice',
    alert: 'Alert',
    recommendation: 'Recommendation',
    achievement: 'Achievement',
    insight: 'Insight',
  };

  const pageConfig: CanvasPageConfig = {
    id: 'trinity-insights',
    title: 'Trinity Insights',
    subtitle: 'AI-powered business intelligence from your workforce data',
    category: 'operations',
    maxWidth: '4xl',
    headerActions: (
      <div className="flex items-center gap-2">
        <Badge variant={statusData?.available ? 'default' : 'secondary'}>
          {statusData?.available ? 'AI Connected' : 'AI Offline'}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || !statusData?.available}
          data-testid="button-scan"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
          {scanMutation.isPending ? 'Scanning...' : 'Run Scan'}
        </Button>
      </div>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
        {/* Trinity Mascot Demo - Auto-cycling through states */}
        <Card className="mb-8 p-6 overflow-visible">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold mb-2">Trinity AI States</h2>
            <p className="text-sm text-muted-foreground">Watch Trinity morph through different states</p>
          </div>
          <div className="flex justify-center items-center" style={{ minHeight: '200px' }}>
            <div style={{ width: '180px', height: '180px', position: 'relative' }}>
              <TrinityRedesign 
                autoCycle={true}
                cycleInterval={2500}
                size={180}
              />
            </div>
          </div>
        </Card>

        {/* Filter badges */}
        <div className="flex gap-2 mb-8 flex-wrap justify-center">
          <Badge
            variant={selectedType === null ? 'default' : 'outline'}
            className="cursor-pointer hover-elevate"
            onClick={() => setSelectedType(null)}
            data-testid="filter-all"
          >
            All ({insights.length})
          </Badge>
          {Object.entries(typeLabels).map(([key, label]) => {
            const count = insights.filter(i => i.type === key).length;
            return (
              <Badge
                key={key}
                variant={selectedType === key ? 'default' : 'outline'}
                className="cursor-pointer hover-elevate"
                onClick={() => setSelectedType(selectedType === key ? null : key)}
                data-testid={`filter-${key}`}
              >
                {getTypeIcon(key)}
                <span className="ml-1">{label} ({count})</span>
              </Badge>
            );
          })}
        </div>

        {/* Insights grid */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : filteredInsights.length > 0 ? (
          <ScrollArea className="h-[600px] rounded-lg border">
            <div className="p-6 space-y-4">
              {filteredInsights
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((insight) => (
                  <Card
                    key={insight.id}
                    className={`p-4 border-l-4 hover:shadow-md transition-shadow cursor-default ${getRiskColor(insight.riskLevel)} ${insight.isRead ? 'opacity-75' : ''}`}
                    data-testid={`card-insight-${insight.id}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getTypeColor(insight.type)}>
                          {getTypeIcon(insight.type)}
                          <span className="ml-1">{typeLabels[insight.type]}</span>
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(insight.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {!insight.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markReadMutation.mutate(insight.id)}
                            data-testid={`button-mark-read-${insight.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(insight.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-semibold mb-1">{insight.title}</h3>
                    <p className="text-sm leading-relaxed mb-2 dark:text-gray-200">
                      {insight.message}
                    </p>

                    {insight.rationale && (
                      <p className="text-xs text-muted-foreground italic mb-3">
                        {insight.rationale}
                      </p>
                    )}

                    {insight.actionUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between gap-2"
                        onClick={() => {
                          if (insight.actionUrl?.startsWith('/')) {
                            setLocation(insight.actionUrl);
                          } else {
                            window.location.href = insight.actionUrl!;
                          }
                        }}
                        data-testid={`button-insight-action-${insight.id}`}
                      >
                        {insight.actionLabel || 'Take Action'}
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                  </Card>
                ))}
            </div>
          </ScrollArea>
        ) : (
          <Card className="p-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-4">
              No insights yet. Trinity will start analyzing your data as you use the platform.
            </p>
            {statusData?.available && (
              <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                Run First Scan
              </Button>
            )}
          </Card>
        )}

        {/* Stats */}
        {insights.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {insights.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {insights.filter(i => i.type === 'advice').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Advice</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {insights.filter(i => i.type === 'alert').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Alerts</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {insights.filter(i => i.type === 'recommendation').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Recommendations</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {insights.filter(i => i.type === 'achievement').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Achievements</p>
            </Card>
          </div>
        )}
    </CanvasHubPage>
  );
}
