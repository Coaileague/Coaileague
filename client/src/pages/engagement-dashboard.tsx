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
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertCircle, TrendingUp, TrendingDown, Users, Heart, MessageSquare, Award, AlertTriangle, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

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
  const [actionNotesDialogOpen, setActionNotesDialogOpen] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);

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

  // Fetch employer ratings (for dispute purposes)
  const { data: employerRatings, isLoading: loadingRatings } = useQuery<EmployerRating[]>({
    queryKey: ['/api/engagement/employer-ratings'],
  });

  // Take action on health score
  const takeActionMutation = useMutation({
    mutationFn: async ({ id, actionNotes }: { id: string; actionNotes: string }) => {
      return await apiRequest("PATCH", `/api/engagement/health-scores/${id}/action`, { actionNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/health-scores'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Take Action Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const handleTakeAction = (scoreId: string, notes: string) => {
    takeActionMutation.mutate({ id: scoreId, actionNotes: notes });
  };

  const calculateHealthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", '/api/engagement/health-scores/calculate', {});
      return await res.json();
    },
    onSuccess: (data: { message?: string; calculated?: number; total?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/health-scores'] });
      toast({
        title: "Calculations Complete",
        description: data?.message || "Health scores have been calculated for all employees",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Calculation Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Dispute filing mutation
  const fileDisputeMutation = useMutation({
    mutationFn: async (data: DisputeFormData) => {
      if (!selectedRating) throw new Error("No rating selected");
      return apiRequest('POST', '/api/disputes', {
        ...data,
        disputeType: 'employer_rating',
        targetType: 'employer_ratings',
        targetId: selectedRating.id.toString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      setDisputeDialogOpen(false);
      disputeForm.reset();
      setSelectedRating(null);
      toast({
        title: "Success",
        description: "Dispute filed successfully. Support will review your case.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disputeForm = useForm<DisputeFormData>({
    resolver: zodResolver(disputeSchema),
    defaultValues: {
      title: "",
      reason: "",
      requestedOutcome: "",
      priority: "normal",
    },
  });

  const onDisputeSubmit = (data: DisputeFormData) => {
    fileDisputeMutation.mutate(data);
  };

  const handleOpenDisputeDialog = (rating: EmployerRating) => {
    setSelectedRating(rating);
    disputeForm.setValue('title', `Dispute: Employer rating from ${format(new Date(rating.submittedAt), 'MMM d, yyyy')}`);
    setDisputeDialogOpen(true);
  };

  // Calculate summary statistics
  const criticalRiskCount = healthScores?.filter(s => s.riskLevel === 'critical').length || 0;
  const highRiskCount = healthScores?.filter(s => s.riskLevel === 'high').length || 0;
  const requiresActionCount = healthScores?.filter(s => s.requiresManagerAction && !s.actionTaken).length || 0;
  
  const avgEngagement = healthScores && healthScores.length > 0
    ? (healthScores.reduce((sum, s) => sum + parseFloat(s.overallEngagementScore), 0) / healthScores.length).toFixed(1)
    : 'N/A';

  const latestBenchmark = benchmarks && benchmarks.length > 0 ? benchmarks[0] : null;

  const pageConfig: CanvasPageConfig = {
    id: 'engagement-dashboard',
    title: 'EngagementOS™',
    subtitle: 'Employee engagement intelligence & health monitoring',
    category: 'dashboard',
  };

  if (loadingHealthScores || loadingBenchmarks || loadingRecognitions) {
    return (
      <div className="h-full flex items-center justify-center">
        <ResponsiveLoading message="Loading engagement data..." />
      </div>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>

      {/* Mobile-optimized Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <Card className="mobile-card-enter">
          <CardHeader className="pb-1.5 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <Heart className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Avg Engagement</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold" data-testid="text-avg-engagement">{avgEngagement}%</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Across all employees</p>
          </CardContent>
        </Card>

        <Card className="mobile-card-enter">
          <CardHeader className="pb-1.5 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive flex-shrink-0" />
              <span className="truncate">High Risk</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-destructive" data-testid="text-high-risk-count">
              {criticalRiskCount + highRiskCount}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{criticalRiskCount} critical, {highRiskCount} high</p>
          </CardContent>
        </Card>

        <Card className="mobile-card-enter">
          <CardHeader className="pb-1.5 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Action Required</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-500" data-testid="text-action-required-count">
              {requiresActionCount}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Employees need attention</p>
          </CardContent>
        </Card>

        <Card className="mobile-card-enter">
          <CardHeader className="pb-1.5 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
              <span className="truncate">Employer Score</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold" data-testid="text-employer-score">
              {latestBenchmark ? `${parseFloat(latestBenchmark.overallScore).toFixed(1)}/5.0` : 'N/A'}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              {latestBenchmark ? `${latestBenchmark.percentileRank}th percentile` : 'Benchmark pending'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="action-queue" data-testid="tab-action-queue">
            Action Queue
            {requiresActionCount > 0 && (
              <Badge variant="destructive" className="ml-2">{requiresActionCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="ratings" data-testid="tab-ratings">
            <Star className="h-4 w-4 mr-2" />
            Employer Ratings
          </TabsTrigger>
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
                      <div className="text-2xl font-bold text-blue-500">
                        {healthScores.filter(s => s.riskLevel === 'low' || s.riskLevel === 'minimal').length}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="mb-4">No health scores calculated yet. Run calculations to see employee engagement health.</p>
                    <Button 
                      onClick={() => calculateHealthMutation.mutate()} 
                      disabled={calculateHealthMutation.isPending}
                      data-testid="button-run-calculations"
                    >
                      {calculateHealthMutation.isPending ? 'Calculating...' : 'Run Calculations'}
                    </Button>
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
                        <div className="flex items-start justify-between gap-2">
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
                            setActionNotes("");
                            setActionTargetId(score.id);
                            setActionNotesDialogOpen(true);
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
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="font-medium">{benchmark.targetName}</div>
                          <div className="text-sm text-muted-foreground capitalize">{benchmark.benchmarkType}</div>
                        </div>
                        <Badge variant={benchmark.percentileRank >= 75 ? "default" : "secondary"}>
                          {benchmark.percentileRank}th percentile
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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

        <TabsContent value="ratings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Individual Employer Ratings</CardTitle>
              <CardDescription>Employee feedback ratings - organizations can dispute inaccurate ones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {employerRatings && employerRatings.length > 0 ? (
                  employerRatings.map((rating) => (
                    <div 
                      key={rating.id} 
                      className="border rounded-lg p-4 hover-elevate"
                      data-testid={`rating-${rating.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star 
                                  key={i} 
                                  className={`h-4 w-4 ${i < Math.round(rating.overallScore) ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`}
                                />
                              ))}
                            </div>
                            <span className="font-semibold text-lg">{rating.overallScore.toFixed(1)}/5.0</span>
                            {rating.isAnonymous && (
                              <Badge variant="outline">Anonymous</Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Management:</span>{' '}
                              <span className="font-medium">{rating.managementQuality}/5</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Environment:</span>{' '}
                              <span className="font-medium">{rating.workEnvironment}/5</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Compensation:</span>{' '}
                              <span className="font-medium">{rating.compensationFairness}/5</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Growth:</span>{' '}
                              <span className="font-medium">{rating.growthOpportunities}/5</span>
                            </div>
                          </div>

                          {rating.positiveComments && (
                            <div className="bg-muted/50 p-3 rounded text-sm">
                              <div className="font-medium text-blue-600 dark:text-blue-400 mb-1">Positive:</div>
                              <p className="text-muted-foreground">{rating.positiveComments}</p>
                            </div>
                          )}

                          {rating.improvementSuggestions && (
                            <div className="bg-muted/50 p-3 rounded text-sm">
                              <div className="font-medium text-orange-600 dark:text-orange-400 mb-1">Suggestions:</div>
                              <p className="text-muted-foreground">{rating.improvementSuggestions}</p>
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground">
                            Submitted: {format(new Date(rating.submittedAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>

                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleOpenDisputeDialog(rating)}
                          data-testid={`button-dispute-rating-${rating.id}`}
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Dispute
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No employer ratings yet. Employees can submit ratings through the Employee Engagement page.
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

      {/* Dispute Filing Dialog */}
      <UniversalModal open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <UniversalModalContent size="xl" className="w-full h-full sm:h-auto sm:w-auto p-0 sm:p-6">
          <div className="h-full overflow-y-auto p-4 sm:p-0">
          <UniversalModalHeader>
            <UniversalModalTitle>File Dispute - Employer Rating</UniversalModalTitle>
            <UniversalModalDescription>
              Explain why you believe this rating is inaccurate or unfair. Support will investigate and respond.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <Form {...disputeForm}>
            <form onSubmit={disputeForm.handleSubmit(onDisputeSubmit)} className="space-y-4">
              {selectedRating && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium">Disputing rating with overall score: {selectedRating.overallScore.toFixed(1)}/5.0</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted: {format(new Date(selectedRating.submittedAt), 'MMM d, yyyy h:mm a')}
                    {selectedRating.isAnonymous && " • Anonymous"}
                  </p>
                </div>
              )}

              <FormField
                control={disputeForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dispute Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Brief summary of your dispute" data-testid="input-dispute-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={disputeForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detailed Reason (minimum 20 characters)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Explain in detail why this rating is inaccurate or unfair. Include specific examples and data if available."
                        data-testid="input-dispute-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={disputeForm.control}
                name="requestedOutcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Outcome (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={3} 
                        placeholder="What resolution would you like? (e.g., 'Remove this rating', 'Investigate source of rating')"
                        data-testid="input-dispute-outcome"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={disputeForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-dispute-priority">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setDisputeDialogOpen(false);
                  setSelectedRating(null);
                  disputeForm.reset();
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={fileDisputeMutation.isPending} data-testid="button-submit-dispute">
                  {fileDisputeMutation.isPending ? "Filing..." : "File Dispute"}
                </Button>
              </div>
            </form>
          </Form>
          </div>
        </UniversalModalContent>
      </UniversalModal>

      {/* Action Notes Dialog */}
      <UniversalModal open={actionNotesDialogOpen} onOpenChange={setActionNotesDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Record Action Taken</UniversalModalTitle>
            <UniversalModalDescription>
              Describe what action you took for this employee's engagement score.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="action-notes-input">Action Notes</Label>
            <Textarea
              id="action-notes-input"
              placeholder="e.g. Scheduled 1-on-1 check-in, sent recognition message..."
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              rows={3}
              data-testid="input-action-notes"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setActionNotesDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (actionTargetId && actionNotes.trim()) {
                  handleTakeAction(actionTargetId, actionNotes);
                  setActionNotesDialogOpen(false);
                }
              }}
              disabled={takeActionMutation.isPending || !actionNotes.trim()}
              data-testid="button-confirm-action"
            >
              {takeActionMutation.isPending ? "Saving..." : "Save Action"}
            </Button>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
