import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Target,
  Sparkles,
  X,
  BarChart3,
  DollarSign,
  Users,
  Clock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AiInsight {
  id: string;
  title: string;
  category: string;
  priority: string;
  summary: string;
  details: string | null;
  dataPoints: string | null;
  confidence: string | null;
  actionable: boolean;
  suggestedActions: string[] | null;
  estimatedImpact: string | null;
  status: string;
  createdAt: string;
}

export default function InsightOS() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [dismissingInsight, setDismissingInsight] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const { toast } = useToast();

  // Fetch insights
  const { data: insights = [], isLoading } = useQuery<AiInsight[]>({
    queryKey: ['/api/insights'],
  });

  // Generate insights mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/insights/generate', {});
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      toast({
        title: data.aiPowered ? "AI Insights Generated" : "Insights Generated",
        description: `Generated ${data.count} new insights${data.aiPowered ? ' using GPT-4o' : ''}`,
      });
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Unable to generate insights. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Dismiss insight mutation
  const dismissMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/insights/dismiss/${id}`, { reason });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/insights'] });
      setDismissingInsight(null);
      setDismissReason("");
      toast({
        title: "Insight dismissed",
        description: "The insight has been removed from your dashboard",
      });
    },
    onError: () => {
      toast({
        title: "Dismiss failed",
        description: "Unable to dismiss insight. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDismiss = () => {
    if (dismissingInsight && dismissReason.trim()) {
      dismissMutation.mutate({ id: dismissingInsight, reason: dismissReason });
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'cost_savings':
        return DollarSign;
      case 'productivity':
        return TrendingUp;
      case 'anomaly':
        return AlertTriangle;
      case 'prediction':
        return Target;
      case 'recommendation':
        return Lightbulb;
      default:
        return Sparkles;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'normal':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'low':
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
      default:
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  const filteredInsights = selectedCategory === 'all'
    ? insights
    : insights.filter((insight) => insight.category === selectedCategory);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
              <Lightbulb className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">InsightOS™</h1>
              <p className="text-muted-foreground">AI-powered analytics & autonomous insights</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-insights"
        >
          {generateMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Insights
            </>
          )}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Lightbulb className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Insights</p>
              <p className="text-2xl font-bold">{insights.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted/10 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cost Savings</p>
              <p className="text-2xl font-bold">
                {insights.filter((i) => i.category === 'cost_savings').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Productivity</p>
              <p className="text-2xl font-bold">
                {insights.filter((i) => i.category === 'productivity').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Anomalies</p>
              <p className="text-2xl font-bold">
                {insights.filter((i) => i.category === 'anomaly').length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Category Filters */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-category-all">All</TabsTrigger>
          <TabsTrigger value="cost_savings" data-testid="tab-category-cost">Cost Savings</TabsTrigger>
          <TabsTrigger value="productivity" data-testid="tab-category-productivity">Productivity</TabsTrigger>
          <TabsTrigger value="anomaly" data-testid="tab-category-anomaly">Anomalies</TabsTrigger>
          <TabsTrigger value="prediction" data-testid="tab-category-prediction">Predictions</TabsTrigger>
          <TabsTrigger value="recommendation" data-testid="tab-category-recommendation">Recommendations</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Insights List */}
      {isLoading ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-spin" />
          <p className="text-muted-foreground">Loading insights...</p>
        </Card>
      ) : filteredInsights.length === 0 ? (
        <Card className="p-12 text-center">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No insights yet</h3>
          <p className="text-muted-foreground mb-4">
            Generate AI insights to discover cost savings, productivity improvements, and more
          </p>
          <Button onClick={() => generateMutation.mutate()} data-testid="button-generate-empty">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate First Insights
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredInsights.map((insight) => {
            const Icon = getCategoryIcon(insight.category);
            return (
              <Card key={insight.id} className="p-6 space-y-4" data-testid={`card-insight-${insight.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-semibold">{insight.title}</h3>
                        <Badge className={getPriorityColor(insight.priority)}>
                          {insight.priority}
                        </Badge>
                        {insight.confidence && (
                          <Badge variant="outline">
                            {Math.round(parseFloat(insight.confidence))}% confidence
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">{insight.summary}</p>
                      {insight.details && (
                        <p className="text-sm">{insight.details}</p>
                      )}
                      {insight.estimatedImpact && (
                        <div className="flex items-center gap-2 p-3 bg-muted/10 border border-primary/20 rounded-lg">
                          <TrendingUp className="h-5 w-5 text-green-500" />
                          <span className="font-semibold text-green-500">
                            Estimated Impact: {insight.estimatedImpact}
                          </span>
                        </div>
                      )}
                      {insight.suggestedActions && insight.suggestedActions.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Suggested Actions:</p>
                          <ul className="space-y-1">
                            {insight.suggestedActions.map((action, index) => (
                              <li key={index} className="text-sm flex items-start gap-2">
                                <span className="text-muted-foreground">•</span>
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDismissingInsight(insight.id)}
                    data-testid={`button-dismiss-${insight.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dismiss Dialog */}
      <AlertDialog open={!!dismissingInsight} onOpenChange={() => setDismissingInsight(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Insight</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for dismissing this insight. This helps improve future recommendations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="e.g., Already implemented, Not relevant to our business, etc."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            data-testid="textarea-dismiss-reason"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dismiss">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDismiss}
              disabled={!dismissReason.trim() || dismissMutation.isPending}
              data-testid="button-confirm-dismiss"
            >
              {dismissMutation.isPending ? "Dismissing..." : "Dismiss"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
