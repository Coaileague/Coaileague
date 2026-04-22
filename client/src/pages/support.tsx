import { useState } from "react";
import { useLocation } from "wouter";
import { SEO, PAGE_SEO } from '@/components/seo';
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/footer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TrinityBadge } from "@/components/trinity-marketing-hero";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { Loader2, Mail, Send } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { UniversalHeader } from "@/components/universal-header";
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
  RefreshCw,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import type { HealthSummary } from '@shared/healthTypes';
import { DOMAINS } from "@shared/platformConfig";

export default function Support() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  
  const [guestForm, setGuestForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  
  const submitGuestTicket = useMutation({
    mutationFn: async (data: typeof guestForm) => {
      const res = await secureFetch('/api/support/chat/guest-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to submit ticket');
      return res.json();
    },
    onSuccess: (data) => {
      setTicketSubmitted(true);
      toast({
        title: "Ticket Submitted",
        description: `Your ticket #${data.ticketNumber || 'N/A'} has been received. We'll respond to ${guestForm.email} soon.`,
      });
      setGuestForm({ name: "", email: "", subject: "", message: "" });
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Please try again or contact us directly.",
        variant: "destructive",
      });
    },
  });

  // Fetch live health data from API
  const { data: healthData, isLoading: healthLoading, isError: healthError, refetch: refetchHealth } = useQuery<HealthSummary>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 60000, // Refresh every minute
    retry: 2,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Map service names to display labels
  const serviceDisplayNames: Record<string, string> = {
    database: 'Platform Core',
    chat_websocket: 'Real-time Services',
    gemini_ai: 'AI Services',
    object_storage: 'File Storage',
    stripe: 'Payments',
    email: 'Email Services',
    quickbooks: 'QuickBooks',
    gusto: 'Gusto HRIS',
  };

  // Convert live health data to status items with error handling
  const statusItems = healthError ? [
    { label: "Platform Core", value: "Check Failed", status: "unknown" },
    { label: "AI Services", value: "Check Failed", status: "unknown" },
    { label: "Real-time Services", value: "Check Failed", status: "unknown" },
    { label: "Integrations", value: "Check Failed", status: "unknown" },
  ] : healthData?.services?.slice(0, 4).map(service => ({
    label: serviceDisplayNames[service.service] || service.service,
    value: service.status === 'operational' ? 'Operational' : 
           service.status === 'degraded' ? 'Degraded' : 'Down',
    status: service.status === 'operational' ? 'success' : 
            service.status === 'degraded' ? 'warning' : 'error',
  })) || [
    { label: "Platform Core", value: "Loading...", status: "loading" },
    { label: "AI Services", value: "Loading...", status: "loading" },
    { label: "Real-time Services", value: "Loading...", status: "loading" },
    { label: "Integrations", value: "Loading...", status: "loading" },
  ];

  // Determine overall status - show 'loading' during initial load, 'unknown' on error
  const overallStatus = healthLoading ? 'loading' : 
                        healthError ? 'unknown' : 
                        (healthData?.overall || 'operational');

  const resourceCategories = [
    {
      icon: Book,
      title: "Documentation",
      description: "Complete guides and API references",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      textColor: "text-blue-600 dark:text-blue-400",
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
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
      textColor: "text-purple-600 dark:text-purple-400",
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
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      textColor: "text-blue-600 dark:text-blue-400",
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
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      textColor: "text-blue-600 dark:text-blue-400",
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
      answer: "Trinity is CoAIleague's AI orchestration layer built to assist your workforce operations. It coordinates automated tasks across scheduling, payroll, compliance, invoicing, and analytics through specialized subagents. Trinity operates in three modes: Demo (guided tutorials), Business Pro (daily operations), and Guru (strategic insights). The system learns from your patterns and surfaces anomalies and recommendations for your team's review. All actions are logged, auditable, and require approval or can be overridden by authorized managers. Your designated human supervisor retains final authority over all operational decisions.",
    },
    {
      question: "How do I get help or submit a support request?",
      answer: "You can submit a support ticket anytime from this Help Center. Our support team reviews all tickets with an average 1-hour response time. For urgent issues, Professional and Enterprise plans include priority phone support. Trinity AI also provides contextual guidance throughout the platform to help you complete tasks efficiently.",
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
      answer: "The 14-day trial includes full platform access: up to 10 officers, GPS clock-in and tracking, AI-powered scheduling, compliance monitoring, 500 AI interactions, and email support. No credit card required to start. Upgrade to a paid plan to unlock more officers, higher interaction limits, and advanced features.",
    },
    {
      question: "How does time tracking and GPS verification work?",
      answer: "Employees can clock in/out from the mobile app or web interface. GPS verification captures their location at clock-in to ensure they're at the designated work site. You can set geofence boundaries and receive alerts for unusual locations. All time entries are automatically calculated and ready for payroll or invoicing.",
    },
    {
      question: "What automation features are available?",
      answer: "CoAIleague offers broad automation support: smart billing (nightly invoice drafting for review), AI-assisted scheduling, payroll run preparation, compliance alerts (certification expiry warnings), shift reminders, break compliance monitoring across all 50 states, and self-healing error recovery. Automated outputs are surfaced to your team for review — human approval is required at key decision points, particularly for payroll, large invoices, and employment-related actions.",
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

  const pageConfig: CanvasPageConfig = {
    id: "support-help-center",
    title: "Help Center",
    subtitle: "Search our knowledge base or browse resources",
    category: "public",
    variant: "marketing",
    showHeader: false,
    maxWidth: "6xl",
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="min-h-screen bg-background">
        <SEO
          title={PAGE_SEO.support.title}
          description={PAGE_SEO.support.description}
          canonical={`${DOMAINS.app}/support`}
        />
        <UniversalHeader variant="public" />

        <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-page-title">
                Help Center
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Search our knowledge base or browse resources
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm"
              data-testid="button-launch-platform"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Platform
            </Button>
          </div>

      <section className="space-y-6">

        {/* Search Bar */}
        <div className="max-w-xl mx-auto mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles..."
              className="pl-10 h-11 text-sm bg-background border-border"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Support Ticket CTA - Fortune 500 Card with Explicit CTA */}
        <div className="max-w-xl mx-auto mb-8">
          <Card 
            className="border border-violet-200 dark:border-violet-800" 
            data-testid="card-support-tickets"
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <LifeBuoy className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">Need Direct Support?</h3>
                    <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 text-[10px]">24/7</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submit a ticket and our team will assist you. Track tickets, get priority help, and receive expert guidance.
                  </p>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <Button 
                      size="sm"
                      className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white"
                      onClick={() => setLocation("/my-tickets")}
                      data-testid="button-open-tickets"
                    >
                      Open Tickets
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-amber-500" /> Avg response: 1 hour
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* System Status - Live Data from API */}
        <Card className="bg-card border-border mb-8 max-w-xl mx-auto" data-testid="card-status">
          <div className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {overallStatus === 'operational' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : overallStatus === 'degraded' ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : overallStatus === 'loading' ? (
                  <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
                ) : overallStatus === 'unknown' ? (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {overallStatus === 'operational' ? 'All Systems Operational' :
                   overallStatus === 'degraded' ? 'Some Services Degraded' :
                   overallStatus === 'loading' ? 'Checking System Status...' :
                   overallStatus === 'unknown' ? 'Status Check Failed' : 'Service Issues Detected'}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => refetchHealth()}
                data-testid="button-refresh-status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {statusItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    item.status === 'success' ? 'bg-emerald-500' :
                    item.status === 'warning' ? 'bg-amber-500' :
                    item.status === 'error' ? 'bg-red-500' :
                    item.status === 'unknown' ? 'bg-muted-foreground' :
                    'bg-muted-foreground animate-pulse'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                    <p className={`text-xs font-medium ${
                      item.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
                      item.status === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                      item.status === 'error' ? 'text-red-600 dark:text-red-400' :
                      'text-muted-foreground'
                    }`}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {healthData?.timestamp && (
              <p className="text-[10px] text-muted-foreground mt-2 text-right">
                Last updated: {new Date(healthData.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </Card>

        {/* Resource Categories - Compact Grid */}
        <div className="mb-10">
          <h2 className="text-lg sm:text-xl font-bold mb-4">Browse Resources</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {resourceCategories.map((category) => (
              <Card
                key={category.title}
                className="bg-card border border-border p-3 sm:p-4 space-y-2 hover:border-violet-300 dark:hover:border-violet-700 hover-elevate active-elevate-2 cursor-pointer"
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
                <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <category.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{category.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {category.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Topics - Compact List */}
        <div className="mb-10">
          <h2 className="text-lg sm:text-xl font-bold mb-4">Popular Topics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {[
              { icon: Users, title: "Employees", path: "/employees" },
              { icon: Clock, title: "Time Tracking", path: "/time-tracking" },
              { icon: DollarSign, title: "Invoicing", path: "/invoices" },
              { icon: Settings, title: "Settings", path: "/settings" },
              { icon: Shield, title: "Security", action: () => window.open("/docs/SECURITY.md", "_blank") },
              { icon: Zap, title: "Integrations", path: "/integrations" },
            ].map((topic) => (
              <Card
                key={topic.title}
                className="bg-card border border-border p-3 flex items-center gap-2 hover:border-violet-300 dark:hover:border-violet-700 hover-elevate active-elevate-2 cursor-pointer"
                data-testid={`card-topic-${topic.title.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  if (topic.action) {
                    topic.action();
                  } else if (topic.path) {
                    setLocation(topic.path);
                  }
                }}
              >
                <topic.icon className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="text-sm font-medium truncate">{topic.title}</span>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQs - Clean Accordion */}
        <div className="mb-10">
          <h2 className="text-lg sm:text-xl font-bold mb-4">Frequently Asked Questions</h2>
          <Card className="bg-card border-border">
            <Accordion type="single" collapsible className="w-full" data-testid="accordion-faq">
              {faqs.slice(0, 8).map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-border">
                  <AccordionTrigger className="px-4 py-3 text-left hover:no-underline hover:bg-muted/50 text-sm" data-testid={`faq-question-${index}`}>
                    <span className="font-medium">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 text-xs text-muted-foreground" data-testid={`faq-answer-${index}`}>
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>

        {/* Guest Contact Form */}
        <div className="mb-10">
          <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-600" />
            Submit a Support Request
          </h2>
          <Card className="bg-card border-border p-4 sm:p-6">
            {ticketSubmitted ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Ticket Submitted!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  We've received your request and will respond shortly.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setTicketSubmitted(false)}
                  data-testid="button-submit-another"
                >
                  Submit Another Request
                </Button>
              </div>
            ) : (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  submitGuestTicket.mutate(guestForm);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guest-name">Your Name</Label>
                    <Input
                      id="guest-name"
                      placeholder="Enter your full name"
                      value={guestForm.name}
                      onChange={(e) => setGuestForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      data-testid="input-guest-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-email">Email Address</Label>
                    <Input
                      id="guest-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={guestForm.email}
                      onChange={(e) => setGuestForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                      data-testid="input-guest-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-subject">Subject</Label>
                  <Input
                    id="guest-subject"
                    placeholder="Brief description of your issue"
                    value={guestForm.subject}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, subject: e.target.value }))}
                    required
                    data-testid="input-guest-subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-message">Message</Label>
                  <Textarea
                    id="guest-message"
                    placeholder="Please describe your issue or question in detail..."
                    value={guestForm.message}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, message: e.target.value }))}
                    required
                    rows={4}
                    data-testid="input-guest-message"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto"
                  disabled={submitGuestTicket.isPending}
                  data-testid="button-submit-guest-ticket"
                >
                  {submitGuestTicket.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Request
                    </>
                  )}
                </Button>
              </form>
            )}
          </Card>
        </div>

        {/* Quick Actions - Compact Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <Card 
            className="bg-card border border-border p-4 flex items-center gap-3 hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => setLocation("/contact")}
            data-testid="button-contact-support"
          >
            <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Contact Support</h3>
              <p className="text-xs text-muted-foreground">24/7 team support</p>
            </div>
          </Card>

          <Card 
            className="bg-card border border-border p-4 flex items-center gap-3 hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => window.open("/docs/FEATURES_SHOWCASE.md", "_blank")}
            data-testid="button-download-resources"
          >
            <Download className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Downloads</h3>
              <p className="text-xs text-muted-foreground">PDFs and guides</p>
            </div>
          </Card>

          <Card 
            className="bg-card border border-border p-4 flex items-center gap-3 hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => window.location.href = "/api/demo-login"}
            data-testid="button-watch-tutorials"
          >
            <Video className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Tutorials</h3>
              <p className="text-xs text-muted-foreground">Video walkthroughs</p>
            </div>
          </Card>
        </div>
      </section>
      </main>

      <Footer />
    </div>
    </CanvasHubPage>
  );
}
