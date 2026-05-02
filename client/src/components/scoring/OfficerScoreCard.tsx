/**
 * OfficerScoreCard
 * ================
 * Self-view of the cross-tenant CoAIleague score for the authed officer.
 * Reads /api/scoring/officer/me. Shows current score, tier, factor breakdown,
 * closing-score history (immutable past tenants), and the public-recognition
 * consent toggle.
 *
 * Designed to be embedded on the officer's profile page. Does not display
 * SSN, fingerprint, or any cross-tenant PII beyond what the API returns.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface FactorBreakdown {
  attendance: number;
  performance: number;
  behavior: number;
  paperwork: number;
  training: number;
  interview: number;
  veteran: number;
  bilingual: number;
  tenure: number;
}

interface ClosingHistoryEntry {
  tenantName: string;
  score: number;
  tier: string;
  separationType: string;
  separationDate: string;
}

interface ScoreView {
  currentScore: number;
  tier: string;
  factorBreakdown: FactorBreakdown | null;
  veteranStatus: boolean;
  veteranVerified: boolean;
  primaryLanguages: string[] | null;
  bilingualVerified: boolean;
  tenureFirstSeenAt: string;
  closingHistory: ClosingHistoryEntry[];
}

const TIER_LABEL: Record<string, string> = {
  highly_favorable: "Highly Favorable",
  favorable: "Favorable",
  less_favorable: "Less Favorable",
  low_priority: "Low Priority",
  minimum_priority: "Minimum Priority",
  hard_blocked: "Hard Blocked",
};

const FACTOR_LABEL: Record<keyof FactorBreakdown, string> = {
  attendance: "Attendance & shift reliability",
  performance: "Work performance",
  behavior: "Behavior & discipline",
  paperwork: "Paperwork & compliance",
  training: "Training & certifications",
  interview: "Trinity interview",
  veteran: "Veteran (DD-214 verified)",
  bilingual: "Bilingual / multilingual",
  tenure: "Platform tenure",
};

export function OfficerScoreCard() {
  const [data, setData] = useState<ScoreView | null>(null);
  const [loading, setLoading] = useState(true);
  const [recognitionConsent, setRecognitionConsent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/scoring/officer/me", { credentials: "include" })
      .then(async (r) => (r.ok ? ((await r.json()) as ScoreView) : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggleConsent(next: boolean) {
    setRecognitionConsent(next);
    const r = await fetch("/api/scoring/officer/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ consent: next }),
    });
    if (!r.ok) {
      setRecognitionConsent(!next);
      toast({ title: "Could not update consent", variant: "destructive" });
    } else {
      toast({
        title: next ? "Opted in to public recognition" : "Opted out of public recognition",
      });
    }
  }

  if (loading) return <Card><CardContent className="p-6 text-slate-500">Loading…</CardContent></Card>;
  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">
          Cross-tenant score not available yet — your global officer record
          hasn't been linked. Ask your manager to complete onboarding.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between">
            <div>
              <span className="text-5xl font-bold tracking-tight">{data.currentScore}</span>
              <span className="ml-2 text-sm text-slate-500">/ 100</span>
            </div>
            <Badge>{TIER_LABEL[data.tier] ?? data.tier}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Your CoAIleague score follows you across every tenant on the
            platform. Computed by the system from objective signals — never
            edited by managers.
          </p>
        </CardContent>
      </Card>

      {data.factorBreakdown ? (
        <Card>
          <CardHeader>
            <CardTitle>Factor breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(FACTOR_LABEL) as Array<keyof FactorBreakdown>).map((k) => (
              <div key={k}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-slate-700">{FACTOR_LABEL[k]}</span>
                  <span className="text-slate-500">{data.factorBreakdown?.[k] ?? 0}</span>
                </div>
                <Progress value={data.factorBreakdown?.[k] ?? 0} className="mt-1 h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Public recognition</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="pr-6 text-sm text-slate-600">
              Opt in to be eligible for the public CoAIleague Officer of the
              Month / Year shout-out. Your first name and last initial may
              appear; your full name, address, and SSN never will.
            </div>
            <Switch checked={recognitionConsent} onCheckedChange={toggleConsent} />
          </div>
        </CardContent>
      </Card>

      {data.closingHistory && data.closingHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Closing scores from past employers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-slate-600">
              Frozen by the system at separation. These are not editable by
              any manager and are visible to future employers.
            </p>
            {data.closingHistory.map((c, idx) => (
              <div
                key={`${c.tenantName}-${idx}`}
                className="flex items-baseline justify-between border-t pt-3"
              >
                <div>
                  <div className="font-medium text-slate-900">{c.tenantName}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(c.separationDate).toLocaleDateString()} · {c.separationType}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{c.score}</div>
                  <div className="text-xs text-slate-500">{TIER_LABEL[c.tier] ?? c.tier}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default OfficerScoreCard;
