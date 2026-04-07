import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface LoginResponse {
  success: boolean;
  token: string;
  auditor: {
    id: string;
    name: string;
    email: string;
    agencyName: string;
    stateCode: string;
  };
}

export default function AuditorLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enforcement/auditor/login", { email, password });
      return res.json() as Promise<LoginResponse>;
    },
    onSuccess: (data) => {
      if (data.success && data.token) {
        document.cookie = `auditor_token=${data.token}; path=/; SameSite=Strict; Secure`;
        localStorage.setItem("auditor_profile", JSON.stringify(data.auditor));
        navigate("/auditor/portal");
      } else {
        setError("Login failed. Please check your credentials.");
      }
    },
    onError: async (err: any) => {
      try {
        const body = await err.response?.json?.();
        setError(body?.error ?? "Login failed. Please try again.");
      } catch {
        setError("Login failed. Please try again.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Regulatory Auditor Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              CoAIleague — Workforce Compliance Infrastructure
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="gap-1 pb-4">
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>
              For authorized state agency personnel only. Your credentials were issued by
              CoAIleague platform administration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Agency Email</Label>
                <Input
                  id="email"
                  data-testid="input-auditor-email"
                  type="email"
                  placeholder="auditor@state.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    data-testid="input-auditor-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending || !email || !password}
                data-testid="button-auditor-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In to Auditor Portal"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Access problems? Contact{" "}
          <a href="mailto:compliance@coaileague.com" className="underline underline-offset-4">
            compliance@coaileague.com
          </a>
        </p>
      </div>
    </div>
  );
}
