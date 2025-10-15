import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { Check, X, TrendingUp, Sparkles } from "lucide-react";

interface PricingTier {
  name: string;
  price: string;
  description: string;
  savings: string;
  features: { name: string; included: boolean }[];
  cta: string;
  popular?: boolean;
  roi: string;
}

export default function Pricing() {
  const tiers: PricingTier[] = [
    {
      name: "Starter",
      price: "$299",
      savings: "$5k-$8k/month",
      roi: "20x ROI",
      description: "Essential automation - Replace 1-2 part-time staff",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 25 employees", included: true },
        { name: "Smart scheduling with drag-and-drop", included: true },
        { name: "Auto-billing & invoice generation", included: true },
        { name: "Time tracking with GPS clock-in", included: true },
        { name: "Basic RMS reporting", included: true },
        { name: "Employee & client portals", included: true },
        { name: "CSV exports", included: true },
        { name: "Email support", included: true },
        { name: "Auto-payroll processing", included: false },
        { name: "PDF exports & analytics", included: false },
        { name: "API access & webhooks", included: false },
        { name: "White-label branding", included: false },
      ],
    },
    {
      name: "Professional",
      price: "$799",
      savings: "$10k-$15k/month",
      roi: "15x ROI",
      description: "Replace scheduler + billing clerk + payroll staff",
      cta: "Start Free Trial",
      popular: true,
      features: [
        { name: "Up to 100 employees", included: true },
        { name: "Everything in Starter", included: true },
        { name: "Auto-payroll processing", included: true },
        { name: "Advanced scheduling with conflict detection", included: true },
        { name: "Full RMS with photo verification", included: true },
        { name: "Shift orders & post orders", included: true },
        { name: "Auditor/bookkeeper portal", included: true },
        { name: "PDF exports & advanced analytics", included: true },
        { name: "Priority email & chat support", included: true },
        { name: "API access & webhooks", included: false },
        { name: "White-label branding", included: false },
        { name: "Dedicated account manager", included: false },
      ],
    },
    {
      name: "Enterprise",
      price: "$2,999",
      savings: "$25k-$40k/month",
      roi: "12x ROI",
      description: "Replace HR + Payroll + Billing + Scheduling teams",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 500 employees", included: true },
        { name: "Everything in Professional", included: true },
        { name: "API access & webhooks", included: true },
        { name: "Custom integrations", included: true },
        { name: "Advanced analytics & forecasting", included: true },
        { name: "Multi-workspace management", included: true },
        { name: "SOC2-ready audit compliance", included: true },
        { name: "Priority support (2-hour response)", included: true },
        { name: "Dedicated account manager", included: true },
        { name: "White-label branding", included: false },
        { name: "Custom feature development", included: false },
      ],
    },
    {
      name: "Fortune 500",
      price: "$7,999",
      savings: "$60k-$120k/month",
      roi: "10x ROI",
      description: "Complete workforce automation - Replace entire departments",
      cta: "Contact Sales",
      features: [
        { name: "Unlimited employees & clients", included: true },
        { name: "Everything in Enterprise", included: true },
        { name: "White-label RMS branding", included: true },
        { name: "Custom domain & SSL", included: true },
        { name: "Custom feature development", included: true },
        { name: "99.99% uptime SLA", included: true },
        { name: "Priority phone support (30-min response)", included: true },
        { name: "White-glove onboarding & training", included: true },
        { name: "Monthly executive business reviews", included: true },
        { name: "Custom integrations (ADP, Workday, QuickBooks)", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-gradient text-white">
      {/* Modern Header */}
      <div className="bg-card-translucent border-b border-indigo-500/20 backdrop-blur-sm">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <WorkforceOSLogo size="sm" showText={true} />
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/"}
              className="text-slate-400 hover:text-white"
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => window.location.href = "/api/login"}
              className="bg-indigo-gradient btn-scale"
            >
              Launch Platform
            </Button>
          </div>
        </div>
      </div>

      {/* Pricing Hero */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center space-y-4 mb-12 animate-slide-up">
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 mb-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Enterprise-Grade ROI
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            <span className="gradient-text">Investment That Pays Itself</span> In Weeks
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Replace entire departments. Save $100k-$500k annually. All plans include 14-day free trial.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {tiers.map((tier, index) => (
            <Card
              key={tier.name}
              className={`card-interactive hover-lift p-8 space-y-6 relative animate-slide-up ${
                tier.popular ? "border-indigo-500/50" : ""
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
              data-testid={`card-pricing-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-gradient text-white border-none">
                  Best Value
                </Badge>
              )}

              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-white">
                  {tier.name}
                </h3>
                <p className="text-sm text-slate-400">
                  {tier.description}
                </p>
                
                {/* ROI Badge */}
                <div className="flex items-center gap-2 pt-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {tier.roi}
                  </span>
                  <span className="text-xs text-slate-500">
                    • Save {tier.savings}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-4xl font-bold font-mono gradient-text">
                  {tier.price}
                  {tier.price !== "Contact Sales" && (
                    <span className="text-lg font-normal text-slate-400">
                      /mo
                    </span>
                  )}
                </div>
                {tier.price !== "Contact Sales" && (
                  <p className="text-xs text-slate-500">
                    Billed annually • 14-day free trial
                  </p>
                )}
              </div>

              <Button
                className={`w-full h-11 btn-scale ${
                  tier.popular
                    ? "bg-indigo-gradient"
                    : ""
                }`}
                variant={tier.popular ? "default" : "outline"}
                onClick={() => window.location.href = tier.cta === "Contact Sales" ? "mailto:sales@workforceos.com" : "/api/login"}
                data-testid={`button-${tier.name.toLowerCase().replace(/\s+/g, "-")}-cta`}
              >
                {tier.cta}
              </Button>

              <div className="space-y-3 pt-4 border-t border-slate-700">
                {tier.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-start gap-3 text-sm"
                  >
                    {feature.included ? (
                      <Check className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        feature.included
                          ? "text-slate-300"
                          : "text-slate-600"
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

        {/* Cost Breakdown */}
        <div className="mt-16 max-w-4xl mx-auto card-interactive hover-lift p-8">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold gradient-text">Why Our Pricing Makes Sense</h2>
              <p className="text-sm text-slate-400">
                Compare our monthly fee to the staff costs you're replacing
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  plan: "Professional",
                  price: "$799/mo",
                  replaces: ["Scheduler ($45k/yr)", "Billing Clerk ($40k/yr)"],
                  totalSaved: "$85k/yr",
                  costOfPlan: "$9.5k/yr",
                  netSavings: "$75.5k/yr"
                },
                {
                  plan: "Enterprise",
                  price: "$2,999/mo",
                  replaces: ["HR Manager ($65k/yr)", "Payroll ($50k/yr)", "Scheduler ($45k/yr)", "Billing ($40k/yr)"],
                  totalSaved: "$200k/yr",
                  costOfPlan: "$36k/yr",
                  netSavings: "$164k/yr"
                },
                {
                  plan: "Fortune 500",
                  price: "$7,999/mo",
                  replaces: ["Full HR Dept ($255k/yr)", "Compliance ($55k/yr)", "Benefits ($195k/yr)"],
                  totalSaved: "$505k/yr",
                  costOfPlan: "$96k/yr",
                  netSavings: "$409k/yr"
                },
              ].map((breakdown) => (
                <div key={breakdown.plan} className="bg-slate-900/50 border border-indigo-500/20 rounded-lg p-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg text-white">
                      {breakdown.plan}
                    </h3>
                    <div className="text-2xl font-bold text-indigo-400 font-mono">
                      {breakdown.price}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">
                      Replaces:
                    </div>
                    {breakdown.replaces.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-slate-300">
                        <Check className="h-3 w-3 text-emerald-400" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-700 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Annual plan cost:</span>
                      <span className="text-rose-400 font-mono">-{breakdown.costOfPlan}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold pt-2">
                      <span className="text-white">Net savings:</span>
                      <span className="text-emerald-400 font-mono text-lg">+{breakdown.netSavings}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold gradient-text">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "Why are the prices higher than competitors?",
                a: "Because we replace 3-5 full-time staff positions with complete automation. Our Enterprise plan costs $36k/year but saves you $164k annually - that's a 4.5x return. Most competitors only replace scheduling, not your entire HR department.",
              },
              {
                q: "What's included in the free trial?",
                a: "Full access to all features in your chosen plan for 14 days. No credit card required. Experience GPS clock-ins, auto-payroll, smart scheduling, and RMS reporting risk-free.",
              },
              {
                q: "Can I start with Professional and upgrade later?",
                a: "Absolutely. Most customers start with Professional and upgrade within 3-6 months as they see ROI. Your data migrates seamlessly, and we'll credit any unused time toward your new plan.",
              },
              {
                q: "What payment methods do you accept?",
                a: "All major credit cards, ACH transfers, and wire transfers. Fortune 500 plans include net-30 payment terms and can be invoiced quarterly or annually.",
              },
              {
                q: "Is implementation included?",
                a: "Professional includes self-service setup with video tutorials. Enterprise includes guided onboarding. Fortune 500 includes white-glove implementation with a dedicated account manager.",
              },
              {
                q: "What if I need custom features?",
                a: "Fortune 500 plans include custom feature development. We'll work with your team to build integrations, custom reports, or workflow automations specific to your business.",
              },
            ].map((faq) => (
              <div
                key={faq.q}
                className="card-interactive p-6 hover-lift"
              >
                <h3 className="font-semibold mb-2 text-white">
                  {faq.q}
                </h3>
                <p className="text-sm text-slate-400">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-indigo-500/20 bg-card-translucent backdrop-blur-sm">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <WorkforceOSLogo size="sm" showText={false} />
              <span>© 2025 WorkforceOS. Fortune 500-grade workforce automation.</span>
            </div>
            <div className="flex gap-6 text-xs text-slate-400">
              <a href="/support" className="hover:text-white transition-colors" data-testid="link-support">
                Support Center
              </a>
              <a href="/contact" className="hover:text-white transition-colors" data-testid="link-contact">
                Contact Us
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
