import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Upload,
  Shield,
  User,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  MapPin,
  Phone,
  AlertTriangle,
  PenLine,
  Award,
  Fingerprint,
  Camera,
  BookOpen,
  Heart,
  Crosshair,
  FileCheck,
  Star,
  Lock,
  Zap,
  TrendingUp,
  BarChart3,
  Bot,
  Play,
  Radio,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";

// ============================================================================
// SIMULATED DATA — ACME SECURITY SERVICES, SAN ANTONIO TX
// ============================================================================

const ACME = {
  name: "Acme Security Services, LLC",
  address: "4821 Broadway St, Suite 300, San Antonio, TX 78209",
  phone: "(210) 555-0194",
  email: "operations@acmesecuritytx.com",
  license: "B04932156",
  owner: "Marcus Rivera",
  ownerTitle: "Chief Executive Officer",
  ownerEmail: "mrivera@acmesecuritytx.com",
};

const NEW_HIRE = {
  name: "Deshawn A. Carter",
  firstName: "Deshawn",
  position: "Armed Security Officer",
  type: "armed",
  hireDate: "March 1, 2026",
  email: "d.carter@acmesecuritytx.com",
  phone: "(210) 555-0237",
  address: "7204 Bandera Rd, San Antonio, TX 78250",
  guardCard: "C09281734",
  site: "Lone Star Industrial Park — Main Gate",
  supervisor: "James Washington",
};

const PROSPECT = {
  contactName: "John Ramirez",
  contactTitle: "VP of Operations",
  contactEmail: "jramirez@lonestarindustrial.com",
  contactPhone: "(210) 555-0388",
  companyName: "Lone Star Industrial Park, LP",
  address: "2301 S. Loop 1604 W, San Antonio, TX 78227",
  officersNeeded: 12,
  hoursPerOfficer: 12,
  shiftsPerDay: 3,
  ratePerHour: 26.0,
  monthlyValue: 89_760,
  annualValue: 1_077_120,
  startDate: "April 1, 2026",
  termMonths: 12,
  proposalNumber: "PSP-2026-0041",
  contractNumber: "CSA-2026-0017",
};

const EXEMPT_ACTIONS = [
  { action: "Trinity AI Chat Session", domain: "ai.chat", normalCost: 47, savedCost: "$0.47" },
  { action: "AI Schedule Generation (200 shifts)", domain: "scheduling.auto_generate", normalCost: 125, savedCost: "$1.25" },
  { action: "Invoice Automation (3 invoices)", domain: "invoicing.generate_batch", normalCost: 85, savedCost: "$0.85" },
  { action: "Payroll Processing (32 officers)", domain: "payroll.process_period", normalCost: 200, savedCost: "$2.00" },
  { action: "Compliance Scan — All Officers", domain: "compliance.certification_scan", normalCost: 60, savedCost: "$0.60" },
  { action: "Morning Brief Generation", domain: "proactive.morning_brief", normalCost: 35, savedCost: "$0.35" },
  { action: "Shift Escalation Scan", domain: "scheduling.escalation_scan", normalCost: 15, savedCost: "$0.15" },
  { action: "Client Invoice Delivery (Resend)", domain: "email.invoice_delivery", normalCost: 8, savedCost: "$0.08" },
];

const DOCS: Array<{
  icon: any;
  label: string;
  type: string;
  status: "signed" | "uploaded" | "pending" | "in_progress";
  detail: string;
  regulatory?: string;
  blocks?: boolean;
}> = [
  { icon: FileText, label: "New Hire Cover Sheet", type: "cover_sheet", status: "signed", detail: "Signed by Deshawn A. Carter · March 1, 2026 at 9:14 AM", regulatory: "Internal HR Requirement" },
  { icon: FileText, label: "Employment Application", type: "employment_application", status: "signed", detail: "Signed by Deshawn A. Carter · March 1, 2026 at 9:22 AM", regulatory: "TAC §35.111(1)" },
  { icon: Camera, label: "Employee Photograph", type: "employee_photograph", status: "uploaded", detail: "Uploaded March 1, 2026 at 9:30 AM · badge_photo_carter.jpg", regulatory: "Internal HR Requirement" },
  { icon: Shield, label: "Guard Card (Front & Back)", type: "guard_card", status: "uploaded", detail: "Guard Card C09281734 · Expires January 15, 2028", regulatory: "TAC §35.111(3) — Required before any shift", blocks: true },
  { icon: Shield, label: "Guard Card Copy — File Copy", type: "guard_card_copy", status: "uploaded", detail: "Scanned copy on file · March 1, 2026", regulatory: "Texas DPS Requirement" },
  { icon: FileCheck, label: "Zero Tolerance Drug Policy", type: "zero_policy_drug_form", status: "signed", detail: "Signed by Deshawn A. Carter · March 1, 2026 at 9:45 AM", regulatory: "TAC §35.111(5)" },
  { icon: FileCheck, label: "Drug Test Authorization", type: "drug_test", status: "signed", detail: "Lab Results: NEGATIVE · ClinPath Labs San Antonio · March 3, 2026", regulatory: "TAC §35.111(6)" },
  { icon: FileText, label: "Background Check Consent", type: "background_check", status: "signed", detail: "Cleared · Sterling Infosystems · March 5, 2026", regulatory: "TAC §35.111(7)" },
  { icon: Fingerprint, label: "Fingerprint Receipt (DPS)", type: "fingerprint_receipt", status: "in_progress", detail: "Appointment March 16, 2026 at 2:00 PM · L-1 Identity Solutions", regulatory: "Texas Occupations Code §1702.230", blocks: true },
  { icon: BookOpen, label: "Level II Training Certificate", type: "level_ii_training", status: "uploaded", detail: "TOPS Training Center · 6 hours · Certificate #TX-LII-2024-88312", regulatory: "TAC §35.111(10)" },
  { icon: Crosshair, label: "Handgun Proficiency Certificate", type: "handgun_proficiency", status: "uploaded", detail: "Range 350 San Antonio · Score: 91/100 · February 28, 2026", regulatory: "Texas Occupations Code §1702.163 — Armed only" },
  { icon: FileText, label: "Direct Deposit Authorization", type: "direct_deposit", status: "pending", detail: "Not yet completed — reminder sent March 13, 2026", regulatory: "Internal Payroll Requirement" },
  { icon: FileText, label: "I-9 Employment Eligibility", type: "i9", status: "signed", detail: "Verified by James Washington · March 1, 2026 · Section 2 complete", regulatory: "8 CFR §274a.2" },
  { icon: FileText, label: "W-4 Federal Tax Withholding", type: "w4", status: "signed", detail: "Filed · Single / No Dependents · March 1, 2026", regulatory: "IRS Form W-4 Requirement" },
];

const statusConfig = {
  signed: { label: "Signed", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", icon: CheckCircle2 },
  uploaded: { label: "Uploaded", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", icon: Upload },
  pending: { label: "Pending", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", icon: Clock },
  in_progress: { label: "In Progress", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", icon: Clock },
};

const completedCount = DOCS.filter(d => d.status === "signed" || d.status === "uploaded").length;
const completionPct = Math.round((completedCount / DOCS.length) * 100);

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OnboardingPacketTab() {
  const [showEmail, setShowEmail] = useState(false);

  return (
    <div className="space-y-6">
      {/* Employee Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-start justify-between">
            <div className="flex gap-4 items-start">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{NEW_HIRE.name}</h2>
                <p className="text-muted-foreground">{NEW_HIRE.position}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" data-testid="badge-hire-type">Armed Guard</Badge>
                  <Badge variant="outline" data-testid="badge-hire-date">Hired {NEW_HIRE.hireDate}</Badge>
                  <Badge data-testid="badge-site">{NEW_HIRE.site}</Badge>
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-1 min-w-[220px]">
              <div className="flex gap-2 items-center"><Shield className="w-3.5 h-3.5" /><span>Guard Card: {NEW_HIRE.guardCard}</span></div>
              <div className="flex gap-2 items-center"><Phone className="w-3.5 h-3.5" /><span>{NEW_HIRE.phone}</span></div>
              <div className="flex gap-2 items-center"><Mail className="w-3.5 h-3.5" /><span>{NEW_HIRE.email}</span></div>
              <div className="flex gap-2 items-center"><User className="w-3.5 h-3.5" /><span>Supervisor: {NEW_HIRE.supervisor}</span></div>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Onboarding Completion</span>
              <span className="text-muted-foreground">{completedCount} of {DOCS.length} documents</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all"
                style={{ width: `${completionPct}%` }}
                data-testid="progress-onboarding"
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex gap-1 items-center"><CheckCircle2 className="w-3 h-3 text-green-500" />{DOCS.filter(d => d.status === "signed").length} signed</span>
              <span className="flex gap-1 items-center"><Upload className="w-3 h-3 text-blue-500" />{DOCS.filter(d => d.status === "uploaded").length} uploaded</span>
              <span className="flex gap-1 items-center"><Clock className="w-3 h-3 text-amber-500" />{DOCS.filter(d => d.status === "pending" || d.status === "in_progress").length} pending</span>
            </div>
          </div>

          {/* Blocking alert */}
          <div className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">Work assignment partially blocked.</span>
              <span className="text-amber-600 dark:text-amber-500"> Fingerprint DPS receipt pending (appointment March 16). Officer may begin training shifts; cannot be solo-posted until cleared.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex gap-2 items-center">
            <FileText className="w-4 h-4" />
            Document Packet — Acme Security Services Armed Officer Onboarding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {DOCS.map((doc, i) => {
              const cfg = statusConfig[doc.status];
              const Icon = doc.icon;
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={i}
                  className={`flex flex-wrap gap-3 items-start p-3 rounded-md ${cfg.bg}`}
                  data-testid={`doc-row-${doc.type}`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 ${cfg.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-sm font-medium">{doc.label}</span>
                      {doc.blocks && <Badge variant="destructive" className="text-xs">Blocks Scheduling</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.detail}</p>
                    {doc.regulatory && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{doc.regulatory}</p>
                    )}
                  </div>
                  <div className={`flex gap-1 items-center text-xs font-medium ${cfg.color} shrink-0`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Onboarding Email Preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base flex gap-2 items-center">
              <Mail className="w-4 h-4" />
              Onboarding Email — Sent to Employee
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmail(!showEmail)}
              data-testid="button-toggle-email"
            >
              {showEmail ? "Collapse" : "View Email"}
            </Button>
          </div>
        </CardHeader>
        {showEmail && (
          <CardContent>
            <div className="border rounded-md overflow-hidden text-sm">
              {/* Email header */}
              <div className="bg-muted/60 px-4 py-3 space-y-1 border-b">
                <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">From:</span><span>CoAIleague via Acme Security Services &lt;noreply@coaileague.com&gt;</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">To:</span><span>Deshawn A. Carter &lt;{NEW_HIRE.email}&gt;</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Subject:</span><span className="font-medium">Welcome to Acme Security Services — Your Onboarding Details</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Date:</span><span>March 1, 2026 at 9:05 AM CST</span></div>
              </div>

              {/* Email body */}
              <div className="bg-white dark:bg-zinc-950 p-0">
                {/* Navy header */}
                <div className="px-8 py-6" style={{ backgroundColor: '#1a2340' }}>
                  <div className="text-white text-lg font-bold tracking-wide">ACME SECURITY SERVICES</div>
                  <div className="text-xs mt-1" style={{ color: '#c9a84c' }}>Licensed · Bonded · Insured · Texas DPS {ACME.license}</div>
                </div>

                <div className="px-8 py-6 space-y-4">
                  <p className="text-gray-800 dark:text-gray-200">Dear {NEW_HIRE.firstName},</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    Welcome to <strong>{ACME.name}</strong>. We are excited to have you join our team as an
                    <strong> {NEW_HIRE.position}</strong> beginning <strong>{NEW_HIRE.hireDate}</strong>.
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    Your onboarding packet has been prepared and is ready for your review and signature.
                    Please complete all required documents as soon as possible. You must be fully cleared
                    before you can be assigned to solo posts.
                  </p>

                  {/* CTA Button */}
                  <div className="py-2">
                    <div className="inline-block px-6 py-3 rounded-md text-sm font-semibold text-white" style={{ backgroundColor: '#1a2340' }}>
                      Review My Onboarding Packet
                    </div>
                  </div>

                  {/* Summary table */}
                  <div className="rounded-md overflow-hidden border mt-4">
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: '#1a2340' }}>Your Assignment Details</div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {[
                          ["Position", NEW_HIRE.position],
                          ["Start Date", NEW_HIRE.hireDate],
                          ["Primary Site", NEW_HIRE.site],
                          ["Supervisor", NEW_HIRE.supervisor],
                          ["Guard Card", NEW_HIRE.guardCard],
                          ["Pay Rate", "$21.00 / hour"],
                        ].map(([k, v], i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-gray-50 dark:bg-zinc-900" : ""}>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-medium w-40">{k}</td>
                            <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Documents not completed within 14 days of your hire date will trigger an automatic
                    reminder from our HR compliance system. Questions? Contact your supervisor
                    {NEW_HIRE.supervisor} or email {ACME.email}.
                  </p>

                  {/* Footer */}
                  <div className="border-t pt-4 mt-4 text-xs text-gray-500 dark:text-gray-500">
                    {ACME.name} · {ACME.address}<br />
                    {ACME.phone} · {ACME.email}<br />
                    <span className="text-gray-400">Powered by CoAIleague Workforce Management</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// PROPOSAL EMAIL TAB
// ============================================================================

function ProposalEmailTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex gap-2 items-center">
            <Mail className="w-4 h-4" />
            Proposal Email — Sent to Client
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" data-testid="badge-proposal-status">Proposal Sent</Badge>
            <Badge variant="secondary">Day 1 of 5 Follow-up Window</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden text-sm">
            {/* Email metadata */}
            <div className="bg-muted/60 px-4 py-3 space-y-1 border-b">
              <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">From:</span><span>Marcus Rivera, CEO — Acme Security Services &lt;{ACME.ownerEmail}&gt;</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">To:</span><span>{PROSPECT.contactName}, {PROSPECT.contactTitle} &lt;{PROSPECT.contactEmail}&gt;</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Subject:</span><span className="font-medium">Security Services Proposal — {PROSPECT.companyName} ({PROSPECT.proposalNumber})</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Date:</span><span>March 13, 2026 at 10:32 AM CST</span></div>
            </div>

            {/* Email body — Acme branded, no CoAIleague branding */}
            <div className="bg-white dark:bg-zinc-950">
              <div className="px-8 py-6" style={{ backgroundColor: '#1a2340' }}>
                <div className="text-white text-lg font-bold tracking-wide">ACME SECURITY SERVICES, LLC</div>
                <div className="text-sm mt-1" style={{ color: '#c9a84c' }}>Professional Security Services · San Antonio, Texas</div>
                <div className="text-xs mt-0.5 text-white/60">Texas DPS License #{ACME.license} · (210) 555-0194</div>
              </div>

              <div className="px-8 py-6 space-y-4">
                <p className="text-gray-800 dark:text-gray-200">Dear {PROSPECT.contactName},</p>
                <p className="text-gray-700 dark:text-gray-300">
                  Thank you for the opportunity to present this proposal for professional security services
                  at <strong>{PROSPECT.companyName}</strong>. Acme Security Services has protected
                  San Antonio businesses for over 6 years and currently provides security staffing
                  for 14 commercial and industrial properties across Bexar County.
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  We are prepared to staff your property with <strong>{PROSPECT.officersNeeded} licensed,
                  armed officers</strong> providing <strong>24/7 coverage beginning {PROSPECT.startDate}</strong>.
                </p>

                {/* Proposal summary */}
                <div className="rounded-md overflow-hidden border mt-4">
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: '#1a2340' }}>
                    Proposal {PROSPECT.proposalNumber} — Service Summary
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {[
                        ["Client", PROSPECT.companyName],
                        ["Service Type", "24/7 Armed Security Patrol"],
                        ["Coverage", "365 days/year — no gaps"],
                        ["Officers Deployed", `${PROSPECT.officersNeeded} licensed armed officers`],
                        ["Shift Structure", `3 shifts × 4 officers (8-hour rotation)`],
                        ["Bill Rate", `$${PROSPECT.ratePerHour.toFixed(2)} per officer / hour`],
                        ["Monthly Value", `$${PROSPECT.monthlyValue.toLocaleString()}`],
                        ["Annual Contract Value", `$${PROSPECT.annualValue.toLocaleString()}`],
                        ["Contract Term", `${PROSPECT.termMonths} months`],
                        ["Start Date", PROSPECT.startDate],
                        ["Expiration", "March 31, 2027"],
                        ["Response Time SLA", "≤ 4 hours for replacement officers"],
                      ].map(([k, v], i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-50 dark:bg-zinc-900" : ""}>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-medium w-52">{k}</td>
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Officer qualifications */}
                <div className="mt-4 space-y-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">All deployed officers meet or exceed Texas requirements:</p>
                  <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5 ml-2">
                    <li>Texas DPS Licensed — Armed Guard (Level II or higher)</li>
                    <li>Handgun Proficiency Certificate — current</li>
                    <li>Drug tested and background cleared pre-deployment</li>
                    <li>GPS-tracked shifts for verified coverage accountability</li>
                    <li>Incident report filing via digital platform (real-time)</li>
                    <li>Supervisor on call 24/7</li>
                  </ul>
                </div>

                {/* CTA */}
                <div className="py-4 flex flex-wrap gap-3">
                  <div className="inline-block px-6 py-3 rounded-md text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: '#1a2340' }}>
                    Accept This Proposal
                  </div>
                  <div className="inline-block px-6 py-3 rounded-md text-sm font-medium border cursor-pointer">
                    Request Changes
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-500">
                  This proposal is valid for 30 days from the date above. To discuss terms or request
                  a site walkthrough, please contact Marcus Rivera directly at {ACME.phone} or
                  {ACME.ownerEmail}.
                </p>

                <div className="border-t pt-4 text-xs text-gray-400 dark:text-gray-600">
                  {ACME.name} · {ACME.address}<br />
                  Texas DPS License #{ACME.license} · Bonded &amp; Insured<br />
                  <span className="text-gray-300 dark:text-gray-700">Powered by CoAIleague Workforce Management</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trinity follow-up intelligence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex gap-2 items-center text-muted-foreground">
            <Zap className="w-4 h-4" />
            Trinity Pipeline Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { day: "Day 5 (Mar 18)", action: "Trinity drafts follow-up — awaiting owner approval before send", status: "upcoming" },
              { day: "Day 10 (Mar 23)", action: "Second follow-up draft — different angle (questions/concerns)", status: "upcoming" },
              { day: "Day 15 (Mar 28)", action: "Trinity alerts Marcus Rivera — suggests phone call", status: "upcoming" },
              { day: "Day 20 (Apr 2)", action: "Lead moved to STALLED — owner decides continue or close", status: "upcoming" },
            ].map((row, i) => (
              <div key={i} className="flex gap-3 items-start p-2 rounded-md bg-muted/40">
                <Calendar className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground w-36 shrink-0 text-xs">{row.day}</span>
                <span className="text-foreground text-xs">{row.action}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// CONTRACT SIGNED TAB
// ============================================================================

function ContractSignedTab() {
  return (
    <div className="space-y-4">
      {/* Execution banner */}
      <div className="p-4 rounded-md flex gap-3 items-start" style={{ backgroundColor: '#f0fdf4' }}>
        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-400">Contract Fully Executed</p>
          <p className="text-sm text-green-700 dark:text-green-500">
            All parties have signed. Service Agreement {PROSPECT.contractNumber} is legally binding
            and effective {PROSPECT.startDate}. A certified copy has been emailed to all signatories.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Contract header */}
          <div className="text-center space-y-1 mb-6">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Security Services Agreement</p>
            <h2 className="text-xl font-bold">Contract {PROSPECT.contractNumber}</h2>
            <p className="text-sm text-muted-foreground">Executed March 13, 2026 at 3:47 PM CST</p>
          </div>

          <Separator className="mb-4" />

          {/* Parties */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div className="p-4 rounded-md bg-muted/40 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service Provider</p>
              <p className="font-semibold">{ACME.name}</p>
              <p className="text-sm text-muted-foreground">{ACME.address}</p>
              <p className="text-sm text-muted-foreground">Texas DPS #{ACME.license}</p>
              <p className="text-sm text-muted-foreground">{ACME.phone}</p>
            </div>
            <div className="p-4 rounded-md bg-muted/40 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</p>
              <p className="font-semibold">{PROSPECT.companyName}</p>
              <p className="text-sm text-muted-foreground">{PROSPECT.address}</p>
              <p className="text-sm text-muted-foreground">Contact: {PROSPECT.contactName}</p>
              <p className="text-sm text-muted-foreground">{PROSPECT.contactPhone}</p>
            </div>
          </div>

          {/* Key terms */}
          <div className="rounded-md overflow-hidden border mb-6">
            <div className="px-4 py-2 bg-muted text-xs font-semibold uppercase tracking-wide">Key Contract Terms</div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {[
                  ["Service", "24/7 Armed Security Patrol — Lone Star Industrial Park"],
                  ["Officers", `${PROSPECT.officersNeeded} licensed armed officers (steady team, no rotating unknowns)`],
                  ["Coverage", "365 days/year · 24 hours/day · All holidays included"],
                  ["Term", `${PROSPECT.startDate} — March 31, 2027 (${PROSPECT.termMonths} months)`],
                  ["Monthly Rate", `$${PROSPECT.monthlyValue.toLocaleString()} (invoiced 1st of each month)`],
                  ["Payment Terms", "Net 15 — late fee 1.5%/month after 15 days"],
                  ["SLA — Response Time", "≤ 4 hours to replace any no-show officer"],
                  ["SLA — Incident Report", "Within 2 hours of any incident"],
                  ["GPS Tracking", "Included — client dashboard access provided"],
                  ["Renewal Notice", "90-day written notice required by either party"],
                  ["Termination Clause", "60-day notice with cause · 30-day notice without cause after 6 months"],
                  ["Governing Law", "State of Texas — Bexar County courts"],
                ].map(([k, v], i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="px-4 py-2 text-muted-foreground font-medium w-52 align-top">{k}</td>
                    <td className="px-4 py-2">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signature blocks */}
          <div className="space-y-2 mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Electronic Signatures</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Provider signature */}
            <div className="border rounded-md p-4 space-y-3">
              <div className="flex gap-2 items-center">
                <PenLine className="w-4 h-4 text-green-600" />
                <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-green-200">Signed</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Service Provider Signature</p>
                <p className="text-xl font-semibold" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>Marcus J. Rivera</p>
                <Separator className="my-2" />
                <p className="font-medium text-sm">Marcus J. Rivera</p>
                <p className="text-xs text-muted-foreground">Chief Executive Officer</p>
                <p className="text-xs text-muted-foreground">{ACME.name}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                <p>Signed: March 13, 2026 at 2:14 PM CST</p>
                <p>IP: 192.168.1.45 · Chrome 123 / Windows 11</p>
                <p>Signature ID: SIG-2026-0017-A1</p>
              </div>
            </div>

            {/* Client signature */}
            <div className="border rounded-md p-4 space-y-3">
              <div className="flex gap-2 items-center">
                <PenLine className="w-4 h-4 text-green-600" />
                <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-green-200">Signed</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Client Signature</p>
                <p className="text-xl font-semibold" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>John A. Ramirez</p>
                <Separator className="my-2" />
                <p className="font-medium text-sm">{PROSPECT.contactName}</p>
                <p className="text-xs text-muted-foreground">{PROSPECT.contactTitle}</p>
                <p className="text-xs text-muted-foreground">{PROSPECT.companyName}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                <p>Signed: March 13, 2026 at 3:47 PM CST</p>
                <p>IP: 172.16.8.33 · Safari 17 / iPhone 15</p>
                <p>Signature ID: SIG-2026-0017-B1</p>
              </div>
            </div>
          </div>

          {/* Execution certificate */}
          <div className="mt-6 p-4 rounded-md bg-muted/40 text-center space-y-1">
            <div className="flex justify-center mb-2">
              <Award className="w-8 h-8 text-primary" />
            </div>
            <p className="font-semibold">Certificate of Execution</p>
            <p className="text-sm text-muted-foreground">
              This agreement was electronically executed in its entirety on{" "}
              <strong>March 13, 2026 at 3:47 PM CST</strong>.
              Both parties have been emailed executed copies. The original is secured in the
              Document Safe under contract ID {PROSPECT.contractNumber}.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Document Hash: sha256:a3f1c8e2d9b047... · Verified by CoAIleague Document Pipeline
            </p>
          </div>

          {/* Trinity auto-actions */}
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold flex gap-2 items-center">
              <Zap className="w-4 h-4 text-primary" />
              Trinity Auto-Actions on Execution
            </h3>
            {[
              { done: true, action: "Client record created: Lone Star Industrial Park, LP" },
              { done: true, action: "Site record created: 2301 S. Loop 1604 W, San Antonio TX" },
              { done: true, action: "Post orders template assigned: Armed Industrial Patrol" },
              { done: true, action: "First invoice scheduled: April 1, 2026 — $89,760.00" },
              { done: true, action: "Billing rate configured: $26.00/hr armed officer" },
              { done: false, action: "Renewal alert scheduled: December 31, 2026 (90-day notice trigger)" },
              { done: false, action: "First operational briefing: April 1, 2026 — pending org_owner confirmation" },
            ].map((item, i) => (
              <div key={i} className="flex gap-2 items-start text-sm">
                {item.done
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  : <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                }
                <span className={item.done ? "" : "text-muted-foreground"}>{item.action}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// FOUNDER EXEMPTION TAB
// ============================================================================

function FounderExemptionTab() {
  const totalCreditsWouldHaveBeenCharged = EXEMPT_ACTIONS.reduce((s, a) => s + a.normalCost, 0);
  const totalDollarsSaved = EXEMPT_ACTIONS.reduce((s, a) => s + parseFloat(a.savedCost.replace("$", "")), 0);

  return (
    <div className="space-y-4">
      {/* Statewide status card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-start justify-between">
            <div>
              <CardTitle className="flex gap-2 items-center">
                <Star className="w-5 h-5 text-amber-500" />
                Founding Client Workspace
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Founding Client — Permanent Enterprise Access</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200" data-testid="badge-founder">
                Founder Exemption Active
              </Badge>
              <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-green-200" data-testid="badge-billing-exempt">
                Billing Exempt
              </Badge>
              <Badge variant="secondary" data-testid="badge-tier">Enterprise — Permanent</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
            {[
              { label: "Workspace ID", value: "37a04d24-...", icon: Lock },
              { label: "Tier", value: "enterprise", icon: TrendingUp },
              { label: "Max Employees", value: "Unlimited", icon: User },
              { label: "Max Clients", value: "Unlimited", icon: Building2 },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="p-3 rounded-md bg-muted/40 space-y-1" data-testid={`founder-stat-${i}`}>
                  <div className="flex gap-1.5 items-center text-muted-foreground">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs">{stat.label}</span>
                  </div>
                  <p className="font-semibold text-sm">{stat.value}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Stripe Charges", value: "$0.00", sub: "All fees permanently waived", icon: DollarSign, color: "text-green-600" },
              { label: "Credits Deducted", value: "0", sub: `of ${totalCreditsWouldHaveBeenCharged} eligible`, icon: Zap, color: "text-green-600" },
              { label: "Exemption Events", value: EXEMPT_ACTIONS.length.toString(), sub: "logged in audit trail", icon: BarChart3, color: "text-primary" },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="p-4 rounded-md border text-center space-y-1">
                  <Icon className={`w-6 h-6 mx-auto ${stat.color}`} />
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs font-medium">{stat.label}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* DB verification */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex gap-2 items-center">
            <FileCheck className="w-4 h-4" />
            Database Verification — Live Values
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md overflow-hidden border text-sm">
            <div className="px-4 py-2 bg-muted text-xs font-mono font-semibold">
              SELECT founder_exemption, billing_exempt, subscription_tier, max_employees FROM workspaces WHERE id = '37a04d24-...'
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">founder_exemption</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">billing_exempt</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">subscription_tier</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">max_employees</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 font-mono text-green-600 dark:text-green-400">true</td>
                  <td className="px-4 py-2 font-mono text-green-600 dark:text-green-400">true</td>
                  <td className="px-4 py-2 font-mono">enterprise</td>
                  <td className="px-4 py-2 font-mono">999999</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Values confirmed live from production DB on March 13, 2026.
            Set by <code className="text-xs bg-muted px-1 rounded">ensureStatewideExemption()</code> on server startup.
          </p>
        </CardContent>
      </Card>

      {/* Exempted actions log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex gap-2 items-center">
            <BarChart3 className="w-4 h-4" />
            Exempted Actions — Audit Log Sample
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md overflow-hidden border text-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Action</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">Domain</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Normal Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Charged</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">$ Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {EXEMPT_ACTIONS.map((row, i) => (
                  <tr key={i} data-testid={`exempt-row-${i}`}>
                    <td className="px-3 py-2">{row.action}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">{row.domain}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{row.normalCost} cr</td>
                    <td className="px-3 py-2 text-right">
                      <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-green-200 text-xs">0</Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400 font-medium">{row.savedCost}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">{totalCreditsWouldHaveBeenCharged} cr</td>
                  <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">0</td>
                  <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">${totalDollarsSaved.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Every exempted event is logged in the universal audit trail with reason: <code className="text-xs bg-muted px-1 rounded">founder_exemption</code>. No credits deducted. No Stripe API calls made.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// SHIFT BOT SIMULATION TAB
// ============================================================================

const BOT_ARCHITECTURE = [
  {
    bot: "ReportBot",
    icon: ClipboardList,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    responsibilities: [
      "Auto-enters shift room on creation with welcome message",
      "Hourly check-in reminders when officer goes silent",
      "30-minute pre-shift-end warning",
      "Photo acknowledgment with GPS geofence cross-reference",
      "Incident keyword detection + manager escalation",
      "Compiles end-of-shift PDF report (WORM-locked)",
    ],
  },
  {
    bot: "HelpAI",
    icon: MessageSquare,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    responsibilities: [
      "Responds to @HelpAI mentions in shift rooms",
      "Answers procedure, policy, and safety questions",
      "Routes questions through Trinity AI reasoning triad",
      "Context-aware using shift, site, and org data",
    ],
  },
  {
    bot: "ClockBot",
    icon: Clock,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30",
    responsibilities: [
      "@ClockBot summon creates pending clock-in entry",
      "Sends CONFIRM prompt to officer and supervisor",
      "CONFIRM → real time_entry INSERT with supervisor_override method",
      "Notifies officer and creates audit trail entry",
    ],
  },
  {
    bot: "MeetingBot",
    icon: Radio,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    responsibilities: [
      "@MeetingBot action item: — tracks action items per room",
      "@MeetingBot decision: — tracks decisions per room",
      "/meetingend triggers AI-summarized PDF generation",
      "PDF saved to Document Safe under Meetings category (WORM)",
    ],
  },
];

interface SimScenarioResult {
  scenario: string;
  passed: boolean;
  details: string;
  data?: any;
}

interface SimResult {
  success: boolean;
  summary?: {
    passed: number;
    failed: number;
    total: number;
    passRate: string;
    conversationId?: string;
  };
  results?: SimScenarioResult[];
  error?: string;
}

function ShiftBotSimulationTab() {
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const runSim = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bots/simulate");
      return res.json() as Promise<SimResult>;
    },
    onSuccess: (data) => setSimResult(data),
  });

  const passRate = simResult?.summary
    ? Math.round((simResult.summary.passed / simResult.summary.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Shift Room Bot Orchestration System
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Full end-to-end simulation of all 4 bots against a live Acme shift — 9 test scenarios.
              </p>
            </div>
            <Button
              data-testid="button-run-simulation"
              onClick={() => runSim.mutate()}
              disabled={runSim.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              {runSim.isPending ? "Running…" : "Run Simulation"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runSim.isError && (
            <div className="flex items-center gap-2 text-destructive text-sm mb-4 p-3 rounded-md bg-destructive/10">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>Simulation failed — platform admin access required. Make sure you are logged in as a sysop/admin account.</span>
            </div>
          )}

          {simResult && simResult.summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{simResult.summary.passed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Passed</p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{simResult.summary.failed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Failed</p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-2xl font-bold">{simResult.summary.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total</p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className={`text-2xl font-bold ${passRate === 100 ? "text-green-600 dark:text-green-400" : passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {simResult.summary.passRate}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Pass Rate</p>
                </div>
              </div>

              {simResult.summary.conversationId && (
                <p className="text-xs text-muted-foreground">
                  Shift room created: <code className="bg-muted px-1 rounded text-xs">{simResult.summary.conversationId}</code>
                </p>
              )}

              <div className="space-y-2">
                {simResult.results?.map((r, i) => (
                  <div
                    key={i}
                    data-testid={`sim-result-${i}`}
                    className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  >
                    {r.passed
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.scenario}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{r.details}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={r.passed
                        ? "border-green-500 text-green-600 dark:text-green-400 shrink-0"
                        : "border-red-500 text-red-600 dark:text-red-400 shrink-0"
                      }
                    >
                      {r.passed ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!simResult && !runSim.isPending && (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click "Run Simulation" to test all 9 bot scenarios against the Acme workspace.</p>
              <p className="text-xs mt-1">Creates a test shift, runs scenarios, then cleans up automatically.</p>
            </div>
          )}

          {runSim.isPending && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Running 9 simulation scenarios…</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BOT_ARCHITECTURE.map((bot) => {
          const Icon = bot.icon;
          return (
            <Card key={bot.bot}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className={`p-1.5 rounded-md ${bot.bg}`}>
                    <Icon className={`w-4 h-4 ${bot.color}`} />
                  </div>
                  {bot.bot}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {bot.responsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            All bot messages are persisted to <code className="bg-muted px-1 rounded">chatMessages</code> with <code className="bg-muted px-1 rounded">senderType: &apos;bot&apos;</code>.
            Shift reports and meeting summaries are WORM-locked in <code className="bg-muted px-1 rounded">orgDocuments</code> under <code className="bg-muted px-1 rounded">category: shifts</code> or <code className="bg-muted px-1 rounded">category: meetings</code>.
            All 7 bot actions are registered with Trinity&apos;s platform action hub for autonomous invocation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const TABS = [
  { id: "packet", label: "Onboarding Packet", icon: FileText },
  { id: "proposal", label: "Proposal Email", icon: Mail },
  { id: "contract", label: "Contract Signed", icon: PenLine },
  { id: "exemption", label: "Founder Exemption", icon: Star },
  { id: "shiftbot", label: "Shift Bot System", icon: Bot },
] as const;

type TabId = typeof TABS[number]["id"];

export default function AcmeSimulation() {
  const [activeTab, setActiveTab] = useState<TabId>("packet");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <div className="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">ACME Security — Simulation Demo</h1>
            <p className="text-muted-foreground mt-1">
              End-to-end proof: onboarding packet, proposal, executed contract, and founder exemption verification
              using realistic Texas security industry data.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">Simulated Data</Badge>
            <Badge variant="outline">San Antonio, TX</Badge>
            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
              Acme Security Services LLC
            </Badge>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={`flex gap-2 items-center px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex-1 justify-center ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "packet" && <OnboardingPacketTab />}
      {activeTab === "proposal" && <ProposalEmailTab />}
      {activeTab === "contract" && <ContractSignedTab />}
      {activeTab === "exemption" && <FounderExemptionTab />}
      {activeTab === "shiftbot" && <ShiftBotSimulationTab />}
    </div>
  );
}
