import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { Check, X } from "lucide-react";

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: { name: string; included: boolean }[];
  cta: string;
  popular?: boolean;
}

export default function Pricing() {
  const tiers: PricingTier[] = [
    {
      name: "Starter",
      price: "$199",
      description: "Replace manual scheduling - Save $45k/year",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 15 employees", included: true },
        { name: "Smart scheduling with AI suggestions", included: true },
        { name: "Shift templates & recurring", included: true },
        { name: "Time tracking with clock-in/out", included: true },
        { name: "Auto-invoice generation", included: true },
        { name: "Basic analytics dashboard", included: true },
        { name: "Employee portal access", included: true },
        { name: "Email & chat support", included: true },
        { name: "GPS clock-in verification", included: false },
        { name: "Job posting & hiring", included: false },
        { name: "Employee file management", included: false },
        { name: "Audit compliance tools", included: false },
        { name: "API access", included: false },
      ],
    },
    {
      name: "Professional",
      price: "$799",
      description: "Replace HR + Scheduling teams - Save $130k/year",
      cta: "Start Free Trial",
      popular: true,
      features: [
        { name: "Up to 100 employees", included: true },
        { name: "Everything in Starter", included: true },
        { name: "GPS clock-in verification", included: true },
        { name: "Job posting & hiring workflow", included: true },
        { name: "Employee file management", included: true },
        { name: "Audit compliance tools", included: true },
        { name: "Multi-client management", included: true },
        { name: "Manager assignments (RBAC)", included: true },
        { name: "Advanced analytics & forecasting", included: true },
        { name: "Priority support", included: true },
        { name: "Auto-payroll processing", included: false },
        { name: "API access & webhooks", included: false },
        { name: "SSO/SAML integration", included: false },
      ],
    },
    {
      name: "Enterprise",
      price: "$2,499",
      description: "Replace entire workforce operations - Save $250k+/year",
      cta: "Contact Sales",
      features: [
        { name: "Unlimited employees", included: true },
        { name: "Everything in Professional", included: true },
        { name: "Auto-payroll processing", included: true },
        { name: "API access & webhooks", included: true },
        { name: "SSO/SAML integration", included: true },
        { name: "White-label branding", included: true },
        { name: "Custom integrations (ADP, Workday)", included: true },
        { name: "Dedicated account manager", included: true },
        { name: "99.9% uptime SLA", included: true },
        { name: "Priority phone support", included: true },
        { name: "Custom feature development", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--cad-background))] text-[hsl(var(--cad-text-primary))]">
      {/* CAD-Style Top Bar */}
      <div className="h-12 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border-strong))] flex items-center justify-between px-6">
        <WorkforceOSLogo size="sm" showText={true} />
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/"}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.href = "/api/login"}
            className="h-8 text-xs bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
          >
            Launch Platform
          </Button>
        </div>
      </div>

      {/* Pricing Hero */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center space-y-4 mb-12">
          <div className="flex items-center justify-center gap-2">
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
            <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
              Transparent Pricing
            </span>
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            Choose Your Command Level
          </h1>
          <p className="text-lg text-[hsl(var(--cad-text-secondary))] max-w-2xl mx-auto">
            All plans include 14-day free trial. No credit card required.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={`bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-8 space-y-6 relative ${
                tier.popular ? "ring-2 ring-[hsl(var(--cad-blue))]" : ""
              }`}
              data-testid={`card-pricing-${tier.name.toLowerCase()}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--cad-blue))] text-white border-none">
                  Most Popular
                </Badge>
              )}

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-[hsl(var(--cad-text-primary))]">
                  {tier.name}
                </h3>
                <p className="text-sm text-[hsl(var(--cad-text-tertiary))]">
                  {tier.description}
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-4xl font-bold font-mono">
                  {tier.price}
                  {tier.price !== "Custom" && (
                    <span className="text-lg font-normal text-[hsl(var(--cad-text-tertiary))]">
                      /month
                    </span>
                  )}
                </div>
                {tier.price !== "Custom" && (
                  <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                    Billed annually
                  </p>
                )}
              </div>

              <Button
                className={`w-full h-11 ${
                  tier.popular
                    ? "bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
                    : "border-[hsl(var(--cad-border-strong))] text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
                }`}
                variant={tier.popular ? "default" : "outline"}
                onClick={() => window.location.href = "/api/login"}
                data-testid={`button-${tier.name.toLowerCase()}-cta`}
              >
                {tier.cta}
              </Button>

              <div className="space-y-3 pt-4 border-t border-[hsl(var(--cad-border))]">
                {tier.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-start gap-3 text-sm"
                  >
                    {feature.included ? (
                      <Check className="h-5 w-5 text-[hsl(var(--cad-green))] flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-5 w-5 text-[hsl(var(--cad-text-tertiary))]/30 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        feature.included
                          ? "text-[hsl(var(--cad-text-primary))]"
                          : "text-[hsl(var(--cad-text-tertiary))]/60"
                      }
                    >
                      {feature.name}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "What's included in the free trial?",
                a: "All features of the Professional plan for 14 days. No credit card required.",
              },
              {
                q: "Can I change plans later?",
                a: "Yes, you can upgrade or downgrade at any time. Changes take effect at the next billing cycle.",
              },
              {
                q: "What payment methods do you accept?",
                a: "We accept all major credit cards, ACH transfers, and wire transfers for Enterprise plans.",
              },
              {
                q: "Is there a setup fee?",
                a: "No setup fees for Starter and Professional. Enterprise includes white-glove onboarding.",
              },
              {
                q: "What happens if I exceed my employee limit?",
                a: "You'll be prompted to upgrade to the next tier. We never restrict access unexpectedly.",
              },
            ].map((faq) => (
              <Card
                key={faq.q}
                className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-6"
              >
                <h3 className="font-semibold mb-2 text-[hsl(var(--cad-text-primary))]">
                  {faq.q}
                </h3>
                <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                  {faq.a}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--cad-border))] bg-[hsl(var(--cad-chrome))]">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--cad-text-tertiary))]">
              <WorkforceOSLogo size="sm" showText={false} />
              <span>© 2025 WorkforceOS. Fortune 500-grade workforce automation.</span>
            </div>
            <div className="flex gap-6 text-xs text-[hsl(var(--cad-text-tertiary))]">
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">
                Documentation
              </a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">
                Privacy
              </a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
