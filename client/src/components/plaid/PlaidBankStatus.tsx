import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlaidLinkButton, PlaidRelinkButton } from "./PlaidLinkButton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Landmark, CheckCircle, XCircle, Building, Loader2, Trash2 } from "lucide-react";

interface PlaidStatus {
  configured: boolean;
  environment: string;
  orgBankConnected: boolean;
  orgBankLast4: string | null;
  orgBankName: string | null;
}

interface EmployeeBankStatus {
  connected: boolean;
  accounts: Array<{
    id: string;
    bankName: string;
    accountType: string;
    accountNumberLast4: string;
    plaidConnected: boolean;
    isPrimary: boolean;
    isVerified: boolean;
  }>;
}

export function OrgPlaidBankCard() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<PlaidStatus>({
    queryKey: ["/api/plaid/status"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/plaid/org-bank", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/status"] });
      toast({ title: "Bank account disconnected" });
    },
    onError: (err: any) => {
      toast({
        title: "Disconnect failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading bank status...</span>
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="w-4 h-4" />
            Payroll Funding Account
          </CardTitle>
          <CardDescription>
            Plaid is not configured on this server. Add PLAID_CLIENT_ID and PLAID_SECRET to enable ACH payroll.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building className="w-4 h-4" />
              Payroll Funding Account
            </CardTitle>
            <CardDescription>
              Company bank account used to fund employee ACH payroll transfers.
            </CardDescription>
          </div>
          <Badge variant={status.environment === "production" ? "default" : "secondary"} data-testid="badge-plaid-env">
            {status.environment}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {status.orgBankConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium" data-testid="text-org-bank-name">
                  {status.orgBankName || "Connected Bank"}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-org-bank-mask">
                  Account ending in {status.orgBankLast4}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PlaidRelinkButton mode="org" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-org-bank"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No bank account connected</p>
            </div>
            <PlaidLinkButton mode="org" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeePlaidBankCard({ employeeId }: { employeeId: string }) {
  const { data: status, isLoading } = useQuery<EmployeeBankStatus>({
    queryKey: ["/api/plaid/employee", employeeId, "bank-status"],
    queryFn: async () => {
      const res = await fetch(`/api/plaid/employee/${employeeId}/bank-status`, { credentials: "include" });
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Checking bank status...</span>
      </div>
    );
  }

  const primaryAccount = status?.accounts?.find((a) => a.isPrimary);

  if (primaryAccount?.plaidConnected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <div>
            <p className="text-sm font-medium" data-testid={`text-emp-bank-name-${employeeId}`}>
              {primaryAccount.bankName}
            </p>
            <p className="text-xs text-muted-foreground">
              {primaryAccount.accountType} ···{primaryAccount.accountNumberLast4}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Verified
          </Badge>
        </div>
        <PlaidRelinkButton mode="employee" employeeId={employeeId} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <XCircle className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No direct deposit account linked</p>
      </div>
      <PlaidLinkButton
        mode="employee"
        employeeId={employeeId}
        size="sm"
        data-testid={`button-link-employee-bank-${employeeId}`}
      />
    </div>
  );
}
