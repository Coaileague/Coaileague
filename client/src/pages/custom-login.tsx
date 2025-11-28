import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "@/contexts/transition-context";
import { UniversalWelcomeNotification } from "@/components/universal-welcome-notification";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { THEME } from "@/config/theme";
import { CoAIleagueLogo } from "@/components/coailleague-logo";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
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

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    const startTime = Date.now();

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      setLoadingDuration(duration);

      const result: LoginResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // Show personalized welcome notification with actual loading duration
      setLoginData(result.user);
      setShowWelcome(true);

      // Redirect after welcome notification completes (4 seconds)
      setTimeout(() => {
        setLocation("/dashboard");
      }, 4500);
    } catch (error: any) {
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
              <CoAIleagueLogo width={120} height={32} showTagline={false} className="sm:w-[150px] sm:h-[40px]" />
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
              className="rounded-2xl max-sm:p-6"
              style={{
                background: THEME.pages.login.card.bg,
                padding: THEME.pages.login.card.padding,
                borderRadius: THEME.pages.login.card.borderRadius,
                boxShadow: THEME.pages.login.card.shadow
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

              {/* Forgot Password Link */}
              <div className="text-right" style={{ marginTop: '-8px' }}>
                <button
                  type="button"
                  onClick={() => setLocation("/reset-password")}
                  className="font-medium transition-colors"
                  style={{ 
                    fontSize: THEME.pages.login.link.fontSize,
                    color: THEME.pages.login.link.color
                  }}
                  data-testid="link-reset-password"
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
