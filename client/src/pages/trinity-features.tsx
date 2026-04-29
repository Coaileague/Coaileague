import { Link } from 'wouter';
import { SEO } from '@/components/seo';
import { UniversalHeader } from '@/components/universal-header';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Shield,
  Users,
  ArrowRight,
  Calendar,
  DollarSign,
  FileText,
  BarChart3,
  MapPin,
  Briefcase,
  Building2,
  BookOpen,
  Lightbulb,
  Heart,
  Network,
  ListChecks,
  Layers,
  Mic,
  Clock,
  Calculator,
  CheckCircle2,
  AlarmClock,
  Wallet,
  Leaf,
  MessageCircle,
  Lock,
  Activity,
  Cpu,
  GitBranch,
} from 'lucide-react';;
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import { PRICING_TIERS } from '@/config/pricing';

// ─── Who Is Trinity? — Full Spotlight ────────────────────────────────────────

const BRAIN_SYSTEMS = [
  {
    icon: Activity,
    name: "Memory System",
    plain: "Trinity remembers every officer — their history, certifications, performance patterns, and past issues. She uses that memory to make smarter decisions today.",
  },
  {
    icon: Eye,
    name: "Perception Engine",
    plain: "She scans your entire operation constantly, the way a great manager would scan a room. She notices things before they become problems: a coverage gap, an overtime risk, a license expiring.",
  },
  {
    icon: Activity,
    name: "Pattern Recognition",
    plain: "Trinity sees patterns humans miss. She knows which officer is likely to call off before they do. She knows which site consistently goes short on Fridays. She acts before you have to.",
  },
  {
    icon: Lightbulb,
    name: "Planning Mind",
    plain: "She does not just react. She thinks days ahead — running simulations of possible conflicts, payroll risks, and compliance gaps, then resolving them in advance.",
  },
  {
    icon: Heart,
    name: "Emotional Intelligence",
    plain: "Trinity tracks the human side of your team. She notices burnout signs, monitors morale indicators, and flags officers who may be struggling — so people want to keep working for you.",
  },
  {
    icon: Network,
    name: "Learning Engine",
    plain: "Every action Trinity takes teaches her something. She learns your preferences, your company's patterns, and what works for your specific team — getting smarter every single day.",
  },
  {
    icon: Activity,
    name: "Autonomous Execution",
    plain: "She does not just identify problems and hand them to you. She resolves them — filling shifts, sending alerts, processing payroll, generating reports — without being asked.",
  },
  {
    icon: GitBranch,
    name: "Reasoning Engine",
    plain: "Before Trinity acts, she reasons through the options. She weighs fairness, safety, legal compliance, and your budget — then makes a decision she can explain to you in plain English.",
  },
  {
    icon: Shield,
    name: "Compliance Guard",
    plain: "A built-in compliance layer monitors schedules, payroll, and incident reports against your configured policies and state requirements. Flags potential issues for manager review before they escalate.",
  },
];

const CONSCIENCE_ITEMS = [
  "She is configured to flag potential license conflicts before scheduling — managers make the final call.",
  "She surfaces decisions that affect someone's job or pay for your review before acting.",
  "She escalates officer safety concerns immediately — always contact 911 for emergencies.",
  "She routes major financial and personnel actions to your approval queue, never bypassing them.",
  "She logs all actions and flags anomalies in the audit trail — your team reviews outcomes.",
  "She applies your configured data access controls to protect officer personal information.",
];

const TRINITY_CAPABILITIES = [
  {
    icon: Calendar,
    name: "Scheduling (Her Core Job)",
    description: "Runs your entire schedule around the clock. Fills gaps, handles calloffs, prevents overtime, and keeps every site covered every night — so your calls are reserved for what actually needs you.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: MessageCircle,
    name: "Trinity — Officer Field Assistant",
    description: "The face your officers see. Lives in every shift room. Answers questions, takes calloffs, files incident reports, and looks up schedules — by text or voice, instantly.",
    color: "bg-teal-500/10 text-teal-400",
  },
  {
    icon: DollarSign,
    name: "Payroll — Automated, Fully",
    description: "Automates payroll data collection, hours calculation, and report generation — direct deposit, tax withholding, W-2s and 1099s. All runs require manager review and approval before funds are processed.",
    color: "bg-green-500/10 text-green-400",
  },
  {
    icon: FileText,
    name: "Incident Reports — Structured & Time-Stamped",
    description: "Analyzes incidents and drafts structured narratives. GPS-stamped and time-verified — reviewed and finalized by your supervisors before submission.",
    color: "bg-blue-500/10 text-blue-400",
  },
  {
    icon: Shield,
    name: "Compliance — Real-Time Legal Guard",
    description: "Monitors every license and certification. Blocks unqualified assignments before they happen. Cites the exact statute for every decision. All 50 states covered.",
    color: "bg-yellow-500/10 text-yellow-400",
  },
  {
    icon: Briefcase,
    name: "Business Advisor — Strategic Partner",
    description: "Analyzes your margins, flags unprofitable contracts, identifies your best and worst clients, and tells you where your money is going — and what to do about it.",
    color: "bg-violet-500/10 text-violet-400",
  },
  {
    icon: MapPin,
    name: "Officer Safety — Always Monitoring",
    description: "Tracks GPS and check-ins in real time. Responds to panic alerts in seconds. Notifies all supervisors simultaneously and documents everything — automatically. Officers should contact 911 directly for any emergency.",
    color: "bg-red-500/10 text-red-400",
  },
  {
    icon: TrinityLogo,
    name: "Client Relations — Proactive",
    description: "Manages client service requests and contract health. Alerts you when a relationship is at risk and recommends exactly what to do to keep the account.",
    color: "bg-orange-500/10 text-orange-400",
  },
];

function WhoIsTrinitySection() {
  return (
    <section className="py-20 border-b border-border bg-gradient-to-b from-violet-950/10 to-background">
      <div className="max-w-5xl mx-auto px-4">

        <div className="text-center mb-16">
          <Badge className="mb-4 bg-violet-500/10 text-violet-400 border-violet-500/20">
            <TrinityLogo size={12} className="mr-1.5" />
            Trinity — The Heart of CoAIleague
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-5 leading-tight">
            She Is Not Software.
            <span className="block text-violet-400">She Is a Mind Built for Your Business.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Trinity is CoAIleague's core product and the reason everything works. She is an artificial intelligence with a simulated human brain — one that thinks ahead, learns from experience, recognizes patterns before they become problems, and refuses to do anything that could hurt your company or your people. She does not just follow instructions. She understands your business and works tirelessly to run it — under your leadership.
          </p>
        </div>

        <div className="mb-16">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">Her Mind</p>
            <h3 className="text-2xl font-bold text-foreground">Trinity Has a Brain. An Actual One.</h3>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm">
              Engineers built Trinity with an architecture that mirrors how the human brain works — because it produces better decisions than traditional software. Here is what is running inside her.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {BRAIN_SYSTEMS.map(({ icon: Icon, name, plain }) => (
              <div key={name} className="bg-card border border-border rounded-md p-4 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-violet-400" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{plain}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-8 mb-16">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <Heart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Her Conscience</p>
              <h3 className="text-xl font-bold text-foreground mb-3">She Has Values She Will Not Compromise On.</h3>
              <p className="text-muted-foreground leading-relaxed mb-5 text-sm">
                Trinity does not just do whatever you ask. She was built with a conscience — a set of principles she holds regardless of any instruction. These are not bugs or limitations. They are what make her trustworthy. She works for you. But she also flags risks, surfaces blind spots, and helps your leadership make better decisions for your people.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {CONSCIENCE_ITEMS.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">Her Capabilities</p>
            <h3 className="text-2xl font-bold text-foreground">One Mind. Every Job in Your Company.</h3>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm">
              Trinity works in different modes depending on what is needed. These are not separate bots — they are all her, the same mind wearing different hats. HelpAI, scheduling, payroll, compliance, reports, safety — Trinity handles all of it.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {TRINITY_CAPABILITIES.map(({ icon: Icon, name, description, color }) => (
              <div key={name} className="flex gap-4 items-start bg-card border border-border rounded-md p-4">
                <div className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

const STATS = [
  { icon: DollarSign, value: "$8K–$25K", label: "Monthly overhead eliminated in first 60 days" },
  { icon: AlarmClock, value: "47 days", label: "Average payback period" },
  { icon: Shield, value: "All 50", label: "States covered for compliance" },
  { icon: Clock, value: "40+", label: "Hours automated per week per client" },
];

function StatsBar() {
  return (
    <div className="bg-primary py-6">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex flex-col items-center text-center gap-1">
            <Icon className="w-5 h-5 text-primary-foreground/70 mb-1" />
            <p className="text-xl font-bold text-primary-foreground">{value}</p>
            <p className="text-xs text-primary-foreground/70">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Feature bullet list ──────────────────────────────────────────────────────

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 mt-4">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ─── Feature section (alternating layouts) ────────────────────────────────────

interface FeatureSectionProps {
  eyebrow: string;
  headline: string;
  body: string;
  items: string[];
  visual: React.ReactNode;
  reverse?: boolean;
  gold?: boolean;
  purple?: boolean;
  disclaimer?: string;
}

function FeatureSection({ eyebrow, headline, body, items, visual, reverse, gold, purple, disclaimer }: FeatureSectionProps) {
  const bg = gold ? "bg-primary/5 border-t border-b border-primary/20" : "border-t border-border";
  const eyebrowColor = purple ? "text-violet-400" : gold ? "text-foreground/60" : "text-primary";

  return (
    <section className={`${bg} py-16`}>
      <div className="max-w-5xl mx-auto px-4">
        <div className={`grid md:grid-cols-2 gap-12 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${eyebrowColor}`}>{eyebrow}</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4 leading-tight">{headline}</h2>
            <p className="text-muted-foreground leading-relaxed">{body}</p>
            {disclaimer && (
              <p className="text-xs italic text-muted-foreground/70 mt-3 leading-relaxed">
                {disclaimer}
              </p>
            )}
            <FeatureList items={items} />
          </div>
          <div className="flex items-center justify-center">
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Illustrative demo components (features page — intentionally static) ──────

function DashboardMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Trinity Morning Brief</span>
        <Badge variant="secondary" className="text-xs">6:00 AM</Badge>
      </div>
      <div className="space-y-2">
        {[
          { icon: CheckCircle2, color: "text-green-400", label: "23/23 sites covered" },
          { icon: Shield, color: "text-yellow-400", label: "2 license expirations in 7 days" },
          { icon: Users, color: "text-primary", label: "1 predicted calloff — backup ready" },
          { icon: DollarSign, color: "text-green-400", label: "Payroll runs in 3 days — on track" },
          { icon: BarChart3, color: "text-primary", label: "Site A contract at 94% health" },
        ].map(({ icon: Icon, color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
            {label}
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-border text-xs text-muted-foreground italic">
        "Good morning. Your operation is stable. I resolved 3 overnight issues without waking you."
      </div>
    </div>
  );
}

function OfficerProfileMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Marcus T.</p>
          <p className="text-xs text-muted-foreground">2 years, 4 months</p>
        </div>
        <Badge className="ml-auto bg-green-500/10 text-green-400 border-green-500/20">Top Performer</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Reliability", value: "98%" },
          { label: "Report Quality", value: "A+" },
          { label: "Peer Score", value: "4.9" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/30 rounded-md py-2">
            <p className="text-sm font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="text-xs text-primary font-medium">
        Trinity recommends: $0.75/hr raise — 18 months of excellence
      </div>
    </div>
  );
}

function PayrollMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Payroll Run — March</span>
        <Badge variant="secondary">Ready to Process</Badge>
      </div>
      <div className="space-y-1.5 text-xs">
        {[
          ["Employees processed", "47"],
          ["Total gross wages", "$187,250"],
          ["Federal income tax", "$28,900 withheld"],
          ["FICA (OASDI + Medicare)", "$14,325 withheld"],
          ["State income tax (TX)", "No state income tax"],
          ["Direct deposits queued", "43 of 47"],
          ["Paper checks", "4"],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground">{value}</span>
          </div>
        ))}
      </div>
      <Button size="sm" className="w-full" variant="outline">Process Payroll</Button>
    </div>
  );
}

function ComplianceMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Compliance — Texas DPS</span>
        <Badge className="bg-green-500/10 text-green-400 border-green-500/20">Compliant</Badge>
      </div>
      <div className="space-y-2">
        {[
          { label: "Officer K. Rodriguez", status: "Expires in 8 days", color: "text-yellow-400" },
          { label: "Post: Armed Commercial Site", status: "License guard verified", color: "text-green-400" },
          { label: "Statute: Tex. Occ. Code §1702.323", status: "Shift blocked — unlicensed guard", color: "text-red-400" },
        ].map(({ label, status, color }) => (
          <div key={label} className="border-b border-border/40 pb-2 text-xs last:border-b-0 last:pb-0">
            <p className="text-muted-foreground">{label}</p>
            <p className={`font-medium ${color}`}>{status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold text-red-400">PANIC ALERT — Downtown Site 3</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Officer: J. Williams</p>
        <p>GPS: 29.7604° N, 95.3698° W</p>
        <p>Time: 2:17 AM</p>
        <p className="text-yellow-400 font-medium">5 supervisors notified in 0.8 seconds</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 text-xs">Dispatch</Button>
        <Button size="sm" className="flex-1 text-xs">Alert Supervisor</Button>
      </div>
    </div>
  );
}

function VoiceMock() {
  return (
    <div className="w-full max-w-sm rounded-md bg-card border border-border p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">HelpAI Voice — Officer Mode</span>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-end">
          <div className="bg-primary/20 text-primary-foreground rounded-md px-3 py-1.5 max-w-[80%]">
            "Clock me in at Site B"
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-muted rounded-md px-3 py-1.5 max-w-[80%] text-muted-foreground">
            "Clocked in at Site B — 10:02 PM. Your post orders are: patrol south perimeter every 30 minutes. Stay safe out there."
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-primary/20 text-primary-foreground rounded-md px-3 py-1.5 max-w-[80%]">
            "File an incident report"
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-muted rounded-md px-3 py-1.5 max-w-[80%] text-muted-foreground">
            "Ready. Describe what happened — I'll write the full legal narrative."
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trinity Intelligence cards ───────────────────────────────────────────────

const AI_CARDS = [
  {
    icon: BookOpen,
    title: "Remembers Everything",
    body: "Trinity knows every officer, every client, every incident, and every decision in your organization's history. She never forgets. She never starts fresh.",
  },
  {
    icon: BarChart3,
    title: "Predicts Problems",
    body: "Calloffs before they happen. Overtime before payroll closes. Client churn before the complaint. Coverage gaps before the shift starts.",
  },
  {
    icon: Activity,
    title: "Acts Without Being Asked",
    body: "Trinity self-assigns tasks she knows need to be done. She resolves routine tasks automatically — and escalates anything that needs human judgment. She runs while you sleep.",
  },
  {
    icon: Activity,
    title: "Gets Smarter Every Night",
    body: "13-phase overnight processing cycle. Hebbian learning from every decision outcome. Counterfactual simulation from every mistake. She improves continuously.",
  },
  {
    icon: Shield,
    title: "Cites the Law",
    body: "When Trinity makes a compliance recommendation, she cites the exact statute. Not a general warning. The specific law, the specific section, the specific penalty.",
  },
  {
    icon: Heart,
    title: "Treats People Like People",
    body: "Trinity celebrates birthdays, flags burnout, remembers anniversaries, and sends personal messages. Your officers feel known by their AI — not managed by software.",
  },
];

// ─── Elite Feature Pricing Showcase ──────────────────────────────────────────

const ELITE_FEATURES_SHOWCASE: Array<{
  name: string;
  human: string;
  trinity: string;
  ratio: string;
  blurb: string;
}> = [
  {
    name: "RFP & Proposal Generation",
    human: "$3,500–$7,500 / proposal (firm)",
    trinity: "$149–$499 / proposal",
    ratio: "4.3–6.6% of firm cost",
    blurb: "Full PDF-ready proposal: research, scope, staffing, compliance, pricing, and why-choose-us — tailored to the bid.",
  },
  {
    name: "Contract Analysis",
    human: "$1,750–$6,000 / review (attorney)",
    trinity: "$89–$189 / contract",
    ratio: "5–5.4% of attorney cost",
    blurb: "Line-by-line liability flagging, missing-protection callouts, and auto-redlines against PSB requirements.",
  },
  {
    name: "Compliance Audit Report",
    human: "$2,000–$10,000 / audit (consultant)",
    trinity: "$129–$199 / report",
    ratio: "1.5–10% of consultant cost",
    blurb: "Full audit-readiness report with compliance score, findings, and auditor-ready exhibit index.",
  },
  {
    name: "Regulatory Filing Packet",
    human: "$5,000–$10,000 / packet",
    trinity: "$149–$349 / packet",
    ratio: "1.5–7% of consultant cost",
    blurb: "Complete evidence package for PSB/TCOLE audits. One violation avoided pays for this 100× over.",
  },
  {
    name: "Incident Investigation Report",
    human: "$500–$2,500 / report (attorney)",
    trinity: "$29–$39 / report",
    ratio: "1.2–7.8% of attorney cost",
    blurb: "Court-ready narrative with timeline, root cause, and officer conduct assessment for insurance and litigation.",
  },
  {
    name: "Strategic Multi-Site Scheduling",
    human: "$8–$15 / shift (dispatcher labor)",
    trinity: "$0.15–$0.25 / shift over quota",
    ratio: "~2% of dispatcher cost",
    blurb: "Profit-optimized scheduling across every site simultaneously — included in Enterprise.",
  },
  {
    name: "Employment Verification Letter",
    human: "$50–$200 / letter (attorney)",
    trinity: "$3–$5 / letter",
    ratio: "1.5–10% of attorney cost",
    blurb: "FCRA-bounded disclosure letter with manager approve/deny routing. See TRINITY.md §P.",
  },
  {
    name: "Officer Performance Review",
    human: "$150–$400 / review (HR writer)",
    trinity: "$9–$19 / review",
    ratio: "3.5–13% of HR writer cost",
    blurb: "Structured review narrative from 12 months of shift, attendance, incident, and compliance data.",
  },
  {
    name: "Document Deep Analysis",
    human: "$50–$150 / document (manual)",
    trinity: "$5–$9 / document",
    ratio: "4.7–18% of manual review",
    blurb: "Extract key data, flag issues, and produce an action-item summary from any uploaded document.",
  },
  {
    name: "Client Profitability Analysis",
    human: "$500–$2,000 / analysis (CFO)",
    trinity: "$39–$49 / analysis",
    ratio: "2.5–10% of CFO cost",
    blurb: "True per-client P&L with repricing, scope, or exit recommendations.",
  },
];

function EliteFeaturesShowcase() {
  return (
    <section className="border-t border-border py-14 bg-muted/30" data-testid="section-elite-features-showcase">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">Elite Features — April 2026</Badge>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            Priced at 5–8% of What a Human Professional Charges
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every elite price is anchored to two numbers: what a human professional charges for the same work,
            and what winning that work is worth. Trinity delivers the output at a deep discount — so it's obvious
            value, not a hobby fee.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ELITE_FEATURES_SHOWCASE.map((f) => (
            <Card key={f.name} className="bg-card border-border" data-testid={`elite-card-${f.name.replace(/\s+/g, '-').toLowerCase()}`}>
              <CardContent className="p-5 space-y-3">
                <h3 className="text-base font-semibold text-foreground">{f.name}</h3>
                <p className="text-xs text-muted-foreground">{f.blurb}</p>
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Human cost</span>
                    <span className="font-mono text-foreground/70">{f.human}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Trinity</span>
                    <span className="font-mono font-semibold text-primary">{f.trinity}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                    <span>Ratio</span>
                    <span>{f.ratio}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-5 rounded-md border border-primary/30 bg-primary/5 text-center">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Enterprise tier:</span> every elite feature unlimited — included.
            A 50-officer company bidding 12 RFPs/year saves <span className="font-mono text-primary">$57,010/year</span> on RFPs alone.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing teaser ───────────────────────────────────────────────────────────

function PricingTeaser() {
  const TEASER_TIERS = [
    { name: "Starter", price: "$299/month", seats: "10 seats" },
    { name: "Professional", price: "$999/month", seats: "30 seats" },
    { name: "Business", price: "$2,999/month", seats: "75 seats" },
    { name: "Enterprise", price: "$7,999/month", seats: "200 seats" },
    { name: "Strategic", price: "Contact Us", seats: "300+ officers" },
  ];

  return (
    <section className="border-t border-primary/20 bg-primary/5 py-14">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Simple Per-Seat Pricing. Everything Included.</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          From 10 officers to 10,000 — your seat price includes Trinity's full AI brain and every
          feature in your plan. No add-ons. No credits. No surprises.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
          {TEASER_TIERS.map(({ name, price, seats }) => (
            <div key={name} className="bg-card border border-border rounded-md p-3 text-center">
              <p className="text-sm font-semibold text-foreground">{name}</p>
              <p className="text-xs text-primary font-medium mt-1">{price}</p>
              <p className="text-xs text-muted-foreground">{seats}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/pricing">
            <Button data-testid="button-teaser-see-pricing">
              See Full Pricing
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="outline" data-testid="button-teaser-trial">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const Icon = ({ name, className }: any) => <span className={className}>●</span>;

export default function TrinityFeatures() {
  return (
    <>
      <SEO
        title="Features — CoAIleague"
        description="Trinity AI runs your security company's scheduling, payroll, compliance, invoicing, and field safety — autonomously. Built for Texas security companies."
      />
      <UniversalHeader />
      <main className="min-h-screen bg-background">

        {/* Hero */}
        <section className="border-b border-border py-20 text-center">
          <div className="max-w-3xl mx-auto px-4">
            <Badge variant="secondary" className="mb-4">AI-Powered Security Operations</Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight">
              Trinity Doesn't Just Assist Your Operation.
              <span className="block text-primary">She Powers It.</span>
            </h1>
            <p className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider mb-5">
              Under your direction and the supervision of your licensed management.
            </p>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Trinity is the first AI system purpose-built for security workforce operations. Not a chatbot. Not a scheduling tool with AI bolted on. A cognitive operating system that manages your schedules, payroll, compliance, invoicing, officer safety, and client relationships — autonomously.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/pricing#roi-calculator">
                <Button size="lg" variant="outline" data-testid="button-hero-calculator">
                  <Calculator className="mr-2 w-4 h-4" />
                  Calculate Your Savings
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" data-testid="button-hero-trial">
                  Start Free Trial
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Platform responsibility callout — renders above the first feature section
            to make the scope of Trinity's autonomy unambiguous for prospects and regulators. */}
        <section className="border-b border-border bg-gradient-to-b from-primary/10 via-primary/5 to-background py-6">
          <div className="max-w-4xl mx-auto px-4">
            <div
              className="rounded-lg border border-primary/30 bg-card/60 backdrop-blur-sm px-5 py-4 flex items-start gap-3 shadow-sm"
              data-testid="callout-platform-responsibility"
            >
              <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Platform responsibility.</span>{" "}
                Trinity automates your administrative workload and surfaces operational intelligence
                — all decisions affecting personnel, safety, and legal compliance remain the
                responsibility of licensed management.
              </p>
            </div>
          </div>
        </section>

        {/* Who is Trinity? — Full Spotlight */}
        <WhoIsTrinitySection />

        {/* Stats bar */}
        <StatsBar />

        {/* Section 1 — Autonomous Operations */}
        <FeatureSection
          eyebrow="Autonomous Operations"
          headline={"Handles the Workload.\nWhile You Sleep."}
          body="Trinity manages your business the way you would if you never needed to sleep. She fills coverage gaps before shifts start, predicts calloffs before they happen, prevents overtime before it hits your payroll, and keeps every site covered every night — without a single phone call to you."
          items={[
            "AI-powered scheduling and coverage management",
            "Calloff prediction and automatic backfill",
            "Overtime prevention and labor optimization",
            "Autonomous task execution 24 hours a day",
            "Daily morning briefings delivered to your phone",
            "Problems solved before you know they exist",
          ]}
          visual={<DashboardMock />}
        />

        {/* Section 2 — People Intelligence */}
        <FeatureSection
          eyebrow="People Intelligence"
          headline={"Knows Every Officer.\nBuilds Every Career."}
          body="Trinity tracks every officer's performance, attendance, report quality, and career trajectory. She celebrates birthdays, flags burnout before it becomes a resignation, suggests raises when they are earned, and identifies discipline issues with evidence — not gut feelings. Your team feels known. Your turnover drops."
          items={[
            "Officer performance scoring and tracking",
            "Automatic milestone recognition",
            "Data-driven raise and promotion recommendations",
            "Disciplinary pattern detection with full analysis",
            "Career development and advancement tracking",
            "Trinity — one AI assistant for every officer, available 24/7 directly in their shift room",
          ]}
          visual={<OfficerProfileMock />}
          reverse
        />

        {/* Section 3 — Payroll and Invoicing (gold section) */}
        <section className="border-t border-primary/20 bg-primary/5 py-16">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold text-foreground/60 uppercase tracking-widest mb-2">Payroll and Invoicing</p>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                Handle Your Finances.
                <span className="block">At a Fraction of the Cost.</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                CoAIleague processes payroll and client invoicing internally — the same direct deposit,
                tax filing, and year-end forms you expect, at $3.95–5.95 per employee per run.
                ADP charges $8–15. Gusto charges $6–12. No subscriptions. No markups. Just results.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Internal Payroll Processing</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    "Internal payroll processing — W-4 and W-9 collection",
                    "Direct deposit included — all 4 pay frequencies",
                    "Quarterly 940/941 tax calculations and filings",
                    "Year-end W-2 and 1099-NEC generation",
                    "Federal and state income tax withholding",
                    "FICA calculations (OASDI and Medicare)",
                    "FUTA/SUTA employer contributions",
                    "Automated compliance withholding per jurisdiction",
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Client Invoicing and Payment Collection</p>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                  {[
                    "Client invoice generation and automated delivery",
                    "Automated payment collection — ACH and card",
                    "ACH bank transfers at below-market rates",
                    "Card processing at 2.0–2.4% + $0.15–0.25",
                    "Real-time P&L per site and contract",
                    "QuickBooks sync if you prefer to keep it",
                    "Auto-reconciliation with your invoices",
                    "Funds in your account in 1–2 business days",
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 p-3 rounded-md bg-card border border-border text-xs text-muted-foreground">
                  Payments processed through bank-grade secure infrastructure. Provider details not disclosed.
                </div>
              </div>
            </div>
            <div className="mt-8 text-center">
              <Link href="/pricing">
                <Button variant="outline" data-testid="button-payroll-see-pricing">
                  See Payroll Fee Comparison
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Section 4 — Legal Compliance */}
        <FeatureSection
          eyebrow="Legal Compliance"
          headline={"Protected in Every State.\nCited to the Statute."}
          body="Trinity knows security licensing law in every state you operate in. When she flags a compliance issue, she cites the exact statute. She blocks assignments that would create violations before they happen. She generates audit-ready compliance reports automatically. One DPS violation can cost more than a year of CoAIleague. Trinity is built to keep you ahead of violations — flagging risks before they happen, cited to the statute."
          disclaimer="Compliance alerts are informational and do not constitute legal advice."
          items={[
            "Texas DPS Chapter 1702 compliance built in",
            "All 50 states licensing requirements monitored",
            "License expiration alerts — 90, 60, 30, 7 days",
            "Armed post assignment guard at API level",
            "Statute-cited compliance recommendations",
            "Audit-ready reports on demand",
            "State regulatory auditor portal",
            "Compliance dashboard always current",
          ]}
          visual={<ComplianceMock />}
        />

        {/* Section 5 — Field Safety */}
        <FeatureSection
          eyebrow="Field Safety"
          headline={"Your Officers Are Never\nAlone Out There."}
          body="Trinity is the operations center your officers never had. Panic alerts reach every supervisor simultaneously. Lone worker check-ins are monitored automatically. Dispatch status is tracked in real time. GPS-stamped proof of service protects you legally on every shift. Trinity is not an emergency response service — officers should contact 911 directly for any life-threatening emergency."
          items={[
            "One-touch panic alert — all supervisors notified",
            "Lone worker automated check-in monitoring",
            "Real-time dispatch tracking and acknowledgment",
            "BOLO broadcast to all on-shift officers",
            "Visitor log with threat cross-reference",
            "GPS-stamped proof of service every shift",
            "Weapon and asset tracking per shift",
            "Incident narrative generation for legal use",
          ]}
          visual={<SafetyMock />}
          reverse
        />

        {/* Section 6 — Trinity AI Intelligence */}
        <section className="border-t border-border py-16 bg-card/30">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">Trinity AI Intelligence</p>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                An AI That Thinks, Learns, and Gets Better.
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Trinity is not a chatbot. She is a cognitive system built on three AI models — each
                checking the others' work. She has persistent memory that spans your entire company
                history. She runs a 13-phase overnight processing cycle to learn from the day. She
                gets meaningfully smarter at running your specific company every single month.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {AI_CARDS.map(({ icon: Icon, title, body }) => (
                <Card key={title} data-testid={`card-ai-${title.toLowerCase().replace(/\s/g, "-")}`}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-md bg-violet-500/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-violet-400" />
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

        {/* Section 7 — Voice */}
        <FeatureSection
          eyebrow="Voice Powered"
          headline={"Officers Don't Type\nReports at 2am."}
          body="Trinity speaks and listens. Officers can clock in, file incidents, check schedules, and get post orders by voice — right in their shift room on their phone. Trinity responds by voice. Your workforce has a real operational assistant in their pocket, not another app to learn."
          items={[
            "Voice clock in and clock out",
            "Voice incident report filing",
            "Voice schedule and post order lookup",
            "Voice calloff processing",
            "Trinity voice briefings daily",
            "Works on all devices including iPhone",
            "Available in ChatDock rooms and DMs",
            "No wake word required — push to talk",
          ]}
          visual={<VoiceMock />}
          reverse
        />

        {/* Elite feature pricing showcase */}
        <EliteFeaturesShowcase />

        {/* Pricing teaser */}
        <PricingTeaser />
      </main>
      <Footer />
    </>
  );
}
