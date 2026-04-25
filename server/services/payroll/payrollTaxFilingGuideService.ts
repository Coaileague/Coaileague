export type PayrollTaxFormType = '941' | '940' | 'w2' | '1099';

export interface PayrollTaxDeadline {
  form: PayrollTaxFormType;
  label: string;
  cadence: 'quarterly' | 'annual';
  dueDescription: string;
  notes: string[];
}

export interface PayrollTaxFilingGuide {
  form: PayrollTaxFormType;
  title: string;
  purpose: string;
  cadence: 'quarterly' | 'annual';
  requiredData: string[];
  preparationSteps: string[];
  reviewChecks: string[];
  filingDestinations: string[];
  notes: string[];
}

export interface PayrollStatePortal {
  state: string;
  name: string;
  portalLabel: string;
  notes: string[];
}

const DEADLINES: PayrollTaxDeadline[] = [
  {
    form: '941',
    label: 'IRS Form 941 — Employer Quarterly Federal Tax Return',
    cadence: 'quarterly',
    dueDescription: 'Generally due on the last day of the month following each quarter.',
    notes: [
      'Used to report federal income tax withheld, Social Security, and Medicare taxes.',
      'Final due dates can shift for weekends or federal holidays.',
      'Deposit schedules are separate from filing deadlines and depend on the employer deposit schedule.',
    ],
  },
  {
    form: '940',
    label: 'IRS Form 940 — Federal Unemployment Tax Return',
    cadence: 'annual',
    dueDescription: 'Generally due by January 31 for the prior calendar year.',
    notes: [
      'Used to report annual FUTA tax.',
      'Employers that deposited all FUTA tax when due may qualify for an extended filing window.',
    ],
  },
  {
    form: 'w2',
    label: 'Form W-2 — Wage and Tax Statement',
    cadence: 'annual',
    dueDescription: 'Generally due to employees and SSA by January 31 for the prior year.',
    notes: [
      'Used for employee wage and withholding reporting.',
      'Employee copies and SSA filing must be reconciled against payroll run totals.',
    ],
  },
  {
    form: '1099',
    label: 'Form 1099-NEC — Nonemployee Compensation',
    cadence: 'annual',
    dueDescription: 'Generally due to contractors and IRS by January 31 for the prior year.',
    notes: [
      'Used for contractor/nonemployee compensation reporting.',
      'Contractor classification and W-9 data should be reviewed before filing.',
    ],
  },
];

const GUIDES: Record<PayrollTaxFormType, PayrollTaxFilingGuide> = {
  '941': {
    form: '941',
    title: 'IRS Form 941 Filing Guide',
    purpose: 'Report quarterly federal payroll taxes, including federal income tax withholding, Social Security, and Medicare.',
    cadence: 'quarterly',
    requiredData: [
      'Quarter payroll run totals',
      'Federal income tax withheld',
      'Taxable Social Security wages and tips',
      'Taxable Medicare wages and tips',
      'Deposits already made for the quarter',
      'Adjustments, credits, or sick/family leave credits when applicable',
    ],
    preparationSteps: [
      'Reconcile payroll run totals against payroll entries for the quarter.',
      'Confirm all approved payroll runs for the quarter are included exactly once.',
      'Compare tax liability totals against deposit records.',
      'Generate draft filing data and route to a human approver before submission.',
    ],
    reviewChecks: [
      'No draft/pending payroll runs included.',
      'No employee has negative net pay.',
      'Social Security and Medicare wage bases reconcile with payroll tax service output.',
      'Deposits match the quarter liability schedule.',
    ],
    filingDestinations: ['IRS EFTPS / IRS Business Tax Account', 'Payroll provider/accountant workflow when outsourced'],
    notes: ['This guide is operational support, not legal or tax advice. Final filing should be approved by the responsible employer or accountant.'],
  },
  '940': {
    form: '940',
    title: 'IRS Form 940 Filing Guide',
    purpose: 'Report annual Federal Unemployment Tax Act (FUTA) obligations.',
    cadence: 'annual',
    requiredData: [
      'Annual taxable FUTA wages',
      'FUTA wage base application by employee',
      'State unemployment tax payments/credits',
      'Quarterly FUTA liability breakdown',
    ],
    preparationSteps: [
      'Reconcile annual payroll totals across all finalized runs.',
      'Confirm FUTA wage base limits are applied per employee.',
      'Validate state unemployment data before credit calculation.',
      'Route final return data for finance/accountant approval.',
    ],
    reviewChecks: [
      'Only finalized/paid payroll runs included.',
      'Employee wage base calculations are not duplicated.',
      'State unemployment credits are documented.',
    ],
    filingDestinations: ['IRS EFTPS / IRS Business Tax Account', 'Accountant or payroll provider annual filing workflow'],
    notes: ['FUTA rules can depend on state unemployment standing; use canonical tax services and human review.'],
  },
  w2: {
    form: 'w2',
    title: 'Form W-2 Preparation Guide',
    purpose: 'Prepare employee annual wage and withholding statements.',
    cadence: 'annual',
    requiredData: [
      'Employee legal name and SSN/TIN data from payroll profile',
      'Annual wages and taxable compensation',
      'Federal, Social Security, Medicare, and state withholding totals',
      'Employer EIN and address',
      'Retirement, benefit, and deduction codes when applicable',
    ],
    preparationSteps: [
      'Verify all employee payroll profiles are complete.',
      'Reconcile annual payroll entries to ledger totals.',
      'Generate employee drafts and flag missing profile data.',
      'Route W-2 export to authorized payroll/admin reviewer.',
    ],
    reviewChecks: [
      'No contractor/1099 workers included.',
      'Employee identity fields complete.',
      'YTD tax totals match payroll tax records.',
    ],
    filingDestinations: ['Social Security Administration Business Services Online', 'Employee copy distribution workflow'],
    notes: ['W-2 generation must exclude contractors and should use finalized payroll only.'],
  },
  '1099': {
    form: '1099',
    title: 'Form 1099-NEC Preparation Guide',
    purpose: 'Prepare annual nonemployee compensation reporting for eligible contractors.',
    cadence: 'annual',
    requiredData: [
      'Contractor legal name and TIN from W-9',
      'Annual nonemployee compensation totals',
      'Backup withholding if applicable',
      'Payer EIN and address',
    ],
    preparationSteps: [
      'Identify 1099-eligible workers and exclude employees.',
      'Reconcile contractor payments from finalized payroll/payment records.',
      'Flag missing W-9/TIN data before filing.',
      'Route export to authorized payroll/admin reviewer.',
    ],
    reviewChecks: [
      'No W-2 employees included.',
      'Contractor identity and TIN data complete.',
      'Payment totals reconcile to finalized records.',
    ],
    filingDestinations: ['IRS Information Returns Intake System (IRIS)', 'State filing portal when required'],
    notes: ['Contractor classification should be reviewed by responsible employer/advisor before filing.'],
  },
};

const STATE_PORTALS: PayrollStatePortal[] = [
  {
    state: 'CA',
    name: 'California',
    portalLabel: 'EDD e-Services for Business',
    notes: ['Used for California payroll tax registration, deposits, and reporting.'],
  },
  {
    state: 'FL',
    name: 'Florida',
    portalLabel: 'Florida Department of Revenue e-Services',
    notes: ['Used for reemployment tax filing and payments. Florida has no state individual income tax.'],
  },
  {
    state: 'NY',
    name: 'New York',
    portalLabel: 'New York Business Online Services',
    notes: ['Used for withholding, unemployment insurance, and wage reporting workflows.'],
  },
  {
    state: 'TX',
    name: 'Texas',
    portalLabel: 'Texas Workforce Commission Unemployment Tax Services',
    notes: ['Used for Texas unemployment tax reporting. Texas has no state individual income tax.'],
  },
];

export function getPayrollTaxFilingDeadlines(): PayrollTaxDeadline[] {
  return DEADLINES;
}

export function getPayrollTaxFilingGuide(formType: string): PayrollTaxFilingGuide | null {
  const key = formType.toLowerCase().replace(/^form-/, '') as PayrollTaxFormType;
  return GUIDES[key] ?? null;
}

export function getPayrollStatePortals(): PayrollStatePortal[] {
  return STATE_PORTALS;
}

export function getPayrollTaxCenter() {
  return {
    deadlines: getPayrollTaxFilingDeadlines(),
    supportedGuides: Object.keys(GUIDES),
    statePortals: getPayrollStatePortals(),
    complianceNotice: 'Payroll tax filing guidance is operational support only. Final filings should be reviewed and approved by the employer, accountant, or authorized payroll administrator.',
  };
}
