import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { SEO, PAGE_SEO } from '@/components/seo';

const privacyConfig: CanvasPageConfig = {
  id: 'privacy-policy',
  title: 'Privacy Policy',
  category: 'legal',
  // @ts-expect-error — TS migration: fix in refactoring sprint
  variant: 'default',
  showHeader: false,
};

export default function PrivacyPolicy() {
  return (
    <CanvasHubPage config={privacyConfig}>
      <SEO
        title={PAGE_SEO.privacy.title}
        description={PAGE_SEO.privacy.description}
        canonical="https://coaileague.com/privacy"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <UniversalHeader variant="public" />
        
        <main className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Last Updated: March 19, 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-foreground/90 mb-4">
              CoAIleague ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we 
              collect, use, disclose, and safeguard your information when you use our workforce management platform.
            </p>
            <p className="text-foreground/90 mb-4">
              By using CoAIleague, you agree to the collection and use of information in accordance with this policy. 
              If you do not agree with our policies and practices, please do not use our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">2.1 Information You Provide</h3>
            <p className="text-foreground/90 mb-4">We collect information you provide directly:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Account Information:</strong> Name, email address, phone number, company details</li>
              <li><strong>Employee Data:</strong> Names, contact information, roles, wages, schedules, time tracking data</li>
              <li><strong>Financial Information:</strong> Payment method details (processed securely via Stripe), billing addresses</li>
              <li><strong>Communications:</strong> Messages sent through Chatrooms, support tickets, feedback</li>
              <li><strong>Uploaded Files:</strong> Schedules, documents, compliance records</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Information Collected Automatically</h3>
            <p className="text-foreground/90 mb-4">When you access our Service, we automatically collect:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Usage Data:</strong> Pages viewed, features used, time spent, clicks</li>
              <li><strong>Device Information:</strong> IP address, browser type, device type, operating system</li>
              <li><strong>Location Data:</strong> GPS coordinates for clock-in/out verification (with your permission)</li>
              <li><strong>Cookies and Tracking:</strong> Session tokens, preferences, analytics data</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Information from Third Parties</h3>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Data from integrated payroll systems (Gusto, QuickBooks, etc.)</li>
              <li>OAuth authentication data (if using Google, Microsoft, or other SSO)</li>
              <li>Public information from business databases</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-foreground/90 mb-4">We use collected information to:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Provide Services:</strong> Time tracking, scheduling, invoicing, payroll, AI-powered automation</li>
              <li><strong>AI Processing:</strong> Train and improve CoAIleague AI automation and intelligent support algorithms</li>
              <li><strong>Analytics:</strong> Monitor usage patterns, improve features, optimize performance</li>
              <li><strong>Communications:</strong> Send updates, invoices, support responses, security alerts</li>
              <li><strong>Compliance:</strong> Maintain audit trails, generate compliance reports, ensure labor law adherence</li>
              <li><strong>Billing:</strong> Process payments, track usage for metered features, generate invoices</li>
              <li><strong>Security:</strong> Detect fraud, prevent unauthorized access, enforce terms of service</li>
              <li><strong>Legal Obligations:</strong> Respond to legal requests, protect rights and safety</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. CoAIleague AI, Trinity AI, and Intelligent Automation</h2>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.1 How We Use Your Data for AI Processing</h3>
            <p className="text-foreground/90 mb-4">
              Our AI system — branded as Trinity AI — processes your organizational data to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Generate automated schedules based on employee availability, certifications, and preferences</li>
              <li>Prepare payroll calculations, timesheet summaries, and labor cost analyses</li>
              <li>Draft invoices, billing statements, and financial reports for human review</li>
              <li>Provide intelligent support and operational guidance through Trinity AI</li>
              <li>Analyze workforce patterns to improve scheduling accuracy and predict staffing needs</li>
              <li>Monitor compliance status, flag potential violations, and generate audit-ready records</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              We do not use your organizational data to train AI models for other customers. AI processing is performed solely to provide the Service to your organization.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.2 Trinity AI Autonomy Model and Human Oversight</h3>
            <p className="text-foreground/90 mb-4">
              Trinity AI is designed to operate with a high degree of automation across routine workforce management
              tasks. This is described in our Terms of Service as the "high autonomy, 1% human intervention" model:
              Trinity AI handles the majority of routine operations autonomously, while approximately 1% of scenarios
              — particularly those categorized as critical, such as payroll disbursement, invoice issuance, and
              compliance escalations — require explicit human approval before proceeding.
            </p>
            <p className="text-foreground/90 mb-4">
              Critically, <strong>even on scenarios not categorized as critical, the platform always affords the
              tenant a human approval gate or review opportunity at every meaningful step</strong> — from the
              creation of a workflow or document through its final execution. This applies to payroll runs,
              issued invoices, signed documents, scheduled shifts, compliance reports, and every other
              consequential platform output. Whether that review opportunity is exercised is the tenant's
              sole responsibility.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.3 AI Limitations, Errors, and Hallucinations</h3>
            <div className="bg-muted/60 border border-border rounded-md p-5 mb-4">
              <p className="text-foreground/90 text-sm">
                <strong>Notice:</strong> Artificial intelligence systems — including Trinity AI — can produce outputs
                that are factually incorrect, internally inconsistent, outdated, or entirely fabricated. This is
                commonly referred to as an "AI hallucination." AI errors and hallucinations can occur without warning
                even when a system's prior performance has been reliable.
              </p>
            </div>
            <p className="text-foreground/90 mb-4">
              Additionally, Trinity AI and the broader CoAIleague platform are subject to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Model outages and downtime:</strong> Third-party AI model providers may experience outages, maintenance windows, or degraded performance that reduce or eliminate AI functionality.</li>
              <li><strong>Software bugs and defects:</strong> The platform may contain bugs or logic errors that cause incorrect outputs or unexpected behavior. These are addressed through patches and updates.</li>
              <li><strong>Model changes:</strong> Underlying AI models may be updated by their providers, which may change the behavior or quality of AI outputs without advance notice.</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              For this reason, all AI-generated outputs — including schedules, payroll calculations, invoices,
              compliance reports, and any other platform-generated data — must be independently reviewed and verified
              by a qualified human before being acted upon. Trinity AI is a tool to assist human decision-making,
              not to replace it.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.4 Tenant Human Supervisor Requirement</h3>
            <p className="text-foreground/90 mb-4">
              As a condition of using the Service, each tenant (subscribing organization) is required to designate
              at least one qualified human supervisor who is responsible for overseeing AI-generated outputs and
              automated workflows within their CoAIleague account. This requirement is described fully in Section 6
              of the Terms of Service.
            </p>
            <p className="text-foreground/90 mb-4">
              <strong>CoAIleague, Trinity AI, their owners, officers, employees, directors, agents, and
              representatives are not liable for any harm, loss, or legal consequence arising from a tenant's
              failure to maintain a human supervisor or failure to review AI-generated outputs before acting
              on them.</strong> Final authority over every platform output rests with the tenant and their
              designated human supervisor, not with CoAIleague or Trinity AI.
            </p>
            <p className="text-foreground/90 mb-4">
              For the full AI limitation and liability disclosure, including the complete human supervisor
              requirement, please review{" "}
              <a href="/terms#human-supervisor" className="text-primary underline">
                Sections 5 and 6 of our Terms of Service
              </a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Information Sharing and Disclosure</h2>
            <p className="text-foreground/90 mb-4">We share your information only in these circumstances:</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.1 With Your Consent</h3>
            <p className="text-foreground/90 mb-4">
              We share information when you explicitly authorize us to do so (e.g., integrating with third-party payroll systems).
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Service Providers</h3>
            <p className="text-foreground/90 mb-4">We share data with trusted third-party providers who assist in:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Payment Processing:</strong> Stripe (credit card processing)</li>
              <li><strong>Cloud Infrastructure:</strong> Railway, Google Cloud (hosting and storage)</li>
              <li><strong>AI Services:</strong> Third-party AI providers (scheduling automation and support)</li>
              <li><strong>Email Delivery:</strong> Resend (transactional emails)</li>
              <li><strong>Analytics:</strong> Anonymous usage analytics (no personal data shared)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Business Transfers</h3>
            <p className="text-foreground/90 mb-4">
              In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity. 
              We will notify you via email and prominent notice on our Service.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.4 Legal Requirements</h3>
            <p className="text-foreground/90 mb-4">We may disclose information when required by law or to:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Comply with legal obligations, court orders, or subpoenas</li>
              <li>Protect the rights, property, or safety of CoAIleague, our users, or the public</li>
              <li>Investigate fraud, security breaches, or terms of service violations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
            <p className="text-foreground/90 mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Encryption:</strong> AES-256 encryption at rest, TLS 1.2+ for data in transit</li>
              <li><strong>Access Controls:</strong> Role-based access control (RBAC), multi-factor authentication (MFA)</li>
              <li><strong>Infrastructure:</strong> SOC 2 Type 2 certified hosting (Railway/Google Cloud)</li>
              <li><strong>Monitoring:</strong> 24/7 security monitoring, automated threat detection</li>
              <li><strong>Compliance:</strong> ISO 27001 certified infrastructure, GDPR and CCPA compliant</li>
              <li><strong>Backups:</strong> Daily encrypted backups with 30-day retention</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              While we use commercially reasonable efforts to protect your information, no method of transmission over 
              the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-foreground/90 mb-4">We retain your information for as long as:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Your account is active</li>
              <li>Needed to provide you services</li>
              <li>Required for legal, tax, or audit purposes (typically 7 years for payroll records)</li>
              <li>Necessary to resolve disputes or enforce our agreements</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              After account termination, we will delete or anonymize your personal information within 90 days, except where 
              retention is required by law. You may request immediate deletion (see "Your Rights" below).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Your Privacy Rights</h2>
            <p className="text-foreground/90 mb-4">Depending on your location, you may have the following rights:</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">8.1 General Rights (All Users)</h3>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data</li>
              <li><strong>Export:</strong> Receive your data in a portable format (CSV, JSON)</li>
              <li><strong>Object:</strong> Opt out of certain data processing activities</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">8.2 GDPR Rights (EU Users)</h3>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Right to Erasure:</strong> "Right to be forgotten"</li>
              <li><strong>Right to Restriction:</strong> Limit how we process your data</li>
              <li><strong>Right to Object:</strong> Object to automated decision-making</li>
              <li><strong>Data Portability:</strong> Transfer data to another service</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">8.3 CCPA Rights (California Users)</h3>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Know:</strong> What personal information we collect and how it's used</li>
              <li><strong>Delete:</strong> Request deletion of personal information</li>
              <li><strong>Opt-Out:</strong> Opt out of sale of personal information (we do not sell data)</li>
              <li><strong>Non-Discrimination:</strong> Equal service regardless of privacy choices</li>
            </ul>

            <p className="text-foreground/90 mb-4 mt-6">
              To exercise these rights, contact us at privacy@coaileague.com. We will respond within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="text-foreground/90 mb-4">We use the following types of cookies:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Essential Cookies:</strong> Required for authentication, security, and core functionality</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
              <li><strong>Analytics Cookies:</strong> Understand how you use our Service (anonymized)</li>
              <li><strong>Performance Cookies:</strong> Monitor and improve Service performance</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              You can control cookies through your browser settings. Note that disabling essential cookies may impact 
              Service functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p className="text-foreground/90 mb-4">
              CoAIleague is not intended for use by individuals under 18 years of age. We do not knowingly collect 
              personal information from children under 18. If you believe we have collected information from a child 
              under 18, please contact us immediately at privacy@coaileague.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. International Data Transfers</h2>
            <p className="text-foreground/90 mb-4">
              Your information may be transferred to and processed in countries other than your country of residence. 
              These countries may have data protection laws different from your jurisdiction.
            </p>
            <p className="text-foreground/90 mb-4">
              When we transfer data internationally, we ensure appropriate safeguards are in place:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
              <li>Data Processing Agreements with all third-party processors</li>
              <li>Hosting with SOC 2 Type 2 and ISO 27001 certified providers</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-foreground/90 mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. 
              Material changes will be communicated via:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Email notification to your registered address</li>
              <li>Prominent in-app notification</li>
              <li>Updated "Last Updated" date at the top of this page</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              We encourage you to review this Privacy Policy periodically. Continued use after changes indicates acceptance 
              of the updated policy.
            </p>
          </section>

          <section className="mb-8" id="sms-messaging">
            <h2 className="text-2xl font-semibold mb-4">13. SMS Messaging Program</h2>

            <div className="bg-muted/50 border border-border rounded-md p-5 mb-6">
              <p className="font-semibold text-foreground mb-2">CoAIleague SMS Workforce Alerts</p>
              <p className="text-foreground/90 text-sm">
                By providing your mobile phone number and checking the SMS consent box in your employee profile,
                you expressly consent to receive recurring automated text messages (SMS) from CoAIleague on
                behalf of your employer organization for workforce management purposes. Consent is not a condition
                of employment or use of this platform. Message frequency varies. Message and data rates may apply.
                Reply STOP to opt out. Reply HELP for help.
              </p>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.1 How We Collect SMS Consent</h3>
            <p className="text-foreground/90 mb-4">
              SMS consent is collected via a clearly labeled opt-in checkbox on your employee profile page inside
              the CoAIleague platform ("I agree to receive text message (SMS) notifications from CoAIleague for
              workforce management purposes, including shift reminders, schedule changes, safety alerts, and account
              notifications. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out.
              Reply HELP for help."). The checkbox is unchecked by default and requires your affirmative action
              to enable SMS communications. Consent to receive SMS messages is separate from your agreement to
              our Terms of Service and Privacy Policy and is not required to use the platform.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.2 Types of Messages</h3>
            <p className="text-foreground/90 mb-4">When you opt in, you may receive the following types of recurring automated text messages:</p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Shift Assignments:</strong> New shift offers and assignment confirmations requiring your reply</li>
              <li><strong>Schedule Reminders:</strong> Upcoming shift reminders and schedule change notifications</li>
              <li><strong>Coverage Requests:</strong> Open shift fill requests requiring a YES/NO reply</li>
              <li><strong>Safety Alerts:</strong> Site emergency notifications, panic alert confirmations, and evacuation notices</li>
              <li><strong>Account Notifications:</strong> Document approvals, payroll confirmations, and compliance reminders</li>
              <li><strong>Clock Reminders:</strong> Clock-in/out reminders for your assigned shifts</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.3 Message Frequency</h3>
            <p className="text-foreground/90 mb-4">
              Message frequency varies based on your schedule, your employer's activity level, and whether you
              are on-call. You may receive up to 10 messages per week during active scheduling periods and fewer
              during quiet periods. Safety and emergency alerts may arrive outside of normal business hours.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.4 Message and Data Rates</h3>
            <p className="text-foreground/90 mb-4">
              <strong>Message and data rates may apply.</strong> Standard SMS and data rates charged by your
              wireless carrier may apply to messages you receive and to replies you send. CoAIleague does not
              charge additional fees for SMS notifications.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.5 How to Opt Out</h3>
            <p className="text-foreground/90 mb-4">
              You may opt out of SMS messages at any time using any of the following methods:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Reply STOP</strong> (or STOPALL, CANCEL, END, QUIT, or UNSUBSCRIBE) to any text message from CoAIleague. You will receive one confirmation message and no further messages will be sent unless you re-consent.</li>
              <li>Uncheck the SMS consent checkbox in your employee profile settings inside the CoAIleague platform.</li>
              <li>Email <strong>support@coaileague.com</strong> with your name and phone number requesting removal.</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              After opting out via STOP reply, you will receive exactly one final confirmation: "You have been
              unsubscribed from CoAIleague Workforce Alerts. You will receive no further messages." No further
              messages will be sent to your number unless you affirmatively re-consent.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.6 Help</h3>
            <p className="text-foreground/90 mb-4">
              Reply <strong>HELP</strong> to any SMS message for program information. You will receive a response
              with a description of the messaging program, opt-out instructions, and our support contact. You may
              also contact us directly at <strong>support@coaileague.com</strong>.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">13.7 SMS Data Privacy</h3>
            <p className="text-foreground/90 mb-4">
              Your mobile phone number and SMS consent status are stored securely and used only to deliver the
              workforce notifications you have consented to receive.
            </p>
            <p className="text-foreground/90 mb-4">
              <strong>No mobile information will be shared with third parties or affiliates for marketing or
              promotional purposes.</strong> Phone numbers and SMS consent records are not sold, rented,
              or shared with any third party for their own marketing use. SMS consent is not shared
              across employer organizations — each workspace maintains independent consent records.
            </p>
            <p className="text-foreground/90 mb-4">
              All categories of information that may be shared with third parties (such as Twilio for message
              delivery) are shared solely for the purpose of delivering the messages you requested and are
              governed by those parties' privacy policies and data processing agreements.
            </p>
            <p className="text-foreground/90 mb-4">
              For complete SMS program terms, see our <a href="/sms-terms" className="text-primary underline">SMS Terms of Service</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
            <p className="text-foreground/90 mb-4">
              For questions, concerns, or requests regarding this Privacy Policy or our data practices:
            </p>
            <ul className="list-none pl-0 mb-4 text-foreground/90">
              <li className="mb-2">
                <strong>Privacy Team Email:</strong> privacy@coaileague.com
              </li>
              <li className="mb-2">
                <strong>Data Protection Officer:</strong> dpo@coaileague.com
              </li>
              <li className="mb-2">
                <strong>Mailing Address:</strong> [Your Business Address]
              </li>
            </ul>
            <p className="text-foreground/90 mb-4">
              For GDPR-related inquiries from EU users, you also have the right to lodge a complaint with your local 
              supervisory authority.
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground mb-4">
              <strong>Compliance Certifications:</strong>
            </p>
            <ul className="list-disc pl-6 text-sm text-muted-foreground">
              <li>Infrastructure: SOC 2 Type 2 (via Railway/Google Cloud)</li>
              <li>Security: ISO 27001 certified hosting</li>
              <li>Privacy: GDPR and CCPA compliant</li>
              <li>Payment: PCI DSS compliant (via Stripe)</li>
            </ul>
          </div>
        </div>
      </main>
      </div>
      <Footer variant="light" />
    </CanvasHubPage>
  );
}
