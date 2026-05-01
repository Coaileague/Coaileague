import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  FileText, Shield, ChevronRight, ChevronLeft, CheckCircle, Building, DollarSign,
  Scale, AlertTriangle, Clock, Pen
} from "lucide-react";

interface AgreementForm {
  clientLegalName: string;
  clientDba: string;
  clientContactName: string;
  clientContactTitle: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  serviceType: string;
  serviceLocations: string;
  serviceDescription: string;
  billRate: string;
  overtimeBillRate: string;
  holidayMultiplier: string;
  invoiceCycle: string;
  paymentDueDays: string;
  lateFeePercent: string;
  lateFeeFrequency: string;
  minimumGuaranteedHours: string;
  startDate: string;
  endDate: string;
  terminationNoticeDays: string;
  governingCounty: string;
  autoRenew: boolean;
  requiresInsuranceCert: boolean;
  requiresUniformedOfficers: boolean;
  specialTerms: string;
}

const defaultForm: AgreementForm = {
  clientLegalName: "",
  clientDba: "",
  clientContactName: "",
  clientContactTitle: "",
  clientEmail: "",
  clientPhone: "",
  clientAddress: "",
  clientCity: "",
  clientState: "TX",
  clientZip: "",
  serviceType: "unarmed",
  serviceLocations: "",
  serviceDescription: "",
  billRate: "",
  overtimeBillRate: "",
  holidayMultiplier: "1.5",
  invoiceCycle: "semi_monthly",
  paymentDueDays: "30",
  lateFeePercent: "1.5",
  lateFeeFrequency: "monthly",
  minimumGuaranteedHours: "",
  startDate: "",
  endDate: "",
  terminationNoticeDays: "30",
  governingCounty: "Harris",
  autoRenew: true,
  requiresInsuranceCert: true,
  requiresUniformedOfficers: true,
  specialTerms: "",
};

function generateContractContent(f: AgreementForm, orgName: string): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const svcType = f.serviceType === "armed"
    ? "Armed (Commissioned) Security Officers (Texas Level III license required)"
    : f.serviceType === "ppo"
    ? "Personal Protection Officers (Texas Level IV license required)"
    : "Unarmed (Non-commissioned) Security Officers (Texas Level II license required)";

  return `SECURITY SERVICES AGREEMENT

This Security Services Agreement ("Agreement") is entered into as of ${f.startDate || today} ("Effective Date"), by and between:

SERVICE PROVIDER:
${orgName} ("Company"), a security services provider licensed under the Texas Private Security Act, Chapter 1702, Texas Occupations Code, with its principal place of business in the State of Texas.

CLIENT:
${f.clientLegalName}${f.clientDba ? ` DBA ${f.clientDba}` : ""} ("Client"), with its principal place of business at ${f.clientAddress}, ${f.clientCity}, ${f.clientState} ${f.clientZip}.

Authorized Representative: ${f.clientContactName}, ${f.clientContactTitle}
Contact Email: ${f.clientEmail}
Contact Phone: ${f.clientPhone}

────────────────────────────────────────────────────────────────────────────────
ARTICLE I — SCOPE OF SERVICES
────────────────────────────────────────────────────────────────────────────────

1.1  Service Type. Company agrees to provide the following security services to Client:
     ${svcType}

1.2  Service Locations. Services will be performed at the following location(s):
     ${f.serviceLocations || "[To be specified in Schedule A]"}

1.3  Service Description.
     ${f.serviceDescription || "Security patrol, access control, incident response, and related security services as mutually agreed upon in writing."}

1.4  Personnel Requirements. All security officers assigned to Client's account shall:
     (a) Hold current, valid Texas DPS Private Security Bureau registration at the required level;
     (b) Have completed all required training under 37 TAC Part 1, Chapter 35;
     (c) Maintain a valid DPS Pocket Card on their person during all assignments;
     (d) Successfully pass a background check and, where required by Client, a drug screening.

${f.requiresUniformedOfficers ? "1.5  Uniforms. All officers shall be in proper Company uniform during service hours.\n" : ""}

────────────────────────────────────────────────────────────────────────────────
ARTICLE II — TERM AND TERMINATION
────────────────────────────────────────────────────────────────────────────────

2.1  Term. This Agreement shall commence on ${f.startDate || "[Effective Date]"} and shall continue through ${f.endDate || "[End Date]"}.

2.2  Renewal. ${f.autoRenew ? `This Agreement shall automatically renew for successive one (1) year terms unless either party provides written notice of non-renewal at least ${f.terminationNoticeDays} days prior to the end of the then-current term.` : "This Agreement shall expire on the End Date unless renewed in writing by both parties."}

2.3  Termination for Convenience. Either party may terminate this Agreement without cause by providing ${f.terminationNoticeDays} days prior written notice to the other party.

2.4  Termination for Cause. Either party may terminate this Agreement immediately upon written notice if the other party materially breaches any term of this Agreement and fails to cure such breach within ten (10) days of receiving written notice thereof.

2.5  Effect of Termination. Upon termination, Client shall pay all outstanding invoices for services rendered through the termination date. Company shall return any Client property and remove all Company personnel from Client's premises.

────────────────────────────────────────────────────────────────────────────────
ARTICLE III — BILLING AND PAYMENT
────────────────────────────────────────────────────────────────────────────────

3.1  Bill Rates.
     (a) Regular Hours (up to 40 hrs/week/officer):    $${f.billRate || "____"} per hour
     (b) Overtime (over 40 hrs/week/officer):           $${f.overtimeBillRate || `${(parseFloat(f.billRate || "0") * 1.5).toFixed(2)}`} per hour
     (c) Holidays:                                      ${f.holidayMultiplier}× regular rate

${f.minimumGuaranteedHours ? `3.2  Minimum Hours. Client guarantees a minimum of ${f.minimumGuaranteedHours} hours per week. Shortfalls will be invoiced at the regular bill rate.\n\n` : ""}3.3  Invoicing. Company will issue invoices on a ${f.invoiceCycle === "weekly" ? "weekly" : f.invoiceCycle === "bi_weekly" ? "bi-weekly" : f.invoiceCycle === "monthly" ? "monthly" : "semi-monthly"} basis. Invoices shall include the name of each officer, dates and hours worked, and applicable rates.

3.4  Payment Terms. Client shall pay all undisputed invoices within ${f.paymentDueDays} days of the invoice date. Payment shall be made by check, ACH, wire transfer, or credit card as agreed.

3.5  Late Fees. Invoices not paid within the due date shall accrue a late charge of ${f.lateFeePercent}% per ${f.lateFeeFrequency} on the unpaid balance, compounded ${f.lateFeeFrequency}, until paid in full. Client agrees this is a reasonable estimate of damages and not a penalty.

3.6  Collection Costs. If Company must take legal action to collect any unpaid balance, Client agrees to pay all reasonable attorneys' fees, court costs, and collection expenses incurred by Company.

3.7  Disputed Invoices. Client must notify Company in writing of any dispute within ten (10) days of receipt of the invoice. Undisputed portions must be paid by the due date.

3.8  Interest on Overdue Accounts. Overdue balances are subject to interest at the maximum rate permitted under the Texas Finance Code, which Client acknowledges and agrees constitutes valid consideration under a written contract.

────────────────────────────────────────────────────────────────────────────────
ARTICLE IV — INSURANCE
────────────────────────────────────────────────────────────────────────────────

4.1  Company Insurance. Company shall maintain, at minimum:
     (a) Commercial General Liability: $1,000,000 per occurrence / $2,000,000 aggregate
     (b) Workers' Compensation: As required by Texas law
     (c) Employer's Liability: $500,000 each accident
     (d) Professional Liability / E&O: $1,000,000 per claim

${f.requiresInsuranceCert ? "4.2  Certificate of Insurance. Company shall provide Client with a Certificate of Insurance naming Client as an Additional Insured upon request.\n\n" : ""}4.3  Client Insurance. Client shall maintain property insurance and general liability coverage for Client's premises at which services are performed.

────────────────────────────────────────────────────────────────────────────────
ARTICLE V — LIABILITY AND INDEMNIFICATION
────────────────────────────────────────────────────────────────────────────────

5.1  Limitation of Liability. Company's total liability under this Agreement, regardless of the form of claim, shall not exceed the total fees paid by Client in the twelve (12) months preceding the claim. In no event shall Company be liable for lost profits, lost revenue, or indirect, special, incidental, or consequential damages.

5.2  Client Indemnification. Client shall indemnify, defend, and hold harmless Company and its officers, employees, and agents from any claim, damage, or expense arising out of: (a) Client's negligence or intentional acts; (b) Client's failure to provide a safe working environment; (c) Client's breach of this Agreement.

5.3  Force Majeure. Neither party shall be in default for failure to perform obligations to the extent caused by circumstances beyond that party's reasonable control, including natural disasters, labor disputes, or governmental orders.

────────────────────────────────────────────────────────────────────────────────
ARTICLE VI — CONFIDENTIALITY AND DATA
────────────────────────────────────────────────────────────────────────────────

6.1  Confidentiality. Each party agrees to keep the other party's Confidential Information strictly confidential and not to disclose it to any third party without prior written consent, except as required by law.

6.2  Security Records. Company shall maintain and provide incident reports, daily activity reports (DARs), and shift logs to Client upon request. All records shall be retained for a minimum of five (5) years.

────────────────────────────────────────────────────────────────────────────────
ARTICLE VII — GENERAL PROVISIONS
────────────────────────────────────────────────────────────────────────────────

7.1  Independent Contractor. Company is an independent contractor. Nothing herein creates an employer-employee, partnership, or joint venture relationship between the parties.

7.2  Non-Solicitation. During the term and for one (1) year thereafter, Client shall not directly hire, recruit, or solicit Company's security personnel. If Client hires a Company employee in violation of this provision, Client shall pay a placement fee equal to 20% of the employee's first year's compensation.

7.3  Governing Law & Venue. This Agreement shall be governed by the laws of the State of Texas. Any dispute shall be brought exclusively in the state or federal courts located in ${f.governingCounty} County, Texas, and both parties consent to such jurisdiction and venue.

7.4  Dispute Resolution. Prior to litigation, the parties agree to attempt good-faith mediation for a period of thirty (30) days upon written notice by either party. The non-prevailing party shall bear all mediation costs.

7.5  Entire Agreement. This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior agreements, representations, and understandings.

7.6  Amendment. This Agreement may only be modified by a written instrument signed by authorized representatives of both parties.

7.7  Severability. If any provision is found invalid, the remaining provisions shall continue in full force and effect.

7.8  Waiver. Failure to enforce any provision shall not constitute a waiver of future enforcement of that provision.

7.9  Notices. All notices shall be in writing and delivered by certified mail, return receipt requested, overnight courier, or email with read receipt to the addresses set forth above.

${f.specialTerms ? `7.10  Special Terms.\n${f.specialTerms}\n` : ""}

────────────────────────────────────────────────────────────────────────────────
ARTICLE VIII — SIGNATURES
────────────────────────────────────────────────────────────────────────────────

IN WITNESS WHEREOF, the parties have executed this Security Services Agreement as of the date first written above.

SERVICE PROVIDER — ${orgName}

Signature: _______________________
Printed Name: _______________________
Title: _______________________
Date: _______________________

CLIENT — ${f.clientLegalName}

Signature: _______________________
Printed Name: ${f.clientContactName}
Title: ${f.clientContactTitle}
Date: _______________________

────────────────────────────────────────────────────────────────────────────────

This contract is legally binding under the laws of the State of Texas.
Electronic signatures are valid pursuant to Tex. Bus. & Com. Code §322 (Texas E-Sign Act).
Execution of this Agreement by both parties creates an enforceable contract and a chain of
evidence that may be relied upon in any legal proceeding related to payment default,
service non-performance, or breach of contract obligations.
`;
}

const STEPS = [
  "Client Information",
  "Services & Scope",
  "Billing & Payment",
  "Term & Legal",
  "Review & Send",
];

export default function TxServiceAgreement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AgreementForm>(defaultForm);
  const [preview, setPreview] = useState(false);

  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const orgName = authData?.user?.workspaceName || "Security Services Company";

  const set = (key: keyof AgreementForm, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const content = generateContractContent(form, orgName);
      const res = await apiRequest("POST", "/api/contracts", {
        docType: "contract",
        clientName: form.clientLegalName,
        clientEmail: form.clientEmail,
        title: `Texas Security Services Agreement — ${form.clientLegalName}`,
        content,
        services: [{ type: form.serviceType, billRate: form.billRate }],
        billingTerms: {
          paymentDueDays: parseInt(form.paymentDueDays),
          lateFeePercent: parseFloat(form.lateFeePercent),
          invoiceCycle: form.invoiceCycle,
        },
        effectiveDate: form.startDate || new Date().toISOString().split("T")[0],
        termEndDate: form.endDate || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ title: "Contract created", description: "Send it to the client for signature." });
      setLocation("/clients");
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const previewContent = generateContractContent(form, orgName);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Scale className="w-6 h-6" />
            Texas Security Services Agreement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Legally binding client contract. Upon completion, send to client for digital signature through the secure signing portal.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          <Shield className="w-3 h-3 mr-1" /> Texas Law Compliant
        </Badge>
      </div>

      {/* Step progress */}
      <div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5 mb-2" />
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={['text-xs', i === step ? "text-primary font-medium" : i < step ? "text-muted-foreground" : "text-muted-foreground/40"].join(' ')}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* ── Step 0: Client Information ──────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Client / Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientLegalName">Legal Entity Name <span className="text-destructive">*</span></Label>
                <Input id="clientLegalName" data-testid="input-clientLegalName" className="mt-1" value={form.clientLegalName} onChange={(e) => set("clientLegalName", e.target.value)} placeholder="ABC Property Group, LLC" />
              </div>
              <div>
                <Label htmlFor="clientDba">DBA / Trade Name (if different)</Label>
                <Input id="clientDba" data-testid="input-clientDba" className="mt-1" value={form.clientDba} onChange={(e) => set("clientDba", e.target.value)} placeholder="ABC Properties" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientContactName">Authorized Representative Name <span className="text-destructive">*</span></Label>
                <Input id="clientContactName" data-testid="input-clientContactName" className="mt-1" value={form.clientContactName} onChange={(e) => set("clientContactName", e.target.value)} placeholder="John Williams" />
              </div>
              <div>
                <Label htmlFor="clientContactTitle">Title</Label>
                <Input id="clientContactTitle" data-testid="input-clientContactTitle" className="mt-1" value={form.clientContactTitle} onChange={(e) => set("clientContactTitle", e.target.value)} placeholder="CEO / Property Manager" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientEmail">Email <span className="text-destructive">*</span></Label>
                <Input id="clientEmail" data-testid="input-clientEmail" type="email" className="mt-1" value={form.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} placeholder="john@abcproperties.com" />
              </div>
              <div>
                <Label htmlFor="clientPhone">Phone</Label>
                <Input id="clientPhone" data-testid="input-clientPhone" type="tel" className="mt-1" value={form.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} placeholder="(713) 555-0100" />
              </div>
            </div>
            <div>
              <Label htmlFor="clientAddress">Business Address</Label>
              <Input id="clientAddress" data-testid="input-clientAddress" className="mt-1" value={form.clientAddress} onChange={(e) => set("clientAddress", e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="clientCity">City</Label>
                <Input id="clientCity" data-testid="input-clientCity" className="mt-1" value={form.clientCity} onChange={(e) => set("clientCity", e.target.value)} placeholder="Houston" />
              </div>
              <div>
                <Label htmlFor="clientState">State</Label>
                <Input id="clientState" data-testid="input-clientState" className="mt-1" value={form.clientState} onChange={(e) => set("clientState", e.target.value)} placeholder="TX" />
              </div>
              <div>
                <Label htmlFor="clientZip">ZIP</Label>
                <Input id="clientZip" data-testid="input-clientZip" className="mt-1" value={form.clientZip} onChange={(e) => set("clientZip", e.target.value)} placeholder="77002" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Services & Scope ────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Services & Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Service Type <span className="text-destructive">*</span></Label>
              <Select value={form.serviceType} onValueChange={(v) => set("serviceType", v)}>
                <SelectTrigger data-testid="select-serviceType" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unarmed">Unarmed Security (Level II) — Standard patrol and access control</SelectItem>
                  <SelectItem value="armed">Armed Security (Level III) — Commissioned officers with firearm</SelectItem>
                  <SelectItem value="ppo">Personal Protection Officers (Level IV) — Executive protection</SelectItem>
                  <SelectItem value="mixed">Mixed (Armed + Unarmed) — As specified per post</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="serviceLocations">Service Location(s) / Post Address(es)</Label>
              <Input id="serviceLocations" data-testid="input-serviceLocations" className="mt-1" value={form.serviceLocations} onChange={(e) => set("serviceLocations", e.target.value)} placeholder="123 Commerce Blvd, Houston TX 77002 — Main Lobby Gate; 456 Industrial Dr, Baytown TX — Perimeter Patrol" />
            </div>
            <div>
              <Label htmlFor="serviceDescription">Detailed Scope of Services</Label>
              <textarea
                id="serviceDescription"
                data-testid="input-serviceDescription"
                className="mt-1 w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.serviceDescription}
                onChange={(e) => set("serviceDescription", e.target.value)}
                placeholder="Describe duties: access control, vehicle patrol, CCTV monitoring, visitor badging, incident response, DAR filing, etc."
              />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="chk-uniform" checked={form.requiresUniformedOfficers} onCheckedChange={(v) => set("requiresUniformedOfficers", !!v)} data-testid="checkbox-requiresUniformedOfficers" />
                <Label htmlFor="chk-uniform" className="cursor-pointer text-sm">Officers must be in Company uniform at all times during service</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="chk-coi" checked={form.requiresInsuranceCert} onCheckedChange={(v) => set("requiresInsuranceCert", !!v)} data-testid="checkbox-requiresInsuranceCert" />
                <Label htmlFor="chk-coi" className="cursor-pointer text-sm">Client requires Certificate of Insurance (COI) naming them as Additional Insured</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Billing & Payment ────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Billing & Payment Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="billRate">Regular Bill Rate ($/hr) <span className="text-destructive">*</span></Label>
                <Input id="billRate" data-testid="input-billRate" type="number" className="mt-1" value={form.billRate} onChange={(e) => set("billRate", e.target.value)} placeholder="28.00" />
              </div>
              <div>
                <Label htmlFor="overtimeBillRate">OT Rate ($/hr)</Label>
                <Input id="overtimeBillRate" data-testid="input-overtimeBillRate" type="number" className="mt-1" value={form.overtimeBillRate} onChange={(e) => set("overtimeBillRate", e.target.value)} placeholder="42.00" />
              </div>
              <div>
                <Label htmlFor="holidayMultiplier">Holiday Multiplier</Label>
                <Select value={form.holidayMultiplier} onValueChange={(v) => set("holidayMultiplier", v)}>
                  <SelectTrigger data-testid="select-holidayMultiplier" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.0">1.0× (no premium)</SelectItem>
                    <SelectItem value="1.5">1.5× (time and a half)</SelectItem>
                    <SelectItem value="2.0">2.0× (double time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="minimumGuaranteedHours">Minimum Guaranteed Hours per Week (optional)</Label>
              <Input id="minimumGuaranteedHours" data-testid="input-minimumGuaranteedHours" type="number" className="mt-1" value={form.minimumGuaranteedHours} onChange={(e) => set("minimumGuaranteedHours", e.target.value)} placeholder="40" />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Invoice Cycle</Label>
                <Select value={form.invoiceCycle} onValueChange={(v) => set("invoiceCycle", v)}>
                  <SelectTrigger data-testid="select-invoiceCycle" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                    <SelectItem value="semi_monthly">Semi-Monthly (1st & 15th)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="paymentDueDays">Payment Due (Days Net)</Label>
                <Select value={form.paymentDueDays} onValueChange={(v) => set("paymentDueDays", v)}>
                  <SelectTrigger data-testid="select-paymentDueDays" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Net 15</SelectItem>
                    <SelectItem value="30">Net 30</SelectItem>
                    <SelectItem value="45">Net 45</SelectItem>
                    <SelectItem value="60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lateFeePercent">Late Fee Rate (%)</Label>
                <Input id="lateFeePercent" data-testid="input-lateFeePercent" type="number" step="0.1" className="mt-1" value={form.lateFeePercent} onChange={(e) => set("lateFeePercent", e.target.value)} placeholder="1.5" />
              </div>
              <div>
                <Label>Late Fee Frequency</Label>
                <Select value={form.lateFeeFrequency} onValueChange={(v) => set("lateFeeFrequency", v)}>
                  <SelectTrigger data-testid="select-lateFeeFrequency" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Per Month</SelectItem>
                    <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                    <SelectItem value="weekly">Per Week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> Default & Collection Language
              </div>
              <p>The contract includes standard language referencing attorney's fees, collection costs, and statutory interest per the Texas Finance Code. Enforceability depends on your specific circumstances — consult a licensed Texas attorney before relying on these provisions.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Term & Legal ─────────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Term, Termination & Governing Law
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Contract Start Date <span className="text-destructive">*</span></Label>
                <Input id="startDate" data-testid="input-startDate" type="date" className="mt-1" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="endDate">Contract End Date</Label>
                <Input id="endDate" data-testid="input-endDate" type="date" className="mt-1" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="terminationNoticeDays">Termination Notice Period (days)</Label>
                <Select value={form.terminationNoticeDays} onValueChange={(v) => set("terminationNoticeDays", v)}>
                  <SelectTrigger data-testid="select-terminationNoticeDays" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="governingCounty">Governing County (Venue)</Label>
                <Input id="governingCounty" data-testid="input-governingCounty" className="mt-1" value={form.governingCounty} onChange={(e) => set("governingCounty", e.target.value)} placeholder="Harris" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="chk-autorenew" checked={form.autoRenew} onCheckedChange={(v) => set("autoRenew", !!v)} data-testid="checkbox-autoRenew" />
              <Label htmlFor="chk-autorenew" className="cursor-pointer text-sm">Auto-renew annually (with notice requirement)</Label>
            </div>
            <Separator />
            <div>
              <Label htmlFor="specialTerms">Special Terms or Addendum (optional)</Label>
              <textarea
                id="specialTerms"
                data-testid="input-specialTerms"
                className="mt-1 w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.specialTerms}
                onChange={(e) => set("specialTerms", e.target.value)}
                placeholder="Any additional client-specific terms, post orders references, SLA provisions, etc."
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Review & Send ────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Review Agreement
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Review the generated contract below. Once saved, you can send it to{" "}
                <strong>{form.clientContactName || "the client"}</strong> ({form.clientEmail || "email"}) for digital signature.
              </p>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="mb-4"
                onClick={() => setPreview(!preview)}
                data-testid="button-toggle-preview"
              >
                <FileText className="w-4 h-4 mr-2" />
                {preview ? "Hide" : "Show"} Contract Preview
              </Button>
              {preview && (
                <pre className="text-xs whitespace-pre-wrap bg-muted/30 rounded-md p-4 max-h-[500px] overflow-y-auto border font-mono leading-relaxed">
                  {previewContent}
                </pre>
              )}
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div><span className="text-muted-foreground">Client:</span> <strong>{form.clientLegalName || "—"}</strong></div>
                <div><span className="text-muted-foreground">Contact:</span> {form.clientContactName || "—"} ({form.clientEmail || "—"})</div>
                <div><span className="text-muted-foreground">Service Type:</span> {form.serviceType}</div>
                <div><span className="text-muted-foreground">Bill Rate:</span> ${form.billRate || "—"}/hr</div>
                <div><span className="text-muted-foreground">Invoice Cycle:</span> {form.invoiceCycle}</div>
                <div><span className="text-muted-foreground">Payment Terms:</span> Net {form.paymentDueDays}</div>
                <div><span className="text-muted-foreground">Late Fee:</span> {form.lateFeePercent}% per {form.lateFeeFrequency}</div>
                <div><span className="text-muted-foreground">Term:</span> {form.startDate || "—"} → {form.endDate || "Ongoing"}</div>
                <div><span className="text-muted-foreground">Notice Period:</span> {form.terminationNoticeDays} days</div>
                <div><span className="text-muted-foreground">Governing Venue:</span> {form.governingCounty} County, TX</div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-muted/40 border rounded-md p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Scale className="w-4 h-4" /> Chain of Evidence
            </div>
            <p className="text-xs text-muted-foreground">
              After saving, go to the Contracts section to send this agreement to the client. Once signed, the system
              records the client's IP address, timestamp, and digital signature — creating an audit trail
              consistent with electronic signature practices. Consult a licensed attorney to confirm enforceability in your specific jurisdiction and context.
            </p>
          </div>

          <Button
            className="w-full"
            size="lg"
            data-testid="button-create-contract"
            disabled={!form.clientLegalName || !form.clientEmail || !form.billRate || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating…" : "Save Contract — Go to Contracts to Send for Signature"}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} data-testid="button-prev-step">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} data-testid="button-next-step">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
