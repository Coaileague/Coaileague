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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle } from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";

interface TermsDialogProps {
  open: boolean;
  onAccept: (initials: string) => void;
  onDecline: () => void;
  userName?: string;
}

export function TermsDialog({ open, onAccept, onDecline, userName }: TermsDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [initials, setInitials] = useState("");

  const handleAccept = () => {
    if (agreed && initials.trim().length >= 2) {
      onAccept(initials.toUpperCase());
    }
  };

  // Suggest initials from user name
  const suggestedInitials = userName 
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3)
    : '';

  return (
    <Dialog open={open} modal={true}>
      <DialogContent 
        className="max-w-3xl max-h-[95vh] flex flex-col overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="terms-dialog"
      >
        {/* Header with AutoForce Branding */}
        <DialogHeader className="border-b border-slate-600 pb-4">
          <div className="flex items-center gap-4">
            {/* AutoForce Logo */}
            <div className="flex items-center justify-center">
              <AutoForceLogo size="md" variant="icon" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-black text-white">
                AutoForce™ Support Terms
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-300 mt-1 font-semibold">
                Legal Agreement Required for Support Access
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 text-sm text-slate-200 py-2">
            <section className="bg-gradient-to-r from-blue-600 to-slate-700 border-l-4 border-white p-4 rounded shadow-md">
              <p className="font-semibold text-white">
                AUTOFORCE™ SUPPORT CHAT - TERMS & CONDITIONS<br/>
                OPERATOR: AutoForce™ Support<br/><br/>
                BY ACCEPTING, YOU AGREE TO THE FOLLOWING LEGALLY BINDING TERMS
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">1. SERVICE DESCRIPTION & LIMITATIONS</h3>
              <p className="mb-2">
                This AutoForce™ Support Chat provides real-time customer support, technical assistance, and general inquiries. 
                This is a professional business communication channel operated by AutoForce™.
              </p>
              <p className="font-semibold text-amber-400 mb-2">IMPORTANT:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>We do NOT guarantee every issue will be resolved immediately or at all</li>
                <li>Some issues may require platform upgrades, updates, or extended development time</li>
                <li>Resolution may require third-party service changes or system downtime for maintenance</li>
                <li>Technical resources may be beyond current capabilities</li>
                <li>Resolution timeframes and outcomes are NOT guaranteed</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">2. USER CONDUCT</h3>
              <p className="mb-2">You agree to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Communicate professionally and respectfully at all times</li>
                <li>NOT make false claims of discrimination, harassment, or misconduct</li>
                <li>Respect support staff, visitors, volunteers, and other users</li>
                <li>Accept that staff behavior is professional - perceived rudeness may be due to communication style or urgent priorities</li>
                <li>NOT share sensitive passwords or payment details in chat</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">3. COMPLETE DISCLAIMER OF WARRANTIES</h3>
              <p className="mb-2">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES. AUTOFORCE™ AND ALL AFFILIATED PARTIES MAKE NO GUARANTEES REGARDING:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Chat availability, uptime, or accessibility</li>
                <li>Response times or issue resolution</li>
                <li>Data transmission security over WebSocket connections</li>
                <li>Platform stability during updates or maintenance</li>
                <li>Compatibility with external services or hosting providers</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">4. COMPREHENSIVE LIMITATION OF LIABILITY</h3>
              <p className="mb-2 font-semibold">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU AGREE THAT AUTOFORCE™, DRILL CONSULTING 360, AND ALL OF OUR:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Staff members and support representatives</li>
                <li>Ownership, officers, directors, and managers</li>
                <li>Agents, contractors, and representatives</li>
                <li>Volunteers, visitors, and affiliates</li>
              </ul>
              <p className="mb-2 font-semibold">SHALL NOT BE LIABLE FOR:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Any direct, indirect, incidental, or consequential damages</li>
                <li>Claims of discrimination, rudeness, or unprofessional conduct</li>
                <li>Service interruptions, downtime, or technical failures</li>
                <li>Issues from platform updates, upgrades, or maintenance</li>
                <li>WebSocket connection failures or hosting provider issues</li>
                <li>Any damages exceeding $100 USD in total</li>
              </ul>
              <p className="mt-2 font-bold text-red-400">
                YOU EXPRESSLY WAIVE ALL RIGHTS TO SUE OR BRING LEGAL ACTION against any of the above parties.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">5. DATA COLLECTION & PRIVACY</h3>
              <p className="mb-2">We collect and store for 7 years minimum:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Chat messages, timestamps, and conversation history</li>
                <li>User identification (email, ticket, session ID)</li>
                <li>IP address, browser information, device data</li>
                <li>Agreement acceptance signature and timestamp</li>
              </ul>
              <p className="mt-2">
                This data is stored in our compliance vault for legal evidence, dispute resolution, quality assurance, and regulatory compliance.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">6. CONSENT TO MONITORING</h3>
              <p>
                You acknowledge and consent to all chat conversations being recorded and monitored. Support staff may review chat history for training. 
                Platform administrators access chats for compliance audits. Law enforcement access if legally required.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base text-white mb-2">7. TAXES & PRICING</h3>
              <p className="mb-2 font-semibold text-amber-400">
                ALL PRICES EXCLUDE TAXES. YOU ARE RESPONSIBLE FOR ALL APPLICABLE TAXES.
              </p>
              <p className="mb-2">
                All subscription prices, fees, and charges displayed on AutoForce™ are exclusive of any and all taxes, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Sales tax, use tax, value-added tax (VAT), goods and services tax (GST)</li>
                <li>Withholding tax, excise tax, or any other tax imposed by any governmental authority</li>
                <li>Federal, state, provincial, local, or municipal taxes</li>
              </ul>
              <p className="mb-2 font-semibold">
                YOU ARE SOLELY RESPONSIBLE FOR:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Determining whether any taxes apply to your subscription</li>
                <li>Calculating, collecting, reporting, and remitting any applicable taxes to the appropriate tax authorities</li>
                <li>Consulting with your own tax professionals regarding your tax obligations</li>
              </ul>
              <p className="font-bold text-red-400">
                AutoForce™ does NOT collect, calculate, report, or remit any taxes on your behalf. We are NOT responsible for your tax compliance in any jurisdiction.
              </p>
            </section>

            <section className="bg-gradient-to-r from-amber-600 to-orange-600 border-l-4 border-white p-3 rounded shadow-md">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">BINDING LEGAL AGREEMENT</p>
                  <p className="text-xs text-amber-50 mt-1">
                    By clicking "Accept", you create a legally binding agreement. Your acceptance is recorded with timestamp and IP address.
                    Your SOLE REMEDY is to DISCONTINUE USE of this service.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>

        {/* E-Signature Section */}
        <div className="border-t border-slate-300 pt-4 space-y-3">
          <div className="bg-gradient-to-r from-blue-600 to-slate-700 rounded-md border border-blue-400 p-4 shadow-md">
            <Label htmlFor="initials" className="text-sm font-bold text-white mb-2 block">
              Electronic Signature (Your Initials) *
            </Label>
            <Input
              id="initials"
              type="text"
              placeholder={suggestedInitials || "e.g., JD"}
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 4))}
              maxLength={4}
              className="h-11 text-lg font-bold text-center tracking-widest uppercase bg-white text-slate-900"
              data-testid="input-initials"
            />
            <p className="text-xs text-blue-100 mt-2">
              By providing your initials, you electronically sign this agreement. 
              This signature will be legally binding and saved for audit compliance.
            </p>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-600 to-slate-700 rounded-md border border-blue-400 shadow-md">
            <Checkbox
              id="terms-agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
              className="mt-1 border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-600"
              data-testid="checkbox-agree-terms"
            />
            <label
              htmlFor="terms-agree"
              className="text-sm font-medium text-white cursor-pointer select-none flex-1"
            >
              I have read and agree to the Terms of Service and Privacy Agreement. I understand that
              my acceptance and e-signature will be saved with my support ticket for legal compliance.
            </label>
          </div>
        </div>

        {/* Footer with Required Buttons */}
        <DialogFooter className="gap-2 border-t border-slate-600 pt-4">
          <Button
            variant="outline"
            onClick={onDecline}
            className="border-slate-500 text-slate-300 hover:bg-slate-700 hover:text-white"
            data-testid="button-decline-terms"
          >
            Decline & Exit
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!agreed || initials.trim().length < 2}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50"
            data-testid="button-accept-terms"
          >
            {!initials.trim() ? "Enter Initials to Accept" : !agreed ? "Check Agreement Box" : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
