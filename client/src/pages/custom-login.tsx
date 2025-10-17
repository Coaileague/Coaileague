import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "@/contexts/transition-context";
import { showLoginTransition, showErrorTransition, showSuccessTransition } from "@/lib/transition-utils";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function CustomLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const transition = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    
    // Show transition overlay
    transition.showTransition({
      status: "loading",
      message: "Logging you in...",
      submessage: "Please wait..."
    });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed");
      }

      // Show success transition with redirect
      showSuccessTransition(
        transition,
        "Login Successful!",
        "/dashboard",
        `Welcome back, ${data.email.split('@')[0]}!`
      );
    } catch (error: any) {
      // Show error transition
      showErrorTransition(
        transition,
        "Login Failed",
        error.message || "Invalid email or password"
      );
      
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
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--cad-background))] p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Branding */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <WorkforceOSLogo size="xl" showText={false} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-[hsl(var(--cad-text-primary))]">
              WorkforceOS
            </h1>
            <p className="text-sm text-[hsl(var(--cad-text-secondary))] mt-2">
              Complete Workforce Automation Platform
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="you@company.com"
                          disabled={isLoading}
                          data-testid="input-email"
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            disabled={isLoading}
                            data-testid="input-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
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
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-center w-full">
              <button
                onClick={() => setLocation("/reset-password")}
                className="text-[hsl(var(--cad-blue))] hover:underline"
                data-testid="link-reset-password"
              >
                Forgot your password?
              </button>
            </div>
            <div className="text-sm text-center text-muted-foreground w-full">
              Don't have an account?{" "}
              <button
                onClick={() => setLocation("/register")}
                className="text-[hsl(var(--cad-blue))] hover:underline font-medium"
                data-testid="link-register"
              >
                Sign up
              </button>
            </div>
            <div className="border-t pt-4 w-full">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/")}
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            </div>
          </CardFooter>
        </Card>

        {/* Demo Access */}
        <Card className="bg-[hsl(var(--cad-chrome))] border-[hsl(var(--cad-blue))]/30">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Want to see it in action?
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = "/api/demo-login"}
                data-testid="button-demo"
              >
                Try Demo Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
