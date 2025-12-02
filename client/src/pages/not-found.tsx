import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft, Search, MessageSquare, FileQuestion } from "lucide-react";
import { CoAIleagueAFLogo } from "@/components/coaileague-af-logo";
import { GeminiAgentMascot } from "@/components/gemini-agent-mascot";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg border shadow-sm">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-muted rounded-lg border">
              <CoAIleagueAFLogo size="md" variant="icon" />
            </div>
          </div>

          <div className="mx-auto mb-4 flex justify-center">
            <GeminiAgentMascot mode="SEARCHING" variant="mini" size={64} />
          </div>

          <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 mb-4 mx-auto max-w-sm">
            <p className="text-[11px] text-slate-300 text-center leading-relaxed">
              <span className="text-sky-400 font-semibold">CoAI says:</span> I'm searching for that page, but it seems to have wandered off. Let me help you find your way back!
            </p>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-error-title">
            404 - Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground mb-1" data-testid="text-error-description">
            We couldn't find the page you're looking for
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
            The page may have been moved, deleted, or the URL might be incorrect.
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pb-6">
          <div className="grid gap-2">
            <Button 
              onClick={() => setLocation("/")} 
              className="w-full gap-2"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              Go to Dashboard
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

            <Button 
              onClick={() => setLocation("/employees")} 
              variant="outline"
              className="w-full gap-2"
              data-testid="button-view-employees"
            >
              <Search className="h-4 w-4" />
              View Employees
            </Button>
          </div>

          <div className="bg-muted border rounded-lg p-3">
            <Button 
              onClick={() => setLocation("/chat")} 
              variant="secondary"
              className="w-full gap-2"
              data-testid="button-live-support"
            >
              <MessageSquare className="h-4 w-4" />
              Live Support - We're Here to Help
            </Button>
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
