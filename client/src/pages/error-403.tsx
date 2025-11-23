import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Home, ArrowLeft, Lock } from "lucide-react";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";

export default function Error403() {
  const [, setLocation] = useLocation();

  const { data: currentUser } = useQuery<{ user: { id: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg border shadow-sm">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-muted rounded-lg border">
              <AutoForceAFLogo variant="icon" size="md" />
            </div>
          </div>

          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
            <ShieldAlert className="h-8 w-8 text-destructive" data-testid="icon-error-403" />
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-error-title">
            403 - Access Denied
          </h1>
          <p className="text-sm text-muted-foreground mb-1" data-testid="text-error-description">
            You don't have permission to access this resource
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
            This area requires specific permissions or a higher subscription tier.
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pb-6">
          <div className="bg-muted border rounded-lg p-3">
            <h3 className="font-semibold mb-2 flex items-center text-sm">
              <Lock className="mr-2 h-4 w-4" />
              Why am I seeing this?
            </h3>
            <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
              <li>You may not have the required role</li>
              <li>This feature might be restricted to administrators</li>
              <li>Your account may need additional permissions</li>
              <li>This feature may require a higher subscription tier</li>
            </ul>
          </div>

          <div className="grid gap-2">
            <Button 
              onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")} 
              className="w-full gap-2"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
            </Button>

            <Button 
              onClick={() => window.history.back()} 
              variant="outline"
              className="w-full gap-2"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>

            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/billing")} 
                variant="outline"
                className="w-full gap-2"
                data-testid="button-view-billing"
              >
                <Lock className="h-4 w-4" />
                View Subscription & Upgrade
              </Button>
            )}
          </div>

          <div className="pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground/70 mb-1">
              Need access?
            </p>
            <button
              className="text-xs text-primary hover:underline underline-offset-2" 
              onClick={() => setLocation("/support")}
              data-testid="link-contact-support"
            >
              Contact Your Administrator →
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-xs text-muted-foreground/50">
              AutoForce™ - Enterprise-Grade Security & Access Control
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
