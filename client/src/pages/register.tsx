import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CoAIleagueAFLogo } from "@/components/coaileague-af-logo";
import { Loader2, UserPlus, Mail, Lock, User, CheckCircle2, XCircle, Github } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SiGoogle, SiFacebook } from "react-icons/si";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  // Password strength validation
  const validatePassword = (password: string) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const strength = (passedChecks / 5) * 100;

    return { checks, strength };
  };

  const passwordValidation = validatePassword(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordValidation.strength < 100) {
      toast({
        title: "Password too weak",
        description: "Please meet all password requirements",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      toast({
        title: "Account created!",
        description: "Welcome to CoAIleague",
      });

      // Auto-login after registration
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <CoAIleagueAFLogo variant="full" size="sm" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">Create Account</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Get started with CoAIleague today
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  data-testid="input-firstname"
                  type="text"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  data-testid="input-lastname"
                  type="text"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

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
              <Label htmlFor="password">Password</Label>
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

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="space-y-2">
                  <Progress value={passwordValidation.strength} className="h-2" />
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      {passwordValidation.checks.length ? (
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-gray-400" />
                      )}
                      <span className={passwordValidation.checks.length ? "text-primary dark:text-primary" : "text-gray-500 dark:text-gray-400"}>
                        At least 8 characters
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passwordValidation.checks.uppercase ? (
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-gray-400" />
                      )}
                      <span className={passwordValidation.checks.uppercase ? "text-primary dark:text-primary" : "text-gray-500 dark:text-gray-400"}>
                        One uppercase letter
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passwordValidation.checks.number ? (
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-gray-400" />
                      )}
                      <span className={passwordValidation.checks.number ? "text-primary dark:text-primary" : "text-gray-500 dark:text-gray-400"}>
                        One number
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passwordValidation.checks.special ? (
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-gray-400" />
                      )}
                      <span className={passwordValidation.checks.special ? "text-primary dark:text-primary" : "text-gray-500 dark:text-gray-400"}>
                        One special character
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary text-white"
              disabled={isLoading || passwordValidation.strength < 100}
              data-testid="button-register"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                Or sign up with
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-google-signup"
              aria-label="Sign up with Google"
            >
              <SiGoogle className="h-5 w-5 text-red-500" />
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-github-signup"
              aria-label="Sign up with GitHub"
            >
              <Github className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-facebook-signup"
              aria-label="Sign up with Facebook"
            >
              <SiFacebook className="h-5 w-5 text-blue-600" />
            </Button>
          </div>
          <div className="text-sm text-center text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Button
              variant="ghost"
              className="h-auto p-0 text-primary hover:text-primary dark:text-primary dark:hover:text-primary"
              onClick={() => setLocation("/login")}
              data-testid="link-login"
            >
              Sign in
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
