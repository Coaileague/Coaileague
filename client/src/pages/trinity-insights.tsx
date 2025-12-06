/**
 * Trinity Insights - Collect all Trinity messages and interactions
 * 
 * A dedicated page where users can:
 * - Review all Trinity's messages and insights
 * - See what Trinity has been working on
 * - Get business recommendations
 * - Link to relevant actions/features
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Zap } from 'lucide-react';

interface TrinityInsight {
  id: string;
  message: string;
  type: 'advice' | 'alert' | 'recommendation' | 'achievement' | 'insight';
  category: string;
  createdAt: Date;
  actionUrl?: string;
  actionLabel?: string;
}

export default function TrinityInsights() {
  const [insights, setInsights] = useState<TrinityInsight[]>([]);

  // Fetch Trinity insights from localStorage or API
  useEffect(() => {
    const stored = localStorage.getItem('trinity_insights');
    if (stored) {
      try {
        setInsights(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse stored insights:', e);
      }
    }
  }, []);

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

  const typeLabels: Record<string, string> = {
    advice: 'Advice',
    alert: 'Alert',
    recommendation: 'Recommendation',
    achievement: 'Achievement',
    insight: 'Insight',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            <h1 className="text-3xl md:text-4xl font-bold">Trinity Insights</h1>
          </div>
          <p className="text-secondary text-lg">
            Everything Trinity has been tracking and recommending for your success
          </p>
        </div>

        {/* Filter badges */}
        <div className="flex gap-2 mb-8 flex-wrap justify-center">
          {Object.entries(typeLabels).map(([key, label]) => (
            <Badge
              key={key}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors"
            >
              {label}
            </Badge>
          ))}
        </div>

        {/* Insights grid */}
        {insights.length > 0 ? (
          <ScrollArea className="h-[600px] rounded-lg border">
            <div className="p-6 space-y-4">
              {insights
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((insight) => (
                  <Card
                    key={insight.id}
                    className="p-4 border-l-4 hover:shadow-md transition-shadow cursor-default"
                    style={{
                      borderColor: insight.type === 'advice' ? '#3b82f6' : 
                                   insight.type === 'alert' ? '#ef4444' :
                                   insight.type === 'recommendation' ? '#a855f7' :
                                   insight.type === 'achievement' ? '#10b981' :
                                   '#f59e0b'
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <Badge className={getTypeColor(insight.type)}>
                        {typeLabels[insight.type]}
                      </Badge>
                      <span className="text-xs text-secondary whitespace-nowrap">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed mb-3 dark:text-gray-200">
                      {insight.message}
                    </p>

                    {insight.actionUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => window.location.href = insight.actionUrl!}
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
            <Zap className="w-12 h-12 text-secondary mx-auto mb-4" />
            <p className="text-secondary text-lg mb-4">
              No insights yet. Trinity will start tracking things as you use the platform.
            </p>
            <Button asChild>
              <a href="/dashboard">Return to Dashboard</a>
            </Button>
          </Card>
        )}

        {/* Stats */}
        {insights.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {insights.length}
              </div>
              <p className="text-xs text-secondary mt-1">Total Insights</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {insights.filter(i => i.type === 'advice').length}
              </div>
              <p className="text-xs text-secondary mt-1">Advice</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {insights.filter(i => i.type === 'recommendation').length}
              </div>
              <p className="text-xs text-secondary mt-1">Recommendations</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {insights.filter(i => i.type === 'achievement').length}
              </div>
              <p className="text-xs text-secondary mt-1">Achievements</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
