import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO } from "@/components/seo";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Cookie Policy | CoAIleague"
        description="Learn how CoAIleague uses cookies and similar technologies to improve your experience."
        canonical="https://coaileague.com/cookie-policy"
      />
      <UniversalHeader variant="public" />
      <main className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: March 27, 2026 | <a href="/cookie-policy-es" className="underline">Leer en Español</a></p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies?</h2>
            <p>Cookies are small text files stored on your device when you access CoAIleague. They help us recognize your browser, remember your preferences, and improve your experience on the platform.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Categories of Cookies We Use</h2>

            <h3 className="text-xl font-semibold mb-2">2.1 Essential Cookies (Always Active)</h3>
            <p>These cookies are necessary for CoAIleague to function and cannot be disabled:</p>
            <ul>
              <li><strong>Authentication:</strong> Session tokens that keep you logged in securely</li>
              <li><strong>Security:</strong> CSRF protection tokens, rate-limit identifiers</li>
              <li><strong>Load Balancing:</strong> Sticky session identifiers for server affinity</li>
              <li><strong>Workspace Scope:</strong> Your active workspace context identifier</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">Retention: Session cookies expire when you close your browser. Persistent authentication tokens expire after 30 days of inactivity.</p>

            <h3 className="text-xl font-semibold mb-2 mt-6">2.2 Functional Cookies (Optional)</h3>
            <p>These cookies remember your preferences to improve your experience:</p>
            <ul>
              <li><strong>Theme:</strong> Light/dark mode preference</li>
              <li><strong>Sidebar:</strong> Collapsed/expanded state, active section</li>
              <li><strong>Table preferences:</strong> Column widths, sort order, filters</li>
              <li><strong>Language:</strong> Your selected display language</li>
              <li><strong>Command palette:</strong> Recent search history (localStorage)</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">Retention: Up to 1 year, or until you clear your browser data.</p>

            <h3 className="text-xl font-semibold mb-2 mt-6">2.3 Analytics Cookies (Optional)</h3>
            <p>These cookies help us understand how CoAIleague is used so we can improve it:</p>
            <ul>
              <li><strong>Feature usage:</strong> Which features are used most/least (anonymized)</li>
              <li><strong>Performance:</strong> Page load times, API response times</li>
              <li><strong>Error tracking:</strong> JavaScript errors and server errors (anonymized)</li>
              <li><strong>Search patterns:</strong> Aggregated search query analytics</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">Retention: 90 days. All analytics data is anonymized. Never sold to third parties.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Third-Party Cookies</h2>
            <p>CoAIleague uses a limited number of trusted third-party services that may set cookies:</p>
            <ul>
              <li><strong>Stripe:</strong> Payment processing (essential — required for billing). See <a href="https://stripe.com/privacy" className="underline" target="_blank" rel="noreferrer">Stripe Privacy Policy</a>.</li>
              <li><strong>Resend:</strong> Email delivery. No cookies set on CoAIleague domains.</li>
            </ul>
            <p className="mt-2">We do not use Google Analytics, Facebook Pixel, or any advertising cookies.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. How to Manage Your Cookie Preferences</h2>
            <p>You can manage your cookie preferences at any time:</p>
            <ul>
              <li><strong>In CoAIleague:</strong> Visit <a href="/end-user-controls" className="underline">Privacy Settings</a> or <a href="/data-subject-requests" className="underline">Data Subject Requests</a></li>
              <li><strong>Browser settings:</strong> Most browsers allow you to block or delete cookies. Note that blocking essential cookies will prevent you from using CoAIleague.</li>
              <li><strong>Email request:</strong> Contact privacy@coaileague.com to withdraw consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. localStorage and sessionStorage</h2>
            <p>In addition to cookies, CoAIleague uses browser localStorage and sessionStorage for:</p>
            <ul>
              <li>Recent search history (<code>coai_recent_searches</code>)</li>
              <li>Cookie consent status (<code>coai_cookie_consent</code>, <code>coai_cookie_banner_dismissed</code>)</li>
              <li>Notification preferences</li>
            </ul>
            <p className="mt-2">These can be cleared at any time from your browser's developer tools or by clearing your site data.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Legal Basis</h2>
            <p>Under GDPR Article 6 and CCPA:</p>
            <ul>
              <li><strong>Essential cookies:</strong> Legitimate interest and contractual necessity</li>
              <li><strong>Functional and analytics cookies:</strong> Your explicit consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Contact</h2>
            <p>For questions about our cookie practices, contact:</p>
            <ul>
              <li>Email: privacy@coaileague.com</li>
              <li>Data Subject Requests: <a href="/data-subject-requests" className="underline">Submit a request</a></li>
            </ul>
          </section>

          <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
            <p>Related: <a href="/privacy" className="underline mr-4">Privacy Policy</a> <a href="/terms" className="underline mr-4">Terms of Service</a> <a href="/dpa" className="underline">Data Processing Agreement</a></p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
