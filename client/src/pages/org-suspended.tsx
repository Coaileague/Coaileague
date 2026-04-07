import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowRight, Mail, Phone, LogOut, CreditCard, ExternalLink, Clock, Shield, CheckCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function OrgSuspendedPage() {
  const { user, orgInactiveReason, orgInactiveName, isOwner, paymentRequired } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  const workspaceId = user?.currentWorkspaceId;

  const reasonLabel =
    orgInactiveReason === "cancelled"
      ? "cancelled"
      : orgInactiveReason === "no_workspace"
      ? "not configured"
      : "suspended";

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => { 
      queryClient.clear();
      window.location.replace("/login");
    },
    onError: () => { 
      window.location.replace("/login");
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-subscription-checkout", {
        workspaceId,
        tier: "enterprise",
        successUrl: `${window.location.origin}/org-management?payment=success`,
        cancelUrl: `${window.location.origin}/org-management`,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Could not open checkout", description: "Please contact support.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Payment error", description: "Failed to open checkout.", variant: "destructive" });
    },
  });

  const openBillingPortal = async () => {
    if (!workspaceId) return;
    setIsPortalLoading(true);
    try {
      const response = await apiRequest("POST", "/api/stripe/billing-portal", {
        workspaceId,
        returnUrl: `${window.location.origin}/org-management`,
      });
      const data = await response.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Billing portal unavailable", description: "Use the Subscribe button instead." });
      }
    } catch {
      toast({ title: "Billing portal unavailable", description: "Use the Subscribe button instead." });
    } finally {
      setIsPortalLoading(false);
    }
  };

  const planFeatures = [
    "Unlimited scheduling & shift management",
    "GPS time tracking & guard tours",
    "Native RMS (incidents, DARs, visitor logs)",
    "CAD dispatch console",
    "50-state compliance & auditor portal",
    "Trinity AI — 1,000 credits/month",
    "QuickBooks + payroll integrations",
    "Client portal & billing automation",
  ];

  if (isOwner || paymentRequired) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background p-4"
        data-testid="page-org-suspended-owner"
      >
        <div className="w-full max-w-xs space-y-4">
          <Card>
            <CardHeader className="text-center pb-3">
              <div className="flex justify-center mb-3">
                <div className="rounded-full bg-destructive/10 p-3">
                  <AlertCircle className="h-7 w-7 text-destructive" />
                </div>
              </div>
              <CardTitle>Subscription Required</CardTitle>
              <CardDescription>
                {orgInactiveName ? (
                  <><span className="font-medium">{orgInactiveName}</span> has been {reasonLabel}.</>
                ) : (
                  <>Your organization subscription has lapsed.</>
                )}{" "}
                Subscribe to restore full access for your team.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-semibold text-center">Enterprise Plan — $6,999/month</p>
                <div className="space-y-1.5 mt-2">
                  {planFeatures.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                data-testid="button-subscribe-stripe"
                className="w-full"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {checkoutMutation.isPending ? "Opening checkout…" : "Subscribe Now"}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  data-testid="button-billing-portal"
                  onClick={openBillingPortal}
                  disabled={isPortalLoading}
                >
                  {isPortalLoading ? "Loading…" : "Manage Billing"}
                </Button>
                <Button
                  variant="outline"
                  data-testid="button-go-settings"
                  onClick={() => setLocation("/org-management")}
                >
                  Org Settings
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  data-testid="button-contact-support"
                  onClick={() => setLocation("/support")}
                >
                  Contact Support
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 text-muted-foreground"
                  data-testid="button-logout-owner"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  {logoutMutation.isPending ? "Signing out…" : "Sign Out"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <p className="text-center text-xs text-muted-foreground">
            Secured by Stripe · CoAIleague never stores card data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      data-testid="page-org-suspended-employee"
    >
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="rounded-full bg-muted p-3">
              <Shield className="h-7 w-7 text-muted-foreground" />
            </div>
          </div>
          <CardTitle>Organization Temporarily Unavailable</CardTitle>
          <CardDescription>
            {user?.firstName ? `Hi ${user.firstName}, ` : ""}
            {orgInactiveName ? (
              <><span className="font-medium">{orgInactiveName}</span> is currently unavailable.</>
            ) : (
              <>Your organization is currently unavailable.</>
            )}{" "}
            Your manager needs to update the subscription to restore access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full"
            data-testid="button-try-again"
            onClick={() => window.location.reload()}
          >
            <Clock className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <div className="text-center text-sm text-muted-foreground space-y-1.5 py-1">
            <p className="flex items-center justify-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              Contact your manager or supervisor for assistance.
            </p>
            <p className="flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              Or call your organization's main contact number.
            </p>
          </div>
          <Separator />
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            data-testid="button-logout-employee"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {logoutMutation.isPending ? "Signing out…" : "Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
