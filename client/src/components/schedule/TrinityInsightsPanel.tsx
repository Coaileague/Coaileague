/**
 * Trinity AI Insights Panel - AI-powered recommendations for schedule optimization
 * Integrates with Trinity orchestration for intelligent workforce management
 */

import { secureFetch } from "@/lib/csrf";
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronDown, AlertTriangle, Lightbulb, Target, 
  MessageSquare, Loader2, Send, TrendingUp, Users, Clock
} from 'lucide-react';
import { TrinityIconStatic, AskTrinityButton } from '@/components/trinity-button';
import type { Shift, Employee, Client } from '@shared/schema';

interface TrinityInsight {
  id: string;
  type: 'warning' | 'suggestion' | 'metric';
  icon: 'alert' | 'bulb' | 'target' | 'trend';
  title: string;
  description: string;
  actionable?: boolean;
  actionLabel?: string;
  actionData?: any;
}

interface TrinityInsightsPanelProps {
  weekStart: Date;
  weekEnd: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TrinityInsightsPanel({
  weekStart,
  weekEnd,
  shifts,
  employees,
  clients,
  isCollapsed = false,
  onToggleCollapse,
}: TrinityInsightsPanelProps) {
  const { toast } = useToast();
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);

  const { data: insights = [], isLoading } = useQuery<TrinityInsight[]>({
    queryKey: ['/api/trinity/scheduling/insights', weekStart.toISOString()],
    queryFn: async () => {
      try {
        const res = await secureFetch(`/api/trinity/scheduling/insights?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`);
        if (!res.ok) {
          // Fallback to local insights if Trinity endpoint not available
          return generateLocalInsights(shifts, employees, clients);
        }
        return res.json();
      } catch {
        return generateLocalInsights(shifts, employees, clients);
      }
    },
  });

  const askTrinityMutation = useMutation({
    mutationFn: async (question: string) => {
      return await apiRequest('POST', '/api/trinity/scheduling/ask', {
        question,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      });
    },
    onSuccess: (data) => {
      toast({ title: 'Trinity Response', description: 'Check the chat for Trinity\'s answer' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Trinity unavailable', description: error.message });
    },
  });

  const applyInsightMutation = useMutation({
    mutationFn: async (insight: TrinityInsight) => {
      return await apiRequest('POST', '/api/schedules/apply-insight', {
        insightId: insight.id,
        actionData: insight.actionData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules/ai-insights'] });
      toast({ title: 'Insight Applied', description: 'Schedule updated based on Trinity recommendation' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Action failed', description: error.message });
    },
  });

  const handleAskTrinity = () => {
    if (chatInput.trim()) {
      askTrinityMutation.mutate(chatInput);
      setChatInput('');
    }
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'bulb':
        return <Lightbulb className="w-4 h-4 text-blue-500" />;
      case 'target':
        return <Target className="w-4 h-4 text-green-500" />;
      case 'trend':
        return <TrendingUp className="w-4 h-4 text-purple-500" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const generatedInsights = insights.length > 0 ? insights : generateLocalInsights(shifts, employees, clients);

  return (
    <Collapsible open={!isCollapsed} onOpenChange={onToggleCollapse}>
      <Card className="relative z-20 border-primary/30" data-testid="trinity-insights-panel">
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrinityIconStatic className="w-5 h-5 text-primary" />
              Trinity Insights
              {generatedInsights.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {generatedInsights.length}
                </Badge>
              )}
            </CardTitle>
            <ChevronDown className={`w-4 h-4 transition-transform ${!isCollapsed ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Analyzing schedule...</span>
              </div>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-3">
                  {generatedInsights.map((insight) => (
                    <div 
                      key={insight.id}
                      className="p-3 rounded-lg border bg-card/50"
                      data-testid={`insight-${insight.id}`}
                    >
                      <div className="flex items-start gap-2">
                        {getIcon(insight.icon)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{insight.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                          {insight.actionable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 mt-2 text-xs text-primary underline"
                              onClick={() => applyInsightMutation.mutate(insight)}
                              disabled={applyInsightMutation.isPending}
                            >
                              {insight.actionLabel || 'Apply suggestion'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <div className="pt-2 border-t">
              {showChat ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ask Trinity anything..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAskTrinity()}
                      data-testid="input-ask-trinity"
                    />
                    <Button 
                      size="icon" 
                      onClick={handleAskTrinity}
                      disabled={!chatInput.trim() || askTrinityMutation.isPending}
                    >
                      {askTrinityMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Try: "Who's best for Friday night shift?" or "Optimize for profit"
                  </p>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowChat(true)}
                  data-testid="button-ask-trinity"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ask Trinity
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function generateLocalInsights(
  shifts: Shift[], 
  employees: Employee[], 
  clients: Client[]
): TrinityInsight[] {
  const insights: TrinityInsight[] = [];

  const unassignedShifts = shifts.filter(s => !s.employeeId);
  if (unassignedShifts.length > 0) {
    insights.push({
      id: 'unassigned-warning',
      type: 'warning',
      icon: 'alert',
      title: `${unassignedShifts.length} shifts need assignment`,
      description: 'Click Auto-Fill to let Trinity find the best matches',
      actionable: true,
      actionLabel: 'Auto-assign all',
      actionData: { action: 'auto-fill-all' },
    });
  }

  const employeeHours = new Map<string, number>();
  let totalLaborCost = 0;
  
  shifts.forEach(shift => {
    if (shift.employeeId) {
      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      employeeHours.set(shift.employeeId, (employeeHours.get(shift.employeeId) || 0) + hours);
      
      const employee = employees.find(e => e.id === shift.employeeId);
      const rate = shift.hourlyRateOverride 
        ? parseFloat(shift.hourlyRateOverride) 
        : (employee?.hourlyRate ? parseFloat(employee.hourlyRate) : 15);
      totalLaborCost += hours * rate;
    }
  });

  const overtimeEmployees: string[] = [];
  employeeHours.forEach((hours, empId) => {
    if (hours > 40) {
      const emp = employees.find(e => e.id === empId);
      if (emp) overtimeEmployees.push(`${emp.firstName} ${emp.lastName}`);
    }
  });

  if (overtimeEmployees.length > 0) {
    insights.push({
      id: 'overtime-warning',
      type: 'warning',
      icon: 'alert',
      title: 'Overtime detected',
      description: `${overtimeEmployees.slice(0, 2).join(', ')}${overtimeEmployees.length > 2 ? ` and ${overtimeEmployees.length - 2} more` : ''} exceed 40 hours`,
    });
  }

  const activeEmployees = employees.filter(e => e.onboardingStatus === 'completed');
  const unscheduledEmployees = activeEmployees.filter(emp => !employeeHours.has(emp.id));
  
  if (unscheduledEmployees.length > 0 && unscheduledEmployees.length <= 3) {
    insights.push({
      id: 'available-employees',
      type: 'suggestion',
      icon: 'bulb',
      title: `${unscheduledEmployees.length} employees available`,
      description: `${unscheduledEmployees.map(e => e.firstName).join(', ')} have no shifts this week`,
      actionable: true,
      actionLabel: 'View availability',
    });
  }

  const fillRate = shifts.length > 0 
    ? ((shifts.length - unassignedShifts.length) / shifts.length * 100) 
    : 100;

  insights.push({
    id: 'coverage-metric',
    type: 'metric',
    icon: 'target',
    title: `Coverage efficiency: ${fillRate.toFixed(0)}%`,
    description: fillRate >= 90 ? 'Excellent coverage this week!' : 'Some shifts need attention',
  });

  return insights;
}
