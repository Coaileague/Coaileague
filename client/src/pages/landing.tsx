import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, DollarSign, Clock, CheckCircle2, Zap, Shield, TrendingUp } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative border-b">
        <div className="container mx-auto px-6 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <Badge className="text-xs" data-testid="badge-hero-label">
                Multi-Tenant Scheduling Platform
              </Badge>
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tight leading-tight" data-testid="text-hero-title">
                Schedule Smarter.
                <br />
                <span className="text-primary">Bill Automatically.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl" data-testid="text-hero-description">
                Professional employee scheduling with drag-and-drop calendar, automated time tracking, and intelligent billing. Built for service businesses that need to scale.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button 
                  size="lg" 
                  onClick={() => window.location.href = "/api/login"}
                  data-testid="button-get-started"
                >
                  Get Started Free
                </Button>
                <Button size="lg" variant="outline" data-testid="button-view-demo">
                  View Demo
                </Button>
              </div>
            </div>
            <div className="relative lg:h-[500px] bg-card border rounded-lg flex items-center justify-center" data-testid="img-hero-preview">
              <Calendar className="h-32 w-32 text-primary opacity-20" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-24">
        <div className="text-center mb-16 space-y-4">
          <Badge className="text-xs" data-testid="badge-features-label">
            Everything You Need
          </Badge>
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight" data-testid="text-features-title">
            Built for Modern Service Businesses
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-features-description">
            From solo operators to enterprise teams, our platform scales with your business
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-scheduling">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Drag & Drop Scheduling</h3>
            <p className="text-sm text-muted-foreground">
              Intuitive calendar interface. Assign employees to clients with a simple drag. Prevent conflicts automatically.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-employees">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Employee Management</h3>
            <p className="text-sm text-muted-foreground">
              Manage your team with custom roles, availability tracking, and individual hourly rates.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-time-tracking">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Time Tracking</h3>
            <p className="text-sm text-muted-foreground">
              Automatic clock-in/out from scheduled shifts. Track billable hours with precision.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-invoicing">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Automated Invoicing</h3>
            <p className="text-sm text-muted-foreground">
              Generate professional invoices from time entries. Send to clients with one click.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-payments">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Payment Processing</h3>
            <p className="text-sm text-muted-foreground">
              We handle client payments, take our fee, and transfer the rest to you automatically.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover-elevate" data-testid="card-feature-multi-tenant">
            <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Multi-Tenant Security</h3>
            <p className="text-sm text-muted-foreground">
              Enterprise-grade data isolation. Each business has its own secure workspace.
            </p>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-card/50 border-y py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <Badge className="text-xs" data-testid="badge-pricing-label">
              Simple Pricing
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight" data-testid="text-pricing-title">
              Choose Your Plan
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-pricing-description">
              Start free, scale as you grow. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="p-8 space-y-6" data-testid="card-pricing-free">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Free</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Up to 5 employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Up to 10 clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Basic scheduling</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Email notifications</span>
                </li>
              </ul>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-plan-free"
              >
                Start Free
              </Button>
            </Card>

            <Card className="p-8 space-y-6 border-primary shadow-lg relative" data-testid="card-pricing-professional">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                Most Popular
              </Badge>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Professional</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold">$49</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Up to 25 employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Unlimited clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Advanced scheduling</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Automated invoicing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Payment processing</span>
                </li>
              </ul>
              <Button 
                className="w-full"
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-plan-professional"
              >
                Get Started
              </Button>
            </Card>

            <Card className="p-8 space-y-6" data-testid="card-pricing-enterprise">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Enterprise</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold">$199</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Unlimited employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Unlimited clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Priority support</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Custom integrations</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Dedicated account manager</span>
                </li>
              </ul>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-plan-enterprise"
              >
                Contact Sales
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight" data-testid="text-cta-title">
              Ready to Transform Your Scheduling?
            </h2>
            <p className="text-lg text-muted-foreground" data-testid="text-cta-description">
              Join hundreds of service businesses using ShiftSync to streamline operations
            </p>
          </div>
          <Button 
            size="lg"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-cta-start"
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            Start Your Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>© 2024 ShiftSync. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
