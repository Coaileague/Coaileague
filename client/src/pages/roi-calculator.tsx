import { useState, useCallback } from "react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO, PAGE_SEO } from "@/components/seo";
import { Link } from "wouter";
import {
  DollarSign,
  Users,
  Calculator,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
  Building2,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { recommendTier, PRICING_TIERS } from "@/config/pricing";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ROIInputs {
  // Section 1 — Team
  officerCount: number;
  clientSites: number;
  stateCount: number;

  // Operations staff
  hasOpsManager: boolean;
  opsMgrSalary: number;
  schedulerCount: number;
  schedulerAvgSalary: number;
  hasHrAdmin: boolean;
  hrAdminSalary: number;
  hasPayrollCoord: boolean;
  payrollCoordSalary: number;
  hasBillingPerson: boolean;
  billingPersonSalary: number;
  hasComplianceCoord: boolean;
  complianceCoordSalary: number;

  // Section 2 — Software
  schedulingSoftwareMonthlyCost: number;
  payrollProvider: string;
  payrollMonthlyCost: number;
  payrollEmployeeCount: number;
  hrSoftwareMonthlyCost: number;
  invoicingSoftwareMonthlyCost: number;
  complianceSoftwareMonthlyCost: number;
  otherSoftwareMonthlyCost: number;

  // Section 3 — Pain points
  monthlyOvertimeCost: number;
  annualTurnoverRate: number;
  replacementCostPerOfficer: number;
  complianceViolationsCategory: string;
  complianceFinesPaid: number;
  contractsLost: number;
  avgContractAnnualValue: number;
  mgmtHoursPerWeek: number;
  mgmtHourlyValue: number;

  // Section 4 — Invoicing
  monthlyInvoicingVolume: number;
  currentCardRate: number;
  currentAchFee: number;
}

const defaultInputs: ROIInputs = {
  officerCount: 50,
  clientSites: 12,
  stateCount: 1,

  hasOpsManager: true,
  opsMgrSalary: 72000,
  schedulerCount: 2,
  schedulerAvgSalary: 38000,
  hasHrAdmin: false,
  hrAdminSalary: 48000,
  hasPayrollCoord: false,
  payrollCoordSalary: 44000,
  hasBillingPerson: false,
  billingPersonSalary: 42000,
  hasComplianceCoord: false,
  complianceCoordSalary: 52000,

  schedulingSoftwareMonthlyCost: 150,
  payrollProvider: "quickbooks",
  payrollMonthlyCost: 300,
  payrollEmployeeCount: 50,
  hrSoftwareMonthlyCost: 0,
  invoicingSoftwareMonthlyCost: 80,
  complianceSoftwareMonthlyCost: 0,
  otherSoftwareMonthlyCost: 0,

  monthlyOvertimeCost: 6500,
  annualTurnoverRate: 80,
  replacementCostPerOfficer: 4500,
  complianceViolationsCategory: "0",
  complianceFinesPaid: 0,
  contractsLost: 0,
  avgContractAnnualValue: 180000,
  mgmtHoursPerWeek: 20,
  mgmtHourlyValue: 45,

  monthlyInvoicingVolume: 120000,
  currentCardRate: 2.9,
  currentAchFee: 1.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Calculation engine
// ─────────────────────────────────────────────────────────────────────────────

function calculateROI(inp: ROIInputs) {
  // --- Current annual costs ---
  const opsManagerAnnual   = inp.hasOpsManager   ? inp.opsMgrSalary    * 1.18 : 0; // +18% benefits
  const schedulersAnnual   = inp.schedulerCount  * inp.schedulerAvgSalary * 1.18;
  const hrAdminAnnual      = inp.hasHrAdmin      ? inp.hrAdminSalary    * 1.18 : 0;
  const payrollCoordAnnual = inp.hasPayrollCoord ? inp.payrollCoordSalary * 1.18 : 0;
  const billingAnnual      = inp.hasBillingPerson ? inp.billingPersonSalary * 1.18 : 0;
  const complianceAnnual   = inp.hasComplianceCoord ? inp.complianceCoordSalary * 1.18 : 0;
  const totalStaffAnnual   = opsManagerAnnual + schedulersAnnual + hrAdminAnnual +
                             payrollCoordAnnual + billingAnnual + complianceAnnual;

  const softwareAnnual = (
    inp.schedulingSoftwareMonthlyCost +
    inp.payrollMonthlyCost +
    inp.hrSoftwareMonthlyCost +
    inp.invoicingSoftwareMonthlyCost +
    inp.complianceSoftwareMonthlyCost +
    inp.otherSoftwareMonthlyCost
  ) * 12;

  const overtimeAnnual   = inp.monthlyOvertimeCost * 12;
  const turnoverCost     = inp.officerCount * (inp.annualTurnoverRate / 100) * inp.replacementCostPerOfficer;
  const complianceCost   = inp.complianceFinesPaid;
  const lostClientCost   = inp.contractsLost * inp.avgContractAnnualValue;
  const ownerTimeCost    = inp.mgmtHoursPerWeek * 52 * inp.mgmtHourlyValue;

  // Payment processing premium
  const annualInvoicingVolume = inp.monthlyInvoicingVolume * 12;
  const currentCardCost   = annualInvoicingVolume * (inp.currentCardRate / 100);
  const coaCardRate       = inp.officerCount <= 100 ? 2.4 : 2.2; // professional vs business
  const coaCardCost       = annualInvoicingVolume * (coaCardRate / 100);
  const cardSavings       = Math.max(0, currentCardCost - coaCardCost);

  const payrollTransactions = inp.payrollEmployeeCount * 24; // 24 payroll runs/yr (bi-weekly)
  const currentAchTotal   = payrollTransactions * inp.currentAchFee;
  const coaAchFee         = inp.officerCount <= 100 ? 0.50 : 0.40;
  const coaAchTotal       = payrollTransactions * coaAchFee;
  const achSavings        = Math.max(0, currentAchTotal - coaAchTotal);

  // Payroll processing premium (per employee per run)
  const runsPerYear = 24;
  const currentPayrollPerEmpPerRun = inp.payrollProvider === "manual" ? 0 : 
                                     inp.payrollProvider === "adp" ? 12 :
                                     inp.payrollProvider === "gusto" ? 9 : 8; // quickbooks
  const coaPayrollPerEmpPerRun     = inp.officerCount <= 100 ? 4.95 : 3.95;
  const payrollPremium = Math.max(0, (currentPayrollPerEmpPerRun - coaPayrollPerEmpPerRun) * inp.payrollEmployeeCount * runsPerYear);

  const totalCurrentAnnual = totalStaffAnnual + softwareAnnual + overtimeAnnual + turnoverCost +
                             complianceCost + lostClientCost + ownerTimeCost;

  // --- What CoAIleague eliminates ---
  const savedOpsManager    = opsManagerAnnual;                          // 100% eliminated
  const savedSchedulers    = schedulersAnnual;                          // 100% eliminated
  const savedHrAdmin       = hrAdminAnnual * 0.60;                     // 60% reduced
  const savedPayrollCoord  = payrollCoordAnnual;                       // 100% eliminated
  const savedBilling       = billingAnnual;                             // 100% eliminated
  const savedCompliance    = complianceAnnual;                         // 100% eliminated
  const savedSchedulingSw  = inp.schedulingSoftwareMonthlyCost * 12;   // eliminated
  const savedPayrollSw     = inp.payrollMonthlyCost * 12;              // eliminated
  const savedInvoicingSw   = inp.invoicingSoftwareMonthlyCost * 12;    // eliminated
  const savedOvertime      = inp.monthlyOvertimeCost * 0.30 * 12;      // 30% reduction
  const savedTurnover      = turnoverCost * 0.25;                      // 25% reduction
  const savedComplFines    = complianceCost * 0.85;                    // 85% prevention rate
  const savedOwnerTime     = ownerTimeCost * 0.65;                     // 65% of time recovered
  const savedCardProcessing = cardSavings;
  const savedAch            = achSavings;
  const savedPayrollFees    = payrollPremium;

  const totalAnnualSavings = savedOpsManager + savedSchedulers + savedHrAdmin + savedPayrollCoord +
    savedBilling + savedCompliance + savedSchedulingSw + savedPayrollSw + savedInvoicingSw +
    savedOvertime + savedTurnover + savedComplFines + savedOwnerTime + savedCardProcessing +
    savedAch + savedPayrollFees;

  // --- CoAIleague annual cost ---
  const tier         = recommendTier(inp.officerCount);
  const tierConfig   = PRICING_TIERS[tier];
  const baseMonthly  = tierConfig.monthlyPrice ?? 0;
  const officersOver = Math.max(0, inp.officerCount - (tierConfig.seatsIncluded ?? 0));
  const officerOverageMonthly = officersOver * (tierConfig.seatOverageMonthly ?? 0);
  const estimatedPayrollFees  = coaPayrollPerEmpPerRun * inp.payrollEmployeeCount * runsPerYear;
  const estimatedCardFees     = coaCardCost;
  const totalAnnualCoaleague  = (baseMonthly + officerOverageMonthly) * 12 + estimatedPayrollFees + estimatedCardFees;

  // --- Net result ---
  const netAnnualSavings  = totalAnnualSavings - totalAnnualCoaleague;
  const roi               = totalAnnualCoaleague > 0 ? (netAnnualSavings / totalAnnualCoaleague) * 100 : 0;
  const paybackDays       = totalAnnualSavings > 0 ? Math.round((totalAnnualCoaleague / totalAnnualSavings) * 365) : 999;

  return {
    // Inputs
    tier, tierConfig, baseMonthly, officersOver, officerOverageMonthly,
    // Current costs breakdown
    totalStaffAnnual, opsManagerAnnual, schedulersAnnual, hrAdminAnnual,
    payrollCoordAnnual, billingAnnual, complianceAnnual,
    softwareAnnual, overtimeAnnual, turnoverCost, complianceCost,
    lostClientCost, ownerTimeCost, totalCurrentAnnual,
    // Savings breakdown
    savedOpsManager, savedSchedulers, savedHrAdmin, savedPayrollCoord,
    savedBilling, savedCompliance, savedSchedulingSw, savedPayrollSw,
    savedInvoicingSw, savedOvertime, savedTurnover, savedComplFines,
    savedOwnerTime, savedCardProcessing, savedAch, savedPayrollFees,
    totalAnnualSavings,
    // CoAIleague cost
    estimatedPayrollFees, estimatedCardFees, totalAnnualCoaleague,
    // Net
    netAnnualSavings, roi, paybackDays,
    // Payroll comparison
    currentPayrollPerEmpPerRun, coaPayrollPerEmpPerRun,
    currentCardRate: inp.currentCardRate, coaCardRate,
    annualInvoicingVolume,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n).toLocaleString()}`;
  return `$${Math.round(n)}`;
}

function pct(n: number): string { return `${Math.round(n)}%`; }

function NumberInput({
  label, value, onChange, prefix = "$", suffix = "", min = 0, step = 1, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; min?: number; step?: number; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-muted-foreground">{prefix}</span>
        )}
        <Input
          type="number"
          value={value || ""}
          min={min}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={prefix ? "pl-7" : ""}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function SavingsRow({ label, amount, note }: { label: string; amount: number; note?: string }) {
  if (amount <= 0) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div>
        <span className="text-sm text-foreground">{label}</span>
        {note && <span className="text-xs text-muted-foreground ml-2">{note}</span>}
      </div>
      <span className="text-sm font-semibold text-green-400">{fmt(amount)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ROICalculator() {
  const [inp, setInp] = useState<ROIInputs>(defaultInputs);
  const [showSection2, setShowSection2] = useState(true);
  const [showSection3, setShowSection3] = useState(true);
  const [showSection4, setShowSection4] = useState(true);

  const update = useCallback(<K extends keyof ROIInputs>(key: K, val: ROIInputs[K]) => {
    setInp(prev => ({ ...prev, [key]: val }));
  }, []);

  const result = calculateROI(inp);
  const isStrategic = result.tier === "strategic";

  return (
    <>
      <SEO
        title={`ROI Calculator — ${PLATFORM_NAME}`}
        description="See exactly how much you save replacing schedulers, HR, payroll, and compliance coordinators with Trinity AI. Real numbers, real savings."
      />
      <UniversalHeader />
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="border-b border-border bg-card py-12">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <Badge variant="secondary" className="mb-4">ROI Calculator</Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              What Trinity Eliminates from Your Books
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              This is not an estimate of savings. It is an accounting of what you are currently paying — and what you stop paying the day Trinity starts.
            </p>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* ── Left: Inputs ── */}
          <div className="lg:col-span-3 space-y-6">

            {/* Section 1 — Team */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5 text-primary" />
                  Your Current Team
                </CardTitle>
                <CardDescription>What Trinity replaces on your payroll</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    label="Security officers"
                    value={inp.officerCount}
                    onChange={v => update("officerCount", v)}
                    prefix=""
                    hint="Active officers on roster"
                  />
                  <NumberInput
                    label="Active client sites"
                    value={inp.clientSites}
                    onChange={v => update("clientSites", v)}
                    prefix=""
                  />
                </div>
                <NumberInput
                  label="States you operate in"
                  value={inp.stateCount}
                  onChange={v => update("stateCount", v)}
                  prefix=""
                  hint="1 state = home state compliance only; 2+ = multi-state"
                />

                <Separator />
                <p className="text-sm font-semibold text-foreground">Operations Staff You Currently Employ</p>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="hasOpsManager"
                      checked={inp.hasOpsManager}
                      onCheckedChange={v => update("hasOpsManager", Boolean(v))}
                      data-testid="checkbox-ops-manager"
                    />
                    <Label htmlFor="hasOpsManager" className="flex-1 cursor-pointer">
                      Operations Manager / Deputy Chief
                    </Label>
                    {inp.hasOpsManager && (
                      <NumberInput
                        label=""
                        value={inp.opsMgrSalary}
                        onChange={v => update("opsMgrSalary", v)}
                        hint="Annual salary"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="hasSchedulers"
                        checked={inp.schedulerCount > 0}
                        onCheckedChange={v => update("schedulerCount", v ? 1 : 0)}
                        data-testid="checkbox-schedulers"
                      />
                      <Label htmlFor="hasSchedulers" className="cursor-pointer">Dedicated Scheduler(s)</Label>
                    </div>
                    {inp.schedulerCount > 0 && (
                      <div className="grid grid-cols-2 gap-3 ml-7">
                        <NumberInput
                          label="How many"
                          value={inp.schedulerCount}
                          onChange={v => update("schedulerCount", v)}
                          prefix=""
                          min={1}
                        />
                        <NumberInput
                          label="Avg annual salary each"
                          value={inp.schedulerAvgSalary}
                          onChange={v => update("schedulerAvgSalary", v)}
                        />
                      </div>
                    )}
                  </div>

                  {[
                    { key: "hasHrAdmin" as keyof ROIInputs, salaryKey: "hrAdminSalary" as keyof ROIInputs, label: "HR Administrator", defSalary: 48000 },
                    { key: "hasPayrollCoord" as keyof ROIInputs, salaryKey: "payrollCoordSalary" as keyof ROIInputs, label: "Payroll Coordinator", defSalary: 44000 },
                    { key: "hasBillingPerson" as keyof ROIInputs, salaryKey: "billingPersonSalary" as keyof ROIInputs, label: "Billing / Invoicing Person", defSalary: 42000 },
                    { key: "hasComplianceCoord" as keyof ROIInputs, salaryKey: "complianceCoordSalary" as keyof ROIInputs, label: "Compliance Coordinator", defSalary: 52000 },
                  ].map(({ key, salaryKey, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Checkbox
                        id={key}
                        checked={Boolean(inp[key])}
                        onCheckedChange={v => update(key, Boolean(v) as ROIInputs[typeof key])}
                        data-testid={`checkbox-${key}`}
                      />
                      <Label htmlFor={key} className="flex-1 cursor-pointer">{label}</Label>
                      {inp[key] && (
                        <NumberInput
                          label=""
                          value={inp[salaryKey] as number}
                          onChange={v => update(salaryKey, v as ROIInputs[typeof salaryKey])}
                          hint="Annual salary"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Section 2 — Software */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setShowSection2(p => !p)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Current Software Costs
                  </span>
                  {showSection2 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
              {showSection2 && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Scheduling software (monthly)"
                      value={inp.schedulingSoftwareMonthlyCost}
                      onChange={v => update("schedulingSoftwareMonthlyCost", v)}
                    />
                    <NumberInput
                      label="HR software (monthly)"
                      value={inp.hrSoftwareMonthlyCost}
                      onChange={v => update("hrSoftwareMonthlyCost", v)}
                    />
                    <NumberInput
                      label="Invoicing software (monthly)"
                      value={inp.invoicingSoftwareMonthlyCost}
                      onChange={v => update("invoicingSoftwareMonthlyCost", v)}
                    />
                    <NumberInput
                      label="Compliance tracking (monthly)"
                      value={inp.complianceSoftwareMonthlyCost}
                      onChange={v => update("complianceSoftwareMonthlyCost", v)}
                    />
                    <NumberInput
                      label="Other workforce software (monthly)"
                      value={inp.otherSoftwareMonthlyCost}
                      onChange={v => update("otherSoftwareMonthlyCost", v)}
                    />
                  </div>
                  <Separator />
                  <p className="text-sm font-semibold text-foreground">Payroll Processing</p>
                  <div className="space-y-1">
                    <Label className="text-sm">Current provider</Label>
                    <Select
                      value={inp.payrollProvider}
                      onValueChange={v => update("payrollProvider", v)}
                    >
                      <SelectTrigger data-testid="select-payroll-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quickbooks">QuickBooks Payroll</SelectItem>
                        <SelectItem value="gusto">Gusto</SelectItem>
                        <SelectItem value="adp">ADP</SelectItem>
                        <SelectItem value="paychex">Paychex</SelectItem>
                        <SelectItem value="manual">Manual / In-house</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Monthly payroll processing cost"
                      value={inp.payrollMonthlyCost}
                      onChange={v => update("payrollMonthlyCost", v)}
                    />
                    <NumberInput
                      label="Employees on payroll"
                      value={inp.payrollEmployeeCount}
                      onChange={v => update("payrollEmployeeCount", v)}
                      prefix=""
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Section 3 — Pain Points */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setShowSection3(p => !p)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-primary" />
                    Current Pain Points
                  </span>
                  {showSection3 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
              {showSection3 && (
                <CardContent className="space-y-4">
                  <NumberInput
                    label="Estimated monthly overtime costs"
                    value={inp.monthlyOvertimeCost}
                    onChange={v => update("monthlyOvertimeCost", v)}
                    hint="Trinity reduces this by an estimated 30%"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Annual employee turnover rate"
                      value={inp.annualTurnoverRate}
                      onChange={v => update("annualTurnoverRate", v)}
                      prefix=""
                      suffix="%"
                      hint="Industry avg: 80–150%"
                    />
                    <NumberInput
                      label="Cost to replace one officer"
                      value={inp.replacementCostPerOfficer}
                      onChange={v => update("replacementCostPerOfficer", v)}
                      hint="Recruiting + training. Default: $4,500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Compliance violations in last 2 years</Label>
                    <Select
                      value={inp.complianceViolationsCategory}
                      onValueChange={v => update("complianceViolationsCategory", v)}
                    >
                      <SelectTrigger data-testid="select-compliance-violations">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="1">1–2 violations</SelectItem>
                        <SelectItem value="3">3–5 violations</SelectItem>
                        <SelectItem value="5">5+ violations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumberInput
                    label="Estimated total fines paid"
                    value={inp.complianceFinesPaid}
                    onChange={v => update("complianceFinesPaid", v)}
                    hint="Leave $0 if none"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Client contracts lost (last 12 mo)"
                      value={inp.contractsLost}
                      onChange={v => update("contractsLost", v)}
                      prefix=""
                    />
                    <NumberInput
                      label="Avg annual value per lost contract"
                      value={inp.avgContractAnnualValue}
                      onChange={v => update("avgContractAnnualValue", v)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Hrs/week you spend on operations"
                      value={inp.mgmtHoursPerWeek}
                      onChange={v => update("mgmtHoursPerWeek", v)}
                      prefix=""
                      suffix="hrs"
                    />
                    <NumberInput
                      label="Your hourly value (salary ÷ 2,080)"
                      value={inp.mgmtHourlyValue}
                      onChange={v => update("mgmtHourlyValue", v)}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Section 4 — Invoicing */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setShowSection4(p => !p)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    Current Invoicing
                  </span>
                  {showSection4 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
              {showSection4 && (
                <CardContent className="space-y-4">
                  <NumberInput
                    label="Monthly invoicing volume"
                    value={inp.monthlyInvoicingVolume}
                    onChange={v => update("monthlyInvoicingVolume", v)}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Current card processing rate"
                      value={inp.currentCardRate}
                      onChange={v => update("currentCardRate", v)}
                      prefix=""
                      suffix="%"
                      hint="e.g. 2.9 for QuickBooks"
                    />
                    <NumberInput
                      label="Current ACH fee per transaction"
                      value={inp.currentAchFee}
                      onChange={v => update("currentAchFee", v)}
                      hint="e.g. $1.50 for QuickBooks"
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* ── Right: Results ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Big numbers */}
            <Card className="border-primary/30 bg-card">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Net Annual Savings</p>
                  <p className="text-4xl font-bold text-green-400">{fmt(result.netAnnualSavings)}</p>
                  <p className="text-sm text-muted-foreground mt-1">per year with {PLATFORM_NAME}</p>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pct(result.roi)}</p>
                    <p className="text-xs text-muted-foreground">First-year ROI</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {result.paybackDays < 365 ? `${result.paybackDays} days` : "Year 2+"}
                    </p>
                    <p className="text-xs text-muted-foreground">Payback period</p>
                  </div>
                </div>
                <div className="bg-muted/40 rounded-md p-3 text-center">
                  <p className="text-xs text-muted-foreground">Recommended plan</p>
                  <p className="text-sm font-semibold text-foreground">
                    {isStrategic ? "Strategic — Contact Us" : `${result.tierConfig.displayName} — ${fmt(result.baseMonthly)}/mo`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Current costs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your Current Annual Overhead</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex justify-between text-sm py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Operations staff (w/ benefits)</span>
                  <span className="font-medium">{fmt(result.totalStaffAnnual)}</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Software stack</span>
                  <span className="font-medium">{fmt(result.softwareAnnual)}</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Overtime waste</span>
                  <span className="font-medium">{fmt(result.overtimeAnnual)}</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Turnover cost</span>
                  <span className="font-medium">{fmt(result.turnoverCost)}</span>
                </div>
                {result.ownerTimeCost > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Your time cost</span>
                    <span className="font-medium">{fmt(result.ownerTimeCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm py-2 font-semibold border-t border-border">
                  <span>Total Annual Overhead</span>
                  <span className="text-red-400">{fmt(result.totalCurrentAnnual)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Savings breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-green-400">What {PLATFORM_NAME} Eliminates</CardTitle>
              </CardHeader>
              <CardContent>
                <SavingsRow label="Operations Manager" amount={result.savedOpsManager} note="eliminated" />
                <SavingsRow label="Schedulers" amount={result.savedSchedulers} note="eliminated" />
                <SavingsRow label="HR Admin" amount={result.savedHrAdmin} note="60% reduced" />
                <SavingsRow label="Payroll Coordinator" amount={result.savedPayrollCoord} note="eliminated" />
                <SavingsRow label="Billing Person" amount={result.savedBilling} note="eliminated" />
                <SavingsRow label="Compliance Coordinator" amount={result.savedCompliance} note="eliminated" />
                <SavingsRow label="Scheduling software" amount={result.savedSchedulingSw} />
                <SavingsRow label="Payroll software" amount={result.savedPayrollSw} />
                <SavingsRow label="Invoicing software" amount={result.savedInvoicingSw} />
                <SavingsRow label="Overtime reduction (30%)" amount={result.savedOvertime} />
                <SavingsRow label="Turnover reduction (25%)" amount={result.savedTurnover} />
                <SavingsRow label="Compliance protection" amount={result.savedComplFines} />
                <SavingsRow label="Owner time recovered" amount={result.savedOwnerTime} />
                <SavingsRow label="Card processing savings" amount={result.savedCardProcessing} />
                <SavingsRow label="ACH savings" amount={result.savedAch} />
                <SavingsRow label="Payroll fee savings" amount={result.savedPayrollFees} />
                <div className="flex justify-between text-sm py-2 font-semibold border-t border-border mt-2">
                  <span>Total Annual Savings</span>
                  <span className="text-green-400">{fmt(result.totalAnnualSavings)}</span>
                </div>
              </CardContent>
            </Card>

            {/* CoAIleague cost */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your {PLATFORM_NAME} Investment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">
                    {isStrategic ? "Strategic" : `${result.tierConfig.displayName} base`}
                  </span>
                  <span>{isStrategic ? "Custom" : fmt((result.baseMonthly + result.officerOverageMonthly) * 12)}</span>
                </div>
                {result.estimatedPayrollFees > 0 && (
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Payroll service fees (est.)</span>
                    <span>{fmt(result.estimatedPayrollFees)}</span>
                  </div>
                )}
                {result.estimatedCardFees > 0 && (
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Payment processing (est.)</span>
                    <span>{fmt(result.estimatedCardFees)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 font-semibold border-t border-border">
                  <span>Total Annual Investment</span>
                  <span>{isStrategic ? "Custom" : fmt(result.totalAnnualCoaleague)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Payroll comparison */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payroll Processing — You vs {PLATFORM_NAME}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium"></th>
                        <th className="text-right py-2 text-muted-foreground font-medium">You Pay Now</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">{PLATFORM_NAME}</th>
                        <th className="text-right py-2 text-muted-foreground font-medium text-green-400">You Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/40">
                        <td className="py-2">Per employee/run</td>
                        <td className="text-right py-2">${result.currentPayrollPerEmpPerRun.toFixed(2)}</td>
                        <td className="text-right py-2">${result.coaPayrollPerEmpPerRun.toFixed(2)}</td>
                        <td className="text-right py-2 text-green-400">
                          ${(result.currentPayrollPerEmpPerRun - result.coaPayrollPerEmpPerRun).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2">Annual savings</td>
                        <td className="text-right py-2"></td>
                        <td className="text-right py-2"></td>
                        <td className="text-right py-2 font-semibold text-green-400">
                          {fmt(result.savedPayrollFees)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {PLATFORM_NAME} processes payroll internally — no QuickBooks, no Gusto, no ADP.
                  You get the same direct deposit, tax filing, and year-end forms at 60–75% less cost.
                </p>
              </CardContent>
            </Card>

            {/* CTA */}
            <div className="space-y-3">
              {isStrategic ? (
                <Link href="/pricing">
                  <Button className="w-full" size="lg" data-testid="button-get-strategic-quote">
                    Get Strategic Quote
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <Link href="/register">
                  <Button className="w-full" size="lg" data-testid="button-start-trial">
                    Start Free 14-Day Trial — No Credit Card Required
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              )}
              <Link href="/pricing">
                <Button variant="outline" className="w-full" data-testid="button-view-pricing">
                  View Full Pricing
                </Button>
              </Link>
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Estimates based on industry averages. Your actual savings may be higher.
                Critical operations (panic alerts, incidents, compliance) never stop
                regardless of usage — no hard cutoffs.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
