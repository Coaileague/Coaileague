import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
    window.history.pushState({}, '', `/?section=${newSection}`);
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      <UniversalHeader variant="public" />

      {/* LANDING SECTION */}
      {section === 'landing' && (
        <>
          {/* Hero */}
          <section className="pt-16 md:pt-24 pb-8 md:pb-16 px-3 sm:px-4 md:px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 mobile-compact-p mobile-text-scale">
            <div className="container mx-auto max-w-7xl">
              <div className="text-center space-y-4 md:space-y-6 mb-8 md:mb-12">
                <Badge className="bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 border-blue-200 shadow-md dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700 inline-block">
                  <Sparkles className="h-3 w-3 mr-1 shrink-0" />
                  {MARKETING.landing.hero.badge}
                </Badge>

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
          <section className="py-12 md:py-16 px-3 sm:px-4 md:px-6 mobile-compact-p">
            <div className="container mx-auto max-w-7xl">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">AI-Powered Capabilities</h2>
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
          <section className="py-12 md:py-16 bg-gray-50 dark:bg-gray-900/50 px-3 sm:px-4 md:px-6 mobile-compact-p">
            <div className="container mx-auto max-w-7xl">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Trusted by Industry Leaders</h2>
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
          <section className="py-12 md:py-16 px-3 sm:px-4 md:px-6 text-center mobile-compact-p">
            <div className="container mx-auto max-w-2xl">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Transform Your Workforce?</h2>
              <p className="text-muted-foreground mb-6">Start your 30-day free trial today. No credit card required.</p>
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
              <Badge className="inline-block mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
                AI-Powered Workforce Management for Service Companies
              </Badge>
              <h1 className="text-2xl md:text-4xl font-bold mb-4">
                Premium AI Workforce Automation
              </h1>
              <p className="text-muted-foreground max-w-2xl mx-auto">
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
              <div className="inline-flex items-center gap-2 p-1 bg-muted rounded-lg">
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
                  className="relative"
                >
                  Annual
                  <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-green-500 text-white border-0">
                    Save 20%
                  </Badge>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mobile-cols-1 mobile-gap-4">
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
                  className={`relative ${tier.popular ? 'ring-2 ring-primary md:scale-105' : ''}`}
                  data-testid={`card-tier-${tier.id}`}
                >
                  {tier.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600">
                      Most Popular
                    </Badge>
                  )}

                  <CardHeader>
                    <CardTitle>{tier.name}</CardTitle>
                    <CardDescription>{tier.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{displayPrice}</span>
                      <span className="text-sm text-muted-foreground ml-1">{priceSubtext}</span>
                    </div>
                    {annualNote && (
                      <p className="text-xs text-muted-foreground">{annualNote}</p>
                    )}
                    <p className="text-xs text-primary font-medium mt-2">{tier.savings}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <Button
                      className={`w-full ${tier.popular ? 'bg-green-600 hover:bg-green-700' : ''}`}
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

                    <ul className="space-y-2 text-sm">
                      {tier.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );})}
            </div>

            {/* ADD-ONS SECTION */}
            <div className="mt-16">
              <div className="text-center mb-8">
                <h2 className="text-xl md:text-2xl font-bold mb-2">Power-Up Your Professional Plan</h2>
                <p className="text-muted-foreground">Add-ons available for Professional tier subscribers</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
                {/* Per-Client Profitability */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Per-Client Profitability</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">$199</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <p className="text-sm text-muted-foreground mb-3">See which contracts make money</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Client margin reports</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Profitability ranking</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Revenue analysis</li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Trinity Predictive Insights */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Predictive Insights</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">$249</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <p className="text-sm text-muted-foreground mb-3">AI-powered financial forecasting</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Cash flow forecasting</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> What-if scenarios</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Seasonal alerts</li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Additional AI Credits */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">AI Credits Pack</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">$59</span>
                      <span className="text-sm text-muted-foreground">/pack</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <p className="text-sm text-muted-foreground mb-3">5,000 credits per pack</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Credits added instantly</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> One-time purchase</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> No expiration</li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Additional Location */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Additional Location</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">$149</span>
                      <span className="text-sm text-muted-foreground">/mo each</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <p className="text-sm text-muted-foreground mb-3">Multi-site management</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Per-location analytics</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Separate scheduling</li>
                      <li className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Consolidated reports</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-16 max-w-3xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Can I change plans anytime?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">Yes, you can upgrade or downgrade anytime. Upgrades are prorated immediately, downgrades take effect at the end of your billing period.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">What happens if I go over my employee limit?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">You'll be automatically billed at the overage rate for your tier. Starter: $22/employee, Professional: $20/employee. Enterprise has custom negotiated rates.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Do unused AI credits roll over?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">No, credits reset each billing cycle. Consider purchasing credit packs if you anticipate needing more credits in a given month.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">What's included in the free trial?</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">14 days of basic features: 5 employees max, basic scheduling (no AI), basic time tracking, 500 AI credits, and email support. No credit card required.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Navigation Buttons */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-white dark:bg-slate-900 rounded-lg shadow-md p-2 border">
        <Button
          variant={section === 'landing' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleNavigation('landing')}
        >
          Landing
        </Button>
        <Button
          variant={section === 'pricing' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleNavigation('pricing')}
        >
          Pricing
        </Button>
      </div>

      <Footer />
    </div>
  );
}
