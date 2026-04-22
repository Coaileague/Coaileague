import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Shield, AlertTriangle, CheckCircle, Clock, Users, DollarSign, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface CandidateEval {
  candidateId: string;
  name: string;
  rankScore: number;
  proximityMiles?: number;
  otRisk?: boolean;
  otHoursProjected?: number;
  complianceStatus?: string;
  reliabilityScore?: number;
  costImpact?: number;
  reasoning: string;
}

interface Decision {
  id: string;
  workspaceId: string;
  triggerEvent: string | null;
  taskType: string | null;
  taskComplexity: string | null;
  decisionType: string;
  domain: string;
  chosenOption: string;
  chosenOptionId: string | null;
  reasoning: string;
  alternativesConsidered: Array<{ optionId: string; optionLabel: string; rejectionReason: string; score?: number }> | null;
  candidatesEvaluated: CandidateEval[] | null;
  confidenceScore: string | null;
  triadReviewTriggered: boolean | null;
  verifierVerdict: string | null;
  verifierReasoning: string | null;
  humanOverride: boolean | null;
  overrideBy: string | null;
  overrideReason: string | null;
  outcomeStatus: string | null;
  tokensUsed: number | null;
  costUsd: string | null;
  createdAt: string;
}

function JusticeBadge({ decision }: { decision: Decision }) {
  if (decision.humanOverride) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" data-testid={`badge-override-${decision.id}`}>
        <Users className="w-3 h-3 mr-1" />
        Manual Override
      </Badge>
    );
  }
  if (decision.triadReviewTriggered && decision.verifierVerdict === 'OVERRIDE') {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" data-testid={`badge-justice-override-${decision.id}`}>
        <AlertTriangle className="w-3 h-3 mr-1" />
        Justice Override
      </Badge>
    );
  }
  if (decision.triadReviewTriggered && decision.verifierVerdict === 'ESCALATE') {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" data-testid={`badge-escalated-${decision.id}`}>
        <AlertTriangle className="w-3 h-3 mr-1" />
        Escalated
      </Badge>
    );
  }
  if (decision.triadReviewTriggered && decision.verifierVerdict === 'AFFIRM') {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" data-testid={`badge-triad-certified-${decision.id}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        Triad Certified
      </Badge>
    );
  }
  return null;
}

function getComplianceColor(status?: string) {
  if (!status) return 'text-muted-foreground';
  switch (status) {
    case 'clear': return 'text-green-600 dark:text-green-400';
    case 'expiring': return 'text-amber-600 dark:text-amber-400';
    case 'expired': case 'missing': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
}

function getScoreColor(score: number) {
  if (score >= 0.8) return 'text-green-600 dark:text-green-400';
  if (score >= 0.6) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function DomainIcon({ domain }: { domain: string }) {
  switch (domain) {
    case 'scheduling': return <Clock className="w-4 h-4" />;
    case 'compliance': return <Shield className="w-4 h-4" />;
    case 'payroll': return <DollarSign className="w-4 h-4" />;
    case 'invoicing': return <FileText className="w-4 h-4" />;
    default: return <Activity className="w-4 h-4" />;
  }
}

function DecisionCard({ decision }: { decision: Decision }) {
  const [expanded, setExpanded] = useState(false);
  const [showJudge, setShowJudge] = useState(false);
  const confidence = decision.confidenceScore ? parseFloat(decision.confidenceScore) : null;
  const createdDate = new Date(decision.createdAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  return (
    <Card className="mb-3" data-testid={`card-decision-${decision.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <DomainIcon domain={decision.domain} />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate" data-testid={`text-decision-choice-${decision.id}`}>
                {decision.chosenOption}
              </p>
              <p className="text-xs text-muted-foreground">
                {decision.decisionType.replace(/_/g, ' ')} — {createdDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {confidence !== null && (
              <Badge variant="secondary" className={getScoreColor(confidence)} data-testid={`badge-confidence-${decision.id}`}>
                {(confidence * 100).toFixed(0)}%
              </Badge>
            )}
            <JusticeBadge decision={decision} />
            <Badge variant="outline" data-testid={`badge-status-${decision.id}`}>
              {decision.outcomeStatus || 'pending'}
            </Badge>
          </div>
        </div>

        <p className="text-sm mt-2 text-muted-foreground" data-testid={`text-reasoning-${decision.id}`}>
          {decision.reasoning}
        </p>

        {decision.verifierReasoning && decision.triadReviewTriggered && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJudge(!showJudge)}
              data-testid={`button-toggle-judge-${decision.id}`}
            >
              {showJudge ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              Strategic Review ({decision.verifierVerdict})
            </Button>
            {showJudge && (
              <div className="mt-1 p-2 rounded-md bg-muted text-sm" data-testid={`text-judge-reasoning-${decision.id}`}>
                {decision.verifierReasoning}
              </div>
            )}
          </div>
        )}

        {decision.candidatesEvaluated && decision.candidatesEvaluated.length > 0 && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              data-testid={`button-toggle-candidates-${decision.id}`}
            >
              {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              {decision.candidatesEvaluated.length} candidates evaluated
            </Button>
            {expanded && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs border-collapse" data-testid={`table-candidates-${decision.id}`}>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-1 font-medium">Name</th>
                      <th className="text-right p-1 font-medium">Score</th>
                      <th className="text-right p-1 font-medium">Distance</th>
                      <th className="text-right p-1 font-medium">Reliability</th>
                      <th className="text-center p-1 font-medium">OT Risk</th>
                      <th className="text-center p-1 font-medium">Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.candidatesEvaluated.map((c, idx) => {
                      const isSelected = c.candidateId === decision.chosenOptionId;
                      return (
                        <tr
                          key={c.candidateId}
                          className={`border-b ${isSelected ? 'bg-green-50 dark:bg-green-950' : ''}`}
                          data-testid={`row-candidate-${decision.id}-${idx}`}
                        >
                          <td className={`p-1 ${isSelected ? 'font-semibold' : ''}`}>
                            {isSelected && <CheckCircle className="w-3 h-3 inline mr-1 text-green-600" />}
                            {c.name}
                          </td>
                          <td className={`text-right p-1 ${getScoreColor(c.rankScore)}`}>
                            {(c.rankScore * 100).toFixed(0)}%
                          </td>
                          <td className="text-right p-1">
                            {c.proximityMiles?.toFixed(1) || '-'}mi
                          </td>
                          <td className="text-right p-1">
                            {c.reliabilityScore ? (c.reliabilityScore * 100).toFixed(0) + '%' : '-'}
                          </td>
                          <td className="text-center p-1">
                            {c.otRisk ? (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">OT</Badge>
                            ) : (
                              <span className="text-green-600">-</span>
                            )}
                          </td>
                          <td className={`text-center p-1 ${getComplianceColor(c.complianceStatus)}`}>
                            {c.complianceStatus || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {decision.humanOverride && decision.overrideReason && (
          <div className="mt-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950 text-sm" data-testid={`text-override-reason-${decision.id}`}>
            <span className="font-medium">Override reason:</span> {decision.overrideReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TrinityScorecard() {
  const [domain, setDomain] = useState<string>('all');
  const [triadOnly, setTriadOnly] = useState(false);

  const { data, isLoading } = useQuery<{ decisions: Decision[]; total: number }>({
    queryKey: ['/api/trinity-decisions/decisions', domain, triadOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (domain !== 'all') params.set('domain', domain);
      if (triadOnly) params.set('triadOnly', 'true');
      params.set('limit', '50');
      const res = await fetch(`/api/trinity-decisions/decisions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch decisions');
      return res.json();
    },
  });

  const decisions = data?.decisions || [];
  const total = data?.total || 0;

  const triadCount = decisions.filter(d => d.triadReviewTriggered).length;
  const overrideCount = decisions.filter(d => d.humanOverride).length;
  const avgConfidence = decisions.length > 0
    ? decisions.reduce((sum, d) => sum + (d.confidenceScore ? parseFloat(d.confidenceScore) : 0), 0) / decisions.length
    : 0;

  return (
    <div className="space-y-4" data-testid="container-trinity-scorecard">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-scorecard-title">
            <Activity className="w-5 h-5" />
            Trinity Decision Intelligence
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} decisions logged — {triadCount} reviewed by Triad Justice — {overrideCount} human overrides
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger className="w-[140px]" data-testid="select-domain-filter">
              <SelectValue placeholder="All domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="scheduling">Scheduling</SelectItem>
              <SelectItem value="compliance">Compliance</SelectItem>
              <SelectItem value="payroll">Payroll</SelectItem>
              <SelectItem value="invoicing">Invoicing</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={triadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setTriadOnly(!triadOnly)}
            data-testid="button-triad-filter"
          >
            <Shield className="w-3 h-3 mr-1" />
            Triad Only
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold" data-testid="text-total-decisions">{total}</p>
            <p className="text-xs text-muted-foreground">Total Decisions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${getScoreColor(avgConfidence)}`} data-testid="text-avg-confidence">
              {(avgConfidence * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">Avg Confidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold" data-testid="text-triad-reviews">{triadCount}</p>
            <p className="text-xs text-muted-foreground">Triad Reviews</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-24" />
            </Card>
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-decisions">
              No decisions logged yet. Trinity will record her reasoning here as she makes scheduling, compliance, payroll, and invoicing decisions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div data-testid="list-decisions">
          {decisions.map(d => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </div>
      )}
    </div>
  );
}
