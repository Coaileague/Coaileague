import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
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
      name: "Free",
      price: "Free",
      savings: "Try before you buy",
      roi: "Risk-free trial",
      description: "30-day demo - experience the automation",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 5 employees for 30 days", included: true },
        { name: "GPS clock-in/out + time tracking", included: true },
        { name: "Smart scheduling (view-only preview)", included: true },
        { name: "Basic reporting & analytics", included: true },
        { name: "Real data - migrate to paid seamlessly", included: true },
        { name: "Email support", included: true },
        { name: "No credit card required", included: true },
        { name: "Auto-billing & invoicing", included: false },
        { name: "Auto-payroll processing", included: false },
        { name: "QuickBooks/Gusto integrations", included: false },
        { name: "AI-powered features", included: false },
      ],
    },
    {
      name: "Starter",
      price: "$4,999",
      savings: "Net savings: $192K/year",
      roi: "3.2x return",
      description: "Replace your scheduling & billing staff",
      cta: "Start Free Trial",
      popular: true,
      features: [
        { name: "Up to 50 employees", included: true },
        { name: "AI-powered scheduling automation", included: true },
        { name: "Auto-billing & invoicing", included: true },
        { name: "Auto-payroll processing (weekly/bi-weekly)", included: true },
        { name: "GPS + photo verification", included: true },
        { name: "Client portal access", included: true },
        { name: "Advanced analytics & reporting", included: true },
        { name: "$50/mo AI credits included", included: true },
        { name: "$50/employee/mo overages", included: true },
        { name: "Priority email support (12hr)", included: true },
        { name: "QuickBooks/Gusto integrations", included: false },
        { name: "AI-Powered Search & Analytics", included: false },
      ],
    },
    {
      name: "Professional",
      price: "$9,999",
      savings: "Net savings: $215K/year",
      roi: "1.8x return",
      description: "Replace entire HR & admin departments",
      cta: "Start Free Trial",
      features: [
        { name: "Up to 150 employees", included: true },
        { name: "Everything in Starter", included: true },
        { name: "QuickBooks & Gusto integrations", included: true },
        { name: "AI-Powered Natural Language Search", included: true },
        { name: "Autonomous AI Analytics & Predictions", included: true },
        { name: "Predictive scheduling & cost optimization", included: true },
        { name: "Learning Management & Certifications", included: true },
        { name: "Performance Reviews & PTO Management", included: true },
        { name: "$200/mo AI credits included", included: true },
        { name: "$40/employee/mo overages", included: true },
        { name: "Priority Support (4hr)", included: true },
      ],
    },
    {
      name: "Enterprise",
      price: "$17,999",
      savings: "Net savings: $216K/year",
      roi: "1.0x return",
      description: "Fortune 500-grade automation at scale",
      cta: "Contact Sales",
      features: [
        { name: "Unlimited employees", included: true },
        { name: "Everything in Professional", included: true },
        { name: "Advanced AI Search with Custom Data Sources", included: true },
        { name: "AI Premium: Predictive Analytics & Forecasting", included: true },
        { name: "SOC2-Ready Compliance & Audit Trails", included: true },
        { name: "$1,000/mo AI credits included", included: true },
        { name: "White-Label Branding Options", included: true },
        { name: "API Access & Custom Webhooks", included: true },
        { name: "$30/employee/mo overages (volume discount)", included: true },
        { name: "Dedicated Account Manager", included: true },
        { name: "Priority Support (1hr SLA)", included: true },
        { name: "Custom feature development", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      {/* Universal Header */}
      <UniversalHeader variant="public" />

      {/* Pricing Hero */}
      <section className="pt-10 sm:pt-16 md:pt-24 pb-8 sm:pb-12 md:pb-16 px-3 sm:px-4 md:px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 overflow-x-hidden">
        <div className="container mx-auto max-w-7xl px-0 w-full">
        <div className="text-center space-y-2 sm:space-y-3 md:space-y-4 mb-6 sm:mb-8 md:mb-12">
          <Badge className="bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 border-blue-200 mb-2 shadow-md dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700 inline-block text-xs sm:text-sm px-2 sm:px-3">
            <Sparkles className="h-3 w-3 mr-1 shrink-0 inline" />
            <span className="truncate inline">Enterprise-Grade ROI</span>
          </Badge>
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100 px-2 sm:px-3 break-words">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600">Replace $250K-$430K</span> in Administrative Salaries
          </h1>
          <p className="text-xs sm:text-sm md:text-base lg:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2 sm:px-3 break-words">
            Pay once per month. Save $192K-$216K annually in net savings. CoAIleague replaces 3-5 high-end administrative positions with AI automation.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {tiers.map((tier, index) => (
            <Card
              key={tier.name}
              className={`bg-white dark:bg-gray-900 border-2 shadow-md p-3 sm:p-4 md:p-6 lg:p-8 space-y-3 sm:space-y-4 md:space-y-6 relative hover:border-blue-300 hover:shadow-2xl transition-all ${
                tier.popular ? "border-blue-300 shadow-xl" : "border-gray-200 dark:border-gray-700"
              }`}
              data-testid={`card-pricing-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {tier.popular && (
                <Badge className="absolute -top-2 sm:-top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-blue-600 text-white border-none shadow-lg whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
                  Best Value
                </Badge>
              )}

              <div className="space-y-2 sm:space-y-3">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {tier.name}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {tier.description}
                </p>
                
                {/* ROI Badge */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-2 pt-2">
                  <TrendingUp className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-400">
                    {tier.roi}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 break-words">
                    • {tier.savings}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold font-mono text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">
                  {tier.price}
                  {tier.price !== "Contact Sales" && tier.price !== "Custom" && (
                    <span className="text-sm sm:text-lg font-normal text-gray-500 dark:text-gray-400">
                      /mo
                    </span>
                  )}
                </div>
                {tier.price !== "Contact Sales" && tier.price !== "Custom" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Billed annually • 14-day free trial
                  </p>
                )}
              </div>

              <Button
                className={`w-full min-h-[44px] shadow-md ${
                  tier.popular
                    ? "bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                variant={tier.popular ? "default" : "outline"}
                onClick={() => {
                  if (tier.cta === "Contact Sales") {
                    window.location.href = "/contact";
                  } else {
                    window.location.href = `/register?tier=${tier.name.toLowerCase()}`;
                  }
                }}
                data-testid={`button-${tier.name.toLowerCase().replace(/\s+/g, "-")}-cta`}
              >
                {tier.cta}
              </Button>

              <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
                {tier.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm"
                  >
                    {feature.included ? (
                      <Check className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`break-words ${
                        feature.included
                          ? "text-gray-700 dark:text-gray-300"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
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
      <section className="py-8 sm:py-16 px-3 sm:px-6 bg-white dark:bg-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="space-y-4 sm:space-y-6">
            <div className="text-center space-y-2 px-2">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">Why Our Pricing Makes Sense</h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Compare our monthly fee to the staff costs you're replacing
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  plan: "Starter",
                  price: "$4,999/mo",
                  replaces: [
                    "Senior Payroll Specialist ($90k/yr)",
                    "Senior Billing Specialist ($85k/yr)",
                    "Workforce Scheduler ($77.5k/yr)",
                  ],
                  totalSaved: "$252.5k/yr",
                  costOfPlan: "$60k/yr",
                  netSavings: "$192.5k/yr"
                },
                {
                  plan: "Professional",
                  price: "$9,999/mo",
                  replaces: [
                    "Senior Payroll Specialist ($90k/yr)",
                    "Senior Billing Specialist ($85k/yr)",
                    "Workforce Scheduler ($77.5k/yr)",
                    "HR Operations Analyst ($82.5k/yr)",
                  ],
                  totalSaved: "$335k/yr",
                  costOfPlan: "$120k/yr",
                  netSavings: "$215k/yr"
                },
                {
                  plan: "Enterprise",
                  price: "$17,999/mo",
                  replaces: [
                    "Senior Payroll Specialist ($90k/yr)",
                    "Senior Billing Specialist ($85k/yr)",
                    "Workforce Scheduler ($77.5k/yr)",
                    "HR Operations Analyst ($82.5k/yr)",
                    "Admin Operations Manager ($97.5k/yr)",
                  ],
                  totalSaved: "$432.5k/yr",
                  costOfPlan: "$216k/yr",
                  netSavings: "$216k/yr"
                },
              ].map((breakdown) => (
                <div key={breakdown.plan} className="bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-950/30 dark:to-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4 hover:shadow-xl transition-shadow">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                      {breakdown.plan}
                    </h3>
                    <div className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600 font-mono">
                      {breakdown.price}
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                    <div className="text-xs text-blue-700 dark:text-blue-400 uppercase tracking-wide font-semibold">
                      Replaces:
                    </div>
                    {breakdown.replaces.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                        <Check className="h-3 w-3 text-blue-600 shrink-0 mt-0.5" />
                        <span className="break-words text-xs sm:text-sm">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 sm:pt-4 border-t border-blue-300 dark:border-blue-700 space-y-1">
                    <div className="flex justify-between text-xs sm:text-sm gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Annual plan cost:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-mono font-semibold">-{breakdown.costOfPlan}</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm font-semibold pt-2 gap-2">
                      <span className="text-gray-900 dark:text-gray-100">Net savings:</span>
                      <span className="text-blue-700 dark:text-blue-400 font-mono text-sm sm:text-lg">+{breakdown.netSavings}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overage Information */}
            <div className="mt-4 sm:mt-8 p-4 sm:p-6 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-start gap-2 sm:gap-3">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">Fair Usage & Overage Billing</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 break-words">
                    Each plan includes a set number of employees (50 for Starter, 150 for Professional, Unlimited for Enterprise). 
                    If you exceed your plan limit, additional employees are billed at <strong className="text-blue-700 dark:text-blue-400">$50/employee/month for Starter</strong>, 
                    <strong className="text-blue-700 dark:text-blue-400"> $40/employee/month for Professional</strong>, and 
                    <strong className="text-blue-700 dark:text-blue-400"> $30/employee/month for Enterprise</strong>.
                    This ensures you only pay for what you use while scaling efficiently.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Features & Credit Usage */}
            <div className="mt-4 p-4 sm:p-6 bg-purple-50 dark:bg-purple-950/30 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
              <div className="flex items-start gap-2 sm:gap-3">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 shrink-0 mt-0.5" />
                <div className="space-y-2 sm:space-y-3 min-w-0 flex-1">
                  <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">AI Automation Credit Costs</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    All AI automations use credits from your monthly allocation. <strong className="text-purple-700 dark:text-purple-400">No surprise charges</strong> - you control your spending by purchasing additional credits only when needed.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-2">
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI Scheduling</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">25 credits ($2.50) per schedule generation</div>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI Invoice Generation</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">15 credits ($1.50) per invoice</div>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI Payroll Processing</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">15 credits ($1.50) per payroll run</div>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI Chat (HelpAI/QueryOS)</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">5 credits ($0.50) per conversation</div>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI Analytics Reports</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">12 credits ($1.20) per report</div>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-400">Additional Credits</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">100 credits = $10 (buy anytime)</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-purple-200 dark:border-purple-700 break-words">
                    <strong>Example:</strong> Professional plan (2,000 credits = $200/mo included) running 20 schedules (500 credits), 40 invoices (600 credits), 8 payroll runs (120 credits) = 1,220 credits used. Still have 780 credits remaining. No overages.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-8 sm:py-16 px-3 sm:px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="container mx-auto max-w-3xl space-y-4 sm:space-y-8">
          <div className="text-center space-y-2 px-2">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {[
              {
                q: "Why is CoAIleague priced so much higher than other workforce management tools?",
                a: "Because we replace entire positions, not just software. Traditional tools like When I Work or Deputy cost $2-5/employee but still require a payroll specialist ($90K/yr), billing coordinator ($85K/yr), and scheduler ($77K/yr). CoAIleague eliminates these salaries entirely through AI automation. At $4,999-$17,999/month, you save $192K-$216K annually in NET savings—more than paying for itself.",
              },
              {
                q: "What positions does CoAIleague actually replace?",
                a: "CoAIleague replaces 3-5 high-end administrative positions: Senior Payroll Specialist ($90K/yr), Senior Billing Specialist ($85K/yr), Workforce Scheduler ($77K/yr), HR Operations Analyst ($82K/yr), and Admin Operations Manager ($97K/yr). These aren't entry-level roles—they're experienced professionals that cost $250K-$430K/year in combined salaries.",
              },
              {
                q: "Is there still a free trial?",
                a: "Yes! Try CoAIleague free for 30 days with up to 5 employees. All Professional features are unlocked so you can experience the full power of AI automation. No credit card required. When you upgrade, your data migrates seamlessly.",
              },
              {
                q: "Can I start with Starter and upgrade later?",
                a: "Absolutely. Many customers start with Starter ($4,999/mo) to replace 2-3 positions, then upgrade to Professional ($9,999/mo) within 3-6 months as they scale. Your data migrates instantly, and we'll prorate any unused time toward your new plan.",
              },
              {
                q: "What happens if I exceed my employee limit?",
                a: "Additional employees beyond your plan limit are billed per-employee monthly: $50/employee for Starter, $40/employee for Professional, $30/employee for Enterprise (volume discount). Example: 55 employees on Starter (50 included) = $4,999 + (5 × $50) = $5,249/month total.",
              },
              {
                q: "What payment methods do you accept?",
                a: "All major credit cards, ACH transfers, and wire transfers. Enterprise plans ($17,999/mo) can be invoiced quarterly or annually with custom payment terms and net-30/60 arrangements.",
              },
              {
                q: "How does AI feature billing work?",
                a: "AI features (AI Support Bot, Training Tutor, RFP Analysis) use a credit-based system. Each tier includes monthly AI credits: Starter gets $50/mo (500 credits), Professional gets $200/mo (2,000 credits), Enterprise gets $1,000/mo (10,000 credits). Additional credits can be purchased at 100 credits = $10. Most customers stay within their monthly allocation.",
              },
              {
                q: "Is CoAIleague worth it for smaller companies?",
                a: "If you have 10+ employees and currently employ a scheduler, billing coordinator, or payroll specialist, CoAIleague delivers strong ROI immediately. Even at our premium pricing, replacing just 2-3 positions ($252K/year in salaries) costs $60K/year on the Starter plan—a net savings of $192K/year.",
              },
            ].map((faq) => (
              <div
                key={faq.q}
                className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg transition-all"
              >
                <h3 className="font-semibold mb-2 text-sm sm:text-base text-gray-900 dark:text-gray-100">
                  {faq.q}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer variant="light" />
    </div>
  );
}
