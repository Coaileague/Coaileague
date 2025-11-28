import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <UniversalHeader variant="public" />
      
      <div className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 13, 2025</p>

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
              <li><strong>Communications:</strong> Messages sent through AI Communications, support tickets, feedback</li>
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
              <li>OAuth authentication data (if using Replit Auth or other SSO)</li>
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
            <h2 className="text-2xl font-semibold mb-4">4. CoAIleague AI and Intelligent Automation</h2>
            <p className="text-foreground/90 mb-4">
              Our CoAIleague AI system processes your data to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Generate automated schedules based on employee availability and preferences</li>
              <li>Provide intelligent support responses through CoAIleague AI</li>
              <li>Analyze patterns to improve scheduling accuracy</li>
              <li>Predict staffing needs and optimize labor costs</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              <strong>Important:</strong> All AI decisions operate under our "99% AI, 1% human governance" model. 
              You maintain final approval authority for all AI-generated schedules and decisions. We do not use your 
              data to train AI models for other customers.
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
              <li><strong>Cloud Infrastructure:</strong> Replit, Google Cloud (hosting and storage)</li>
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
              <li><strong>Infrastructure:</strong> SOC 2 Type 2 certified hosting (Replit/Google Cloud)</li>
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
              To exercise these rights, contact us at privacy@coaileague.example.com. We will respond within 30 days.
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
              under 18, please contact us immediately at privacy@coaileague.example.com.
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

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
            <p className="text-foreground/90 mb-4">
              For questions, concerns, or requests regarding this Privacy Policy or our data practices:
            </p>
            <ul className="list-none pl-0 mb-4 text-foreground/90">
              <li className="mb-2">
                <strong>Privacy Team Email:</strong> privacy@coaileague.example.com
              </li>
              <li className="mb-2">
                <strong>Data Protection Officer:</strong> dpo@coaileague.example.com
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
              <li>Infrastructure: SOC 2 Type 2 (via Replit/Google Cloud)</li>
              <li>Security: ISO 27001 certified hosting</li>
              <li>Privacy: GDPR and CCPA compliant</li>
              <li>Payment: PCI DSS compliant (via Stripe)</li>
            </ul>
          </div>
        </div>
      </div>
      <Footer variant="light" />
    </div>
  );
}
