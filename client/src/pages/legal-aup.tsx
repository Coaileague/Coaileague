/**
 * Phase 52 — Acceptable Use Policy (AUP)
 * ========================================
 * Public page at /legal/aup
 */

import { Link } from "wouter";
import { Footer } from "@/components/footer";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { Button } from "@/components/ui/button";
import { CONTACTS } from "@shared/platformConfig";
import { ArrowLeft } from "lucide-react";

export default function AcceptableUsePolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <Link href="/">
          <UnifiedBrandLogo size="md" />
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 container max-w-3xl mx-auto py-12 px-6">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold mb-2">Acceptable Use Policy</h1>
          <p className="text-muted-foreground text-sm mb-8">Last updated: March 1, 2025</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Acceptable Use Policy ("AUP") governs the use of the CoAIleague platform,
              services, APIs, and associated tools (collectively, the "Platform"). By accessing
              or using the Platform, you agree to comply with this AUP. Violations may result
              in suspension or termination of your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Permitted Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You may use the Platform solely for lawful purposes and in accordance with your
              subscription agreement. Permitted uses include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
              <li>Managing your workforce, schedules, and time records</li>
              <li>Processing payroll and generating reports for your organization</li>
              <li>Communicating with employees and clients through provided tools</li>
              <li>Using AI features to assist with operational decisions</li>
              <li>Generating, storing, and managing compliance documents</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Prohibited Activities</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You must not use the Platform to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
              <li>Violate any applicable federal, state, or local law or regulation</li>
              <li>Transmit, distribute, or store any material that is unlawful, harmful, or fraudulent</li>
              <li>Access, tamper with, or use non-public areas of the Platform without authorization</li>
              <li>Probe, scan, or test the vulnerability of any system or network</li>
              <li>Circumvent authentication or security measures</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Platform</li>
              <li>Use automated tools (scrapers, bots, crawlers) without written permission</li>
              <li>Introduce malware, viruses, or any code designed to disrupt or harm</li>
              <li>Harvest or collect user information without consent</li>
              <li>Impersonate any person, organization, or entity</li>
              <li>Engage in any activity that creates an unreasonable or disproportionately large load on infrastructure</li>
              <li>Use the Platform to process data outside the scope of your subscription</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. AI Feature Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              AI-generated outputs are provided for informational and operational assistance
              purposes only. You are solely responsible for reviewing, validating, and acting
              on AI-generated recommendations. You must not use AI outputs to make final
              decisions on matters requiring professional legal, medical, financial, or HR
              judgment without independent review by qualified personnel.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Data Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for ensuring that any data you upload to the Platform is
              accurate, lawfully obtained, and that you have the appropriate rights and
              permissions to process it. You must not upload personally identifiable
              information (PII) beyond what is necessary for the Platform's core functions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Account Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for maintaining the confidentiality of your credentials and
              for all activities that occur under your account. You must notify us immediately
              at <a href={`mailto:${CONTACTS.security}`} className="text-primary underline underline-offset-4">{CONTACTS.security}</a> of
              any unauthorized access or security breach.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Enforcement</h2>
            <p className="text-muted-foreground leading-relaxed">
              CoAIleague reserves the right to investigate suspected violations of this AUP
              and may suspend or terminate access to the Platform without notice if we
              determine, in our sole discretion, that a violation has occurred. We may report
              violations to law enforcement authorities where required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Reporting Violations</h2>
            <p className="text-muted-foreground leading-relaxed">
              To report a suspected violation of this AUP, contact us at{" "}
              <a href={`mailto:${CONTACTS.trust}`} className="text-primary underline underline-offset-4">
                {CONTACTS.trust}
              </a>
              . We will investigate all reports and respond within 5 business days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">9. Changes to this Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this AUP at any time. Continued use of the Platform after
              changes are posted constitutes acceptance of the revised policy.
            </p>
          </section>

          <div className="border-t pt-6 mt-8">
            <p className="text-sm text-muted-foreground">
              For questions about this Acceptable Use Policy, contact{" "}
              <a href={`mailto:${CONTACTS.legal}`} className="text-primary underline underline-offset-4">
                {CONTACTS.legal}
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              <Link href="/legal/security" className="text-primary hover:underline">Security Policy</Link>
              <Link href="/dpa" className="text-primary hover:underline">Data Processing Agreement</Link>
              <Link href="/cookie-policy" className="text-primary hover:underline">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
