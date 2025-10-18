import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { PromoBanner } from "@/components/promo-banner";
import { useLocation } from "wouter";
import {
  Settings,
  Cpu,
  Shield,
  Zap,
  Target,
  Clock,
  Users,
  MapPin,
  FileText,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Camera,
  CalendarClock,
  UserPlus,
  CreditCard,
  Sparkles,
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  
  // Auto-redirect mobile users to mobile chat (INSTANT)
  useEffect(() => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 768;
    
    if (isMobileDevice || isSmallScreen) {
      // Instant redirect to mobile chat - no delay
      console.log("Mobile device detected - redirecting to DC360.5");
      setLocation("/mobile-chat");
    }
  }, [setLocation]);
  
  return (
    <div className="min-h-screen bg-[hsl(var(--cad-background))] text-[hsl(var(--cad-text-primary))]">
      {/* Promotional Banner - Mobile Optimized, Appears at Top */}
      <PromoBanner
        message="New Year Special! Get 50% OFF your first 3 months + FREE onboarding worth $2,500!"
        ctaText="Claim Offer"
        ctaLink="/register"
      />
      {/* CAD-Style Top Bar - Desktop */}
      <div className="hidden lg:flex h-12 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border-strong))] items-center justify-between px-6">
        <div className="text-sm font-bold text-[hsl(var(--cad-text-primary))]">WorkforceOS</div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/pricing")}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-pricing"
          >
            Pricing
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/api/demo-login"}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-view-demo"
          >
            View Demo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/mobile-chat")}
            className="text-xs h-8 text-emerald-500 hover:text-emerald-400 hover:bg-[hsl(var(--cad-chrome-hover))] font-semibold"
            data-testid="button-mobile-chat"
          >
            Mobile Chat
          </Button>
          <div className="h-6 w-px bg-[hsl(var(--cad-border))]" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/login")}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-login"
          >
            Login
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/register")}
            className="h-8 text-xs bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
            data-testid="button-get-started"
          >
            Get Started Free
          </Button>
        </div>
      </div>

      {/* Mobile Top Bar - Touch-Optimized */}
      <div className="flex lg:hidden h-16 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border-strong))] items-center justify-between px-3">
        <div className="text-xs sm:text-sm font-bold text-[hsl(var(--cad-text-primary))] truncate">WorkforceOS</div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={() => setLocation("/mobile-chat")}
            className="h-9 sm:h-10 text-xs sm:text-sm text-emerald-500 hover:text-emerald-400 px-2 sm:px-3 font-semibold"
            data-testid="button-mobile-chat-mobile"
          >
            Chat
          </Button>
          <Button
            variant="ghost"
            onClick={() => setLocation("/login")}
            className="h-9 sm:h-10 text-xs sm:text-sm text-[hsl(var(--cad-text-secondary))] px-2 sm:px-4"
          >
            Login
          </Button>
          <Button
            onClick={() => setLocation("/register")}
            className="h-9 sm:h-10 text-xs sm:text-sm bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white px-3 sm:px-4"
            data-testid="button-get-started-mobile"
          >
            Start Free
          </Button>
        </div>
      </div>

      {/* Hero - Mobile Optimized */}
      <section className="relative">
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left: Value Prop */}
            <div className="space-y-4 sm:space-y-6 text-center lg:text-left">
              {/* Large Animated Logo */}
              <div className="flex justify-center lg:justify-start mb-6">
                <div className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48">
                  <WorkforceOSLogo size="xl" showText={false} />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-center lg:justify-start">
                <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
                <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
                  All Features Live Today
                </span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl lg:text-5xl xl:text-6xl font-black tracking-tight leading-tight sm:leading-[1.1]" data-testid="text-hero-title">
                <span className="text-[hsl(var(--cad-blue))]">Complete Workforce Automation</span>
              </h1>
              
              <p className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-[hsl(var(--cad-text-primary))] leading-snug sm:leading-tight" data-testid="text-hero-subtitle">
                Replace 5 Full-Time Staff Positions with One Intelligent Platform
              </p>
              
              <p className="text-sm sm:text-base lg:text-lg text-[hsl(var(--cad-text-secondary))] leading-relaxed max-w-3xl mx-auto lg:mx-0" data-testid="text-hero-description">
                GPS time tracking • Smart scheduling • Auto-payroll • Client invoicing • Benefits management • 
                Performance reviews • PTO workflows • RMS reporting • Live support • Admin command center • 
                Multi-portal access • White-label ready
              </p>

              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-6">
                <div className="space-y-2">
                  <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-[hsl(var(--cad-cyan))] font-mono">$250k/yr</div>
                  <div className="text-[9px] sm:text-xs text-[hsl(var(--cad-text-tertiary))] uppercase leading-tight">Cost<br className="sm:hidden" /> Savings</div>
                </div>
                <div className="space-y-2">
                  <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-[hsl(var(--cad-green))] font-mono">5 Staff</div>
                  <div className="text-[9px] sm:text-xs text-[hsl(var(--cad-text-tertiary))] uppercase leading-tight">Staff<br className="sm:hidden" /> Replaced</div>
                </div>
                <div className="space-y-2">
                  <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-[hsl(var(--cad-purple))] font-mono">100%</div>
                  <div className="text-[9px] sm:text-xs text-[hsl(var(--cad-text-tertiary))] uppercase leading-tight">Fully<br className="sm:hidden" /> Automated</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3 pt-4">
                <Button
                  size="lg"
                  onClick={() => setLocation("/register")}
                  className="w-full sm:w-auto bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white h-12 text-base"
                  data-testid="button-launch-platform"
                >
                  Launch Platform
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => window.location.href = "/api/demo-login"}
                  className="w-full sm:w-auto h-12 text-base border-[hsl(var(--cad-border-strong))] text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
                  data-testid="button-interactive-demo"
                >
                  Interactive Demo
                </Button>
              </div>
            </div>

            {/* Right: CAD System Preview - Hidden on mobile */}
            <div className="hidden lg:block relative" data-testid="img-hero-preview">
              <div className="bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border-strong))] rounded-lg overflow-hidden">
                {/* Mock CAD Interface */}
                <div className="h-10 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border))] flex items-center px-3 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[hsl(var(--cad-red))]/70" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(var(--cad-orange))]/70" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(var(--cad-green))]/70" />
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-4 text-xs text-[hsl(var(--cad-text-tertiary))]">
                    <span>File</span>
                    <span>Edit</span>
                    <span>View</span>
                    <span>Tools</span>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  {/* Mock schedule grid */}
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 21 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-16 rounded border ${
                          i % 3 === 0
                            ? "bg-[hsl(var(--cad-blue))]/20 border-[hsl(var(--cad-blue))]/50"
                            : "bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border))]"
                        }`}
                      />
                    ))}
                  </div>
                  
                  {/* Mock status indicators */}
                  <div className="flex items-center justify-between pt-2 text-xs text-[hsl(var(--cad-text-tertiary))]">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[hsl(var(--cad-green))]" />
                        Active: 12
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-[hsl(var(--cad-cyan))]" />
                        Clocked: 8
                      </span>
                    </div>
                    <span className="font-mono">12:45:30 PM</span>
                  </div>
                </div>
              </div>
              
              {/* Floating feature badges */}
              <div className="absolute -right-4 top-1/4 bg-[hsl(var(--cad-surface-elevated))] border border-[hsl(var(--cad-border-strong))] rounded-lg p-3 shadow-lg">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-[hsl(var(--cad-green))]" />
                  <span className="text-[hsl(var(--cad-text-secondary))]">GPS Verified</span>
                </div>
              </div>
              
              <div className="absolute -left-4 bottom-1/4 bg-[hsl(var(--cad-surface-elevated))] border border-[hsl(var(--cad-border-strong))] rounded-lg p-3 shadow-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-[hsl(var(--cad-purple))]" />
                  <span className="text-[hsl(var(--cad-text-secondary))]">Auto-Payroll</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Feature Showcase - Mobile Optimized */}
      <section className="border-y border-[hsl(var(--cad-border-strong))] bg-gradient-to-br from-[hsl(var(--cad-blue))]/5 via-[hsl(var(--cad-surface))] to-[hsl(var(--cad-purple))]/5">
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="text-center mb-8 sm:mb-12">
            <Badge className="bg-[hsl(var(--cad-blue))]/10 text-[hsl(var(--cad-blue))] border-none mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Live Automation Showcase
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-automation-title">
              Complete Workforce <span className="text-[hsl(var(--cad-blue))]">Automation</span>
            </h2>
            <p className="text-base sm:text-lg text-[hsl(var(--cad-text-secondary))] max-w-2xl mx-auto px-4">
              Replace 5 full-time staff positions with one intelligent platform. Every feature live and ready today.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {[
              {
                icon: CreditCard,
                title: "BillOS™",
                description: "AI-powered automated invoice generation",
                features: ["Smart invoice generation", "Multi-client billing", "Tax calculation", "Stripe payments"],
                color: "green",
                badge: "LIVE"
              },
              {
                icon: DollarSign,
                title: "PayrollOS™",
                description: "Intelligent automated payroll processing",
                features: ["Tax withholding", "Direct deposit", "Federal & state compliance", "Payroll reports"],
                color: "cyan",
                badge: "LIVE"
              },
              {
                icon: Sparkles,
                title: "ScheduleOS™",
                description: "AI auto-scheduling in 30 seconds with GPT-4",
                features: ["AI employee matching", "Conflict detection", "Performance-based", "Smart alerts"],
                color: "purple",
                badge: "AI POWERED"
              },
              {
                icon: UserPlus,
                title: "HireOS™",
                description: "Smart hiring & digital onboarding automation",
                features: ["AI screening", "E-signatures", "Compliance tracking", "Document upload"],
                color: "orange",
                badge: "LIVE"
              },
              {
                icon: FileText,
                title: "ReportOS™",
                description: "Compliance report management system",
                features: ["Industry templates", "Photo requirements", "Supervisor approval", "Client delivery"],
                color: "blue",
                badge: "LIVE"
              },
              {
                icon: TrendingUp,
                title: "AnalyticsOS™",
                description: "Real-time business intelligence dashboard",
                features: ["Revenue tracking", "Labor cost analysis", "Forecasting", "ROI metrics"],
                color: "pink",
                badge: "LIVE"
              },
              {
                icon: MapPin,
                title: "TrackOS™",
                description: "Location-verified clock-ins with photo proof",
                features: ["GPS coordinates", "Timestamp photos", "Geofence alerts", "Anti-fraud protection"],
                color: "green",
                badge: "LIVE"
              },
              {
                icon: Shield,
                title: "Full Compliance",
                description: "SOC2-ready audit trails and compliance",
                features: ["Immutable logs", "FLSA compliance", "GDPR ready", "Legal audit trails"],
                color: "red",
                badge: "LIVE"
              },
            ].map((feature) => (
              <Card
                key={feature.title}
                className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4 hover:border-[hsl(var(--cad-blue))]/50 hover:shadow-lg transition-all group"
                data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-start justify-between">
                  <div className={`h-12 w-12 rounded-lg bg-[hsl(var(--cad-${feature.color}))]/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <feature.icon className={`h-6 w-6 text-[hsl(var(--cad-${feature.color}))]`} />
                  </div>
                  <Badge className="bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))] text-[10px] px-2 py-0.5 border-none">
                    {feature.badge}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-[hsl(var(--cad-text-primary))]">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                    {feature.description}
                  </p>
                  <ul className="space-y-1.5 pt-2">
                    {feature.features.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-xs text-[hsl(var(--cad-text-tertiary))]"
                      >
                        <CheckCircle2 className={`h-3 w-3 text-[hsl(var(--cad-${feature.color}))]`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>

          {/* ROI Calculator - Mobile Optimized */}
          <Card className="bg-gradient-to-br from-[hsl(var(--cad-blue))]/10 via-[hsl(var(--cad-surface-elevated))] to-[hsl(var(--cad-purple))]/10 border-[hsl(var(--cad-border-strong))] p-6 sm:p-8">
            <div className="text-center space-y-6">
              <div className="space-y-2">
                <h3 className="text-xl sm:text-2xl font-bold text-[hsl(var(--cad-text-primary))]">
                  Your Annual Savings Calculator
                </h3>
                <p className="text-sm text-[hsl(var(--cad-text-secondary))] px-4">
                  Replace these 5 full-time positions with WorkforceOS automation
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 max-w-4xl mx-auto">
                {[
                  { role: "HR Manager", salary: "$65k" },
                  { role: "Scheduler", salary: "$45k" },
                  { role: "Payroll Specialist", salary: "$50k" },
                  { role: "Billing Clerk", salary: "$40k" },
                  { role: "Compliance Officer", salary: "$55k" },
                ].map((position) => (
                  <div key={position.role} className="bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border))] rounded-lg p-4 space-y-2">
                    <div className="text-xs text-[hsl(var(--cad-text-tertiary))] uppercase tracking-wide">
                      {position.role}
                    </div>
                    <div className="text-xl font-bold text-[hsl(var(--cad-cyan))] font-mono">
                      {position.salary}/yr
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-4 py-6">
                <div className="h-px w-24 bg-[hsl(var(--cad-border))]" />
                <div className="text-sm text-[hsl(var(--cad-text-tertiary))] uppercase tracking-wider">
                  Total Annual Savings
                </div>
                <div className="h-px w-24 bg-[hsl(var(--cad-border))]" />
              </div>

              <div className="space-y-2">
                <div className="text-5xl font-bold text-[hsl(var(--cad-green))] font-mono" data-testid="text-total-savings">
                  $255,000<span className="text-2xl">/year</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--cad-text-secondary))]">
                  <TrendingUp className="h-4 w-4 text-[hsl(var(--cad-green))]" />
                  <span>Plus benefits, insurance, training, and overhead costs</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  size="lg"
                  onClick={() => setLocation("/pricing")}
                  className="bg-[hsl(var(--cad-green))] hover:bg-[hsl(var(--cad-green))]/90 text-white h-12 px-8"
                  data-testid="button-view-pricing"
                >
                  View Pricing Plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Core Capabilities - Technical Grid */}
      <section className="border-y border-[hsl(var(--cad-border-strong))] bg-[hsl(var(--cad-surface))]">
        <div className="container mx-auto px-6 py-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Why Businesses Choose WorkforceOS</h2>
            <p className="text-sm text-[hsl(var(--cad-text-tertiary))]">
              Enterprise-grade capabilities • Zero manual work • Complete transparency
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: Cpu, label: "Smart Scheduling", desc: "Better than Sling with AI", color: "purple" },
              { icon: Camera, label: "Photo Timestamps", desc: "Visual proof of work", color: "pink" },
              { icon: MapPin, label: "GPS Clock-In", desc: "Location-verified timecards", color: "green" },
              { icon: Zap, label: "Auto-Payroll", desc: "Zero manual processing", color: "cyan" },
              { icon: CreditCard, label: "Auto-Billing", desc: "Invoice generation", color: "blue" },
              { icon: Shield, label: "SOC2 Ready", desc: "Immutable audit trails", color: "red" },
            ].map((feature) => (
              <Card key={feature.label} className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-6 space-y-3 relative">
                <Badge className="absolute top-4 right-4 bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))] text-[10px] px-2 py-0.5 border-none">
                  LIVE
                </Badge>
                <div className={`h-10 w-10 rounded-md bg-[hsl(var(--cad-${feature.color}))]/10 flex items-center justify-center`}>
                  <feature.icon className={`h-5 w-5 text-[hsl(var(--cad-${feature.color}))]`} />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[hsl(var(--cad-text-primary))]">{feature.label}</div>
                  <div className="text-xs text-[hsl(var(--cad-text-tertiary))]">{feature.desc}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Mobile Optimized */}
      <section className="border-t border-[hsl(var(--cad-border-strong))] bg-[hsl(var(--cad-chrome))]">
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight px-4">
              Save $255,000/Year Starting Today
            </h2>
            <p className="text-base sm:text-lg text-[hsl(var(--cad-text-secondary))] px-4">
              Join businesses replacing entire departments with WorkforceOS automation
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="w-full sm:w-auto bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white h-12 px-8"
                data-testid="button-start-free"
              >
                Start Free Trial
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => window.location.href = "/api/demo-login"}
                className="w-full sm:w-auto h-12 px-8 border-[hsl(var(--cad-border-strong))] text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
                data-testid="button-explore-demo"
              >
                Explore Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Mobile Optimized */}
      <footer className="border-t border-[hsl(var(--cad-border))] bg-[hsl(var(--cad-background))]">
        <div className="container mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--cad-text-tertiary))] text-center">
              <WorkforceOSLogo size="sm" showText={false} />
              <div className="flex flex-col items-center">
                <span className="hidden sm:inline">© 2025 WorkforceOS. Elite-grade workforce automation.</span>
                <span className="sm:hidden">© 2025 WorkforceOS</span>
                <span className="text-xs mt-1">A subsidiary of <span className="text-[hsl(var(--cad-blue))]">Drill Consulting 360 LLC</span> - Automated Development System</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-[hsl(var(--cad-text-tertiary))]">
              <a href="/support" className="hover:text-[hsl(var(--cad-text-primary))]" data-testid="link-support">Support Center</a>
              <a href="/contact" className="hover:text-[hsl(var(--cad-text-primary))]" data-testid="link-contact">Contact Us</a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">Privacy</a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
