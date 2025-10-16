import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Home, RefreshCw, LogIn, MessageSquare, AlertTriangle } from "lucide-react";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

export default function Chat404() {
  const [, setLocation] = useLocation();
  const [countdown, setCountdown] = useState(5);
  const [isRedirecting, setIsRedirecting] = useState(false);

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
          handleAutoRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const handleAutoRedirect = () => {
    setIsRedirecting(true);
    if (isAuthenticated) {
      // Authenticated users go to dashboard
      setLocation("/");
    } else {
      // Unauthenticated users go to login
      setLocation("/login");
    }
  };

  const handleRefreshChat = () => {
    window.location.href = "/live-chat";
    window.location.reload();
  };

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
              <WorkforceOSLogo className="w-16 h-16" />
            </div>
          </div>

          {/* Gatekeeper Icon */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border-2 border-orange-400/30 relative">
            <Shield className="h-10 w-10 text-orange-400 animate-pulse" data-testid="icon-gatekeeper" />
            <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 flex items-center justify-center border-2 border-slate-900">
              <AlertTriangle className="h-3 w-3 text-white" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent mb-3" data-testid="text-error-title">
            Access Gatekeeper
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-2" data-testid="text-error-description">
            {isAuthenticated 
              ? "Unable to Access Chat Service" 
              : "Authentication Required for Chat Access"}
          </p>
          <p className="text-sm text-slate-400">
            {isAuthenticated
              ? "The HelpDesk chat service is temporarily unavailable or you don't have permission to access this resource."
              : "Please log in to access the live chat system."}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pb-8 relative z-10">
          {/* Status Message */}
          <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-4 flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-200 font-medium mb-1">What Happened?</p>
              <p className="text-xs text-slate-400">
                {isAuthenticated
                  ? "Our security gatekeeper detected an issue with your chat session. This could be due to expired credentials, restricted access, or a temporary service interruption."
                  : "The chat system requires authentication to verify your identity and ensure secure communications."}
              </p>
            </div>
          </div>

          {/* Auto-redirect countdown */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-400/30 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-300 mb-2">
              {isRedirecting ? "Redirecting..." : `Auto-redirecting in ${countdown} seconds...`}
            </p>
            <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear"
                style={{ width: `${((5 - countdown) / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid gap-3">
            {isAuthenticated ? (
              <>
                <Button 
                  onClick={handleRefreshChat}
                  className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0"
                  data-testid="button-refresh-chat"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Chat & Reconnect
                </Button>

                <Button 
                  onClick={() => setLocation("/")}
                  variant="outline"
                  className="w-full justify-center gap-2 border-blue-400/30 hover:bg-blue-500/10"
                  data-testid="button-go-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Go to Dashboard
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={() => setLocation("/login")}
                  className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0"
                  data-testid="button-login"
                >
                  <LogIn className="h-4 w-4" />
                  Log In to Continue
                </Button>

                <Button 
                  onClick={() => setLocation("/")}
                  variant="outline"
                  className="w-full justify-center gap-2 border-blue-400/30 hover:bg-blue-500/10"
                  data-testid="button-go-home"
                >
                  <Home className="h-4 w-4" />
                  Go to Home
                </Button>
              </>
            )}
          </div>

          {/* Help section */}
          <div className="pt-4 border-t border-slate-700/50 text-center">
            <p className="text-xs text-slate-400 mb-2">
              Still having trouble accessing chat?
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
