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

      <div 
        className="min-h-screen flex items-center justify-center p-5"
        style={{
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
        }}
      >
      <div 
        className="w-full max-w-[460px] animate-[fadeInUp_0.6s_ease]"
        style={{
          animation: 'fadeInUp 0.6s ease'
        }}
      >
        {/* White Login Card */}
        <div 
          className="bg-white rounded-3xl p-12 max-sm:p-8 max-sm:px-6"
          style={{
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Logo Section */}
          <div className="text-center mb-10">
            {/* AF Logo with Gradient */}
            <div 
              className="w-20 h-20 max-sm:w-16 max-sm:h-16 rounded-[20px] inline-flex items-center justify-center text-[32px] max-sm:text-2xl font-bold text-white mb-4"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
              }}
            >
              AF
            </div>

            {/* Brand Name */}
            <div className="text-[28px] max-sm:text-2xl font-bold mb-2" style={{ color: '#1e293b' }}>
              AUTO
              <span 
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                FORCE
              </span>
            </div>

            {/* Tagline */}
            <div className="text-sm" style={{ color: '#64748b' }}>
              Autonomous Workforce Management Solutions
            </div>
          </div>

          {/* Login Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold mb-2" style={{ color: '#1e293b' }}>
              Sign In
            </h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Enter your credentials to access your account
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium" style={{ color: '#334155' }}>
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="you@company.com"
                        disabled={isLoading}
                        data-testid="input-email"
                        className="w-full px-4 py-3.5 rounded-xl text-[15px] border-2 transition-all"
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
                    <FormLabel className="text-sm font-medium" style={{ color: '#334155' }}>
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          disabled={isLoading}
                          data-testid="input-password"
                          className="w-full px-4 py-3.5 rounded-xl text-[15px] border-2 transition-all pr-12"
                          style={{
                            background: '#f8fafc',
                            borderColor: '#e2e8f0',
                            color: '#1e293b'
                          }}
                        />
                        <button
                          type="button"
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-lg transition-colors"
                          style={{ color: '#64748b' }}
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Forgot Password Link */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setLocation("/reset-password")}
                  className="text-sm transition-colors"
                  style={{ color: '#3b82f6' }}
                  data-testid="link-reset-password"
                >
                  Forgot your password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl text-white text-base font-semibold transition-all duration-300 disabled:opacity-70"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
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

          {/* Footer Links */}
          <div className="text-center mt-6">
            <p className="text-sm mb-2" style={{ color: '#64748b' }}>
              Don't have an account?{" "}
              <button
                onClick={() => setLocation("/register")}
                className="font-medium transition-colors"
                style={{ color: '#3b82f6' }}
                data-testid="link-register"
              >
                Sign up
              </button>
            </p>
          </div>

          {/* Demo Section */}
          <div 
            className="mt-8 p-5 rounded-xl text-center border-2"
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              borderColor: '#3b82f6'
            }}
          >
            <p className="text-sm font-medium mb-3" style={{ color: '#1e40af' }}>
              Want to see it in action?
            </p>
            <button
              onClick={() => window.location.href = "/api/demo-login"}
              className="px-6 py-2.5 bg-white rounded-lg text-sm font-semibold transition-all duration-300 border-2"
              style={{
                color: '#3b82f6',
                borderColor: '#3b82f6'
              }}
              data-testid="button-demo"
            >
              Try Demo Account
            </button>
          </div>

          {/* Back to Home */}
          <div className="mt-8 pt-6 text-center border-t" style={{ borderColor: '#e2e8f0' }}>
            <button
              onClick={() => setLocation("/")}
              className="text-sm transition-colors"
              style={{ color: '#64748b' }}
              data-testid="button-back-home"
            >
              ← Back to Home
            </button>
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
      </div>
    </>
  );
}
