import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/footer";
import { Input } from "@/components/ui/input";
import { TrinityBadge } from "@/components/trinity-marketing-hero";
import TrinityRedesign from "@/components/trinity-redesign";
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
  Sparkles,
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
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
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
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
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
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
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
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
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
      question: "What is Trinity and how does it automate my business?",
      answer: "Trinity is your Fortune 500-grade AI orchestrator built to handle your entire workforce operations. It coordinates over 277 automated actions through specialized subagents for scheduling, payroll, compliance, invoicing, security, and analytics. Trinity operates in three modes: Demo (guided tutorials), Business Pro (daily operations), and Guru (strategic insights). The system learns from your patterns, detects anomalies, and handles 99% of operations autonomously with only 1% human oversight for critical decisions. All actions are logged, auditable, and can be approved or overridden by authorized managers.",
    },
    {
      question: "What is HelpAI and how do I use it?",
      answer: "HelpAI is your unified support chatbot accessible from any page. Simply click the chat icon to ask questions, request actions, or get help. HelpAI understands natural language, can execute platform actions on your behalf (with appropriate permissions), and routes complex issues to specialized domain agents or human support when needed.",
    },
    {
      question: "How does QuickBooks integration automation work?",
      answer: "Connect your QuickBooks account via OAuth and our Cognitive Onboarding Service automatically imports employees, syncs time entries, generates invoices, and processes payroll. The OnboardingQuickBooksFlow pipeline handles the entire process with automatic data extraction, field mapping, and schedule generation. Similar integrations are available for Gusto, ADP, Paychex, and other providers.",
    },
    {
      question: "How do I get started with CoAIleague?",
      answer: "Getting started is simple: 1) Sign up for a free trial, 2) Create your workspace and invite your first employee, 3) Set up your clients and schedule your first shift, 4) Start tracking time and generating invoices. Trinity AI guides you through each step with interactive tutorials and contextual tips.",
    },
    {
      question: "What's included in the free trial?",
      answer: "The 14-day free trial includes full access to all Professional plan features: unlimited employees and clients, GPS clock-in, Trinity AI assistance, automated scheduling, job posting, employee file management, audit tools, manager assignments, and priority support. No credit card required to start.",
    },
    {
      question: "How does time tracking and GPS verification work?",
      answer: "Employees can clock in/out from the mobile app or web interface. GPS verification captures their location at clock-in to ensure they're at the designated work site. You can set geofence boundaries and receive alerts for unusual locations. All time entries are automatically calculated and ready for payroll or invoicing.",
    },
    {
      question: "What automation features are available?",
      answer: "CoAIleague offers comprehensive automation: smart billing (nightly invoice generation), AI scheduling (weekly schedule optimization), auto payroll processing, compliance alerts (certification expiry warnings), shift reminders, break compliance checking across all 50 states, trial conversion management, and self-healing error recovery. Most workflows run autonomously with human approval only for exceptions.",
    },
    {
      question: "How does the approval workflow system work?",
      answer: "The Workflow Approval Service manages human-in-the-loop decisions for high-risk actions. When Trinity needs approval, you receive a notification via email and in-app. You can approve, reject, or delegate decisions. Expired approvals are automatically escalated. The ApprovalGateEnforcement service ensures critical operations like payroll and large invoices always get proper authorization.",
    },
    {
      question: "What security measures are in place?",
      answer: "CoAIleague uses AES-256-GCM encryption, PBKDF2-SHA256 password hashing, role-based access control (RBAC) with a 9-level hierarchy, and attribute-based access control (ABAC) for fine-grained permissions. The Universal Access Control Panel manages dynamic policies. We're SOC 2 Type II, GDPR, and CCPA compliant with immutable audit logs and 99.9% uptime SLA.",
    },
    {
      question: "Can I import existing employee data?",
      answer: "Yes! CoAIleague supports bulk import via CSV for employees, clients, and historical data. Our Cognitive Onboarding Service can automatically extract and map data from QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, or Workday via OAuth integration. AI-powered field mapping ensures accurate data migration.",
    },
    {
      question: "How does the billing automation work?",
      answer: "Our 99% automation billing system includes weekly billing runs, automatic invoice generation from tracked hours, Stripe integration for payments, exception queue processing, and human escalation for anomalies. The BillingOrchestration service handles risk evaluation, state transitions, and generates audit packs for compliance.",
    },
    {
      question: "How can administrators monitor AI operations?",
      answer: "Platform administrators have access to comprehensive AI monitoring tools including real-time activity feeds, orchestration dashboards, and audit logs. Root admins can view all automated operations, approve or reject high-risk actions, and intervene when needed. The system provides full visibility into the Trinity™ orchestration hierarchy with RBAC-gated access controls.",
    },
    {
      question: "How can I contact support?",
      answer: "All plans include HelpAI chat support with instant responses. Standard plan: Email support with 4-hour response time. Professional plan: Priority phone, email & chat with 1-hour response time. Enterprise plan: 24/7 white-glove support with 15-minute response time and dedicated account manager. Visit our Contact page for details.",
    },
  ];

  const statusItems = [
    { label: "Automation Service Live", value: "Operational", status: "success" },
    { label: "HelpDesk Live", value: "Operational", status: "success" },
    { label: "Mobile App Live", value: "Operational", status: "success" },
    { label: "Trinity™ Live", value: "Operational", status: "success" },
  ];

  return (
    <div className="min-h-screen bg-background dark:bg-background">
      {/* Top Bar - Modern Trinity Branding */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20">
            <TrinityRedesign mode="IDLE" size={28} mini={true} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
              CoAIleague
            </span>
            <span className="text-[10px] text-muted-foreground -mt-0.5">Help Center</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/"}
            className="text-xs h-9"
            data-testid="button-back"
          >
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/contact"}
            className="text-xs h-9"
            data-testid="button-contact"
          >
            Contact
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.href = "/dashboard"}
            className="h-9 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md"
            data-testid="button-launch-platform"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Launch Platform
          </Button>
        </div>
      </nav>

      {/* Support Hero - Modern Trinity Gradient */}
      <section className="container mx-auto px-6 pt-24 pb-16 bg-gradient-to-br from-violet-50/50 via-indigo-50/30 to-background dark:from-violet-950/20 dark:via-indigo-950/10 dark:to-background">
        <div className="text-center space-y-4 mb-12">
          <div className="flex items-center justify-center gap-3">
            <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" />
            <div className="flex items-center gap-2">
              <TrinityBadge showLabel={false} />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Help Center
              </span>
            </div>
            <div className="h-0.5 w-12 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-support">
            How Can We Help?
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Search our knowledge base or browse resources to find answers
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help articles, guides, and FAQs..."
              className="pl-12 h-14 text-base bg-background border-border"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Customer Support Portal CTA */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800 shadow-md hover-elevate active-elevate-2 cursor-pointer transition-all duration-200" data-testid="card-support-tickets">
            <div className="p-6" onClick={() => window.location.href = "/support/tickets"}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/20">
                    <LifeBuoy className="h-6 w-6 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                      Need Direct Support?
                      <Badge className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white">24/7 Available</Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Submit a support ticket and our team will assist you. Track all your tickets, get priority help, and receive expert guidance for technical issues, billing questions, or feature requests.
                    </p>
                    <div className="flex items-center gap-4 pt-2 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-500" /> Average response: 1 hour
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3 text-violet-500" /> Phone & Email Support
                      </span>
                    </div>
                  </div>
                </div>
                <Button 
                  className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white flex-shrink-0"
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
        <Card className="bg-card border-border mb-16" data-testid="card-status">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-semibold">System Status</h3>
                  <p className="text-sm text-muted-foreground">All systems operational</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-status-page"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Status Page
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statusItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
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
                className="bg-card border border-border p-5 space-y-4 hover:border-violet-300 dark:hover:border-violet-700 hover-elevate active-elevate-2 transition-all duration-200 cursor-pointer"
                data-testid={`card-resource-${category.title.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (category.title === "Documentation") {
                    window.open("/docs/LOGIN_GUIDE.md", "_blank");
                  } else if (category.title === "Knowledge Base") {
                    window.open("/docs/FEATURES_SHOWCASE.md", "_blank");
                  } else if (category.title === "Video Tutorials") {
                    window.open("/api/demo-login", "_self");
                  } else if (category.title === "Keyboard Shortcuts") {
                    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
                    document.dispatchEvent(event);
                  }
                }}
              >
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                  <category.icon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">{category.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <ul className="space-y-1.5 pt-2 border-t border-border">
                  {category.items.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground flex items-center gap-2 hover:text-foreground transition-colors">
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
                className="bg-card border border-border p-5 flex items-center gap-4 hover:border-violet-300 dark:hover:border-violet-700 hover-elevate active-elevate-2 transition-all duration-200 cursor-pointer"
                data-testid={`card-topic-${topic.title.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (topic.action) {
                    topic.action();
                  } else if (topic.path) {
                    window.location.href = topic.path;
                  }
                }}
              >
                <topic.icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{topic.title}</h3>
                  <p className="text-xs text-muted-foreground">{topic.articles} articles</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Card>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <Card className="bg-card border-border">
            <Accordion type="single" collapsible className="w-full" data-testid="accordion-faq">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-border">
                  <AccordionTrigger className="px-6 hover:no-underline hover:bg-muted/50" data-testid={`faq-question-${index}`}>
                    <span className="text-left font-semibold">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4 text-muted-foreground" data-testid={`faq-answer-${index}`}>
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Card className="bg-card border border-border p-6 space-y-4">
            <MessageSquare className="h-8 w-8 text-violet-600 dark:text-violet-400" />
            <div className="space-y-2">
              <h3 className="font-semibold">Still Have Questions?</h3>
              <p className="text-sm text-muted-foreground">
                Our support team is available 24/7 to help you succeed
              </p>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-md"
              onClick={() => window.location.href = "/contact"}
              data-testid="button-contact-support"
            >
              Contact Support
            </Button>
          </Card>

          <Card className="bg-card border border-border p-6 space-y-4">
            <Download className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            <div className="space-y-2">
              <h3 className="font-semibold">Download Resources</h3>
              <p className="text-sm text-muted-foreground">
                Get PDFs, templates, and guides for offline reference
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
              data-testid="button-download-resources"
              onClick={() => {
                window.open("/docs/FEATURES_SHOWCASE.md", "_blank");
                setTimeout(() => window.open("/docs/LOGIN_GUIDE.md", "_blank"), 500);
              }}
            >
              Browse Downloads
            </Button>
          </Card>

          <Card className="bg-card border border-border p-6 space-y-4">
            <Video className="h-8 w-8 text-violet-600 dark:text-violet-400" />
            <div className="space-y-2">
              <h3 className="font-semibold">Video Walkthrough</h3>
              <p className="text-sm text-muted-foreground">
                Watch our comprehensive platform tutorial series
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full border-violet-500 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              data-testid="button-watch-tutorials"
              onClick={() => window.location.href = "/api/demo-login"}
            >
              Watch Tutorials
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
