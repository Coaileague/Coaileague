/**
 * FormShell — Readiness Section 13
 * =================================
 * Shared visual shell for every form surface:
 *   - Public tokenized forms (public-form.tsx)
 *   - Internal tenant forms (CustomFormRenderer)
 *   - RMS intake forms
 *   - Document-signing forms
 *
 * Before this existed, each surface had its own thin header ("Secure Form"
 * with a tiny icon) and a bare card. Branding was inconsistent, no trust
 * indicators, no footer. This primitive gives every form one consistent,
 * polished, white-label-aware presentation.
 *
 * Variants:
 *   - public     — white-label aware (tenant logo + primary color)
 *   - internal   — CoAIleague-branded, for tenant-authenticated flows
 *   - rms        — operations-accented for incident / RMS intake
 *
 * Respects TRINITY.md §H (footer dark-by-default, mobile scroll).
 */

import { type ReactNode } from "react";
import { CoAIleagueLogo } from "@/components/coaileague-logo";
import { Badge } from "@/components/ui/badge";
import { Clock, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
}

export type FormShellVariant = "public" | "internal" | "rms";

export interface FormShellProps {
  variant?: FormShellVariant;
  title: string;
  description?: string | null;
  subtitle?: ReactNode; // e.g. "Prepared for: John Smith"
  expiresAt?: string | Date | null; // for public forms only
  branding?: FormBranding | null;
  /** Rendered above the form body, e.g. progress pills, tabs. */
  headerAccessory?: ReactNode;
  /** Rendered inside the card footer, typically the primary submit button. */
  actions?: ReactNode;
  /** Rendered below the card, typically legal text / trust indicators. */
  trustNotes?: ReactNode;
  children: ReactNode;
  className?: string;
}

const VARIANT_THEME: Record<FormShellVariant, {
  outerBg: string;
  headerBg: string;
  headerAccent: string;
  chipBg: string;
  chipText: string;
  chipLabel: string;
  icon: typeof ShieldCheck;
}> = {
  public: {
    outerBg:
      "bg-gradient-to-b from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-950",
    headerBg:
      "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent",
    headerAccent: "ring-1 ring-primary/15",
    chipBg: "bg-primary/10",
    chipText: "text-primary",
    chipLabel: "Secure Form",
    icon: ShieldCheck,
  },
  internal: {
    outerBg: "bg-muted/30",
    headerBg: "bg-gradient-to-r from-indigo-500/10 via-indigo-500/5 to-transparent",
    headerAccent: "ring-1 ring-indigo-500/15",
    chipBg: "bg-indigo-500/10",
    chipText: "text-indigo-600 dark:text-indigo-400",
    chipLabel: "Internal Form",
    icon: Sparkles,
  },
  rms: {
    outerBg: "bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/30 dark:to-background",
    headerBg: "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
    headerAccent: "ring-1 ring-amber-500/20",
    chipBg: "bg-amber-500/10",
    chipText: "text-amber-700 dark:text-amber-400",
    chipLabel: "Operations Report",
    icon: ShieldCheck,
  },
};

function TrustFooter({ variant }: { variant: FormShellVariant }): JSX.Element {
  return (
    <footer className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <span className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Encrypted in transit &amp; at rest
        </span>
        <span className="hidden sm:inline">·</span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          SOC2-aligned audit trail
        </span>
        {variant === "public" && (
          <>
            <span className="hidden sm:inline">·</span>
            <span>ESIGN &amp; UETA compliant</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 opacity-70">
        <span>Powered by</span>
        <CoAIleagueLogo width={80} height={18} showTagline={false} />
      </div>
    </footer>
  );
}

export function FormShell({
  variant = "public",
  title,
  description,
  subtitle,
  expiresAt,
  branding,
  headerAccessory,
  actions,
  trustNotes,
  children,
  className,
}: FormShellProps): JSX.Element {
  const theme = VARIANT_THEME[variant];
  const VariantIcon = theme.icon;

  const companyName = branding?.companyName || null;
  const logoUrl = branding?.logoUrl || null;
  const primary = branding?.primaryColor || null;

  const chipStyle: React.CSSProperties = primary
    ? { backgroundColor: `${primary}1a`, color: primary } // 1a = 10% alpha hex
    : {};

  const expiresLabel =
    expiresAt
      ? new Date(expiresAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  return (
    <div className={cn("min-h-screen flex flex-col", theme.outerBg, className)}>
      <div className="flex-1 flex flex-col items-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {/* Top bar — tenant branding (white label first) */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName || "Tenant logo"}
                  className="h-7 w-7 rounded-md object-cover border"
                  data-testid="formshell-tenant-logo"
                />
              ) : (
                <div
                  className={cn(
                    "h-7 w-7 rounded-md grid place-items-center font-bold text-xs text-white",
                    !primary && "bg-primary",
                  )}
                  style={primary ? { backgroundColor: primary } : undefined}
                  aria-hidden
                >
                  {(companyName || "C")[0]}
                </div>
              )}
              <span className="text-sm font-semibold truncate" data-testid="formshell-company-name">
                {companyName || "CoAIleague"}
              </span>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full",
                !primary && theme.chipBg,
                !primary && theme.chipText,
              )}
              style={chipStyle}
              data-testid="formshell-chip"
            >
              <VariantIcon className="h-3 w-3" />
              {theme.chipLabel}
            </span>
          </div>

          {/* Card */}
          <div
            className={cn(
              "bg-card rounded-xl overflow-hidden shadow-sm border",
              theme.headerAccent,
            )}
          >
            {/* Header band */}
            <div className={cn("px-5 py-4 border-b", theme.headerBg)}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h1
                    className="text-lg sm:text-xl font-semibold leading-tight break-words"
                    data-testid="formshell-title"
                  >
                    {title}
                  </h1>
                  {description && (
                    <p
                      className="text-sm text-muted-foreground mt-1 leading-snug"
                      data-testid="formshell-description"
                    >
                      {description}
                    </p>
                  )}
                  {subtitle && (
                    <div
                      className="text-xs text-muted-foreground mt-2"
                      data-testid="formshell-subtitle"
                    >
                      {subtitle}
                    </div>
                  )}
                </div>
                {expiresLabel && (
                  <Badge variant="outline" className="shrink-0 gap-1">
                    <Clock className="h-3 w-3" />
                    Expires {expiresLabel}
                  </Badge>
                )}
              </div>
              {headerAccessory && (
                <div className="mt-3" data-testid="formshell-header-accessory">
                  {headerAccessory}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="px-5 py-5">{children}</div>

            {/* Actions footer (sticky-feel) */}
            {actions && (
              <div className="px-5 py-4 border-t bg-muted/30 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                {actions}
              </div>
            )}
          </div>

          {trustNotes && (
            <div className="text-xs text-muted-foreground px-1" data-testid="formshell-trust-notes">
              {trustNotes}
            </div>
          )}
        </div>
      </div>

      {/* Page footer — trust indicators + CoAIleague attribution */}
      <TrustFooter variant={variant} />
      <div className="h-6" />
    </div>
  );
}

/**
 * Paired primary submit button. Use inside <FormShell actions={...} />
 * to keep primary CTAs consistent across every form.
 */
export function FormPrimaryButton(props: {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  testId?: string;
  icon?: ReactNode;
  className?: string;
}): JSX.Element {
  const {
    loading,
    loadingLabel = "Submitting…",
    children,
    disabled,
    type = "submit",
    onClick,
    testId = "form-primary-button",
    icon,
    className,
  } = props;

  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 min-h-[42px]",
        "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground font-medium",
        "shadow-sm hover:shadow hover:brightness-[1.04] active:scale-[0.99]",
        "transition disabled:opacity-60 disabled:cursor-not-allowed",
        "w-full sm:w-auto sm:min-w-[180px]",
        className,
      )}
    >
      {loading ? (
        <>
          <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

export default FormShell;
