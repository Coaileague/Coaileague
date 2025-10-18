import { useLocation } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft, Search, MessageSquare, Compass } from "lucide-react";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

export default function NotFound() {
  const [, setLocation] = useLocation();

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
              <WorkforceOSLogo size="lg" showText={false} />
            </div>
          </div>

          {/* 404 Icon */}
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border-2 border-orange-400/30">
            <Compass className="h-10 w-10 text-orange-400" data-testid="icon-error-404" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent mb-3" data-testid="text-error-title">
            404 - Page Not Found
          </h1>
          <p className="text-base sm:text-lg text-slate-300 mb-2" data-testid="text-error-description">
            We couldn't find the page you're looking for
          </p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            The page may have been moved, deleted, or the URL might be incorrect. Let's get you back on track.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pb-8 relative z-10">
          {/* Quick action buttons */}
          <div className="grid gap-3">
            <Button 
              onClick={() => setLocation("/")} 
              className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              Go to Dashboard
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

            <Button 
              onClick={() => setLocation("/employees")} 
              variant="outline"
              className="w-full justify-center gap-2 border-blue-400/30 hover:bg-blue-500/10"
              data-testid="button-view-employees"
            >
              <Search className="h-4 w-4" />
              View Employees
            </Button>
          </div>

          {/* Live Support Section */}
          <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-4">
            <Button 
              onClick={() => setLocation("/live-chat")} 
              className="w-full justify-center gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 border-0"
              data-testid="button-live-support"
            >
              <MessageSquare className="h-4 w-4" />
              Live Support - We're Here to Help
            </Button>
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
