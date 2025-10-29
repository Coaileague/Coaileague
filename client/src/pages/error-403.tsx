import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Home, ArrowLeft, Lock } from "lucide-react";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

export default function Error403() {
  const [, setLocation] = useLocation();

  // Check authentication status
  const { data: currentUser } = useQuery<{ user: { id: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-amber-950 via-slate-900 to-red-950">
      {/* Animated background mesh */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmM2E4YSIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
      
      <Card className="w-full max-w-2xl border-amber-500/30 bg-gradient-to-br from-slate-900/90 via-amber-950/90 to-slate-800/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 rounded-lg blur-xl opacity-20 animate-pulse" />
        
        <CardHeader className="text-center pb-6 pt-8 relative z-10">
          {/* WorkforceOS Logo */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gradient-to-br from-amber-500/20 to-red-500/20 rounded-2xl backdrop-blur-sm border border-amber-400/30">
              <WorkforceOSLogo variant="icon" size="sm" />
            </div>
          </div>

          {/* 403 Icon */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center border-2 border-amber-400/30">
            <ShieldAlert className="h-10 w-10 text-amber-400" data-testid="icon-error-403" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-300 via-orange-300 to-red-300 bg-clip-text text-transparent mb-3" data-testid="text-error-title">
            403 - Access Denied
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-2" data-testid="text-error-description">
            You don't have permission to access this resource
          </p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            This area requires specific permissions or a higher subscription tier.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pb-8 relative z-10">
          {/* Info box */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-400/30 rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center text-slate-200">
              <Lock className="mr-2 h-4 w-4 text-amber-400" />
              Why am I seeing this?
            </h3>
            <ul className="text-sm text-slate-300 space-y-1 ml-6 list-disc">
              <li>You may not have the required role (Owner, Manager, or Employee)</li>
              <li>This feature might be restricted to platform administrators</li>
              <li>Your account may need additional permissions</li>
              <li>This workspace feature may require a higher subscription tier</li>
            </ul>
          </div>

          {/* Quick action buttons */}
          <div className="grid gap-3">
            <Button 
              onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")} 
              className="w-full justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
            </Button>

            <Button 
              onClick={() => window.history.back()} 
              variant="outline"
              className="w-full justify-center gap-2 border-amber-400/30 hover:bg-amber-500/10"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>

            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/billing")} 
                variant="outline"
                className="w-full justify-center gap-2 border-amber-400/30 hover:bg-amber-500/10"
                data-testid="button-view-billing"
              >
                <Lock className="h-4 w-4" />
                View Subscription & Upgrade
              </Button>
            )}
          </div>

          {/* Help section */}
          <div className="pt-4 border-t border-slate-700/50 text-center">
            <p className="text-xs text-slate-400 mb-2">
              Need access?
            </p>
            <button
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2" 
              onClick={() => setLocation("/support")}
              data-testid="link-contact-support"
            >
              Contact Your Administrator →
            </button>
          </div>

          {/* Footer branding */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-500">
              WorkforceOS™ - Enterprise-Grade Security & Access Control
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
