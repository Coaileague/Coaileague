import { BILLING, getMiddlewareFees, getCompetitorPricing, type TierKey } from "@shared/billingConfig";
import { storage } from "../../storage";

export interface InvoiceFeeResult {
  platformFee: number;
  processingFee: number;
  totalFee: number;
  netToOrg: number;
}

export interface PayrollFeeResult {
  baseMonthly: number;
  perEmployeeFee: number;
  totalMonthly: number;
  employeeCount: number;
}

export interface CompetitorComparisonEntry {
  name: string;
  invoiceRate: number | null;
  invoiceFlatCents: number | null;
  achRate: number | null;
  achCapCents: number | null;
  payrollBase: number;
  payrollPerEmployee: number;
  payrollProviderName: string;
}

export interface CompetitorComparison {
  coaileague: {
    invoiceRatePercent: number;
    invoiceFlatCents: number;
    achRatePercent: number;
    achCapCents: number;
    payrollBaseMonthly: number;
    payrollPerEmployee: number;
    tierDiscount: number;
  };
  competitors: Record<string, CompetitorComparisonEntry>;
  savings: {
    vsQuickbooks: { invoiceSavingsPercent: number; payrollSavingsPercent: number };
    vsGusto: { payrollSavingsPercent: number };
    vsPatriot: { payrollSavingsPercent: number };
    vsSquare: { invoiceSavingsPercent: number; payrollSavingsPercent: number };
    maxSavingsPercent: number;
  };
}

export function calculateInvoiceFee(amountCents: number, tier: TierKey): InvoiceFeeResult {
  const fees = getMiddlewareFees(tier);
  const rate = fees.invoiceProcessing.ratePercent / 100;
  const flatFee = fees.invoiceProcessing.flatFeeCents;

  const processingFee = Math.round(amountCents * rate) + flatFee;
  const platformFee = Math.round(fees.stripePayouts.ratePercent / 100 * amountCents);
  const totalFee = processingFee + platformFee;
  const netToOrg = amountCents - totalFee;

  return { platformFee, processingFee, totalFee, netToOrg };
}

export function calculatePayrollFee(employeeCount: number, tier: TierKey): PayrollFeeResult {
  const fees = getMiddlewareFees(tier);
  const baseMonthly = fees.payrollMiddleware.baseMonthly;
  const perEmployeeFee = fees.payrollMiddleware.perEmployeeCents * employeeCount;
  const totalMonthly = baseMonthly + perEmployeeFee;

  return { baseMonthly, perEmployeeFee, totalMonthly, employeeCount };
}

export function getCompetitorComparison(tier: TierKey): CompetitorComparison {
  const fees = getMiddlewareFees(tier);
  const competitors = getCompetitorPricing();

  const coaileaguePayrollPer = fees.payrollMiddleware.perEmployeeCents;
  const qb = competitors.quickbooks;
  const gusto = competitors.gusto;
  const patriot = competitors.patriot;
  const square = competitors.square;

  const payrollSavingsVsQB = qb.payrollPerEmployee > 0
    ? Math.round((1 - coaileaguePayrollPer / qb.payrollPerEmployee) * 100)
    : 0;
  const payrollSavingsVsGusto = gusto.payrollPerEmployee > 0
    ? Math.round((1 - coaileaguePayrollPer / gusto.payrollPerEmployee) * 100)
    : 0;
  const payrollSavingsVsPatriot = patriot.payrollPerEmployee > 0
    ? Math.round((1 - coaileaguePayrollPer / patriot.payrollPerEmployee) * 100)
    : 0;
  const payrollSavingsVsSquare = square.payrollPerEmployee > 0
    ? Math.round((1 - coaileaguePayrollPer / square.payrollPerEmployee) * 100)
    : 0;

  const invoiceSavingsVsQB = qb.invoiceRate
    ? Math.round((1 - fees.invoiceProcessing.ratePercent / qb.invoiceRate) * 100)
    : 0;
  const invoiceSavingsVsSquare = square.invoiceRate
    ? Math.round((1 - fees.invoiceProcessing.ratePercent / square.invoiceRate) * 100)
    : 0;

  const maxSavingsPercent = Math.max(
    payrollSavingsVsQB,
    payrollSavingsVsGusto,
    payrollSavingsVsPatriot,
    payrollSavingsVsSquare,
    invoiceSavingsVsSquare,
  );

  return {
    coaileague: {
      invoiceRatePercent: fees.invoiceProcessing.ratePercent,
      invoiceFlatCents: fees.invoiceProcessing.flatFeeCents,
      achRatePercent: fees.achPayments.ratePercent,
      achCapCents: fees.achPayments.capCents,
      payrollBaseMonthly: fees.payrollMiddleware.baseMonthly,
      payrollPerEmployee: fees.payrollMiddleware.perEmployeeCents,
      tierDiscount: fees.tierDiscount,
    },
    competitors: competitors as unknown as Record<string, CompetitorComparisonEntry>,
    savings: {
      vsQuickbooks: { invoiceSavingsPercent: invoiceSavingsVsQB, payrollSavingsPercent: payrollSavingsVsQB },
      vsGusto: { payrollSavingsPercent: payrollSavingsVsGusto },
      vsPatriot: { payrollSavingsPercent: payrollSavingsVsPatriot },
      vsSquare: { invoiceSavingsPercent: invoiceSavingsVsSquare, payrollSavingsPercent: payrollSavingsVsSquare },
      maxSavingsPercent,
    },
  };
}

export async function recordMiddlewareFeeCharge(
  workspaceId: string,
  feeType: string,
  amountCents: number,
  sourceId?: string,
  feePercentage?: number,
): Promise<void> {
  await storage.createPlatformRevenue({
    workspaceId,
    revenueType: feeType,
    sourceId: sourceId ?? null,
    amount: (amountCents / 100).toFixed(2),
    feePercentage: feePercentage != null ? feePercentage.toFixed(2) : null,
    status: "collected",
    collectedAt: new Date(),
  });
}
