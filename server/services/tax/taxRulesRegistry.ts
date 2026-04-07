import type { FilingStatus, PayPeriod } from '../billing/payrollTaxService';
import { createLogger } from '../../lib/logger';
const log = createLogger('taxRulesRegistry');


export const TAX_REGISTRY_VERSION = '2025.1';
export const TAX_REGISTRY_LAST_VERIFIED = '2025-12-15';
export const TAX_REGISTRY_EFFECTIVE_YEAR = 2025;

export interface TaxBracket {
  floor: number;
  ceiling: number;
  baseAmount: number;
  rate: number;
}

export interface StateBracket {
  limit: number;
  rate: number;
}

export interface StateTaxRule {
  type: 'none' | 'flat' | 'progressive';
  rate?: number;
  brackets?: StateBracket[];
  standardDeduction?: number;
  personalExemption?: number;
  notes?: string;
}

export interface LocalTaxRule {
  rate: number;
  type: 'resident' | 'worker' | 'both';
  name: string;
  state: string;
}

export interface FICAConstants {
  ssRate: number;
  medicareRate: number;
  additionalMedicareRate: number;
  ssWageBase: number;
  additionalMedicareThresholdSingle: number;
  additionalMedicareThresholdMarried: number;
}

export interface FUTAConstants {
  grossRate: number;
  maxSUTACredit: number;
  netRate: number;
  wageBase: number;
}

export interface SUTADefaults {
  newEmployerRate: number;
  wageBase: number;
  state: string;
}

export interface TaxYearRuleSet {
  year: number;
  version: string;
  lastVerified: string;
  source: string;
  fica: FICAConstants;
  futa: FUTAConstants;
  standardDeductions: Record<FilingStatus, number>;
  withholdingAllowanceValue: number;
  federalBrackets: Record<FilingStatus, TaxBracket[]>;
  stateTaxRules: Record<string, StateTaxRule>;
  localTaxRules: Record<string, LocalTaxRule>;
  reciprocalAgreements: Record<string, string[]>;
  sutaDefaults: SUTADefaults[];
  creditReductionStates: string[];
}

const FICA_2025: FICAConstants = {
  ssRate: 0.062,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  ssWageBase: 176100,
  additionalMedicareThresholdSingle: 200000,
  additionalMedicareThresholdMarried: 250000,
};

const FUTA_2025: FUTAConstants = {
  grossRate: 0.06,
  maxSUTACredit: 0.054,
  netRate: 0.006,
  wageBase: 7000,
};

const STANDARD_DEDUCTIONS_2025: Record<FilingStatus, number> = {
  single: 15000,
  married_jointly: 30000,
  married_separately: 15000,
  head_of_household: 22500,
};

const FEDERAL_BRACKETS_2025: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { floor: 0,       ceiling: 11925,   baseAmount: 0,       rate: 0.10 },
    { floor: 11925,   ceiling: 48475,   baseAmount: 1192.50, rate: 0.12 },
    { floor: 48475,   ceiling: 103350,  baseAmount: 5578.50, rate: 0.22 },
    { floor: 103350,  ceiling: 197300,  baseAmount: 17651,   rate: 0.24 },
    { floor: 197300,  ceiling: 250525,  baseAmount: 40199,   rate: 0.32 },
    { floor: 250525,  ceiling: 626350,  baseAmount: 57231,   rate: 0.35 },
    { floor: 626350,  ceiling: Infinity, baseAmount: 188769.75, rate: 0.37 },
  ],
  married_jointly: [
    { floor: 0,       ceiling: 23850,   baseAmount: 0,       rate: 0.10 },
    { floor: 23850,   ceiling: 96950,   baseAmount: 2385,    rate: 0.12 },
    { floor: 96950,   ceiling: 206700,  baseAmount: 11157,   rate: 0.22 },
    { floor: 206700,  ceiling: 394600,  baseAmount: 35302,   rate: 0.24 },
    { floor: 394600,  ceiling: 501050,  baseAmount: 80398,   rate: 0.32 },
    { floor: 501050,  ceiling: 751600,  baseAmount: 114462,  rate: 0.35 },
    { floor: 751600,  ceiling: Infinity, baseAmount: 202154.50, rate: 0.37 },
  ],
  married_separately: [
    { floor: 0,       ceiling: 11925,   baseAmount: 0,       rate: 0.10 },
    { floor: 11925,   ceiling: 48475,   baseAmount: 1192.50, rate: 0.12 },
    { floor: 48475,   ceiling: 103350,  baseAmount: 5578.50, rate: 0.22 },
    { floor: 103350,  ceiling: 197300,  baseAmount: 17651,   rate: 0.24 },
    { floor: 197300,  ceiling: 250525,  baseAmount: 40199,   rate: 0.32 },
    { floor: 250525,  ceiling: 375800,  baseAmount: 57231,   rate: 0.35 },
    { floor: 375800,  ceiling: Infinity, baseAmount: 101077.25, rate: 0.37 },
  ],
  head_of_household: [
    { floor: 0,       ceiling: 17000,   baseAmount: 0,       rate: 0.10 },
    { floor: 17000,   ceiling: 64850,   baseAmount: 1700,    rate: 0.12 },
    { floor: 64850,   ceiling: 103350,  baseAmount: 7442,    rate: 0.22 },
    { floor: 103350,  ceiling: 197300,  baseAmount: 15912,   rate: 0.24 },
    { floor: 197300,  ceiling: 250500,  baseAmount: 38460,   rate: 0.32 },
    { floor: 250500,  ceiling: 626350,  baseAmount: 55484,   rate: 0.35 },
    { floor: 626350,  ceiling: Infinity, baseAmount: 187031.50, rate: 0.37 },
  ],
};

const STATE_TAX_RULES_2025: Record<string, StateTaxRule> = {
  AK: { type: 'none' },
  FL: { type: 'none' },
  NV: { type: 'none' },
  NH: { type: 'none', notes: 'Interest/dividends only, not wages' },
  SD: { type: 'none' },
  TN: { type: 'none' },
  TX: { type: 'none' },
  WA: { type: 'none' },
  WY: { type: 'none' },

  AZ: { type: 'flat', rate: 0.025 },
  CO: { type: 'flat', rate: 0.044 },
  GA: { type: 'flat', rate: 0.0539, notes: '2025: reduced from 5.49% to 5.39%' },
  IL: { type: 'flat', rate: 0.0495 },
  IN: { type: 'flat', rate: 0.0300, notes: '2025: reduced from 3.05% to 3.00%' },
  KY: { type: 'flat', rate: 0.04 },
  MA: { type: 'flat', rate: 0.05, notes: 'Plus 4% surtax on income over $1M (not applied in withholding)' },
  MI: { type: 'flat', rate: 0.0425 },
  NC: { type: 'flat', rate: 0.045, notes: '2025: reduced from 4.75% to 4.50%' },
  PA: { type: 'flat', rate: 0.0307 },
  UT: { type: 'flat', rate: 0.0465 },

  AL: { type: 'progressive', brackets: [
    { limit: 500, rate: 0.02 },
    { limit: 3000, rate: 0.04 },
    { limit: Infinity, rate: 0.05 },
  ]},
  AR: { type: 'progressive', brackets: [
    { limit: 4400, rate: 0.02 },
    { limit: 8800, rate: 0.04 },
    { limit: Infinity, rate: 0.039, },
  ], notes: '2025: top rate reduced to 3.9%' },
  CA: { type: 'progressive', brackets: [
    { limit: 10756, rate: 0.01 },
    { limit: 25499, rate: 0.02 },
    { limit: 40245, rate: 0.04 },
    { limit: 55866, rate: 0.06 },
    { limit: 70602, rate: 0.08 },
    { limit: 360659, rate: 0.093 },
    { limit: 432791, rate: 0.103 },
    { limit: 721314, rate: 0.113 },
    { limit: Infinity, rate: 0.123 },
  ], notes: '2025 inflation-adjusted brackets' },
  CT: { type: 'progressive', brackets: [
    { limit: 10000, rate: 0.02 },
    { limit: 50000, rate: 0.045 },
    { limit: 100000, rate: 0.055 },
    { limit: 200000, rate: 0.06 },
    { limit: 250000, rate: 0.065 },
    { limit: 500000, rate: 0.069 },
    { limit: Infinity, rate: 0.0699 },
  ]},
  DE: { type: 'progressive', brackets: [
    { limit: 2000, rate: 0.0 },
    { limit: 5000, rate: 0.022 },
    { limit: 10000, rate: 0.039 },
    { limit: 20000, rate: 0.048 },
    { limit: 25000, rate: 0.052 },
    { limit: 60000, rate: 0.0555 },
    { limit: Infinity, rate: 0.066 },
  ]},
  DC: { type: 'progressive', brackets: [
    { limit: 10000, rate: 0.04 },
    { limit: 40000, rate: 0.06 },
    { limit: 60000, rate: 0.065 },
    { limit: 250000, rate: 0.085 },
    { limit: 500000, rate: 0.0925 },
    { limit: Infinity, rate: 0.1075 },
  ]},
  HI: { type: 'progressive', brackets: [
    { limit: 2400, rate: 0.014 },
    { limit: 4800, rate: 0.032 },
    { limit: 9600, rate: 0.055 },
    { limit: 14400, rate: 0.064 },
    { limit: 19200, rate: 0.068 },
    { limit: 24000, rate: 0.072 },
    { limit: 36000, rate: 0.076 },
    { limit: 48000, rate: 0.079 },
    { limit: 150000, rate: 0.0825 },
    { limit: 175000, rate: 0.09 },
    { limit: 200000, rate: 0.10 },
    { limit: Infinity, rate: 0.11 },
  ]},
  ID: { type: 'progressive', brackets: [
    { limit: 4489, rate: 0.01 },
    { limit: Infinity, rate: 0.058 },
  ]},
  IA: { type: 'progressive', brackets: [
    { limit: 6210, rate: 0.044 },
    { limit: 31050, rate: 0.0482 },
    { limit: 62100, rate: 0.057 },
    { limit: Infinity, rate: 0.06 },
  ], notes: '2025: Iowa continues phase-down toward flat tax' },
  KS: { type: 'progressive', brackets: [
    { limit: 15000, rate: 0.031 },
    { limit: 30000, rate: 0.0525 },
    { limit: Infinity, rate: 0.057 },
  ]},
  LA: { type: 'progressive', brackets: [
    { limit: 12500, rate: 0.0185 },
    { limit: 50000, rate: 0.035 },
    { limit: Infinity, rate: 0.0425 },
  ]},
  ME: { type: 'progressive', brackets: [
    { limit: 25050, rate: 0.058 },
    { limit: 59450, rate: 0.0675 },
    { limit: Infinity, rate: 0.0715 },
  ], notes: '2025 inflation-adjusted' },
  MD: { type: 'progressive', brackets: [
    { limit: 1000, rate: 0.02 },
    { limit: 2000, rate: 0.03 },
    { limit: 3000, rate: 0.04 },
    { limit: 100000, rate: 0.0475 },
    { limit: 125000, rate: 0.05 },
    { limit: 150000, rate: 0.0525 },
    { limit: 250000, rate: 0.055 },
    { limit: Infinity, rate: 0.0575 },
  ]},
  MN: { type: 'progressive', brackets: [
    { limit: 31690, rate: 0.0535 },
    { limit: 104090, rate: 0.068 },
    { limit: 193240, rate: 0.0785 },
    { limit: Infinity, rate: 0.0985 },
  ], notes: '2025 inflation-adjusted' },
  MS: { type: 'progressive', brackets: [
    { limit: 10000, rate: 0.0 },
    { limit: Infinity, rate: 0.044 },
  ], notes: '2025: reduced from 4.7% to 4.4%' },
  MO: { type: 'progressive', brackets: [
    { limit: 1207, rate: 0.02 },
    { limit: 2414, rate: 0.025 },
    { limit: 3621, rate: 0.03 },
    { limit: 4828, rate: 0.035 },
    { limit: 6035, rate: 0.04 },
    { limit: Infinity, rate: 0.048 },
  ], notes: '2025: top rate reduced from 4.95% to 4.8%' },
  MT: { type: 'progressive', brackets: [
    { limit: 20500, rate: 0.047 },
    { limit: Infinity, rate: 0.059 },
  ]},
  NE: { type: 'progressive', brackets: [
    { limit: 3700, rate: 0.0246 },
    { limit: 22170, rate: 0.0351 },
    { limit: 35730, rate: 0.0501 },
    { limit: Infinity, rate: 0.0527 },
  ], notes: '2025: top rate reduced from 5.84% to 5.27%' },
  NJ: { type: 'progressive', brackets: [
    { limit: 20000, rate: 0.014 },
    { limit: 35000, rate: 0.0175 },
    { limit: 40000, rate: 0.035 },
    { limit: 75000, rate: 0.05525 },
    { limit: 500000, rate: 0.0637 },
    { limit: 1000000, rate: 0.0897 },
    { limit: Infinity, rate: 0.1075 },
  ]},
  NM: { type: 'progressive', brackets: [
    { limit: 5500, rate: 0.017 },
    { limit: 11000, rate: 0.032 },
    { limit: 16000, rate: 0.047 },
    { limit: 210000, rate: 0.049 },
    { limit: Infinity, rate: 0.059 },
  ]},
  NY: { type: 'progressive', brackets: [
    { limit: 8500, rate: 0.04 },
    { limit: 11700, rate: 0.045 },
    { limit: 13900, rate: 0.0525 },
    { limit: 80650, rate: 0.055 },
    { limit: 215400, rate: 0.06 },
    { limit: 1077550, rate: 0.0685 },
    { limit: 5000000, rate: 0.0965 },
    { limit: Infinity, rate: 0.109 },
  ]},
  ND: { type: 'progressive', brackets: [
    { limit: 44725, rate: 0.0195 },
    { limit: 225975, rate: 0.0252 },
    { limit: Infinity, rate: 0.0264 },
  ]},
  OH: { type: 'progressive', brackets: [
    { limit: 26050, rate: 0.0 },
    { limit: 46100, rate: 0.0275 },
    { limit: 92150, rate: 0.03 },
    { limit: Infinity, rate: 0.035 },
  ]},
  OK: { type: 'progressive', brackets: [
    { limit: 1000, rate: 0.0025 },
    { limit: 2500, rate: 0.0075 },
    { limit: 3750, rate: 0.0175 },
    { limit: 4900, rate: 0.0275 },
    { limit: 7200, rate: 0.0375 },
    { limit: Infinity, rate: 0.0475 },
  ]},
  OR: { type: 'progressive', brackets: [
    { limit: 4050, rate: 0.0475 },
    { limit: 10200, rate: 0.0675 },
    { limit: 125000, rate: 0.0875 },
    { limit: Infinity, rate: 0.099 },
  ]},
  RI: { type: 'progressive', brackets: [
    { limit: 77450, rate: 0.0375 },
    { limit: 176050, rate: 0.0475 },
    { limit: Infinity, rate: 0.0599 },
  ], notes: '2025 inflation-adjusted' },
  SC: { type: 'progressive', brackets: [
    { limit: 3200, rate: 0.0 },
    { limit: 6410, rate: 0.03 },
    { limit: 9620, rate: 0.04 },
    { limit: 12820, rate: 0.05 },
    { limit: 16040, rate: 0.06 },
    { limit: Infinity, rate: 0.064 },
  ]},
  VT: { type: 'progressive', brackets: [
    { limit: 47000, rate: 0.0335 },
    { limit: 114000, rate: 0.066 },
    { limit: 237950, rate: 0.076 },
    { limit: Infinity, rate: 0.0875 },
  ], notes: '2025 inflation-adjusted' },
  VA: { type: 'progressive', brackets: [
    { limit: 3000, rate: 0.02 },
    { limit: 5000, rate: 0.03 },
    { limit: 17000, rate: 0.05 },
    { limit: Infinity, rate: 0.0575 },
  ]},
  WV: { type: 'progressive', brackets: [
    { limit: 10000, rate: 0.0236 },
    { limit: 25000, rate: 0.0315 },
    { limit: 40000, rate: 0.0354 },
    { limit: 60000, rate: 0.0472 },
    { limit: Infinity, rate: 0.0512 },
  ]},
  WI: { type: 'progressive', brackets: [
    { limit: 14320, rate: 0.035 },
    { limit: 28640, rate: 0.044 },
    { limit: 315310, rate: 0.053 },
    { limit: Infinity, rate: 0.0765 },
  ]},
};

const LOCAL_TAX_RULES_2025: Record<string, LocalTaxRule> = {
  NYC: { rate: 0.03876, type: 'resident', name: 'New York City', state: 'NY' },
  YONKERS: { rate: 0.01959, type: 'resident', name: 'Yonkers', state: 'NY' },
  PHL: { rate: 0.03712, type: 'both', name: 'Philadelphia', state: 'PA' },
  PITTSBURGH: { rate: 0.03, type: 'both', name: 'Pittsburgh', state: 'PA' },
  SCRANTON: { rate: 0.024, type: 'both', name: 'Scranton', state: 'PA' },
  ALLENTOWN: { rate: 0.0175, type: 'both', name: 'Allentown', state: 'PA' },
  READING: { rate: 0.0327, type: 'both', name: 'Reading', state: 'PA' },
  ERIE: { rate: 0.0175, type: 'both', name: 'Erie', state: 'PA' },
  CLEVELAND: { rate: 0.025, type: 'worker', name: 'Cleveland', state: 'OH' },
  COLUMBUS: { rate: 0.025, type: 'worker', name: 'Columbus', state: 'OH' },
  CINCINNATI: { rate: 0.0212, type: 'worker', name: 'Cincinnati', state: 'OH' },
  TOLEDO: { rate: 0.025, type: 'worker', name: 'Toledo', state: 'OH' },
  AKRON: { rate: 0.025, type: 'worker', name: 'Akron', state: 'OH' },
  DAYTON: { rate: 0.025, type: 'worker', name: 'Dayton', state: 'OH' },
  YOUNGSTOWN: { rate: 0.0275, type: 'worker', name: 'Youngstown', state: 'OH' },
  DETROIT: { rate: 0.024, type: 'both', name: 'Detroit', state: 'MI' },
  GRAND_RAPIDS: { rate: 0.015, type: 'both', name: 'Grand Rapids', state: 'MI' },
  SAGINAW: { rate: 0.015, type: 'both', name: 'Saginaw', state: 'MI' },
  FLINT: { rate: 0.01, type: 'both', name: 'Flint', state: 'MI' },
  INDIANAPOLIS: { rate: 0.02, type: 'resident', name: 'Indianapolis', state: 'IN' },
  FORT_WAYNE: { rate: 0.0155, type: 'resident', name: 'Fort Wayne', state: 'IN' },
  EVANSVILLE: { rate: 0.017, type: 'resident', name: 'Evansville', state: 'IN' },
  LOUISVILLE: { rate: 0.0285, type: 'both', name: 'Louisville', state: 'KY' },
  LEXINGTON: { rate: 0.025, type: 'both', name: 'Lexington', state: 'KY' },
  STLOUIS: { rate: 0.01, type: 'worker', name: 'St. Louis City', state: 'MO' },
  KANSAS_CITY: { rate: 0.01, type: 'worker', name: 'Kansas City', state: 'MO' },
  BIRMINGHAM: { rate: 0.01, type: 'worker', name: 'Birmingham', state: 'AL' },
  BALTIMORE_CITY: { rate: 0.032, type: 'resident', name: 'Baltimore City', state: 'MD' },
  MONTGOMERY_CO: { rate: 0.032, type: 'resident', name: 'Montgomery County', state: 'MD' },
  PRINCE_GEORGES_CO: { rate: 0.032, type: 'resident', name: "Prince George's County", state: 'MD' },
  WILMINGTON: { rate: 0.0125, type: 'worker', name: 'Wilmington', state: 'DE' },
  NEWARK_OH: { rate: 0.0175, type: 'worker', name: 'Newark', state: 'OH' },
};

const RECIPROCAL_AGREEMENTS_2025: Record<string, string[]> = {
  DC: ['MD', 'VA'],
  IL: ['IA', 'KY', 'MI', 'WI'],
  IN: ['KY', 'MI', 'OH', 'PA', 'WI'],
  IA: ['IL'],
  KY: ['IL', 'IN', 'MI', 'OH', 'VA', 'WV', 'WI'],
  MD: ['DC', 'PA', 'VA', 'WV'],
  MI: ['IL', 'IN', 'KY', 'MN', 'OH', 'WI'],
  MN: ['MI', 'ND'],
  MT: ['ND'],
  NJ: ['PA'],
  ND: ['MN', 'MT'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  PA: ['IN', 'MD', 'NJ', 'OH', 'VA', 'WV'],
  VA: ['DC', 'KY', 'MD', 'PA', 'WV'],
  WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WI: ['IL', 'IN', 'KY', 'MI'],
};

const SUTA_DEFAULTS_2025: SUTADefaults[] = [
  { state: 'AL', newEmployerRate: 0.0270, wageBase: 8000 },
  { state: 'AK', newEmployerRate: 0.0161, wageBase: 47100 },
  { state: 'AZ', newEmployerRate: 0.0200, wageBase: 8000 },
  { state: 'AR', newEmployerRate: 0.0310, wageBase: 7000 },
  { state: 'CA', newEmployerRate: 0.0340, wageBase: 7000 },
  { state: 'CO', newEmployerRate: 0.0171, wageBase: 23800 },
  { state: 'CT', newEmployerRate: 0.0300, wageBase: 25000 },
  { state: 'DE', newEmployerRate: 0.0120, wageBase: 10500 },
  { state: 'DC', newEmployerRate: 0.0270, wageBase: 9000 },
  { state: 'FL', newEmployerRate: 0.0270, wageBase: 7000 },
  { state: 'GA', newEmployerRate: 0.0275, wageBase: 9500 },
  { state: 'HI', newEmployerRate: 0.0400, wageBase: 59100 },
  { state: 'ID', newEmployerRate: 0.0107, wageBase: 53500 },
  { state: 'IL', newEmployerRate: 0.0325, wageBase: 13590 },
  { state: 'IN', newEmployerRate: 0.0250, wageBase: 9500 },
  { state: 'IA', newEmployerRate: 0.0100, wageBase: 38200 },
  { state: 'KS', newEmployerRate: 0.0270, wageBase: 14000 },
  { state: 'KY', newEmployerRate: 0.0270, wageBase: 11400 },
  { state: 'LA', newEmployerRate: 0.0109, wageBase: 7700 },
  { state: 'ME', newEmployerRate: 0.0222, wageBase: 12000 },
  { state: 'MD', newEmployerRate: 0.0260, wageBase: 8500 },
  { state: 'MA', newEmployerRate: 0.0156, wageBase: 15000 },
  { state: 'MI', newEmployerRate: 0.0270, wageBase: 9500 },
  { state: 'MN', newEmployerRate: 0.0100, wageBase: 42000 },
  { state: 'MS', newEmployerRate: 0.0120, wageBase: 14000 },
  { state: 'MO', newEmployerRate: 0.0263, wageBase: 10500 },
  { state: 'MT', newEmployerRate: 0.0132, wageBase: 43000 },
  { state: 'NE', newEmployerRate: 0.0120, wageBase: 9000 },
  { state: 'NV', newEmployerRate: 0.0275, wageBase: 40600 },
  { state: 'NH', newEmployerRate: 0.0100, wageBase: 14000 },
  { state: 'NJ', newEmployerRate: 0.0279, wageBase: 42300 },
  { state: 'NM', newEmployerRate: 0.0100, wageBase: 31200 },
  { state: 'NY', newEmployerRate: 0.0425, wageBase: 12500 },
  { state: 'NC', newEmployerRate: 0.0100, wageBase: 31400 },
  { state: 'ND', newEmployerRate: 0.0100, wageBase: 43800 },
  { state: 'OH', newEmployerRate: 0.0270, wageBase: 9000 },
  { state: 'OK', newEmployerRate: 0.0170, wageBase: 27000 },
  { state: 'OR', newEmployerRate: 0.0237, wageBase: 52800 },
  { state: 'PA', newEmployerRate: 0.0354, wageBase: 10000 },
  { state: 'RI', newEmployerRate: 0.0110, wageBase: 29700 },
  { state: 'SC', newEmployerRate: 0.0054, wageBase: 14000 },
  { state: 'SD', newEmployerRate: 0.0120, wageBase: 15000 },
  { state: 'TN', newEmployerRate: 0.0200, wageBase: 7000 },
  { state: 'TX', newEmployerRate: 0.0270, wageBase: 9000 },
  { state: 'UT', newEmployerRate: 0.0110, wageBase: 47000 },
  { state: 'VT', newEmployerRate: 0.0100, wageBase: 16100 },
  { state: 'VA', newEmployerRate: 0.0273, wageBase: 8000 },
  { state: 'WA', newEmployerRate: 0.0100, wageBase: 68500 },
  { state: 'WV', newEmployerRate: 0.0270, wageBase: 9000 },
  { state: 'WI', newEmployerRate: 0.0365, wageBase: 14000 },
  { state: 'WY', newEmployerRate: 0.0070, wageBase: 30900 },
];

const TAX_RULES_2025: TaxYearRuleSet = {
  year: 2025,
  version: TAX_REGISTRY_VERSION,
  lastVerified: TAX_REGISTRY_LAST_VERIFIED,
  source: 'IRS Publication 15-T (2025), SSA OASDI Wage Base, State DOR publications',
  fica: FICA_2025,
  futa: FUTA_2025,
  standardDeductions: STANDARD_DEDUCTIONS_2025,
  withholdingAllowanceValue: 4300,
  federalBrackets: FEDERAL_BRACKETS_2025,
  stateTaxRules: STATE_TAX_RULES_2025,
  localTaxRules: LOCAL_TAX_RULES_2025,
  reciprocalAgreements: RECIPROCAL_AGREEMENTS_2025,
  sutaDefaults: SUTA_DEFAULTS_2025,
  creditReductionStates: ['CA', 'CT', 'NY'],
};

const TAX_RULES_BY_YEAR: Record<number, TaxYearRuleSet> = {
  2025: TAX_RULES_2025,
};

export function getTaxRules(year?: number): TaxYearRuleSet {
  const targetYear = year ?? TAX_REGISTRY_EFFECTIVE_YEAR;
  const rules = TAX_RULES_BY_YEAR[targetYear];
  if (!rules) {
    log.warn(`[TaxRegistry] No rules for year ${targetYear}, falling back to ${TAX_REGISTRY_EFFECTIVE_YEAR}`);
    return TAX_RULES_2025;
  }
  return rules;
}

export function getAvailableTaxYears(): number[] {
  return Object.keys(TAX_RULES_BY_YEAR).map(Number).sort();
}

export function getFlatStateRate(stateCode: string, year?: number): number {
  const rules = getTaxRules(year);
  const stateRule = rules.stateTaxRules[stateCode.toUpperCase()];
  if (!stateRule || stateRule.type === 'none') return 0;
  if (stateRule.type === 'flat' && stateRule.rate != null) return stateRule.rate;
  if (stateRule.type === 'progressive' && stateRule.brackets) {
    let totalRate = 0;
    let prevLimit = 0;
    const testIncome = 60000;
    for (const bracket of stateRule.brackets) {
      const taxableInBracket = Math.min(testIncome, bracket.limit) - prevLimit;
      if (taxableInBracket <= 0) break;
      totalRate += taxableInBracket * bracket.rate;
      prevLimit = bracket.limit;
    }
    return totalRate / testIncome;
  }
  return 0;
}

export function getSUTAInfo(stateCode: string, year?: number): SUTADefaults | undefined {
  const rules = getTaxRules(year);
  return rules.sutaDefaults.find(s => s.state === stateCode.toUpperCase());
}

export interface TaxComplianceReport {
  registryVersion: string;
  effectiveYear: number;
  lastVerified: string;
  currentDate: string;
  isStale: boolean;
  staleReason: string | null;
  federalStatus: {
    bracketsLoaded: boolean;
    filingStatusCount: number;
    ssWageBase: number;
    standardDeductionSingle: number;
  };
  stateStatus: {
    totalStates: number;
    noTaxStates: number;
    flatRateStates: number;
    progressiveStates: number;
    statesWithNotes: string[];
  };
  localStatus: {
    totalLocalities: number;
    statesCovered: string[];
  };
  ficaStatus: {
    ssRate: number;
    medicareRate: number;
    ssWageBase: number;
  };
  futaStatus: {
    netRate: number;
    wageBase: number;
    creditReductionStates: string[];
  };
  sutaStatus: {
    statesCovered: number;
    statesMissing: string[];
  };
  reciprocityStatus: {
    statesWithAgreements: number;
    totalAgreements: number;
  };
  recommendations: string[];
}

export function runTaxComplianceAudit(year?: number): TaxComplianceReport {
  const rules = getTaxRules(year);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const isStale = rules.year < currentYear || 
    (currentMonth >= 12 && rules.year === currentYear);
  
  let staleReason: string | null = null;
  if (rules.year < currentYear) {
    staleReason = `Tax rules are for ${rules.year} but current year is ${currentYear}. Update required.`;
  } else if (currentMonth >= 12 && rules.year === currentYear) {
    staleReason = `December ${currentYear} - should verify/prepare ${currentYear + 1} tax tables before January.`;
  }

  const allStateCodes = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL',
    'GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
    'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
    'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
    'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];

  const coveredSutaStates = rules.sutaDefaults.map(s => s.state);
  const missingSutaStates = allStateCodes.filter(s => !coveredSutaStates.includes(s));

  const noTaxStates = Object.entries(rules.stateTaxRules).filter(([, r]) => r.type === 'none');
  const flatStates = Object.entries(rules.stateTaxRules).filter(([, r]) => r.type === 'flat');
  const progStates = Object.entries(rules.stateTaxRules).filter(([, r]) => r.type === 'progressive');
  const statesWithNotes = Object.entries(rules.stateTaxRules)
    .filter(([, r]) => r.notes)
    .map(([code, r]) => `${code}: ${r.notes}`);

  const localStatesCovered = [...new Set(Object.values(rules.localTaxRules).map(l => l.state))];

  const totalReciprocal = Object.values(rules.reciprocalAgreements).reduce((sum, arr) => sum + arr.length, 0);

  const recommendations: string[] = [];

  if (isStale) {
    recommendations.push(`CRITICAL: Update tax tables to ${currentYear + (currentMonth >= 12 ? 1 : 0)}`);
  }

  if (missingSutaStates.length > 0) {
    recommendations.push(`Add SUTA defaults for: ${missingSutaStates.join(', ')}`);
  }

  const totalStatesInRules = Object.keys(rules.stateTaxRules).length;
  if (totalStatesInRules < 51) {
    const missing = allStateCodes.filter(s => !rules.stateTaxRules[s]);
    recommendations.push(`Missing state tax rules for: ${missing.join(', ')}`);
  }

  if (currentMonth === 1 || currentMonth === 12) {
    recommendations.push('Annual verification window: Cross-check IRS Pub 15-T, SSA wage base announcement, and state DOR rate changes');
  }

  if (rules.fica.ssWageBase !== 176100) {
    recommendations.push(`Verify SS wage base: registry shows $${rules.fica.ssWageBase.toLocaleString()}, 2025 official is $176,100`);
  }

  return {
    registryVersion: rules.version,
    effectiveYear: rules.year,
    lastVerified: rules.lastVerified,
    currentDate: now.toISOString().split('T')[0],
    isStale,
    staleReason,
    federalStatus: {
      bracketsLoaded: Object.keys(rules.federalBrackets).length === 4,
      filingStatusCount: Object.keys(rules.federalBrackets).length,
      ssWageBase: rules.fica.ssWageBase,
      standardDeductionSingle: rules.standardDeductions.single,
    },
    stateStatus: {
      totalStates: totalStatesInRules,
      noTaxStates: noTaxStates.length,
      flatRateStates: flatStates.length,
      progressiveStates: progStates.length,
      statesWithNotes,
    },
    localStatus: {
      totalLocalities: Object.keys(rules.localTaxRules).length,
      statesCovered: localStatesCovered,
    },
    ficaStatus: {
      ssRate: rules.fica.ssRate,
      medicareRate: rules.fica.medicareRate,
      ssWageBase: rules.fica.ssWageBase,
    },
    futaStatus: {
      netRate: rules.futa.netRate,
      wageBase: rules.futa.wageBase,
      creditReductionStates: rules.creditReductionStates,
    },
    sutaStatus: {
      statesCovered: coveredSutaStates.length,
      statesMissing: missingSutaStates,
    },
    reciprocityStatus: {
      statesWithAgreements: Object.keys(rules.reciprocalAgreements).length,
      totalAgreements: totalReciprocal,
    },
    recommendations,
  };
}

export const PAY_PERIODS_PER_YEAR: Record<PayPeriod, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export function computeFederalWithholding(annualTaxableIncome: number, filingStatus: FilingStatus, year?: number): number {
  if (annualTaxableIncome <= 0) return 0;
  const rules = getTaxRules(year);
  const brackets = rules.federalBrackets[filingStatus];
  for (const bracket of brackets) {
    if (annualTaxableIncome <= bracket.ceiling) {
      return bracket.baseAmount + bracket.rate * (annualTaxableIncome - bracket.floor);
    }
  }
  return 0;
}

export function computeProgressiveStateTax(annualGross: number, stateCode: string, year?: number): number {
  const rules = getTaxRules(year);
  const stateRule = rules.stateTaxRules[stateCode.toUpperCase()];
  if (!stateRule || stateRule.type !== 'progressive' || !stateRule.brackets) return 0;

  let annualTax = 0;
  let previousLimit = 0;
  for (const bracket of stateRule.brackets) {
    if (annualGross > bracket.limit) {
      annualTax += (bracket.limit - previousLimit) * bracket.rate;
      previousLimit = bracket.limit;
    } else {
      annualTax += (annualGross - previousLimit) * bracket.rate;
      break;
    }
  }
  return annualTax;
}
