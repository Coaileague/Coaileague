/**
 * TrinityObservations — Proactive insights card for the owner dashboard.
 *
 * Instead of a raw list of pending tasks, this card summarises what Trinity
 * has noticed, written in Trinity's voice.  Pulls from the transparency
 * overview endpoint (already used by TrinityApprovalQueue) so no new
 * backend work is required.
 *
 * Voice rule: Trinity speaks in first person, past or present tense,
 * with confidence but without arrogance.  She names the deviation,
 * gives context, and offers a clear next step.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
import { useTrinityModal } from '@/components/trinity-chat-modal';
import { TrinityIconStatic } from '@/components/trinity-button';
import {
  AlertTriangle,
  Eye,
  TrendingDown,
  Users,
  DollarSign,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface OverviewData {
  pendingEscalations: number;
  actionsToday: number;
  succeededToday: number;
  failedToday: number;
  costThisMonth: number;
  anomaliesDetected?: number;
}

const ANOMALY_ICONS: Record<string, typeof AlertTriangle> = {
  gps_fraud: Eye,
  coverage_gap: Users,
  ghost_employee: Users,
  billing_anomaly: DollarSign,
  incident_pattern: AlertTriangle,
};

function trinityObservationSummary(data: OverviewData): string {
  const parts: string[] = [];

  if (data.pendingEscalations > 0) {
    parts.push(
      data.pendingEscalations === 1
        ? `I have one action pending your approval.`
        : `I have ${data.pendingEscalations} actions queued for your review${
            data.pendingEscalations >= 5 ? ' — a few are time-sensitive' : ''
          }.`
    );
  }

  if (data.failedToday > 0) {
    parts.push(`${data.failedToday} of today's autonomous actions didn't complete as expected.`);
  }

  if (data.anomaliesDetected && data.anomaliesDetected > 0) {
    parts.push(
      data.anomaliesDetected === 1
        ? `I flagged one anomaly that warrants your attention.`
        : `I've flagged ${data.anomaliesDetected} anomalies worth reviewing.`
    );
  }

  if (parts.length === 0) {
    const successRate = data.actionsToday > 0
      ? Math.round((data.succeededToday / data.actionsToday) * 100)
      : 100;
    return `Operations look clean. I completed ${data.actionsToday || 0} tasks today with a ${successRate}% success rate. Nothing unusual to report.`;
  }

  return parts.join(' ');
}

export function TrinityObservations() {
  const [, setLocation] = useLocation();
  const { openModal } = useTrinityModal();

  const { data, isLoading, isError } = useQuery<{ success: boolean; overview: OverviewData }>({
    queryKey: ['/api/trinity/transparency/overview'],
    refetchInterval: 120_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-4 h-24 bg-muted/20 rounded-lg" />
      </Card>
    );
  }

  if (isError || !data?.overview) return null;

  const overview = data.overview;
  const hasIssues = overview.pendingEscalations > 0 || overview.failedToday > 0 || (overview.anomaliesDetected ?? 0) > 0;
  const summary = trinityObservationSummary(overview);

  return (
    <Card className="border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
      <CardHeader className="py-3 px-4 pb-0">
        <div className="flex items-center gap-2">
          <TrinityIconStatic size={16} className="text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Trinity's Observations</span>
          {hasIssues && (
            <Badge variant="destructive" className="h-4 text-[9px] px-1.5 ml-auto">
              {(overview.pendingEscalations || 0) + (overview.failedToday || 0) + (overview.anomaliesDetected || 0)} items
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-2 pb-3">
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">{summary}</p>

        {/* Metric pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {overview.pendingEscalations > 0 && (
            <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <Clock className="h-3 w-3" />
              {overview.pendingEscalations} pending
            </span>
          )}
          {overview.actionsToday > 0 && (
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <Sparkles className="h-3 w-3" />
              {overview.actionsToday} actions today
            </span>
          )}
          {(overview.anomaliesDetected ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <AlertTriangle className="h-3 w-3" />
              {overview.anomaliesDetected} anomalies
            </span>
          )}
          {overview.failedToday > 0 && (
            <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <TrendingDown className="h-3 w-3" />
              {overview.failedToday} failed
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => openModal()}
            data-testid="button-trinity-observations-ask"
          >
            Ask Trinity
          </Button>
          {hasIssues && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setLocation('/trinity/transparency')}
              data-testid="button-trinity-observations-view"
            >
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
