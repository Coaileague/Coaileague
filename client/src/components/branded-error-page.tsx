import UniversalErrorPage, { 
  Error404Page, 
  Error403Page, 
  Error500Page, 
  GenericErrorPage 
} from "./universal-error-page";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrandedErrorPageProps {
  type: "404" | "403" | "500" | "error";
  title?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

/**
 * CoAIleague branded error page
 * Redirects to unified UniversalErrorPage for consistency
 */
export function BrandedErrorPage({
  type,
  title,
  message,
  showBackButton = true,
  showHomeButton = true
}: BrandedErrorPageProps) {
  const errorType = type === "error" ? "generic" : type;
  
  return (
    <UniversalErrorPage
      type={errorType}
      title={title}
      message={message}
      showBackButton={showBackButton}
      showHomeButton={showHomeButton}
    />
  );
}

export { Error404Page, Error403Page, Error500Page, GenericErrorPage };

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
