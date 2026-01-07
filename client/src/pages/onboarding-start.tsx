import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { CoAIleagueLogo } from "@/components/coaileague-logo";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, Users, ArrowRight, Loader2, Shield, CreditCard, Clock } from "lucide-react";

export default function OnboardingStart() {
  const [mode, setMode] = useState<"choice" | "join">("choice");
  const [inviteCode, setInviteCode] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const acceptInviteMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/invites/accept", { inviteCode: code });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Welcome aboard!",
        description: `You've successfully joined ${data.workspaceName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid Invitation",
        description: error.message || "This invitation code is invalid or has expired",
        variant: "destructive",
      });
    },
  });

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter your invitation code",
        variant: "destructive",
      });
      return;
    }
    acceptInviteMutation.mutate(inviteCode.trim().toUpperCase());
  };

  if (mode === "join") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CoAIleagueLogo width={180} height={45} showTagline={false} />
            </div>
            <CardTitle className="flex items-center justify-center gap-2">
              <Users className="h-5 w-5 text-cyan-400" />
              Join Your Team
            </CardTitle>
            <CardDescription>
              Enter the invitation code provided by your employer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinSubmit} className="space-y-6">
              <div>
                <Label htmlFor="inviteCode">Invitation Code</Label>
                <Input
                  id="inviteCode"
                  data-testid="input-invite-code"
                  placeholder="ABCD1234"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="text-center text-2xl tracking-widest font-mono uppercase"
                  maxLength={8}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Your employer should have provided this 8-character code
                </p>
              </div>

              <Button
                type="submit"
                data-testid="button-accept-invite"
                className="w-full"
                disabled={acceptInviteMutation.isPending || inviteCode.length < 6}
              >
                {acceptInviteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    Join Organization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                data-testid="button-back-to-choice"
                className="w-full"
                onClick={() => setMode("choice")}
              >
                Back
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <CoAIleagueLogo width={220} height={55} showTagline={true} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to CoAIleague
          </h1>
          <p className="text-slate-400 text-lg">
            How would you like to get started?
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card 
            className="cursor-pointer transition-all duration-200 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10"
            onClick={() => setLocation("/create-org")}
            data-testid="card-create-organization"
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-500 text-white">
                  <Building2 className="h-6 w-6" />
                </div>
                <CardTitle>Create an Organization</CardTitle>
              </div>
              <CardDescription className="text-base">
                Start a new business account for your company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CreditCard className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Billing Owner</p>
                    <p className="text-sm text-muted-foreground">
                      You'll manage the subscription and payments
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Invite Employees</p>
                    <p className="text-sm text-muted-foreground">
                      Add team members and assign their roles
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Full Control</p>
                    <p className="text-sm text-muted-foreground">
                      Configure schedules, compliance, and workflows
                    </p>
                  </div>
                </div>
              </div>
              <Button className="w-full mt-4" data-testid="button-create-org">
                Create Organization
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer transition-all duration-200 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10"
            onClick={() => setMode("join")}
            data-testid="card-join-organization"
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 text-white">
                  <Users className="h-6 w-6" />
                </div>
                <CardTitle>Join an Organization</CardTitle>
              </div>
              <CardDescription className="text-base">
                Use an invitation code from your employer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Clock In/Out</p>
                    <p className="text-sm text-muted-foreground">
                      Track your work hours and shifts
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Report Incidents</p>
                    <p className="text-sm text-muted-foreground">
                      Submit reports and documentation
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">No Payment Required</p>
                    <p className="text-sm text-muted-foreground">
                      Your employer handles all billing
                    </p>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4" data-testid="button-join-org">
                Enter Invite Code
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-slate-500 text-sm mt-8">
          Need help? Contact your HR administrator or{" "}
          <a href="/support" className="text-cyan-400 hover:underline">
            reach out to support
          </a>
        </p>
      </div>
    </div>
  );
}
