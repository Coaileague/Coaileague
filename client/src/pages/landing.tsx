import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { SchedulePreview } from "@/components/schedule-preview";
import { DashboardPreview } from "@/components/dashboard-preview";
import { TimeTrackingPreview } from "@/components/time-tracking-preview";
import { useLocation } from "wouter";
import {
  Shield,
  Zap,
  Clock,
  Users,
  MapPin,
  FileText,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  CalendarClock,
  UserPlus,
  CreditCard,
  Sparkles,
  Building2,
  Award,
  BarChart3,
  Lock,
  Globe,
  Headphones,
  ChevronRight,
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full max-w-full">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-3 sm:px-6">
          <div className="flex h-16 sm:h-20 items-center justify-between gap-2">
            {/* Professional Navigation Logo */}
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="relative cursor-pointer hover-elevate transition-all duration-300 shrink-0"
              aria-label="Scroll to top"
              data-testid="button-logo-home"
            >
              {/* Desktop: Show full logo */}
              <div className="hidden sm:block">
                <AnimatedAutoForceLogo variant="full" size="md" />
              </div>
              {/* Mobile: Show smaller logo */}
              <div className="block sm:hidden">
                <AnimatedAutoForceLogo variant="icon" size="sm" />
              </div>
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              <button
                onClick={() => setLocation("/pricing")}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
                data-testid="link-pricing"
              >
                Pricing
              </button>
              <button
                onClick={() => window.scrollTo({ top: document.getElementById('features')?.offsetTop || 0, behavior: 'smooth' })}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
                data-testid="link-features"
              >
                Features
              </button>
              <button
                onClick={() => setLocation("/contact")}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
                data-testid="link-contact"
              >
                Contact
              </button>
              <div className="h-6 w-px bg-border" />
              <Button
                variant="ghost"
                className="min-h-[44px] px-4"
                onClick={() => setLocation("/login")}
                data-testid="button-login"
              >
                Login
              </Button>
              <Button
                className="min-h-[44px] px-6"
                onClick={() => setLocation("/register")}
                data-testid="button-get-started"
              >
                Start Free Trial
              </Button>
            </div>

            {/* Mobile Menu - Compact buttons that fit on screen */}
            <div className="flex md:hidden items-center gap-2 shrink-0">
              <Button
                variant="outline"
                className="min-h-[48px] px-4 text-sm whitespace-nowrap"
                onClick={() => setLocation("/login")}
                data-testid="button-login-mobile"
              >
                Login
              </Button>
              <Button
                className="min-h-[48px] px-4 text-sm whitespace-nowrap"
                onClick={() => setLocation("/register")}
                data-testid="button-signup-mobile"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - SALES FOCUSED */}
      <section className="relative overflow-x-hidden border-b bg-gradient-to-b from-background via-background to-muted/20">
        <div className="responsive-container responsive-spacing-y">
          <div className="max-w-6xl mx-auto w-full">
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
              {/* Left: Sales Copy */}
              <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
                <Badge variant="outline" className="text-xs font-normal px-3 sm:px-4 py-1.5 inline-flex">
                  <Building2 className="h-3 w-3 mr-1.5 shrink-0" />
                  <span className="truncate">Emergency Services & Service Industries</span>
                </Badge>
                
                <h1 className="responsive-h1 max-w-full text-balance">
                  <span className="block">Workforce Management</span>
                  <span className="block text-primary mt-1 sm:mt-2">Built for Rapid Response</span>
                </h1>
                
                <p className="responsive-body text-muted-foreground max-w-full">
                  Streamline scheduling, time tracking, payroll, and compliance for emergency response teams and service organizations. Designed to reduce administrative tasks and improve operational efficiency.*
                </p>
                
                <p className="responsive-small text-muted-foreground/80 max-w-full">
                  *Actual time and cost savings will vary based on your organization's size, current processes, and implementation. Features designed to help automate manual administrative tasks.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4 w-full">
                  <Button
                    size="lg"
                    onClick={() => setLocation("/register")}
                    className="text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 w-full sm:w-auto font-semibold"
                    data-testid="button-start-trial"
                  >
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 sm:h-5 w-4 sm:w-5 shrink-0" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => window.location.href = "/api/demo-login"}
                    className="text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 w-full sm:w-auto font-semibold"
                    data-testid="button-view-demo"
                  >
                    View Live Demo
                  </Button>
                </div>

                {/* Trust Indicators - Professional Muted Tones */}
                <div className="flex flex-wrap gap-4 sm:gap-6 pt-2 sm:pt-4 text-xs sm:text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-primary shrink-0" />
                    <span className="truncate">SOC 2 Compliant</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-primary shrink-0" />
                    <span className="truncate">256-bit Encryption</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Award className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-primary shrink-0" />
                    <span className="truncate">99.9% Uptime</span>
                  </div>
                </div>
              </div>

              {/* Right: REAL Product Preview - ScheduleOS */}
              <div className="relative w-full max-w-full">
                <div className="aspect-video rounded-lg sm:rounded-xl border-2 bg-card/50 backdrop-blur-sm overflow-hidden shadow-2xl w-full">
                  {/* REAL AutoForce™ Schedule Interface - NOT a placeholder! */}
                  <SchedulePreview />
                </div>
                {/* Product badge */}
                <div className="absolute -bottom-3 sm:-bottom-4 left-1/2 -translate-x-1/2 px-2">
                  <Badge className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold shadow-lg whitespace-nowrap">
                    <Sparkles className="h-3 sm:h-4 w-3 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
                    Live Product Preview
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar - PLATFORM CAPABILITIES */}
      <section className="border-b py-8 sm:py-12">
        <div className="responsive-container">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 max-w-4xl mx-auto text-center">
            <div className="space-y-1 sm:space-y-2">
              <div className="responsive-h2 text-primary">8</div>
              <div className="responsive-small text-muted-foreground text-wrap-auto">Core OS Modules</div>
            </div>
            <div className="space-y-1 sm:space-y-2">
              <div className="responsive-h2 text-primary">99.9%</div>
              <div className="responsive-small text-muted-foreground text-wrap-auto">Uptime SLA</div>
            </div>
            <div className="space-y-1 sm:space-y-2">
              <div className="responsive-h2 text-primary">24/7</div>
              <div className="responsive-small text-muted-foreground text-wrap-auto">AI Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Showcase - Visual Demonstrations */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background responsive-spacing-y overflow-x-hidden">
        <div className="responsive-container">
          <div className="text-center mb-12 sm:mb-16 max-w-full">
            <Badge variant="outline" className="mb-4 inline-flex">
              <Sparkles className="h-3 w-3 mr-1 shrink-0" />
              Platform Preview
            </Badge>
            <h2 className="responsive-h2 mb-4 max-w-full">
              See the Platform in Action
            </h2>
            <p className="responsive-body text-muted-foreground max-w-2xl mx-auto px-4">
              Every module designed for enterprise-grade performance and ease of use
            </p>
          </div>

          <div className="space-y-12 sm:space-y-16 lg:space-y-20 max-w-6xl mx-auto w-full">
            {/* TimeOS Visual */}
            <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
              <div className="space-y-3 sm:space-y-4 max-w-full">
                <Badge variant="outline" className="inline-flex">
                  <Clock className="h-3 w-3 mr-1 shrink-0" />
                  TimeOS™
                </Badge>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold max-w-full">
                  GPS-Verified Time Tracking
                </h3>
                <p className="text-muted-foreground text-base sm:text-lg max-w-full">
                  Eliminate time theft with GPS verification and photo proof. Employees clock in/out from their phones with location validation.
                </p>
                <ul className="space-y-2 max-w-full">
                  {["GPS location verification", "Photo proof required", "Real-time tracking", "Automatic overtime calculations"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 sm:h-5 w-4 sm:w-5 text-primary shrink-0" />
                      <span className="text-sm sm:text-base">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  onClick={() => window.location.href = "/api/demo-login"}
                  className="min-h-[48px] w-full sm:w-auto"
                  data-testid="button-demo-timeos"
                >
                  Try Live Demo
                  <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </div>
              <div className="relative w-full max-w-full">
                <div className="aspect-[4/3] rounded-lg sm:rounded-xl border-2 bg-card overflow-hidden shadow-2xl w-full">
                  {/* REAL Time Tracking Interface */}
                  <TimeTrackingPreview />
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg whitespace-nowrap px-2">
                  <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" />
                  Live Product Preview
                </Badge>
              </div>
            </div>

            {/* ScheduleOS Visual */}
            <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
              <div className="lg:order-2 space-y-3 sm:space-y-4 max-w-full">
                <Badge variant="outline" className="inline-flex">
                  <CalendarClock className="h-3 w-3 mr-1 shrink-0" />
                  ScheduleOS™
                </Badge>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold max-w-full">
                  Smart Scheduling
                </h3>
                <p className="text-muted-foreground text-base sm:text-lg max-w-full">
                  Create schedules with drag-and-drop interface. Conflict detection prevents double-booking.
                </p>
                <ul className="space-y-2 max-w-full">
                  {["Drag-and-drop interface", "Conflict detection", "Mobile shift swaps", "AI optimization (beta)"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 sm:h-5 w-4 sm:w-5 text-primary shrink-0" />
                      <span className="text-sm sm:text-base">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setLocation("/register")}
                  className="min-h-[48px] w-full sm:w-auto"
                  data-testid="button-trial-scheduleos"
                >
                  Start Free Trial
                  <ChevronRight className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </div>
              <div className="lg:order-1 relative w-full max-w-full">
                <div className="aspect-[4/3] rounded-lg sm:rounded-xl border-2 bg-card overflow-hidden shadow-2xl w-full">
                  {/* REAL Schedule Interface */}
                  <SchedulePreview />
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg whitespace-nowrap px-2">
                  <Sparkles className="h-3 w-3 mr-1 shrink-0" />
                  Live Product Preview
                </Badge>
              </div>
            </div>

            {/* Analytics Visual */}
            <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
              <div className="space-y-3 sm:space-y-4 max-w-full">
                <Badge variant="outline" className="inline-flex">
                  <BarChart3 className="h-3 w-3 mr-1 shrink-0" />
                  AnalyticsOS™
                </Badge>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold max-w-full">
                  Real-Time Business Intelligence
                </h3>
                <p className="text-muted-foreground text-base sm:text-lg max-w-full">
                  Track labor costs, revenue, performance metrics, and ROI in real-time dashboards. Make data-driven decisions instantly.
                </p>
                <ul className="space-y-2 max-w-full">
                  {["Live dashboards", "Cost forecasting", "Performance metrics", "Custom reports"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 sm:h-5 w-4 sm:w-5 text-primary shrink-0" />
                      <span className="text-sm sm:text-base">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  onClick={() => setLocation("/pricing")}
                  className="min-h-[48px] w-full sm:w-auto"
                  data-testid="button-pricing-analyticsos"
                >
                  View Pricing
                  <DollarSign className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </div>
              <div className="relative w-full max-w-full">
                <div className="aspect-[4/3] rounded-lg sm:rounded-xl border-2 bg-card overflow-hidden shadow-2xl w-full">
                  {/* REAL Analytics Dashboard */}
                  <DashboardPreview />
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg whitespace-nowrap px-2">
                  <TrendingUp className="h-3 w-3 mr-1 shrink-0" />
                  Live Product Preview
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Core OS Modules */}
      <section id="features" className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Complete Operating System
            </Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Everything You Need in One Platform
            </h2>
            <p className="text-lg text-muted-foreground">
              Eight integrated "OS" modules that work together seamlessly to automate your entire workforce operation.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: CalendarClock,
                title: "ScheduleOS™",
                description: "AI-powered auto-scheduling with GPT-4. Generate optimal schedules in seconds.",
                features: ["GPT-4 scheduling", "Conflict detection", "Mobile access", "Risk scoring"],
                badge: "AI Powered",
                color: "text-primary",
              },
              {
                icon: Clock,
                title: "TimeOS™",
                description: "GPS-verified time tracking with photo proof. Eliminate buddy punching and time theft.",
                features: ["GPS verification", "Photo required", "Location accuracy", "Real-time tracking"],
                badge: "Live",
                color: "text-accent",
              },
              {
                icon: DollarSign,
                title: "PayrollOS™",
                description: "Fully automated payroll processing. Zero-touch calculation with tax withholding.",
                features: ["Auto-payroll", "Tax calculations", "Multi-state ready", "Compliance"],
                badge: "Live",
                color: "text-primary",
              },
              {
                icon: CreditCard,
                title: "BillOS™",
                description: "Automatic invoice generation from time entries. Get paid faster.",
                features: ["Auto-invoicing", "Client billing", "Stripe integration", "Payment tracking"],
                badge: "Live",
                color: "text-primary",
              },
              {
                icon: UserPlus,
                title: "HireOS™",
                description: "Smart hiring and digital onboarding. From applicant to employee in hours.",
                features: ["ATS system", "E-signatures", "Compliance docs", "Onboarding flow"],
                badge: "Live",
                color: "text-primary",
              },
              {
                icon: FileText,
                title: "ReportOS™",
                description: "Industry-specific compliance reports with photo requirements.",
                features: ["Templates", "Photo capture", "Approvals", "Client delivery"],
                badge: "Live",
                color: "text-accent",
              },
              {
                icon: BarChart3,
                title: "AnalyticsOS™",
                description: "Real-time business intelligence. Track labor costs, revenue, performance.",
                features: ["Dashboards", "Forecasting", "Cost analysis", "ROI metrics"],
                badge: "Live",
                color: "text-secondary",
              },
              {
                icon: Headphones,
                title: "SupportOS™",
                description: "Live help desk with AI knowledge base. Get answers fast.",
                features: ["Live chat", "AI assistant", "Knowledge base", "Support available"],
                badge: "AI Powered",
                color: "text-primary",
              },
            ].map((module) => (
              <Card
                key={module.title}
                className="p-6 hover:shadow-lg transition-all hover:-translate-y-1 group"
                data-testid={`card-${module.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform ${module.color}`}>
                    <module.icon className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {module.badge}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold mb-2">{module.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {module.description}
                </p>
                <ul className="space-y-1.5">
                  {module.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className={`h-3 w-3 ${module.color}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {/* Competitive Comparison - More Sales Focus */}
          <div className="max-w-6xl mx-auto mt-20">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">
                <TrendingUp className="h-3 w-3 mr-1" />
                Competitive Advantage
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Why Choose Us Over Point Solutions?
              </h2>
              <p className="text-lg text-muted-foreground">
                Stop paying for 5+ separate tools. Get everything in one integrated platform.
              </p>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-4 font-semibold">Feature</th>
                      <th className="text-center p-4 font-semibold">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-primary">Our Platform</span>
                          <Badge variant="default" className="text-xs">All-in-One</Badge>
                        </div>
                      </th>
                      <th className="text-center p-4 font-semibold text-muted-foreground">
                        Point Solutions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: "Smart Scheduling", us: true, them: "Separate tool" },
                      { feature: "GPS Time Tracking", us: true, them: "Separate tool" },
                      { feature: "Payroll Management", us: true, them: "Separate tool" },
                      { feature: "Automated Billing", us: true, them: "Separate tool" },
                      { feature: "Digital Onboarding", us: true, them: "Separate tool" },
                      { feature: "Compliance Reporting", us: true, them: "Separate tool" },
                      { feature: "Analytics Dashboard", us: true, them: "Separate tool" },
                      { feature: "AI-Powered Support", us: true, them: "Extra cost" },
                      { feature: "Data Integration", us: "Built-in", them: "Manual work" },
                      { feature: "Starting Price", us: "$299/mo", them: "$1,000+/mo" },
                    ].map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-4 font-medium">{row.feature}</td>
                        <td className="p-4 text-center">
                          {row.us === true ? (
                            <div className="flex justify-center">
                              <div className="h-6 w-6 rounded-full bg-muted/20 flex items-center justify-center">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm font-semibold text-primary">{row.us}</span>
                          )}
                        </td>
                        <td className="p-4 text-center text-sm text-muted-foreground">
                          {row.them}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="text-center mt-8">
              <Button
                size="lg"
                onClick={() => setLocation("/pricing")}
                data-testid="button-comparison-pricing"
              >
                See Full Feature Comparison
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>


      {/* Pricing Preview */}
      <section className="py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-muted-foreground">
              Choose the plan that fits your organization. Scale as you grow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                tier: "Starter",
                price: "$299",
                description: "Perfect for small teams",
                employees: "Up to 25 employees",
                features: [
                  "Core scheduling & tracking",
                  "GPS time tracking",
                  "Basic scheduling",
                  "Automated invoicing",
                  "Email support",
                ],
              },
              {
                tier: "Professional",
                price: "$999",
                description: "For growing businesses",
                employees: "Up to 100 employees",
                features: [
                  "Everything in Starter",
                  "Advanced scheduling",
                  "Payroll management",
                  "Advanced analytics",
                  "Priority support",
                  "API access",
                ],
                featured: true,
              },
              {
                tier: "Enterprise",
                price: "Custom",
                description: "For large organizations",
                employees: "Unlimited employees",
                features: [
                  "Everything in Professional",
                  "White-label platform",
                  "Custom integrations",
                  "Dedicated account manager",
                  "High-availability infrastructure",
                  "Custom contracts",
                ],
              },
            ].map((plan) => (
              <Card
                key={plan.tier}
                className={`p-8 ${
                  plan.featured
                    ? "border-primary shadow-lg scale-105 relative"
                    : ""
                }`}
              >
                {plan.featured && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.tier}</h3>
                  <div className="text-4xl font-black mb-2">
                    {plan.price}
                    {plan.price !== "Custom" && (
                      <span className="text-lg font-normal text-muted-foreground">
                        /mo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {plan.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.employees}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm"
                    >
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full min-h-[44px]"
                  variant={plan.featured ? "default" : "outline"}
                  onClick={() =>
                    plan.tier === "Enterprise"
                      ? setLocation("/contact")
                      : setLocation("/register")
                  }
                  data-testid={`button-pricing-${plan.tier.toLowerCase()}`}
                >
                  {plan.tier === "Enterprise" ? "Contact Sales" : "Start Free Trial"}
                </Button>
              </Card>
            ))}
          </div>
          
          {/* Tax Disclaimer */}
          <div className="max-w-4xl mx-auto mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">All prices exclude taxes.</span> You are responsible for determining and paying any applicable taxes in your jurisdiction. 
              AutoForce™ does not collect, calculate, or remit taxes on your behalf. 
              Please consult your tax professional regarding your tax obligations.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-y bg-primary/5 py-20">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              Ready to Transform Your Workforce Operations?
            </h2>
            <p className="text-lg text-muted-foreground">
              Join growing organizations automating workforce management. Start your free trial today—no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="text-base sm:text-lg px-6 sm:px-8 min-h-[56px] sm:h-14 w-full sm:w-auto font-semibold"
                data-testid="button-final-cta-trial"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLocation("/contact")}
                className="text-base sm:text-lg px-6 sm:px-8 min-h-[56px] sm:h-14 w-full sm:w-auto font-semibold"
                data-testid="button-final-cta-demo"
              >
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => setLocation("/pricing")}>Pricing</button></li>
                <li><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Features</button></li>
                <li><button onClick={() => window.location.href = "/api/demo-login"}>Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => setLocation("/contact")}>Contact</button></li>
                <li><button onClick={() => setLocation("/support")}>Support</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
                <li>Security</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Get Started</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => setLocation("/login")}>Login</button></li>
                <li><button onClick={() => setLocation("/register")}>Sign Up</button></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2025 AutoForce™. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
