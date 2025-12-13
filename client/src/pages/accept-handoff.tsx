import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogIn,
  ArrowRight,
  PartyPopper,
  Shield,
} from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  targetUserEmail: string;
  targetUserName: string;
  expired: boolean;
}

export default function AcceptHandoff() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isCompleted, setIsCompleted] = useState(false);

  const { data: tokenData, isLoading: tokenLoading, error: tokenError } = useQuery<{
    valid: boolean;
    workspace?: WorkspaceInfo;
    error?: string;
  }>({
    queryKey: ["/api/accept-handoff", token],
    queryFn: async () => {
      const res = await fetch(`/api/accept-handoff/${token}`);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/accept-handoff/${token}/complete`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setIsCompleted(true);
        toast({
          title: "Welcome to Your Workspace!",
          description: `You are now the owner of ${data.workspaceName}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        setTimeout(() => setLocation("/dashboard"), 2000);
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to complete handoff", variant: "destructive" });
    },
  });

  const handleAccept = () => {
    if (!isAuthenticated) {
      const loginUrl = `/login?redirect=${encodeURIComponent(`/accept-handoff/${token}`)}`;
      setLocation(loginUrl);
      return;
    }
    completeMutation.mutate();
  };

  const handleLogin = () => {
    const loginUrl = `/login?redirect=${encodeURIComponent(`/accept-handoff/${token}`)}`;
    setLocation(loginUrl);
  };

  const handleRegister = () => {
    const registerUrl = `/register?redirect=${encodeURIComponent(`/accept-handoff/${token}`)}&email=${encodeURIComponent(tokenData?.workspace?.targetUserEmail || "")}`;
    setLocation(registerUrl);
  };

  if (tokenLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating your invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenData?.valid || tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="card-invalid-token">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid or Expired Link</CardTitle>
            <CardDescription>
              {tokenData?.error || "This workspace invitation link is no longer valid."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-6">
              If you believe this is an error, please contact support for assistance.
            </p>
            <Button variant="outline" onClick={() => setLocation("/support")} data-testid="button-contact-support">
              Contact Support
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="card-success">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <PartyPopper className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Welcome Aboard!</CardTitle>
            <CardDescription>
              You are now the owner of <strong>{tokenData.workspace?.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-6">
              Redirecting you to your dashboard...
            </p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const workspace = tokenData.workspace!;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <Card className="w-full max-w-lg" data-testid="card-accept-handoff">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Your Workspace is Ready!</CardTitle>
          <CardDescription className="text-base">
            Our support team has set up a workspace for you
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Workspace Name</span>
              <span className="font-medium">{workspace.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prepared For</span>
              <span className="font-medium">{workspace.targetUserName}</span>
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Secure Transfer</AlertTitle>
            <AlertDescription>
              By accepting this workspace, you will become its owner with full administrative access.
            </AlertDescription>
          </Alert>

          {isAuthenticated ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Signed in as <strong>{(user as any)?.email}</strong>
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={handleAccept}
                disabled={completeMutation.isPending}
                data-testid="button-accept-workspace"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                )}
                Accept Workspace
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Sign in or create an account to claim your workspace
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleLogin}
                  data-testid="button-login"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
                <Button
                  size="lg"
                  onClick={handleRegister}
                  data-testid="button-register"
                >
                  Create Account
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
