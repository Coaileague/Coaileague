/**
 * CoAIleague Platform Liability Disclaimers
 * ==========================================
 * All 6 required disclaimers per legal framework.
 * Use the appropriate component on each screen type.
 *
 * Disclaimer 1 — AI Assistance General    → <AIGeneralDisclaimer /> (footer of every page)
 * Disclaimer 2 — Legal Documents          → <LegalDocumentDisclaimer /> (handbook/contract editors)
 * Disclaimer 3 — Emergency Features       → <EmergencyDisclaimer /> (panic/on-call/emergency settings)
 * Disclaimer 4 — Report Assistance        → <ReportDisclaimer /> (report creation/review screens)
 * Disclaimer 5 — Supervisory Responsibility → <SupervisoryDisclaimer /> (owner dashboard/settings)
 * Disclaimer 6 — Bilingual Translation    → <TranslationDisclaimer /> (any translated content)
 */

import { cn } from "@/lib/utils";
import { AlertTriangle, Info, Shield, FileText, Users, Globe } from "lucide-react";

interface DisclaimerProps {
  className?: string;
  compact?: boolean;
}

export function AIGeneralDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 text-xs text-muted-foreground",
        compact ? "items-start" : "items-start border-t border-border pt-3 mt-3",
        className
      )}
      data-testid="disclaimer-ai-general"
    >
      <Info className="w-3 h-3 mt-0.5 shrink-0" />
      <p>
        This platform and Trinity AI provide operational assistance tools. Trinity is an artificial
        intelligence and may make errors. All AI-generated content should be reviewed by qualified
        humans before action is taken.
      </p>
    </div>
  );
}

export function LegalDocumentDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs",
        className
      )}
      data-testid="disclaimer-legal-document"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Attorney Review Required — </span>
        Trinity&apos;s legal document assistance identifies potential issues as an AI tool only.
        This platform does not provide legal advice. All handbooks, contracts, and compliance documents
        must be reviewed by a licensed attorney before use.
      </p>
    </div>
  );
}

export function EmergencyDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs",
        className
      )}
      data-testid="disclaimer-emergency"
    >
      <Shield className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Emergency Response Responsibility — </span>
        CoAIleague&apos;s emergency notification system contacts your designated supervisors and
        management chain when an officer activates the panic button.{" "}
        <span className="font-semibold text-foreground">
          CoAIleague does not contact 911 or emergency services.
        </span>{" "}
        Emergency response is the sole responsibility of your organization&apos;s supervisory
        personnel. Officers should always call 911 directly in life-threatening situations.
        CoAIleague expressly disclaims liability for emergency response outcomes. Organizations
        are required to maintain adequate human supervision at all times per applicable state law.
      </p>
    </div>
  );
}

export function ReportDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs",
        className
      )}
      data-testid="disclaimer-report"
    >
      <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Report Integrity — </span>
        Trinity applies mechanical grammar and spelling corrections only. The substance of all
        incident reports is the sole responsibility of the reporting officer. Report content is
        preserved exactly as submitted. CoAIleague does not modify the factual content of any
        official report.
      </p>
    </div>
  );
}

export function SupervisoryDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs",
        className
      )}
      data-testid="disclaimer-supervisory"
    >
      <Users className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Human Supervision Required — </span>
        CoAIleague and Trinity AI assist with operational management but do not replace human
        supervisory responsibility. Organizations must maintain adequate licensed supervision as
        required by Texas DPS and applicable state law. Trinity is not a licensed security supervisor.
      </p>
    </div>
  );
}

export function TranslationDisclaimer({ className, compact }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-xs",
        className
      )}
      data-testid="disclaimer-translation"
    >
      <Globe className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
      <p className="text-muted-foreground">
        Translation is AI-generated for reference only. Original text is the official record.
        Request certified human translation for legal proceedings.
      </p>
    </div>
  );
}
