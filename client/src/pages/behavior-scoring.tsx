import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, TrendingUp, Clock, CheckCircle, AlertTriangle,
  Star, Users, Target, Award, BarChart3
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: "behavior-scoring",
  title: "Employee Behavior Scoring",
  subtitle: "AI-powered reliability, engagement, and performance tracking",
  category: "operations",
};

interface BehaviorScore {
  id: string;
  employeeId: string;
  workspaceId: string;
  reliabilityScore: string;
  onTimeArrivalRate: string;
  shiftCompletionRate: string;
  noShowRate: string;
  offerAcceptanceRate: string;
  avgResponseTimeMinutes: number;
  extraShiftWillingness: string;
  clientSatisfactionScore: string;
  supervisorRating: string;
  incidentRate: string;
  totalOffersReceived: number;
  totalOffersAccepted: number;
  totalShiftsCompleted: number;
  totalHoursWorked: string;
  dataPointsCount: number;
  employeeName: string;
  employeeRole: string;
}

function ScoreBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Activity; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3" data-testid={`score-bar-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <span className="text-sm shrink-0 truncate max-w-[6rem] sm:max-w-[8rem]">{label}</span>
      <Progress value={pct} className="flex-1" />
      <span className="text-sm font-medium w-12 text-right">{pct}%</span>
    </div>
  );
}

function EmployeeScoreCard({ score }: { score: BehaviorScore }) {
  const reliability = parseFloat(score.reliabilityScore) || 0;
  const satisfaction = parseFloat(score.clientSatisfactionScore) || 0;
  const overallScore = (reliability + satisfaction) / 2;
  const initials = score.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2);

  let tierBadge = "Developing";
  let tierVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  if (overallScore >= 0.9) { tierBadge = "Elite"; tierVariant = "default"; }
  else if (overallScore >= 0.75) { tierBadge = "Strong"; tierVariant = "outline"; }
  else if (overallScore >= 0.5) { tierBadge = "Developing"; tierVariant = "secondary"; }
  else { tierBadge = "At Risk"; tierVariant = "destructive"; }

  return (
    <Card data-testid={`card-employee-score-${score.employeeId}`}>
      <CardHeader className="flex flex-row items-center gap-3 pb-3">
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate" data-testid={`text-employee-name-${score.employeeId}`}>{score.employeeName}</CardTitle>
          <p className="text-sm text-muted-foreground truncate">{score.employeeRole || 'Team Member'}</p>
        </div>
        <Badge variant={tierVariant} data-testid={`badge-tier-${score.employeeId}`}>{tierBadge}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScoreBar label="Reliability" value={reliability} icon={CheckCircle} color="text-green-500" />
        <ScoreBar label="On-Time Rate" value={parseFloat(score.onTimeArrivalRate) || 0} icon={Clock} color="text-blue-500" />
        <ScoreBar label="Completion" value={parseFloat(score.shiftCompletionRate) || 0} icon={Target} color="text-purple-500" />
        <ScoreBar label="Satisfaction" value={satisfaction} icon={Star} color="text-yellow-500" />
        <ScoreBar label="Engagement" value={parseFloat(score.offerAcceptanceRate) || 0} icon={TrendingUp} color="text-orange-500" />

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
          <span data-testid={`stat-shifts-${score.employeeId}`}>{score.totalShiftsCompleted} shifts</span>
          <span>|</span>
          <span data-testid={`stat-hours-${score.employeeId}`}>{parseFloat(score.totalHoursWorked || '0').toFixed(0)}h worked</span>
          <span>|</span>
          <span>{score.dataPointsCount} data points</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCards({ scores }: { scores: BehaviorScore[] }) {
  const avgReliability = scores.length > 0
    ? scores.reduce((sum, s) => sum + (parseFloat(s.reliabilityScore) || 0), 0) / scores.length
    : 0;
  const avgSatisfaction = scores.length > 0
    ? scores.reduce((sum, s) => sum + (parseFloat(s.clientSatisfactionScore) || 0), 0) / scores.length
    : 0;
  const totalShifts = scores.reduce((sum, s) => sum + (s.totalShiftsCompleted || 0), 0);
  const atRisk = scores.filter(s => (parseFloat(s.reliabilityScore) || 0) < 0.5).length;

  const cards = [
    { label: "Avg Reliability", value: `${Math.round(avgReliability * 100)}%`, icon: CheckCircle, color: "text-green-500" },
    { label: "Avg Satisfaction", value: `${Math.round(avgSatisfaction * 100)}%`, icon: Star, color: "text-yellow-500" },
    { label: "Total Shifts", value: totalShifts.toLocaleString(), icon: BarChart3, color: "text-blue-500" },
    { label: "At Risk", value: atRisk.toString(), icon: AlertTriangle, color: "text-red-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <c.icon className={`h-5 w-5 sm:h-8 sm:w-8 shrink-0 ${c.color}`} />
            <div className="min-w-0">
              <p className="text-base sm:text-2xl font-bold truncate" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>{c.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function BehaviorScoringPage() {
  const { data: scores, isLoading } = useQuery<BehaviorScore[]>({
    queryKey: ['/api/engagement/behavior-scores'],
  });

  const { data: topPerformers, isLoading: topLoading } = useQuery<BehaviorScore[]>({
    queryKey: ['/api/engagement/behavior-scores/top'],
  });

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <SummaryCards scores={scores || []} />
        )}

        <Tabs defaultValue="all" data-testid="tabs-behavior-scoring">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-all-employees">
              <Users className="h-4 w-4 mr-1" />All
            </TabsTrigger>
            <TabsTrigger value="top" data-testid="tab-top-performers">
              <Award className="h-4 w-4 mr-1" />Top
            </TabsTrigger>
            <TabsTrigger value="at-risk" data-testid="tab-at-risk">
              <AlertTriangle className="h-4 w-4 mr-1" />At Risk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {isLoading ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>)}
              </div>
            ) : !scores?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Behavior Data Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Employee behavior scores are automatically generated as employees complete shifts, respond to offers, and receive ratings. Scores will appear here as data accumulates.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scores.map(score => <EmployeeScoreCard key={score.id} score={score} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="top" className="mt-4">
            {topLoading ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>)}
              </div>
            ) : !topPerformers?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Award className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Top Performers Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Top performers will be identified automatically as behavior data is collected and analyzed.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {topPerformers.map(score => <EmployeeScoreCard key={score.id} score={score} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="at-risk" className="mt-4">
            {isLoading ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>)}
              </div>
            ) : (() => {
              const atRisk = (scores || []).filter(s => (parseFloat(s.reliabilityScore) || 0) < 0.5);
              return !atRisk.length ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No At-Risk Employees</h3>
                    <p className="text-muted-foreground max-w-md">
                      All tracked employees have reliability scores above the risk threshold. Great work!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {atRisk.map(score => <EmployeeScoreCard key={score.id} score={score} />)}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}