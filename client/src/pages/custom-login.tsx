import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "@/contexts/transition-context";
import { UniversalWelcomeNotification } from "@/components/universal-welcome-notification";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { THEME } from "@/config/theme";
import { LoginLogo } from "@/components/unified-brand-logo";
import { useUniversalAnimation } from "@/contexts/universal-animation-context";
import { useRecaptcha } from "@/hooks/useRecaptcha";

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

declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
    }
  }
}

export default function CustomLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const transition = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [loginData, setLoginData] = useState<LoginResponse["user"] | null>(null);
  const [loadingDuration, setLoadingDuration] = useState(0);
  const animationContext = useUniversalAnimation();
  const { executeRecaptcha } = useRecaptcha({ action: 'login' });

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_ME_KEY);
      if (saved) {
        const { email, password } = JSON.parse(saved);
        if (email) form.setValue("email", email);
        if (password) form.setValue("password", password);
        form.setValue("rememberMe", true);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    const startTime = Date.now();

    // Show login animation
    if (animationContext?.show) {
      animationContext.show({
        mode: 'search',
        mainText: 'Verifying',
        subText: 'Authenticating your credentials...',
        source: 'system'
      });
    }

    try {
      // Get reCAPTCHA token (invisible, runs in background)
      const recaptchaToken = await executeRecaptcha();
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, recaptchaToken }),
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      setLoadingDuration(duration);

      const result = await response.json();

      if (!response.ok) {
        // Handle special case for OAuth-only accounts needing password reset
        if (result.needsPasswordReset) {
          toast({
            title: "Password Required",
            description: "This account was created via Replit login. Please reset your password to sign in with email.",
            variant: "destructive",
            duration: 8000,
          });
          // Redirect to forgot password page
          setTimeout(() => {
            setLocation("/forgot-password");
          }, 2000);
          return;
        }
        throw new Error(result.message || "Login failed");
      }

      // Update animation to success
      if (animationContext?.update) {
        animationContext.update({
          mode: 'success',
          mainText: 'Welcome!',
          subText: `Welcome back, ${result.user.firstName || 'friend'}`,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // Save or clear Remember Me credentials
      if (data.rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email: data.email, password: data.password }));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }

      // Check subscription status before proceeding
      try {
        const authCheck = await fetch("/api/auth/me", { credentials: "include" });
        console.log("[Login] Auth check status:", authCheck.status);
        if (authCheck.status === 402) {
          const paymentData = await authCheck.json();
          console.log("[Login] Payment data:", paymentData);
          if (paymentData.code === 'PAYMENT_REQUIRED' && paymentData.isOwner) {
            // Org owner with payment issue - redirect to org management
            if (animationContext?.hide) {
              animationContext.hide();
            }
            toast({
              title: "Payment Required",
              description: `Your organization subscription needs renewal.`,
              variant: "destructive",
              duration: 5000,
            });
            // Use window.location for more reliable redirect
            setIsLoading(false);
            window.location.href = paymentData.redirectTo || "/org-management";
            return;
          }
        }
      } catch (e) {
        console.error("[Login] Auth check error:", e);
        // Continue with normal flow if check fails
      }

      // Show personalized welcome notification with actual loading duration
      setLoginData(result.user);
      setShowWelcome(true);

      // Determine redirect destination based on workspace status
      // Users without a workspace need to choose: create org or join with invite
      const redirectTo = result.user.currentWorkspaceId ? "/dashboard" : "/onboarding/start";

      // Hide animation and redirect after welcome notification completes
      setTimeout(() => {
        if (animationContext?.hide) {
          animationContext.hide();
        }
        setLocation(redirectTo);
      }, 4500);
    } catch (error: any) {
      // Show error animation
      if (animationContext?.show) {
        animationContext.show({
          mode: 'error',
          mainText: 'Login Failed',
          subText: error.message || "Invalid email or password",
          duration: 2000,
          source: 'system'
        });
      }

      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
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

      <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: THEME.pages.login.background }}>
        {/* Header */}
        <div className="border-b" style={{ background: THEME.pages.login.header.bg, borderColor: THEME.pages.login.header.borderColor }}>
          <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-5 flex items-center justify-between gap-2">
            <button 
              onClick={() => setLocation("/")}
              className="hover-elevate transition-all shrink-0"
              data-testid="button-logo-login"
            >
              <LoginLogo />
            </button>
            <button
              onClick={() => setLocation("/")}
              className="text-xs sm:text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] px-3 flex items-center"
              style={{ color: THEME.colors.primary.light }}
              data-testid="link-back-landing"
            >
              Back to Home
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
          <div 
            className="w-full animate-[fadeInUp_0.6s_ease]"
            style={{
              maxWidth: THEME.pages.login.card.maxWidth,
              animation: 'fadeInUp 0.6s ease'
            }}
          >
            {/* White Login Card */}
            <div 
              className="rounded-lg max-sm:p-6"
              style={{
                background: THEME.pages.login.card.bg,
                padding: '1.25rem', // Tighter padding p-5 equivalent
                borderRadius: '0.5rem', // rounded-lg equivalent
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' // shadow-md equivalent
              }}
            >
          {/* Login Header - Minimal */}
          <div className="text-center mb-5">
            <h1 className="font-semibold mb-1" style={{ 
              fontSize: THEME.pages.login.heading.fontSize,
              fontWeight: THEME.pages.login.heading.fontWeight,
              color: THEME.pages.login.heading.color
            }}>
              Sign In
            </h1>
            <p style={{ 
              fontSize: THEME.pages.login.subheading.fontSize,
              color: THEME.pages.login.subheading.color
            }}>
              Access your workspace
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} style={{ gap: THEME.pages.login.spacing.formGap }} className="flex flex-col">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{
                      fontSize: THEME.pages.login.label.fontSize,
                      fontWeight: THEME.pages.login.label.fontWeight,
                      textTransform: THEME.pages.login.label.textTransform as any,
                      color: THEME.pages.login.label.color,
                      letterSpacing: THEME.pages.login.label.letterSpacing,
                      marginBottom: '4px',
                      display: 'block'
                    }}>
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="you@company.com"
                        disabled={isLoading}
                        data-testid="input-email"
                        className="!w-full border transition-all"
                        style={{
                          height: THEME.pages.login.input.height,
                          fontSize: THEME.pages.login.input.fontSize,
                          padding: THEME.pages.login.input.padding,
                          background: THEME.pages.login.input.bg,
                          borderColor: THEME.pages.login.input.borderColor,
                          color: THEME.pages.login.input.color,
                          borderRadius: THEME.pages.login.input.borderRadius,
                          boxSizing: 'border-box'
                        }}
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
                    <FormLabel style={{
                      fontSize: THEME.pages.login.label.fontSize,
                      fontWeight: THEME.pages.login.label.fontWeight,
                      textTransform: THEME.pages.login.label.textTransform as any,
                      color: THEME.pages.login.label.color,
                      letterSpacing: THEME.pages.login.label.letterSpacing,
                      marginBottom: '4px',
                      display: 'block'
                    }}>
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter password"
                          disabled={isLoading}
                          data-testid="input-password"
                          className="!w-full border transition-all"
                          style={{
                            height: THEME.pages.login.input.height,
                            fontSize: THEME.pages.login.input.fontSize,
                            padding: THEME.pages.login.input.padding,
                            paddingRight: '32px',
                            background: THEME.pages.login.input.bg,
                            borderColor: THEME.pages.login.input.borderColor,
                            color: THEME.pages.login.input.color,
                            borderRadius: THEME.pages.login.input.borderRadius,
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: '#94a3b8' }}
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Remember Me & Forgot Password Row */}
              <div className="flex items-center justify-between" style={{ marginTop: '-4px' }}>
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                          data-testid="checkbox-remember-me"
                        />
                      </FormControl>
                      <FormLabel 
                        className="cursor-pointer font-normal"
                        style={{ 
                          fontSize: THEME.pages.login.link.fontSize,
                          color: THEME.pages.login.subheading.color
                        }}
                      >
                        Remember me
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="font-medium transition-colors"
                  style={{ 
                    fontSize: THEME.pages.login.link.fontSize,
                    color: THEME.pages.login.link.color
                  }}
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full text-white font-semibold transition-all duration-300 disabled:opacity-70"
                style={{
                  height: THEME.pages.login.button.height,
                  fontSize: THEME.pages.login.button.fontSize,
                  padding: THEME.pages.login.button.padding,
                  marginTop: THEME.pages.login.spacing.buttonTop,
                  background: THEME.pages.login.button.gradient,
                  boxShadow: THEME.pages.login.button.shadow,
                  borderRadius: THEME.pages.login.button.borderRadius,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  border: 'none'
                }}
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
              </button>
            </form>
          </Form>

          {/* Divider */}
          <div className="flex items-center gap-3" style={{ margin: THEME.pages.login.spacing.dividerMargin }}>
            <div className="flex-1" style={{ borderTop: `1px solid ${THEME.colors.border.primary}` }}></div>
            <span style={{ 
              fontSize: THEME.pages.login.label.fontSize,
              color: THEME.colors.text.muted
            }}>or</span>
            <div className="flex-1" style={{ borderTop: `1px solid ${THEME.colors.border.primary}` }}></div>
          </div>

          {/* Footer Links */}
          <div className="text-center mb-4">
            <p style={{ 
              fontSize: THEME.pages.login.subheading.fontSize,
              color: THEME.colors.text.placeholder
            }}>
              Don't have an account?{" "}
              <button
                onClick={() => setLocation("/register")}
                className="font-semibold transition-colors"
                style={{ color: THEME.colors.primary.light }}
                data-testid="link-register"
              >
                Create one
              </button>
            </p>
          </div>

          {/* Demo Section */}
          <button
            onClick={() => window.location.href = "/api/demo-login"}
            className="w-full rounded text-xs font-medium transition-all border"
            style={{
              height: THEME.pages.login.input.height,
              color: THEME.colors.primary.light,
              borderColor: THEME.colors.border.primary,
              background: THEME.pages.login.input.bg
            }}
            data-testid="button-demo"
          >
            Try Demo Account
          </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
