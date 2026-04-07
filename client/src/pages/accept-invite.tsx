import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, CheckCircle, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface InviteDetails {
  code: string;
  workspaceName: string;
  workspaceId: string;
  role: string;
  roleName: string;
  inviterName: string | null;
  inviteeEmail: string | null;
  expiresAt: string;
  landingPage: string;
}

function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteExpired, setInviteExpired] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [roleName, setRoleName] = useState("");

  const code = new URLSearchParams(window.location.search).get("code") || "";

  useEffect(() => {
    if (!code) {
      setInviteError("No invite code found. Please use the full link from your invitation email.");
      setLoadingInvite(false);
      return;
    }

    const abortController = new AbortController();

    async function fetchInvite() {
      try {
        const isWorkspaceInvite = code.length < 20; // Workspace codes are usually short alphanumeric
        const endpoint = isWorkspaceInvite 
          ? `/api/onboarding/workspace-invite/${encodeURIComponent(code)}`
          : `/api/onboarding/invite/${encodeURIComponent(code)}`;

        const response = await fetch(endpoint, {
          signal: abortController.signal
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          if (response.status === 410 || data.expired) {
            setInviteExpired(true);
          }
          setInviteError(data.message || "Invalid or expired invite.");
        } else {
          setInvite(data);
          // Normalize data for both invite types
          if (data.workspaceName) setOrgName(data.workspaceName);
          if (data.roleName) setRoleName(data.roleName);
          if (data.email || data.inviteeEmail) setEmail(data.email || data.inviteeEmail);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        console.error('Invite loading failed:', e);
        setInviteError("Failed to load invite details. Please try again or contact support.");
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingInvite(false);
        }
      }
    }

    fetchInvite();
    return () => abortController.abort();
  }, [code]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (!firstName.trim() || !lastName.trim()) throw new Error("Please enter your full name.");
      
      const isWorkspaceInvite = code.length < 20;
      const endpoint = isWorkspaceInvite 
        ? "/api/onboarding/workspace-invite/register"
        : "/api/onboarding/application";

      const payload = isWorkspaceInvite 
        ? {
            code,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            password,
          }
        : {
            inviteToken: code,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
          };

      const res = await apiRequest("POST", endpoint, payload);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed.");
      return data;
    },
    onSuccess: (data) => {
      const isWorkspaceInvite = code.length < 20;
      if (isWorkspaceInvite) {
        setOrgName(data.workspaceName);
        setRoleName(data.roleName);
        setSuccess(true);
        setTimeout(() => {
          const params = new URLSearchParams({
            firstLogin: '1',
            org: data.workspaceName || '',
            role: data.roleName || '',
            name: data.firstName || '',
          });
          window.location.href = `${data.landingPage || '/leaders-hub'}?${params.toString()}`;
        }, 2200);
      } else {
        // Employee onboarding - redirect to wizard
        setLocation(`/employee-onboarding-wizard?token=${code}&applicationId=${data.id}&workspaceId=${data.workspaceId}`);
      }
    },
    onError: (err: Error) => {
      if (err.message.includes("already exists")) {
        toast({
          title: "Account already exists",
          description: "Please log in with your existing account and use the invite code there.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Registration failed", description: err.message, variant: "destructive" });
      }
    },
  });

  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#ffc83c]" />
          <p className="text-white/70 text-sm">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <Card className="w-full max-w-xs border-white/10 bg-white/5 text-white">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <AlertTriangle className="h-12 w-12 text-amber-400" />
            </div>
            <CardTitle className="text-white">
              {inviteExpired ? "Invitation Expired" : "Invalid Invitation"}
            </CardTitle>
            <CardDescription className="text-white/60">{inviteError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {inviteExpired && (
              <p className="text-sm text-white/60">
                Please ask the person who invited you to send a new invitation.
              </p>
            )}
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => setLocation("/login")}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <Card className="w-full max-w-xs border-white/10 bg-white/5 text-white text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-14 w-14 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-semibold text-white">Welcome aboard!</h2>
            <p className="text-white/70 text-sm">
              You've joined <strong>{orgName}</strong> as <strong>{roleName}</strong>.
              Taking you to your dashboard...
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-[#ffc83c] mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-[#ffc83c]/20 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-[#ffc83c]" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">CoAIleague</h1>
          <p className="text-white/50 text-sm">Workforce Intelligence Platform</p>
        </div>

        <Card className="border-white/10 bg-white/5">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-[#ffc83c]" />
              <CardTitle className="text-white text-lg">{invite?.workspaceName}</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-[#ffc83c]/20 text-[#ffc83c] border-[#ffc83c]/30 text-xs">
                {invite?.roleName}
              </Badge>
              {invite?.inviterName && (
                <span className="text-white/50 text-xs">Invited by {invite.inviterName}</span>
              )}
            </div>
            <CardDescription className="text-white/60 text-sm mt-2">
              You've been invited to join <strong className="text-white">{invite?.workspaceName}</strong> as a <strong className="text-white">{invite?.roleName}</strong>.
              Create your account below to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-white/70 text-xs">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-first-name"
                  aria-required="true"
                  aria-describedby="firstName-error"
                />
                {(registerMutation.isError && !firstName.trim()) && (
                  <p id="firstName-error" className="text-[10px] text-red-400 mt-1" role="alert">First name is required</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-white/70 text-xs">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-last-name"
                  aria-required="true"
                  aria-describedby="lastName-error"
                />
                {(registerMutation.isError && !lastName.trim()) && (
                  <p id="lastName-error" className="text-[10px] text-red-400 mt-1" role="alert">Last name is required</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/70 text-xs">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                readOnly={!!invite?.inviteeEmail}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 disabled:opacity-60"
                data-testid="input-email"
                aria-required="true"
                aria-describedby="email-error"
              />
              {invite?.inviteeEmail && (
                <p className="text-white/40 text-xs">Email address is set by the invitation.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/70 text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                data-testid="input-password"
                aria-required="true"
                aria-describedby="password-error"
              />
              {(registerMutation.isError && password.length < 8) && (
                <p id="password-error" className="text-[10px] text-red-400 mt-1" role="alert">Password must be at least 8 characters</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-white/70 text-xs">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                data-testid="input-confirm-password"
                onKeyDown={(e) => { if (e.key === "Enter") registerMutation.mutate(); }}
                aria-required="true"
                aria-describedby="confirmPassword-error"
              />
              {(registerMutation.isError && password !== confirmPassword) && (
                <p id="confirmPassword-error" className="text-[10px] text-red-400 mt-1" role="alert">Passwords do not match</p>
              )}
            </div>
            <Button
              className="w-full bg-[#ffc83c] text-[#0f172a] hover:bg-[#ffc83c]/90 font-semibold"
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending}
              data-testid="button-create-account"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Account & Join {invite?.workspaceName}
                </>
              )}
            </Button>
            <p className="text-center text-white/40 text-xs">
              Already have an account?{" "}
              <button
                className="text-[#ffc83c] underline"
                onClick={() => setLocation(`/login?next=/accept-invite?code=${code}`)}
                data-testid="link-existing-login"
              >
                Log in instead
              </button>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-white/30 text-xs">
          This invitation expires {invite ? new Date(invite.expiresAt).toLocaleDateString() : ""}.
          If it expires, ask your organization owner to send a new one.
        </p>
      </div>
    </div>
  );
}

export default AcceptInvitePage;
