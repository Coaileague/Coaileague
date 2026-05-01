import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Building2, CheckCircle, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface InviteDetails {
  token: string;
  email: string;
  companyName: string;
  workspaceId: string;
}

export default function ClientPortalSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") || "";
  const workspaceParam = new URLSearchParams(window.location.search).get("workspace") || "";

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteExpired, setInviteExpired] = useState(false);
  const [inviteUsed, setInviteUsed] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError("No invite token found. Please use the full link from your invitation email.");
      setLoadingInvite(false);
      return;
    }

    const controller = new AbortController();

    async function fetchInvite() {
      try {
        const url = workspaceParam
          ? `/api/clients/portal/setup/${encodeURIComponent(token)}?workspace=${encodeURIComponent(workspaceParam)}`
          : `/api/clients/portal/setup/${encodeURIComponent(token)}`;

        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 410) {
            setInviteExpired(true);
            setInviteError("This invitation has expired. Please contact your security provider for a new invite.");
          } else if (res.status === 409) {
            setInviteUsed(true);
            setInviteError("This invitation has already been used. Please log in or contact your security provider.");
          } else {
            setInviteError(data.message || "Invalid or expired invitation.");
          }
        } else {
          setInvite(data);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setInviteError("Failed to load invitation. Please try again or contact support.");
      } finally {
        if (!controller.signal.aborted) setLoadingInvite(false);
      }
    }

    fetchInvite();
    return () => controller.abort();
  }, [token, workspaceParam]);

  const setupMutation = useMutation({
    mutationFn: async () => {
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      if (!firstName.trim() || !lastName.trim()) throw new Error("Please enter your full name.");

      await apiRequest("POST", `/api/clients/portal/setup/${encodeURIComponent(token)}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        workspaceId: invite?.workspaceId,
      });
    },
    onSuccess: () => {
      setSuccess(true);
      toast({
        title: "Account created!",
        description: "Your portal account is ready. Redirecting to your portal...",
      });
      setTimeout(() => setLocation("/client/portal"), 2000);
    },
    onError: (e) => {
      toast({
        title: "Setup failed",
        description: e.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-slate-300">Loading your invitation…</p>
        </div>
      </div>
    );
  }

  // ─── Error States ────────────────────────────────────────────────────────────

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {inviteExpired ? (
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-2" />
            ) : (
              <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto mb-2" />
            )}
            <CardTitle>
              {inviteExpired ? "Invitation Expired" : inviteUsed ? "Already Activated" : "Invalid Invitation"}
            </CardTitle>
            <CardDescription>{inviteError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            {inviteUsed && (
              <Button className="w-full" onClick={() => setLocation("/login")}>
                Go to Login
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Success State ───────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Account Created!</CardTitle>
            <CardDescription>Redirecting you to your portal…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ─── Setup Form ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Set Up Your Client Portal</CardTitle>
          {invite && (
            <CardDescription>
              <span className="flex items-center justify-center gap-1.5 mt-1">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{invite.companyName}</span>
              </span>
              <span className="block text-sm text-muted-foreground mt-1">{invite.email}</span>
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-first-name">First Name</Label>
              <Input
                id="cp-first-name"
                data-testid="input-cp-first-name"
                placeholder="Jane"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-last-name">Last Name</Label>
              <Input
                id="cp-last-name"
                data-testid="input-cp-last-name"
                placeholder="Smith"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-email">Email (pre-filled from invite)</Label>
            <Input
              id="cp-email"
              value={invite?.email || ""}
              disabled
              className="bg-muted"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-password">Password</Label>
            <Input
              id="cp-password"
              data-testid="input-cp-password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm-password">Confirm Password</Label>
            <Input
              id="cp-confirm-password"
              data-testid="input-cp-confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <Button
            className="w-full mt-2"
            data-testid="button-cp-create-account"
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending || !firstName || !lastName || !password || !confirmPassword}
          >
            {setupMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating account…</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-2" />Create Account &amp; Access Portal</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground pt-1">
            Already have an account?{" "}
            <button
              type="button"
              className="underline hover:text-foreground transition-colors"
              onClick={() => setLocation("/login")}
            >
              Sign in
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
