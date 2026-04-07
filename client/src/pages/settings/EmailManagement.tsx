import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Users, Building2, BarChart3, CircleDollarSign, AlertTriangle, CheckCircle } from "lucide-react";

interface EmailAddress {
  id: string;
  address: string;
  local_part: string;
  display_name: string;
  address_type: string;
  is_active: boolean;
  billing_seat_id: string | null;
  fair_use_monthly_limit: number;
  emails_sent_this_period: number;
  emails_received_this_period: number;
  user_email?: string;
  first_name?: string;
  last_name?: string;
  client_name?: string;
}

interface ManagementData {
  addresses: EmailAddress[];
  summary: {
    totalAddresses: number;
    activeSeats: number;
    monthlyCostCents: number;
    perSeatMonthlyCents: number;
    fairUseEmailsPerSeat: number;
  };
}

export default function EmailManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activating, setActivating] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ManagementData>({
    queryKey: ["/api/email/management"],
  });

  const { data: stats } = useQuery<{
    billedSeats: number;
    monthlyCostCents: number;
    emailsSent: number;
    emailsReceived: number;
    approachingLimit: number;
  }>({
    queryKey: ["/api/email/management/stats"],
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/email/addresses/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: "Email seat activated", description: "$3/month billing starts now." });
      setActivating(null);
    },
    onError: () => {
      toast({ title: "Failed to activate", variant: "destructive" });
      setActivating(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/email/addresses/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: "Email seat deactivated" });
      setActivating(null);
    },
    onError: () => {
      toast({ title: "Failed to deactivate", variant: "destructive" });
      setActivating(null);
    },
  });

  const activateAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/activate-all"),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: `Activated ${res.activated} email seats` });
    },
  });

  const handleToggle = (addr: EmailAddress, checked: boolean) => {
    setActivating(addr.id);
    if (checked) {
      activateMutation.mutate(addr.id);
    } else {
      deactivateMutation.mutate(addr.id);
    }
  };

  const systemAddresses = data?.addresses.filter(a => a.address_type === 'workspace_system') ?? [];
  const userAddresses   = data?.addresses.filter(a => a.address_type === 'user_personal') ?? [];
  const clientAddresses = data?.addresses.filter(a => a.address_type === 'user_client') ?? [];

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const usageColor = (sent: number, limit: number) => {
    const pct = sent / limit;
    if (pct >= 1) return "text-destructive";
    if (pct >= 0.8) return "text-yellow-500 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-email-management-title">Email Management</h1>
        <p className="text-muted-foreground mt-1">
          Managed business email at {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/seat/month.
          50% cheaper than Google Workspace — includes Trinity AI inbox assistant.
        </p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CircleDollarSign className="w-4 h-4" />
              Monthly cost
            </div>
            <div className="text-2xl font-semibold" data-testid="text-monthly-cost">
              {formatCents(stats?.monthlyCostCents ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">{stats?.billedSeats ?? 0} active seats</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Mail className="w-4 h-4" />
              Emails sent
            </div>
            <div className="text-2xl font-semibold" data-testid="text-emails-sent">{stats?.emailsSent ?? 0}</div>
            <div className="text-xs text-muted-foreground">this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Mail className="w-4 h-4" />
              Emails received
            </div>
            <div className="text-2xl font-semibold" data-testid="text-emails-received">{stats?.emailsReceived ?? 0}</div>
            <div className="text-xs text-muted-foreground">this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              Near limit
            </div>
            <div className="text-2xl font-semibold" data-testid="text-near-limit">{stats?.approachingLimit ?? 0}</div>
            <div className="text-xs text-muted-foreground">addresses ≥80% used</div>
          </CardContent>
        </Card>
      </div>

      {/* System Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              System Addresses
            </CardTitle>
            <CardDescription>Always active — auto-handled by Trinity. No cost.</CardDescription>
          </div>
          <Badge variant="secondary">{systemAddresses.length} addresses</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {systemAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-system-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">{addr.display_name} — Auto-handled by Trinity</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${usageColor(addr.emails_received_this_period, addr.fair_use_monthly_limit)}`}>
                    {addr.emails_received_this_period}/{addr.fair_use_monthly_limit} received
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Always on
                  </Badge>
                </div>
              </div>
            ))}
            {systemAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">No system addresses provisioned yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Officer Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Officer Email Addresses
            </CardTitle>
            <CardDescription>
              {userAddresses.filter(a => a.is_active).length} active ×{" "}
              {formatCents(data?.summary.perSeatMonthlyCents ?? 300)} ={" "}
              {formatCents((userAddresses.filter(a => a.is_active).length) * (data?.summary.perSeatMonthlyCents ?? 300))}/month
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="button-activate-all-officers"
            onClick={() => activateAllMutation.mutate()}
            disabled={activateAllMutation.isPending}
          >
            Activate All
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {userAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-officer-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">
                    {addr.first_name} {addr.last_name}
                    {addr.user_email && ` · ${addr.user_email}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {addr.is_active && (
                    <span className={`text-xs ${usageColor(addr.emails_sent_this_period, addr.fair_use_monthly_limit)}`}>
                      {addr.emails_sent_this_period}/{addr.fair_use_monthly_limit}
                    </span>
                  )}
                  {addr.is_active && (
                    <span className="text-xs text-muted-foreground">
                      {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/mo
                    </span>
                  )}
                  <Badge variant={addr.is_active ? "default" : "outline"} className="text-xs">
                    {addr.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    data-testid={`switch-officer-email-${addr.id}`}
                    checked={addr.is_active}
                    disabled={activating === addr.id}
                    onCheckedChange={(checked) => handleToggle(addr, checked)}
                  />
                </div>
              </div>
            ))}
            {userAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No officer addresses yet. Add officers to reserve their @coaileague.com address.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Client Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Client Email Addresses
            </CardTitle>
            <CardDescription>
              {clientAddresses.filter(a => a.is_active).length} active ×{" "}
              {formatCents(data?.summary.perSeatMonthlyCents ?? 300)} ={" "}
              {formatCents((clientAddresses.filter(a => a.is_active).length) * (data?.summary.perSeatMonthlyCents ?? 300))}/month
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {clientAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-client-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">{addr.client_name || "Client"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {addr.is_active && (
                    <span className="text-xs text-muted-foreground">
                      {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/mo
                    </span>
                  )}
                  <Badge variant={addr.is_active ? "default" : "outline"} className="text-xs">
                    {addr.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    data-testid={`switch-client-email-${addr.id}`}
                    checked={addr.is_active}
                    disabled={activating === addr.id}
                    onCheckedChange={(checked) => handleToggle(addr, checked)}
                  />
                </div>
              </div>
            ))}
            {clientAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No client addresses yet. Add clients to reserve their dedicated email address.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage and Billing Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Usage and Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Active seats</span>
            <span className="font-medium" data-testid="text-active-seats">{stats?.billedSeats ?? 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Per seat</span>
            <span className="font-medium">{formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/month</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-medium">
            <span>Monthly email cost</span>
            <span data-testid="text-total-monthly-cost">{formatCents(stats?.monthlyCostCents ?? 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fair use included</span>
            <span>{data?.summary.fairUseEmailsPerSeat ?? 500} emails/seat/month</span>
          </div>
          {(stats?.approachingLimit ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md">
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                {stats?.approachingLimit} address(es) are approaching their monthly email limit.
                Overage is billed at $0.001/email.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
