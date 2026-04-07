/**
 * Phase 52 — Security Policy
 * ===========================
 * Public page at /legal/security
 */

import { Link } from "wouter";
import { Footer } from "@/components/footer";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, Lock, Server, Eye, AlertCircle, RefreshCw } from "lucide-react";

export default function SecurityPolicyPage() {
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

      {/* Hero */}
      <div className="border-b bg-muted/30 py-10 px-6">
        <div className="container max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-8 w-8 text-primary" />
            <Badge variant="outline" className="text-xs">SOC 2 Aligned</Badge>
          </div>
          <h1 className="text-3xl font-bold mb-2">Security Policy</h1>
          <p className="text-muted-foreground">
            How CoAIleague protects your data and maintains platform integrity.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Last updated: March 1, 2025</p>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 container max-w-3xl mx-auto py-12 px-6">
        <div className="space-y-10">

          {/* Infrastructure */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Infrastructure Security</h2>
            </div>
            <div className="text-muted-foreground leading-relaxed space-y-3">
              <p>
                The CoAIleague Platform is hosted on enterprise-grade cloud infrastructure
                with multiple layers of physical and logical security controls. Our infrastructure
                employs:
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li>Network-level firewall rules and DDoS mitigation</li>
                <li>Isolated virtual networks with strict ingress and egress controls</li>
                <li>Automated vulnerability scanning and patch management</li>
                <li>Geographic redundancy for critical data stores</li>
                <li>Encrypted data at rest (AES-256) and in transit (TLS 1.2+)</li>
              </ul>
            </div>
          </section>

          {/* Data Encryption */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Data Encryption</h2>
            </div>
            <div className="text-muted-foreground leading-relaxed space-y-3">
              <p>
                All customer data is encrypted both at rest and in transit:
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li><strong className="text-foreground">At Rest:</strong> AES-256 encryption for all database storage and backups</li>
                <li><strong className="text-foreground">In Transit:</strong> TLS 1.2+ for all network communications</li>
                <li><strong className="text-foreground">Keys:</strong> Cryptographic key management with automated rotation</li>
                <li><strong className="text-foreground">Passwords:</strong> One-way hashing with bcrypt (cost factor 12+)</li>
                <li><strong className="text-foreground">Tokens:</strong> Short-lived JWT tokens with audience and issuer validation</li>
              </ul>
            </div>
          </section>

          {/* Access Control */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Access Control</h2>
            </div>
            <div className="text-muted-foreground leading-relaxed space-y-3">
              <p>
                Access to customer data is governed by role-based access control (RBAC):
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li>Multi-tenant isolation — organizations cannot access other organizations' data</li>
                <li>Principle of least privilege applied to all internal systems and services</li>
                <li>Multi-factor authentication (MFA) enforced for all administrative access</li>
                <li>Session management with idle timeout and concurrent session limits</li>
                <li>Audit logs for all privileged operations and data access events</li>
                <li>IP allowlisting available for enterprise customers</li>
              </ul>
            </div>
          </section>

          {/* Incident Response */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Incident Response</h2>
            </div>
            <div className="text-muted-foreground leading-relaxed space-y-3">
              <p>
                CoAIleague maintains a documented incident response plan that includes:
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li>24/7 automated monitoring and alerting for security anomalies</li>
                <li>Dedicated security incident response team with defined escalation paths</li>
                <li>Customer notification within 72 hours of a confirmed breach (GDPR-compliant)</li>
                <li>Post-incident analysis and remediation reports for affected customers</li>
                <li>Annual tabletop exercises and penetration testing</li>
              </ul>
            </div>
          </section>

          {/* Vulnerability Management */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Vulnerability Management</h2>
            </div>
            <div className="text-muted-foreground leading-relaxed space-y-3">
              <p>
                We maintain an active security posture through:
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li>Continuous dependency scanning and automated patching pipelines</li>
                <li>Static application security testing (SAST) on every code deployment</li>
                <li>Regular third-party penetration tests (at minimum annually)</li>
                <li>Responsible disclosure program — report vulnerabilities to <a href="mailto:security@coaileague.com" className="text-primary underline underline-offset-4">security@coaileague.com</a></li>
                <li>SLA of 24 hours for critical, 7 days for high, 30 days for medium severity findings</li>
              </ul>
            </div>
          </section>

          {/* Compliance */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Compliance & Certifications</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "SOC 2 Type II", desc: "Annual audit — available under NDA", status: "aligned" },
                { label: "GDPR", desc: "EU data protection regulation compliance", status: "compliant" },
                { label: "CCPA", desc: "California consumer privacy compliance", status: "compliant" },
                { label: "HIPAA Ready", desc: "BAA available for healthcare customers", status: "available" },
              ].map((item) => (
                <div key={item.label} className="border rounded-md p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{item.label}</span>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">{item.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Responsible Disclosure */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Responsible Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you discover a security vulnerability in our Platform, please report it
              responsibly. Contact our security team at{" "}
              <a href="mailto:security@coaileague.com" className="text-primary underline underline-offset-4">
                security@coaileague.com
              </a>
              {" "}with a description of the issue, steps to reproduce, and any supporting
              materials. We commit to acknowledging reports within 48 hours and providing
              regular status updates as we investigate and remediate.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We ask that you do not publicly disclose the vulnerability until we have had a
              reasonable opportunity to investigate and address it. We do not pursue legal
              action against good-faith security researchers who follow these guidelines.
            </p>
          </section>

          <div className="border-t pt-6">
            <p className="text-sm text-muted-foreground">
              Security inquiries:{" "}
              <a href="mailto:security@coaileague.com" className="text-primary underline underline-offset-4">
                security@coaileague.com
              </a>
            </p>
            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              <Link href="/legal/aup" className="text-primary hover:underline">Acceptable Use Policy</Link>
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
