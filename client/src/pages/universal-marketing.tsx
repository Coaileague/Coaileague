import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SchedulePreview } from "@/components/schedule-preview";
import { Check, X, TrendingUp, Sparkles, ArrowRight, Shield, Lock, Award } from "lucide-react";
import { MARKETING, getFormattedPrice } from "@shared/marketingConfig";

interface Section {
  id: 'landing' | 'pricing' | 'sales';
  label: string;
}

export default function UniversalMarketing() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section['id']>('landing');

  // Read section from URL params
  useEffect(() => {
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
                  <Card key={feature.title} className="hover:shadow-lg transition-shadow">
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
            <div className="text-center mb-12">
              <Badge className="inline-block mb-4">{MARKETING.pricing.badge}</Badge>
              <h1 className="text-2xl md:text-4xl font-bold mb-4">{MARKETING.pricing.headline}</h1>
              <p className="text-muted-foreground max-w-2xl mx-auto">{MARKETING.pricing.subheadline}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mobile-cols-1 mobile-gap-4">
              {MARKETING.pricing.getTiers().map((tier) => (
                <Card
                  key={tier.id}
                  className={`relative ${tier.popular ? 'ring-2 ring-primary md:scale-105' : ''}`}
                >
                  {tier.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                      Most Popular
                    </Badge>
                  )}

                  <CardHeader>
                    <CardTitle>{tier.name}</CardTitle>
                    <CardDescription>{tier.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{tier.price}</span>
                      {tier.priceSubtext && (
                        <span className="text-sm text-muted-foreground ml-1">{tier.priceSubtext}</span>
                      )}
                    </div>
                    <p className="text-xs text-primary font-medium mt-2">{tier.savings}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <Button
                      className="w-full"
                      variant={tier.popular ? 'default' : 'outline'}
                      onClick={() => {
                        if (tier.cta === 'Contact Sales') {
                          setLocation('/contact');
                        } else {
                          setLocation(`/register?tier=${tier.id}`);
                        }
                      }}
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
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Navigation Buttons */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-white dark:bg-slate-900 rounded-lg shadow-lg p-2 border">
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
