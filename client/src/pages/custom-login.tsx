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

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result: LoginResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      // Show personalized welcome notification
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
          onComplete={() => setShowWelcome(false)}
        />
      )}

      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #fafbff 0%, #f5f9ff 100%)' }}>
        {/* Header */}
        <div className="border-b" style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: '#e2e8f0' }}>
          <div className="container mx-auto px-6 py-5 flex items-center justify-between">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center gap-3 hover-elevate"
              data-testid="button-logo-login"
            >
              <div 
                className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-xl font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.2)'
                }}
              >
                AF
              </div>
              <div>
                <div className="font-semibold" style={{ color: '#1e293b' }}>AUTOFORCE</div>
                <div className="text-xs" style={{ color: '#94a3b8' }}>Workforce Intelligence</div>
              </div>
            </button>
            <button
              onClick={() => setLocation("/")}
              className="text-sm font-medium transition-colors"
              style={{ color: '#3b82f6' }}
              data-testid="link-back-landing"
            >
              Back to Home
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div 
            className="w-full max-w-sm animate-[fadeInUp_0.6s_ease]"
            style={{ animation: 'fadeInUp 0.6s ease' }}
          >
            {/* White Login Card */}
            <div 
              className="bg-white rounded-2xl p-8 max-sm:p-6"
              style={{
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
              }}
            >
          {/* No logo here - it's in header now */}

          {/* Login Header - Minimal */}
          <div className="text-center mb-5">
            <h1 className="text-lg font-semibold mb-1" style={{ color: '#1e293b' }}>
              Sign In
            </h1>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Access your workspace
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="you@company.com"
                        disabled={isLoading}
                        data-testid="input-email"
                        className="!h-8 !px-2 !py-1 !text-xs w-full border transition-all rounded"
                        style={{
                          background: '#f8fafc',
                          borderColor: '#e2e8f0',
                          color: '#1e293b'
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
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
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
                          className="!h-8 !px-2 !py-1 !text-xs !pr-8 w-full border transition-all rounded"
                          style={{
                            background: '#f8fafc',
                            borderColor: '#e2e8f0',
                            color: '#1e293b'
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
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => setLocation("/reset-password")}
                  className="text-xs transition-colors font-medium"
                  style={{ color: '#3b82f6' }}
                  data-testid="link-reset-password"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-8 py-1 rounded text-white text-xs font-semibold transition-all duration-300 disabled:opacity-70 mt-3"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.2)',
                  cursor: isLoading ? 'not-allowed' : 'pointer'
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
          <div className="my-3 flex items-center gap-3">
            <div className="flex-1" style={{ borderTop: '1px solid #e2e8f0' }}></div>
            <span className="text-xs" style={{ color: '#cbd5e1' }}>or</span>
            <div className="flex-1" style={{ borderTop: '1px solid #e2e8f0' }}></div>
          </div>

          {/* Footer Links */}
          <div className="text-center mb-4">
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Don't have an account?{" "}
              <button
                onClick={() => setLocation("/register")}
                className="font-semibold transition-colors"
                style={{ color: '#3b82f6' }}
                data-testid="link-register"
              >
                Create one
              </button>
            </p>
          </div>

          {/* Demo Section - Minimal */}
          <button
            onClick={() => window.location.href = "/api/demo-login"}
            className="w-full py-2 rounded-lg text-xs font-medium transition-all border"
            style={{
              color: '#3b82f6',
              borderColor: '#e2e8f0',
              background: '#f8fafc'
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
