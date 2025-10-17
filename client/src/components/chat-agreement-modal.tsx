import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { Shield, FileText, AlertCircle } from "lucide-react";

interface ChatAgreementModalProps {
  onAccept: (fullName: string) => void;
  isSubmitting?: boolean;
  roomName?: string;
}

export function ChatAgreementModal({ onAccept, isSubmitting = false, roomName = "Support Chat" }: ChatAgreementModalProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [fullName, setFullName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (agreedToTerms && fullName.trim()) {
      onAccept(fullName.trim());
    }
  };

  const agreementText = `
WORKFORCE OS SUPPORT CHAT - TERMS & CONDITIONS

LAST UPDATED: October 17, 2025
VERSION: 1.0
OPERATOR: Drill Consulting 360 (DC360)

BY ACCESSING THIS SUPPORT CHAT, YOU AGREE TO THE FOLLOWING TERMS:

1. ACCEPTANCE OF TERMS
By clicking "I Agree" and entering this support chat, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions. If you do not agree, you must exit immediately.

2. SERVICE DESCRIPTION & LIMITATIONS
This WorkforceOS Support Chat ("Service") provides real-time customer support, technical assistance, and general inquiries. This is a professional business communication channel operated by Drill Consulting 360.

IMPORTANT: We do NOT guarantee that every issue will be resolved immediately or at all. Some issues may require:
• Platform upgrades or updates
• Extended development time
• Third-party service changes
• System downtime for maintenance
• Technical resources beyond current capabilities

Resolution timeframes and outcomes are NOT guaranteed and are subject to technical feasibility, resource availability, and business priorities.

3. USER RESPONSIBILITIES & CONDUCT
You agree to:
• Provide accurate and truthful information
• Communicate professionally and respectfully at all times
• Not make false claims of discrimination, harassment, or misconduct
• Not share sensitive passwords or payment card details in chat
• Not use the chat for illegal, fraudulent, or abusive purposes
• Respect support staff, visitors, volunteers, and other users
• Follow all instructions provided by support staff
• Accept that staff behavior is professional and any perceived rudeness may be due to communication style differences or urgent priorities

4. COMPLETE DISCLAIMER OF WARRANTIES
THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WORKFORCEOS, DRILL CONSULTING 360, AND ALL AFFILIATED PARTIES MAKE NO GUARANTEES REGARDING:
• Chat availability, uptime, or accessibility
• Response times, resolution times, or issue resolution
• Accuracy, completeness, or reliability of information provided
• Data transmission security over WebSocket connections
• Platform stability during updates or maintenance
• Compatibility with external services or hosting providers

5. COMPREHENSIVE LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU AGREE THAT WORKFORCEOS, DRILL CONSULTING 360, AND ALL OF OUR:
• Staff members and support representatives
• Ownership, officers, directors, and managers  
• Agents, contractors, and representatives
• Volunteers, visitors, and affiliates
• Third-party service providers

SHALL NOT BE LIABLE FOR ANY CLAIMS, DAMAGES, OR LOSSES INCLUDING:
• Any direct, indirect, incidental, or consequential damages
• Claims of discrimination, rudeness, or unprofessional conduct
• Loss of data, profits, revenue, or business opportunities
• Unauthorized access to your chat sessions or data
• Service interruptions, downtime, or technical failures
• Decisions made based on chat guidance or recommendations
• Issues arising from platform updates, upgrades, or maintenance
• WebSocket connection failures or hosting provider issues
• Any damages exceeding $100 USD in total

YOU EXPRESSLY WAIVE ALL RIGHTS TO SUE OR BRING LEGAL ACTION against any of the above parties for matters related to this Service.

YOUR SOLE REMEDY IS TO DISCONTINUE USE OF THIS SERVICE.

6. DATA COLLECTION & PRIVACY
We collect and store:
• Chat messages and timestamps
• User identification (email, ticket number, session ID)
• IP address, browser information, and device data
• Agreement acceptance signature and timestamp

This data is stored in our compliance vault for:
• Legal evidence and dispute resolution
• Quality assurance and staff training
• Regulatory compliance requirements
• Security and fraud prevention

Your data will be retained for 7 years minimum per legal requirements.

7. CONSENT TO MONITORING
You acknowledge and consent to:
• All chat conversations being recorded and monitored
• Support staff reviewing chat history for training purposes
• Platform administrators accessing chats for compliance audits
• Law enforcement access if legally required
• Use of anonymized chat data for service improvements

8. NO PROFESSIONAL ADVICE
Support chat guidance is for informational purposes only and does not constitute:
• Legal advice
• Financial advice
• Medical advice
• Professional consulting services

Consult qualified professionals for specialized advice.

9. TICKET VERIFICATION & ACCESS
• Access is granted based on verified ticket numbers
• Sessions may expire after 24-48 hours
• Support staff may terminate access for policy violations
• You are responsible for maintaining ticket confidentiality

10. INTELLECTUAL PROPERTY
All chat content, software, and documentation are proprietary to WorkforceOS. You may not reproduce, distribute, or create derivative works without written permission.

11. TERMINATION
We reserve the right to:
• Terminate chat access immediately without notice
• Block users for abusive behavior
• Suspend service for technical maintenance
• Modify or discontinue the service at any time

12. CHANGES TO TERMS
These terms may be updated at any time. Continued use after changes constitutes acceptance. You will be notified of material changes via email or platform notices.

13. GOVERNING LAW
These Terms are governed by the laws of [Your Jurisdiction], without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration.

14. CONTACT INFORMATION
For questions about these Terms:
Email: legal@workforceos.com
Support: support@workforceos.com

15. ENTIRE AGREEMENT
These Terms, along with our Privacy Policy and Service Agreement, constitute the entire agreement between you and WorkforceOS regarding this Service.

BY CLICKING "I AGREE" BELOW, YOU ACKNOWLEDGE THAT:
✓ You have read and understood all terms
✓ You accept these terms without modification
✓ You are legally authorized to enter this agreement
✓ Your electronic signature is legally binding
✓ All chat data will be recorded for compliance

This is a legally binding agreement. Your acceptance creates enforceable obligations.
  `;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/20 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-xl">
              <WorkforceOSLogo className="h-8 w-8" showText={false} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Terms & Conditions</h2>
              <p className="text-sm text-slate-400">Please read and accept to continue to {roomName}</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-6 py-4">
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-400 font-semibold mb-1">Important Legal Document</p>
                  <p className="text-slate-300 text-xs">Please scroll through and read all terms carefully before accepting.</p>
                </div>
              </div>
              
              <pre className="whitespace-pre-wrap text-slate-300 text-sm leading-relaxed font-sans">
                {agreementText}
              </pre>
            </div>
          </ScrollArea>
        </div>

        {/* Footer - Agreement Form */}
        <form onSubmit={handleSubmit} className="p-6 border-t border-white/10 bg-black/30 space-y-4">
          {/* Signature Input */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Electronic Signature (Type your full legal name)
            </Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="bg-white/5 border-white/20 text-white placeholder:text-slate-500"
              required
              disabled={isSubmitting}
              data-testid="input-agreement-signature"
            />
          </div>

          {/* Checkbox Agreement */}
          <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
            <Checkbox
              id="terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
              className="mt-1"
              disabled={isSubmitting}
              data-testid="checkbox-agreement-terms"
            />
            <Label 
              htmlFor="terms" 
              className="text-sm text-slate-300 leading-relaxed cursor-pointer"
            >
              I have read, understood, and agree to be legally bound by the WorkforceOS Support Chat Terms & Conditions. 
              I acknowledge that my chat session will be recorded for compliance and that my electronic signature above is legally binding.
            </Label>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!agreedToTerms || !fullName.trim() || isSubmitting}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-semibold"
              data-testid="button-agreement-submit"
            >
              <Shield className="w-4 h-4 mr-2" />
              {isSubmitting ? "Submitting..." : "I Agree - Enter Chat"}
            </Button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            By clicking "I Agree", you create a legally binding agreement. Your acceptance is recorded with timestamp and IP address.
          </p>
        </form>
      </div>
    </div>
  );
}
