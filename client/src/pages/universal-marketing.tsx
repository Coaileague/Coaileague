import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SEO, PAGE_SEO } from '@/components/seo';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SchedulePreview } from "@/components/schedule-preview";
import { PricingROICalculator } from "@/components/pricing-roi-calculator";
import { Check, X, TrendingUp, Sparkles, ArrowRight, Shield, Lock, Award } from "lucide-react";
import { MARKETING, getFormattedPrice } from "@shared/marketingConfig";

interface Section {
  id: 'landing' | 'pricing' | 'sales';
  label: string;
}

type BillingCycle = 'monthly' | 'annual';

export default function UniversalMarketing() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section['id']>('landing');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  // Read section from URL path or params
  useEffect(() => {
    // Check if the URL path is /pricing
    if (window.location.pathname === '/pricing') {
      setSection('pricing');
      return;
    }
    // Check URL params as fallback
    const params = new URLSearchParams(window.location.search);
    const s = params.get('section') as Section['id'];
    if (s && ['landing', 'pricing', 'sales'].includes(s)) {
      setSection(s);
    }
  }, []);

  const handleNavigation = (newSection: Section['id']) => {
    setSection(newSection);
    if (newSection === 'pricing') {
      window.history.pushState({}, '', '/pricing');
    } else if (newSection === 'landing') {
      window.history.pushState({}, '', '/');
    } else {
      window.history.pushState({}, '', `/?section=${newSection}`);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      <SEO
        title={PAGE_SEO.pricing.title}
        description={PAGE_SEO.pricing.description}
        canonical="https://www.coaileague.com/pricing"
      />
      <UniversalHeader variant="public" />

      <main className="flex-1">
      {/* LANDING SECTION */}
      {section === 'landing' && (
        <>
          {/* Hero */}
          <section className="pt-16 md:pt-24 pb-8 md:pb-16 px-3 sm:px-4 md:px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 mobile-compact-p mobile-text-scale">
            <div className="container mx-auto max-w-7xl">
              <div className="text-center space-y-4 md:space-y-6 mb-8 md:mb-12">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 border border-blue-200 shadow-md dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700 text-[10px] sm:text-xs font-medium">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span className="truncate">{MARKETING.landing.hero.badge}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-600">
                    {MARKETING.landing.hero.headline}
                  </span>
                </h1>

                <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  {MARKETING.landing.hero.subheadline}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 mobile-flex-col mobile-gap-3">
                  <Button size="lg" className="w-full sm:w-auto" onClick={() => setLocation('/register?tier=free')}>
                    {MARKETING.landing.hero.cta.primary}
                  </Button>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    {MARKETING.landing.hero.cta.secondary}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-3 sm:gap-6 justify-center pt-4 text-xs sm:text-sm text-muted-foreground mobile-flex-col mobile-gap-2">
                  {MARKETING.landing.hero.trustSignals.map((signal) => (
                    <div key={signal.text} className="flex items-center gap-2">
                      {signal.icon === 'Shield' && <Shield className="h-4 w-4 text-primary" />}
                      {signal.icon === 'Lock' && <Lock className="h-4 w-4 text-primary" />}
                      {signal.icon === 'Award' && <Award className="h-4 w-4 text-primary" />}
                      <span>{signal.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedule Preview - Show real product value */}
              <div className="relative max-w-4xl mx-auto">
                <SchedulePreview />
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="border-b py-8 md:py-12">
            <div className="container mx-auto max-w-4xl px-3 sm:px-4 md:px-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-8 text-center mobile-cols-1 mobile-gap-4">
                {MARKETING.landing.stats.map((stat) => (
                  <div key={stat.label} className="space-y-2">
                    <div className="text-3xl md:text-4xl font-bold text-primary">{stat.number}</div>
                    <div className="text-sm md:text-base font-medium text-gray-900 dark:text-gray-100">{stat.label}</div>
                    <div className="text-xs md:text-sm text-muted-foreground">{stat.context}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Features Grid */}
          <section className="py-6 md:py-16 px-3 sm:px-4 md:px-6 mobile-compact-p">
            <div className="container mx-auto max-w-7xl">
              <h2 className="text-xl md:text-3xl font-bold text-center mb-6 md:mb-12">AI-Powered Capabilities</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mobile-cols-1 mobile-gap-4">
                {MARKETING.landing.features.map((feature) => (
                  <Card key={feature.title} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {feature.benefits.map((benefit) => (
                          <li key={benefit} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <section className="py-6 md:py-16 bg-gray-50 dark:bg-gray-900/50 px-3 sm:px-4 md:px-6 mobile-compact-p">
            <div className="container mx-auto max-w-7xl">
              <h2 className="text-xl md:text-3xl font-bold text-center mb-6 md:mb-12">Trusted by Industry Leaders</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mobile-cols-1 mobile-gap-4">
                {MARKETING.landing.socialProof.map((testimonial) => (
                  <Card key={testimonial.name}>
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{testimonial.avatar}</div>
                        <div>
                          <CardTitle className="text-base">{testimonial.name}</CardTitle>
                          <CardDescription className="text-sm">{testimonial.title}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm italic text-muted-foreground">"{testimonial.quote}"</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-6 md:py-16 px-3 sm:px-4 md:px-6 text-center mobile-compact-p">
            <div className="container mx-auto max-w-2xl">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Transform Your Workforce?</h2>
              <p className="text-muted-foreground mb-6">Start your 14-day free trial today. No credit card required.</p>
              <Button size="lg" onClick={() => setLocation('/register?tier=free')}>
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </section>
        </>
      )}

      {/* PRICING SECTION */}
      {section === 'pricing' && (
        <section className="py-12 md:py-16 px-3 sm:px-4 md:px-6 mobile-compact-p">
          <div className="container mx-auto max-w-7xl">
            <div className="text-center mb-8">
              <div className="inline-block mb-4 px-3 py-1 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-[10px] sm:text-xs font-medium">
                AI-Powered Workforce Management
              </div>
              <h2 className="text-xl sm:text-2xl md:text-4xl font-bold mb-3 sm:mb-4">
                Premium AI Workforce Automation
              </h2>
              <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
                Trinity AI autonomously schedules, processes payroll, bills clients, and optimizes profit while you sleep. 
                Service companies save 30-40 hours/month and increase profit margins by 2-5%.
              </p>
            </div>

            {/* ROI Calculator */}
            <div className="max-w-lg mx-auto mb-12">
              <PricingROICalculator />
            </div>

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-lg">
                <Button
                  variant={billingCycle === 'monthly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setBillingCycle('monthly')}
                  data-testid="toggle-monthly"
                >
                  Monthly
                </Button>
                <Button
                  variant={billingCycle === 'annual' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setBillingCycle('annual')}
                  data-testid="toggle-annual"
                >
                  Annual
                </Button>
              </div>
              <div className="ml-2 flex items-center">
                <span className="text-[10px] sm:text-xs font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">Save 20%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {MARKETING.pricing.getTiers().map((tier) => {
                const isAnnual = billingCycle === 'annual';
                const monthlyPrice = tier.monthlyPrice / 100;
                const annualMonthlyPrice = Math.round(monthlyPrice * 0.8);
                const tierId = tier.id as string;
                const displayPrice = tier.monthlyPrice === 0 
                  ? '$0' 
                  : tierId === 'enterprise' 
                    ? '$5,500+' 
                    : isAnnual 
                      ? `$${annualMonthlyPrice.toLocaleString()}` 
                      : `$${monthlyPrice.toLocaleString()}`;
                const priceSubtext = tierId === 'free' 
                  ? '14-day free trial' 
                  : tierId === 'enterprise' 
                    ? '/month • Custom solutions' 
                    : isAnnual 
                      ? '/month billed annually' 
                      : '/month';
                const annualNote = tierId === 'starter' && isAnnual 
                  ? 'Billed annually at $6,708/year'
                  : tierId === 'professional' && isAnnual
                    ? 'Billed annually at $23,988/year'
                    : null;
                
                return (
                <Card
                  key={tier.id}
                  className={`relative overflow-visible ${tier.popular ? 'ring-2 ring-primary' : ''}`}
                  data-testid={`card-tier-${tier.id}`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <div className="px-2.5 py-0.5 rounded-md bg-green-600 text-white text-[10px] sm:text-xs font-medium whitespace-nowrap">
                        Most Popular
                      </div>
                    </div>
                  )}

                  <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-lg">{tier.name}</CardTitle>
                    <CardDescription className="text-[10px] sm:text-sm line-clamp-2">{tier.description}</CardDescription>
                    <div className="mt-2 sm:mt-4 flex items-baseline gap-1 flex-wrap">
                      <span className="text-lg sm:text-2xl md:text-3xl font-bold whitespace-nowrap shrink-0">{displayPrice}</span>
                      <span className="text-[10px] sm:text-sm text-muted-foreground">{priceSubtext}</span>
                    </div>
                    {annualNote && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{annualNote}</p>
                    )}
                    <p className="text-[10px] sm:text-xs text-primary font-medium mt-1 sm:mt-2">{tier.savings}</p>
                  </CardHeader>

                  <CardContent className="space-y-3 sm:space-y-4 pt-0 sm:pt-2 px-3 sm:px-6">
                    <Button
                      className={`w-full text-xs sm:text-sm ${tier.popular ? 'bg-green-600' : ''}`}
                      size="sm"
                      variant={tier.popular ? 'default' : tierId === 'enterprise' ? 'secondary' : 'outline'}
                      onClick={() => {
                        if (tier.cta === 'Contact Sales') {
                          setLocation('/contact');
                        } else {
                          setLocation(`/register?tier=${tier.id}`);
                        }
                      }}
                      data-testid={`button-tier-${tier.id}`}
                    >
                      {tier.cta}
                    </Button>

                    <ul className="space-y-1 sm:space-y-2 text-[10px] sm:text-sm">
                      {tier.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-1 sm:gap-2">
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary mt-0.5 shrink-0" />
                          <span className="leading-tight">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );})}
            </div>

            {/* ADD-ONS SECTION */}
            <div className="mt-12 sm:mt-16">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-2">Power-Up Your Professional Plan</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">Add-ons available for Professional tier subscribers</p>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 max-w-5xl mx-auto">
                {/* Per-Client Profitability */}
                <Card>
                  <CardHeader className="p-2.5 sm:p-4 sm:pb-2">
                    <CardTitle className="text-xs sm:text-base leading-tight">Per-Client Profitability</CardTitle>
                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                      <span className="text-base sm:text-2xl font-bold whitespace-nowrap shrink-0">$199</span>
                      <span className="text-[10px] sm:text-sm text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2.5 sm:p-4 pt-0 sm:pt-2">
                    <p className="text-xs text-muted-foreground mb-2 hidden sm:block">See which contracts make money</p>
                    <ul className="space-y-0.5 text-[9px] sm:text-xs">
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Client margin reports</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Profitability ranking</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Revenue analysis</span></li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Trinity Predictive Insights */}
                <Card>
                  <CardHeader className="p-2.5 sm:p-4 sm:pb-2">
                    <CardTitle className="text-xs sm:text-base leading-tight">Predictive Insights</CardTitle>
                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                      <span className="text-base sm:text-2xl font-bold whitespace-nowrap shrink-0">$249</span>
                      <span className="text-[10px] sm:text-sm text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2.5 sm:p-4 pt-0 sm:pt-2">
                    <p className="text-xs text-muted-foreground mb-2 hidden sm:block">AI-powered forecasting</p>
                    <ul className="space-y-0.5 text-[9px] sm:text-xs">
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Cash flow forecasting</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">What-if scenarios</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Seasonal alerts</span></li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Additional Location */}
                <Card>
                  <CardHeader className="p-2.5 sm:p-4 sm:pb-2">
                    <CardTitle className="text-xs sm:text-base leading-tight">Additional Location</CardTitle>
                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                      <span className="text-base sm:text-2xl font-bold whitespace-nowrap shrink-0">$149</span>
                      <span className="text-[10px] sm:text-sm text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2.5 sm:p-4 pt-0 sm:pt-2">
                    <p className="text-xs text-muted-foreground mb-2 hidden sm:block">Multi-site management</p>
                    <ul className="space-y-0.5 text-[9px] sm:text-xs">
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Per-location analytics</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Separate scheduling</span></li>
                      <li className="flex items-center gap-1"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary shrink-0" /><span className="truncate">Consolidated reports</span></li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-12 sm:mt-16 max-w-3xl mx-auto">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-center mb-6 sm:mb-8">Frequently Asked Questions</h2>
              <div className="space-y-3 sm:space-y-4">
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base">Can I change plans anytime?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6">
                    <p className="text-xs sm:text-sm text-muted-foreground">Yes, you can upgrade or downgrade anytime. Upgrades are prorated immediately, downgrades take effect at the end of your billing period.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base">What happens if I go over my employee limit?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6">
                    <p className="text-xs sm:text-sm text-muted-foreground">You'll be automatically billed at the overage rate for your tier. Starter: $10/employee, Professional: $8/employee, Enterprise: $15/employee (all employees billed at this rate). We pass the savings to you.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base">How does AI token usage work?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6">
                    <p className="text-xs sm:text-sm text-muted-foreground">Each plan includes a monthly token allowance for AI features (Trinity, scheduling AI, payroll analysis, etc.). Tokens reset each billing cycle. If you exceed your allowance, usage continues automatically at $2.00 per 100,000 tokens, billed at month-end — no service interruption.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base">What's included in the free trial?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6">
                    <p className="text-xs sm:text-sm text-muted-foreground">14 days of full platform access: up to 10 officers, AI-powered scheduling, GPS time tracking, compliance monitoring, 500 AI interactions, and email support. No credit card required.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Navigation Buttons */}
      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-2 bg-white dark:bg-slate-900 rounded-lg shadow-md p-1.5 sm:p-2 border z-50">
        <Button
          variant={section === 'landing' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleNavigation('landing')}
          className="text-xs sm:text-sm"
        >
          Landing
        </Button>
        <Button
          variant={section === 'pricing' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleNavigation('pricing')}
          className="text-xs sm:text-sm"
        >
          Pricing
        </Button>
      </div>
      </main>

      <Footer />
    </div>
  );
}
