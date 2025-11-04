import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search, Compass, AlertTriangle } from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";

export default function Error404() {
  const [, setLocation] = useLocation();
  const [countdown, setCountdown] = useState(8);

  // Check authentication status
  const { data: currentUser } = useQuery<{ user: { id: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;

  // Auto-redirect countdown
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-800">
      {/* Animated background mesh */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmM2E4YSIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
      
      <Card className="w-full max-w-2xl border-blue-500/30 bg-gradient-to-br from-slate-900/90 via-blue-950/90 to-slate-800/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-lg blur-xl opacity-20 animate-pulse" />
        
        <CardHeader className="text-center pb-6 pt-8 relative z-10">
          {/* WorkforceOS Logo */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl backdrop-blur-sm border border-blue-400/30">
              <AutoForceLogo variant="icon" size="sm" />
            </div>
          </div>

          {/* 404 Icon */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border-2 border-orange-400/30">
            <Compass className="h-10 w-10 text-orange-400" data-testid="icon-error-404" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent mb-3" data-testid="text-error-title">
            404 - Lost in Space
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-2" data-testid="text-error-description">
            This page doesn't exist in our system
          </p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            The page you're looking for may have been moved, deleted, or never existed. Let's get you back on track.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pb-8 relative z-10">
          {/* Auto-redirect countdown */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-400/30 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-300 mb-2">
              Auto-redirecting to {isAuthenticated ? "Dashboard" : "Home"} in {countdown} seconds...
            </p>
            <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear"
                style={{ width: `${((8 - countdown) / 8) * 100}%` }}
              />
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="grid gap-3">
            <Button 
              onClick={() => setLocation(isAuthenticated ? "/" : "/")} 
              className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
            </Button>

            <Button 
              onClick={() => window.history.back()} 
              variant="outline"
              className="w-full justify-center gap-2 border-blue-400/30 hover:bg-blue-500/10"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>

            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/employees")} 
                variant="outline"
                className="w-full justify-center gap-2 border-blue-400/30 hover:bg-blue-500/10"
                data-testid="button-view-employees"
              >
                <Search className="h-4 w-4" />
                View Employees
              </Button>
            )}
          </div>

          {/* Help section */}
          <div className="pt-4 border-t border-slate-700/50 text-center">
            <p className="text-xs text-slate-400 mb-2">
              Need assistance?
            </p>
            <button
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2" 
              onClick={() => setLocation("/support")}
              data-testid="link-contact-support"
            >
              Contact Support →
            </button>
          </div>

          {/* Footer branding */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-500">
              WorkforceOS™ - Elite Workforce Management
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
