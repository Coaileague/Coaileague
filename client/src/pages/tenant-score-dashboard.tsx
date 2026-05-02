/**
 * Tenant Score Dashboard
 * ======================
 * Owner-facing dashboard showing the workspace's CoAIleague score —
 * the system-computed view of the company on factors officers care about.
 *
 * Score is read from /api/scoring/tenant. Snapshots are taken monthly by
 * the scoring scheduler; this page also exposes a "Snapshot now" button
 * that owners can use ad hoc.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface TenantScore {
  source: "live" | "snapshot";
  workspaceId?: string;
  overallScore: number;
  tier: string;
  // live shape
  dimensions?: {
    turnover: number;
    payCompetitiveness: number;
    workAvailability: number;
    roleDiversity: number;
    internalMobility: number;
    licenseUpkeep: number;
    payrollReliability: number;
    aggregateCompliance: number;
  };
  // snapshot shape (snake-case from DB)
  turnoverScore?: number;
  payCompetitivenessScore?: number;
  workAvailabilityScore?: number;
  roleDiversityScore?: number;
  internalMobilityScore?: number;
  licenseUpkeepScore?: number;
  payrollReliabilityScore?: number;
  aggregateComplianceScore?: number;
  periodEnd?: string;
}

const TIER_LABEL: Record<string, string> = {
  excellent: "Excellent",
  strong: "Strong",
  fair: "Fair",
  weak: "Needs Improvement",
  critical: "Critical",
};

const TIER_COLOR: Record<string, string> = {
  excellent: "bg-green-100 text-green-800",
  strong: "bg-sky-100 text-sky-800",
  fair: "bg-amber-100 text-amber-800",
  weak: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function TenantScoreDashboard() {
  const [data, setData] = useState<TenantScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadScore();
  }, []);

  async function loadScore() {
    setLoading(true);
    try {
      const r = await fetch("/api/scoring/tenant", { credentials: "include" });
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleSnapshot() {
    setSnapshotting(true);
    try {
      const r = await fetch("/api/scoring/tenant/snapshot", {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) {
        toast({ title: "Snapshot recorded" });
        loadScore();
      } else {
        const err = await r.json();
        toast({ title: "Snapshot failed", description: err.error, variant: "destructive" });
      }
    } finally {
      setSnapshotting(false);
    }
  }

  if (loading) return <div className="p-8 text-slate-500">Loading score…</div>;
  if (!data) return <div className="p-8 text-slate-500">No score data available.</div>;

  const dims = data.dimensions ?? {
    turnover: data.turnoverScore ?? 0,
    payCompetitiveness: data.payCompetitivenessScore ?? 0,
    workAvailability: data.workAvailabilityScore ?? 0,
    roleDiversity: data.roleDiversityScore ?? 0,
    internalMobility: data.internalMobilityScore ?? 0,
    licenseUpkeep: data.licenseUpkeepScore ?? 0,
    payrollReliability: data.payrollReliabilityScore ?? 0,
    aggregateCompliance: data.aggregateComplianceScore ?? 0,
  };

  const dimensions: Array<{ key: keyof typeof dims; label: string; weight: string }> = [
    { key: "turnover", label: "Turnover (vs. industry)", weight: "25%" },
    { key: "payCompetitiveness", label: "Pay vs. platform peers", weight: "20%" },
    { key: "workAvailability", label: "Shift availability", weight: "10%" },
    { key: "roleDiversity", label: "Role diversity", weight: "10%" },
    { key: "internalMobility", label: "Internal mobility", weight: "10%" },
    { key: "licenseUpkeep", label: "License upkeep", weight: "15%" },
    { key: "payrollReliability", label: "Payroll reliability", weight: "5%" },
    { key: "aggregateCompliance", label: "Officer compliance avg.", weight: "5%" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">CoAIleague Tenant Score</h1>
          <p className="mt-1 text-sm text-slate-600">
            How the platform sees your company on signals officers care about.
            System-computed, no manual edits.
          </p>
        </div>
        <Button onClick={handleSnapshot} disabled={snapshotting}>
          {snapshotting ? "Snapshotting…" : "Snapshot now"}
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between">
            <span className="text-5xl font-bold tracking-tight">{data.overallScore}</span>
            <Badge className={TIER_COLOR[data.tier] ?? ""}>
              {TIER_LABEL[data.tier] ?? data.tier}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500">
            Source: {data.source === "snapshot" ? "monthly snapshot" : "live computation"}
            {data.periodEnd ? ` • period ending ${new Date(data.periodEnd).toLocaleDateString()}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Dimensions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dimensions.map((d) => (
            <div key={d.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">{d.label}</span>
                <span className="text-slate-500">
                  {dims[d.key]} <span className="text-xs text-slate-400">({d.weight})</span>
                </span>
              </div>
              <Progress value={dims[d.key]} className="mt-1 h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
