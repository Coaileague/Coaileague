import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { Input } from "@/components/ui/input";
import {
  Book,
  Video,
  FileText,
  Search,
  HelpCircle,
  Keyboard,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Settings,
  DollarSign,
  Shield,
  Zap,
  Download,
  ExternalLink,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Support() {
  const [searchQuery, setSearchQuery] = useState("");

  const resourceCategories = [
    {
      icon: Book,
      title: "Documentation",
      description: "Complete guides and API references",
      color: "blue",
      items: [
        "Getting Started Guide",
        "Administrator Manual",
        "API Documentation",
        "Integration Guides",
      ],
    },
    {
      icon: Video,
      title: "Video Tutorials",
      description: "Step-by-step video walkthroughs",
      color: "purple",
      items: [
        "Platform Overview (5 min)",
        "Setting Up Your Workspace",
        "Employee Onboarding Process",
        "Scheduling Best Practices",
      ],
    },
    {
      icon: FileText,
      title: "Knowledge Base",
      description: "Common solutions and best practices",
      color: "cyan",
      items: [
        "Troubleshooting Guide",
        "Feature Comparisons",
        "Security & Compliance",
        "Performance Optimization",
      ],
    },
    {
      icon: Keyboard,
      title: "Keyboard Shortcuts",
      description: "Boost productivity with shortcuts",
      color: "green",
      items: [
        "Navigation Shortcuts",
        "Quick Actions (Ctrl+K)",
        "Calendar Controls",
        "Form Shortcuts",
      ],
    },
  ];

  const faqs = [
    {
      question: "How do I get started with WorkforceOS?",
      answer: "Getting started is simple: 1) Sign up for a free trial, 2) Create your workspace and invite your first employee, 3) Set up your clients and schedule your first shift, 4) Start tracking time and generating invoices. Our interactive demo walks you through each step, or schedule a personalized onboarding session with our team.",
    },
    {
      question: "What's included in the free trial?",
      answer: "The 14-day free trial includes full access to all Professional plan features: unlimited employees and clients, GPS clock-in, job posting, employee file management, audit tools, manager assignments, and priority support. No credit card required to start.",
    },
    {
      question: "How does time tracking and GPS verification work?",
      answer: "Employees can clock in/out from the mobile app or web interface. GPS verification captures their location at clock-in to ensure they're at the designated work site. You can set geofence boundaries and receive alerts for unusual locations. All time entries are automatically calculated and ready for payroll or invoicing.",
    },
    {
      question: "Can I import existing employee data?",
      answer: "Yes! WorkforceOS supports bulk import via CSV for employees, clients, and historical data. Our team can also assist with custom data migration from other HR systems like ADP, Workday, or BambooHR during your onboarding process.",
    },
    {
      question: "How does automated invoice generation work?",
      answer: "Select unbilled time entries for one or more clients, and WorkforceOS automatically generates professional invoices with calculated hours, rates, taxes, and platform fees. Invoices can be sent via email or downloaded as PDF. You can track payment status and generate reports for accounting.",
    },
    {
      question: "What security measures are in place?",
      answer: "WorkforceOS uses bank-level encryption (AES-256), SOC 2 Type II compliance, multi-factor authentication, role-based access control, and immutable audit logs. All data is backed up hourly with 99.9% uptime SLA for Enterprise customers. We're also GDPR and CCPA compliant.",
    },
    {
      question: "How do I upgrade or downgrade my plan?",
      answer: "You can change plans anytime from your workspace settings. Upgrades take effect immediately with prorated billing. Downgrades take effect at the start of your next billing cycle. Contact support if you need help choosing the right tier for your business size.",
    },
    {
      question: "Do you offer custom integrations?",
      answer: "Enterprise customers can request custom integrations with payroll providers (ADP, Paychex), accounting software (QuickBooks, Xero), or other business tools. Our API is also available for Professional and Enterprise tiers to build your own integrations.",
    },
    {
      question: "What happens to my data if I cancel?",
      answer: "You can export all your data (employees, clients, time entries, invoices, documents) as CSV or JSON before canceling. We retain your data for 90 days after cancellation in case you decide to return. After 90 days, all data is permanently deleted per our data retention policy.",
    },
    {
      question: "How can I contact support?",
      answer: "Standard plan: Email & chat support with 4-hour response time. Professional plan: Priority phone, email & chat with 1-hour response time. Enterprise plan: 24/7 white-glove support with 15-minute response time and dedicated account manager. Visit our Contact page for details.",
    },
  ];

  const statusItems = [
    { label: "Platform Status", value: "Operational", status: "success" },
    { label: "API Services", value: "Operational", status: "success" },
    { label: "Mobile Apps", value: "Operational", status: "success" },
    { label: "Email Delivery", value: "Operational", status: "success" },
  ];

  return (
    <div className="min-h-screen bg-slate-gradient text-white">
      {/* Top Bar */}
      <div className="h-16 bg-card-translucent border-b border-emerald-500/20 backdrop-blur-sm flex items-center justify-between px-6">
        <AutoForceLogo size="sm" variant="full" />
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/"}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-back"
          >
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/contact"}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-contact"
          >
            Contact
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.href = "/api/login"}
            className="h-8 text-xs bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
            data-testid="button-launch-platform"
          >
            Launch Platform
          </Button>
        </div>
      </div>

      {/* Support Hero */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center space-y-4 mb-12">
          <div className="flex items-center justify-center gap-2">
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
            <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
              Help Center
            </span>
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-support">
            How Can We Help?
          </h1>
          <p className="text-lg text-[hsl(var(--cad-text-secondary))] max-w-2xl mx-auto">
            Search our knowledge base or browse resources to find answers
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--cad-text-tertiary))]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help articles, guides, and FAQs..."
              className="pl-12 h-14 text-base bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))]"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Customer Support Portal CTA */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="bg-gradient-to-br from-[hsl(var(--cad-blue))]/10 to-[hsl(var(--cad-purple))]/10 border-[hsl(var(--cad-blue))]/30 hover-elevate active-elevate-2 cursor-pointer transition-all duration-200" data-testid="card-support-tickets">
            <div className="p-6" onClick={() => window.location.href = "/support/tickets"}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-md bg-[hsl(var(--cad-blue))]/20 flex items-center justify-center flex-shrink-0">
                    <LifeBuoy className="h-6 w-6 text-[hsl(var(--cad-blue))]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      Need Direct Support?
                      <Badge className="bg-[hsl(var(--cad-blue))] text-white">24/7 Available</Badge>
                    </h3>
                    <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                      Submit a support ticket and our team will assist you. Track all your tickets, get priority help, and receive expert guidance for technical issues, billing questions, or feature requests.
                    </p>
                    <div className="flex items-center gap-4 pt-2">
                      <span className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                        ⚡ Average response: 1 hour
                      </span>
                      <span className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                        📞 Phone & Email Support
                      </span>
                    </div>
                  </div>
                </div>
                <Button 
                  className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white flex-shrink-0"
                  data-testid="button-open-tickets"
                >
                  Open Tickets
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* System Status */}
        <Card className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border-strong))] mb-16" data-testid="card-status">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-[hsl(var(--cad-green))]/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--cad-green))]" />
                </div>
                <div>
                  <h3 className="font-semibold">System Status</h3>
                  <p className="text-sm text-[hsl(var(--cad-text-tertiary))]">All systems operational</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-[hsl(var(--cad-border-strong))]"
                data-testid="button-status-page"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Status Page
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statusItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--cad-green))]" />
                  <div className="flex-1">
                    <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">{item.label}</p>
                    <p className="text-sm font-medium">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Resource Categories */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Browse Resources</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {resourceCategories.map((category) => (
              <Card
                key={category.title}
                className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4 hover:border-[hsl(var(--cad-blue))]/50 hover-elevate active-elevate-2 transition-all duration-200 cursor-pointer"
                data-testid={`card-resource-${category.title.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (category.title === "Documentation") {
                    window.open("/docs/LOGIN_GUIDE.md", "_blank");
                  } else if (category.title === "Knowledge Base") {
                    window.open("/docs/FEATURES_SHOWCASE.md", "_blank");
                  } else if (category.title === "Video Tutorials") {
                    window.open("/api/demo-login", "_self");
                  } else if (category.title === "Keyboard Shortcuts") {
                    // Trigger command palette
                    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
                    document.dispatchEvent(event);
                  }
                }}
              >
                <div className={`h-12 w-12 rounded-md bg-[hsl(var(--cad-${category.color}))]/10 flex items-center justify-center`}>
                  <category.icon className={`h-6 w-6 text-[hsl(var(--cad-${category.color}))]`} />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">{category.title}</h3>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                    {category.description}
                  </p>
                </div>
                <ul className="space-y-1.5 pt-2 border-t border-[hsl(var(--cad-border))]">
                  {category.items.map((item) => (
                    <li key={item} className="text-xs text-[hsl(var(--cad-text-secondary))] flex items-center gap-2 hover:text-[hsl(var(--cad-text-primary))] transition-colors">
                      <ExternalLink className="h-3 w-3" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Topics */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Popular Topics</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Users, title: "Employee Management", articles: 24, path: "/employees" },
              { icon: Clock, title: "Time Tracking & GPS", articles: 18, path: "/time-tracking" },
              { icon: DollarSign, title: "Invoicing & Payments", articles: 15, path: "/invoices" },
              { icon: Settings, title: "Workspace Settings", articles: 21, path: "/settings" },
              { icon: Shield, title: "Security & Compliance", articles: 12, action: () => window.open("/docs/SECURITY.md", "_blank") },
              { icon: Zap, title: "Integrations & API", articles: 16, path: "/settings" },
            ].map((topic) => (
              <Card
                key={topic.title}
                className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-5 flex items-center gap-4 hover:border-[hsl(var(--cad-blue))]/50 hover-elevate active-elevate-2 transition-all duration-200 cursor-pointer"
                data-testid={`card-topic-${topic.title.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (topic.action) {
                    topic.action();
                  } else if (topic.path) {
                    window.location.href = topic.path;
                  }
                }}
              >
                <topic.icon className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{topic.title}</h3>
                  <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">{topic.articles} articles</p>
                </div>
                <ExternalLink className="h-4 w-4 text-[hsl(var(--cad-text-tertiary))]" />
              </Card>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))]">
            <Accordion type="single" collapsible className="w-full" data-testid="accordion-faq">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-[hsl(var(--cad-border))]">
                  <AccordionTrigger className="px-6 hover:no-underline hover:bg-[hsl(var(--cad-surface))]/50 data-testid={`faq-question-${index}`}">
                    <span className="text-left font-semibold">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4 text-[hsl(var(--cad-text-secondary))]" data-testid={`faq-answer-${index}`}>
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Card className="bg-[hsl(var(--cad-blue))]/10 border-[hsl(var(--cad-blue))]/20 p-6 space-y-4">
            <MessageSquare className="h-8 w-8 text-[hsl(var(--cad-blue))]" />
            <div className="space-y-2">
              <h3 className="font-semibold">Still Have Questions?</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Our support team is available 24/7 to help you succeed
              </p>
            </div>
            <Button
              className="w-full bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
              onClick={() => window.location.href = "/contact"}
              data-testid="button-contact-support"
            >
              Contact Support
            </Button>
          </Card>

          <Card className="bg-[hsl(var(--cad-purple))]/10 border-[hsl(var(--cad-purple))]/20 p-6 space-y-4">
            <Download className="h-8 w-8 text-[hsl(var(--cad-purple))]" />
            <div className="space-y-2">
              <h3 className="font-semibold">Download Resources</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Get PDFs, templates, and guides for offline reference
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full border-[hsl(var(--cad-purple))] text-[hsl(var(--cad-purple))] hover:bg-[hsl(var(--cad-purple))]/10"
              data-testid="button-download-resources"
              onClick={() => {
                // Open the features showcase and login guide
                window.open("/docs/FEATURES_SHOWCASE.md", "_blank");
                setTimeout(() => window.open("/docs/LOGIN_GUIDE.md", "_blank"), 500);
              }}
            >
              Browse Downloads
            </Button>
          </Card>

          <Card className="bg-[hsl(var(--cad-green))]/10 border-[hsl(var(--cad-green))]/20 p-6 space-y-4">
            <Video className="h-8 w-8 text-[hsl(var(--cad-green))]" />
            <div className="space-y-2">
              <h3 className="font-semibold">Video Walkthrough</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Watch our comprehensive platform tutorial series
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full border-[hsl(var(--cad-green))] text-[hsl(var(--cad-green))] hover:bg-[hsl(var(--cad-green))]/10"
              data-testid="button-watch-tutorials"
              onClick={() => window.location.href = "/api/demo-login"}
            >
              Watch Tutorials
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--cad-border))] bg-[hsl(var(--cad-chrome))]">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[hsl(var(--cad-text-tertiary))]">
              <AutoForceLogo size="sm" variant="icon" />
              <span className="whitespace-nowrap">© 2025 AutoForce™</span>
            </div>
            <div className="flex gap-3 sm:gap-6 text-xs text-[hsl(var(--cad-text-tertiary))] flex-wrap">
              <a href="/contact" className="hover:text-[hsl(var(--cad-text-primary))] whitespace-nowrap" data-testid="link-contact">
                Contact Us
              </a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))] whitespace-nowrap">
                Privacy
              </a>
              <a href="#" className="hover:text-[hsl(var(--cad-text-primary))] whitespace-nowrap">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
