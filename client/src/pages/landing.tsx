import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
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
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10">
                <WorkforceOSLogo size="sm" showText={false} />
              </div>
              <span className="text-xl font-bold">WorkforceOS</span>
            </div>

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

      {/* Hero Section - Fortune 500 Style */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-24 lg:py-32">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            {/* Trust Badge */}
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="text-xs font-normal px-4 py-1">
                <Building2 className="h-3 w-3 mr-1.5" />
                Trusted by Fortune 500 Companies
              </Badge>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight">
                The Complete Workforce
                <span className="block text-primary mt-2">Management Platform</span>
              </h1>
              <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Replace 5 full-time positions with AI-powered automation. Save $250k+ annually while scaling operations.
              </p>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto py-8">
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-bold text-primary">$250k+</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Annual Savings</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-bold text-primary">99.9%</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Uptime SLA</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-bold text-primary">SOC 2</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Certified</div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="w-full sm:w-auto text-base px-8 h-12"
                data-testid="button-start-trial"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => window.location.href = "/api/demo-login"}
                className="w-full sm:w-auto text-base px-8 h-12"
                data-testid="button-view-demo"
              >
                View Live Demo
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-green-500" />
                <span>SOC 2 Type II</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-blue-500" />
                <span>GDPR Compliant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-purple-500" />
                <span>99.9% Uptime</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-500" />
                <span>ISO 27001</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof - Enterprise Logos */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 py-12">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Powering workforce operations for industry leaders
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
            {[
              "Fortune 500",
              "Healthcare",
              "Manufacturing",
              "Enterprise",
            ].map((industry) => (
              <div
                key={industry}
                className="flex items-center justify-center text-xl font-bold text-muted-foreground"
              >
                {industry}
              </div>
            ))}
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
                description: "AI-powered auto-scheduling with GPT-4. Generate optimal schedules in 30 seconds.",
                features: ["Smart scheduling", "Conflict detection", "Mobile access", "Shift swaps"],
                badge: "AI Powered",
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
                description: "One-click automated payroll processing. Handle taxes, deductions, compliance.",
                features: ["Tax withholding", "Direct deposit", "Multi-state", "Compliance"],
                badge: "Automated",
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
                description: "Live help desk with AI knowledge base. Get answers instantly.",
                features: ["Live chat", "AI assistant", "Knowledge base", "24/7 support"],
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
        </div>
      </section>

      {/* ROI Section */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Replace 5 Full-Time Positions
              </h2>
              <p className="text-lg text-muted-foreground">
                Calculate your annual savings by automating these roles
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
                $255,000<span className="text-2xl">/year</span>
              </div>
              <p className="text-muted-foreground">
                Total annual savings plus benefits, insurance, and overhead costs
              </p>
              <Button
                size="lg"
                onClick={() => setLocation("/pricing")}
                className="mt-4"
                data-testid="button-view-pricing"
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
                price: "$1,499",
                description: "Perfect for small teams",
                employees: "Up to 25 employees",
                features: [
                  "All core OS modules",
                  "GPS time tracking",
                  "Basic scheduling",
                  "Automated invoicing",
                  "Email support",
                ],
              },
              {
                tier: "Professional",
                price: "$2,999",
                description: "For growing businesses",
                employees: "Up to 100 employees",
                features: [
                  "Everything in Starter",
                  "AI-powered scheduling",
                  "Automated payroll",
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
                  "99.9% SLA",
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
              Join Fortune 500 companies using WorkforceOS. Start your free trial today—no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="text-base px-8 h-12"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLocation("/contact")}
                className="text-base px-8 h-12"
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
