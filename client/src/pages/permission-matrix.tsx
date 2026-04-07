/**
 * Permission Matrix Editor — Phase 9B
 * =====================================
 * Allows org_owner / co_owner to toggle feature access for each workspace role.
 * Real-time updates via WebSocket (permission_update event) keep the matrix
 * in sync across all connected owner tabs.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocketBus } from "@/providers/WebSocketProvider";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  category: "page" | "action" | "report" | "data";
  defaultRoles: string[];
}

interface MatrixEntry {
  role: string;
  featureKey: string;
  enabled: boolean;
  isOverride: boolean;
}

interface MetaResponse {
  features: FeatureDefinition[];
  roles: readonly string[];
}

interface MatrixResponse {
  matrix: MatrixEntry[];
}

// ── Role display labels ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Org Admin",
  org_manager: "Org Manager",
  department_manager: "Dept Manager",
  manager: "Manager",
  supervisor: "Supervisor",
  shift_leader: "Shift Leader",
  guard: "Guard",
  security_officer: "Security Officer",
  armed_officer: "Armed Officer",
  site_lead: "Site Lead",
  contractor: "Contractor",
};

const CATEGORY_LABELS: Record<string, string> = {
  page: "Pages",
  action: "Actions",
  report: "Reports",
  data: "Data Access",
};

const CATEGORY_ORDER: string[] = ["page", "action", "report", "data"];

// ── Main Component ──────────────────────────────────────────────────────────

export default function PermissionMatrixPage() {
  const { toast } = useToast();
  const bus = useWebSocketBus();

  // Local optimistic state for pending toggles (prevents flicker)
  const [pendingToggles, setPendingToggles] = useState<
    Record<string, boolean>
  >({});

  const { data: meta, isLoading: metaLoading } = useQuery<MetaResponse>({
    queryKey: ["/api/workspace/permissions/meta"],
  });

  const {
    data: matrixData,
    isLoading: matrixLoading,
    isError,
    refetch,
  } = useQuery<MatrixResponse>({
    queryKey: ["/api/workspace/permissions"],
  });

  // ── WebSocket — live permission_update events ──────────────────────────
  useEffect(() => {
    const unsub = bus.subscribe("permission_update", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/permissions"] });
    });
    return unsub;
  }, [bus]);

  // ── Mutation — PATCH single toggle ─────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: ({
      role,
      featureKey,
      enabled,
    }: {
      role: string;
      featureKey: string;
      enabled: boolean;
    }) =>
      apiRequest("PATCH", "/api/workspace/permissions", {
        role,
        featureKey,
        enabled,
      }),
    onSuccess: (_data, variables) => {
      const key = `${variables.role}:${variables.featureKey}`;
      setPendingToggles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/permissions"] });
    },
    onError: (_err, variables) => {
      const key = `${variables.role}:${variables.featureKey}`;
      setPendingToggles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast({
        title: "Failed to update permission",
        description: "Please try again.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/permissions"] });
    },
  });

  // ── Mutation — DELETE (reset to default) ───────────────────────────────
  const resetMutation = useMutation({
    mutationFn: ({ role, featureKey }: { role: string; featureKey: string }) =>
      apiRequest("DELETE", "/api/workspace/permissions", { role, featureKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/permissions"] });
      toast({ title: "Permission reset to default" });
    },
    onError: () => {
      toast({
        title: "Failed to reset permission",
        variant: "destructive",
      });
    },
  });

  const handleToggle = useCallback(
    (role: string, featureKey: string, currentValue: boolean) => {
      const key = `${role}:${featureKey}`;
      const newValue = !currentValue;
      setPendingToggles((prev) => ({ ...prev, [key]: newValue }));
      toggleMutation.mutate({ role, featureKey, enabled: newValue });
    },
    [toggleMutation]
  );

  // ── Build lookup map ────────────────────────────────────────────────────
  const matrixMap = new Map<string, MatrixEntry>();
  if (matrixData?.matrix) {
    for (const entry of matrixData.matrix) {
      matrixMap.set(`${entry.role}:${entry.featureKey}`, entry);
    }
  }

  function getEffective(role: string, featureKey: string): { enabled: boolean; isOverride: boolean } {
    const key = `${role}:${featureKey}`;
    if (key in pendingToggles) {
      return { enabled: pendingToggles[key], isOverride: true };
    }
    const entry = matrixMap.get(key);
    return entry ?? { enabled: false, isOverride: false };
  }

  const isLoading = metaLoading || matrixLoading;

  if (isLoading) {
    return <PermissionMatrixSkeleton />;
  }

  if (isError || !meta) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load permission matrix.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const featuresByCategory: Record<string, FeatureDefinition[]> = {};
  for (const feature of meta.features) {
    if (!featuresByCategory[feature.category]) {
      featuresByCategory[feature.category] = [];
    }
    featuresByCategory[feature.category].push(feature);
  }

  const roles = meta.roles;

  return (
    <div
      className="flex flex-col gap-6 p-6 overflow-auto"
      data-testid="permission-matrix-page"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Permission Matrix</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Control which roles can access each feature in your workspace.
            Changes take effect immediately for all active sessions. Owners
            always have full access and cannot be restricted.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-refresh-matrix"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Enabled (default)
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
          Enabled (override)
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
          Disabled (default)
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-destructive" />
          Disabled (override)
        </div>
      </div>

      {/* ── Matrix by Category ──────────────────────────────────────────── */}
      {CATEGORY_ORDER.filter((cat) => featuresByCategory[cat]?.length > 0).map(
        (category) => (
          <Card key={category} data-testid={`card-category-${category}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {CATEGORY_LABELS[category] ?? category}
              </CardTitle>
              <CardDescription>
                {category === "page" && "Control which roles can navigate to each page."}
                {category === "action" && "Control which roles can perform specific operations."}
                {category === "report" && "Control which roles can access each report type."}
                {category === "data" && "Control granular data visibility per role."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground min-w-44">
                        Feature
                      </th>
                      {roles.map((role) => (
                        <th
                          key={role}
                          className="text-center py-2 px-2 font-medium text-muted-foreground min-w-24"
                          data-testid={`col-role-${role}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs leading-tight">
                              {ROLE_LABELS[role] ?? role}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {featuresByCategory[category].map((feature) => (
                      <tr
                        key={feature.key}
                        className="border-t border-border/50"
                        data-testid={`row-feature-${feature.key}`}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium leading-tight">
                              {feature.label}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-56">
                                {feature.description}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                        {roles.map((role) => {
                          const { enabled, isOverride } = getEffective(
                            role,
                            feature.key
                          );
                          const cellKey = `${role}:${feature.key}`;
                          const isPending = cellKey in pendingToggles;

                          return (
                            <td
                              key={role}
                              className="py-3 px-2 text-center"
                              data-testid={`cell-${role}-${feature.key}`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={() =>
                                    handleToggle(role, feature.key, enabled)
                                  }
                                  disabled={isPending || toggleMutation.isPending}
                                  data-testid={`toggle-${role}-${feature.key}`}
                                  aria-label={`${feature.label} for ${ROLE_LABELS[role] ?? role}`}
                                />
                                {isOverride && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1 py-0 leading-tight cursor-pointer"
                                    onClick={() =>
                                      resetMutation.mutate({
                                        role,
                                        featureKey: feature.key,
                                      })
                                    }
                                    data-testid={`badge-reset-${role}-${feature.key}`}
                                  >
                                    reset
                                  </Badge>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function PermissionMatrixSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-24 mb-1" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
