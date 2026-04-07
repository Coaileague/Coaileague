import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';

interface AIDisclaimerProps {
  variant?: 'inline' | 'banner' | 'footer';
  context?: 'financial' | 'payroll' | 'tax' | 'general';
  className?: string;
}

const CONTEXT_TEXT = {
  general: 'AI systems can make errors. All AI-generated content must be reviewed and verified by a qualified human before use.',
  financial: 'Financial reports display AI-calculated estimates. These figures are not audited and should be verified by a qualified accountant before use in official filings.',
  payroll: 'Payroll calculations are AI-assisted estimates. A qualified human must verify all figures, tax withholdings, and deductions before processing.',
  tax: 'Tax forms are for preparation purposes only. Consult a qualified CPA or tax professional before filing with the IRS or state agencies.',
} as const;

export function AIDisclaimer({ variant = 'inline', context = 'general', className = '' }: AIDisclaimerProps) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-start gap-2 text-xs text-muted-foreground ${className}`} data-testid="ai-disclaimer-inline">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span>{CONTEXT_TEXT[context]}</span>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 ${className}`} data-testid="ai-disclaimer-banner">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold">AI-Generated Content</span>
          <span className="mx-1"> - </span>
          <span>{CONTEXT_TEXT[context]}</span>
          <span> {PLATFORM_NAME} is workforce management middleware only — not a financial institution, CPA, or tax preparer. The organization is solely responsible for verifying accuracy.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-muted/50 border-t border-border px-3 sm:px-6 py-3 sm:py-4 ${className}`} data-testid="ai-disclaimer-footer">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            <strong>Important:</strong> {PLATFORM_NAME} is AI-powered workforce management middleware — not a financial institution, CPA firm, tax preparer, payroll provider, or legal advisor.
            AI systems can make errors. All content, calculations, reports, and recommendations must be reviewed by a qualified human before use.
            It is the sole responsibility of the organization representative or owner to verify all work product.
            {PLATFORM_NAME} is not responsible for errors, omissions, or inaccuracies unless directly caused by a verifiable defect in the processing engine.
          </p>
        </div>
      </div>
    </div>
  );
}
