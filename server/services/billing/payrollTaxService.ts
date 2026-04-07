import {
  getTaxRules,
  computeFederalWithholding as registryComputeFederal,
  computeProgressiveStateTax,
  PAY_PERIODS_PER_YEAR as REGISTRY_PAY_PERIODS,
  TAX_REGISTRY_VERSION,
  TAX_REGISTRY_EFFECTIVE_YEAR,
} from '../tax/taxRulesRegistry';

export type FilingStatus = 'single' | 'married_jointly' | 'married_separately' | 'head_of_household';
export type PayPeriod = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface PayrollTaxInput {
  grossWage: number;
  state: string;
  payPeriod?: PayPeriod;
  filingStatus?: FilingStatus;
  allowances?: number;
  additionalWithholding?: number;
  ytdSocialSecurity?: number;
  ytdMedicareWages?: number;
}

export interface PayrollTaxBreakdown {
  grossWage: number;
  federalWithholding: number;
  socialSecurity: number;
  medicare: number;
  stateWithholding: number;
  totalDeductions: number;
  netWage: number;
  effectiveTaxRate: number;
  taxRegistryVersion: string;
  taxYear: number;
  details: {
    ssWageBasis: number;
    ssRate: number;
    medicareRate: number;
    additionalMedicareRate: number;
    stateCode: string;
    stateHasIncomeTax: boolean;
    filingStatus: FilingStatus;
    annualizedGross: number;
  };
}

function computeStateWithholding(
  grossWage: number,
  stateCode: string,
  payPeriod: PayPeriod
): { withholding: number; hasIncomeTax: boolean } {
  const rules = getTaxRules();
  const stateRule = rules.stateTaxRules[stateCode];

  if (!stateRule || stateRule.type === 'none') {
    return { withholding: 0, hasIncomeTax: false };
  }

  const periodsPerYear = REGISTRY_PAY_PERIODS[payPeriod];

  if (stateRule.type === 'flat' && stateRule.rate != null) {
    return {
      withholding: Math.round(grossWage * stateRule.rate * 100) / 100,
      hasIncomeTax: true,
    };
  }

  if (stateRule.type === 'progressive') {
    const annualGross = grossWage * periodsPerYear;
    const annualTax = computeProgressiveStateTax(annualGross, stateCode);
    return {
      withholding: Math.round((annualTax / periodsPerYear) * 100) / 100,
      hasIncomeTax: true,
    };
  }

  return { withholding: 0, hasIncomeTax: false };
}

export function calculatePayrollTaxes(input: PayrollTaxInput): PayrollTaxBreakdown {
  const {
    grossWage,
    state,
    payPeriod = 'biweekly',
    filingStatus = 'single',
    allowances = 0,
    additionalWithholding = 0,
    ytdSocialSecurity = 0,
    ytdMedicareWages = 0,
  } = input;

  const rules = getTaxRules();
  const periodsPerYear = REGISTRY_PAY_PERIODS[payPeriod];
  const annualGross = grossWage * periodsPerYear;
  const stateCode = state.toUpperCase().trim().slice(0, 2);

  const { ssRate, medicareRate, additionalMedicareRate, ssWageBase,
    additionalMedicareThresholdSingle } = rules.fica;

  const ssWageBasis = Math.min(grossWage, Math.max(0, ssWageBase - ytdSocialSecurity));
  const socialSecurity = Math.round(ssWageBasis * ssRate * 100) / 100;
  const medicare = Math.round(grossWage * medicareRate * 100) / 100;

  const additionalMedicareThreshold = additionalMedicareThresholdSingle;

  let additionalMedicare = 0;
  const cumulativeMedicareWages = ytdMedicareWages + grossWage;
  if (cumulativeMedicareWages > additionalMedicareThreshold) {
    const wagesOverThreshold = Math.min(grossWage, cumulativeMedicareWages - additionalMedicareThreshold);
    additionalMedicare = Math.round(wagesOverThreshold * additionalMedicareRate * 100) / 100;
  }
  const totalMedicare = medicare + additionalMedicare;

  const standardDeduction = rules.standardDeductions[filingStatus];
  const withholdingAllowance = rules.withholdingAllowanceValue * allowances;
  const annualTaxableIncome = Math.max(0, annualGross - standardDeduction - withholdingAllowance);
  const annualFederal = registryComputeFederal(annualTaxableIncome, filingStatus);
  const federalWithholding = Math.round((annualFederal / periodsPerYear + additionalWithholding) * 100) / 100;

  const { withholding: stateWithholding, hasIncomeTax: stateHasIncomeTax } = computeStateWithholding(grossWage, stateCode, payPeriod);

  const totalDeductions = federalWithholding + socialSecurity + totalMedicare + stateWithholding;
  const netWage = Math.round((grossWage - totalDeductions) * 100) / 100;

  return {
    grossWage,
    federalWithholding,
    socialSecurity,
    medicare: totalMedicare,
    stateWithholding,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netWage,
    effectiveTaxRate: grossWage > 0 ? Math.round(totalDeductions / grossWage * 10000) / 100 : 0,
    taxRegistryVersion: TAX_REGISTRY_VERSION,
    taxYear: TAX_REGISTRY_EFFECTIVE_YEAR,
    details: {
      ssWageBasis,
      ssRate,
      medicareRate,
      additionalMedicareRate: additionalMedicare > 0 ? additionalMedicareRate : 0,
      stateCode,
      stateHasIncomeTax,
      filingStatus,
      annualizedGross: annualGross,
    },
  };
}
