import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ShieldAlert, FileCheck, AlertTriangle, CheckCircle2, Loader2,
  ExternalLink, PenLine, Calendar, User
} from "lucide-react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';

const TOS_VERSION = "2026-03-01";

interface TOSAgreementStepProps {
  agreementType: "org_registration" | "user_onboarding";
  email: string;
  orgName?: string;
  inviteToken?: string;
  onComplete: (agreementId: string) => void;
}

export function TOSAgreementStep({
  agreementType,
  email,
  orgName,
  inviteToken,
  onComplete,
}: TOSAgreementStepProps) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [initials, setInitials] = useState("");
  const [hasScrolled, setHasScrolled] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToAI, setAgreedToAI] = useState(false);
  const [agreedToHuman, setAgreedToHuman] = useState(false);
  const [agreedToPayroll, setAgreedToPayroll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [agreementId, setAgreementId] = useState<string | null>(null);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const allChecked = agreedToTerms && agreedToAI && agreedToHuman && agreedToPayroll;
  const canSubmit = allChecked && fullName.trim().length >= 2 && initials.trim().length >= 1 && hasScrolled;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setHasScrolled(true);
    }
  }

  async function handleSign() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await apiRequest("POST", "/api/tos/sign", {
        email,
        fullName: fullName.trim(),
        initials: initials.trim().toUpperCase(),
        agreementType,
        orgName: orgName || undefined,
        inviteToken: inviteToken || undefined,
      });
      const data = await result.json();
      if (!data.agreementId) throw new Error("No agreement ID returned");
      setAgreementId(data.agreementId);
      setSigned(true);
      onComplete(data.agreementId);
    } catch (err: any) {
      toast({
        title: "Signature failed",
        description: "Unable to record your agreement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (signed && agreementId) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center" data-testid="tos-signed-confirmation">
        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Agreement Recorded</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your signed agreement has been permanently saved to your document safe. Agreement ID:
          </p>
          <code className="text-xs bg-muted px-2 py-1 rounded-md font-mono">{agreementId}</code>
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          This record is protected and cannot be deleted. ${PLATFORM_NAME} support staff can view, download, or print it upon request.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="tos-agreement-step">
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            AI Limitation Disclaimer — Required Reading
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {PLATFORM_NAME} and Trinity AI automate workforce management tasks including scheduling, payroll, invoicing, and compliance. 
            <strong> AI systems can and do make mistakes.</strong> Human oversight of all AI-generated output is always required, 
            even when Trinity AI is operating at high confidence. {PLATFORM_NAME} is not a licensed financial institution, CPA firm, 
            tax preparer, payroll provider, or legal advisor. The organization and its designated representatives are solely 
            responsible for verifying accuracy of all outputs before acting on them.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <FileCheck className="h-4 w-4" />
            Terms of Service &amp; AI Use Agreement
          </Label>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">Version {TOS_VERSION}</Badge>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
              data-testid="link-full-terms"
            >
              Full Terms <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <ScrollArea
          className="h-56 rounded-md border bg-muted/30 text-xs text-foreground/90 leading-relaxed"
          onScrollCapture={handleScroll}
          data-testid="tos-scroll-area"
        >
          <div className="p-4 space-y-4">
            <section>
              <h4 className="font-semibold mb-1">1. Platform Nature and Limitations</h4>
              <p>
                {PLATFORM_NAME} is an AI-powered workforce management platform ("Service") provided by {PLATFORM_NAME}, Inc.
                The Service uses artificial intelligence and automation technologies, branded as "Trinity AI," to assist 
                with scheduling, payroll calculations, invoice generation, compliance monitoring, and related workforce 
                management tasks. The Service is middleware only — it is not a licensed payroll processor, financial institution, 
                bank, CPA firm, tax preparer, employment attorney, or HR consultant.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">2. AI Limitations and Human Oversight Requirement</h4>
              <p>
                Artificial intelligence systems, including Trinity AI, can produce incorrect, incomplete, or misleading 
                outputs. AI confidence scores — even high-confidence scores — do not guarantee accuracy. 
                <strong> You are required to maintain human oversight of all AI-generated content, calculations, schedules, 
                invoices, payroll runs, tax estimates, and recommendations at all times.</strong> No AI output should be 
                acted upon, submitted to a government agency, or used in legal or financial proceedings without independent 
                human review and verification by a qualified professional.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">3. Payroll and Tax Disclaimer</h4>
              <p>
                Payroll calculations produced by the Service are estimates only. Tax withholding amounts, deductions, 
                employer contributions, and net pay figures may be incorrect. Employees must review every paycheck, 
                pay stub, and tax form generated by the Service. Organizations must have a qualified payroll specialist 
                or CPA review all payroll runs before funds are disbursed. {PLATFORM_NAME} is not responsible for incorrect 
                tax withholdings, underpayments, penalties, or IRS assessments arising from AI-generated payroll data.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">4. Invoice and Billing Disclaimer</h4>
              <p>
                Invoices, billing statements, and financial reports generated by the Service are AI-assisted estimates. 
                You are responsible for verifying all billed amounts, labor hours, rates, and totals before issuing them 
                to clients or submitting them for payment. {PLATFORM_NAME} bears no liability for billing disputes, lost revenue, 
                or client relationship issues arising from inaccurate AI-generated invoices.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">5. Limitation of Liability</h4>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, COAILEAGUE, ITS OFFICERS, DIRECTORS, EMPLOYEES, 
                AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR 
                PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOST PROFITS, LOST DATA, TAX PENALTIES, PAYROLL ERRORS, 
                OR BUSINESS INTERRUPTION, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE OR RELIANCE ON 
                ANY AI-GENERATED OUTPUT, EVEN IF COAILEAGUE HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">6. Document Retention and Protected Records</h4>
              <p>
                This signed agreement is permanently stored in your secure document safe. It cannot be altered or deleted 
                by any user, administrator, or organization. ${PLATFORM_NAME} support staff may view, download, or print this 
                record for compliance and legal purposes. Retention period: 7 years minimum.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">7. Technology Providers</h4>
              <p>
                The Service relies on third-party technology infrastructure including cloud computing, AI models, and 
                payment processors. {PLATFORM_NAME} does not disclose specific technology provider relationships as proprietary 
                business information. All AI outputs are presented under ${PLATFORM_NAME} and Trinity AI branding and are subject 
                to the limitations described in this Agreement.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">8. Governing Law</h4>
              <p>
                This Agreement is governed by the laws of the State of Texas, without regard to conflict of law principles. 
                Any disputes shall be resolved through binding arbitration in Harris County, Texas. You waive any right 
                to a jury trial in connection with any dispute arising under this Agreement.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">9. Acceptance</h4>
              <p>
                By signing below, you confirm that you have read, understood, and agree to this Agreement in its entirety. 
                You acknowledge that AI systems can make mistakes and that human oversight is your responsibility. 
                Your signature constitutes a legally binding electronic signature under the Electronic Signatures in 
                Global and National Commerce Act (E-SIGN Act).
              </p>
            </section>
          </div>
        </ScrollArea>

        {!hasScrolled && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Please scroll through and read the entire agreement before signing.
          </p>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Required Acknowledgments</p>

        {[
          {
            id: "terms",
            state: agreedToTerms,
            set: setAgreedToTerms,
            label: "I have read and agree to the Terms of Service and AI Use Agreement.",
          },
          {
            id: "ai",
            state: agreedToAI,
            set: setAgreedToAI,
            label: "I understand that AI systems, including Trinity AI, can make mistakes and may produce incorrect outputs.",
          },
          {
            id: "human",
            state: agreedToHuman,
            set: setAgreedToHuman,
            label: `I agree to maintain human oversight of all AI-generated content. {PLATFORM_NAME} is not liable for decisions made based on AI output without human verification.`,
          },
          {
            id: "payroll",
            state: agreedToPayroll,
            set: setAgreedToPayroll,
            label: "I understand that payroll calculations, tax withholdings, and invoices require independent human review before use. I am responsible for verifying accuracy.",
          },
        ].map(({ id, state, set, label }) => (
          <div key={id} className="flex items-start gap-3">
            <Checkbox
              id={`tos-check-${id}`}
              checked={state}
              onCheckedChange={(v) => set(!!v)}
              disabled={!hasScrolled}
              data-testid={`checkbox-tos-${id}`}
            />
            <label
              htmlFor={`tos-check-${id}`}
              className={`text-xs leading-relaxed cursor-pointer ${!hasScrolled ? "text-muted-foreground" : "text-foreground"}`}
            >
              {label}
            </label>
          </div>
        ))}
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tos-full-name" className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5" />
            Full Legal Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tos-full-name"
            placeholder="Jane A. Smith"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={!allChecked}
            data-testid="input-tos-full-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tos-initials" className="flex items-center gap-1.5 text-sm">
            <PenLine className="h-3.5 w-3.5" />
            Initials <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tos-initials"
            placeholder="JAS"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 5))}
            disabled={!allChecked}
            maxLength={5}
            className="font-mono tracking-widest"
            data-testid="input-tos-initials"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5" />
            Date of Agreement
          </Label>
          <Input value={today} readOnly className="bg-muted/50 text-muted-foreground" data-testid="input-tos-date" />
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Electronic Signature Notice:</strong> By clicking "Sign &amp; Agree` below, your typed name and initials 
          constitute a legally binding electronic signature under the E-SIGN Act (15 U.S.C. § 7001). This agreement is 
          permanently recorded, tamper-evident, and stored in your protected document safe. It cannot be deleted by 
          you, your organization, or any administrator. Only {PLATFORM_NAME} support may access this record.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Signing as: <strong>{email}</strong></span>
        </div>
        <Button
          onClick={handleSign}
          disabled={!canSubmit || submitting}
          className="gap-2 min-w-[160px]"
          data-testid="button-tos-sign"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Recording...
            </>
          ) : (
            <>
              <FileCheck className="h-4 w-4" />
              Sign &amp; Agree
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
