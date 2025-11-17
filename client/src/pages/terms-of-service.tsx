import { UniversalHeader } from "@/components/universal-header";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <UniversalHeader variant="public" />
      
      <div className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 13, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-foreground/90 mb-4">
              By accessing or using AutoForce™ (the "Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you do not agree to these Terms, you may not access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-foreground/90 mb-4">
              AutoForce™ provides autonomous workforce management solutions for emergency services and service-related 
              industries, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Time tracking and scheduling (OperationsOS™)</li>
              <li>Invoicing and billing automation (BillOS™)</li>
              <li>Payroll processing</li>
              <li>AI-powered support (HelpOS™)</li>
              <li>Communication tools (CommOS™)</li>
              <li>Analytics and intelligence (IntelligenceOS™)</li>
              <li>Compliance auditing (AuditOS™)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts and Responsibilities</h2>
            <p className="text-foreground/90 mb-4">
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized access</li>
              <li>Ensuring all information provided is accurate and current</li>
              <li>Compliance with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Subscription Plans and Billing</h2>
            <p className="text-foreground/90 mb-4">
              AutoForce™ offers multiple subscription tiers (Free, Starter, Professional, Enterprise) with varying 
              features and usage limits. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Pay all fees associated with your selected plan</li>
              <li>Provide valid payment information</li>
              <li>Allow us to charge your payment method on a recurring basis</li>
              <li>Usage-based charges for AI features (HelpOS™, ScheduleOS™ Smart AI) beyond plan limits</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              We reserve the right to modify pricing with 30 days' notice. Continued use after price changes 
              constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. AI-Powered Features</h2>
            <p className="text-foreground/90 mb-4">
              Our AI-powered features (HelpOS™ support, ScheduleOS™ Smart AI) operate under a "99% AI, 1% human governance" 
              model:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>AI-generated schedules with ≥95% confidence are auto-approved</li>
              <li>Schedules with &lt;95% confidence require human review</li>
              <li>You maintain final authority over all AI-generated decisions</li>
              <li>AI recommendations do not constitute legal or professional advice</li>
              <li>Usage is metered and billed according to your subscription plan</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Data Ownership and Privacy</h2>
            <p className="text-foreground/90 mb-4">
              You retain ownership of all data you input into the Service. By using AutoForce™, you grant us a 
              limited license to process your data solely to provide the Service. See our{" "}
              <a href="/privacy" className="text-primary hover:underline" data-testid="link-privacy-policy">Privacy Policy</a>{" "}
              for details on how we collect, use, and protect your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Acceptable Use Policy</h2>
            <p className="text-foreground/90 mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Use the Service for illegal purposes</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Reverse engineer or decompile the Service</li>
              <li>Resell or redistribute the Service without authorization</li>
              <li>Interfere with other users' access or use</li>
              <li>Upload malicious code or spam</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Service Availability</h2>
            <p className="text-foreground/90 mb-4">
              We strive to maintain 99.9% uptime but do not guarantee uninterrupted service. We reserve the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Perform scheduled maintenance with advance notice</li>
              <li>Suspend service for security or technical reasons</li>
              <li>Modify or discontinue features with reasonable notice</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="text-foreground/90 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, AUTOFORCE™ SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Indirect, incidental, or consequential damages</li>
              <li>Loss of profits, data, or business opportunities</li>
              <li>Damages exceeding the amount you paid in the preceding 12 months</li>
              <li>AI-generated scheduling or billing decisions (you retain final approval authority)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Indemnification</h2>
            <p className="text-foreground/90 mb-4">
              You agree to indemnify and hold AutoForce™ harmless from any claims, damages, or expenses arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Employment disputes arising from your use of scheduling or payroll features</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Termination</h2>
            <p className="text-foreground/90 mb-4">
              Either party may terminate your account at any time:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>You may cancel your subscription from your account settings</li>
              <li>We may terminate for violations of these Terms</li>
              <li>Upon termination, you will lose access to the Service and your data</li>
              <li>We will provide 30 days for data export upon reasonable request</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Changes to Terms</h2>
            <p className="text-foreground/90 mb-4">
              We reserve the right to modify these Terms at any time. Material changes will be communicated via:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Email notification to your registered address</li>
              <li>In-app notification upon next login</li>
              <li>Updated "Last Updated" date at the top of this page</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              Continued use after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Governing Law and Dispute Resolution</h2>
            <p className="text-foreground/90 mb-4">
              These Terms are governed by the laws of [Your Jurisdiction]. Any disputes shall be resolved through:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Good-faith negotiation for 30 days</li>
              <li>Binding arbitration if negotiation fails</li>
              <li>Class action waivers apply to the maximum extent permitted by law</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
            <p className="text-foreground/90 mb-4">
              For questions about these Terms, contact us at:
            </p>
            <ul className="list-none pl-0 mb-4 text-foreground/90">
              <li className="mb-2">
                <strong>Email:</strong> legal@autoforce.example.com
              </li>
              <li className="mb-2">
                <strong>Address:</strong> [Your Business Address]
              </li>
            </ul>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              AutoForce™ and all related service names (CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, 
              AuditOS™, MarketingOS™, HelpOS™, ScheduleOS™) are trademarks of [Your Company Name].
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
