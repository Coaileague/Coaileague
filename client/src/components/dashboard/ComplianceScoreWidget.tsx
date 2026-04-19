/**
 * Owner Compliance Score Widget — Readiness Section 27 #9
 *
 * Reads GET /api/compliance/matrix/my-score (thin tenant-facing wrapper
 * over the computeComplianceScore service) and shows a 0-100 gauge +
 * component breakdown + top failing notes.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface ComplianceScore {
  workspaceId: string;
  score: number;
  components: {
    licensing: number;
    qualifications: number;
    inspections: number;
    insurance: number;
    incidents: number;
  };
  notes: string[];
}

export function ComplianceScoreWidget(): JSX.Element {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<ComplianceScore>({
    queryKey: ["/api/compliance/matrix/my-score"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card data-testid="owner-compliance-widget-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Compliance Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const score = data?.score ?? 0;
  const ring =
    score >= 80 ? "text-emerald-600 border-emerald-500/30" :
    score >= 60 ? "text-amber-600 border-amber-500/30" : "text-red-600 border-red-500/40";

  const components = data?.components ?? { licensing: 0, qualifications: 0, inspections: 0, insurance: 0, incidents: 0 };
  const topNotes = (data?.notes ?? []).slice(0, 3);

  return (
    <Card className={`border ${ring}`} data-testid="owner-compliance-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Compliance Score
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocation("/compliance")}
            data-testid="owner-compliance-widget-more"
          >
            Details →
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-bold ${score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`} data-testid="owner-compliance-score-value">
              {score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {Object.entries(components).map(([k, v]) => (
              <Badge
                key={k}
                variant={v >= 80 ? "secondary" : v >= 60 ? "outline" : "destructive"}
                className="capitalize"
              >
                {k}: {v}%
              </Badge>
            ))}
          </div>
        </div>
        {topNotes.length > 0 && (
          <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
            {topNotes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ComplianceScoreWidget;
