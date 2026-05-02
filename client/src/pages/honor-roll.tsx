import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HonorRollPick {
  globalOfficerId: string;
  awardType: "officer_of_month" | "officer_of_year";
  periodLabel: string;
  scoreAtSelection: number;
  tierAtSelection: string;
  monthsAboveThreshold: number;
  featuredWorkspaceId: string | null;
  featuredWorkspaceName: string | null;
  displayFirstName: string;
  displayLastInitial: string;
  photoConsent: boolean;
  photoUrl?: string | null;
}

interface HonorRollResponse {
  officerOfMonth: HonorRollPick | null;
  officerOfYear: HonorRollPick | null;
  recentMonthly: HonorRollPick[];
}

export default function HonorRoll() {
  const [data, setData] = useState<HonorRollResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/honor-roll")
      .then((r) => r.json())
      .then((d: HonorRollResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <a href="/" className="text-2xl font-bold text-slate-900">CoAIleague</a>
          <nav className="flex gap-6 text-sm text-slate-600">
            <a href="/universal-marketing" className="hover:text-slate-900">Platform</a>
            <a href="/pricing" className="hover:text-slate-900">Pricing</a>
            <a href="/honor-roll" className="font-semibold text-slate-900">Honor Roll</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">
          CoAIleague Honor Roll
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Officer of the Month &amp; Year
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Selected by the platform — not by managers, not by votes. Officers above
          a sustained score floor for at least 6 months (12 for the year award)
          who have opted in to public recognition. The award is given by
          CoAIleague to honor the work and to thank the tenants who make it
          possible.
        </p>
      </section>

      {loading ? (
        <div className="mx-auto max-w-6xl px-6 pb-16 text-center text-slate-500">
          Loading…
        </div>
      ) : (
        <>
          <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-12 md:grid-cols-2">
            <PickCard
              label="Officer of the Year"
              accent="from-amber-100 to-amber-50 ring-amber-200"
              pick={data?.officerOfYear ?? null}
              emptyMessage="The next platform-wide Officer of the Year is being selected."
            />
            <PickCard
              label="Officer of the Month"
              accent="from-sky-100 to-sky-50 ring-sky-200"
              pick={data?.officerOfMonth ?? null}
              emptyMessage="This month's selection is being computed."
            />
          </section>

          <section className="mx-auto max-w-6xl px-6 pb-20">
            <h2 className="mb-6 text-2xl font-semibold text-slate-900">
              Recent monthly honorees
            </h2>
            {data?.recentMonthly?.length ? (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {data.recentMonthly.map((p) => (
                  <Card key={`${p.awardType}-${p.periodLabel}`} className="border-slate-200">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          {p.displayFirstName} {p.displayLastInitial}.
                        </span>
                        <Badge>{p.periodLabel}</Badge>
                      </div>
                      {p.featuredWorkspaceName ? (
                        <p className="mt-1 text-xs text-slate-500">{p.featuredWorkspaceName}</p>
                      ) : null}
                      <p className="mt-3 text-xs text-slate-600">
                        Tier: <span className="font-medium">{formatTier(p.tierAtSelection)}</span>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No recent honorees yet — watch this space.
              </p>
            )}
          </section>

          <section className="border-t bg-slate-50">
            <div className="mx-auto max-w-6xl px-6 py-12 text-center text-sm text-slate-600">
              <p>
                The Honor Roll is computed from objective performance signals
                across attendance, training, paperwork, and Trinity interview
                evaluations. There is no human voting. Officers must opt in
                before they can appear here.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                CoAIleague is not a public-safety service. Officers' role is to
                observe, deter, and report — emergency response always belongs to
                licensed human supervisors and 9-1-1.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PickCard({
  label,
  accent,
  pick,
  emptyMessage,
}: {
  label: string;
  accent: string;
  pick: HonorRollPick | null;
  emptyMessage: string;
}) {
  return (
    <Card className={`overflow-hidden bg-gradient-to-br ring-1 ${accent}`}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pick ? (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-slate-900">
                {pick.displayFirstName} {pick.displayLastInitial}.
              </span>
              <Badge>{pick.periodLabel}</Badge>
            </div>
            {pick.featuredWorkspaceName ? (
              <p className="mt-1 text-sm text-slate-600">
                Currently with <span className="font-medium">{pick.featuredWorkspaceName}</span>
              </p>
            ) : null}
            <p className="mt-3 text-sm text-slate-700">
              Tier <span className="font-medium">{formatTier(pick.tierAtSelection)}</span> —
              maintained for {pick.monthsAboveThreshold} months.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatTier(tier: string): string {
  switch (tier) {
    case "highly_favorable": return "Highly Favorable";
    case "favorable":        return "Favorable";
    case "less_favorable":   return "Less Favorable";
    case "low_priority":     return "Low Priority";
    case "minimum_priority": return "Minimum Priority";
    case "hard_blocked":     return "Hard Blocked";
    default:                 return tier;
  }
}
