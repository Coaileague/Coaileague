/**
 * IdentityCard — always-visible widget showing org/user identifiers.
 * Every role sees the info relevant to them for support + Trinity/HelpAI context.
 * Used on OrgOwnerDashboard, WorkerDashboard, all role dashboards.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ShieldCheck, Building2, User, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";

interface IdentityCardProps {
  showPaySummary?: boolean;
  payAmount?: number | null;
  payPeriod?: string;
  payLabel?: string;
}

export function IdentityCard({ showPaySummary, payAmount, payPeriod, payLabel }: IdentityCardProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspaceAccess();
  const { toast } = useToast();

  const copy = (label: string, value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() =>
      toast({ title: `${label} copied`, description: value, duration: 2000 })
    );
  };

  const orgCode   = (workspace as Record<string, unknown>)?.orgCode as string | undefined;
  const licenseNo = (workspace as Record<string, unknown>)?.licenseNumber as string | undefined;
  const workspaceId = workspace?.id;
  const userId    = user?.id;
  const employeeId = (user as Record<string, unknown>)?.employeeId as string | undefined;

  const rows: { label: string; value: string | undefined; icon: React.ElementType; copyLabel: string }[] = [
    { label: "Org Code",       value: orgCode,      icon: Hash,        copyLabel: "Org code" },
    { label: "Company License",value: licenseNo,    icon: ShieldCheck, copyLabel: "License number" },
    { label: "Org / Tenant ID",value: workspaceId,  icon: Building2,   copyLabel: "Org ID" },
    { label: "Your User ID",   value: userId,       icon: User,        copyLabel: "User ID" },
    ...(employeeId ? [{ label: "Employee ID", value: employeeId, icon: User, copyLabel: "Employee ID" }] : []),
  ];

  return (
    <Card data-testid="identity-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Your Identifiers
          <Badge variant="outline" className="text-[10px] ml-auto">For support &amp; HelpAI</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {showPaySummary && payAmount != null && (
          <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{payLabel || "Estimated Pay"}</p>
            <p className="text-xl font-bold text-primary">
              ${payAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {payPeriod && <p className="text-[10px] text-muted-foreground mt-0.5">{payPeriod}</p>}
          </div>
        )}
        {rows.map(({ label, value, icon: Icon, copyLabel }) =>
          value ? (
            <div key={label} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-medium truncate max-w-[140px]">{value}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 shrink-0"
                  onClick={() => copy(copyLabel, value)}
                  aria-label={`Copy ${copyLabel}`}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : null
        )}
        <p className="text-[10px] text-muted-foreground pt-1">
          Share these when contacting support or chatting with HelpAI for faster assistance.
        </p>
      </CardContent>
    </Card>
  );
}
