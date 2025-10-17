import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Shield } from "lucide-react";

interface TermsDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TermsDialog({ open, onAccept, onDecline }: TermsDialogProps) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    if (agreed) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDecline()}>
      <DialogContent className="max-w-2xl max-h-[90vh]" data-testid="terms-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-slate-700">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-900">
                Terms of Service & Privacy Agreement
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mt-1">
                Please review and accept our terms before accessing support
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[400px] w-full rounded-md border border-slate-300 p-4 bg-slate-50">
          <div className="space-y-4 text-sm text-slate-700">
            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">1. Service Agreement</h3>
              <p>
                By accessing the WorkforceOS™ HelpDesk support chat, you acknowledge and agree to these
                terms. This support service is provided "as is" for assistance with platform-related
                inquiries and technical support.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">2. Privacy & Data Collection</h3>
              <p className="mb-2">
                We collect and process the following information during your support session:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Chat messages and conversation history</li>
                <li>Email address and ticket information</li>
                <li>Account details you voluntarily provide</li>
                <li>Technical diagnostics (IP address, browser info)</li>
                <li>Support session metadata (timestamps, queue position)</li>
              </ul>
              <p className="mt-2">
                All data is encrypted in transit and stored securely according to industry best practices.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">3. Acceptable Use</h3>
              <p className="mb-2">You agree NOT to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use abusive, threatening, or inappropriate language</li>
                <li>Share sensitive credentials or payment information in chat</li>
                <li>Spam or flood the support system</li>
                <li>Impersonate others or provide false information</li>
                <li>Attempt to exploit or hack the platform</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">4. Limitation of Liability</h3>
              <p>
                WorkforceOS™ and its support staff provide assistance on a best-effort basis. We are
                not liable for any damages, data loss, or business interruption resulting from support
                interactions or advice provided. All recommendations should be reviewed by your IT team
                before implementation in production environments.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">5. Recording & Quality Assurance</h3>
              <p>
                Support conversations may be recorded, monitored, and reviewed for quality assurance,
                training purposes, and compliance auditing. By proceeding, you consent to this monitoring.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">6. AI-Powered Assistance</h3>
              <p>
                When HelpOS™ AI is enabled (client-pays-all model), your messages may be processed by
                third-party AI services. AI responses are supplementary and should not replace professional
                judgment for critical decisions.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-slate-900 mb-2">7. Termination</h3>
              <p>
                We reserve the right to terminate support access for violations of these terms, abusive
                behavior, or suspicious activity. Repeated violations may result in permanent account
                suspension.
              </p>
            </section>

            <section className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">Important Legal Notice</p>
                  <p className="text-xs text-amber-800 mt-1">
                    These terms constitute a binding legal agreement. If you do not agree, please decline
                    and contact us via alternative support channels at support@workforceos.com
                  </p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3 p-4 bg-slate-100 rounded-md border border-slate-300">
          <Checkbox
            id="terms-agree"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked as boolean)}
            data-testid="checkbox-agree-terms"
          />
          <label
            htmlFor="terms-agree"
            className="text-sm font-medium text-slate-900 cursor-pointer select-none"
          >
            I have read and agree to the Terms of Service and Privacy Agreement
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onDecline}
            className="border-slate-400"
            data-testid="button-decline-terms"
          >
            Decline
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!agreed}
            className="bg-gradient-to-r from-blue-600 to-slate-700 text-white font-semibold"
            data-testid="button-accept-terms"
          >
            Accept & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
