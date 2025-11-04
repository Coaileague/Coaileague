import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServerCrash, Home, RefreshCw, MessageSquare } from "lucide-react";
import { useState } from "react";
import { AutoForceLogo } from "@/components/autoforce-logo";

export default function Error500() {
  const [, setLocation] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check authentication status
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-red-950 via-slate-900 to-slate-800">
      {/* Animated background mesh */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmM2E4YSIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
      
      <Card className="w-full max-w-2xl border-red-500/30 bg-gradient-to-br from-slate-900/90 via-red-950/90 to-slate-800/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-red-600 via-orange-600 to-red-600 rounded-lg blur-xl opacity-20 animate-pulse" />
        
        <CardHeader className="text-center pb-6 pt-8 relative z-10">
          {/* WorkforceOS Logo */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl backdrop-blur-sm border border-red-400/30">
              <AutoForceLogo variant="icon" size="sm" />
            </div>
          </div>

          {/* 500 Icon */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border-2 border-red-400/30">
            <ServerCrash className="h-10 w-10 text-red-400" data-testid="icon-error-500" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-red-300 via-orange-300 to-red-300 bg-clip-text text-transparent mb-3" data-testid="text-error-title">
            500 - Server Error
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-2" data-testid="text-error-description">
            Something went wrong on our end
          </p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Our team has been notified. This is usually temporary.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pb-8 relative z-10">
          {/* Info box */}
          <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-400/30 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-slate-200">What can you do?</h3>
            <ul className="text-sm text-slate-300 space-y-1 ml-6 list-disc">
              <li>Try refreshing the page</li>
              <li>Clear your browser cache and cookies</li>
              <li>Wait a few minutes and try again</li>
              <li>Contact support if the problem persists</li>
            </ul>
          </div>

          {/* Quick action buttons */}
          <div className="grid gap-3">
            <Button 
              onClick={handleRefresh} 
              className="w-full justify-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 border-0"
              disabled={isRefreshing}
              data-testid="button-refresh-page"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Page'}
            </Button>

            <Button 
              onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")} 
              variant="outline"
              className="w-full justify-center gap-2 border-red-400/30 hover:bg-red-500/10"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
            </Button>

            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/support")} 
                variant="outline"
                className="w-full justify-center gap-2 border-red-400/30 hover:bg-red-500/10"
                data-testid="button-contact-support"
              >
                <MessageSquare className="h-4 w-4" />
                Contact Support
              </Button>
            )}
          </div>

          {/* Help section */}
          <div className="pt-4 border-t border-slate-700/50 text-center">
            <p className="text-xs text-slate-400 mb-2">
              Error Code: 500 - Internal Server Error
            </p>
            <p className="text-xs text-slate-500">
              WorkforceOS™ - 99.9% Uptime SLA Guarantee
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
