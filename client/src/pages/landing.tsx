import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { SchedulePreview } from "@/components/schedule-preview";
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
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between">
            {/* Professional Navigation Logo */}
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="relative cursor-pointer hover-elevate transition-all duration-300"
            >
              <WorkforceOSLogo variant="nav" />
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => setLocation("/pricing")}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </button>
              <button
                onClick={() => window.scrollTo({ top: document.getElementById('features')?.offsetTop || 0, behavior: 'smooth' })}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => setLocation("/contact")}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Contact
              </button>
              <div className="h-6 w-px bg-border" />
              <Button
                variant="ghost"
                onClick={() => setLocation("/login")}
                data-testid="button-login"
              >
                Login
              </Button>
              <Button
                onClick={() => setLocation("/register")}
                data-testid="button-get-started"
              >
                Start Free Trial
              </Button>
            </div>

            {/* Mobile Menu */}
            <div className="flex md:hidden items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/login")}
              >
                Login
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation("/register")}
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - SALES FOCUSED */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-background via-background to-muted/20">
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Sales Copy */}
              <div className="space-y-6">
                <Badge variant="outline" className="text-xs font-normal px-4 py-1.5">
                  <Building2 className="h-3 w-3 mr-1.5" />
                  Enterprise Workforce Management
                </Badge>
                
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight">
                  Automate 5+ HR Functions
                  <span className="block text-primary mt-2">in One Integrated Platform</span>
                </h1>
                
                <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
                  Complete workforce automation combining scheduling, time tracking, payroll, billing, hiring, reporting, analytics, and AI-powered support—designed to streamline operations and reduce administrative burden.*
                </p>
                
                <p className="text-xs text-muted-foreground/80 max-w-xl">
                  *Actual time and cost savings will vary based on your organization's size, current processes, and implementation. Platform features designed to automate manual tasks.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button
                    size="lg"
                    onClick={() => setLocation("/register")}
                    className="text-base px-8 h-12"
                    data-testid="button-start-trial"
                  >
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => window.location.href = "/api/demo-login"}
                    className="text-base px-8 h-12"
                    data-testid="button-view-demo"
                  >
                    View Live Demo
                  </Button>
                </div>

                {/* Trust Indicators */}
                <div className="flex flex-wrap gap-6 pt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-500" />
                    <span>SOC 2 Compliant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-blue-500" />
                    <span>256-bit Encryption</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    <span>99.9% Uptime</span>
                  </div>
                </div>
              </div>

              {/* Right: REAL Product Preview - ScheduleOS */}
              <div className="relative">
                <div className="aspect-video rounded-xl border-2 bg-card/50 backdrop-blur-sm overflow-hidden shadow-2xl">
                  {/* REAL WorkforceOS Schedule Interface - NOT a placeholder! */}
                  <SchedulePreview />
                </div>
                {/* Product badge */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                  <Badge className="px-4 py-2 text-sm font-semibold shadow-lg">
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Live Product Preview
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator Section - IMMEDIATE VALUE PROPOSITION */}
      <section className="border-b bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Potential Workforce Optimization</h2>
              <p className="text-muted-foreground">Estimate how automation could impact your business</p>
            </div>
            
            <Card className="p-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center space-y-2">
                  <div className="text-5xl font-bold text-primary">5+</div>
                  <div className="text-sm font-medium">HR Tasks Automated</div>
                  <div className="text-xs text-muted-foreground">Scheduling, Payroll, Billing, Tracking, Reporting</div>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <div className="text-5xl font-bold text-green-500">$100k+*</div>
                  <div className="text-sm font-medium">Potential Annual Value</div>
                  <div className="text-xs text-muted-foreground">*Estimated labor cost reduction</div>
                </div>
              </div>
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground text-center">
                  *Savings estimates are examples only and will vary based on your organization size, current processes, labor costs, and implementation. Actual results depend on individual circumstances. Not a guarantee of savings.
                </p>
              </div>
              <div className="mt-6 text-center">
                <Button
                  size="lg"
                  onClick={() => setLocation("/pricing")}
                  data-testid="button-roi-calculator-pricing"
                >
                  View Pricing - Starts at $299/mo
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Bar - PLATFORM CAPABILITIES */}
      <section className="border-b py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
            <div className="space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">20+</div>
              <div className="text-sm text-muted-foreground">Integrated Features</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">8</div>
              <div className="text-sm text-muted-foreground">Core OS Modules</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground">AI Chat Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Showcase - Visual Demonstrations */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Platform Preview
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              See the Platform in Action
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every module designed for enterprise-grade performance and ease of use
            </p>
          </div>

          <div className="space-y-20 max-w-6xl mx-auto">
            {/* TimeOS Visual */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-4">
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  TimeOS™
                </Badge>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  GPS-Verified Time Tracking
                </h3>
                <p className="text-muted-foreground text-lg">
                  Eliminate time theft with photo verification and GPS tracking. Employees clock in/out from their phones, managers get real-time visibility.
                </p>
                <ul className="space-y-2">
                  {["GPS geofencing", "Photo proof required", "Real-time notifications", "Automatic overtime calculations"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  onClick={() => window.location.href = "/api/demo-login"}
                  data-testid="button-demo-timeos"
                >
                  Try Live Demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <div className="aspect-[4/3] rounded-xl border-2 bg-card overflow-hidden shadow-2xl">
                  <div className="w-full h-full bg-gradient-to-br from-blue-500/10 via-blue-600/5 to-purple-500/10 p-6 flex flex-col gap-4">
                    <div className="h-16 bg-blue-500/20 rounded-lg flex items-center px-4 gap-3">
                      <Clock className="h-8 w-8 text-blue-500" />
                      <div className="flex-1">
                        <div className="h-3 bg-blue-500/30 rounded w-32 mb-2" />
                        <div className="h-2 bg-blue-500/20 rounded w-24" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      <div className="bg-primary/10 rounded-lg p-4 flex flex-col">
                        <MapPin className="h-6 w-6 text-primary mb-2" />
                        <div className="h-2 bg-primary/30 rounded w-full mt-auto" />
                      </div>
                      <div className="bg-primary/10 rounded-lg p-4 flex flex-col">
                        <Users className="h-6 w-6 text-primary mb-2" />
                        <div className="h-2 bg-primary/30 rounded w-full mt-auto" />
                      </div>
                    </div>
                  </div>
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Live Now
                </Badge>
              </div>
            </div>

            {/* ScheduleOS Visual */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="lg:order-2 space-y-4">
                <Badge variant="outline">
                  <CalendarClock className="h-3 w-3 mr-1" />
                  ScheduleOS™
                </Badge>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Smart Scheduling
                </h3>
                <p className="text-muted-foreground text-lg">
                  Create schedules with drag-and-drop interface. Conflict detection prevents double-booking.
                </p>
                <ul className="space-y-2">
                  {["Drag-and-drop interface", "Conflict detection", "Mobile shift swaps", "AI optimization (beta)"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setLocation("/register")}
                  data-testid="button-trial-scheduleos"
                >
                  Start Free Trial
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <div className="lg:order-1 relative">
                <div className="aspect-[4/3] rounded-xl border-2 bg-card overflow-hidden shadow-2xl">
                  <div className="w-full h-full bg-gradient-to-br from-purple-500/10 via-purple-600/5 to-pink-500/10 p-6">
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-6 bg-purple-500/20 rounded" />
                      ))}
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-7 gap-2">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <div
                              key={j}
                              className={`h-12 rounded ${
                                Math.random() > 0.5 ? 'bg-purple-500/20' : 'bg-purple-500/5'
                              }`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Coming Soon
                </Badge>
              </div>
            </div>

            {/* Analytics Visual */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-4">
                <Badge variant="outline">
                  <BarChart3 className="h-3 w-3 mr-1" />
                  AnalyticsOS™
                </Badge>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Real-Time Business Intelligence
                </h3>
                <p className="text-muted-foreground text-lg">
                  Track labor costs, revenue, performance metrics, and ROI in real-time dashboards. Make data-driven decisions instantly.
                </p>
                <ul className="space-y-2">
                  {["Live dashboards", "Cost forecasting", "Performance metrics", "Custom reports"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  onClick={() => setLocation("/pricing")}
                  data-testid="button-pricing-analyticsos"
                >
                  View Pricing
                  <DollarSign className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <div className="aspect-[4/3] rounded-xl border-2 bg-card overflow-hidden shadow-2xl">
                  <div className="w-full h-full bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-teal-500/10 p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { value: "$125k", label: "Revenue", color: "emerald" },
                        { value: "$45k", label: "Labor", color: "blue" },
                        { value: "92%", label: "Efficiency", color: "purple" },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                          <div className={`text-xl font-bold text-${stat.color}-500`}>{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-40 bg-primary/10 rounded-lg flex items-end gap-2 p-4">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-primary/30 rounded-t"
                          style={{ height: `${Math.random() * 80 + 20}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-lg">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Live Data
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
                description: "Smart scheduling with shift management. AI auto-scheduling coming soon.",
                features: ["Smart scheduling", "Conflict detection", "Mobile access", "Shift swaps"],
                badge: "Live + AI Soon",
                color: "text-purple-500",
              },
              {
                icon: Clock,
                title: "TimeOS™",
                description: "GPS-verified time tracking with photo proof. Eliminate buddy punching.",
                features: ["GPS clock-in", "Photo verification", "Geofencing", "Real-time tracking"],
                badge: "Live",
                color: "text-blue-500",
              },
              {
                icon: DollarSign,
                title: "PayrollOS™",
                description: "Streamlined payroll with automated calculations. Full automation coming soon.",
                features: ["Payroll tracking", "Wage calculations", "Multi-state ready", "Compliance"],
                badge: "In Development",
                color: "text-green-500",
              },
              {
                icon: CreditCard,
                title: "BillOS™",
                description: "Automatic invoice generation from time entries. Get paid faster.",
                features: ["Auto-invoicing", "Client billing", "Stripe integration", "Payment tracking"],
                badge: "Live",
                color: "text-cyan-500",
              },
              {
                icon: UserPlus,
                title: "HireOS™",
                description: "Smart hiring and digital onboarding. From applicant to employee in hours.",
                features: ["ATS system", "E-signatures", "Compliance docs", "Onboarding flow"],
                badge: "Live",
                color: "text-orange-500",
              },
              {
                icon: FileText,
                title: "ReportOS™",
                description: "Industry-specific compliance reports with photo requirements.",
                features: ["Templates", "Photo capture", "Approvals", "Client delivery"],
                badge: "Live",
                color: "text-indigo-500",
              },
              {
                icon: BarChart3,
                title: "AnalyticsOS™",
                description: "Real-time business intelligence. Track labor costs, revenue, performance.",
                features: ["Dashboards", "Forecasting", "Cost analysis", "ROI metrics"],
                badge: "Live",
                color: "text-pink-500",
              },
              {
                icon: Headphones,
                title: "SupportOS™",
                description: "Live help desk with AI knowledge base. Get answers fast.",
                features: ["Live chat", "AI assistant", "Knowledge base", "Support available"],
                badge: "AI Powered",
                color: "text-emerald-500",
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
                              <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
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

      {/* ROI Section */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Designed to Replace Up to 5 Full-Time Positions
              </h2>
              <p className="text-lg text-muted-foreground">
                Potential annual savings by automating these roles
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {[
                { role: "HR Manager", salary: "$65,000" },
                { role: "Scheduler", salary: "$45,000" },
                { role: "Payroll Specialist", salary: "$50,000" },
                { role: "Billing Clerk", salary: "$40,000" },
                { role: "Compliance Officer", salary: "$55,000" },
              ].map((position) => (
                <Card key={position.role} className="p-4 text-center">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    {position.role}
                  </div>
                  <div className="text-xl font-bold text-primary">
                    {position.salary}
                  </div>
                </Card>
              ))}
            </div>

            <div className="text-center space-y-4">
              <div className="text-5xl sm:text-6xl font-black text-green-600">
                Up to $255,000<span className="text-2xl">/year</span>
              </div>
              <p className="text-muted-foreground">
                Potential annual savings including salaries, benefits, and overhead costs*
              </p>
              <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
                * Savings estimates based on average industry salaries. Actual savings will vary based on your organization's specific circumstances, location, and implementation. Not a guarantee of results.
              </p>
              <Button
                size="lg"
                onClick={() => setLocation("/pricing")}
                className="mt-4"
                data-testid="button-roi-pricing"
              >
                View Pricing Plans
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
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.featured ? "default" : "outline"}
                  onClick={() =>
                    plan.tier === "Enterprise"
                      ? setLocation("/contact")
                      : setLocation("/register")
                  }
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
              WorkforceOS does not collect, calculate, or remit taxes on your behalf. 
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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="text-base px-8 h-12"
                data-testid="button-final-cta-trial"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLocation("/contact")}
                className="text-base px-8 h-12"
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
            <p>© 2025 WorkforceOS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
