import { useEffect } from 'react';
import {
  ArrowRight, Cpu, X, Check, Shield, Lock, Activity, RefreshCw, MessageSquare, DollarSign, Play
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { UniversalHeader } from '@/components/universal-header';
import { Footer } from '@/components/footer';
import { FTCDisclaimer } from '@/components/ftc-disclaimer';
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import featuresOverviewImg from '@/assets/marketing/features-overview.png';
import { SEO, PAGE_SEO, STRUCTURED_DATA } from '@/components/seo';
import { useAuth } from '@/hooks/useAuth';
import { UniversalSpinner } from '@/components/ui/universal-spinner';

const homepageConfig: CanvasPageConfig = {
  id: 'homepage',
  title: 'CoAIleague',
  category: 'public',
  variant: 'marketing',
  showHeader: false,
};

export default function Homepage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users straight to their dashboard —
  // landing page is only for unauthenticated visitors.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.style.display = 'none';
      loader.style.visibility = 'hidden';
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
    }
  }, []);

  // Show a loading indicator while redirecting authenticated users to dashboard
  if (!isLoading && isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <UniversalSpinner size="md" label="Redirecting to your dashboard…" />
      </div>
    );
  }

  return (
    <CanvasHubPage config={homepageConfig}>
      <SEO
        title={PAGE_SEO.landing.title}
        description={PAGE_SEO.landing.description}
        canonical="https://www.coaileague.com/"
        structuredData={[STRUCTURED_DATA.organization, STRUCTURED_DATA.softwareApp]}
      />
      <div className="min-h-screen bg-background overflow-x-hidden w-full">
        <UniversalHeader variant="public" />

      {/* Hero Section */}
      <section className="pt-8 md:pt-24 pb-8 md:pb-20 px-3 sm:px-6 bg-gradient-to-b from-muted to-background relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 hidden md:block">
          <div className="absolute top-32 right-32 w-96 h-96 bg-teal-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column */}
            <div>
              <div className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-3 py-1.5 rounded-full text-xs font-medium mb-6 border border-border">
                <Cpu className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Powered by Trinity AI</span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground mb-5 leading-tight tracking-tight">
                Automate Up to $100K+ in
                <br />
                <span className="text-teal-600 dark:text-teal-400">Admin Workloads</span>
              </h1>
              
              <p className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
                Let Trinity autonomously handle your scheduling, payroll processing, and client invoicing. 
                <span className="text-foreground font-medium"> Reduce administrative overhead significantly.</span>
              </p>
              
              {/* Refined Stats Box */}
              <div className="bg-card border border-border rounded-lg p-5 mb-8 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground">Typical Annual Savings</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xl sm:text-2xl font-semibold text-foreground mb-0.5">Up to $140K</div>
                    <div className="text-xs text-muted-foreground">Potential labor cost reduction*</div>
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-semibold text-foreground mb-0.5">Up to $50K</div>
                    <div className="text-xs text-muted-foreground">Reduced overtime costs*</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <Link href="/register" className="px-6 py-2.5 bg-teal-600 text-white rounded-md font-medium hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 text-sm" data-testid="button-get-started">
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/features" className="px-6 py-2.5 bg-card text-foreground rounded-md font-medium hover-elevate transition-colors border border-border flex items-center justify-center gap-2 text-sm" data-testid="button-watch-demo">
                  <Play className="w-4 h-4" />
                  Watch Demo
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-border">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">Powered by Trinity</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">SOC 2 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">99.9% Uptime</span>
                </div>
              </div>
            </div>

            {/* Right Column - Demo Card */}
            <div className="relative hidden lg:block">
              <div className="bg-card rounded-lg shadow-lg border border-border p-5 relative">
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="text-sm font-medium text-foreground">Powered by Trinity</span>
                  </div>
                  <div className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                    Active
                  </div>
                </div>
                
                {/* Mini Schedule Grid */}
                <div className="space-y-2">
                  {[
                    { initials: 'SM', shifts: [{ name: 'Tech Support', time: '9AM-5PM', color: 'bg-teal-500' }, { name: 'Field Ops', time: '1PM-9PM', color: 'bg-cyan-500' }] },
                    { initials: 'JD', shifts: [{ name: 'Healthcare', time: '8AM-4PM', color: 'bg-teal-500' }, { name: 'Training', time: '10AM-2PM', color: 'bg-blue-500' }] },
                    { initials: 'MD', shifts: [{ name: 'Security', time: '2PM-10PM', color: 'bg-cyan-500' }, { name: 'Admin', time: '9AM-5PM', color: 'bg-slate-600' }] },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs font-semibold shrink-0">
                        {row.initials}
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-4 gap-1.5">
                        {row.shifts.map((shift, j) => (
                          <div key={j} className={`${shift.color} text-white px-2 py-1.5 rounded text-[10px]`}>
                            <div className="font-medium truncate">{shift.name}</div>
                            <div className="opacity-80">{shift.time}</div>
                          </div>
                        ))}
                        <div className="border border-dashed border-border rounded bg-muted col-span-2"></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-border">
                  <div className="bg-muted border border-border rounded p-2.5 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span className="text-xs font-medium text-muted-foreground">AI Generated Schedule</span>
                      </div>
                      <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400">AI-Assisted</span>
                    </div>
                  </div>
                  <Link href="/support" className="block w-full px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors text-center" data-testid="button-watch-demo">
                    Experience Trinity Intelligence
                  </Link>
                </div>
              </div>

              {/* Floating Badge */}
              <div className="absolute -bottom-4 -left-4 bg-card rounded-md shadow-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-md flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-foreground">Up to $190K</div>
                    <div className="text-[10px] text-muted-foreground">Potential Annual Savings*</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-8 md:py-16 px-3 sm:px-6 bg-muted">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sound Familiar?</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-2">
              Running a security company is hard enough without:
            </h2>
          </div>
          <div className="space-y-3 mb-6">
            {[
              "Spending 10+ hours/week on scheduling",
              "Chasing down timesheets",
              "Fixing payroll errors every pay period",
              "Scrambling for last-minute coverage",
              "Pass-downs lost in text messages"
            ].map((pain, i) => (
              <div key={i} className="flex items-center gap-3 text-muted-foreground">
                <X className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="text-base md:text-lg">{pain}</span>
              </div>
            ))}
          </div>
          <p className="text-lg sm:text-xl font-semibold text-teal-600 dark:text-teal-400">There's a better way.</p>
        </div>
      </section>

      {/* Marketing Image */}
      <section className="py-8 md:py-12 px-3 sm:px-6 bg-gradient-to-b from-muted to-background">
        <div className="max-w-5xl mx-auto">
          <img 
            src={featuresOverviewImg} 
            alt="CoAIleague Platform Overview - AI-Powered Scheduling, GPS Tracking, Automated Payroll"
            className="w-full rounded-md shadow-sm border border-border"
            width={1200}
            height={675}
            loading="lazy"
            data-testid="img-marketing-overview"
          />
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-8 md:py-16 px-3 sm:px-6 bg-gradient-to-r from-blue-50 to-teal-50 dark:from-blue-950/20 dark:to-teal-950/20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">The CoAIleague Way</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-2">
              What if you could:
            </h2>
          </div>
          <div className="space-y-3 mb-8">
            {[
              "Let AI handle scheduling automatically",
              "Know where every guard is in real-time",
              "Export payroll to QuickBooks in one click",
              "Fill call-outs automatically at 2 AM",
              "Have pass-downs that actually work"
            ].map((solution, i) => (
              <div key={i} className="flex items-center gap-3 text-muted-foreground">
                <Check className="w-5 h-5 text-teal-500 dark:text-teal-400 shrink-0" />
                <span className="text-base md:text-lg">{solution}</span>
              </div>
            ))}
          </div>
          <Link 
            href="/features" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-md font-medium hover:bg-teal-700 transition-colors"
            data-testid="button-see-how-works"
          >
            See How It Works
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA Section - intentionally dark */}
      <section className="py-12 md:py-20 px-3 sm:px-6 bg-slate-900 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to Transform Your Operations?
          </h2>
          <p className="text-slate-400 mb-8">
            Join security companies reducing administrative workload with AI-powered automation. Results vary by organization size and implementation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/register"
              className="px-8 py-3 bg-teal-600 text-white rounded-md font-semibold hover:bg-teal-700 transition-colors"
              data-testid="button-cta-start-trial"
            >
              Start Free Trial
            </Link>
            <Link 
              href="/features"
              className="px-8 py-3 border border-slate-600 text-white rounded-md font-semibold hover:bg-slate-800 transition-colors"
              data-testid="button-cta-explore-features"
            >
              Explore Features
            </Link>
          </div>
        </div>
      </section>

        <FTCDisclaimer />
        <Footer variant="dark" />
      </div>
    </CanvasHubPage>
  );
}
