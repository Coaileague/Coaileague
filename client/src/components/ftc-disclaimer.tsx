import { Info } from "lucide-react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface FTCDisclaimerProps {
  variant?: 'inline' | 'footer';
  className?: string;
}

export function FTCDisclaimer({ variant = 'footer', className = '' }: FTCDisclaimerProps) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-start gap-2 text-xs text-muted-foreground ${className}`} data-testid="ftc-disclaimer-inline">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          *Savings estimates based on U.S. Bureau of Labor Statistics median wages. Actual results vary by organization size, industry, and implementation.
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-muted/50 border-t border-border px-3 sm:px-6 py-3 sm:py-4 ${className}`} data-testid="ftc-disclaimer-footer">
      <div className="max-w-7xl mx-auto">
        <p className="text-xs text-muted-foreground text-center">
          <strong>Important Notice:</strong> All savings estimates and cost reduction figures represent potential outcomes based on U.S. Bureau of Labor Statistics median wage data and typical implementation scenarios. 
          Actual results vary significantly based on organization size, industry, current processes, implementation scope, and other factors. 
          {PLATFORM_NAME} automates administrative workflows and tasks — individual staffing decisions remain the responsibility of the organization.
          Past performance does not guarantee future results.
        </p>
      </div>
    </div>
  );
}
