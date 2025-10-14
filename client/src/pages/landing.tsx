import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
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
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[hsl(var(--cad-background))] text-[hsl(var(--cad-text-primary))]">
      {/* CAD-Style Top Bar */}
      <div className="h-12 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border-strong))] flex items-center justify-between px-6">
        <WorkforceOSLogo size="sm" showText={true} />
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/pricing"}
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
            size="sm"
            onClick={() => window.location.href = "/api/login"}
            className="h-8 text-xs bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
            data-testid="button-get-started"
          >
            Launch Platform
          </Button>
        </div>
      </div>

      {/* Hero - CAD System Showcase */}
      <section className="relative">
        <div className="container mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Value Prop */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
                <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
                  Fortune 500 Grade
                </span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]" data-testid="text-hero-title">
                Replace Your Entire
                <br />
                <span className="text-[hsl(var(--cad-blue))]">Workforce Department</span>
              </h1>
              
              <p className="text-lg text-[hsl(var(--cad-text-secondary))] leading-relaxed" data-testid="text-hero-description">
                Fortune 500-grade platform with GPS clock-in verification, automated payroll processing, 
                job posting & hiring, employee file management, and audit compliance. Save $130k-250k/year.
              </p>

              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[hsl(var(--cad-cyan))] font-mono">$130k-250k</div>
                  <div className="text-xs text-[hsl(var(--cad-text-tertiary))] uppercase">Annual Savings</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[hsl(var(--cad-green))] font-mono">3 Teams</div>
                  <div className="text-xs text-[hsl(var(--cad-text-tertiary))] uppercase">Replaced</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[hsl(var(--cad-purple))] font-mono">F500</div>
                  <div className="text-xs text-[hsl(var(--cad-text-tertiary))] uppercase">Grade</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={() => window.location.href = "/api/login"}
                  className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white h-11"
                  data-testid="button-launch-platform"
                >
                  Launch Platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => window.location.href = "/api/demo-login"}
                  className="h-11 border-[hsl(var(--cad-border-strong))] text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
                  data-testid="button-interactive-demo"
                >
                  Interactive Demo
                </Button>
              </div>
            </div>

            {/* Right: CAD System Preview */}
            <div className="relative" data-testid="img-hero-preview">
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

      {/* Core Capabilities - Technical Grid */}
      <section className="border-y border-[hsl(var(--cad-border-strong))] bg-[hsl(var(--cad-surface))]">
        <div className="container mx-auto px-6 py-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Fortune 500 Feature Set</h2>
            <p className="text-sm text-[hsl(var(--cad-text-tertiary))]">
              All features available now • Replace HR, scheduling & payroll teams
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: Cpu, label: "Smart Scheduling", desc: "AI-powered shift assignments", color: "purple" },
              { icon: MapPin, label: "GPS Clock-In", desc: "Location-verified timecards", color: "green" },
              { icon: Zap, label: "Auto-Payroll", desc: "Automated payroll processing", color: "cyan" },
              { icon: FileText, label: "Employee Files", desc: "Document & certification management", color: "blue" },
              { icon: Users, label: "Job Posting", desc: "Internal hiring & applications", color: "orange" },
              { icon: Shield, label: "Audit Compliance", desc: "Immutable audit trail logs", color: "red" },
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

      {/* Feature Modules */}
      <section className="container mx-auto px-6 py-20">
        <div className="space-y-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
              <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
                System Modules
              </span>
            </div>
            <h2 className="text-4xl font-bold tracking-tight">
              Command & Control Interface
            </h2>
            <p className="text-lg text-[hsl(var(--cad-text-secondary))] max-w-3xl">
              Professional-grade modules built for precision workforce management
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Settings,
                title: "Smart Scheduling",
                features: ["AI-powered suggestions", "Conflict detection", "Template system", "Recurring shifts"],
                status: "LIVE"
              },
              {
                icon: MapPin,
                title: "GPS Clock-In",
                features: ["Location verification", "Geofence alerts", "Device tracking", "Anti-fraud protection"],
                status: "LIVE"
              },
              {
                icon: Zap,
                title: "Auto-Payroll",
                features: ["Tax calculations", "Federal & state withholding", "Direct deposit ready", "Payroll reports"],
                status: "LIVE"
              },
              {
                icon: FileText,
                title: "Employee Files",
                features: ["Document storage", "Certification tracking", "Expiration alerts", "Audit-ready"],
                status: "LIVE"
              },
              {
                icon: Users,
                title: "Job Posting",
                features: ["Internal hiring", "Application tracking", "Interview scheduling", "Candidate pipeline"],
                status: "LIVE"
              },
              {
                icon: Shield,
                title: "Audit Compliance",
                features: ["Immutable logs", "State-compliant", "FLSA tracking", "eDiscovery ready"],
                status: "LIVE"
              },
            ].map((module) => (
              <Card
                key={module.title}
                className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4 hover:border-[hsl(var(--cad-blue))]/50 transition-colors"
                data-testid={`card-module-${module.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-start justify-between">
                  <module.icon className="h-6 w-6 text-[hsl(var(--cad-blue))]" />
                  <Badge className="bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))] text-[10px] px-2 py-0.5 border-none">
                    {module.status}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-[hsl(var(--cad-text-primary))]">
                    {module.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {module.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-xs text-[hsl(var(--cad-text-secondary))]"
                      >
                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--cad-green))]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-[hsl(var(--cad-border-strong))] bg-[hsl(var(--cad-chrome))]">
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">
              Ready for Fortune 500-Grade Control?
            </h2>
            <p className="text-lg text-[hsl(var(--cad-text-secondary))]">
              Join businesses using WorkforceOS to manage workforce operations with precision
            </p>
            <div className="flex justify-center gap-4">
              <Button
                size="lg"
                onClick={() => window.location.href = "/api/login"}
                className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white h-12 px-8"
                data-testid="button-start-free"
              >
                Start Free Trial
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => window.location.href = "/api/demo-login"}
                className="h-12 px-8 border-[hsl(var(--cad-border-strong))] text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
                data-testid="button-explore-demo"
              >
                Explore Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--cad-border))] bg-[hsl(var(--cad-background))]">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--cad-text-tertiary))]">
              <WorkforceOSLogo size="sm" showText={false} />
              <span>© 2025 WorkforceOS. Fortune 500-grade workforce automation.</span>
            </div>
            <div className="flex gap-6 text-xs text-[hsl(var(--cad-text-tertiary))]">
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
