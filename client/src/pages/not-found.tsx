import { useLocation } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft, Search, MessageSquare } from "lucide-react";
import { WFLogo } from "@/components/wf-logo";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, hsl(243 75% 59%) 0%, hsl(264 70% 50%) 100%)'
    }}>
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-4">
          {/* WorkforceOS Logo */}
          <div className="mx-auto mb-4 h-24 w-24 rounded-full bg-slate-900/80 flex items-center justify-center border-2 border-blue-500/50 shadow-xl shadow-blue-500/20">
            <WFLogo size={48} />
          </div>
          <h1 className="text-4xl font-bold" data-testid="text-error-title">404 - Page Not Found</h1>
          <p className="text-lg text-muted-foreground mt-2" data-testid="text-error-description">
            We couldn't find the page you're looking for
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            The page may have been moved, deleted, or the URL might be incorrect. Here are some helpful links to get you back on track:
          </p>

          <div className="grid gap-3 mt-6">
            <Button 
              onClick={() => setLocation("/")} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-go-home"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>

            <Button 
              onClick={() => window.history.back()} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-go-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>

            <Button 
              onClick={() => setLocation("/employees")} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-view-employees"
            >
              <Search className="mr-2 h-4 w-4" />
              View Employees
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex-col text-center space-y-3 pt-6 border-t">
          {/* Live Support Button - Prominent */}
          <Button 
            onClick={() => setLocation("/live-chat")} 
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg"
            data-testid="button-live-support"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Live Support - We're Here to Help
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Need help? <button onClick={() => setLocation("/support")} className="text-blue-500 hover:text-blue-600 underline text-xs" data-testid="link-contact-support">Contact Support</button>
          </p>
          <p className="text-xs text-muted-foreground">
            WorkforceOS™ - Elite Workforce Management
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
