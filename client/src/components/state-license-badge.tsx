/**
 * State License Badge Component
 * Displays organization's state regulatory license for compliance
 * Required by law to be visible on all marketing materials, emails, and dashboards
 *
 * Texas PSB License Format:
 * - C prefix = Armed security (e.g., C11608501)
 * - B prefix = Unarmed security (e.g., B12345678)
 */

import { Shield, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// State regulatory agency links for license verification
const STATE_VERIFICATION_URLS: Record<string, string> = {
  TX: "https://tops.portal.texas.gov/psp-self-service/",
  CA: "https://www.bsis.ca.gov/forms_pubs/licensee_search.shtml",
  FL: "https://www.fdacs.gov/Business-Services/Private-Investigation-Security-and-Repossession/Licensee-Search",
  NY: "https://appext20.dos.ny.gov/lcns_public/chk_load",
  AZ: "https://www.azdps.gov/services/public/license-search",
  NV: "https://nevadapilb.glsuite.us/Clients/NVPILB/Public/LicenseeSearch.aspx",
  GA: "https://sos.ga.gov/PLB/pls/broker_inquiry.inquiry_form",
  IL: "https://www.idfpr.com/LicenseLookUp/LicenseLookup.asp",
  PA: "https://www.pals.pa.gov/",
  OH: "https://elicense.ohio.gov/oh_verifylicense",
};

// State agency names
const STATE_AGENCY_NAMES: Record<string, string> = {
  TX: "Texas DPS Private Security Bureau",
  CA: "California BSIS",
  FL: "Florida FDACS",
  NY: "New York DOS",
  AZ: "Arizona DPS",
  NV: "Nevada PILB",
  GA: "Georgia Board of Private Investigator",
  IL: "Illinois IDFPR",
  PA: "Pennsylvania PSP",
  OH: "Ohio DPS",
};

interface StateLicenseBadgeProps {
  licenseNumber?: string | null;
  licenseState?: string | null;
  licenseExpiry?: string | Date | null;
  isVerified?: boolean;
  verifiedAt?: string | Date | null;
  variant?: "compact" | "full" | "inline" | "footer";
  showVerifyLink?: boolean;
  className?: string;
}

export function StateLicenseBadge({
  licenseNumber,
  licenseState,
  licenseExpiry,
  isVerified = false,
  verifiedAt,
  variant = "compact",
  showVerifyLink = false,
  className,
}: StateLicenseBadgeProps) {
  // Don't render if no license
  if (!licenseNumber || !licenseState) {
    return null;
  }

  // Check if license is expired
  const expiryDate = licenseExpiry ? new Date(licenseExpiry) : null;
  const isExpired = expiryDate ? expiryDate < new Date() : false;
  const isExpiringSoon = expiryDate
    ? expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && !isExpired
    : false;

  // Determine license type from prefix (Texas-specific)
  const licenseType = licenseNumber.startsWith("C")
    ? "Armed"
    : licenseNumber.startsWith("B")
      ? "Unarmed"
      : "Security";

  const verificationUrl = STATE_VERIFICATION_URLS[licenseState];
  const agencyName = STATE_AGENCY_NAMES[licenseState] || `${licenseState} Regulatory Agency`;

  // Inline variant (for email footers, headers)
  if (variant === "inline" || variant === "footer") {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {licenseState} License #{licenseNumber}
        {isVerified && " (Verified)"}
      </span>
    );
  }

  // Compact variant (badge only)
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={isExpired ? "destructive" : isVerified ? "default" : "secondary"}
              className={cn(
                "gap-1 cursor-help",
                isVerified && !isExpired && "bg-green-600",
                isExpiringSoon && "bg-yellow-600",
                className
              )}
            >
              <Shield className="h-3 w-3" />
              {licenseState} #{licenseNumber}
              {isVerified && <CheckCircle2 className="h-3 w-3" />}
              {isExpired && <AlertTriangle className="h-3 w-3" />}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">{licenseType} Security License</p>
              <p className="text-xs">{agencyName}</p>
              {expiryDate && (
                <p className={cn(
                  "text-xs",
                  isExpired && "text-red-400",
                  isExpiringSoon && "text-yellow-400"
                )}>
                  {isExpired ? "Expired: " : "Expires: "}
                  {expiryDate.toLocaleDateString()}
                </p>
              )}
              {isVerified && verifiedAt && (
                <p className="text-xs text-green-400">
                  Verified by Trinity AI on {new Date(verifiedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full variant (card-like display)
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border bg-card",
      isExpired && "border-red-500/50 bg-red-500/5",
      isExpiringSoon && "border-yellow-500/50 bg-yellow-500/5",
      isVerified && !isExpired && !isExpiringSoon && "border-green-500/50 bg-green-500/5",
      className
    )}>
      <div className={cn(
        "flex items-center justify-center h-10 w-10 rounded-full",
        isExpired && "bg-red-500/20 text-red-500",
        isExpiringSoon && "bg-yellow-500/20 text-yellow-500",
        isVerified && !isExpired && !isExpiringSoon && "bg-green-500/20 text-green-500",
        !isVerified && !isExpired && !isExpiringSoon && "bg-muted text-muted-foreground"
      )}>
        <Shield className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{licenseType} Security License</span>
          {isVerified && (
            <Badge variant="default" className="bg-green-600 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
          {isExpired && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Expired
            </Badge>
          )}
          {isExpiringSoon && !isExpired && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
              Expiring Soon
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {agencyName} • #{licenseNumber}
        </p>
        {expiryDate && (
          <p className={cn(
            "text-xs",
            isExpired && "text-red-500",
            isExpiringSoon && "text-yellow-500",
            !isExpired && !isExpiringSoon && "text-muted-foreground"
          )}>
            {isExpired ? "Expired" : "Expires"}: {expiryDate.toLocaleDateString()}
          </p>
        )}
      </div>

      {showVerifyLink && verificationUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => window.open(verificationUrl, "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          Verify
        </Button>
      )}
    </div>
  );
}

/**
 * Hook to get workspace license data
 */
export function useWorkspaceLicense() {
  // This would typically come from a query to /api/workspace or context
  // For now, return a placeholder that components can override
  return {
    licenseNumber: null as string | null,
    licenseState: null as string | null,
    licenseExpiry: null as string | null,
    isVerified: false,
    verifiedAt: null as string | null,
  };
}
