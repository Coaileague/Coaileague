import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
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
        { name: "AI-Powered Search", included: false },
        { name: "AI Analytics", included: false },
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
        { name: "Smart Billing - Auto-billing & invoicing (weekly/bi-weekly)", included: true },
        { name: "Auto Payroll - Payroll processing (weekly/bi-weekly)", included: true },
        { name: "GPS + photo verification", included: true },
        { name: "Advanced analytics & reporting", included: true },
        { name: "Client portal access", included: true },
        { name: "$15/employee/mo overages", included: true },
        { name: "Priority email support (24hr)", included: true },
        { name: "AI-Powered Search", included: false },
        { name: "AI Analytics", included: false },
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
        { name: "AI-Powered Natural Language Search", included: true },
        { name: "Autonomous AI Analytics & Predictions", included: true },
        { name: "Predictive scheduling & cost optimization", included: true },
        { name: "Learning Management & Certifications", included: true },
        { name: "Performance Reviews & PTO Management", included: true },
        { name: "Integrations - QuickBooks, Stripe, etc.", included: true },
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
        { name: "Advanced AI Search with Custom Data Sources", included: true },
        { name: "AI Premium: Predictive Analytics & Forecasting", included: true },
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
    <div className="min-h-screen bg-white">
      {/* Modern Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md border-b border-gray-200">
        <div className="container mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="shrink-0">
            {/* Desktop: Show full logo */}
            <div className="hidden sm:block">
              <AnimatedAutoForceLogo size="sm" variant="full" />
            </div>
            {/* Mobile: Show icon only */}
            <div className="block sm:hidden">
              <AnimatedAutoForceLogo size="sm" variant="icon" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              className="min-h-[44px] px-3 text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap"
              onClick={() => window.location.href = "/"}
              data-testid="button-back"
            >
              Back
            </Button>
            <Button
              className="min-h-[44px] px-3 sm:px-4 text-sm bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white whitespace-nowrap shadow-md"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-launch-platform"
            >
              <span className="hidden sm:inline">Launch Platform</span>
              <span className="sm:hidden">Login</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Pricing Hero */}
      <section className="pt-24 pb-16 px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50">
        <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-12">
          <Badge className="bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 border-blue-200 mb-2 shadow-md">
            <Sparkles className="h-3 w-3 mr-1" />
            Enterprise-Grade ROI
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600">Investment That Pays Itself</span> In Weeks
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Replace entire departments. Save $100k-$500k annually. All plans include 14-day free trial.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier, index) => (
            <Card
              key={tier.name}
              className={`bg-white border-2 shadow-md p-8 space-y-6 relative hover:border-blue-300 hover:shadow-2xl transition-all ${
                tier.popular ? "border-blue-300 shadow-xl" : "border-gray-200"
              }`}
              data-testid={`card-pricing-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-blue-600 text-white border-none shadow-lg">
                  Best Value
                </Badge>
              )}

              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-gray-900">
                  {tier.name}
                </h3>
                <p className="text-sm text-gray-600">
                  {tier.description}
                </p>
                
                {/* ROI Badge */}
                <div className="flex items-center gap-2 pt-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">
                    {tier.roi}
                  </span>
                  <span className="text-xs text-gray-500">
                    • {tier.savings}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-4xl font-bold font-mono text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">
                  {tier.price}
                  {tier.price !== "Contact Sales" && tier.price !== "Custom" && (
                    <span className="text-lg font-normal text-gray-500">
                      /mo
                    </span>
                  )}
                </div>
                {tier.price !== "Contact Sales" && tier.price !== "Custom" && (
                  <p className="text-xs text-gray-500">
                    Billed annually • 14-day free trial
                  </p>
                )}
              </div>

              <Button
                className={`w-full h-11 shadow-md ${
                  tier.popular
                    ? "bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white"
                    : "bg-white text-gray-900 border-2 border-gray-300 hover:border-blue-400 hover:bg-gray-50"
                }`}
                variant={tier.popular ? "default" : "outline"}
                onClick={() => window.location.href = tier.cta === "Contact Sales" ? "/contact" : "/api/login"}
                data-testid={`button-${tier.name.toLowerCase().replace(/\s+/g, "-")}-cta`}
              >
                {tier.cta}
              </Button>

              <div className="space-y-3 pt-4 border-t border-gray-200">
                {tier.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-start gap-3 text-sm"
                  >
                    {feature.included ? (
                      <Check className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        feature.included
                          ? "text-gray-700"
                          : "text-gray-400"
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
        </div>
      </section>

      {/* Cost Breakdown */}
      <section className="py-16 px-6 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">Why Our Pricing Makes Sense</h2>
              <p className="text-gray-600">
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
                <div key={breakdown.plan} className="bg-gradient-to-br from-blue-50 to-blue-50 border-2 border-blue-200 rounded-xl p-6 space-y-4 hover:shadow-xl transition-shadow">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg text-gray-900">
                      {breakdown.plan}
                    </h3>
                    <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600 font-mono">
                      {breakdown.price}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="text-xs text-blue-700 uppercase tracking-wide font-semibold">
                      Replaces:
                    </div>
                    {breakdown.replaces.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-gray-700">
                        <Check className="h-3 w-3 text-blue-600" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-blue-300 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Annual plan cost:</span>
                      <span className="text-blue-600 font-mono font-semibold">-{breakdown.costOfPlan}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold pt-2">
                      <span className="text-gray-900">Net savings:</span>
                      <span className="text-blue-700 font-mono text-lg">+{breakdown.netSavings}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overage Information */}
            <div className="mt-8 p-6 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-gray-900">Fair Usage & Overage Billing</h3>
                  <p className="text-sm text-gray-700">
                    Each plan includes a set number of employees (25 for Starter, 150 for Professional). 
                    If you exceed your plan limit, additional employees are billed at <strong className="text-blue-700">$15/employee/month</strong>.
                    This ensures you only pay for what you use while maintaining consistent pricing.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Features & Token Usage */}
            <div className="mt-4 p-6 bg-purple-50 border-2 border-purple-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">AI Features & Token Usage</h3>
                  <p className="text-sm text-gray-700">
                    AI-powered features (AI Support Bot, AI Training Tutor, Smart RFP Analysis, Platform Healing) operate on a <strong className="text-purple-700">customer-pays usage model</strong> to ensure fair pricing as we scale.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-purple-700">AI Support Bot</div>
                      <div className="text-xs text-gray-600">$0.002 per message • ~$0.50 avg per session</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-purple-700">AI Training Tutor</div>
                      <div className="text-xs text-gray-600">$0.003 per interaction • ~$2 avg per course</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-purple-700">Smart RFP Analysis</div>
                      <div className="text-xs text-gray-600">$0.10 per RFP document analyzed</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-purple-700">Platform Healing AI</div>
                      <div className="text-xs text-gray-600">$0.005 per diagnostic session</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 pt-2 border-t border-purple-200">
                    <strong>Example:</strong> Professional plan with 50 employees using AI features moderately: Base $999/mo + ~$25/mo AI usage = $1,024/mo total (still saving $100k+/year vs. traditional staffing).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50">
        <div className="container mx-auto max-w-3xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How does AutoForce™ save me money?",
                a: "AutoForce™ automates tasks traditionally handled by multiple staff members. At $999/month for Professional, you save over $100k/year by replacing HR coordinators, payroll specialists, and training platforms. The ROI is typically 10-20x your monthly investment.",
              },
              {
                q: "What's included in the free trial?",
                a: "Full access to all features in your chosen plan for 14 days. No credit card required. Experience smart scheduling, automated payroll, time tracking, and client portals risk-free.",
              },
              {
                q: "Can I start with Starter and upgrade later?",
                a: "Absolutely. Most customers start with Starter ($599/mo) and upgrade to Professional ($999/mo) within 3-6 months as they see ROI. Your data migrates seamlessly, and we'll credit any unused time toward your new plan.",
              },
              {
                q: "What happens if I exceed my employee limit?",
                a: "No problem! Additional employees beyond your plan limit are billed at $15/employee/month. For example, if you have 55 employees on the Starter plan (50 included), you'll pay $599 + (5 × $15) = $674/month total.",
              },
              {
                q: "What payment methods do you accept?",
                a: "All major credit cards, ACH transfers, and wire transfers. Enterprise plans can be invoiced quarterly or annually with custom payment terms.",
              },
              {
                q: "How does AI feature billing work?",
                a: "AI-powered features (AI Support, AI Training, RFP Analysis, Platform Healing) use a customer-pays usage model where you only pay for what you use. Typical costs are very low: $0.002-$0.10 per interaction. Most businesses see $10-$50/month in AI usage, still providing 10-20x ROI compared to traditional solutions. Detailed usage appears on your monthly invoice.",
              },
              {
                q: "What if I need custom features?",
                a: "Enterprise plans include API access, webhooks, and custom integration assistance. Our team can help you connect AutoForce™ to your existing tools and workflows. Future roadmap includes custom feature development and white-label options—contact sales to discuss.",
              },
            ].map((faq) => (
              <div
                key={faq.q}
                className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-lg transition-all"
              >
                <h3 className="font-semibold mb-2 text-gray-900">
                  {faq.q}
                </h3>
                <p className="text-sm text-gray-600">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <AnimatedAutoForceLogo size="sm" variant="icon" />
              <span className="text-xs sm:text-sm">© 2025 AutoForce™ by Drill Consulting 360. Enterprise-grade workforce automation.</span>
            </div>
            <div className="flex gap-4 sm:gap-6 text-xs text-gray-600">
              <a href="/support" className="hover:text-blue-600 transition-colors" data-testid="link-support">
                Support Center
              </a>
              <a href="/contact" className="hover:text-blue-600 transition-colors" data-testid="link-contact">
                Contact Us
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
