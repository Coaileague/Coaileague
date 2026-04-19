/**
 * Armory Compliance Panel — Readiness Section 2
 * Surfaces weapon inspection, qualification, and ammo data that the
 * existing armory-management.tsx doesn't yet show.
 *
 * Pairs with the /api/armory/* routes added in armoryRoutes.ts.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Award, Crosshair, Package } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface ArmorySummary {
  expiringQualifications: Array<{
    id: string;
    employeeId: string;
    weaponType: string;
    expiresAt: string;
    qualificationLevel?: string | null;
  }>;
  inspectionsOverdue: Array<{
    id: string;
    weaponId: string;
    nextInspectionDue: string | null;
    inspectionType: string;
  }>;
  lowAmmo: Array<{
    id: string;
    caliber: string;
    quantity_on_hand: number;
    reorder_threshold: number;
  }>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function ArmoryCompliancePage(): JSX.Element {
  const { data, isLoading } = useQuery<ArmorySummary>({
    queryKey: ["/api/armory/summary"],
  });

  const pageConfig: CanvasPageConfig = {
    id: "armory-compliance",
    title: "Armory Compliance",
    subtitle:
      "Weapon qualifications, inspections overdue, and ammo reorder alerts",
    category: "operations" as any,
    showHeader: true,
  };

  const summary = data ?? {
    expiringQualifications: [],
    inspectionsOverdue: [],
    lowAmmo: [],
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card data-testid="card-armory-quals">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Expiring Qualifications (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.expiringQualifications.length}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-armory-inspections">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Inspections Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.inspectionsOverdue.length}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-armory-ammo">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Ammo Below Threshold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {isLoading ? "…" : summary.lowAmmo.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="qualifications">
        <TabsList>
          <TabsTrigger value="qualifications" data-testid="tab-armory-qualifications">
            <Award className="h-4 w-4 mr-1" /> Qualifications
          </TabsTrigger>
          <TabsTrigger value="inspections" data-testid="tab-armory-inspections">
            <Crosshair className="h-4 w-4 mr-1" /> Inspections
          </TabsTrigger>
          <TabsTrigger value="ammo" data-testid="tab-armory-ammo">
            <Package className="h-4 w-4 mr-1" /> Ammo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualifications">
          <Card>
            <CardHeader>
              <CardTitle>Qualifications expiring in 30 days</CardTitle>
              <CardDescription>
                Officers whose firearms qualification expires soon. Schedule a
                re-qualification before the expires_at date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.expiringQualifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.expiringQualifications.map((q) => (
                    <li key={q.id} className="py-2 flex justify-between text-sm">
                      <span>
                        {q.employeeId} · {q.weaponType}
                        {q.qualificationLevel ? ` (${q.qualificationLevel})` : ""}
                      </span>
                      <Badge variant="secondary">{formatDate(q.expiresAt)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspections">
          <Card>
            <CardHeader>
              <CardTitle>Overdue inspections</CardTitle>
              <CardDescription>
                Weapons whose next_inspection_due has passed. Schedule an
                inspection and log the result via POST /api/armory/inspections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.inspectionsOverdue.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.inspectionsOverdue.map((i) => (
                    <li key={i.id} className="py-2 flex justify-between text-sm">
                      <span>
                        Weapon {i.weaponId} · {i.inspectionType}
                      </span>
                      <Badge variant="destructive">
                        {formatDate(i.nextInspectionDue)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ammo">
          <Card>
            <CardHeader>
              <CardTitle>Ammo at or below reorder threshold</CardTitle>
              <CardDescription>
                Replenish inventory. Every transaction (receive, issue, return)
                is ledgered in ammo_transactions for audit replay.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.lowAmmo.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {summary.lowAmmo.map((a) => (
                    <li key={a.id} className="py-2 flex justify-between text-sm">
                      <span>{a.caliber}</span>
                      <span>
                        <Badge variant="secondary" className="mr-2">
                          on hand: {a.quantity_on_hand}
                        </Badge>
                        <Badge variant="outline">
                          threshold: {a.reorder_threshold}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
