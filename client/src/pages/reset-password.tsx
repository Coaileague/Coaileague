import { secureFetch } from "@/lib/csrf";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { SEO } from "@/components/seo";

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState<'pending' | 'success' | 'error' | 'invalid'>('pending');
  const [token, setToken] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = form.watch("password");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    
    if (!tokenFromUrl) {
      setResetStatus('invalid');
    } else {
      setToken(tokenFromUrl);
    }
  }, []);

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setResetStatus('invalid');
      return;
    }

    setIsLoading(true);

    try {
      const response = await secureFetch("/api/auth/reset-password-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.message?.includes("expired") || result.message?.includes("invalid")) {
          setResetStatus('invalid');
        } else {
          throw new Error(result.message || "Failed to reset password");
        }
        return;
      }

      setResetStatus('success');
      
      toast({
        title: "Password Reset Successful",
        description: "You can now log in with your new password.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setResetStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  if (resetStatus === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs mx-auto">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              <UnifiedBrandLogo size="md" />
            </div>
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl">Invalid or Expired Link</CardTitle>
            <CardDescription className="text-base">
              This password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/forgot-password">
              <Button className="w-full" data-testid="button-request-new-link">
                Request New Reset Link
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" className="w-full" data-testid="link-back-to-login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs mx-auto">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              <UnifiedBrandLogo size="md" />
            </div>
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Password Reset Complete!</CardTitle>
            <CardDescription className="text-base">
              Your password has been successfully reset. You can now log in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full" data-testid="button-go-to-login">
                Go to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEO
        title="Reset Your Password"
        description="Set a new password for your CoAIleague account."
        noindex={true}
      />
      <Card className="w-full max-w-xs mx-auto">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto">
            <UnifiedBrandLogo size="md" />
          </div>
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Create New Password</CardTitle>
          <CardDescription className="text-base">
            Choose a strong password to secure your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          disabled={isLoading}
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Password requirements:</p>
                <div className="grid grid-cols-1 gap-1">
                  {passwordRequirements.map((req) => {
                    const isValid = req.test(password);
                    return (
                      <div
                        key={req.label}
                        className={`flex items-center gap-2 text-sm ${
                          isValid ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}
                      >
                        {isValid ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-current" />
                        )}
                        {req.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          disabled={isLoading}
                          data-testid="input-confirm-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>

              <Link href="/login">
                <Button variant="ghost" className="w-full" type="button" data-testid="link-back-to-login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
