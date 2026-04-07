import { useState, useRef, Fragment } from "react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle2, XCircle, ArrowRight, Calculator, ChevronDown, ChevronUp,
  Users, Shield, DollarSign, Brain, Zap, Star, Phone, Mail, Eye, BookOpen,
  Lightbulb, Heart, Network, ListChecks, Layers,
} from "lucide-react";
import {
  PRICING_TIERS, TIER_LIMITS, STRATEGIC_SEAT_PRICING,
  recommendTier, getAnnualSavings,
  type SubscriptionTier,
} from "@/config/pricing";

// ─── Annual toggle ────────────────────────────────────────────────────────────

function AnnualToggle({ annual, onChange }: { annual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button
        onClick={() => onChange(false)}
        className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${!annual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover-elevate"}`}
        data-testid="toggle-monthly"
      >
        Monthly
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${annual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover-elevate"}`}
        data-testid="toggle-annual"
      >
        Annual — 2 Months Free
      </button>
    </div>
  );
}

// ─── Checkmark / X helpers ────────────────────────────────────────────────────

function Check() { return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />; }
function X() { return <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />; }

// ─── Payroll fee callout ──────────────────────────────────────────────────────

function PayrollCallout({ tier }: { tier: SubscriptionTier }) {
  const t = PRICING_TIERS[tier];
  if (!t.payrollFees || !t.invoicingFees) return null;
  const p = t.payrollFees;
  const inv = t.invoicingFees;
  const cardPct = (inv.cardRatePct * 100).toFixed(1);
  const cardFlat = (inv.cardFlatCents / 100).toFixed(2);
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md bg-background/50 border border-border p-3">
        <p className="text-xs font-semibold text-foreground mb-1.5">Internal Payroll Fees</p>
        <p className="text-xs text-muted-foreground mb-2">60–75% less than QuickBooks. All tax forms included.</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Per employee/run</span><span className="font-medium text-foreground">${p.perEmployeePerRun.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Direct deposit</span><span className="font-medium text-foreground">${p.directDeposit.toFixed(2)}/txn</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Quarterly tax filing</span><span className="font-medium text-foreground">${p.quarterlyTaxFiling}/filing</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Year-end W-2 / 1099</span><span className="font-medium text-foreground">${p.yearEndForm}/form</span></div>
        </div>
      </div>
      <div className="rounded-md bg-background/50 border border-border p-3">
        <p className="text-xs font-semibold text-foreground mb-1.5">Payment Collection Fees</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Card payments</span><span className="font-medium text-foreground">{cardPct}% + ${cardFlat}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ACH bank transfer</span><span className="font-medium text-foreground">${inv.achPerTransaction.toFixed(2)}/txn</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── "What This Replaces" data per tier ──────────────────────────────────────

const TIER_REPLACES: Record<string, { items: string[]; note: string }> = {
  starter: {
    items: [
      "Your scheduling spreadsheets and the time you spend on them",
      "Basic incident report templates in Google Docs",
      "Manual overtime tracking in Excel",
      "Your personal Sunday evening with schedule chaos",
    ],
    note: "Designed for growing companies ready to replace manual spreadsheet workflows. Actual time savings vary by team size and implementation.",
  },
  professional: {
    items: [
      "Your dedicated scheduler ($38–55K salary)",
      "ADP or Gusto payroll subscription ($300–800/month)",
      "QuickBooks Invoicing ($100–400/month)",
      "Compliance tracking software ($200–500/month)",
    ],
    note: "30 officers × $749/month = $24.97/officer. Compare to the cost of dedicated scheduling and payroll coordinators at your organization.",
  },
  business: {
    items: [
      "Your operations manager and their team ($75–95K salary)",
      "Multiple scheduling, payroll, and compliance tools",
      "15–20 hours/week of your personal management time",
      "The HR administrator you keep almost needing to hire",
    ],
    note: "Organizations with 75+ officers can compare this cost against their current operations management overhead. Trinity recommends — your managers decide.",
  },
  enterprise: {
    items: [
      "Entire middle management operations layer",
      "3–5 full-time administrative staff",
      "Your current technology stack across 5–7 platforms",
      "Dedicated compliance consultant ($150–300/hour)",
    ],
    note: "200 officers × $6,999/month = $35/officer. Compare to multi-person operations teams, compliance consultants, and disparate software subscriptions your organization currently manages.",
  },
};

// ─── Tier card ────────────────────────────────────────────────────────────────

function TierCard({ tier, annual }: { tier: SubscriptionTier; annual: boolean }) {
  const t = PRICING_TIERS[tier];
  const limits = TIER_LIMITS[tier];
  const price = annual && t.annualMonthlyEquivalent ? t.annualMonthlyEquivalent : t.monthlyPrice;
  const isEnterprise = tier === "enterprise";

  return (
    <Card
      data-testid={`card-tier-${tier}`}
      className={`flex flex-col relative ${t.popular ? "border-primary border-2" : ""}`}
    >
      {t.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
        </div>
      )}
      {isEnterprise && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-violet-600 text-white px-3">Full Power</Badge>
        </div>
      )}

      <CardContent className="flex flex-col flex-1 pt-6 pb-5 gap-0">
        {/* Header */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{t.tagline}</p>
          <h3 className="text-xl font-bold text-foreground">{t.displayName}</h3>
        </div>

        {/* Price */}
        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            {price !== null ? (
              <>
                <span className="text-3xl font-bold text-foreground">${price.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </>
            ) : (
              <span className="text-2xl font-bold text-foreground">Contact Us</span>
            )}
          </div>
          {annual && t.annualPrice && (
            <p className="text-xs text-green-400 mt-0.5">
              ${t.annualPrice.toLocaleString()}/year · {getAnnualSavings(tier)}
            </p>
          )}
          {!annual && t.monthlyPrice && (
            <p className="text-xs text-muted-foreground mt-0.5">Billed monthly</p>
          )}
        </div>

        {/* Seats / Sites / Clients */}
        <div className="bg-muted/30 rounded-md px-3 py-2 mb-4 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Seats included</span>
            <span className="font-medium text-foreground">{limits.seatsIncluded ?? "Custom"}</span>
          </div>
          {limits.seatOverageMonthly && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Per extra seat</span>
              <span className="font-medium text-foreground">${limits.seatOverageMonthly}/mo</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sites</span>
            <span className="font-medium text-foreground">
              {limits.sitesIncluded ?? "Custom"}
              {limits.siteOverageMonthly ? ` · $${limits.siteOverageMonthly} extra` : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Clients</span>
            <span className="font-medium text-foreground capitalize">
              {typeof t.clientsIncluded === "number" ? t.clientsIncluded : t.clientsIncluded ?? "Custom"}
            </span>
          </div>
          {limits.interactionsMonthly && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI interactions</span>
              <span className="font-medium text-foreground">{limits.interactionsMonthly.toLocaleString()}/mo</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <Link href="/register">
          <Button
            className="w-full mb-4"
            variant={t.popular ? "default" : "outline"}
            data-testid={`button-cta-${tier}`}
          >
            {t.contactRequired ? "Get Custom Quote" : "Start Free 14-Day Trial"}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </Link>
        {!t.contactRequired && (
          <p className="text-center text-xs text-muted-foreground mb-3">No credit card required</p>
        )}

        {/* Features */}
        <div className="flex-1 space-y-1.5">
          {t.features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Check />
              <span className="text-foreground">{f}</span>
            </div>
          ))}
          {t.notIncluded.slice(0, 3).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <X />
              <span className="text-muted-foreground/60">{f}</span>
            </div>
          ))}
        </div>

        {/* What This Replaces callout */}
        {TIER_REPLACES[tier] && (
          <div className="mt-4 rounded-md bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">What This Replaces</p>
            <ul className="space-y-1 mb-2">
              {TIER_REPLACES[tier].items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="text-primary shrink-0 mt-0.5">—</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-primary font-medium">{TIER_REPLACES[tier].note}</p>
          </div>
        )}

        {/* Payroll callout */}
        <PayrollCallout tier={tier} />

        {/* Hard cap note */}
        {limits.hardCap && (
          <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
            Hard cap: {limits.hardCap.toLocaleString()} interactions/month
            {limits.interactionOverageRate && ` · $${limits.interactionOverageRate}/interaction above cap`}
            <br />
            <span className="text-green-400">Critical operations never stop.</span>
          </div>
        )}
        {t.emergencyEventFee && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            Emergency events: ${t.emergencyEventFee.toLocaleString()} flat/event
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Strategic card (full-width, premium treatment) ───────────────────────────

function StrategicCard({ annual: _annual }: { annual: boolean }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [officers, setOfficers] = useState("");

  const inquiry = useMutation({
    mutationFn: (data: { email: string; officerCount: string; tier: string }) =>
      apiRequest("POST", "/api/marketing/enterprise-inquiry", data),
    onSuccess: () => {
      toast({ title: "Inquiry received", description: "We'll respond within 4 business hours with a personalized ROI analysis." });
      setOpen(false);
    },
    onError: () => toast({ title: "Error", description: "Something went wrong. Email us at sales@coaileague.com", variant: "destructive" }),
  });

  return (
    <div className="mt-6 rounded-md border border-primary/30 bg-card p-8" data-testid="card-tier-strategic">
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left */}
        <div>
          <Badge variant="secondary" className="mb-3">300+ Officers</Badge>
          <h3 className="text-2xl font-bold text-foreground mb-2">Strategic</h3>
          <p className="text-muted-foreground mb-4">
            For national and regional security operations at scale. Allied Universal, Securitas,
            and large regional companies trust platforms at this scale. CoAIleague Strategic is
            purpose-engineered for yours.
          </p>
          <div className="space-y-1 text-sm mb-5">
            {[
              { label: "300–1,000 officers", price: "from $45/seat/month" },
              { label: "1,001–5,000 officers", price: "from $55/seat/month" },
              { label: "5,000+ officers", price: "from $65/seat/month" },
            ].map(({ label, price }) => (
              <div key={label} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground">{price}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Minimum engagement</span>
              <span className="font-medium text-foreground">$15,000/month</span>
            </div>
          </div>
          {!open ? (
            <Button onClick={() => setOpen(true)} data-testid="button-strategic-inquiry">
              Get Your Custom Quote
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          ) : (
            <div className="space-y-3">
              <input
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                data-testid="input-strategic-email"
              />
              <input
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Number of officers"
                value={officers}
                onChange={e => setOfficers(e.target.value)}
                data-testid="input-strategic-officers"
              />
              <Button
                className="w-full"
                disabled={inquiry.isPending || !email}
                onClick={() => inquiry.mutate({ email, officerCount: officers, tier: "strategic" })}
                data-testid="button-strategic-submit"
              >
                {inquiry.isPending ? "Sending..." : "Send Inquiry"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">We respond within 4 business hours with a personalized ROI analysis</p>
            </div>
          )}
        </div>

        {/* Right */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Everything in Enterprise, plus:</p>
          <ul className="space-y-1.5">
            {PRICING_TIERS.strategic.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check />
                <span className="text-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "Why do you price per seat instead of per feature?",
    a: "Because per-feature pricing is how software companies hide the real cost. You get confused about what you are paying for and end up not using features you bought. Seat pricing is simple: everyone in your company gets the full platform. Your ops manager, your schedulers, your officers — one price. No tiers within tiers.",
  },
  {
    q: "What is actually included in each seat?",
    a: "Every seat includes Trinity's full AI brain, complete access to scheduling, compliance, timekeeping, incident reporting, ChatDock, HelpAI, the officer portal, and every feature available in your plan. The only difference between plans is the included seat count, payroll and invoicing access, compliance depth, and analytics level.",
  },
  {
    q: "Can I try it before I commit to anything?",
    a: "Yes. 14 days of full platform access. Up to 10 seats. No credit card. No automatic charges. At the end of your trial, you pick a plan or your account goes read-only. We do not hold your data hostage.",
  },
  {
    q: "What does 'Trinity replaces your scheduler' actually mean in practice?",
    a: "When a calloff comes in at 2am, Trinity identifies qualified, available officers — sorted by distance, overtime exposure, reliability score, and license type — and sends fill requests. She tracks acknowledgment. If an officer does not respond, she tries the next one. She confirms coverage and notifies the supervisor. Your scheduler's involvement: review what Trinity handled when they wake up.",
  },
  {
    q: "What happens to my payroll if I switch from ADP or Gusto?",
    a: "Trinity handles the full payroll stack on Professional plans and above: W-4 and W-9 collection, federal and state withholding, FICA, FUTA/SUTA, quarterly 941 filing, state payroll tax filings, year-end W-2 and 1099-NEC, and direct deposit. If you want to keep QuickBooks, we have a sync integration. But most clients drop their payroll provider entirely and keep the savings.",
  },
  {
    q: "What counts as an AI interaction?",
    a: "Any Trinity conversation, autonomous task, voice command, morning briefing, incident narrative, DAR report, or advanced analytics query is one interaction. Scheduling views, clock-ins, dashboard loads, document storage, HelpAI basic officer lookups, and payroll calculations never count. Most clients use less than 30% of their monthly allowance.",
  },
  {
    q: "What happens when Trinity hits the interaction limit?",
    a: "Critical operations never stop regardless of interaction count: panic alerts, incident reporting, compliance enforcement, and officer HelpAI assistance. Non-urgent autonomous tasks queue until your next billing cycle. You are notified before you approach your cap. We have never had a client locked out of emergency functions.",
  },
  {
    q: "Can I add officers mid-month if I win a contract?",
    a: "Yes. Add seats the same day you win the contract. You are charged prorated for the remainder of the month at your tier's per-seat rate. You are never blocked from adding staff. If you consistently need more seats than your plan includes, Trinity will recommend an upgrade — but that is your choice, not forced.",
  },
  {
    q: "What is Strategic pricing?",
    a: "Strategic is for 300+ officer operations. Pricing is negotiated based on your officer count, states of operation, payroll volume, and specific requirements. Minimum engagement is $15,000/month. We respond to all Strategic inquiries within 4 business hours with a personalized ROI analysis. Most Strategic clients find the platform pays for itself within the first quarter.",
  },
  {
    q: "Is there a long-term contract?",
    a: "Monthly plans cancel any time — no commitment. Annual plans are prepaid for 12 months and include 2 free months (equivalent to saving 16%). Strategic plans require an annual contract with custom terms. We do not do auto-renew surprises. You know exactly what you are paying and when.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-foreground hover-elevate"
        data-testid={`faq-${q.slice(0, 20).replace(/\s/g, "-")}`}
      >
        {q}
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>
      {open && <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>}
    </div>
  );
}

// ─── Feature comparison table ─────────────────────────────────────────────────

type CellVal = boolean | string;

const TABLE_DATA: { category: string; rows: [string, CellVal, CellVal, CellVal, CellVal, CellVal][] }[] = [
  {
    category: "Core Operations",
    rows: [
      ["Trinity AI Brain", true, true, true, true, true],
      ["Scheduling and Shift Management", true, true, true, true, true],
      ["GPS Clock In/Out", true, true, true, true, true],
      ["Overtime Detection", true, true, true, true, true],
      ["Calloff Processing", true, true, true, true, true],
      ["Coverage Gap Detection", true, true, true, true, true],
      ["Shift Conflict Prevention", true, true, true, true, true],
    ],
  },
  {
    category: "Officer Tools",
    rows: [
      ["HelpAI Field Assistant", true, true, true, true, true],
      ["ChatDock Messaging", true, true, true, true, true],
      ["Incident Reporting (HelpAI)", true, true, true, true, true],
      ["DAR Legal Narratives", false, true, true, true, true],
      ["Voice Commands", false, true, true, true, true],
      ["Panic Alert System", true, true, true, true, true],
      ["Lone Worker Monitoring", true, true, true, true, true],
      ["Real-Time Dispatch", true, true, true, true, true],
      ["GPS Proof of Service", true, true, true, true, true],
      ["BOLO Broadcast", true, true, true, true, true],
      ["Visitor Log", true, true, true, true, true],
      ["Weapon and Asset Tracking", true, true, true, true, true],
    ],
  },
  {
    category: "Employee Management",
    rows: [
      ["Employee Onboarding", true, true, true, true, true],
      ["8 Standard Documents", true, true, true, true, true],
      ["Performance Scoring", true, true, true, true, true],
      ["Milestone Recognition", true, true, true, true, true],
      ["Raise Recommendations", true, true, true, true, true],
      ["Disciplinary Analyzer", false, true, true, true, true],
      ["FTO Program Management", false, false, true, true, true],
      ["Social Graph Intelligence", false, false, true, true, true],
      ["Union Contract Rules", false, false, false, false, true],
    ],
  },
  {
    category: "Compliance",
    rows: [
      ["Home State Compliance", true, true, true, true, true],
      ["All 50 States", false, true, true, true, true],
      ["License Expiration Alerts", true, true, true, true, true],
      ["Armed Post Guard", true, true, true, true, true],
      ["Statute-Cited Recommendations", false, true, true, true, true],
      ["Compliance Reports", false, true, true, true, true],
      ["Auditor Portal", false, true, true, true, true],
      ["Federal Compliance", false, false, false, true, true],
      ["Predictive Scheduling Laws", false, false, false, false, true],
    ],
  },
  {
    category: "Financial",
    rows: [
      ["Internal Payroll Processing", false, true, true, true, true],
      ["Internal Invoicing", false, true, true, true, true],
      ["Client Payment Collection", false, true, true, true, true],
      ["Financial Dashboard", "Basic", true, true, true, true],
      ["Site Margin Scoring", false, true, true, true, true],
      ["P&L Forecasting", false, false, true, true, true],
      ["Contract Health Monitoring", false, true, true, true, true],
      ["QuickBooks Sync", false, true, true, true, true],
      ["Tax Filing", false, "$", "$", "$", "$"],
      ["Year-End Forms", false, "$", "$", "$", "$"],
    ],
  },
  {
    category: "Client and Portal",
    rows: [
      ["Client Portal", false, true, true, true, true],
      ["RFP Generation", false, true, true, true, true],
      ["Client Health Scoring", false, true, true, true, true],
    ],
  },
  {
    category: "Trinity Intelligence",
    rows: [
      ["Morning Briefings", true, true, true, true, true],
      ["Autonomous Task Queue", "Basic", true, true, true, true],
      ["Predictive Brain", false, true, true, true, true],
      ["Curiosity Engine", false, false, true, true, true],
      ["Counterfactual Learning", false, false, true, true, true],
      ["Hypothesis Engine", false, false, true, true, true],
      ["Temporal Consciousness", true, true, true, true, true],
      ["Custom AI Fine-Tuning", false, false, false, false, true],
    ],
  },
  {
    category: "Platform",
    rows: [
      ["Mobile Access", true, true, true, true, true],
      ["Analytics", "Basic", "Advanced", "Full", "Custom", "Custom"],
      ["API Access", false, false, true, true, true],
      ["Multi-Workspace", false, false, true, true, true],
      ["White Label", false, false, false, true, true],
      ["Custom Integrations", false, false, false, true, true],
      ["Emergency Event Support", false, false, false, "$1,000", "$2,500"],
    ],
  },
  {
    category: "Support",
    rows: [
      ["Email Support", true, true, true, true, true],
      ["Priority Support", false, true, true, true, true],
      ["Dedicated Onboarding", false, false, true, true, true],
      ["Dedicated Account Manager", false, false, false, true, true],
      ["Phone Support 24/7", false, false, false, true, true],
      ["On-Site Implementation", false, false, false, false, true],
      ["Uptime SLA", false, false, false, "99.9%", "Custom"],
    ],
  },
];

function CellDisplay({ val }: { val: CellVal }) {
  if (val === true) return <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />;
  if (val === false) return <span className="text-muted-foreground/30 text-base">—</span>;
  return <span className="text-xs font-medium text-primary">{val}</span>;
}

function FeatureTable() {
  const TIERS = ["Starter", "Professional", "Business", "Enterprise", "Strategic"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border">
            <th className="text-left py-3 pr-4 font-medium text-muted-foreground w-48">Feature</th>
            {TIERS.map(t => (
              <th key={t} className="text-center py-3 px-2 font-medium text-foreground">{t}</th>
            ))}
          </tr>
          <tr className="border-b border-border/60">
            <th />
            {(["$199", "$749", "$2,249", "$6,999", "Custom"] as const).map(p => (
              <th key={p} className="text-center py-1.5 px-2 text-xs text-muted-foreground font-normal">{p}/mo</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_DATA.map(({ category, rows }) => (
            <Fragment key={category}>
              <tr>
                <td colSpan={6} className="pt-4 pb-1 text-xs font-semibold text-primary uppercase tracking-wide">
                  {category}
                </td>
              </tr>
              {rows.map(([feature, ...cells]) => (
                <tr key={feature} className="border-b border-border/30">
                  <td className="py-2 pr-4 text-muted-foreground text-xs">{feature}</td>
                  {cells.map((val, i) => (
                    <td key={i} className="py-2 px-2 text-center">
                      <CellDisplay val={val} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ROI Calculator ───────────────────────────────────────────────────────────

function RoiCalculator() {
  const [officers, setOfficers] = useState(25);
  const [adminStaff, setAdminStaff] = useState(5);
  const [sites, setSites] = useState(8);
  const [hasOpsManager, setHasOpsManager] = useState(true);
  const [opsManagerSalary, setOpsManagerSalary] = useState(72000);
  const [schedulerCount, setSchedulerCount] = useState(1);
  const [schedulerSalary, setSchedulerSalary] = useState(38000);
  const [hasHr, setHasHr] = useState(false);
  const [hrCost, setHrCost] = useState(55000);
  const [hasPayrollCoord, setHasPayrollCoord] = useState(false);
  const [payrollCoordSalary, setPayrollCoordSalary] = useState(48000);
  const [hasBilling, setHasBilling] = useState(false);
  const [billingSalary, setBillingSalary] = useState(42000);
  const [ownerHrsWeek, setOwnerHrsWeek] = useState(20);
  const [ownerHourlyValue, setOwnerHourlyValue] = useState(65);
  const [schedulingSwMonthly, setSchedulingSwMonthly] = useState(150);
  const [payrollProvider, setPayrollProvider] = useState("quickbooks");
  const [payrollMonthlyCost, setPayrollMonthlyCost] = useState(480);
  const [otherSwMonthly, setOtherSwMonthly] = useState(200);
  const [monthlyOvertime, setMonthlyOvertime] = useState(3000);
  const [turnoverPct, setTurnoverPct] = useState(120);
  const [officersReplaced, setOfficersReplaced] = useState(10);
  const [replaceCost, setReplaceCost] = useState(4500);
  const [complianceFines, setComplianceFines] = useState(0);
  const [lostContractsCount, setLostContractsCount] = useState(0);
  const [lostContractAvgValue, setLostContractAvgValue] = useState(45000);
  const [monthlyInvoicing, setMonthlyInvoicing] = useState(80000);
  const [currentCardRate, setCurrentCardRate] = useState(2.9);
  const [currentAchFee, setCurrentAchFee] = useState(1.50);
  const [achTransactionsPerMonth, setAchTransactionsPerMonth] = useState(20);

  const totalSeats = officers + adminStaff;
  const recommended = recommendTier(totalSeats);
  const t = PRICING_TIERS[recommended];
  const limits = TIER_LIMITS[recommended];

  // Current costs
  const staffCost = (hasOpsManager ? opsManagerSalary : 0)
    + (schedulerCount * schedulerSalary)
    + (hasHr ? hrCost : 0)
    + (hasPayrollCoord ? payrollCoordSalary : 0)
    + (hasBilling ? billingSalary : 0);
  const ownerTimeCost = ownerHrsWeek * ownerHourlyValue * 52;
  const swCost = (schedulingSwMonthly + payrollMonthlyCost + otherSwMonthly) * 12;
  const overtimeCost = monthlyOvertime * 12;
  const turnoverCost = officersReplaced * replaceCost;
  const lostRevenue = lostContractsCount * lostContractAvgValue;
  const processingPremium = monthlyInvoicing * 0.005 * 12;  // 0.5% better rate × volume
  const currentAchCost = (currentAchFee - 0.30) * achTransactionsPerMonth * 12;
  const totalCurrentOverhead = staffCost + ownerTimeCost + swCost + overtimeCost + turnoverCost + complianceFines + lostRevenue;

  // CoAIleague savings
  const opsManagerSaved = hasOpsManager ? opsManagerSalary : 0;
  const schedulersSaved = schedulerCount * schedulerSalary;
  const hrReduced = hasHr ? hrCost * 0.6 : 0;
  const payrollCoordSaved = hasPayrollCoord ? payrollCoordSalary : 0;
  const billingSaved = hasBilling ? billingSalary : 0;
  const ownerTimeSaved = ownerTimeCost * 0.7;
  const swSaved = (schedulingSwMonthly + payrollMonthlyCost + otherSwMonthly) * 12;
  const overtimeSaved = overtimeCost * 0.30;
  const turnoverSaved = turnoverCost * 0.25;
  const complianceSaved = complianceFines;
  const processingNetSaved = processingPremium + currentAchCost;
  const lostRevenueSaved = lostRevenue * 0.5;
  const totalSavings = opsManagerSaved + schedulersSaved + hrReduced + payrollCoordSaved
    + billingSaved + ownerTimeSaved + swSaved + overtimeSaved + turnoverSaved
    + complianceSaved + processingNetSaved + lostRevenueSaved;

  // CoAIleague cost
  let baseAnnual = (t.monthlyPrice ?? 0) * 12;
  let seatOverageAnnual = 0;
  if (limits.seatsIncluded && totalSeats > limits.seatsIncluded && limits.seatOverageMonthly) {
    seatOverageAnnual = (totalSeats - limits.seatsIncluded) * limits.seatOverageMonthly * 12;
  }
  const coaAnnual = baseAnnual + seatOverageAnnual;
  const netSavings = totalSavings - coaAnnual;
  const roi = coaAnnual > 0 ? Math.round((netSavings / coaAnnual) * 100) : 0;
  const paybackDays = totalSavings > 0 ? Math.round((coaAnnual / totalSavings) * 365) : 999;

  const f = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="grid lg:grid-cols-2 gap-10">
      {/* Inputs */}
      <div className="space-y-6">
        {/* Group 1: Your Operation */}
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Your Operation</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Security officers", officers, setOfficers],
              ["Admin and management", adminStaff, setAdminStaff],
              ["Active sites", sites, setSites],
            ].map(([label, val, setter]) => (
              <label key={label as string} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label as string}</span>
                <input
                  type="number"
                  min={0}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                  value={val as number}
                  onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
                  data-testid={`roi-input-${(label as string).replace(/\s/g, "-")}`}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Recommended plan: <span className="font-semibold text-foreground capitalize">{recommended}</span>
            {" · "}Total seats: {totalSeats}
          </p>
        </div>

        {/* Group 2: Staff */}
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Current Staff Costs</p>
          <div className="space-y-3">
            {[
              { label: "Operations Manager", has: hasOpsManager, setHas: setHasOpsManager, salary: opsManagerSalary, setSalary: setOpsManagerSalary },
              { label: `Dedicated Schedulers (${schedulerCount})`, has: true, setHas: () => {}, salary: schedulerCount * schedulerSalary, setSalary: () => {} },
              { label: "HR Administrator", has: hasHr, setHas: setHasHr, salary: hrCost, setSalary: setHrCost },
              { label: "Payroll Coordinator", has: hasPayrollCoord, setHas: setHasPayrollCoord, salary: payrollCoordSalary, setSalary: setPayrollCoordSalary },
              { label: "Billing / Invoicing Staff", has: hasBilling, setHas: setHasBilling, salary: billingSalary, setSalary: setBillingSalary },
            ].map(({ label, has, setHas, salary, setSalary }) => (
              <div key={label} className="flex items-center gap-3">
                <input type="checkbox" className="w-4 h-4" checked={has} onChange={e => setHas(e.target.checked)} />
                <span className="text-xs text-muted-foreground flex-1">{label}</span>
                <input
                  type="number"
                  disabled={!has}
                  className="bg-background border border-border rounded-md px-2 py-1 text-xs w-24 disabled:opacity-40"
                  value={salary}
                  onChange={e => setSalary(Number(e.target.value))}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Your hrs/week on ops</span>
                <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={ownerHrsWeek} onChange={e => setOwnerHrsWeek(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Your hourly value ($)</span>
                <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={ownerHourlyValue} onChange={e => setOwnerHourlyValue(Number(e.target.value))} />
              </label>
            </div>
          </div>
        </div>

        {/* Group 3: Software */}
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Current Software</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Scheduling software/mo</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={schedulingSwMonthly} onChange={e => setSchedulingSwMonthly(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Payroll cost/mo</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={payrollMonthlyCost} onChange={e => setPayrollMonthlyCost(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Other software/mo</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={otherSwMonthly} onChange={e => setOtherSwMonthly(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Monthly overtime cost</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={monthlyOvertime} onChange={e => setMonthlyOvertime(Number(e.target.value))} />
            </label>
          </div>
        </div>

        {/* Group 4: Invoicing */}
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Your Invoicing</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Monthly invoicing volume</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={monthlyInvoicing} onChange={e => setMonthlyInvoicing(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Current card rate (%)</span>
              <input type="number" step="0.1" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={currentCardRate} onChange={e => setCurrentCardRate(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Current ACH fee ($)</span>
              <input type="number" step="0.05" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={currentAchFee} onChange={e => setCurrentAchFee(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">ACH transactions/mo</span>
              <input type="number" min={0} className="bg-background border border-border rounded-md px-3 py-2 text-sm" value={achTransactionsPerMonth} onChange={e => setAchTransactionsPerMonth(Number(e.target.value))} />
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {/* Current overhead */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Current Annual Overhead</p>
            <div className="space-y-1.5 text-xs">
              {[
                ["Staff costs", staffCost],
                ["Your time on operations", ownerTimeCost],
                ["Software and tools", swCost],
                ["Overtime waste", overtimeCost],
                ["Turnover costs", turnoverCost],
                ["Compliance fines", complianceFines],
                ["Processing premium", processingPremium + currentAchCost],
              ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label as string}</span>
                  <span className="text-foreground">{f(val as number)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 font-semibold text-sm">
                <span>Total</span>
                <span className="text-red-400">{f(totalCurrentOverhead)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Savings */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What CoAIleague Eliminates</p>
            <div className="space-y-1.5 text-xs">
              {[
                ["Operations Manager eliminated", opsManagerSaved],
                ["Schedulers eliminated", schedulersSaved],
                ["HR reduced 60%", hrReduced],
                ["Payroll Coordinator eliminated", payrollCoordSaved],
                ["Billing Staff eliminated", billingSaved],
                ["Your time recovered (70%)", ownerTimeSaved],
                ["Software eliminated", swSaved],
                ["Overtime reduced 30%", overtimeSaved],
                ["Turnover reduced 25%", turnoverSaved],
                ["Processing savings", processingNetSaved],
              ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label as string}</span>
                  <span className="text-green-400">+{f(val as number)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 font-semibold text-sm">
                <span>Total Savings</span>
                <span className="text-green-400">{f(totalSavings)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Investment */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Your CoAIleague Investment</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground capitalize">{recommended} plan (annual)</span>
                <span className="text-foreground">{f(baseAnnual)}</span>
              </div>
              {seatOverageAnnual > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seat overage ({totalSeats - (limits.seatsIncluded ?? 0)} × ${limits.seatOverageMonthly}/mo × 12)</span>
                  <span className="text-foreground">{f(seatOverageAnnual)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 font-semibold text-sm">
                <span>Total Annual Investment</span>
                <span className="text-foreground">{f(coaAnnual)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom line */}
        <div className="rounded-md bg-primary/10 border border-primary p-5 text-center">
          <p className="text-xs font-medium text-muted-foreground mb-1">You Save</p>
          <p className="text-3xl font-bold text-green-400">{f(netSavings)}</p>
          <p className="text-sm text-muted-foreground mb-3">per year with CoAIleague</p>
          <div className="grid grid-cols-2 gap-3 text-center mb-4">
            <div className="bg-background/60 rounded-md py-2">
              <p className="text-lg font-bold text-foreground">{roi}%</p>
              <p className="text-xs text-muted-foreground">ROI</p>
            </div>
            <div className="bg-background/60 rounded-md py-2">
              <p className="text-lg font-bold text-foreground">{Math.min(paybackDays, 365)} days</p>
              <p className="text-xs text-muted-foreground">Payback period</p>
            </div>
          </div>
          <Link href="/register">
            <Button className="w-full" data-testid="button-roi-cta">
              Start Free 14-Day Trial
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Payroll comparison (gold callout) ───────────────────────────────────────

function PayrollCalloutSection() {
  const payrollRows = [
    ["ADP", "$8–15"],
    ["Paychex", "$7–12"],
    ["Gusto", "$6–12"],
    ["QuickBooks", "$6–10"],
    ["CoAIleague", "$3.95–5.95"],
  ];
  const invoicingRows = [
    ["Square", "2.6% + $0.10"],
    ["QuickBooks", "2.9% + $0.25"],
    ["Stripe Standard", "2.9% + $0.30"],
    ["CoAIleague", "2.0–2.4% + $0.15–0.25"],
  ];
  return (
    <section className="border-t border-border py-16 bg-primary/5">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-3">
            The Hidden Cost Nobody Talks About Is Payroll.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Security companies run on thin margins. The $8–15 per employee per payroll run you pay ADP adds up fast. 50 officers, biweekly payroll: $800–1,500 per run, $19,200–36,000 per year. CoAIleague charges $3.95–5.95 per employee per run — direct deposit, tax filing, W-2s and 1099s all included. Still 33–50% below the cheapest competitor, and it runs itself.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Payroll Processing</h3>
            <p className="text-xs text-muted-foreground mb-3">Per employee per payroll run</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Provider</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Per Employee</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.map(([provider, cost]) => (
                  <tr key={provider} className="border-b border-border/40">
                    <td className={`py-2 ${provider === "CoAIleague" ? "font-semibold text-green-400" : "text-muted-foreground"}`}>{provider}</td>
                    <td className={`py-2 text-right ${provider === "CoAIleague" ? "font-semibold text-green-400" : "text-muted-foreground"}`}>{cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">Direct deposit, tax filing, W-2 and 1099 all included.</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Payment Collection</h3>
            <p className="text-xs text-muted-foreground mb-3">Card processing rate</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Provider</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Card Rate</th>
                </tr>
              </thead>
              <tbody>
                {invoicingRows.map(([provider, rate]) => (
                  <tr key={provider} className="border-b border-border/40">
                    <td className={`py-2 ${provider === "CoAIleague" ? "font-semibold text-green-400" : "text-muted-foreground"}`}>{provider}</td>
                    <td className={`py-2 text-right ${provider === "CoAIleague" ? "font-semibold text-green-400" : "text-muted-foreground"}`}>{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">ACH transfers from $0.30/transaction. Funds in 1–2 business days.</p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">Available on Professional, Business, Enterprise, and Strategic plans.</p>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const roiRef = useRef<HTMLDivElement>(null);

  const scrollToRoi = () => roiRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <SEO
        title="Pricing — CoAIleague"
        description="Simple, transparent pricing for AI-powered security workforce management. From $199/month for 10 seats. No credits. No hidden fees."
      />
      <UniversalHeader />
      <main className="min-h-screen bg-background">

        {/* Hero */}
        <section className="border-b border-border py-16 text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
              Stop Paying Six People to Do What Trinity Does Alone.
            </h1>
            <p className="text-lg text-muted-foreground mb-3 max-w-2xl mx-auto">
              Replace your operations manager, scheduler, compliance coordinator, billing staff, HR administrator, and your own evenings and weekends — all at once.
            </p>
            <p className="text-sm font-medium text-primary mb-6">
              The average CoAIleague client eliminates $8,000–$25,000 in monthly overhead in their first 60 days.
            </p>
            <AnnualToggle annual={annual} onChange={setAnnual} />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={scrollToRoi}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover-elevate"
                data-testid="button-hero-see-savings"
              >
                <Calculator className="w-4 h-4" />
                See What You Save
              </button>
              <Link href="/register">
                <Button variant="outline" data-testid="button-hero-trial">
                  Start Free 14-Day Trial
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /><span>No contract. No hidden fees.</span></div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /><span>14-day free trial</span></div>
              <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" /><span>Texas DPS compliant</span></div>
              <div className="flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5 text-primary" /><span>ROI in 47 days or less</span></div>
            </div>
          </div>
        </section>

        {/* Replacement Statement — six salaries vs. one AI */}
        <section className="border-b border-primary/20 bg-primary/5 py-14">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">Six Salaries or One AI. Your Call.</h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm">Here is what Texas security companies pay for the staff Trinity replaces.</p>
            </div>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-primary/20">
                    <th className="text-left py-3 text-muted-foreground font-medium">Role Trinity Replaces</th>
                    <th className="text-right py-3 text-muted-foreground font-medium">Annual Salary Range</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Operations Manager", "$75,000 – $95,000"],
                    ["Dedicated Scheduler", "$38,000 – $55,000"],
                    ["Compliance Coordinator", "$55,000 – $72,000"],
                    ["HR Administrator", "$52,000 – $68,000"],
                    ["Billing / Invoicing Staff", "$42,000 – $58,000"],
                    ["Your time on operations (estimated)", "$35,000 – $80,000"],
                  ].map(([role, range]) => (
                    <tr key={role} className="border-b border-primary/10">
                      <td className="py-2.5 text-muted-foreground">{role}</td>
                      <td className="py-2.5 text-right font-medium text-foreground">{range}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-primary/30">
                    <td className="py-3 font-semibold text-foreground">Total</td>
                    <td className="py-3 text-right font-bold text-foreground">$297,000 – $428,000/year</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="rounded-md bg-card border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">{PLATFORM_NAME} Business Plan</p>
                <p className="text-xl font-bold text-foreground">$26,988/year</p>
                <p className="text-xs text-muted-foreground">or $2,249/month</p>
              </div>
              <div className="rounded-md bg-primary/10 border border-primary/30 p-4 flex items-center justify-center">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">You save annually</p>
                  <p className="text-xl font-bold text-green-400">$270K – $401K</p>
                </div>
              </div>
              <div className="rounded-md bg-card border border-border p-4 flex items-center justify-center">
                <button onClick={scrollToRoi} className="text-sm font-semibold text-primary hover-elevate flex items-center gap-1">
                  Calculate your exact number
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">Salary data based on Texas market rates 2024. Time value calculated at owner/manager rates. Actual savings vary.</p>
          </div>
        </section>

        {/* Tier cards */}
        <section className="max-w-7xl mx-auto px-4 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {(["starter", "professional", "business", "enterprise"] as SubscriptionTier[]).map(tier => (
              <TierCard key={tier} tier={tier} annual={annual} />
            ))}
          </div>

          {/* Strategic */}
          <StrategicCard annual={annual} />

          <p className="text-center text-xs text-muted-foreground mt-6">
            All plans start with a free 14-day trial — no credit card required. Cancel anytime on monthly plans.
          </p>
        </section>

        {/* What Your Seat Price Covers */}
        <section className="border-t border-border py-14">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-foreground mb-2">What Does $25 Per Officer Actually Get You?</h2>
              <p className="text-muted-foreground">Every seat includes the full CoAIleague platform. Here is what that means in plain English.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: Brain,
                  title: "Trinity Available 24/7",
                  body: "Your operations manager at 2am, your compliance officer at midnight, your scheduler on Sunday — she is never unavailable, never on vacation, and never gives two weeks notice.",
                },
                {
                  icon: Shield,
                  title: "Legal Protection on Every Shift",
                  body: "Every incident report is legally defensible. Every post assignment is statute-verified. Every officer on an armed post has a verified license. One lawsuit defense costs more than a decade of CoAIleague.",
                },
                {
                  icon: DollarSign,
                  title: "Payroll at Half the Cost",
                  body: "We process your officer payroll internally at $3.95–5.95 per employee per run — still 33–50% below Gusto's minimum. ADP charges $8–15. Gusto charges $6–12. Direct deposit, quarterly 941 filing, W-2 and 1099 all included.",
                },
                {
                  icon: Star,
                  title: "A Scheduler Who Never Sleeps",
                  body: "Open shifts auto-fill from a ranked pool of qualified officers. Calloffs are handled without you touching a phone. Overtime is spotted before it happens. Your scheduler's job becomes reviewing — not doing.",
                },
                {
                  icon: Mail,
                  title: "Incident Reports That Hold Up in Court",
                  body: "HelpAI generates a GPS-stamped, time-verified, legally structured incident narrative in plain English. What used to take 45 minutes takes 90 seconds. What used to cost you in court now protects you.",
                },
                {
                  icon: Users,
                  title: "Officers Who Feel Like They Matter",
                  body: "HelpAI gives every officer a personal field assistant. Schedule lookups, post orders, incident filing, calloffs — by voice or text, instantly. Officers who feel supported show up. Turnover drops 25% in the first 90 days.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <Card key={title} data-testid={`card-seat-covers-${title.toLowerCase().replace(/\s/g, "-")}`}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why Per Seat */}
        <section className="border-t border-border py-14 bg-card/30">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-foreground mb-2">Why Per Seat? Because That Is the Honest Way.</h2>
              <p className="text-muted-foreground">Every seat gets the full platform. No feature tiers within tiers. No user role pricing.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              {[
                { icon: Users, title: "Every Person. One Seat.", body: "Owners, managers, supervisors, and officers each count as one seat. No role-based pricing. No per-feature add-ons. Everyone gets full access to the features in your plan." },
                { icon: Brain, title: "Trinity Is Not a Seat.", body: "Trinity herself is not a seat — she is the intelligence that powers every seat. Your plan price includes Trinity's full AI brain for every person in your organization." },
                { icon: DollarSign, title: "Seats Scale With You.", body: "Start with your included seats. Add officers as your business grows at your tier's per-seat rate. Your price scales exactly with your headcount — never with arbitrary limits." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Payroll callout */}
        <PayrollCalloutSection />

        {/* AI Interactions explained */}
        <section className="border-t border-border py-14">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Your Plan Includes Generous AI Interaction Allowances</h2>
              <p className="text-muted-foreground">Most clients use less than 30% of their monthly allowance. Here is exactly what counts and what does not.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 mb-6">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Counts as one interaction:</p>
                <ul className="space-y-2">
                  {["Trinity chat conversation", "Autonomous task Trinity executes", "Voice command processed", "Morning briefing generated", "Incident narrative or DAR report generated", "RFP generation", "Advanced analytics query"].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm"><Check />{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Never counts:</p>
                <ul className="space-y-2">
                  {["Schedule view or edit", "Clock in or clock out", "Basic HelpAI officer commands (schedule, post orders, clock in/out)", "Dashboard page loads", "Document storage and retrieval", "Payroll calculations", "Notification delivery"].map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-muted-foreground/40 shrink-0 mt-0.5">—</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-card/50 border border-border rounded-md p-5 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Hard caps protect platform performance for all users. </span>
              When a workspace reaches its hard cap, Trinity queues non-urgent autonomous work until the next billing period.
              Critical operations — panic alerts, incident reporting, compliance enforcement, and HelpAI officer assistance — <span className="text-green-400 font-medium">NEVER stop</span> regardless of interaction count.
            </div>
          </div>
        </section>

        {/* Trinity Brain callout */}
        <section className="border-t border-border py-14 bg-card/30">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-8">
              <Badge variant="secondary" className="mb-3">Included in Every Plan</Badge>
              <h2 className="text-2xl font-bold text-foreground mb-3">Trinity's 8-Layer Biological Brain — Not a Chatbot</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Every plan includes Trinity's complete cognitive architecture. What changes is seat capacity and included services — never Trinity's intelligence.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Eye, name: "Perception", desc: "Watches everything happening in real time — late clock-ins, compliance flags, open shifts, client activity." },
                { icon: BookOpen, name: "Memory", desc: "Remembers officer reliability, client preferences, site history, and your scheduling patterns over time." },
                { icon: Lightbulb, name: "Reasoning", desc: "Connects patterns to form conclusions — whether a callout is a one-time anomaly or a recurring problem." },
                { icon: Heart, name: "Emotional", desc: "Weighs urgency. A panic alert is treated completely differently than a missed shift confirmation." },
                { icon: Network, name: "Learning", desc: "Updates her models every time she observes an outcome. Gets smarter about your business every week." },
                { icon: Zap, name: "Decision", desc: "Selects the best action — auto-fills shifts, flags compliance breaches, queues collection reminders." },
                { icon: ListChecks, name: "Planning", desc: "Projects forward in time — forecasts callout risk, overtime exposure, and cash flow gaps before they happen." },
                { icon: Layers, name: "Action", desc: "Executes — sends notifications, generates reports, drafts invoices, talks to you in plain English." },
              ].map(({ icon: Icon, name, desc }) => (
                <Card key={name} data-testid={`card-brain-${name.toLowerCase()}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-6">
              <Link href="/features">
                <Button variant="outline" size="sm" data-testid="button-see-features">
                  See Full Trinity Architecture
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ROI Calculator */}
        <section className="border-t border-border py-16" ref={roiRef} id="roi-calculator">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-foreground mb-2">Calculate Your Exact Savings</h2>
              <p className="text-muted-foreground">Enter your current costs. See exactly what CoAIleague saves you.</p>
            </div>
            <RoiCalculator />
          </div>
        </section>

        {/* Feature comparison table */}
        <section className="border-t border-border py-16 bg-card/30">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Everything Side by Side</h2>
              <p className="text-muted-foreground text-sm">
                <CheckCircle2 className="inline w-3.5 h-3.5 text-green-400 mr-1" />Included
                <span className="mx-3 text-muted-foreground/40">—</span>Not included
                <span className="ml-3 text-primary font-medium">$</span> Available at additional cost
              </p>
            </div>
            <FeatureTable />
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border py-16">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-foreground text-center mb-8">Frequently Asked Questions</h2>
            <div>
              {FAQS.map(({ q, a }) => <FaqItem key={q} q={q} a={a} />)}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border py-16 text-center bg-card/50">
          <div className="max-w-2xl mx-auto px-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">The Bottom Line</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              The Math is Simple.
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Six salaries or one AI. You are already paying for the people Trinity replaces. The question is whether you want to keep paying them — or redirect that budget to growing your contract portfolio instead.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
              <Link href="/roi-calculator">
                <Button size="lg" variant="outline" data-testid="button-final-cta-calculator">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculate What You Would Save
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" data-testid="button-final-cta-trial">
                  Start Free Trial
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mb-8">14-day trial. No credit card. Cancel monthly plans anytime.</p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /><span>Bank-grade security</span></div>
              <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-primary" /><span>Built for US security companies</span></div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /><span>Texas DPS compliance ready</span></div>
              <div className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-primary" /><span>No contracts on monthly plans</span></div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
