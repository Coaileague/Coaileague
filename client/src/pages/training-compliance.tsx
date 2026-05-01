import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleStatGrid, ModuleSkeletonList,
  ModuleEmptyState, ModuleToolbar,
} from "@/components/modules/ModulePageShell";
import {
  GraduationCap, RefreshCw, Shield, User, ChevronDown, ChevronRight, BookOpen,
} from "lucide-react";

interface TrainingRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  requirement_id: string;
  training_name: string;
  completion_date?: string;
  expiration_date?: string;
  status: "current" | "expiring_soon" | "expired" | "missing";
  verified: boolean;
  provider_name?: string;
  certificate_number?: string;
}

interface ComplianceSummary {
  employee_id: string;
  employee_name: string;
  position?: string;
  current_count: number;
  expiring_soon_count: number;
  expired_count: number;
  missing_count: number;
  overall_status: "compliant" | "expiring_soon" | "non_compliant";
  records: TrainingRecord[];
}

interface TrainingRequirement {
  id: string;
  requirement_name: string;
  requirement_type: string;
  frequency: string;
  consequence_of_expiry: string;
  state_required: boolean;
  active: boolean;
}

const RECORD_STATUS: Record<string, { label: string; color: string }> = {
  current:      { label: "Current",      color: BADGE_COLORS.green },
  expiring_soon:{ label: "Expiring Soon",color: BADGE_COLORS.amber },
  expired:      { label: "Expired",      color: BADGE_COLORS.red },
  missing:      { label: "Missing",      color: BADGE_COLORS.slate },
};

const OVERALL_STATUS: Record<string, { label: string; color: string }> = {
  compliant:    { label: "Compliant",    color: BADGE_COLORS.green },
  expiring_soon:{ label: "Expiring Soon",color: BADGE_COLORS.amber },
  non_compliant:{ label: "Non-Compliant",color: BADGE_COLORS.red },
};

export default function TrainingCompliancePage() {
  const { toast } = useAppToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: compliance = [], isLoading } = useQuery<ComplianceSummary[]>({
    queryKey: ["/api/training-compliance/compliance-matrix"],
  });
  const { data: requirements = [] } = useQuery<TrainingRequirement[]>({
    queryKey: ["/api/training-compliance/requirements"],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/training-compliance/refresh-statuses", {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-compliance"] });
      toast({ title: "Statuses refreshed", description: `${data?.updated || 0} records updated.` });
    },
    onError: (err) => toast({ title: "Refresh failed", description: err.message, variant: "destructive" }),
  });

  const filtered = statusFilter === "all"
    ? compliance
    : compliance.filter((e) => e.overall_status === statusFilter);

  const stats = {
    compliant:    compliance.filter((e) => e.overall_status === "compliant").length,
    expiring:     compliance.filter((e) => e.overall_status === "expiring_soon").length,
    nonCompliant: compliance.filter((e) => e.overall_status === "non_compliant").length,
    totalExpired: compliance.reduce((s, e) => s + e.expired_count, 0),
  };

  return (
    <ModulePageShell
      title="Training & Certification Compliance"
      description="Track officer training records and Texas licensing requirements"
      action={
        <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} data-testid="button-refresh-compliance" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          {refreshMutation.isPending ? "Refreshing..." : "Refresh Statuses"}
        </Button>
      }
    >
      <ModuleStatGrid stats={[
        { label: "Compliant",     value: stats.compliant,    color: "text-green-500" },
        { label: "Expiring Soon", value: stats.expiring,     color: "text-amber-500" },
        { label: "Non-Compliant", value: stats.nonCompliant, color: "text-red-500" },
        { label: "Total Expired", value: stats.totalExpired, color: "text-red-500" },
      ]} />

      <Tabs defaultValue="officers">
        <TabsList className="mb-4">
          <TabsTrigger value="officers" data-testid="tab-officers">Officers</TabsTrigger>
          <TabsTrigger value="requirements" data-testid="tab-requirements">Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="officers">
          <ModuleToolbar>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44" data-testid="select-compliance-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Officers</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                <SelectItem value="non_compliant">Non-Compliant</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {filtered.length} officer{filtered.length !== 1 ? "s" : ""}
            </p>
          </ModuleToolbar>

          {isLoading ? (
            <ModuleSkeletonList count={4} height="h-16" />
          ) : filtered.length === 0 ? (
            <ModuleEmptyState icon={GraduationCap} title="No training records found" />
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const cfg = OVERALL_STATUS[e.overall_status] || OVERALL_STATUS.non_compliant;
                const isExpanded = expanded === e.employee_id;
                return (
                  <Card key={e.employee_id} data-testid={`card-officer-${e.employee_id}`}>
                    <CardContent className="p-4">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : e.employee_id)}
                        data-testid={`button-expand-${e.employee_id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground" data-testid={`text-officer-name-${e.employee_id}`}>
                              {e.employee_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {e.position || "Officer"} · {e.current_count} current, {e.expiring_soon_count} expiring, {e.expired_count} expired
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cfg.color} data-testid={`badge-compliance-${e.employee_id}`}>{cfg.label}</Badge>
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                      </div>

                      {isExpanded && e.records && (
                        <div className="mt-4 space-y-2 border-t pt-4">
                          {e.records.map((r) => {
                            const rCfg = RECORD_STATUS[r.status] || RECORD_STATUS.missing;
                            return (
                              <div key={r.id} className="flex items-center justify-between flex-wrap gap-2 py-2" data-testid={`row-training-${r.id}`}>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{r.training_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Expires: {formatDate(r.expiration_date)}{r.provider_name ? ` · ${r.provider_name}` : ""}
                                  </p>
                                </div>
                                <Badge className={rCfg.color}>{rCfg.label}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requirements">
          {requirements.length === 0 ? (
            <ModuleEmptyState icon={BookOpen} title="No requirements configured" />
          ) : (
            <div className="space-y-2">
              {requirements.map((r) => (
                <Card key={r.id} data-testid={`card-requirement-${r.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground" data-testid={`text-req-name-${r.id}`}>{r.requirement_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.frequency} · {r.consequence_of_expiry}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.state_required && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="w-3 h-3 mr-1" />TX Required
                          </Badge>
                        )}
                        <Badge className={r.active ? BADGE_COLORS.green : BADGE_COLORS.slate}>
                          {r.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModulePageShell>
  );
}
