import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServerCrash, Home, RefreshCw, MessageSquare } from "lucide-react";
import { useState } from "react";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";

export default function Error500() {
  const [, setLocation] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: currentUser } = useQuery<{ user: { id: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg border shadow-sm">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-muted rounded-lg border">
              <AnimatedAutoForceLogo variant="icon" size="md" />
            </div>
          </div>

          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
            <ServerCrash className="h-8 w-8 text-destructive" data-testid="icon-error-500" />
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-error-title">
            500 - Server Error
          </h1>
          <p className="text-sm text-muted-foreground mb-1" data-testid="text-error-description">
            Something went wrong on our end
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
            Our team has been notified. This is usually temporary.
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pb-6">
          <div className="bg-muted border rounded-lg p-3">
            <h3 className="font-semibold mb-2 text-sm">What can you do?</h3>
            <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
              <li>Try refreshing the page</li>
              <li>Clear your browser cache and cookies</li>
              <li>Wait a few minutes and try again</li>
              <li>Contact support if the problem persists</li>
            </ul>
          </div>

          <div className="grid gap-2">
            <Button 
              onClick={handleRefresh} 
              className="w-full gap-2"
              disabled={isRefreshing}
              data-testid="button-refresh-page"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Page'}
            </Button>

            <Button 
              onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")} 
              variant="outline"
              className="w-full gap-2"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
            </Button>

            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/support")} 
                variant="outline"
                className="w-full gap-2"
                data-testid="button-contact-support"
              >
                <MessageSquare className="h-4 w-4" />
                Contact Support
              </Button>
            )}
          </div>

          <div className="pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground/70 mb-1">
              Error Code: 500 - Internal Server Error
            </p>
            <p className="text-xs text-muted-foreground/50">
              AutoForce™ - 99.9% Uptime SLA Guarantee
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
