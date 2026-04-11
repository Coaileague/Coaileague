import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function DataProcessingAgreement() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Data Processing Agreement (DPA) | CoAIleague"
        description="CoAIleague Data Processing Agreement — GDPR Article 28 compliant DPA for enterprise customers."
        canonical="https://www.coaileague.com/dpa"
      />
      <UniversalHeader variant="public" />
      <main className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
            <h1 className="text-4xl font-bold">Data Processing Agreement (DPA)</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = "/api/legal/dpa/download";
                a.download = "CoAIleague-DPA.html";
                a.click();
              }}
              className="print:hidden shrink-0"
              data-testid="button-download-dpa"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download DPA
            </Button>
          </div>
          <p className="text-muted-foreground mb-8">Version 1.0 | Effective: March 27, 2026 | GDPR Article 28 Compliant</p>

          <div className="bg-muted/40 border border-border rounded-md p-4 mb-8 text-sm">
            <p><strong>Note:</strong> This DPA applies to all CoAIleague customers who process personal data of EU/EEA residents or California residents under GDPR and CCPA respectively. By using CoAIleague, you (the "Controller") and CoAIleague ("Processor") enter into this DPA.</p>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Definitions</h2>
            <ul>
              <li><strong>Controller:</strong> The organization (your company) that determines the purposes and means of processing personal data.</li>
              <li><strong>Processor:</strong> CoAIleague, which processes personal data on behalf of the Controller.</li>
              <li><strong>Sub-processor:</strong> Third parties engaged by CoAIleague to assist in processing.</li>
              <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person.</li>
              <li><strong>Data Subject:</strong> The individuals (officers, employees, clients) whose personal data is processed.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Subject Matter and Duration</h2>
            <p>CoAIleague processes personal data on your behalf for the purpose of providing workforce management services as described in the Terms of Service. Processing continues for the duration of your subscription and for the retention periods specified in our <a href="/privacy" className="underline">Privacy Policy</a>.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Nature and Purpose of Processing</h2>
            <p>Personal data is processed for the following purposes:</p>
            <ul>
              <li>Employee/officer management (scheduling, time tracking, payroll)</li>
              <li>Compliance tracking (licenses, certifications, regulatory filings)</li>
              <li>Client relationship management</li>
              <li>Incident reporting and investigations</li>
              <li>Billing and financial administration</li>
              <li>AI-assisted workforce optimization (Trinity™)</li>
              <li>Communication and notification delivery</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Types of Personal Data</h2>
            <p>The following categories of personal data are processed:</p>
            <ul>
              <li>Identity data (name, employee ID, government ID last 4 digits)</li>
              <li>Contact data (email, phone, address)</li>
              <li>Employment data (position, hire date, compensation)</li>
              <li>Biometric-adjacent data (work location GPS coordinates for time tracking)</li>
              <li>Financial data (payroll records, banking information for direct deposit)</li>
              <li>Health and safety data (incident reports, drug test results where applicable)</li>
              <li>Professional credentials (guard card numbers, license expiry dates)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. CoAIleague Obligations (Processor)</h2>
            <p>CoAIleague shall:</p>
            <ul>
              <li>Process personal data only on documented instructions from the Controller</li>
              <li>Ensure persons authorized to process data are bound by confidentiality</li>
              <li>Implement appropriate technical and organizational security measures (encryption at rest and in transit, access controls, audit logging)</li>
              <li>Not engage new sub-processors without Controller consent (see Section 7)</li>
              <li>Assist the Controller in responding to data subject requests within required timeframes</li>
              <li>Notify the Controller of data breaches within 72 hours of becoming aware</li>
              <li>Delete or return all personal data upon termination of the agreement</li>
              <li>Make available all information necessary to demonstrate compliance with GDPR Article 28</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Controller Obligations</h2>
            <p>The Controller shall:</p>
            <ul>
              <li>Ensure that the processing of personal data is lawful (consent, legitimate interest, or contract)</li>
              <li>Provide privacy notices to data subjects as required by GDPR</li>
              <li>Ensure data subjects' rights can be exercised (CoAIleague provides tools to assist)</li>
              <li>Not instruct CoAIleague to process data in violation of applicable law</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Sub-processors</h2>
            <p>CoAIleague uses the following authorized sub-processors:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4">Sub-processor</th>
                    <th className="text-left py-2 pr-4">Purpose</th>
                    <th className="text-left py-2">Data Transferred</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4">Replit (Neon PostgreSQL)</td>
                    <td className="py-2 pr-4">Database hosting</td>
                    <td className="py-2">All platform data</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4">Stripe</td>
                    <td className="py-2 pr-4">Payment processing</td>
                    <td className="py-2">Billing data only</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4">Resend</td>
                    <td className="py-2 pr-4">Email delivery</td>
                    <td className="py-2">Email addresses, names</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 pr-4">AI features (Trinity™)</td>
                    <td className="py-2">Anonymized work context</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4">Anthropic (Claude)</td>
                    <td className="py-2 pr-4">AI features (Trinity™)</td>
                    <td className="py-2">Anonymized work context</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Google (Gemini)</td>
                    <td className="py-2 pr-4">AI features (Trinity™)</td>
                    <td className="py-2">Anonymized work context</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Security Measures</h2>
            <p>CoAIleague implements the following security measures:</p>
            <ul>
              <li>AES-256 encryption at rest for all database records</li>
              <li>TLS 1.3 for all data in transit</li>
              <li>Role-based access control (RBAC) with 8 privilege levels</li>
              <li>Append-only audit log for all data modifications</li>
              <li>Multi-factor authentication support</li>
              <li>Data isolation between workspaces (multi-tenant architecture)</li>
              <li>Automated retention enforcement and PII anonymization</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Data Subject Rights</h2>
            <p>CoAIleague provides tools to assist Controllers in fulfilling data subject rights:</p>
            <ul>
              <li><strong>Right to Access (Art. 15 GDPR / CCPA §1798.110):</strong> Officer personal data export at <a href="/data-subject-requests" className="underline">/data-subject-requests</a></li>
              <li><strong>Right to Portability (Art. 20 GDPR):</strong> Workspace-wide JSON export</li>
              <li><strong>Right to Erasure (Art. 17 GDPR):</strong> PII anonymization with retention of legally required records</li>
              <li><strong>Right to Restriction (Art. 18 GDPR):</strong> Supported via data subject request workflow</li>
            </ul>
            <p className="mt-2">Controllers must ensure data subjects can exercise these rights. CoAIleague handles requests within 30-day SLA per GDPR requirements.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Breach Notification</h2>
            <p>In the event of a personal data breach, CoAIleague will:</p>
            <ol>
              <li>Notify the Controller within 72 hours of becoming aware of the breach</li>
              <li>Provide details of the breach including categories and approximate number of data subjects affected</li>
              <li>Describe likely consequences and proposed measures to address the breach</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Termination and Data Return</h2>
            <p>Upon termination of your CoAIleague subscription:</p>
            <ul>
              <li>You may request a full workspace data export (JSON format) within 30 days of termination</li>
              <li>After 30 days, your workspace data will be anonymized and then deleted per our retention schedule</li>
              <li>Legally required records (payroll, tax records) will be retained for the statutory period then deleted</li>
              <li>Audit logs will be retained for 7 years</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Governing Law and Jurisdiction</h2>
            <p>This DPA is governed by the laws of the State of Texas, United States. For EU/EEA data subjects, GDPR takes precedence over any conflicting provisions.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Contact</h2>
            <p>Data Protection Officer: privacy@coaileague.com</p>
            <p>For data subject requests: <a href="/data-subject-requests" className="underline">Submit a request online</a></p>
            <p>Enterprise DPA inquiries: dpa@coaileague.com</p>
          </section>

          <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
            <p>Related: <a href="/privacy" className="underline mr-4">Privacy Policy</a> <a href="/terms" className="underline mr-4">Terms of Service</a> <a href="/cookie-policy" className="underline">Cookie Policy</a></p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
