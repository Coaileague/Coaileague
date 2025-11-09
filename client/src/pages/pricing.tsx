import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoForceLogo } from "@/components/autoforce-logo";
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
      name: "Basic",
      price: "$299",
      savings: "Save $4k/month",
      roi: "13x ROI",
      description: "Manual workforce management tools",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 25 employees", included: true },
        { name: "Manual scheduling & time tracking", included: true },
        { name: "Basic invoicing (manual entry)", included: true },
        { name: "GPS clock-in/out verification", included: true },
        { name: "Basic reports (PDF export)", included: true },
        { name: "$20/employee/mo overages", included: true },
        { name: "Email Support (48hr)", included: true },
        { name: "Auto-billing & invoicing", included: false },
        { name: "Auto-payroll processing", included: false },
        { name: "RecordOS™ - AI Search", included: false },
        { name: "InsightOS™ - AI Analytics", included: false },
      ],
    },
    {
      name: "Starter",
      price: "$599",
      savings: "Save $15k/month",
      roi: "25x ROI",
      description: "Full automation for growing teams",
      cta: "Start Free Trial",
      popular: true,
      features: [
        { name: "Up to 50 employees", included: true },
        { name: "Smart scheduling & auto-assignment", included: true },
        { name: "BillOS™ - Auto-billing & invoicing (weekly/bi-weekly)", included: true },
        { name: "PayrollOS™ - Auto-payroll processing (weekly/bi-weekly)", included: true },
        { name: "GPS + photo verification", included: true },
        { name: "Advanced analytics & reporting", included: true },
        { name: "Client portal access", included: true },
        { name: "$15/employee/mo overages", included: true },
        { name: "Priority email support (24hr)", included: true },
        { name: "RecordOS™ - AI Search", included: false },
        { name: "InsightOS™ - AI Analytics", included: false },
      ],
    },
    {
      name: "Professional",
      price: "$999",
      savings: "Save $40k/month",
      roi: "40x ROI",
      description: "AI-powered workforce intelligence",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 150 employees", included: true },
        { name: "Everything in Starter", included: true },
        { name: "RecordOS™ - AI-Powered Natural Language Search", included: true },
        { name: "InsightOS™ - Autonomous AI Analytics & Predictions", included: true },
        { name: "Predictive scheduling & cost optimization", included: true },
        { name: "TrainingOS™ - LMS & Certifications", included: true },
        { name: "Performance Reviews & PTO Management", included: true },
        { name: "IntegrationOS™ - QuickBooks, Stripe, etc.", included: true },
        { name: "$150/mo AI credits included", included: true },
        { name: "$12/employee/mo overages", included: true },
        { name: "Priority Support (8hr)", included: true },
      ],
    },
    {
      name: "Enterprise",
      price: "$2,999",
      savings: "Save $100k/month",
      roi: "33x ROI",
      description: "Complete workforce automation at scale",
      cta: "Contact Sales",
      features: [
        { name: "Unlimited employees", included: true },
        { name: "Everything in Professional", included: true },
        { name: "Advanced RecordOS™ with Custom Data Sources", included: true },
        { name: "InsightOS™ Premium: Predictive Analytics & Forecasting", included: true },
        { name: "SOC2-Ready Compliance & Audit Trails", included: true },
        { name: "$500/mo AI credits included", included: true },
        { name: "White-Label Branding Options", included: true },
        { name: "API Access & Custom Webhooks", included: true },
        { name: "$10/employee/mo overages", included: true },
        { name: "Dedicated Account Manager", included: true },
        { name: "Priority Support (2hr)", included: true },
        { name: "Custom feature development", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-gradient text-white">
      {/* Modern Header */}
      <div className="bg-card-translucent border-b border-primary/20 backdrop-blur-sm">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <AutoForceLogo size="sm" variant="full" />
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
              className="bg-gradient-to-r from-primary to-accent btn-scale"
            >
              Launch Platform
            </Button>
          </div>
        </div>
      </div>

      {/* Pricing Hero */}
      <section className="responsive-container responsive-spacing-y">
        <div className="text-center space-y-4 mb-12 animate-slide-up fix-overflow">
          <Badge className="bg-muted/10 text-primary border-primary/20 mb-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Enterprise-Grade ROI
          </Badge>
          <h1 className="responsive-h1 text-wrap-auto">
            <span className="gradient-text">Investment That Pays Itself</span> In Weeks
          </h1>
          <p className="responsive-body text-slate-400 max-w-2xl mx-auto text-wrap-auto">
            Replace entire departments. Save $100k-$500k annually. All plans include 14-day free trial.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {tiers.map((tier, index) => (
            <Card
              key={tier.name}
              className={`card-interactive hover-lift p-8 space-y-6 relative animate-slide-up ${
                tier.popular ? "border-primary/50" : ""
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
              data-testid={`card-pricing-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-accent text-white border-none">
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
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
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
                    ? "bg-gradient-to-r from-primary to-accent"
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
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
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
                  plan: "Starter",
                  price: "$299/mo",
                  replaces: ["Part-time Scheduler ($2.5k/mo)", "Time Tracking Software ($500/mo)", "Manual Invoicing ($1k/mo)"],
                  totalSaved: "$48k/yr",
                  costOfPlan: "$3.6k/yr",
                  netSavings: "$44k/yr"
                },
                {
                  plan: "Professional",
                  price: "$999/mo",
                  replaces: ["HR Coordinator ($55k/yr)", "Payroll Specialist ($48k/yr)", "LMS Platform ($12k/yr)"],
                  totalSaved: "$115k/yr",
                  costOfPlan: "$12k/yr",
                  netSavings: "$103k/yr"
                },
                {
                  plan: "Enterprise",
                  price: "Custom",
                  replaces: ["HR Manager ($120k/yr)", "Full Payroll Team ($180k/yr)", "Benefits Admin ($85k/yr)", "Training Coordinator ($65k/yr)"],
                  totalSaved: "$450k/yr",
                  costOfPlan: "Custom",
                  netSavings: "$300k+/yr"
                },
              ].map((breakdown) => (
                <div key={breakdown.plan} className="bg-slate-900/50 border border-primary/20 rounded-lg p-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg text-white">
                      {breakdown.plan}
                    </h3>
                    <div className="text-2xl font-bold text-primary font-mono">
                      {breakdown.price}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">
                      Replaces:
                    </div>
                    {breakdown.replaces.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-slate-300">
                        <Check className="h-3 w-3 text-primary" />
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
                      <span className="text-primary font-mono text-lg">+{breakdown.netSavings}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overage Information */}
            <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-white">Fair Usage & Overage Billing</h3>
                  <p className="text-sm text-slate-400">
                    Each plan includes a set number of employees (25 for Starter, 100 for Professional). 
                    If you exceed your plan limit, additional employees are billed at <strong className="text-amber-400">$15/employee/month</strong>.
                    This ensures you only pay for what you use while maintaining consistent pricing.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Features & Token Usage */}
            <div className="mt-4 p-6 bg-muted/5 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <h3 className="font-semibold text-white">AI Features & Token Usage</h3>
                  <p className="text-sm text-slate-400">
                    AI-powered features (HelpOS™ Support Bot, TrainingOS™ AI, Smart RFP Analysis, Platform Healing) operate on a <strong className="text-primary">customer-pays usage model</strong> to ensure fair pricing as we scale.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-primary">HelpOS™ Support Bot</div>
                      <div className="text-xs text-slate-400">$0.002 per message • ~$0.50 avg per session</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-primary">TrainingOS™ AI Tutor</div>
                      <div className="text-xs text-slate-400">$0.003 per interaction • ~$2 avg per course</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-primary">Smart RFP Analysis</div>
                      <div className="text-xs text-slate-400">$0.10 per RFP document analyzed</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-primary">Platform Healing AI</div>
                      <div className="text-xs text-slate-400">$0.005 per diagnostic session</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 pt-2 border-t border-primary/10">
                    <strong>Example:</strong> Professional plan with 50 employees using AI features moderately: Base $999/mo + ~$25/mo AI usage = $1,024/mo total (still saving $100k+/year vs. traditional staffing).
                  </p>
                </div>
              </div>
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
                q: "How does WorkforceOS save me money?",
                a: "WorkforceOS automates tasks traditionally handled by multiple staff members. At $999/month for Professional, you save over $100k/year by replacing HR coordinators, payroll specialists, and training platforms. The ROI is typically 10-20x your monthly investment.",
              },
              {
                q: "What's included in the free trial?",
                a: "Full access to all features in your chosen plan for 14 days. No credit card required. Experience smart scheduling, automated payroll, time tracking, and client portals risk-free.",
              },
              {
                q: "Can I start with Starter and upgrade later?",
                a: "Absolutely. Most customers start with Starter ($299/mo) and upgrade to Professional ($999/mo) within 3-6 months as they see ROI. Your data migrates seamlessly, and we'll credit any unused time toward your new plan.",
              },
              {
                q: "What happens if I exceed my employee limit?",
                a: "No problem! Additional employees beyond your plan limit are billed at $15/employee/month. For example, if you have 30 employees on the Starter plan (25 included), you'll pay $299 + (5 × $15) = $374/month total.",
              },
              {
                q: "What payment methods do you accept?",
                a: "All major credit cards, ACH transfers, and wire transfers. Enterprise plans can be invoiced quarterly or annually with custom payment terms.",
              },
              {
                q: "How does AI feature billing work?",
                a: "AI-powered features (HelpOS™, TrainingOS™, RFP Analysis, Platform Healing) use a customer-pays usage model where you only pay for what you use. Typical costs are very low: $0.002-$0.10 per interaction. Most businesses see $10-$50/month in AI usage, still providing 10-20x ROI compared to traditional solutions. Detailed usage appears on your monthly invoice.",
              },
              {
                q: "What if I need custom features?",
                a: "Enterprise plans include API access, webhooks, and custom integration assistance. Our team can help you connect AutoForce™ to your existing tools and workflows. Future roadmap includes custom feature development and white-label options—contact sales to discuss.",
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
      <footer className="border-t border-primary/20 bg-card-translucent backdrop-blur-sm">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <AutoForceLogo size="sm" variant="icon" />
              <span>© 2025 WorkForceOS by Drill Consulting 360. Enterprise-grade workforce automation.</span>
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
