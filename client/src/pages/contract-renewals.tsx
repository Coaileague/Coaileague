import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, formatCurrency, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleStatGrid, ModuleSkeletonList,
  ModuleEmptyState, ModuleSectionHeading,
} from "@/components/modules/ModulePageShell";
import { FileText, Clock, CheckCircle2, DollarSign, AlertTriangle, RefreshCw } from "lucide-react";

interface ContractRenewal {
  id: string;
  client_name: string;
  title: string;
  status: string;
  annual_value?: number | string;
  term_end_date?: string;
  renewal_status: string;
  days_until_expiry?: number;
  renewal_proposed_at?: string;
}

interface RenewalDashboard {
  expiringSoon: ContractRenewal[];
  pendingProposal: ContractRenewal[];
  upcomingRenewals: ContractRenewal[];
  summary: {
    total: number;
    expiringSoon: number;
    proposalSent: number;
    renewedThisYear: number;
    atRiskAnnualValue: number;
  };
}

const RENEWAL_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: BADGE_COLORS.slate },
  proposed:    { label: "Proposal Sent", color: BADGE_COLORS.blue },
  negotiating: { label: "Negotiating",   color: BADGE_COLORS.amber },
  renewed:     { label: "Renewed",       color: BADGE_COLORS.green },
  lost:        { label: "Lost",          color: BADGE_COLORS.red },
};

function getDaysUntilBadge(c: ContractRenewal) {
  const days = c.days_until_expiry;
  if (days === undefined || days === null) return null;
  if (days < 0)  return <Badge className={BADGE_COLORS.red}>Expired {Math.abs(days)}d ago</Badge>;
  if (days <= 30) return <Badge className={BADGE_COLORS.red}>{days}d left</Badge>;
  if (days <= 60) return <Badge className={BADGE_COLORS.amber}>{days}d left</Badge>;
  if (days <= 90) return <Badge className={BADGE_COLORS.yellow}>{days}d left</Badge>;
  return <Badge variant="outline">{days}d left</Badge>;
}

function ContractRow({ c, onStatusChange }: { c: ContractRenewal; onStatusChange: (id: string, status: string) => void }) {
  const cfg = RENEWAL_STATUS_CONFIG[c.renewal_status] || RENEWAL_STATUS_CONFIG.not_started;
  return (
    <Card data-testid={`card-renewal-${c.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground" data-testid={`text-client-${c.id}`}>{c.client_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {c.title} · Expires {formatDate(c.term_end_date)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {getDaysUntilBadge(c)}
            <Badge className={cfg.color}>{cfg.label}</Badge>
            <p className="text-sm font-medium text-muted-foreground">{formatCurrency(c.annual_value)}/yr</p>
            <Select
              value={c.renewal_status}
              onValueChange={(v) => onStatusChange(c.id, v)}
            >
              <SelectTrigger className="w-36 h-8 text-xs" data-testid={`select-renewal-status-${c.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RENEWAL_STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContractRenewalsPage() {
  const { toast } = useAppToast();

  const { data: dashboard, isLoading } = useQuery<RenewalDashboard>({
    queryKey: ["/api/contract-renewals/dashboard"],
  });
  const { data: allContracts = [], isLoading: loadingAll } = useQuery<ContractRenewal[]>({
    queryKey: ["/api/contract-renewals/contracts"],
  });

  const sweepMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/contract-renewals/sweep", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-renewals"] });
      toast({ title: "Renewal sweep complete", description: `${data?.tasksCreated || 0} renewal tasks created.` });
    },
    onError: (err: any) => toast({ title: "Sweep failed", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, renewal_status }: { id: string; renewal_status: string }) =>
      apiRequest("PATCH", `/api/contract-renewals/contracts/${id}`, { renewal_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-renewals"] });
      toast({ title: "Renewal status updated" });
    },
  });

  const summary = dashboard?.summary;
  const expiringSoon = dashboard?.expiringSoon || [];

  return (
    <ModulePageShell
      title="Contract Renewal Tracking"
      description="Monitor contract expirations and renewal pipeline"
      action={
        <Button onClick={() => sweepMutation.mutate()} disabled={sweepMutation.isPending} data-testid="button-renewal-sweep" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${sweepMutation.isPending ? "animate-spin" : ""}`} />
          {sweepMutation.isPending ? "Running..." : "Run Renewal Sweep"}
        </Button>
      }
    >
      <ModuleStatGrid stats={[
        { label: "Total Active",    value: summary?.total ?? 0,              icon: FileText,     color: "text-foreground" },
        { label: "Expiring 90d",    value: summary?.expiringSoon ?? 0,       icon: Clock,        color: "text-amber-500" },
        { label: "Proposals Sent",  value: summary?.proposalSent ?? 0,       icon: CheckCircle2, color: "text-blue-500" },
        { label: "At-Risk Value",   value: formatCurrency(summary?.atRiskAnnualValue), icon: DollarSign, color: "text-red-500" },
      ]} />

      {expiringSoon.length > 0 && (
        <div className="mb-6">
          <ModuleSectionHeading icon={AlertTriangle} iconColor="text-amber-500">
            Expiring Soon
          </ModuleSectionHeading>
          <div className="space-y-2">
            {expiringSoon.map((c) => (
              <ContractRow key={c.id} c={c} onStatusChange={(id, status) => updateStatusMutation.mutate({ id, renewal_status: status })} />
            ))}
          </div>
        </div>
      )}

      <div>
        <ModuleSectionHeading>All Contracts</ModuleSectionHeading>
        {loadingAll ? (
          <ModuleSkeletonList count={3} height="h-16" />
        ) : allContracts.length === 0 ? (
          <ModuleEmptyState
            icon={FileText}
            title="No contracts found"
            subtitle="Run the renewal sweep to import data."
          />
        ) : (
          <div className="space-y-2">
            {allContracts.map((c) => (
              <Card key={c.id} data-testid={`card-contract-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{c.client_name}</p>
                      <p className="text-xs text-muted-foreground">{c.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {getDaysUntilBadge(c)}
                      <Badge className={(RENEWAL_STATUS_CONFIG[c.renewal_status] || RENEWAL_STATUS_CONFIG.not_started).color}>
                        {(RENEWAL_STATUS_CONFIG[c.renewal_status] || RENEWAL_STATUS_CONFIG.not_started).label}
                      </Badge>
                      <p className="text-sm font-medium text-muted-foreground">{formatCurrency(c.annual_value)}/yr</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePageShell>
  );
}
