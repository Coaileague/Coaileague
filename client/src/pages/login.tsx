import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UniversalTransitionOverlay } from "@/components/universal-transition-overlay";
import { useLoginValidation } from "@/hooks/useLoginValidation";
import { Loader2, LogIn, Mail, Lock, Github } from "lucide-react";
import { SiGoogle, SiFacebook } from "react-icons/si";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingSubmessage, setLoadingSubmessage] = useState("");
  const [loadingStatus, setLoadingStatus] = useState<"loading" | "denied">("loading");
  const { validateLogin } = useLoginValidation();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowLoadingOverlay(true);
    setLoadingStatus("loading");
    setLoadingProgress(0);

    try {
      // Initial login request
      setLoadingMessage("Authenticating...");
      setLoadingSubmessage("Verifying your credentials");
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      // Get current date for personalized message
      const currentDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Welcome message with user info
      const userName = data.user?.email?.split('@')[0] || "User";
      const userId = data.user?.externalId || data.user?.id || "N/A";
      
      setLoadingMessage(`Welcome back, ${userName}!`);
      setLoadingSubmessage(`User ID: ${userId} • ${currentDate}`);

      // Check if security denial simulation is requested (for testing)
      const urlParams = new URLSearchParams(window.location.search);
      const simulateSecurityDenial = urlParams.get('simulate-security-denial') === 'true';

      // Perform comprehensive validation with progress tracking
      const validationResult = await validateLogin(
        data.user.id,
        (step, progress) => {
          setLoadingProgress(progress);
          setLoadingMessage(step.message);
          
          // Update submessage based on step
          switch (step.id) {
            case "auth":
              setLoadingSubmessage("Checking credentials against secure database...");
              break;
            case "subscription":
              setLoadingSubmessage("Verifying organization subscription status...");
              break;
            case "security":
              setLoadingSubmessage("AI Brain analyzing login patterns and security threats...");
              break;
            case "workspace":
              setLoadingSubmessage("Loading your workspace environment...");
              break;
            case "ready":
              setLoadingSubmessage("Almost there! Preparing your dashboard...");
              break;
          }
        },
        { simulateSecurityDenial }
      );

      if (!validationResult.success) {
        // Access denied
        setLoadingStatus("denied");
        setLoadingMessage("Access Denied");
        setLoadingSubmessage(validationResult.denialReason || "Login failed");
        setLoadingProgress(0); // Stop progress
        
        // After showing denial, return to login
        setTimeout(() => {
          setShowLoadingOverlay(false);
          setIsLoading(false);
          toast({
            title: "Access Denied",
            description: validationResult.denialReason || "Login failed",
            variant: "destructive",
          });
        }, 4000);
        return;
      }

      // Success - finalize and show 100% completion
      setLoadingMessage("Login Successful!");
      setLoadingSubmessage("Entering your workspace...");
      setLoadingProgress(100);

      // Important: Show 100% completion state for user satisfaction
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Hide overlay before routing
      setShowLoadingOverlay(false);

      toast({
        title: "Welcome back!",
        description: "Successfully logged in",
      });

      // Small delay before routing for smooth transition
      await new Promise(resolve => setTimeout(resolve, 300));

      // Role-based routing
      const platformRole = data.user?.platformRole;
      
      if (platformRole === 'root_admin' || platformRole === 'sysop') {
        setLocation("/dashboard");
      } else if (platformRole === 'compliance_officer') {
        setLocation("/auditor-portal");
      } else {
        setLocation("/dashboard");
      }
      
    } catch (error) {
      setLoadingStatus("denied");
      setLoadingMessage("Login Failed");
      setLoadingSubmessage(error instanceof Error ? error.message : "Invalid email or password");
      setLoadingProgress(0);
      
      setTimeout(() => {
        setShowLoadingOverlay(false);
        setIsLoading(false);
        toast({
          title: "Login failed",
          description: error instanceof Error ? error.message : "Invalid email or password",
          variant: "destructive",
        });
      }, 3000);
    }
  };

  const handleDenied = () => {
    // Called when access is denied - return to login
    setShowLoadingOverlay(false);
    setIsLoading(false);
  };

  return (
    <>
      <UniversalTransitionOverlay
        isVisible={showLoadingOverlay}
        status={loadingStatus}
        animationType="waves"
        scenario="login"
        message={loadingMessage}
        submessage={loadingSubmessage}
        progress={loadingProgress}
        onDenied={handleDenied}
      />
      
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <span className="text-white font-black text-lg">AF</span>
                </div>
                <div>
                  <div className="text-xl font-bold flex items-baseline gap-1">
                    <span className="text-gray-900 dark:text-foreground">AUTO</span>
                    <span className="text-primary dark:text-primary">FORCE</span>
                    <span className="text-xs align-super text-gray-900 dark:text-foreground">™</span>
                  </div>
                  <div className="text-[10px] text-gray-700 dark:text-gray-400 font-medium">Autonomous Workforce Management Solutions</div>
                </div>
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to your AutoForce™ account
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
                className="w-full bg-primary hover:bg-primary text-white"
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
            <div className="text-sm text-center text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <Button
                variant="ghost"
                className="h-auto p-0 text-primary hover:text-primary dark:text-primary dark:hover:text-primary"
                onClick={() => setLocation("/register")}
                data-testid="link-register"
              >
                Sign up
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
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
    </>
  );
}
