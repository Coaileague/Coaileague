import { WorkforceOSLogo } from "./workforceos-logo";
import { AlertTriangle, Ban, ServerCrash, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface BrandedErrorPageProps {
  type: "404" | "403" | "500" | "error";
  title?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * WorkforceOS branded error page
 * Maintains platform consistency even during errors
 */
export function BrandedErrorPage({
  type,
  title,
  message,
  showBackButton = true,
  showHomeButton = true
}: BrandedErrorPageProps) {
  const [, setLocation] = useLocation();

  const errorConfig = {
    "404": {
      icon: AlertTriangle,
      defaultTitle: "Page Not Found",
      defaultMessage: "The page you're looking for doesn't exist in WorkforceOS.",
      color: "text-amber-500"
    },
    "403": {
      icon: Ban,
      defaultTitle: "Access Denied",
      defaultMessage: "You don't have permission to access this resource.",
      color: "text-red-500"
    },
    "500": {
      icon: ServerCrash,
      defaultTitle: "System Error",
      defaultMessage: "WorkforceOS encountered an unexpected error. Our team has been notified.",
      color: "text-purple-500"
    },
    "error": {
      icon: AlertTriangle,
      defaultTitle: "Something Went Wrong",
      defaultMessage: "An error occurred while processing your request.",
      color: "text-orange-500"
    }
  };

  const config = errorConfig[type];
  const Icon = config.icon;

  return (
    <div 
      className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4"
      data-testid={`error-page-${type}`}
    >
      <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-lg p-8 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="animate-pulse">
          <WorkforceOSLogo size="lg" variant="full" />
        </div>

        {/* Error Icon */}
        <div className={`${config.color} bg-white/5 rounded-full p-4`}>
          <Icon className="w-12 h-12" />
        </div>

        {/* Error Message */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {title || config.defaultTitle}
          </h1>
          <p className="text-sm text-white/60">
            {message || config.defaultMessage}
          </p>
        </div>

        {/* Error Code */}
        <div className="text-xs text-white/40 font-mono">
          ERROR_{type.toUpperCase()}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          {showBackButton && (
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="flex-1"
              data-testid="button-go-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          )}
          {showHomeButton && (
            <Button
              variant="default"
              onClick={() => setLocation("/")}
              className="flex-1"
              data-testid="button-go-home"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          )}
        </div>

        {/* Support Contact */}
        <div className="text-xs text-white/40 text-center">
          Need help? Contact{" "}
          <button 
            onClick={() => setLocation("/support")}
            className="text-indigo-400 hover:underline"
            data-testid="link-contact-support"
          >
            WorkforceOS Support
          </button>
        </div>
      </div>

      {/* Branding Footer */}
      <div className="mt-8 text-xs text-white/30 animate-pulse">
        Powered by WorkforceOS Platform
      </div>
    </div>
  );
}

/**
 * Inline error component for failed operations
 */
export function InlineError({
  message = "Something went wrong",
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div 
      className="flex flex-col items-center justify-center p-6 bg-destructive/10 border border-destructive/20 rounded-lg"
      data-testid="inline-error"
    >
      <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
      <p className="text-sm text-destructive text-center mb-4">{message}</p>
      {retry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={retry}
          data-testid="button-retry"
        >
          Try Again
        </Button>
      )}
    </div>
  );
}
