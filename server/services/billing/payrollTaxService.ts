import {
  getTaxRules,
  computeFederalWithholding as registryComputeFederal,
  computeProgressiveStateTax,
  PAY_PERIODS_PER_YEAR as REGISTRY_PAY_PERIODS,
  TAX_REGISTRY_VERSION,
  TAX_REGISTRY_EFFECTIVE_YEAR,
} from '../tax/taxRulesRegistry';
import {
  addFinancialValues,
  divideFinancialValues,
  formatCurrency,
  multiplyFinancialValues,
  subtractFinancialValues,
  sumFinancialValues,
  toFinancialString,
} from '../financialCalculator';

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

function asMoneyNumber(value: string | number): number {
  return Number(formatCurrency(toFinancialString(value)));
}

function multiplyMoney(a: string | number, b: string | number): number {
  return asMoneyNumber(multiplyFinancialValues(toFinancialString(a), toFinancialString(b)));
}

function divideMoney(a: string | number, b: string | number): number {
  return asMoneyNumber(divideFinancialValues(toFinancialString(a), toFinancialString(b)));
}

function addMoney(a: string | number, b: string | number): number {
  return asMoneyNumber(addFinancialValues(toFinancialString(a), toFinancialString(b)));
}

function subtractMoney(a: string | number, b: string | number): number {
  return asMoneyNumber(subtractFinancialValues(toFinancialString(a), toFinancialString(b)));
}

function sumMoney(values: Array<string | number>): number {
  return asMoneyNumber(sumFinancialValues(values.map(toFinancialString)));
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
      withholding: multiplyMoney(grossWage, stateRule.rate),
      hasIncomeTax: true,
    };
  }

  if (stateRule.type === 'progressive') {
    const annualGross = Number(multiplyFinancialValues(toFinancialString(grossWage), toFinancialString(periodsPerYear)));
    const annualTax = computeProgressiveStateTax(annualGross, stateCode);
    return {
      withholding: divideMoney(annualTax, periodsPerYear),
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
  const annualGross = Number(multiplyFinancialValues(toFinancialString(grossWage), toFinancialString(periodsPerYear)));
  const stateCode = state.toUpperCase().trim().slice(0, 2);

  const { ssRate, medicareRate, additionalMedicareRate, ssWageBase,
    additionalMedicareThresholdSingle } = rules.fica;

  const ssWageBasis = Math.min(grossWage, Math.max(0, ssWageBase - ytdSocialSecurity));
  const socialSecurity = multiplyMoney(ssWageBasis, ssRate);
  const medicare = multiplyMoney(grossWage, medicareRate);

  const additionalMedicareThreshold = additionalMedicareThresholdSingle;

  let additionalMedicare = 0;
  const cumulativeMedicareWages = ytdMedicareWages + grossWage;
  if (cumulativeMedicareWages > additionalMedicareThreshold) {
    const wagesOverThreshold = Math.min(grossWage, cumulativeMedicareWages - additionalMedicareThreshold);
    additionalMedicare = multiplyMoney(wagesOverThreshold, additionalMedicareRate);
  }
  const totalMedicare = sumMoney([medicare, additionalMedicare]);

  const standardDeduction = rules.standardDeductions[filingStatus];
  const withholdingAllowance = multiplyMoney(rules.withholdingAllowanceValue, allowances);
  const annualTaxableIncome = Math.max(0, subtractMoney(subtractMoney(annualGross, standardDeduction), withholdingAllowance));
  const annualFederal = registryComputeFederal(annualTaxableIncome, filingStatus);
  const federalWithholding = addMoney(divideMoney(annualFederal, periodsPerYear), additionalWithholding);

  const { withholding: stateWithholding, hasIncomeTax: stateHasIncomeTax } = computeStateWithholding(grossWage, stateCode, payPeriod);

  const totalDeductions = sumMoney([federalWithholding, socialSecurity, totalMedicare, stateWithholding]);
  const netWage = subtractMoney(grossWage, totalDeductions);
  const effectiveTaxRate = grossWage > 0
    ? asMoneyNumber(multiplyFinancialValues(
        divideFinancialValues(toFinancialString(totalDeductions), toFinancialString(grossWage)),
        toFinancialString(100),
      ))
    : 0;

  return {
    grossWage,
    federalWithholding,
    socialSecurity,
    medicare: totalMedicare,
    stateWithholding,
    totalDeductions,
    netWage,
    effectiveTaxRate,
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
