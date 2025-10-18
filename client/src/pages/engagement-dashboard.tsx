import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertCircle, TrendingUp, TrendingDown, Users, Heart, MessageSquare, Award, AlertTriangle, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface EmployeeHealthScore {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  overallEngagementScore: string;
  turnoverRiskScore: string;
  riskLevel: string;
  requiresManagerAction: boolean;
  actionPriority: string;
  suggestedActions: Array<{
    action: string;
    conversationStarter: string;
    expectedImpact: string;
  }>;
  actionTaken: boolean;
  actionNotes: string | null;
}

interface EmployerBenchmark {
  id: string;
  benchmarkType: string;
  targetName: string;
  overallScore: string;
  industryAverageScore: string;
  percentileRank: number;
  scoreTrend: string;
  monthOverMonthChange: string;
  totalResponses: number;
  criticalIssuesCount: number;
  highRiskFlags: string[];
}

interface EmployeeRecognition {
  id: string;
  recognizedEmployeeId: string;
  reason: string;
  category: string | null;
  isPublic: boolean;
  createdAt: string;
}

interface EmployerRating {
  id: string;
  ratingType: string;
  targetId: string | null;
  managementQuality: number;
  workEnvironment: number;
  compensationFairness: number;
  growthOpportunities: number;
  workLifeBalance: number;
  equipmentResources: number;
  communicationClarity: number;
  recognitionAppreciation: number;
  overallScore: number;
  positiveComments: string | null;
  improvementSuggestions: string | null;
  isAnonymous: boolean;
  submittedAt: string;
}

const disputeSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200, "Title too long"),
  reason: z.string().min(20, "Reason must be at least 20 characters").max(5000, "Reason too long"),
  requestedOutcome: z.string().max(1000, "Requested outcome too long").optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
});

type DisputeFormData = z.infer<typeof disputeSchema>;

export default function EngagementDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<EmployerRating | null>(null);

  // Fetch health scores
  const { data: healthScores, isLoading: loadingHealthScores } = useQuery<EmployeeHealthScore[]>({
    queryKey: ['/api/engagement/health-scores'],
  });

  // Fetch employer benchmarks
  const { data: benchmarks, isLoading: loadingBenchmarks } = useQuery<EmployerBenchmark[]>({
    queryKey: ['/api/engagement/benchmarks'],
  });

  // Fetch recognition feed
  const { data: recognitions, isLoading: loadingRecognitions } = useQuery<EmployeeRecognition[]>({
    queryKey: ['/api/engagement/recognition'],
  });

  // Take action on health score
  const takeActionMutation = useMutation({
    mutationFn: async ({ id, actionNotes }: { id: string; actionNotes: string }) => {
      return await apiRequest("PATCH", `/api/engagement/health-scores/${id}/action`, { actionNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/health-scores'] });
    }
  });

  const handleTakeAction = (scoreId: string, notes: string) => {
    takeActionMutation.mutate({ id: scoreId, actionNotes: notes });
  };

  // Calculate summary statistics
  const criticalRiskCount = healthScores?.filter(s => s.riskLevel === 'critical').length || 0;
  const highRiskCount = healthScores?.filter(s => s.riskLevel === 'high').length || 0;
  const requiresActionCount = healthScores?.filter(s => s.requiresManagerAction && !s.actionTaken).length || 0;
  
  const avgEngagement = healthScores && healthScores.length > 0
    ? (healthScores.reduce((sum, s) => sum + parseFloat(s.overallEngagementScore), 0) / healthScores.length).toFixed(1)
    : 'N/A';

  const latestBenchmark = benchmarks && benchmarks.length > 0 ? benchmarks[0] : null;

  if (loadingHealthScores || loadingBenchmarks || loadingRecognitions) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading engagement data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-engagement-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">EngagementOS™</h1>
          <p className="text-muted-foreground">Employee engagement intelligence & health monitoring</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              Avg Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-avg-engagement">{avgEngagement}%</div>
            <p className="text-xs text-muted-foreground mt-1">Across all employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              High Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive" data-testid="text-high-risk-count">
              {criticalRiskCount + highRiskCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{criticalRiskCount} critical, {highRiskCount} high</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500" data-testid="text-action-required-count">
              {requiresActionCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Employees need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Employer Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-employer-score">
              {latestBenchmark ? `${parseFloat(latestBenchmark.overallScore).toFixed(1)}/5.0` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latestBenchmark ? `${latestBenchmark.percentileRank}th percentile` : 'No data yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="action-queue" data-testid="tab-action-queue">
            Action Queue
            {requiresActionCount > 0 && (
              <Badge variant="destructive" className="ml-2">{requiresActionCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="recognition" data-testid="tab-recognition">Recognition</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee Health Overview</CardTitle>
              <CardDescription>Risk distribution and engagement trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {healthScores && healthScores.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Critical Risk</div>
                      <div className="text-2xl font-bold text-destructive">{criticalRiskCount}</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">High Risk</div>
                      <div className="text-2xl font-bold text-orange-500">{highRiskCount}</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Stable</div>
                      <div className="text-2xl font-bold text-green-500">
                        {healthScores.filter(s => s.riskLevel === 'low' || s.riskLevel === 'minimal').length}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No health scores calculated yet. Run calculations to see employee engagement health.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {latestBenchmark && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Employer Benchmark</CardTitle>
                <CardDescription>{latestBenchmark.targetName}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Overall Score</div>
                    <div className="text-xl font-bold">{parseFloat(latestBenchmark.overallScore).toFixed(1)}/5.0</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Percentile Rank</div>
                    <div className="text-xl font-bold">{latestBenchmark.percentileRank}th</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Responses</div>
                    <div className="text-xl font-bold">{latestBenchmark.totalResponses}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Critical Issues</div>
                    <div className="text-xl font-bold text-destructive">{latestBenchmark.criticalIssuesCount}</div>
                  </div>
                </div>
                {latestBenchmark.highRiskFlags.length > 0 && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="font-medium text-sm mb-2">⚠️ Risk Flags:</div>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {latestBenchmark.highRiskFlags.map((flag, index) => (
                        <li key={index}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="action-queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manager Action Queue</CardTitle>
              <CardDescription>Employees requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {healthScores && healthScores.filter(s => s.requiresManagerAction && !s.actionTaken).length > 0 ? (
                  healthScores
                    .filter(s => s.requiresManagerAction && !s.actionTaken)
                    .map((score) => (
                      <div key={score.id} className="border rounded-lg p-4 space-y-3" data-testid={`card-health-score-${score.employeeId}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">Employee ID: {score.employeeId.slice(0, 8)}...</div>
                            <div className="text-sm text-muted-foreground">
                              Risk Level: <Badge variant={score.riskLevel === 'critical' ? 'destructive' : 'default'}>
                                {score.riskLevel}
                              </Badge>
                            </div>
                          </div>
                          <Badge variant="outline">{score.actionPriority} priority</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Engagement:</span>{' '}
                            <span className="font-medium">{parseFloat(score.overallEngagementScore).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Turnover Risk:</span>{' '}
                            <span className="font-medium text-destructive">{parseFloat(score.turnoverRiskScore).toFixed(0)}%</span>
                          </div>
                        </div>

                        {score.suggestedActions && score.suggestedActions.length > 0 && (
                          <div className="space-y-2">
                            <div className="font-medium text-sm">Suggested Actions:</div>
                            {score.suggestedActions.slice(0, 2).map((action, idx) => (
                              <div key={idx} className="bg-muted/50 p-3 rounded text-sm">
                                <div className="font-medium">{action.action}</div>
                                <div className="text-muted-foreground italic mt-1">"{action.conversationStarter}"</div>
                                <div className="text-xs text-muted-foreground mt-1">Expected: {action.expectedImpact}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        <Button
                          size="sm"
                          onClick={() => {
                            const notes = prompt("Enter action notes (what did you do?):");
                            if (notes) {
                              handleTakeAction(score.id, notes);
                            }
                          }}
                          data-testid={`button-take-action-${score.employeeId}`}
                        >
                          Mark Action Taken
                        </Button>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    ✅ All clear! No employees require immediate action.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employer Benchmarks</CardTitle>
              <CardDescription>How you rank vs. industry standards</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {benchmarks && benchmarks.length > 0 ? (
                  benchmarks.map((benchmark) => (
                    <div key={benchmark.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-medium">{benchmark.targetName}</div>
                          <div className="text-sm text-muted-foreground capitalize">{benchmark.benchmarkType}</div>
                        </div>
                        <Badge variant={benchmark.percentileRank >= 75 ? "default" : "secondary"}>
                          {benchmark.percentileRank}th percentile
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Your Score</div>
                          <div className="text-xl font-bold">{parseFloat(benchmark.overallScore).toFixed(1)}/5.0</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Industry Avg</div>
                          <div className="text-xl font-bold">{parseFloat(benchmark.industryAverageScore).toFixed(1)}/5.0</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Responses</div>
                          <div className="text-xl font-bold">{benchmark.totalResponses}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No benchmarks calculated yet. Collect employer ratings to see your scores.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recognition" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Employee Recognition Feed
              </CardTitle>
              <CardDescription>Recent kudos and achievements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recognitions && recognitions.length > 0 ? (
                  recognitions.slice(0, 10).map((recognition) => (
                    <div key={recognition.id} className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Award className="h-5 w-5 text-yellow-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {recognition.category && (
                              <Badge variant="outline" className="mr-2">{recognition.category}</Badge>
                            )}
                            Employee {recognition.recognizedEmployeeId.slice(0, 8)}...
                          </div>
                          <div className="text-sm mt-1">{recognition.reason}</div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(recognition.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No recognitions yet. Start celebrating your team's achievements!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
