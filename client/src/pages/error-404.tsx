import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search, FileQuestion } from "lucide-react";
import { CoAIleagueStaticLogo } from "@/components/coaileague-static-logo";

export default function Error404() {
  const [, setLocation] = useLocation();
  const [countdown, setCountdown] = useState(8);

  const { data: currentUser } = useQuery<{ user: { id: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setLocation(isAuthenticated ? "/" : "/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg border shadow-sm">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-muted rounded-lg border">
              <CoAIleagueStaticLogo variant="icon" size="md" />
            </div>
          </div>

          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-muted flex items-center justify-center border">
            <FileQuestion className="h-8 w-8 text-muted-foreground" data-testid="icon-error-404" />
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-error-title">
            404 - Lost in Space
          </h1>
          <p className="text-sm text-muted-foreground mb-1" data-testid="text-error-description">
            This page doesn't exist in our system
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
            The page you're looking for may have been moved, deleted, or never existed.
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pb-6">
          <div className="bg-muted border rounded-lg p-3 text-center">
            <p className="text-sm text-foreground mb-2">
              Auto-redirecting to {isAuthenticated ? "Dashboard" : "Home"} in {countdown} seconds...
            </p>
            <div className="w-full bg-muted-foreground/10 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-linear"
                style={{ width: `${((8 - countdown) / 8) * 100}%` }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Button 
              onClick={() => setLocation(isAuthenticated ? "/" : "/")} 
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
                onClick={() => setLocation("/employees")} 
                variant="outline"
                className="w-full gap-2"
                data-testid="button-view-employees"
              >
                <Search className="h-4 w-4" />
                View Employees
              </Button>
            )}
          </div>

          <div className="pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground/70 mb-1">
              Need assistance?
            </p>
            <button
              className="text-xs text-primary hover:underline underline-offset-2" 
              onClick={() => setLocation("/support")}
              data-testid="link-contact-support"
            >
              Contact Support →
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-xs text-muted-foreground/50">
              CoAIleague - Autonomous Workforce Management
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
