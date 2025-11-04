import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { Loader2, LogIn, Mail, Lock, Github } from "lucide-react";
import { SiGoogle, SiFacebook } from "react-icons/si";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      toast({
        title: "Welcome back!",
        description: "Successfully logged in",
      });

      // GATEKEEPER: Role-based routing - Root admins go to command center, users to dashboard
      // Check if user has platform role (root, sysop, auditor)
      const platformRole = data.user?.platformRole;
      
      if (platformRole === 'root' || platformRole === 'sysop') {
        // Root/System administrators → Root Admin Portal (Unified Command Center)
        setLocation("/root-admin-portal");
      } else if (platformRole === 'auditor') {
        // Auditors → Auditor Portal
        setLocation("/auditor-portal");
      } else {
        // Regular users → Employee Dashboard
        setLocation("/dashboard");
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <AutoForceLogo variant="full" size="sm" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your WorkforceOS account
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  placeholder="you@company.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="pl-9"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 text-sm"
                  onClick={() => setLocation("/reset-password")}
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="pl-9"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Button
              variant="ghost"
              className="h-auto p-0"
              onClick={() => setLocation("/register")}
              data-testid="link-register"
            >
              Sign up
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-google-login"
              aria-label="Sign in with Google"
            >
              <SiGoogle className="h-5 w-5 text-red-500" />
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-github-login"
              aria-label="Sign in with GitHub"
            >
              <Github className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-facebook-login"
              aria-label="Sign in with Facebook"
            >
              <SiFacebook className="h-5 w-5 text-blue-600" />
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.href = "/api/demo-login"}
            data-testid="button-demo-login"
          >
            Try Demo Account
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
