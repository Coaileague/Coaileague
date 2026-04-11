import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CanvasHubPage, CanvasPageConfig } from "@/components/canvas-hub/CanvasHubRegistry";
import { SEO, PAGE_SEO } from '@/components/seo';
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import {
  Sparkles,
  Calendar,
  Clock,
  Users,
  TrendingUp,
  Shield,
  FileText,
  Bot,
  Zap,
  DollarSign,
  Check,
  ChevronRight,
  Star,
  Crown,
  Building2,
  Play,
  ArrowRight,
  MessageSquare,
  BarChart3,
  MapPin,
  FileCheck,
  Mail,
  UserCheck,
  MailCheck,
  Brain,
  Scale,
  Palette,
  Briefcase,
  AlertTriangle,
  CreditCard,
  LifeBuoy,
} from "lucide-react";

interface FeatureShowcase {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: any;
  tier: "core" | "premium" | "elite";
  category: string;
  benefits: string[];
  creditCost: number;
  creditUnit?: string;
  roiHighlight?: string;
  demoAction?: string;
}

const FEATURE_SHOWCASES: FeatureShowcase[] = [
  {
    id: "basic-scheduling",
    name: "Basic Scheduling",
    tagline: "Drag-and-Drop Shift Calendar",
    description: "Core shift scheduling with drag-and-drop calendar, recurring shifts, employee availability management, and overtime alerts.",
    icon: Calendar,
    tier: "core",
    category: "Scheduling",
    creditCost: 0,
    benefits: [
      "Drag-and-drop shift calendar",
      "Recurring shift templates",
      "Employee availability management",
      "Overtime alerts & warnings",
    ],
    roiHighlight: "Organize shifts for your entire team",
    demoAction: "View Schedule",
  },
  {
    id: "trinity-ai-assistant",
    name: "Trinity AI",
    tagline: "C-Suite Intelligence Layer",
    description: "Trinity is not a chatbot. She is your CFO, CEO, and HR Director rolled into one AI brain. She analyzes profit margins, forecasts cash flow, predicts guard turnover, detects compliance gaps across all 50 states, and learns your organization's unique patterns to get smarter every single day.",
    icon: Sparkles,
    tier: "core",
    category: "AI Automation",
    creditCost: 3,
    creditUnit: "per query",
    benefits: [
      "Executive-level financial reporting and trend analysis",
      "Turnover prediction and retention strategy",
      "50-state security licensing tracking and expiry alerts",
      "Learns your org's patterns to surface relevant recommendations",
    ],
    roiHighlight: "Reduces administrative workload across scheduling, compliance, and reporting",
    demoAction: "Try Trinity",
  },
  {
    id: "smart-scheduling",
    name: "Smart Schedule AI",
    tagline: "1-Click Intelligent Scheduling",
    description: "AI-powered scheduling that reduces conflicts, optimizes coverage, and respects employee preferences automatically. Billed per shift scheduled — 250 cr session fee + 20 cr/shift + AI token usage.",
    icon: Calendar,
    tier: "premium",
    category: "Scheduling",
    creditCost: 20,
    creditUnit: "per shift + 250cr session fee",
    benefits: [
      "1-click auto-fill for entire week",
      "Conflict detection & resolution",
      "Learning algorithm improves over time",
      "Overtime & compliance warnings",
    ],
    roiHighlight: "Reduces scheduling coordination workload — actual savings vary by organization",
    demoAction: "View Schedule Demo",
  },
  {
    id: "shift-marketplace",
    name: "Shift Marketplace",
    tagline: "Open Shift Claiming",
    description: "Open shift posting marketplace where qualified employees can claim available shifts with automatic eligibility checking.",
    icon: Briefcase,
    tier: "premium",
    category: "Scheduling",
    creditCost: 0,
    benefits: [
      "Post open shifts for qualified employees",
      "Automatic eligibility checking",
      "Employee self-service claiming",
      "Manager approval workflows",
    ],
    demoAction: "View Marketplace",
  },
  {
    id: "shift-swapping",
    name: "Shift Swapping",
    tagline: "Employee-Initiated Shift Trades",
    description: "Employee-initiated shift swap requests with manager approval workflows and automatic eligibility validation.",
    icon: Users,
    tier: "premium",
    category: "Scheduling",
    creditCost: 0,
    benefits: [
      "Employee-initiated swap requests",
      "Manager approval workflow",
      "Eligibility validation",
      "Notification to all parties",
    ],
    demoAction: "View Shift Swaps",
  },
  {
    id: "trinity-staffing",
    name: "Trinity Staffing Premier",
    tagline: "AI-Assisted Staffing Coordination",
    description: "Trinity reads your inbox, extracts shift details, matches the best-qualified guard by proximity and availability, sends confirmations, and escalates if needed. Manager review recommended for all automated assignments. Billed at 20 cr/shift assigned.",
    icon: Bot,
    tier: "elite",
    category: "AI Automation",
    creditCost: 20,
    creditUnit: "per shift assigned",
    benefits: [
      "Autonomous email inbox monitoring",
      "AI-powered guard-to-shift matching",
      "5-tier escalation (5-60 min intervals)",
      "Client confirmation with zero touch",
    ],
    roiHighlight: "Responds in minutes, not hours",
    demoAction: "See How It Works",
  },
  {
    id: "basic-time-tracking",
    name: "Basic Time Tracking",
    tagline: "Clock-In/Out & Timesheets",
    description: "Employee clock-in/out with timesheet management, break tracking, and basic reporting.",
    icon: Clock,
    tier: "core",
    category: "Time Tracking",
    creditCost: 0,
    benefits: [
      "Simple clock-in/out",
      "Timesheet management",
      "Break tracking",
      "Basic time reports",
    ],
    demoAction: "View Time Tracking",
  },
  {
    id: "gps-time-tracking",
    name: "GPS Time Tracking",
    tagline: "Verified Clock-In/Out with Location",
    description: "Employees clock in/out with GPS verification and optional photo proof. Supports time accountability and provides management with verifiable attendance records.",
    icon: MapPin,
    tier: "premium",
    category: "Time Tracking",
    creditCost: 1,
    creditUnit: "per verification",
    benefits: [
      "GPS-verified clock-in/out",
      "Geofenced job sites",
      "Photo verification option",
      "Real-time location tracking",
    ],
    roiHighlight: "Reduces unverified time entries with GPS-backed clock-in records",
    demoAction: "View Time Tracking",
  },
  {
    id: "guard-tour-tracking",
    name: "Guard Tour Tracking",
    tagline: "GPS/QR/NFC Patrol Verification",
    description: "Complete guard tour management with GPS, QR code, and NFC checkpoint scanning. Configurable patrol intervals with real-time completion tracking.",
    icon: Shield,
    tier: "premium",
    category: "Operations",
    creditCost: 1,
    creditUnit: "per scan",
    benefits: [
      "GPS/QR/NFC checkpoint scanning",
      "Configurable patrol intervals",
      "Real-time completion tracking",
      "Missed checkpoint alerts",
    ],
    roiHighlight: "Ensures guard accountability 24/7",
    demoAction: "View Guard Tours",
  },
  {
    id: "equipment-tracking",
    name: "Equipment Tracking",
    tagline: "Full Equipment Lifecycle Management",
    description: "Complete equipment lifecycle with checkout/return workflows, maintenance scheduling, and loss prevention across radios, vehicles, weapons, and tools.",
    icon: Zap,
    tier: "premium",
    category: "Operations",
    creditCost: 1,
    creditUnit: "per checkout/return",
    benefits: [
      "Checkout/return workflows",
      "Maintenance scheduling",
      "Category tracking (radio, vehicle, weapon, tool)",
      "Loss prevention alerts",
    ],
    roiHighlight: "Supports equipment accountability with issue tracking and maintenance records",
    demoAction: "View Equipment",
  },
  {
    id: "post-orders",
    name: "Post Orders Management",
    tagline: "Site-Specific Instructions",
    description: "Create, manage, and assign post order templates to shifts with priority levels, acknowledgment requirements, and photo documentation.",
    icon: FileText,
    tier: "premium",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Post order template creation",
      "Assign to specific shifts",
      "Acknowledgment tracking",
      "Photo documentation requirements",
    ],
    demoAction: "View Post Orders",
  },
  {
    id: "document-signing",
    name: "Internal Document Signing",
    tagline: "Digital Signatures Built In",
    description: "Full internal signing service with verification tokens, internal/external recipient support, reminder automation, and CAN-SPAM compliant emails.",
    icon: FileCheck,
    tier: "premium",
    category: "Compliance",
    creditCost: 3,
    creditUnit: "per document",
    benefits: [
      "Send documents for e-signature",
      "Internal & external recipients",
      "Automatic reminders",
      "Verification token security",
    ],
    roiHighlight: "Eliminates $500+/year in DocuSign fees",
    demoAction: "View Documents",
  },
  {
    id: "auto-payroll",
    name: "Auto-Payroll Integration",
    tagline: "Seamless Payroll Processing",
    description: "Automatic payroll processing with QuickBooks, ADP, Gusto, and Paychex integration. Tax calculations and direct deposit included. Two-part billing: 100 cr session fee + 8 cr/employee AI credits, plus $3.95–5.95/employee/run real-money processing fee via Stripe.",
    icon: DollarSign,
    tier: "premium",
    category: "Financial",
    creditCost: 8,
    creditUnit: "cr/employee + $3.95–5.95/emp Stripe fee",
    benefits: [
      "Sync with ADP, Gusto, Paychex, QuickBooks",
      "Automatic tax calculations",
      "Direct deposit processing",
      "W-2 & 1099 generation",
    ],
    roiHighlight: "Reduces payroll administration time — see pricing page for plan comparison",
    demoAction: "View Payroll Demo",
  },
  {
    id: "invoice-generation",
    name: "AI Invoice Generation",
    tagline: "Automated Client Billing",
    description: "Automated invoice creation from time entries with client billing rates, tax calculations, and delivery scheduling. Two-part billing: 75 cr session fee + 50 cr/invoice AI credits, plus 2.9% + $0.25 Stripe payment processing when client pays.",
    icon: DollarSign,
    tier: "premium",
    category: "Financial",
    creditCost: 50,
    creditUnit: "cr/invoice + 2.9%+$0.25 payment fee",
    benefits: [
      "Auto-generate from time entries",
      "Client billing rate management",
      "Tax calculations",
      "Scheduled delivery",
    ],
    roiHighlight: "Eliminates billing delays and errors",
    demoAction: "View Invoicing",
  },
  {
    id: "quickbooks-sync",
    name: "QuickBooks Integration",
    tagline: "Bidirectional Accounting Sync",
    description: "Full bidirectional QuickBooks sync for invoices, payments, expenses, and chart of accounts — reduces manual accounting entry.",
    icon: DollarSign,
    tier: "premium",
    category: "Financial",
    creditCost: 5,
    creditUnit: "per sync",
    benefits: [
      "Bidirectional data sync",
      "Invoice and payment sync",
      "Chart of accounts mapping",
      "Error auto-recovery",
    ],
    roiHighlight: "Saves 10+ hours/week on bookkeeping",
    demoAction: "View QuickBooks",
  },
  {
    id: "analytics-insights",
    name: "Advanced Analytics",
    tagline: "Trinity-Powered Intelligence",
    description: "Trinity cross-references scheduling, payroll, client contracts, and employee performance data to surface insights no human could spot. Revenue per guard-hour, client profitability, and predictive forecasting all in real time.",
    icon: BarChart3,
    tier: "premium",
    category: "Analytics",
    creditCost: 15,
    creditUnit: "per report",
    benefits: [
      "Revenue per guard-hour analysis",
      "Cross-domain pattern recognition",
      "Per-client profitability tracking",
      "Predictive labor forecasting",
    ],
    roiHighlight: "Surfaces cost reduction opportunities — actual savings vary by organization",
    demoAction: "View Analytics",
  },
  {
    id: "multi-state-compliance",
    name: "50-State Compliance",
    tagline: "Security Law Intelligence",
    description: "Trinity knows TX Ch.1702, CA BPC 7580, FL Ch.493, NY GBL Art.7-A, and every state's guard licensing requirements. She tracks certifications, flags expirations 30 days out, and generates audit-ready compliance reports automatically.",
    icon: Scale,
    tier: "premium",
    category: "Compliance",
    creditCost: 0,
    benefits: [
      "State-specific security law tracking",
      "30-day certification expiry alerts",
      "Audit-ready SOX compliance reports",
      "Use of force continuum guidance",
    ],
    roiHighlight: "Helps monitor compliance requirements — consult legal counsel for specific obligations",
    demoAction: "View Compliance",
  },
  {
    id: "employee-onboarding",
    name: "Employee Onboarding",
    tagline: "Automated New Hire Setup",
    description: "Automated employee onboarding workflows with document collection, training assignment, credential verification, and progress tracking.",
    icon: UserCheck,
    tier: "core",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Document collection workflows",
      "Training assignment",
      "Credential verification",
      "Progress tracking dashboard",
    ],
    demoAction: "View Onboarding",
  },
  {
    id: "employee-behavior-scoring",
    name: "Employee Behavior Scoring",
    tagline: "AI Performance Intelligence",
    description: "Trinity monitors clock-in habits, shift completions, no-shows, and peer interactions to build a living performance profile for every employee. She detects turnover risk before you see the resignation letter.",
    icon: TrendingUp,
    tier: "premium",
    category: "AI Automation",
    creditCost: 2,
    creditUnit: "per employee scored",
    benefits: [
      "Predictive turnover risk detection",
      "Reliability and engagement scoring",
      "Attendance pattern analysis",
      "Proactive manager alerts",
    ],
    roiHighlight: "Catches flight risks before they quit",
    demoAction: "View Scoring",
  },
  {
    id: "bot-ecosystem",
    name: "Trinity Bot Ecosystem",
    tagline: "5 Autonomous AI Bots",
    description: "Trinity delegates work to 5 specialized bots that execute autonomously with retry loops and escalation chains. Each bot thinks, acts, and reports back without human intervention.",
    icon: Bot,
    tier: "premium",
    category: "AI Automation",
    creditCost: 2,
    creditUnit: "per interaction",
    benefits: [
      "HelpAI - Instant employee support",
      "HelpAI - Action item tracking",
      "HelpAI - Incident processing and reports",
      "HelpAI - Autonomous time tracking",
    ],
    roiHighlight: "24/7 autonomous operations coverage",
    demoAction: "View Bots",
  },
  {
    id: "push-notifications",
    name: "Push Notifications",
    tagline: "Real-Time Alerts Everywhere",
    description: "Web Push notifications for shift assignments, schedule changes, certification expiry alerts, and urgent communications.",
    icon: Mail,
    tier: "core",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Shift assignment alerts",
      "Schedule change notifications",
      "Certification expiry warnings",
      "Urgent broadcast messages",
    ],
    demoAction: "View Notifications",
  },
  {
    id: "chatrooms",
    name: "Team Chatrooms",
    tagline: "Real-Time Shift Communication",
    description: "Real-time shift chatrooms with WebSocket messaging, file sharing, and AI-powered conversation management.",
    icon: MessageSquare,
    tier: "core",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Per-shift chat rooms",
      "Real-time WebSocket messaging",
      "File sharing",
      "AI-powered management",
    ],
    demoAction: "View Chat",
  },
  {
    id: "client-portal",
    name: "Client Portal",
    tagline: "Real-Time Client Visibility",
    description: "Real-time client dashboard with GPS tracking, incident reports, officer profiles, and service quality metrics.",
    icon: Building2,
    tier: "premium",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Real-time GPS tracking",
      "Incident report visibility",
      "Officer profiles & credentials",
      "Service quality metrics",
    ],
    roiHighlight: "Increases client retention by 30%",
    demoAction: "View Client Portal",
  },
  {
    id: "client-portal-dockchat",
    name: "Client Portal DockChat",
    tagline: "AI-Powered Client Issue Reporting",
    description: "Floating AI chat widget embedded in the client portal. Clients report billing discrepancies, staff issues, complaints, and policy violations directly. HelpAI analyzes sentiment, detects frustration signals, and generates a structured summary with recommended actions for your team to resolve.",
    icon: MessageSquare,
    tier: "premium",
    category: "AI Automation",
    creditCost: 10,
    benefits: [
      "Billing discrepancy & complaint intake",
      "Real-time sentiment analysis (5 levels)",
      "Frustration signal detection",
      "AI-generated resolution summary",
      "Severity scoring (low/medium/high/critical)",
      "Recommended action playbooks per issue type",
      "Full conversation audit trail",
      "10 credits/session charged to org pool",
    ],
    roiHighlight: "Resolves client issues 3x faster — no phone tag",
    demoAction: "Try DockChat",
  },
  {
    id: "contract-analysis",
    name: "Trinity Contract Analysis",
    tagline: "AI-Powered Contract Review",
    description: "Trinity reads every clause, scores risk, flags compliance gaps against state-specific security laws, and suggests negotiation strategies. She thinks like your legal counsel but works 24/7.",
    icon: FileCheck,
    tier: "elite",
    category: "AI Automation",
    creditCost: 30,
    creditUnit: "per contract",
    benefits: [
      "Risk assessment with severity scoring",
      "State-specific compliance gap detection",
      "AI negotiation strategy suggestions",
      "Standard clause library",
    ],
    roiHighlight: "Assists with contract drafting — outputs should be verified by a licensed attorney",
    demoAction: "View Contract AI",
  },
  {
    id: "white-label",
    name: "White-Label Branding",
    tagline: "Your Brand, Your Platform",
    description: "Complete customization with your brand colors, logo, custom domain, and branded mobile app. Remove all CoAIleague branding.",
    icon: Palette,
    tier: "elite",
    category: "Enterprise",
    creditCost: 0,
    benefits: [
      "Custom color palette",
      "Your logo everywhere",
      "Custom domain (schedule.yourcompany.com)",
      "White-labeled mobile app",
    ],
    roiHighlight: "Enables white-label reselling to clients — potential revenue varies by business model",
    demoAction: "See Branding Options",
  },
  {
    id: "incident-management",
    name: "Incident Management",
    tagline: "Complete Incident Tracking",
    description: "Incident reporting, tracking, and resolution workflow with severity levels, photo evidence, and regulatory compliance documentation.",
    icon: AlertTriangle,
    tier: "premium",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Severity-level incident classification",
      "Photo evidence capture",
      "Resolution workflow tracking",
      "Regulatory compliance documentation",
    ],
    roiHighlight: "Reduces liability exposure by 40%",
    demoAction: "View Incidents",
  },
  {
    id: "client-billing",
    name: "Client Billing",
    tagline: "Automated Billing & Invoicing",
    description: "Automated client billing with configurable rates, billing schedules, and online invoice payment portal for clients.",
    icon: CreditCard,
    tier: "premium",
    category: "Financial",
    creditCost: 0,
    benefits: [
      "Configurable client billing rates",
      "Automated billing schedules",
      "Online invoice payment portal",
      "Payment tracking & reminders",
    ],
    roiHighlight: "Eliminates billing admin ($60K+/year)",
    demoAction: "View Client Billing",
  },
  {
    id: "helpdesk-support",
    name: "Helpdesk & Support",
    tagline: "Built-In Employee Support",
    description: "Built-in helpdesk with ticket management, priority routing, and AI-powered response suggestions for fast issue resolution.",
    icon: LifeBuoy,
    tier: "core",
    category: "Operations",
    creditCost: 0,
    benefits: [
      "Ticket management system",
      "Priority routing",
      "AI-powered responses",
      "Knowledge base integration",
    ],
    demoAction: "View Helpdesk",
  },
];

const TIER_INFO: Record<string, { label: string; bgClass: string; bgStyle?: React.CSSProperties; icon: any }> = {
  core: { label: "Core", bgClass: "bg-blue-500", icon: Star },
  premium: { label: "Premium", bgClass: "bg-purple-500", icon: Crown },
  elite: { label: "Elite", bgClass: "", bgStyle: { background: "linear-gradient(to right, #f59e0b, #f97316)" }, icon: Building2 },
};

const CATEGORIES = ["All", "AI Automation", "Scheduling", "Time Tracking", "Operations", "Financial", "Analytics", "Compliance", "Enterprise"];

function FeatureCard({ feature, onViewDemo }: { feature: FeatureShowcase; onViewDemo: () => void }) {
  const tierInfo = TIER_INFO[feature.tier];
  const Icon = feature.icon;
  const isMobile = useIsMobile();

  return (
    <Card 
      className="hover-elevate group"
      data-testid={`card-feature-${feature.id}`}
    >
      <div className={cn(
        "h-36 sm:h-48 bg-gradient-to-br from-muted to-muted/50 relative",
        "flex items-center justify-center"
      )}>
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <Icon className="w-16 h-16 sm:w-20 sm:h-20 text-primary/20" />
        <Badge 
          className={cn("absolute top-3 right-3 text-white z-10 text-[10px] sm:text-xs", tierInfo.bgClass)}
          style={tierInfo.bgStyle}
        >
          {tierInfo.label}
        </Badge>
        <Button
          size="sm"
          className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-auto max-w-[calc(100%-24px)] gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity overflow-hidden"
          onClick={onViewDemo}
          data-testid={`button-demo-${feature.id}`}
        >
          <Play className="w-3 h-3 shrink-0" />
          <span className="text-xs sm:text-sm truncate">{feature.demoAction}</span>
        </Button>
      </div>
      
      <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm sm:text-lg leading-tight break-words">{feature.name}</CardTitle>
            <p className="text-xs sm:text-sm text-primary font-medium leading-tight break-words">{feature.tagline}</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 sm:space-y-4 p-3 pt-0 sm:p-6 sm:pt-0">
        <CardDescription className="text-xs sm:text-sm line-clamp-3">
          {feature.description}
        </CardDescription>
        
        <div className="space-y-1 sm:space-y-1.5">
          {feature.benefits.slice(0, isMobile ? 3 : 4).map((benefit, i) => (
            <div key={i} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
              <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground break-words min-w-0">{benefit}</span>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/50 border">
          <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-muted-foreground break-words min-w-0">
            {feature.creditCost === 0
              ? "Included free"
              : `${feature.creditCost} credits ${feature.creditUnit || "per use"}`}
          </span>
        </div>

        {feature.roiHighlight && (
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-400 break-words min-w-0">
              {feature.roiHighlight}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATIC_TIERS = [
  {
    key: "starter",
    name: "Starter",
    price: "$299",
    period: "/month",
    seats: "10 seats included",
    description: "For small security companies getting organized",
    popular: false,
    contactRequired: false,
    features: [
      "10 seats · $25/seat above 10",
      "3 sites · $49/site above 3",
      "5,000 AI interactions/month",
      "Scheduling, GPS timekeeping, incident reporting",
      "HelpAI for every officer 24/7",
      "ChatDock messaging",
      "Home state compliance monitoring",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    price: "$999",
    period: "/month",
    seats: "100 seats included",
    description: "Full AI operations platform for growing companies",
    popular: true,
    contactRequired: false,
    features: [
      "100 seats · $25/seat above 100",
      "10 sites · $49/site above 10",
      "20,000 AI interactions/month",
      "Internal payroll processing",
      "Invoice generation and payment collection",
      "Voice system (Trinity speaks and listens)",
      "All 50 states compliance monitoring",
      "Client portal + auditor portal",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "$2,999",
    period: "/month",
    seats: "300 seats included",
    description: "Advanced AI operations for established companies",
    popular: false,
    contactRequired: false,
    features: [
      "300 seats · $25/seat above 300",
      "25 sites · $39/site above 25",
      "60,000 AI interactions/month",
      "Multi-workspace management",
      "Full financial intelligence and P&L forecasting",
      "Social graph team dynamics intelligence",
      "Full API access",
      "Dedicated onboarding specialist",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$7,999",
    period: "/month",
    seats: "1,000 seats included",
    description: "Maximum Trinity AI for large security operations",
    popular: false,
    contactRequired: false,
    features: [
      "1,000 seats · $25/seat above 1,000",
      "75 sites · $29/site above 75",
      "200,000 AI interactions/month",
      "Unlimited workspaces",
      "White-label options available",
      "99.9% uptime SLA with service credits",
      "Dedicated account manager",
      "Priority phone support 24/7",
    ],
  },
  {
    key: "strategic",
    name: "Strategic",
    price: "Custom",
    period: "— from $15K/month",
    seats: "300+ officers",
    description: "For national security operations at scale",
    popular: false,
    contactRequired: true,
    features: [
      "Everything in Enterprise",
      "300+ officers across multiple states",
      "Custom AI model fine-tuning on your data",
      "Union contract rule enforcement",
      "Predictive scheduling law compliance (CA, NY, IL, WA, OR)",
      "Dedicated implementation team",
      "Custom SLA with financial penalties",
      "Emergency event support: $2,500/event",
    ],
  },
] as const;

function TierComparisonSection() {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold">Choose Your Plan</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          All plans include a 14-day free trial. No credit card required.
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATIC_TIERS.filter(t => !t.contactRequired).map((tier) => (
          <Card
            key={tier.key}
            className={cn(
              "relative",
              tier.popular && "ring-2 ring-primary"
            )}
            data-testid={`card-tier-${tier.key}`}
          >
            {tier.popular && (
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-bl-lg">
                Most Popular
              </div>
            )}

            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">{tier.name}</CardTitle>
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="text-2xl font-bold">{tier.price}</span>
                <span className="text-xs text-muted-foreground">{tier.period}</span>
              </div>
              <CardDescription className="text-xs">{tier.description}</CardDescription>
              <Badge variant="outline" className="w-fit text-[10px]">{tier.seats}</Badge>
            </CardHeader>

            <CardContent className="p-4 pt-0 space-y-3">
              <ul className="space-y-1.5">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs min-w-0">
                    <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                    <span className="break-words min-w-0">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                size="sm"
                variant={tier.popular ? "default" : "outline"}
                onClick={() => setLocation("/register")}
                data-testid={`button-select-${tier.key}`}
              >
                Start Free Trial
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Strategic — full-width row */}
      <Card className="border-primary/30" data-testid="card-tier-strategic">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-foreground">Strategic</span>
                <Badge variant="outline" className="text-[10px]">300+ Officers</Badge>
                <Badge variant="outline" className="text-[10px]">Custom Contract</Badge>
              </div>
              <p className="text-sm text-muted-foreground">For national and regional security operations at scale — from $15,000/month.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {(["Everything in Enterprise", "Custom AI model fine-tuning", "Union contract enforcement", "Predictive scheduling law compliance", "Dedicated implementation team", "Custom SLA with financial penalties"] as const).map((f) => (
                  <span key={f} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-green-500 shrink-0" />{f}
                  </span>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setLocation("/sales")}
              data-testid="button-select-strategic"
            >
              Contact Sales
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        All prices are USD per month. Seat overages billed monthly. Annual plans save 2 months.{" "}
        <button className="text-primary underline-offset-2 hover:underline" onClick={() => setLocation("/pricing")}>
          See full pricing details
        </button>
      </p>
    </div>
  );
}

function ROICalculatorSection() {
  const [officers, setOfficers] = useState(30);
  const [, setLocation] = useLocation();

  // Staffing cost estimates based on Texas market rates
  const schedulersNeeded = Math.max(1, Math.ceil(officers / 28));
  const schedulerAnnual = schedulersNeeded * 46000;
  const opsManagerAnnual = officers >= 20 ? 85000 : 0;
  const softwareAnnual = 3600 + 4800; // scheduling + payroll tools
  const overtimeAnnual = Math.round(officers * 1800); // ~$150/officer/month in overtime waste
  const totalCurrentAnnual = schedulerAnnual + opsManagerAnnual + softwareAnnual + overtimeAnnual;

  // Recommended CoAIleague plan
  const recommendedTier =
    officers <= 8 ? "starter" :
    officers <= 98 ? "professional" :
    officers <= 298 ? "business" : "enterprise";
  const planCosts: Record<string, number> = {
    starter: 299 * 12,
    professional: 999 * 12,
    business: 2999 * 12,
    enterprise: 7999 * 12,
  };
  const planNames: Record<string, string> = {
    starter: "Starter ($299/mo)",
    professional: "Professional ($999/mo)",
    business: "Business ($2,999/mo)",
    enterprise: "Enterprise ($7,999/mo)",
  };
  const coaAnnual = planCosts[recommendedTier];
  const netSavings = totalCurrentAnnual - coaAnnual;

  const f = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

  return (
    <Card className="p-3 sm:p-6" data-testid="section-roi-calculator">
      <div className="space-y-4 sm:space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold">Estimate Your Savings</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Move the slider to see a quick estimate. Use the full calculator for a precise number.
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <label className="text-xs sm:text-sm font-medium">Security Officers</label>
          <input
            type="range"
            min="5"
            max="200"
            value={officers}
            onChange={(e) => setOfficers(parseInt(e.target.value))}
            className="w-full"
            data-testid="input-employee-count"
          />
          <div className="text-center text-lg sm:text-2xl font-bold text-primary">
            {officers} officers
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Recommended plan: <span className="font-semibold text-foreground capitalize">{planNames[recommendedTier]}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="p-3 rounded-lg border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground mb-1">Schedulers ({schedulersNeeded})</p>
            <p className="text-base font-bold text-foreground">{f(schedulerAnnual / 12)}/mo</p>
          </div>
          {opsManagerAnnual > 0 && (
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground mb-1">Operations Manager</p>
              <p className="text-base font-bold text-foreground">{f(opsManagerAnnual / 12)}/mo</p>
            </div>
          )}
          <div className="p-3 rounded-lg border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground mb-1">Software Tools</p>
            <p className="text-base font-bold text-foreground">{f(softwareAnnual / 12)}/mo</p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground mb-1">Overtime Waste</p>
            <p className="text-base font-bold text-foreground">{f(overtimeAnnual / 12)}/mo</p>
          </div>
        </div>

        <div className="rounded-lg border bg-primary/5 p-4 text-center space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Current Annual Cost</p>
              <p className="font-bold text-foreground">{f(totalCurrentAnnual)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">CoAIleague Annual</p>
              <p className="font-bold text-foreground">{f(coaAnnual)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">You Save</p>
              <p className={`font-bold ${netSavings > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {netSavings > 0 ? `+${f(netSavings)}` : f(netSavings)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Estimates based on Texas market salary data 2024. Does not include payroll processing, compliance, or turnover savings.
          </p>
          <Button
            onClick={() => setLocation("/pricing#roi-calculator")}
            data-testid="button-full-roi-calculator"
            className="w-full sm:w-auto"
          >
            Get My Full Savings Report
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function FeaturesShowcasePage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  
  const filteredFeatures = activeCategory === "All" 
    ? FEATURE_SHOWCASES 
    : FEATURE_SHOWCASES.filter(f => f.category === activeCategory);

  const handleViewDemo = (featureId: string) => {
    const demoRoutes: Record<string, string> = {
      "trinity-ai-assistant": "/trinity",
      "smart-scheduling": "/schedule",
      "trinity-staffing": "/automation-control",
      "gps-time-tracking": "/time-tracking",
      "auto-payroll": "/payroll",
      "analytics-insights": "/analytics",
      "multi-state-compliance": "/security-compliance",
      "contract-analysis": "/sales-crm",
      "white-label": "/settings",
    };
    setLocation(demoRoutes[featureId] || "/dashboard");
  };

  const pageConfig: CanvasPageConfig = {
    id: "features-showcase",
    title: "Platform Features",
    subtitle: "Discover what CoAIleague can do for your business",
    category: "public",
    variant: "marketing",
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <SEO
        title={PAGE_SEO.features.title}
        description={PAGE_SEO.features.description}
        canonical="https://www.coaileague.com/features"
      />
      <div className="min-h-screen bg-background overflow-x-hidden w-full">
        <UniversalHeader variant="public" />
        
        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-8 space-y-4 sm:space-y-8">
        <div className="text-center space-y-3 sm:space-y-4 py-4 sm:py-8">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <TrinityLogo size={isMobile ? 32 : 48} />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
              CoAIleague Features
            </h1>
          </div>
          <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            Powered by Trinity — an AI that thinks like your CFO, CEO, and HR Director combined. 
            She learns your business, predicts problems before they happen, and keeps you audit-ready 24/7.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 px-2">
            <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
              <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              <span>C-Suite AI Brain</span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
              <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              <span>50-State Compliant</span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
              <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              <span>$200K+ Savings</span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
              <Brain className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              <span>Learns Your Org</span>
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="features" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
            <TabsTrigger value="features" className="text-xs sm:text-sm" data-testid="tab-features">
              Features
            </TabsTrigger>
            <TabsTrigger value="pricing" className="text-xs sm:text-sm" data-testid="tab-pricing">
              Pricing
            </TabsTrigger>
            <TabsTrigger value="roi" className="text-xs sm:text-sm" data-testid="tab-roi">
              ROI
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features" className="space-y-4 sm:space-y-6">
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
              {CATEGORIES.map(category => (
                <Badge
                  key={category}
                  variant={activeCategory === category ? "default" : "outline"}
                  className="cursor-pointer text-[10px] sm:text-sm"
                  onClick={() => setActiveCategory(category)}
                  data-testid={`filter-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {category}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredFeatures.map(feature => (
                <FeatureCard 
                  key={feature.id} 
                  feature={feature} 
                  onViewDemo={() => handleViewDemo(feature.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <TierComparisonSection />
            
            <Card className="p-3 sm:p-6" data-testid="section-ai-interactions-explained">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold">How AI Interactions Work</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Flat monthly pricing. No credit system. Each plan includes a generous AI interaction allowance — most clients use under 30%.
                  </p>
                </div>

                <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
                  <div className="p-3 sm:p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-5 w-5 text-amber-500" />
                      <span className="text-sm font-medium">What Counts</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One interaction = one Trinity conversation, one autonomous task executed, one voice command, one morning briefing, one incident narrative, or one analytics query.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-medium">What Never Counts</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Scheduling views, clock in/out, basic HelpAI officer commands, dashboard loads, document storage, payroll calculations, and notification delivery never count against your allowance.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-5 w-5 text-blue-500" />
                      <span className="text-sm font-medium">Overages</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each plan has a hard cap. Above that cap, overages are billed per interaction at your tier rate ($0.08–$0.15). Critical operations — panic alerts, incident reporting, HelpAI — never stop.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs">
                  {[
                    { tier: "Starter", included: "5K", cap: "8K", rate: "$0.15" },
                    { tier: "Professional", included: "20K", cap: "35K", rate: "$0.12" },
                    { tier: "Business", included: "60K", cap: "120K", rate: "$0.10" },
                    { tier: "Enterprise", included: "200K", cap: "400K", rate: "$0.08" },
                  ].map(({ tier, included, cap, rate }) => (
                    <div key={tier} className="p-2 rounded-md border bg-card">
                      <p className="font-semibold text-foreground">{tier}</p>
                      <p className="text-muted-foreground">{included}/mo included</p>
                      <p className="text-muted-foreground">Cap: {cap}</p>
                      <p className="text-muted-foreground">{rate}/overage</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="roi">
            <ROICalculatorSection />
          </TabsContent>
        </Tabs>

        <div className="text-center py-4 sm:py-8 space-y-3 sm:space-y-4 border-t overflow-hidden">
          <h2 className="text-base sm:text-xl font-semibold px-2 break-words">Ready to transform your workforce management?</h2>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            <Button size={isMobile ? "sm" : "lg"} onClick={() => setLocation("/register")} data-testid="button-start-trial">
              <span className="truncate">Start Free Trial</span>
              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1 shrink-0" />
            </Button>
            <Button size={isMobile ? "sm" : "lg"} variant="outline" onClick={() => setLocation("/sales")} data-testid="button-contact-sales">
              <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
              <span className="truncate">Contact Sales</span>
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            14-day free trial. No credit card required.
          </p>
        </div>

        </main>
        
        <Footer variant="dark" />
      </div>
    </CanvasHubPage>
  );
}
