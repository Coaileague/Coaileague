/**
 * FastModeROIDashboard - ROI Analytics Dashboard
 * 
 * Shows org owners the value they're getting from Fast Mode:
 * - Time saved vs normal mode
 * - Money saved (time is money)
 * - SLA compliance rate
 * - Top agents used
 * - Credit refunds received
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Shield, 
  Users,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';

interface ROIData {
  workspaceId: string;
  period: string;
  totalTasks: number;
  fastModeTasks: number;
  normalModeTasks: number;
  totalTokensUsed: number;
  fastModeCredits: number;
  estimatedTimeSavedSeconds: number;
  estimatedMoneySaved: number;
  averageExecutionTime: {
    fastMode: number;
    normalMode: number;
  };
  slaCompliance: {
    met: number;
    breached: number;
    percentage: number;
  };
  refundsIssued: number;
  topAgentsUsed: Array<{ agent: string; count: number }>;
  tasksByCategory: Array<{ category: string; count: number }>;
}

interface FastModeROIDashboardProps {
  workspaceId: string;
  className?: string;
}

export function FastModeROIDashboard({ workspaceId, className = '' }: FastModeROIDashboardProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all_time'>('month');

  const { data: roi, isLoading, refetch } = useQuery<ROIData>({
    queryKey: ['/api/ai-brain/fast-mode/roi', workspaceId, period],
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!roi) {
    return (
      <Card className={className}>
        <CardContent className="text-center py-8 text-muted-foreground">
          No Fast Mode data available yet
        </CardContent>
      </Card>
    );
  }

  const timeSavedMinutes = Math.round(roi.estimatedTimeSavedSeconds / 60);
  const speedImprovement = roi.averageExecutionTime.normalMode > 0 
    ? Math.round(((roi.averageExecutionTime.normalMode - roi.averageExecutionTime.fastMode) / roi.averageExecutionTime.normalMode) * 100)
    : 0;
  const fastModePercentage = roi.totalTasks > 0 
    ? Math.round((roi.fastModeTasks / roi.totalTasks) * 100)
    : 0;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Fast Mode ROI Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs px-2">Day</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-2">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-2">Month</TabsTrigger>
              <TabsTrigger value="all_time" className="text-xs px-2">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh-roi">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Time Saved
            </div>
            <p className="text-2xl font-bold">{timeSavedMinutes} min</p>
            <p className="text-xs text-green-500 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              {speedImprovement}% faster than normal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              Value Generated
            </div>
            <p className="text-2xl font-bold">${roi.estimatedMoneySaved.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Based on time savings</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Shield className="h-4 w-4" />
              SLA Compliance
            </div>
            <p className="text-2xl font-bold">{roi.slaCompliance.percentage}%</p>
            <p className="text-xs text-muted-foreground">
              {roi.slaCompliance.met}/{roi.slaCompliance.met + roi.slaCompliance.breached} tasks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Fast Mode Usage
            </div>
            <p className="text-2xl font-bold">{fastModePercentage}%</p>
            <p className="text-xs text-muted-foreground">
              {roi.fastModeTasks} of {roi.totalTasks} tasks
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Execution Time Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-amber-500" />
                  Fast Mode
                </span>
                <span className="font-medium">{roi.averageExecutionTime.fastMode}s avg</span>
              </div>
              <Progress 
                value={Math.min(100, (roi.averageExecutionTime.fastMode / 30) * 100)} 
                className="h-2 [&>div]:bg-amber-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  Normal Mode
                </span>
                <span className="font-medium">{roi.averageExecutionTime.normalMode}s avg</span>
              </div>
              <Progress 
                value={Math.min(100, (roi.averageExecutionTime.normalMode / 30) * 100)} 
                className="h-2"
              />
            </div>
            <div className="pt-2 border-t text-center">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                {speedImprovement}% Speed Improvement
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top Agents Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roi.topAgentsUsed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No agent data yet</p>
            ) : (
              <div className="space-y-2">
                {roi.topAgentsUsed.slice(0, 5).map((agent, index) => (
                  <div key={agent.agent} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <span>{agent.agent}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{agent.count} tasks</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Credit Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Total Credits Spent</span>
              <span className="font-medium">{roi.totalTokensUsed}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Fast Mode Credits</span>
              <span className="font-medium">{roi.fastModeCredits}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">SLA Refunds Received</span>
              <span className="font-medium text-green-500">+{roi.refundsIssued}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <span className="text-muted-foreground">Net Fast Mode Cost</span>
              <span className="font-bold">{roi.fastModeCredits - roi.refundsIssued}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tasks by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {roi.tasksByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No category data yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roi.tasksByCategory.map(cat => (
                  <Badge key={cat.category} variant="outline" className="text-xs">
                    {cat.category}: {cat.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {roi.slaCompliance.breached > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">SLA Breaches Detected</p>
                <p className="text-sm text-muted-foreground">
                  {roi.slaCompliance.breached} task(s) exceeded the SLA guarantee this period. 
                  {roi.refundsIssued > 0 && ` You received ${roi.refundsIssued} credits in automatic refunds.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roi.slaCompliance.percentage === 100 && roi.fastModeTasks > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Perfect SLA Compliance</p>
                <p className="text-sm text-muted-foreground">
                  All {roi.fastModeTasks} Fast Mode tasks completed within the guaranteed SLA. Great performance!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FastModeROIDashboard;
