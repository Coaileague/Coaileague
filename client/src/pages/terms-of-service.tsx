import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { SEO, PAGE_SEO } from '@/components/seo';

const termsConfig: CanvasPageConfig = {
  id: 'terms-of-service',
  title: 'Terms of Service',
  category: 'legal',
  variant: 'default',
  showHeader: false,
};

export default function TermsOfService() {
  return (
    <CanvasHubPage config={termsConfig}>
      <SEO
        title={PAGE_SEO.terms.title}
        description={PAGE_SEO.terms.description}
        canonical="https://coaileague.com/terms"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <UniversalHeader variant="public" />
        
        <main className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
            <p className="text-muted-foreground mb-8">Last Updated: March 19, 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-foreground/90 mb-4">
              By accessing or using CoAIleague (the "Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you do not agree to these Terms, you may not access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-foreground/90 mb-4">
              CoAIleague provides AI-assisted workforce management solutions for security and service-related 
              industries, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>AI-assisted scheduling and time tracking</li>
              <li>Automated invoicing and billing</li>
              <li>Integrated payroll processing</li>
              <li>AI-powered support and assistance via the Trinity AI platform</li>
              <li>Team communication tools</li>
              <li>Analytics and business intelligence</li>
              <li>AI compliance auditing and monitoring</li>
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
              CoAIleague offers multiple subscription tiers (Starter, Professional, Business, Enterprise, Strategic) with varying 
              features and usage limits. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Pay all fees associated with your selected plan</li>
              <li>Provide valid payment information</li>
              <li>Allow us to charge your payment method on a recurring basis</li>
              <li>Usage-based charges for AI automation features beyond plan limits</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              We reserve the right to modify pricing with 30 days' notice. Continued use after price changes 
              constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. AI System Capabilities, Limitations, and Disclaimer</h2>

            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-5 mb-6">
              <p className="font-bold text-foreground mb-2">IMPORTANT — PLEASE READ CAREFULLY</p>
              <p className="text-foreground/90 text-sm">
                CoAIleague uses artificial intelligence and automation technologies, collectively branded as "Trinity AI,"
                to assist with scheduling, payroll calculations, invoice generation, compliance monitoring, and related
                workforce management tasks. Artificial intelligence systems — including Trinity AI — can and do make
                mistakes. Outputs may be incorrect, incomplete, or outdated. By using the Service, you expressly
                acknowledge and agree to all provisions in this Section 5 and Section 6.
              </p>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.1 AI Errors, Hallucinations, and Inaccurate Outputs</h3>
            <p className="text-foreground/90 mb-4">
              Artificial intelligence systems — including large language models and automated reasoning systems — are
              inherently probabilistic. They can produce outputs that are factually incorrect, internally inconsistent,
              outdated, or entirely fabricated. This class of failure is commonly referred to as an "AI hallucination."
              Hallucinations and errors may occur without warning, regardless of prior performance. CoAIleague makes no
              representation that Trinity AI outputs are free from errors, hallucinations, or inaccuracies. You
              expressly acknowledge this risk and agree that:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>All AI outputs must be reviewed by a qualified human before being acted upon.</strong> AI confidence scores — even at 95% or higher — do not guarantee accuracy.</li>
              <li>AI-generated schedules, payroll calculations, invoices, compliance reports, and recommendations are drafts for human review, not final authoritative outputs.</li>
              <li>You are solely responsible for any action taken on an AI-generated output that was not independently verified by a human with appropriate domain knowledge.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Model Downtime, Outages, and Degraded Performance</h3>
            <p className="text-foreground/90 mb-4">
              Trinity AI depends on underlying AI models and infrastructure that are subject to outages, degraded
              performance, rate limits, cold-start delays, and unexpected failures. These may be caused by:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Third-party AI model provider outages or maintenance windows</li>
              <li>Infrastructure failures at cloud hosting providers</li>
              <li>High-demand periods causing performance degradation</li>
              <li>Model updates, version changes, or rollbacks by underlying providers</li>
              <li>Network connectivity or API gateway failures</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              During AI downtime or degraded performance, automated features may be unavailable, may produce incomplete
              outputs, or may silently fail. CoAIleague is not liable for any business interruption, financial loss,
              compliance failure, or other consequence resulting from AI unavailability. You are responsible for
              maintaining operational continuity through manual processes when AI features are unavailable.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Bugs, Errors, and Required Patches</h3>
            <p className="text-foreground/90 mb-4">
              Software bugs, logic errors, and integration failures are a normal and expected part of operating a
              complex AI-assisted platform. CoAIleague and Trinity AI may at any time contain bugs or defects that
              cause incorrect outputs, unexpected behavior, or feature unavailability. CoAIleague will use commercially
              reasonable efforts to identify and address bugs through patches, hotfixes, and updates. However:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>CoAIleague does not warrant that the platform is bug-free or defect-free at any time.</li>
              <li>Patches and fixes may alter the behavior of existing features, including AI outputs, automation logic, and workflow approvals.</li>
              <li>You are responsible for reviewing the impact of platform updates on your active automations and workflows.</li>
              <li>CoAIleague, Trinity AI, their owners, employees, officers, and representatives are not liable for any loss or damage caused by bugs, defects, or errors in the platform, including AI-generated outputs produced as a result of such bugs.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.4 Payroll, Tax, and Financial Outputs</h3>
            <p className="text-foreground/90 mb-4">
              AI-generated payroll calculations, tax withholding amounts, net pay figures, and deductions may be
              incorrect. A qualified payroll specialist or CPA must review all payroll runs before funds are disbursed.
              CoAIleague is not a licensed payroll processor, financial institution, or tax preparer. AI-generated
              invoices, billing statements, and financial reports are estimates requiring human verification before
              issuance to clients or submission for payment.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.5 No Professional or Legal Advice</h3>
            <p className="text-foreground/90 mb-4">
              AI recommendations and outputs do not constitute legal, financial, payroll, tax, HR, employment, or
              professional advice of any kind. You should consult qualified licensed professionals for all such matters.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.6 Technology Provider Confidentiality</h3>
            <p className="text-foreground/90 mb-4">
              CoAIleague does not disclose specific third-party AI technology providers as proprietary business
              information. All AI outputs are presented under CoAIleague and Trinity AI branding.
            </p>

            <div className="bg-muted/60 border border-border rounded-md p-5 mt-6">
              <p className="text-foreground/90 text-sm font-semibold">
                By using the Service, you waive any claim against CoAIleague, Trinity AI, their owners, employees,
                officers, directors, and representatives arising from AI-generated outputs that were acted upon
                without independent human verification, or arising from AI downtime, hallucinations, bugs, or errors.
              </p>
            </div>
          </section>

          <section className="mb-8" id="human-supervisor">
            <h2 className="text-2xl font-semibold mb-4">6. Human Supervisor Requirement and Tenant AI Governance Obligations</h2>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-5 mb-6">
              <p className="font-bold text-foreground mb-2">MANDATORY TENANT OBLIGATION</p>
              <p className="text-foreground/90 text-sm">
                Trinity AI is an AI system capable of a high degree of autonomy. As a tenant (subscriber) of the
                CoAIleague platform, you are required to designate and maintain a qualified human supervisor responsible
                for overseeing all AI-driven automations and workflows within your organization's account. Failure to
                maintain a human supervisor does not transfer liability to CoAIleague or Trinity AI.
              </p>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.1 Trinity AI Autonomy Model</h3>
            <p className="text-foreground/90 mb-4">
              Trinity AI is designed to operate with a high degree of automation across scheduling, payroll preparation,
              invoicing, compliance monitoring, and workforce coordination tasks. Trinity AI is capable of autonomous
              action across the majority of routine platform operations. However, by design:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li><strong>Approximately 1% of scenarios — including all scenarios categorized as critical — require human intervention before Trinity AI proceeds.</strong> These include but are not limited to: payroll disbursement approval, invoice issuance to clients, compliance violation escalation, emergency coverage decisions, and account-level configuration changes.</li>
              <li>Even on scenarios not categorized as critical, Trinity AI and the CoAIleague platform always afford the tenant an opportunity for human approval, review, or intervention at every meaningful step — from the creation of a workflow or document through its final execution, whether that final output is a payroll run, a scheduled shift, an issued invoice, a signed document, or any other platform-generated deliverable.</li>
              <li>Human approval gates are built into the platform at every stage where a consequential output is produced. These gates are features, not optional add-ons, and tenants must not disable, bypass, or ignore them.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Tenant Obligation to Maintain Human Supervision</h3>
            <p className="text-foreground/90 mb-4">
              You agree that as a condition of using the Service, you will:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Designate at least one qualified human supervisor with administrative access to your CoAIleague account who is responsible for reviewing, approving, and overseeing AI-generated outputs and automated workflows.</li>
              <li>Ensure that your designated human supervisor is available and accessible during normal business operations and is capable of reviewing AI-generated outputs before they are acted upon.</li>
              <li>Not configure, enable, or allow fully unattended AI automation for any workflow involving payroll disbursement, client invoice issuance, employment-related decisions, regulatory compliance filings, or financial transactions without human review at each approval gate provided by the platform.</li>
              <li>Promptly respond to platform notifications, approval requests, and review prompts generated by Trinity AI or the CoAIleague platform in connection with your organization's workflows.</li>
              <li>Train all personnel who interact with AI-generated outputs on the limitations of AI systems, including the risk of hallucinations, errors, and degraded performance as described in Section 5.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.3 No Liability for Unsupervised Automation</h3>
            <p className="text-foreground/90 mb-4">
              CoAIleague, Trinity AI, and their respective owners, officers, employees, directors, agents, and
              representatives shall have no liability whatsoever — including for direct, indirect, consequential,
              punitive, or special damages — for any harm, loss, error, regulatory violation, employment dispute,
              financial loss, data error, or other consequence arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>A tenant's failure to maintain a designated human supervisor as required by this Section 6.</li>
              <li>A tenant's failure to review, verify, or approve AI-generated outputs at any platform-provided approval gate before those outputs are executed or acted upon.</li>
              <li>A tenant bypassing, disabling, or ignoring human review steps, approval prompts, or confirmation gates provided by the platform.</li>
              <li>AI errors, hallucinations, incorrect outputs, or automation failures that were not caught because no human reviewed the output prior to execution.</li>
              <li>A tenant's decision to act on an AI-generated output — including a schedule, payroll figure, invoice, compliance report, or any other platform output — without independent human verification.</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              The responsibility to supervise AI-assisted operations rests entirely with the tenant. The platform's
              design affords human oversight at every critical juncture; whether that oversight is exercised is the
              tenant's sole obligation and responsibility.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.4 Acknowledgment of AI Nature</h3>
            <p className="text-foreground/90 mb-4">
              By activating any automation, approval-gate workflow, or AI-generated output within the CoAIleague
              platform, you acknowledge that:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Trinity AI is a software system, not a human professional, and its outputs do not carry the judgment, accountability, or licensure of a human professional.</li>
              <li>AI systems — including Trinity AI — can fail in ways that are unpredictable, intermittent, and difficult to detect.</li>
              <li>Final authority over every platform-generated output rests with you, the tenant, and with your designated human supervisor.</li>
              <li>CoAIleague and Trinity AI serve as tools to assist human decision-making, not to replace it.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Data Ownership and Privacy</h2>
            <p className="text-foreground/90 mb-4">
              You retain ownership of all data you input into the Service. By using CoAIleague, you grant us a 
              limited license to process your data solely to provide the Service. See our{" "}
              <a href="/privacy" className="text-primary hover:underline" data-testid="link-privacy-policy">Privacy Policy</a>{" "}
              for details on how we collect, use, and protect your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Acceptable Use Policy</h2>
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
            <h2 className="text-2xl font-semibold mb-4">9. Service Availability</h2>
            <p className="text-foreground/90 mb-4">
              We strive to maintain 99.9% uptime but do not guarantee uninterrupted service. We reserve the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Perform scheduled maintenance with advance notice</li>
              <li>Suspend service for security or technical reasons</li>
              <li>Modify or discontinue features with reasonable notice</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              AI-dependent features — including scheduling automation, Trinity AI assistance, and automated workflow
              execution — may be unavailable during platform maintenance, AI provider outages, or degraded service
              periods. Unavailability of AI features does not entitle you to a refund or service credit except as
              expressly stated in your subscription agreement.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
            <p className="text-foreground/90 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, COAILEAGUE, TRINITY AI, AND THEIR RESPECTIVE OWNERS,
              OFFICERS, EMPLOYEES, DIRECTORS, AGENTS, AND REPRESENTATIVES SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Indirect, incidental, special, consequential, exemplary, or punitive damages of any kind</li>
              <li>Loss of profits, revenue, data, goodwill, or business opportunities</li>
              <li>Damages exceeding the total amount you paid for the Service in the twelve (12) months preceding the claim</li>
              <li>AI-generated scheduling, payroll, invoicing, compliance, or other decisions — whether or not those outputs contained errors or hallucinations — where such outputs were acted upon without independent human verification as required under Section 5 and Section 6</li>
              <li>Consequences arising from AI hallucinations, incorrect AI outputs, or AI model errors of any kind</li>
              <li>Platform unavailability, downtime, or degraded AI performance caused by third-party AI model providers, infrastructure failures, or factors outside CoAIleague's direct control</li>
              <li>Any harm, loss, or liability arising from a tenant's failure to maintain a designated human supervisor or failure to exercise oversight at platform-provided human approval gates</li>
              <li>Any harm, loss, or liability arising from bugs, defects, software errors, or required patches in the platform or its underlying AI systems</li>
              <li>Employment disputes, regulatory violations, wage and hour claims, tax penalties, or any other legal consequence arising from AI-generated workforce, payroll, or compliance outputs that were acted upon without human verification</li>
              <li>Any consequence of an AI model update, version change, or behavioral change by an underlying AI provider that altered the outputs of Trinity AI or other platform features</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability for certain
              types of damages. In such jurisdictions, our liability shall be limited to the maximum extent permitted by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
            <p className="text-foreground/90 mb-4">
              You agree to indemnify, defend, and hold harmless CoAIleague, Trinity AI, and their respective owners,
              officers, employees, directors, agents, and representatives from and against any and all claims, liabilities,
              damages, losses, costs, and expenses (including reasonable attorneys' fees) arising from or related to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Your use of the Service or any platform feature, including AI-assisted automations</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Employment disputes, wage claims, tax liabilities, or regulatory violations arising from your use of scheduling, payroll, or compliance features</li>
              <li>Your failure to designate and maintain a qualified human supervisor as required by Section 6</li>
              <li>Your failure to review, verify, or approve AI-generated outputs at platform-provided human approval gates before those outputs were executed</li>
              <li>Your decision to bypass, disable, or ignore human review prompts, approval gates, or confirmation steps provided by the platform</li>
              <li>Any action taken on an AI-generated output — including payroll data, invoices, schedules, compliance reports, or any other platform output — without independent human verification</li>
              <li>Any claim by a third party (including your employees, contractors, or clients) arising from AI-generated outputs produced by your CoAIleague account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
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
            <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
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
            <h2 className="text-2xl font-semibold mb-4">14. Governing Law and Dispute Resolution</h2>
            <p className="text-foreground/90 mb-4">
              These Terms are governed by the laws of the State of Texas, without regard to its conflict of law provisions.
              Any disputes shall be resolved through:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Good-faith negotiation for 30 days</li>
              <li>Binding arbitration if negotiation fails, conducted in Texas under the rules of the American Arbitration Association</li>
              <li>Class action waivers apply to the maximum extent permitted by law</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">15. Contact Information</h2>
            <p className="text-foreground/90 mb-4">
              For questions about these Terms, contact us at:
            </p>
            <ul className="list-none pl-0 mb-4 text-foreground/90">
              <li className="mb-2">
                <strong>Email:</strong> legal@coaileague.com
              </li>
              <li className="mb-2">
                <strong>Address:</strong> CoAIleague, Texas, United States
              </li>
            </ul>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              CoAIleague™ and Trinity™ are registered trademarks of CoAIleague. Last updated March 19, 2026.
            </p>
          </div>
        </div>
      </main>
      </div>
      <Footer variant="light" />
    </CanvasHubPage>
  );
}
