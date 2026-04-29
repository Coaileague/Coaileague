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
import { Loader2, Eye, EyeOff, AlertCircle, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LoginLogo } from "@/components/unified-brand-logo";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import { useTransitionLoader, startLoginTransition } from "@/components/canvas-hub";
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
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
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
        if (result.code === "email_unverified" || result.code === "EMAIL_UNVERIFIED") {
          authTransition?.cancel();
          setUnverifiedEmail(data.email);
          setEmailUnverified(true);
          setIsLoading(false);
          return;
        }
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
        const loginErrorMessages: Record<string, string> = {
          INVALID_CREDENTIALS: "The email or password you entered is incorrect. Please try again.",
          ACCOUNT_LOCKED: "Your account is temporarily locked after too many failed attempts. Try again in 15 minutes or reset your password.",
          EMAIL_UNVERIFIED: "Please verify your email address before signing in. Check your inbox for the verification link.",
          NO_PASSWORD: "This account uses social login. Use 'Forgot password' to set a password for email sign-in.",
          ORGANIZATION_INACTIVE: "Your organization's account is inactive. Please contact your administrator.",
          PAYMENT_REQUIRED: "Your organization's subscription has lapsed. Please contact your organization owner.",
        };
        throw new Error(loginErrorMessages[result.code as string] || result.message || "Login failed");
      }

      authTransition?.setProgress(65);
      authTransition?.updateMessage('Welcome!', `Welcome back, ${result.user.firstName || 'friend'}`);

      if (data.rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email: data.email }));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }

      if (result.mfaSetupRequired) {
        toast({
          title: 'MFA Setup Required',
          description: 'Root admin accounts require two-factor authentication. Please set up MFA now.',
        });
        setTimeout(() => {
          window.location.href = '/settings?tab=security&action=mfa';
        }, 1500);
        return;
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

  const loginRoot = async () => {
    form.setValue("email", "root@coaileague.com");
    form.setValue("password", "admin123");
    await form.handleSubmit(onSubmit)();
  };

  const resendVerification = async () => {
    if (!unverifiedEmail) return;
    setResendingVerification(true);
    try {
      const res = await secureFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      if (res.ok) {
        toast({
          title: "Verification email sent",
          description: "Check your inbox for a fresh verification link.",
        });
      } else {
        const json = await res.json().catch(() => ({}));
        toast({
          title: "Could not resend",
          description: json.message || "Please try again in a few minutes.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setResendingVerification(false);
    }
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

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-30 animate-pulse duration-7000"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl opacity-20 animate-pulse duration-8000 animation-delay-2000"></div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 w-full max-w-5xl relative z-10">
          {/* Left side - Branding & messaging */}
          <div className="hidden lg:flex flex-col justify-center gap-6 flex-1 min-w-0">
            <div className="space-y-3 animate-fade-in">
              <div className="inline-block">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                  Workforce Management Platform
                </span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
                Orchestrate Your Workforce
              </h1>
              <p className="text-lg text-slate-300 max-w-lg">
                CoAIleague brings enterprise-grade workforce management to security, staffing, and service industries. Trusted by companies like Statewide Protective Services.
              </p>
            </div>

            <div className="space-y-4 pt-4 animate-fade-in animation-delay-200">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 mt-1">
                  <Loader2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Smart Scheduling</h3>
                  <p className="text-sm text-slate-400">AI-powered shift management and intelligent coverage.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 mt-1">
                  <Eye className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Real-time Visibility</h3>
                  <p className="text-sm text-slate-400">Live dashboards for dispatch, payroll, and compliance.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 mt-1">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Enterprise Security</h3>
                  <p className="text-sm text-slate-400">SOC 2 Type II compliance and workspace isolation.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 text-xs text-slate-500">
              Built for security. Trusted by teams.
            </div>
          </div>

          {/* Right side - Login form */}
          <div className="w-full lg:w-96 animate-fade-in animation-delay-100">
            <div className="rounded-xl bg-card/80 backdrop-blur-xl text-card-foreground border border-border/40 shadow-2xl p-8 space-y-6">
              {/* Logo and header */}
              <div className="space-y-2 text-center">
                <button
                  onClick={() => setLocation("/")}
                  className="mx-auto hover-elevate transition-all block"
                  data-testid="button-logo-login"
                >
                  <LoginLogo />
                </button>
                <h2 className="text-xl font-bold text-foreground" data-testid="text-sign-in-heading">
                  Sign In
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-sign-in-subtitle">
                  Access your workspace to manage operations
                </p>
              </div>

              {/* Email unverified banner */}
              {emailUnverified && (
                <div
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-2"
                  data-testid="banner-email-unverified"
                >
                  <p className="font-semibold text-amber-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Please verify your email
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Check your inbox for a verification link from CoAIleague{unverifiedEmail ? ` sent to ${unverifiedEmail}` : ""}.
                  </p>
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-60 transition-colors"
                    onClick={resendVerification}
                    disabled={resendingVerification}
                    data-testid="button-resend-verification"
                  >
                    {resendingVerification ? "Sending…" : "Resend verification email →"}
                  </button>
                </div>
              )}

              {/* Login form */}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-label="Login form">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Email Address
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            id="email"
                            type="email"
                            placeholder="owner@company.com"
                            disabled={isLoading}
                            data-testid="input-email"
                            className="transition-all focus:ring-2 focus:ring-primary/50"
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
                        <FormLabel htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Password
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              disabled={isLoading}
                              data-testid="input-password"
                              className="pr-10 transition-all focus:ring-2 focus:ring-primary/50"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={isLoading}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              data-testid="button-toggle-password-visibility"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 mt-1">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            id="remember-me"
                            disabled={isLoading}
                            data-testid="checkbox-remember-me"
                          />
                        </FormControl>
                        <FormLabel htmlFor="remember-me" className="font-normal text-sm cursor-pointer">
                          Remember me on this device
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-4 h-10 font-semibold gap-2 bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg transition-all duration-200"
                    data-testid="button-submit-login"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </Form>

              {/* Dev bypass buttons — development environment only, never in production */}
              {devLoginEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-amber-500/30" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80 px-1">
                      Dev Bypass
                    </span>
                    <div className="h-px flex-1 bg-amber-500/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={loginDemo}
                      disabled={isLoading}
                      className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all disabled:opacity-50 text-left group"
                      data-testid="button-dev-login-acme"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/70 group-hover:text-amber-500">
                        ACME Security
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        Org Owner
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate w-full">
                        owner@acme-security.test
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={loginRoot}
                      disabled={isLoading}
                      className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border border-red-500/40 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/60 transition-all disabled:opacity-50 text-left group"
                      data-testid="button-dev-login-root"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-500/70 group-hover:text-red-500">
                        CoAIleague
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        Root Admin
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate w-full">
                        root@coaileague.com
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Footer links */}
              <div className="space-y-2 text-center text-xs border-t border-border/40 pt-4">
                <div className="text-muted-foreground">
                  <span>Don't have an account? </span>
                  <button
                    onClick={() => setLocation("/register")}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    data-testid="link-register"
                  >
                    Create one
                  </button>
                </div>
                <div className="text-muted-foreground">
                  <button
                    onClick={() => setLocation("/forgot-password")}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot your password?
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile-only branding */}
            <div className="lg:hidden text-center mt-6 space-y-2 animate-fade-in animation-delay-200">
              <p className="text-sm text-slate-300 font-medium">
                Workforce Management for Security & Staffing
              </p>
              <p className="text-xs text-slate-500">
                Trusted by companies like Statewide Protective Services
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .animation-delay-100 { animation-delay: 100ms; }
        .animation-delay-200 { animation-delay: 200ms; }
        .animation-delay-2000 { animation-delay: 2000ms; }
        @supports (animation-duration: 7s) {
          .duration-7000 { animation-duration: 7s; }
          .duration-8000 { animation-duration: 8s; }
        }
      `}</style>
    </>
  );
}
