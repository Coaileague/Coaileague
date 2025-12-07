import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  ArrowLeft, 
  RefreshCw, 
  MessageSquare, 
  ShieldAlert, 
  FileQuestion, 
  ServerCrash,
  Lock,
  Search,
  AlertTriangle,
  Wrench
} from "lucide-react";
import { useState, useEffect } from "react";
import { CoAIleagueStaticLogo } from "@/components/coaileague-static-logo";
import { CoAITwinMascot } from "@/components/coai-twin-mascot";
import { errorConfig, getErrorMessage, getRecoveryActions } from "@/config/errorConfig";
import { apiRequest } from "@/lib/queryClient";

type ErrorType = "404" | "403" | "500" | "generic";

interface UniversalErrorPageProps {
  type: ErrorType;
  title?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  showSupportButton?: boolean;
  errorDetails?: string;
}

interface ErrorTypeConfig {
  code: string;
  defaultTitle: string;
  defaultMessage: string;
  mascotMode: "SEARCHING" | "ERROR" | "IDLE" | "THINKING";
  mascotMessage: string;
  icon: typeof AlertTriangle;
  bubbleStyle: string;
  textStyle: string;
  accentColor: string;
  tagline: string;
}

const errorTypeConfigs: Record<ErrorType, ErrorTypeConfig> = {
  "404": {
    code: "404",
    defaultTitle: "Page Not Found",
    defaultMessage: "We couldn't find the page you're looking for. It may have been moved, deleted, or the URL might be incorrect.",
    mascotMode: "SEARCHING",
    mascotMessage: "I'm searching for that page, but it seems to have wandered off. Let me help you find your way back!",
    icon: FileQuestion,
    bubbleStyle: "bg-sky-950/50 border-sky-800/30",
    textStyle: "text-sky-200",
    accentColor: "text-sky-400",
    tagline: "CoAIleague - Autonomous Workforce Management"
  },
  "403": {
    code: "403",
    defaultTitle: "Access Denied",
    defaultMessage: "You don't have permission to access this resource. This area requires specific permissions or a higher subscription tier.",
    mascotMode: "THINKING",
    mascotMessage: "This area is restricted. You may need additional permissions or a subscription upgrade to access this feature.",
    icon: ShieldAlert,
    bubbleStyle: "bg-amber-950/50 border-amber-800/30",
    textStyle: "text-amber-200",
    accentColor: "text-amber-400",
    tagline: "CoAIleague - Enterprise-Grade Security & Access Control"
  },
  "500": {
    code: "500",
    defaultTitle: "Server Error",
    defaultMessage: "Something went wrong on our end. Our team has been notified and is working to fix it. This is usually temporary.",
    mascotMode: "ERROR",
    mascotMessage: "I've detected a hiccup in our systems. Don't worry - our team is already on it. Try refreshing or come back shortly!",
    icon: ServerCrash,
    bubbleStyle: "bg-red-950/30 border-red-800/30",
    textStyle: "text-red-200",
    accentColor: "text-red-400",
    tagline: "CoAIleague - 99.9% Uptime SLA Guarantee"
  },
  "generic": {
    code: "ERR",
    defaultTitle: "Something Went Wrong",
    defaultMessage: "An unexpected error occurred. Please try again or contact support if the problem persists.",
    mascotMode: "ERROR",
    mascotMessage: "Something unexpected happened. Let me help you get back on track!",
    icon: AlertTriangle,
    bubbleStyle: "bg-orange-950/30 border-orange-800/30",
    textStyle: "text-orange-200",
    accentColor: "text-orange-400",
    tagline: "CoAIleague - Autonomous Workforce Management"
  }
};

export function UniversalErrorPage({
  type,
  title,
  message,
  showBackButton = true,
  showHomeButton = true,
  showSupportButton = true,
  errorDetails
}: UniversalErrorPageProps) {
  const [, setLocation] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorReported, setErrorReported] = useState(false);

  const { data: currentUser } = useQuery<{ user: { id: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAuthenticated = !!currentUser?.user;
  const isPlatformStaff = currentUser?.user?.platformRole && 
    ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(currentUser.user.platformRole);

  const config = errorTypeConfigs[type] || errorTypeConfigs.generic;
  const Icon = config.icon;

  useEffect(() => {
    if (!errorReported && type === "500") {
      apiRequest("POST", "/api/ai-brain/error-report", {
        errorType: type,
        errorDetails,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      }).catch(() => {});
      setErrorReported(true);
    }
  }, [type, errorDetails, errorReported]);

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
              <CoAIleagueStaticLogo size="md" variant="icon" />
            </div>
          </div>

          <div className="mx-auto mb-4 flex justify-center">
            <CoAITwinMascot mode={config.mascotMode} variant="mini" size={64} />
          </div>

          <div className={`${config.bubbleStyle} border rounded-lg p-3 mb-4 mx-auto max-w-sm`}>
            <p className={`text-[11px] ${config.textStyle} text-center leading-relaxed`}>
              <span className={`${config.accentColor} font-semibold`}>CoAI says:</span> {config.mascotMessage}
            </p>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-error-title">
            {config.code} - {title || config.defaultTitle}
          </h1>
          <p className="text-sm text-muted-foreground mb-1" data-testid="text-error-description">
            {message || config.defaultMessage}
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pb-6">
          {type === "403" && (
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
          )}

          {type === "500" && (
            <div className="bg-muted border rounded-lg p-3">
              <h3 className="font-semibold mb-2 text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                What can you do?
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Try refreshing the page</li>
                <li>Clear your browser cache and cookies</li>
                <li>Wait a few minutes and try again</li>
                <li>Contact support if the problem persists</li>
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            {type === "500" && (
              <Button 
                onClick={handleRefresh} 
                className="w-full gap-2"
                disabled={isRefreshing}
                data-testid="button-refresh-page"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Page'}
              </Button>
            )}

            {showHomeButton && (
              <Button 
                onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")} 
                className={type === "500" ? "w-full gap-2" : "w-full gap-2"}
                variant={type === "500" ? "outline" : "default"}
                data-testid="button-go-home"
              >
                <Home className="h-4 w-4" />
                {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
              </Button>
            )}

            {showBackButton && (
              <Button 
                onClick={() => window.history.back()} 
                variant="outline"
                className="w-full gap-2"
                data-testid="button-go-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
            )}

            {isAuthenticated && type === "404" && (
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

            {isAuthenticated && type === "403" && (
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

          {showSupportButton && (
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
          )}

          {isPlatformStaff && errorDetails && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h3 className="font-semibold mb-2 text-sm text-destructive flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Diagnostic Details (Staff Only)
              </h3>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono">
                {errorDetails}
              </pre>
            </div>
          )}

          <div className="pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground/70 mb-1">
              {type === "403" ? "Need access?" : "Need assistance?"}
            </p>
            <button
              className="text-xs text-primary hover:underline underline-offset-2" 
              onClick={() => setLocation("/support")}
              data-testid="link-contact-support"
            >
              {type === "403" ? "Contact Your Administrator →" : "Contact Support →"}
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-xs text-muted-foreground/50">
              {config.tagline}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Error404Page() {
  return <UniversalErrorPage type="404" />;
}

export function Error403Page() {
  return <UniversalErrorPage type="403" />;
}

export function Error500Page({ errorDetails }: { errorDetails?: string }) {
  return <UniversalErrorPage type="500" errorDetails={errorDetails} />;
}

export function GenericErrorPage({ 
  title, 
  message, 
  errorDetails 
}: { 
  title?: string; 
  message?: string; 
  errorDetails?: string; 
}) {
  return (
    <UniversalErrorPage 
      type="generic" 
      title={title} 
      message={message} 
      errorDetails={errorDetails} 
    />
  );
}

export default UniversalErrorPage;
