import { secureFetch } from "@/lib/csrf";
import { useState, useEffect } from "react";
import { SEO, PAGE_SEO } from '@/components/seo';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { UniversalWelcomeNotification } from "@/components/universal-welcome-notification";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LoginLogo } from "@/components/unified-brand-logo";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import { useTransitionLoader, startLoginTransition } from "@/components/canvas-hub";
import { CanvasHubPage, PAGE_CONFIGS } from "@/components/canvas-hub/CanvasHubRegistry";
import { useAuth } from "@/hooks/useAuth";

const REMEMBER_ME_KEY = "coaileague_remember_me";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginResponse {
  message: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    emailVerified?: boolean;
    platformRole?: string | null;
    currentWorkspaceId?: string | null;
  };
}

export default function CustomLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [loginData, setLoginData] = useState<LoginResponse["user"] | null>(null);
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);
  const transitionLoader = useTransitionLoader();
  const { executeRecaptcha } = useRecaptcha({ action: 'login' });

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, authLoading, setLocation]);

  useEffect(() => {
    fetch("/api/auth/capabilities")
      .then((r) => r.json())
      .then((data) => setDevLoginEnabled(!!data?.devLoginEnabled))
      .catch(() => setDevLoginEnabled(false));
  }, []);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_ME_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.email) {
          form.setValue("email", parsed.email);
          form.setValue("rememberMe", true);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    const startTime = Date.now();
    const authTransition = startLoginTransition(transitionLoader);

    try {
      authTransition?.setProgress(15);
      const recaptchaToken = await executeRecaptcha();
      authTransition?.setProgress(25);
      authTransition?.updateMessage('Signing In', 'Authenticating...');

      const response = await secureFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, recaptchaToken }),
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      setLoadingDuration(duration);
      authTransition?.setProgress(50);

      const result = await response.json();

      if (!response.ok) {
        if (result.needsPasswordReset) {
          authTransition?.cancel();
          toast({
            title: "Password Required",
            description: "This account was created via third-party OAuth. Please reset your password to sign in with email.",
            variant: "destructive",
            duration: 8000,
          });
          setTimeout(() => {
            setLocation("/forgot-password");
          }, 2000);
          return;
        }
        throw new Error(result.message || "Login failed");
      }

      authTransition?.setProgress(65);
      authTransition?.updateMessage('Welcome!', `Welcome back, ${result.user.firstName || 'friend'}`);

      if (data.rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email: data.email }));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }

      let redirectTo = result.user.currentWorkspaceId ? "/dashboard" : "/onboarding/start";

      try {
        const authCheck = await secureFetch("/api/auth/me", { credentials: "include" });
        if (authCheck.status === 402) {
          const paymentData = await authCheck.json();
          if (paymentData.code === 'PAYMENT_REQUIRED' && paymentData.isOwner) {
            authTransition?.cancel();
            toast({
              title: "Payment Required",
              description: `Your organization subscription needs renewal.`,
              variant: "destructive",
              duration: 5000,
            });
            setIsLoading(false);
            const paymentRedirect = paymentData.redirectTo || "/org-management";
            const isInternalRedirect = paymentRedirect.startsWith('/') && !paymentRedirect.startsWith('//');
            window.location.href = isInternalRedirect ? paymentRedirect : "/org-management";
            return;
          }
        }
      } catch (e) {
        console.error("[Login] Auth check error:", e);
      }

      authTransition?.setProgress(75);
      sessionStorage.setItem('coaileague_post_login_redirect', redirectTo);
      setLoginData(result.user);
      setShowWelcome(true);
      authTransition?.setProgress(85);

      if (authTransition) {
        await authTransition.complete();
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      sessionStorage.removeItem('coaileague_post_login_redirect');
      setLocation(redirectTo);

    } catch (error: any) {
      transitionLoader.cancel();
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loginDemo = async () => {
    form.setValue("email", "owner@acme-security.test");
    form.setValue("password", "admin123");
    await form.handleSubmit(onSubmit)();
  };

  return (
    <>
      <SEO
        title={PAGE_SEO.login.title}
        description={PAGE_SEO.login.description}
        noindex={true}
      />
      {showWelcome && loginData && (
        <UniversalWelcomeNotification
          firstName={loginData.firstName}
          lastName={loginData.lastName}
          email={loginData.email}
          role={loginData.role}
          platformRole={loginData.platformRole}
          loadingDuration={loadingDuration}
          onComplete={() => setShowWelcome(false)}
        />
      )}

      <CanvasHubPage config={PAGE_CONFIGS.login}>
        <div className="flex flex-col gap-5 w-full max-w-md mx-auto">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setLocation("/")}
              className="hover-elevate transition-all shrink-0"
              data-testid="button-logo-login"
            >
              <LoginLogo />
            </button>
            <button
              onClick={() => setLocation("/")}
              className="text-xs font-medium transition-colors text-primary"
              data-testid="link-back-landing"
            >
              Back to Home
            </button>
          </div>

          <div className="rounded-md bg-card text-card-foreground border border-border/50 p-5">
            <div className="text-center mb-5">
              <h1 className="text-lg font-semibold mb-1 text-foreground" data-testid="text-sign-in-heading">
                Sign In
              </h1>
              <p className="text-xs text-muted-foreground" data-testid="text-sign-in-subtitle">
                Access your workspace
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" aria-label="Login form">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          disabled={isLoading}
                          data-testid="input-email"
                          aria-label="Email address"
                          aria-required="true"
                          className="h-8 text-xs"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="password" data-testid="label-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                        Password
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter password"
                            disabled={isLoading}
                            data-testid="input-password"
                            aria-label="Password"
                            aria-required="true"
                            className="h-8 text-xs pr-8"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between gap-2 -mt-1 flex-wrap">
                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            id="rememberMe"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isLoading}
                            data-testid="checkbox-remember-me"
                          />
                        </FormControl>
                        <FormLabel htmlFor="rememberMe" className="cursor-pointer font-normal text-xs text-muted-foreground">
                          Remember me
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="font-medium transition-colors text-xs text-primary hover:text-primary/80"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2"
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 border-t border-border"></div>
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t border-border"></div>
            </div>

            <div className="text-center mb-4">
              <p className="text-xs text-muted-foreground">
                Don't have an account?{" "}
                <button
                  onClick={() => setLocation("/register")}
                  className="font-semibold transition-colors text-primary hover:text-primary/80"
                  data-testid="link-register"
                >
                  Create one
                </button>
              </p>
            </div>

            <Button
              variant="outline"
              onClick={loginDemo}
              disabled={isLoading}
              className="w-full text-xs"
              data-testid="button-demo"
            >
              {isLoading ? "Loading demo..." : "Try Demo Account"}
            </Button>

            {devLoginEnabled && (
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    const devTransition = startLoginTransition(transitionLoader);
                    try {
                      devTransition?.setProgress(20);
                      devTransition?.updateMessage('Signing In', 'Dev bypass login...');
                      const res = await apiRequest("GET", "/api/auth/dev-login");
                      const result = await res.json();
                      devTransition?.setProgress(50);
                      devTransition?.setProgress(75);
                      devTransition?.updateMessage('Welcome!', `Welcome back, ${result.user?.firstName || 'Owner'}`);
                      sessionStorage.setItem('coaileague_post_login_redirect', '/dashboard');
                      setLoginData(result.user);
                      setShowWelcome(true);
                      if (devTransition) await devTransition.complete();
                      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                      sessionStorage.removeItem('coaileague_post_login_redirect');
                      setLocation("/dashboard");
                    } catch (e: any) {
                      devTransition?.cancel();
                      toast({ title: "Dev login failed", description: e.message, variant: "destructive" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="w-full rounded-md text-xs font-semibold transition-all border-2 border-dashed h-8 text-green-600 dark:text-green-400 border-green-500 dark:border-green-400 bg-green-500/10 dark:bg-green-400/10"
                  data-testid="button-dev-login"
                >
                  {isLoading ? "Logging in..." : "Dev Bypass \u2192 ACME Security Owner"}
                </button>
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    const devTransition = startLoginTransition(transitionLoader);
                    try {
                      devTransition?.setProgress(20);
                      devTransition?.updateMessage('Signing In', 'Dev bypass login...');
                      const res = await apiRequest("GET", "/api/auth/dev-login-root");
                      const result = await res.json();
                      devTransition?.setProgress(50);
                      devTransition?.setProgress(75);
                      devTransition?.updateMessage('Welcome!', `Welcome back, ${result.user?.firstName || 'Admin'}`);
                      sessionStorage.setItem('coaileague_post_login_redirect', '/dashboard');
                      setLoginData(result.user);
                      setShowWelcome(true);
                      if (devTransition) await devTransition.complete();
                      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                      sessionStorage.removeItem('coaileague_post_login_redirect');
                      setLocation("/dashboard");
                    } catch (e: any) {
                      devTransition?.cancel();
                      toast({ title: "Dev login failed", description: e.message, variant: "destructive" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="w-full rounded-md text-xs font-semibold transition-all border-2 border-dashed h-8 text-amber-600 dark:text-amber-400 border-amber-500 dark:border-amber-400 bg-amber-500/10 dark:bg-amber-400/10"
                  data-testid="button-dev-login-root"
                >
                  {isLoading ? "Logging in..." : "Dev Bypass \u2192 Root Admin (Support Staff)"}
                </button>
              </div>
            )}
          </div>
        </div>
      </CanvasHubPage>
    </>
  );
}
